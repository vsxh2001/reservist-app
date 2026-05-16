/**
 * SlotDrawer component tests.
 *
 * SlotDrawer receives all its domain data through props (slot, members, skills,
 * allSlots, approvedPicks, teamId, divisionId, callbacks). The only external
 * state it touches comes from:
 *   - useAuth()           → AuthProvider; vi.mock'd to provide a stable user
 *   - useAssignToSlot()
 *   - useUnassignFromSlot()
 *   - useUpdateSlot()
 *   - useUpdateSlotState()
 * All four mutation hooks are vi.mock'd so no QueryClient or Supabase is needed.
 *
 * Coverage skipped:
 *   - useMembers — SlotDrawer does NOT call useMembers (members come in via props).
 *   - "Renders slot details: needed count" — the only place `needed` is rendered
 *     is the "Assignees · filled/needed" header; that's covered.
 *   - candidate ranking — covered (available before standby).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Member, Slot } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks — must precede the component import.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
  }),
}));

const mockAssign         = { mutateAsync: vi.fn(), isPending: false };
const mockUnassign       = { mutateAsync: vi.fn(), isPending: false };
const mockUpdateSlotMut  = { mutateAsync: vi.fn(), isPending: false };
const mockUpdateState    = { mutateAsync: vi.fn(), isPending: false };

vi.mock('../../src/lib/queries', () => ({
  useAssignToSlot:      () => mockAssign,
  useUnassignFromSlot:  () => mockUnassign,
  useUpdateSlot:        () => mockUpdateSlotMut,
  useUpdateSlotState:   () => mockUpdateState,
}));

import { SlotDrawer } from '../../src/components/SlotDrawer';

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

function makeSlot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: 's1',
    team_id: 'team1',
    title: 'Night patrol',
    urgent: false,
    state: 'published',
    start_at: '2026-06-10T20:00:00.000Z',
    end_at: '2026-06-11T04:00:00.000Z',
    duration: '8h',
    location: 'Base North',
    needed: 3,
    notes: null,
    role: null,
    skills: [],
    assignee_ids: [],
    filled: 0,
    ...overrides,
  };
}

// Members for filtering / candidate tests.
const ALICE = makeMember({ id: 'm1', name: 'Alice Cohen', initials: 'AC', status: 'available' });
const BOB   = makeMember({ id: 'm2', name: 'Bob Levi',   initials: 'BL', status: 'standby'   });
const CAROL = makeMember({ id: 'm3', name: 'Carol Paz',  initials: 'CP', status: 'unavailable' });
const DAN   = makeMember({
  id: 'm4', name: 'Dan Mor',  initials: 'DM', status: 'available',
  skills: [{ name: 'Driving', level: 'senior' }],
});
const EVE   = makeMember({
  id: 'm5', name: 'Eve Roth', initials: 'ER', status: 'available',
  // No driving skill — should fail a Driving requirement.
});

interface RenderOpts {
  slot?: Partial<Slot>;
  members?: Member[];
  approvedPicks?: { member_id: string; date: string }[];
  allSlots?: Slot[];
}

function renderDrawer(opts: RenderOpts = {}) {
  const slot = makeSlot(opts.slot);
  const members = opts.members ?? [ALICE, BOB, CAROL];
  const approvedPicks = opts.approvedPicks ?? [];
  const allSlots = opts.allSlots ?? [slot];
  const onClose = vi.fn();
  const onClone = vi.fn();
  const onToast = vi.fn();
  const utils = render(
    <SlotDrawer
      slot={slot}
      members={members}
      skills={['Driving', 'Marksmanship']}
      allSlots={allSlots}
      approvedPicks={approvedPicks}
      teamId="team1"
      divisionId="div1"
      onClose={onClose}
      onClone={onClone}
      onToast={onToast}
    />,
  );
  return { ...utils, slot, onClose, onClone, onToast };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlotDrawer', () => {
  beforeEach(() => {
    mockAssign.mutateAsync.mockReset();
    mockUnassign.mutateAsync.mockReset();
    mockUpdateSlotMut.mutateAsync.mockReset();
    mockUpdateState.mutateAsync.mockReset();
    mockAssign.mutateAsync.mockResolvedValue(undefined);
    mockUnassign.mutateAsync.mockResolvedValue(undefined);
    mockUpdateState.mutateAsync.mockResolvedValue(undefined);
    mockUpdateSlotMut.mutateAsync.mockResolvedValue(undefined);
  });

  // -------- header / metadata -------------------------------------------

  it('renders slot title, location, duration, and state badge', () => {
    renderDrawer({ slot: { title: 'Night patrol', location: 'Base North', duration: '8h' } });
    // Title appears both as drawer aria-label and the head <h3>.
    expect(screen.getByRole('dialog', { name: 'Night patrol' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Night patrol' })).toBeInTheDocument();
    expect(screen.getByText(/Base North/)).toBeInTheDocument();
    expect(screen.getByText(/8h/)).toBeInTheDocument();
    expect(screen.getByText('published')).toBeInTheDocument();
  });

  it('renders the urgent flag when slot.urgent is true', () => {
    renderDrawer({ slot: { urgent: true } });
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('omits the urgent flag when slot.urgent is false', () => {
    renderDrawer({ slot: { urgent: false } });
    expect(screen.queryByText('Urgent')).not.toBeInTheDocument();
  });

  it('renders the needed count in the assignees header', () => {
    renderDrawer({ slot: { needed: 3, filled: 1, assignee_ids: ['m1'] } });
    // "Assignees · 1/3" — match the slash-count regardless of surrounding whitespace.
    expect(screen.getByText(/Assignees/)).toBeInTheDocument();
    expect(screen.getByText(/1\/3/)).toBeInTheDocument();
  });

  it('renders required skill chips when the slot has skill requirements', () => {
    renderDrawer({
      slot: { skills: [{ name: 'Driving', min_level: 'intermediate' }] },
    });
    expect(screen.getByText('Required skills')).toBeInTheDocument();
    expect(screen.getByText('Driving')).toBeInTheDocument();
  });

  // -------- assignees list ----------------------------------------------

  it('renders assigned members with their status pill', () => {
    renderDrawer({
      slot: { assignee_ids: ['m1', 'm2'], filled: 2 },
      members: [ALICE, BOB],
    });
    // Names appear in the assignees list.
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    // Default StatusPill renders the human-friendly label.
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Standby')).toBeInTheDocument();
  });

  it('shows the empty-state line when no one is assigned and the picker is closed', () => {
    renderDrawer({ slot: { assignee_ids: [], filled: 0 } });
    expect(screen.getByText(/Nobody assigned yet/i)).toBeInTheDocument();
  });

  // -------- candidate picker --------------------------------------------

  it('shows the assign-more affordance only when published and under-filled', () => {
    renderDrawer({ slot: { state: 'published', needed: 2, filled: 0 } });
    expect(screen.getByText(/\+\s*Assign more/i)).toBeInTheDocument();
  });

  it('does NOT show "+ Assign more" when the slot is fully filled', () => {
    renderDrawer({
      slot: { state: 'published', needed: 1, filled: 1, assignee_ids: ['m1'] },
      members: [ALICE],
    });
    expect(screen.queryByText(/\+\s*Assign more/i)).not.toBeInTheDocument();
  });

  it('filters candidates to available + standby and excludes already-assigned and unmet skills', async () => {
    const user = userEvent.setup();
    renderDrawer({
      slot: {
        state: 'published',
        needed: 5,
        filled: 1,
        assignee_ids: ['m1'],                // ALICE already in
        skills: [{ name: 'Driving', min_level: 'intermediate' }],
      },
      members: [ALICE, BOB, CAROL, DAN, EVE],
    });

    await user.click(screen.getByText(/\+\s*Assign more/i));

    // DAN (available, senior driving) matches.
    expect(screen.getByText('Dan Mor')).toBeInTheDocument();
    // EVE has no driving skill → filtered out.
    expect(screen.queryByText('Eve Roth')).not.toBeInTheDocument();
    // BOB is standby but has no driving skill either → filtered out.
    expect(screen.queryByText('Bob Levi')).not.toBeInTheDocument();
    // CAROL is unavailable → filtered out.
    expect(screen.queryByText('Carol Paz')).not.toBeInTheDocument();
    // ALICE already assigned → not in candidates (but does appear in the assignees row above).
    // We can't `queryByText('Alice Cohen')` here since she's still in the assignees list.
  });

  it('ranks available candidates before standby candidates in the picker', async () => {
    const user = userEvent.setup();
    // Both have no skill reqs, so both qualify.
    renderDrawer({
      slot: { state: 'published', needed: 5, filled: 0, assignee_ids: [], skills: [] },
      members: [BOB /* standby */, ALICE /* available */],
    });

    await user.click(screen.getByText(/\+\s*Assign more/i));

    // Find both candidate cards and check their DOM order.
    const alice = screen.getByText('Alice Cohen');
    const bob   = screen.getByText('Bob Levi');
    // DOCUMENT_POSITION_FOLLOWING (4) means alice precedes bob.
    expect(alice.compareDocumentPosition(bob) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows an empty-state message when no candidates match', async () => {
    const user = userEvent.setup();
    renderDrawer({
      slot: {
        state: 'published', needed: 5, filled: 0, assignee_ids: [],
        // Skill requirement nobody on the roster meets.
        skills: [{ name: 'Marksmanship', min_level: 'senior' }],
      },
      members: [ALICE, BOB],   // neither has Marksmanship
    });

    await user.click(screen.getByText(/\+\s*Assign more/i));
    expect(screen.getByText(/No reservists match/i)).toBeInTheDocument();
  });

  // -------- assign / unassign mutations ---------------------------------

  it('clicking Assign calls useAssignToSlot.mutateAsync with the selected member ids and metadata', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      slot: {
        id: 's1', state: 'published', needed: 3, filled: 0, assignee_ids: [],
        title: 'Night patrol', skills: [],
      },
      members: [ALICE, DAN],
    });

    await user.click(screen.getByText(/\+\s*Assign more/i));
    await user.click(screen.getByText('Alice Cohen'));
    await user.click(screen.getByText('Dan Mor'));

    // Button label is "Assign 2" once two are picked.
    const assignBtn = screen.getByRole('button', { name: /Assign\s+2/ });
    await user.click(assignBtn);

    expect(mockAssign.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockAssign.mutateAsync.mock.calls[0][0];
    expect(arg.slotId).toBe('s1');
    // Real signature uses memberIds (plural). Order should reflect click order.
    expect(arg.memberIds).toEqual(['m1', 'm4']);
    expect(arg.assignedBy).toBe('u1');
    expect(arg.teamId).toBe('team1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.slotTitle).toBe('Night patrol');
    expect(arg.memberNames).toEqual(['Alice Cohen', 'Dan Mor']);

    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Assigned 2/));
  });

  it('clicking the Unassign icon calls useUnassignFromSlot.mutateAsync with the right payload', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      slot: {
        id: 's1', state: 'published', filled: 1, assignee_ids: ['m1'],
        title: 'Night patrol',
      },
      members: [ALICE],
    });

    // The IconButton renders with data-tip="Unassign"; query by attribute.
    const unassignBtn = document.querySelector('button[data-tip="Unassign"]') as HTMLButtonElement | null;
    expect(unassignBtn).not.toBeNull();
    await user.click(unassignBtn!);

    expect(mockUnassign.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockUnassign.mutateAsync.mock.calls[0][0];
    expect(arg.slotId).toBe('s1');
    expect(arg.memberId).toBe('m1');
    expect(arg.actorId).toBe('u1');
    expect(arg.teamId).toBe('team1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.slotTitle).toBe('Night patrol');
    expect(arg.memberName).toBe('Alice Cohen');

    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Unassigned Alice Cohen/));
  });

  // -------- state-change actions ----------------------------------------

  it('draft slots show Publish (and Clone + Cancel slot), not Mark complete', () => {
    renderDrawer({ slot: { state: 'draft' } });
    expect(screen.getByRole('button', { name: /Publish/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark complete/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel slot/i })).toBeInTheDocument();
  });

  it('published slots show Mark complete (and Clone + Cancel slot), not Publish', () => {
    renderDrawer({ slot: { state: 'published' } });
    expect(screen.getByRole('button', { name: /Mark complete/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publish/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel slot/i })).toBeInTheDocument();
  });

  it('completed slots show only Clone (no Publish / Complete / Cancel slot)', () => {
    renderDrawer({ slot: { state: 'completed' } });
    expect(screen.getByRole('button', { name: /Clone/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Publish/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark complete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel slot/i })).not.toBeInTheDocument();
  });

  it('Publish calls useUpdateSlotState.mutateAsync with state="published"', async () => {
    const user = userEvent.setup();
    const { onToast, onClose } = renderDrawer({
      slot: { id: 's1', state: 'draft', title: 'Night patrol' },
    });

    await user.click(screen.getByRole('button', { name: /Publish/i }));

    expect(mockUpdateState.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockUpdateState.mutateAsync.mock.calls[0][0];
    expect(arg.slotId).toBe('s1');
    expect(arg.state).toBe('published');
    expect(arg.teamId).toBe('team1');
    expect(arg.actorId).toBe('u1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.slotTitle).toBe('Night patrol');
    // Publish keeps the drawer open and toasts the slot title.
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Published "Night patrol"/));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Mark complete calls useUpdateSlotState.mutateAsync with state="completed" and closes the drawer', async () => {
    const user = userEvent.setup();
    const { onToast, onClose } = renderDrawer({ slot: { state: 'published' } });

    await user.click(screen.getByRole('button', { name: /Mark complete/i }));

    expect(mockUpdateState.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateState.mutateAsync.mock.calls[0][0].state).toBe('completed');
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/marked complete/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel slot calls useUpdateSlotState.mutateAsync with state="cancelled" and closes the drawer', async () => {
    const user = userEvent.setup();
    const { onToast, onClose } = renderDrawer({ slot: { state: 'published' } });

    await user.click(screen.getByRole('button', { name: /Cancel slot/i }));

    expect(mockUpdateState.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateState.mutateAsync.mock.calls[0][0].state).toBe('cancelled');
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/cancelled/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('Clone invokes onClone with the slot', async () => {
    const user = userEvent.setup();
    const { onClone, slot } = renderDrawer({ slot: { state: 'published' } });
    await user.click(screen.getByRole('button', { name: /Clone/i }));
    expect(onClone).toHaveBeenCalledWith(slot);
  });

  // -------- close ------------------------------------------------------

  it('clicking the close button invokes onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  // -------- edit mode --------------------------------------------------

  it('shows an Edit button on draft/published slots that opens the edit form', async () => {
    const user = userEvent.setup();
    renderDrawer({ slot: { state: 'published', title: 'Night patrol' } });
    const editBtn = screen.getByRole('button', { name: /Edit slot/i });
    await user.click(editBtn);
    // Edit form heading.
    expect(screen.getByRole('heading', { level: 4, name: /Edit slot/i })).toBeInTheDocument();
    // The Save button only renders inside the edit form.
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
    // Inside edit mode, the actions section disappears.
    expect(screen.queryByRole('button', { name: /Mark complete/i })).not.toBeInTheDocument();
  });

  it('does NOT render the Edit button on completed slots', () => {
    renderDrawer({ slot: { state: 'completed' } });
    expect(screen.queryByRole('button', { name: /Edit slot/i })).not.toBeInTheDocument();
  });

  // -------- unassign only when published --------------------------------

  it('does NOT render an Unassign control when slot is not published', () => {
    renderDrawer({
      slot: { state: 'completed', assignee_ids: ['m1'], filled: 1 },
      members: [ALICE],
    });
    // The assignees row still shows the member, but no Unassign button.
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    const unassignBtn = document.querySelector('button[data-tip="Unassign"]');
    expect(unassignBtn).toBeNull();
  });

  // -------- guard: empty pick set does not call assign ------------------

  it('clicking Assign with no picks selected disables the button (no mutation)', async () => {
    const user = userEvent.setup();
    renderDrawer({
      slot: { state: 'published', needed: 2, filled: 0, assignee_ids: [] },
      members: [ALICE, BOB],
    });
    await user.click(screen.getByText(/\+\s*Assign more/i));
    // Button label is just "Assign" when count is 0; it should be disabled.
    const assignBtn = screen.getByRole('button', { name: /^Assign\s*$/ });
    expect(assignBtn).toBeDisabled();
    await user.click(assignBtn);
    expect(mockAssign.mutateAsync).not.toHaveBeenCalled();
  });

  // Suppress unused-import warning for `within` (kept for future scoping).
  it('renders the drawer dialog with the slot title as aria-label', () => {
    renderDrawer({ slot: { title: 'Recon sweep' } });
    const dialog = screen.getByRole('dialog', { name: 'Recon sweep' });
    expect(within(dialog).getByRole('heading', { level: 3, name: 'Recon sweep' })).toBeInTheDocument();
  });
});
