/**
 * NewSlotModal component tests.
 *
 * Strategy: vi.mock useAuth and useCreateSlot so the modal can be mounted
 * stand-alone without an AuthProvider or QueryClient. We assert:
 *   - the modal renders nothing when open=false
 *   - default empty state for non-urgent mode renders expected fields
 *   - "mark as urgent" checkbox toggles urgent mode
 *   - submit (publish) calls createSlot.mutateAsync with the right payload
 *   - submit closes the modal and toasts on success
 *   - mutation rejection keeps the modal open (onClose not called) and surfaces
 *   - cancel button closes the modal without mutating
 *
 * Slot capacity / required-skill UI was removed in the "individual slots"
 * simplification, so those tests are gone — each slot is now a single duty
 * period for exactly one optional assignee.
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
    phone_visible_to_peers: false,
    skills: [],
    teams: [{ team_id: 'team1', role: 'soldier' }],
    ...overrides,
  };
}

const MEMBERS: Member[] = [
  makeMember({ id: 'm1', name: 'Alice Cohen', status: 'available' }),
  makeMember({ id: 'm2', name: 'Bob Levi',   status: 'standby',   initials: 'BL' }),
];

const NO_SLOTS: Slot[] = [];

interface RenderOpts {
  open?: boolean;
  urgent?: boolean;
  preselected?: string | null;
}

function renderModal(opts: RenderOpts = {}) {
  const onClose = vi.fn();
  const onToast = vi.fn();
  const utils = render(
    <NewSlotModal
      open={opts.open ?? true}
      urgent={opts.urgent ?? false}
      members={MEMBERS}
      slots={NO_SLOTS}
      approvedPicks={[]}
      teamId="team1"
      preselected={opts.preselected ?? null}
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
    const titleInput = screen.getByPlaceholderText(/Outpost rotation/i) as HTMLInputElement;
    expect(titleInput.value).toBe('');
    // The "mark as urgent" checkbox is present in non-urgent mode.
    expect(screen.getByLabelText(/Mark as urgent/i)).toBeInTheDocument();
    // Both candidates are rendered (status filter keeps available + standby).
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
  });

  it('toggling "Mark as urgent" flips the modal into urgent mode', async () => {
    const user = userEvent.setup();
    renderModal({ open: true, urgent: false });
    const cb = screen.getByLabelText(/Mark as urgent/i) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    await user.click(cb);
    // Once urgent, the publish button label changes.
    expect(screen.getByText(/Publish & notify all/i)).toBeInTheDocument();
  });

  it('publish submits createSlot with the expected single-assignee payload and toasts', async () => {
    const user = userEvent.setup();
    const { onClose, onToast } = renderModal({ open: true });

    // Set title.
    const titleInput = screen.getByPlaceholderText(/Outpost rotation/i) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Patrol Bravo' } });

    // Pick Alice as the slot's single assignee.
    await user.click(screen.getByText('Alice Cohen'));

    await user.click(screen.getByRole('button', { name: /Publish slot/i }));

    await waitFor(() => {
      expect(mockCreateSlot.mutateAsync).toHaveBeenCalledTimes(1);
    });
    const payload = mockCreateSlot.mutateAsync.mock.calls[0][0];
    expect(payload.teamId).toBe('team1');
    expect(payload.title).toBe('Patrol Bravo');
    expect(payload.urgent).toBe(false);
    expect(payload.state).toBe('published');
    expect(payload.createdBy).toBe('u-cmdr');
    expect(payload.actorName).toBe('Commander Test');
    expect(payload.assigneeId).toBe('m1');
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

  it('publishing with no assignee sends assigneeId=null and toasts "unassigned"', async () => {
    const user = userEvent.setup();
    const { onToast } = renderModal({ open: true });
    await user.click(screen.getByRole('button', { name: /Publish slot/i }));
    await waitFor(() => {
      expect(mockCreateSlot.mutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateSlot.mutateAsync.mock.calls[0][0].assigneeId).toBeNull();
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/unassigned/i));
  });

  it('does not call onClose when the mutation rejects', async () => {
    mockCreateSlot.mutateAsync.mockRejectedValueOnce(new Error('NewSlotModal-test-boom'));
    const user = userEvent.setup();
    const { onClose, onToast } = renderModal({ open: true });

    await user.click(screen.getByRole('button', { name: /Publish slot/i }));

    await waitFor(() => {
      expect(mockCreateSlot.mutateAsync).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Failed to create slot/));
    });
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('NewSlotModal-test-boom'));
    expect(onClose).not.toHaveBeenCalled();
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
