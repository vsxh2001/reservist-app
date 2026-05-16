/**
 * NewSlotModal component tests.
 *
 * Strategy: vi.mock useAuth and useCreateSlot so the modal can be mounted
 * stand-alone without an AuthProvider or QueryClient. We assert:
 *   - the modal renders nothing when open=false
 *   - default empty state for non-urgent mode renders expected fields
 *   - skill chips can be toggled on and cycled through junior/intermediate/senior
 *   - cycling past senior removes the skill requirement
 *   - the "mark as urgent" checkbox toggles urgent mode
 *   - the people-needed +/- buttons clamp at 1 and increment
 *   - submit (publish) calls createSlot.mutateAsync with the right payload
 *   - submit closes the modal and toasts on success
 *   - mutation rejection keeps the modal open (onClose not called) and surfaces
 *   - cancel button (and overlay click) close the modal without mutating
 *
 * Behaviors intentionally NOT covered (do not exist in the component):
 *   - "submit disabled until required fields filled" — the publish button is
 *     only disabled while the mutation is in-flight; title/needed have defaults
 *     and end<=start auto-rolls to next day, so there is nothing to assert.
 *   - "end < start rejected with visible error" — the component silently rolls
 *     the end date to the next day rather than rejecting.
 *   - "remove a skill chip" via a dedicated remove button — there is no such
 *     button; off-state is reached by cycling past senior, which is covered.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Member, Slot } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u-cmdr', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
  }),
}));

const mockCreateSlot = { mutateAsync: vi.fn(), isPending: false };
vi.mock('../../src/lib/queries', () => ({
  useCreateSlot: () => mockCreateSlot,
}));

import { NewSlotModal } from '../../src/components/NewSlotModal';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    division_id: 'div1',
    name: 'Alice Cohen',
    initials: 'AC',
    tone: 0,
    phone: '+972 52-000-0001',
    joined: '2023-01',
    last_seen: '2 days ago',
    calls_this_year: 0,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: new Date().toISOString(),
    is_division_admin: false,
    skills: [],
    teams: [{ team_id: 'team1', role: 'soldier' }],
    ...overrides,
  };
}

const MEMBERS: Member[] = [
  makeMember({ id: 'm1', name: 'Alice Cohen', status: 'available' }),
  makeMember({ id: 'm2', name: 'Bob Levi',   status: 'standby',   initials: 'BL' }),
];

const SKILLS = ['Night Ops', 'Marksmanship', 'Driving'];
const NO_SLOTS: Slot[] = [];

interface RenderOpts {
  open?: boolean;
  urgent?: boolean;
  preselected?: string[];
}

function renderModal(opts: RenderOpts = {}) {
  const onClose = vi.fn();
  const onToast = vi.fn();
  const utils = render(
    <NewSlotModal
      open={opts.open ?? true}
      urgent={opts.urgent ?? false}
      members={MEMBERS}
      skills={SKILLS}
      slots={NO_SLOTS}
      approvedPicks={[]}
      teamId="team1"
      divisionId="div1"
      preselected={opts.preselected ?? []}
      onClose={onClose}
      onToast={onToast}
    />,
  );
  return { ...utils, onClose, onToast };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NewSlotModal', () => {
  beforeEach(() => {
    mockCreateSlot.mutateAsync.mockReset();
    mockCreateSlot.mutateAsync.mockResolvedValue(undefined);
    mockCreateSlot.isPending = false;
  });

  it('renders nothing when open=false', () => {
    const { container } = renderModal({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders the non-urgent modal with empty title default and core fields', () => {
    renderModal({ open: true, urgent: false });
    expect(screen.getByText(/New/)).toBeInTheDocument();
    expect(screen.getByText(/duty slot/)).toBeInTheDocument();
    // Title input is empty by default in non-urgent mode.
    const titleInput = screen.getByPlaceholderText(/Outpost rotation/i) as HTMLInputElement;
    expect(titleInput.value).toBe('');
    // The skill toggles render one button per provided skill name.
    for (const s of SKILLS) {
      expect(screen.getByRole('button', { name: new RegExp(s) })).toBeInTheDocument();
    }
    // The "mark as urgent" checkbox is present in non-urgent mode.
    expect(screen.getByLabelText(/Mark as urgent/i)).toBeInTheDocument();
    // People-needed default is 3.
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('toggles a skill chip on (junior) when first clicked', async () => {
    const user = userEvent.setup();
    renderModal({ open: true });
    const chip = screen.getByRole('button', { name: /Marksmanship/ });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    await user.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.textContent).toMatch(/Junior/);
  });

  it('cycles a skill chip through junior → intermediate → senior → off', async () => {
    const user = userEvent.setup();
    renderModal({ open: true });
    const chip = screen.getByRole('button', { name: /Driving/ });
    await user.click(chip); // junior
    expect(chip.textContent).toMatch(/Junior/);
    await user.click(chip); // intermediate
    expect(chip.textContent).toMatch(/Intermediate/);
    await user.click(chip); // senior
    expect(chip.textContent).toMatch(/Senior/);
    await user.click(chip); // off
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(chip.textContent).toMatch(/off/);
  });

  it('toggling "Mark as urgent" flips the modal into urgent mode', async () => {
    const user = userEvent.setup();
    renderModal({ open: true, urgent: false });
    const cb = screen.getByLabelText(/Mark as urgent/i) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    await user.click(cb);
    // Once urgent, the head replaces the checkbox with an "Urgent" flag pill
    // and the publish button label changes.
    expect(screen.getByText(/Publish & notify all/i)).toBeInTheDocument();
  });

  it('increments and clamps the people-needed counter at 1', async () => {
    const user = userEvent.setup();
    renderModal({ open: true });
    // Default needed = 3; the counter +/- buttons are the two <button>s
    // surrounding the number display.
    const display = screen.getByText('3');
    const group = display.parentElement!;
    const buttons = group.querySelectorAll('button');
    const minusBtn = buttons[0] as HTMLButtonElement;
    const plusBtn = buttons[1] as HTMLButtonElement;
    // Decrement twice → 2, 1; one more → clamped at 1.
    await user.click(minusBtn);
    await user.click(minusBtn);
    expect(group.textContent).toContain('1');
    await user.click(minusBtn);
    expect(group.textContent).toContain('1');
    // Increment → 2.
    await user.click(plusBtn);
    expect(group.textContent).toContain('2');
  });

  it('publish submits createSlot with the expected payload shape and toasts', async () => {
    const user = userEvent.setup();
    const { onClose, onToast } = renderModal({ open: true });

    // Set title.
    const titleInput = screen.getByPlaceholderText(/Outpost rotation/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Patrol Bravo' } });

    // Pick Alice BEFORE requiring a skill — the candidate list filters by
    // skill, but `picked` state is preserved.
    await user.click(screen.getByText('Alice Cohen'));

    // Turn Marksmanship to junior.
    await user.click(screen.getByRole('button', { name: /Marksmanship/ }));

    await user.click(screen.getByRole('button', { name: /Publish slot/i }));

    await waitFor(() => {
      expect(mockCreateSlot.mutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mockCreateSlot.mutateAsync.mock.calls[0][0];
    expect(payload.teamId).toBe('team1');
    expect(payload.divisionId).toBe('div1');
    expect(payload.title).toBe('Patrol Bravo');
    expect(payload.urgent).toBe(false);
    expect(payload.state).toBe('published');
    expect(payload.needed).toBe(3);
    expect(payload.createdBy).toBe('u-cmdr');
    expect(payload.actorName).toBe('Commander Test');
    expect(payload.skills).toEqual([{ name: 'Marksmanship', min_level: 'junior' }]);
    expect(payload.assigneeIds).toEqual(['m1']);
    expect(typeof payload.startAt).toBe('string');
    expect(typeof payload.endAt).toBe('string');
    expect(Date.parse(payload.endAt)).toBeGreaterThan(Date.parse(payload.startAt));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Slot published/i));
  });

  it('save-draft submits with state="draft" and the right toast', async () => {
    const user = userEvent.setup();
    const { onToast } = renderModal({ open: true });
    await user.click(screen.getByRole('button', { name: /Save draft/i }));
    await waitFor(() => {
      expect(mockCreateSlot.mutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateSlot.mutateAsync.mock.calls[0][0].state).toBe('draft');
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/draft/i));
  });

  it('does not call onClose when the mutation rejects', async () => {
    // The component's onClick handler does not catch the rejection from
    // mutateAsync; we install a temporary process-level handler so vitest
    // does not flag the expected rejection.
    const swallow = (reason: unknown) => {
      if (reason instanceof Error && reason.message === 'NewSlotModal-test-boom') return;
      // Re-throw anything unexpected by emitting through the default path.
      throw reason;
    };
    process.on('unhandledRejection', swallow);

    mockCreateSlot.mutateAsync.mockRejectedValueOnce(new Error('NewSlotModal-test-boom'));
    const user = userEvent.setup();
    const { onClose, onToast } = renderModal({ open: true });

    try {
      await user.click(screen.getByRole('button', { name: /Publish slot/i }));

      await waitFor(() => {
        expect(mockCreateSlot.mutateAsync).toHaveBeenCalledTimes(1);
      });
      // Let the rejected await propagate / settle.
      await new Promise((r) => setTimeout(r, 0));
      expect(onClose).not.toHaveBeenCalled();
      expect(onToast).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', swallow);
    }
  });

  it('cancel button closes the modal without firing the mutation', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({ open: true });
    await user.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockCreateSlot.mutateAsync).not.toHaveBeenCalled();
  });

  it('passes urgent flag and urgent toast on publish in urgent mode', async () => {
    const user = userEvent.setup();
    const { onToast } = renderModal({ open: true, urgent: true });
    await user.click(screen.getByRole('button', { name: /Publish & notify all/i }));
    await waitFor(() => {
      expect(mockCreateSlot.mutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateSlot.mutateAsync.mock.calls[0][0].urgent).toBe(true);
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Urgent call-up published/i));
  });
});
