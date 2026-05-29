/**
 * SlotDrawer component tests.
 *
 * SlotDrawer receives all its domain data through props (slot, members,
 * allSlots, approvedPicks, teamId, callbacks). The only external state it
 * touches comes from:
 *   - useAuth()           → AuthProvider; vi.mock'd to provide a stable user
 *   - useAssignToSlot()
 *   - useUnassignFromSlot()
 *   - useUpdateSlot()
 *   - useUpdateSlotState()
 * All four mutation hooks are vi.mock'd so no QueryClient or Supabase is needed.
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
    phone_visible_to_peers: false,
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
    notes: null,
    assignee_id: null,
    ...overrides,
  };
}

// Members for filtering / candidate tests.
const ALICE = makeMember({ id: 'm1', name: 'Alice Cohen', initials: 'AC', status: 'available' });
const BOB   = makeMember({ id: 'm2', name: 'Bob Levi',   initials: 'BL', status: 'standby'   });
const CAROL = makeMember({ id: 'm3', name: 'Carol Paz',  initials: 'CP', status: 'unavailable' });
const DAN   = makeMember({ id: 'm4', name: 'Dan Mor',    initials: 'DM', status: 'available' });

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
      allSlots={allSlots}
      approvedPicks={approvedPicks}
      teamId="team1"
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

  // -------- assignee section --------------------------------------------

  it('renders the single assigned member with their status pill and skills', () => {
    const withSkills = makeMember({ ...ALICE, skills: [{ name: 'Medic', level: 'senior' }] });
    renderDrawer({
      slot: { assignee_id: 'm1' },
      members: [withSkills, BOB],
    });
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    // Member skill chip is rendered as advisory info for the commander.
    expect(screen.getByText('Medic')).toBeInTheDocument();
  });

  it('shows the empty-state line when no one is assigned and the picker is closed', () => {
    renderDrawer({ slot: { assignee_id: null } });
    expect(screen.getByText(/Unassigned/i)).toBeInTheDocument();
  });

  // -------- candidate picker --------------------------------------------

  it('shows the "+ Assign" affordance only when published and unassigned', () => {
    renderDrawer({ slot: { state: 'published', assignee_id: null } });
    expect(screen.getByText(/\+\s*Assign$/i)).toBeInTheDocument();
  });

  it('does NOT show "+ Assign" when the slot already has an assignee', () => {
    renderDrawer({
      slot: { state: 'published', assignee_id: 'm1' },
      members: [ALICE],
    });
    expect(screen.queryByText(/\+\s*Assign$/i)).not.toBeInTheDocument();
  });

  it('filters candidates to available + standby (excludes unavailable)', async () => {
    const user = userEvent.setup();
    renderDrawer({
      slot: { state: 'published', assignee_id: null },
      members: [ALICE, BOB, CAROL, DAN],
    });

    await user.click(screen.getByText(/\+\s*Assign$/i));

    // Carol is unavailable → filtered out.
    expect(screen.queryByText('Carol Paz')).not.toBeInTheDocument();
    // Alice, Bob, Dan are all in either available or standby → all in.
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    expect(screen.getByText('Dan Mor')).toBeInTheDocument();
  });

  it('ranks available candidates before standby candidates in the picker', async () => {
    const user = userEvent.setup();
    renderDrawer({
      slot: { state: 'published', assignee_id: null },
      members: [BOB /* standby */, ALICE /* available */],
    });

    await user.click(screen.getByText(/\+\s*Assign$/i));

    const alice = screen.getByText('Alice Cohen');
    const bob   = screen.getByText('Bob Levi');
    expect(alice.compareDocumentPosition(bob) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('shows an empty-state message when no candidates qualify', async () => {
    const user = userEvent.setup();
    renderDrawer({
      slot: { state: 'published', assignee_id: null },
      members: [CAROL], // only unavailable member on roster
    });
    await user.click(screen.getByText(/\+\s*Assign$/i));
    expect(screen.getByText(/No reservists match/i)).toBeInTheDocument();
  });

  // -------- assign / unassign mutations ---------------------------------

  it('clicking Assign calls useAssignToSlot.mutateAsync with the single selected member id and metadata', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      slot: {
        id: 's1', state: 'published', assignee_id: null,
        title: 'Night patrol',
      },
      members: [ALICE, DAN],
    });

    await user.click(screen.getByText(/\+\s*Assign$/i));
    await user.click(screen.getByText('Dan Mor'));

    const assignBtn = screen.getByRole('button', { name: /^Assign$/ });
    await user.click(assignBtn);

    expect(mockAssign.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockAssign.mutateAsync.mock.calls[0][0];
    expect(arg.slotId).toBe('s1');
    expect(arg.memberId).toBe('m4');
    expect(arg.assignedBy).toBe('u1');
    expect(arg.teamId).toBe('team1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.slotTitle).toBe('Night patrol');
    expect(arg.memberName).toBe('Dan Mor');

    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Assigned Dan Mor/));
  });

  it('clicking the Unassign icon calls useUnassignFromSlot.mutateAsync with the right payload', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      slot: {
        id: 's1', state: 'published', assignee_id: 'm1',
        title: 'Night patrol',
      },
      members: [ALICE],
    });

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
    expect(arg.currentState).toBe('draft');
    expect(arg.teamId).toBe('team1');
    expect(arg.actorId).toBe('u1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.slotTitle).toBe('Night patrol');
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Published "Night patrol"/));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Mark complete calls useUpdateSlotState.mutateAsync with state="completed" and closes the drawer', async () => {
    const user = userEvent.setup();
    const { onToast, onClose } = renderDrawer({ slot: { state: 'published' } });

    await user.click(screen.getByRole('button', { name: /Mark complete/i }));

    expect(mockUpdateState.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateState.mutateAsync.mock.calls[0][0].state).toBe('completed');
    expect(mockUpdateState.mutateAsync.mock.calls[0][0].currentState).toBe('published');
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/marked complete/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel slot calls useUpdateSlotState.mutateAsync with state="cancelled" and closes the drawer', async () => {
    const user = userEvent.setup();
    const { onToast, onClose } = renderDrawer({ slot: { state: 'published' } });

    await user.click(screen.getByRole('button', { name: /Cancel slot/i }));

    expect(mockUpdateState.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdateState.mutateAsync.mock.calls[0][0].state).toBe('cancelled');
    expect(mockUpdateState.mutateAsync.mock.calls[0][0].currentState).toBe('published');
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
    expect(screen.getByRole('heading', { level: 4, name: /Edit slot/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark complete/i })).not.toBeInTheDocument();
  });

  it('does NOT render the Edit button on completed slots', () => {
    renderDrawer({ slot: { state: 'completed' } });
    expect(screen.queryByRole('button', { name: /Edit slot/i })).not.toBeInTheDocument();
  });

  // -------- unassign only when published --------------------------------

  it('does NOT render an Unassign control when slot is not published', () => {
    renderDrawer({
      slot: { state: 'completed', assignee_id: 'm1' },
      members: [ALICE],
    });
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    const unassignBtn = document.querySelector('button[data-tip="Unassign"]');
    expect(unassignBtn).toBeNull();
  });

  // -------- guard: no pick selected → Assign disabled -------------------

  it('clicking Assign with no candidate selected leaves the button disabled (no mutation)', async () => {
    const user = userEvent.setup();
    renderDrawer({
      slot: { state: 'published', assignee_id: null },
      members: [ALICE, BOB],
    });
    await user.click(screen.getByText(/\+\s*Assign$/i));
    const assignBtn = screen.getByRole('button', { name: /^Assign$/ });
    expect(assignBtn).toBeDisabled();
    await user.click(assignBtn);
    expect(mockAssign.mutateAsync).not.toHaveBeenCalled();
  });

  it('renders the drawer dialog with the slot title as aria-label', () => {
    renderDrawer({ slot: { title: 'Recon sweep' } });
    const dialog = screen.getByRole('dialog', { name: 'Recon sweep' });
    expect(within(dialog).getByRole('heading', { level: 3, name: 'Recon sweep' })).toBeInTheDocument();
  });
});
