/**
 * SlotsScreen component tests.
 *
 * SlotsScreen receives its domain data through props (slots, members) and the
 * caller-provided callbacks. The only external state it touches comes from:
 *   - useAuth()             → vi.mock'd to provide a stable user
 *   - useMyMember(userId)   → vi.mock'd; controls commander gating
 *   - useUpdateSlotState()  → vi.mock'd; used only when Publishing a draft
 * It also renders <BulkCancelModal/> when commander; that modal short-circuits
 * to null while open=false so no further mocks are required.
 *
 * Behaviors intentionally NOT covered (do not exist in the component):
 *   - "Filter by urgency" — there is no urgent-only filter chip; urgency is
 *     only rendered as a per-row badge. State filter chips are the only filters.
 *   - "Date-range / upcoming-only filter" — not implemented in this screen.
 *   - "Sort order verification" — the component renders slots in the order
 *     they're passed in props; no internal sorting to assert.
 *
 * Note on commander gating: the component derives team_id from `slots[0]` and
 * checks myMember.data.teams for a commander row on that team. With no slots,
 * teamId is undefined, so the "Bulk-cancel" button never shows even for
 * commanders. Tests that exercise the commander/soldier gating therefore
 * always pass at least one slot.
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

// myMember.data is read as `myMember.data?.teams.some(...)`. We expose a
// mutable shape and let individual tests swap it via setMyMemberData().
let myMemberData: Member | null = null;
function setMyMemberData(m: Member | null) { myMemberData = m; }

const mockUpdateState = { mutateAsync: vi.fn(), isPending: false };

vi.mock('../../src/lib/queries', () => ({
  useMyMember:        () => ({ data: myMemberData }),
  useUpdateSlotState: () => mockUpdateState,
  // BulkCancelModal imports useBulkCancelSlots, but it returns null while
  // closed (the default in our tests), so the hook is never invoked at render
  // time. Still stub it so the import does not blow up.
  useBulkCancelSlots: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { SlotsScreen } from '../../src/components/SlotsScreen';

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
  };
  // overrides applied below to be explicit about overlay order
}

// Spread overrides correctly without losing TS narrowing — wrap the helper.
function slot(overrides: Partial<Slot> = {}): Slot {
  return { ...makeSlot(), ...overrides };
}

// Distinct slots across all four states for filter tests.
const PUB_NIGHT = slot({
  id: 's1', title: 'Night patrol', state: 'published', urgent: false,
  needed: 3, filled: 1, assignee_ids: ['m1'],
  start_at: '2026-06-10T20:00:00.000Z',
});
const PUB_URGENT = slot({
  id: 's2', title: 'Urgent recon', state: 'published', urgent: true,
  needed: 2, filled: 0, assignee_ids: [],
  start_at: '2026-06-11T06:00:00.000Z',
});
const DRAFT_DAY = slot({
  id: 's3', title: 'Day watch', state: 'draft', urgent: false,
  needed: 1, filled: 0, assignee_ids: [],
  start_at: '2026-06-12T08:00:00.000Z',
});
const COMPLETED_GATE = slot({
  id: 's4', title: 'Gate duty', state: 'completed', urgent: false,
  needed: 1, filled: 1, assignee_ids: ['m1'],
  start_at: '2026-06-01T09:00:00.000Z',
});
const CANCELLED_SWEEP = slot({
  id: 's5', title: 'Cancelled sweep', state: 'cancelled', urgent: false,
  needed: 2, filled: 0, assignee_ids: [],
  start_at: '2026-06-02T10:00:00.000Z',
});

const ALL_SLOTS = [PUB_NIGHT, PUB_URGENT, DRAFT_DAY, COMPLETED_GATE, CANCELLED_SWEEP];

const ALICE = makeMember({ id: 'm1', name: 'Alice Cohen', initials: 'AC' });

interface RenderOpts {
  slots?: Slot[];
  members?: Member[];
  asCommander?: boolean;
}

function renderScreen(opts: RenderOpts = {}) {
  const slots = opts.slots ?? ALL_SLOTS;
  const members = opts.members ?? [ALICE];
  const asCommander = opts.asCommander ?? false;

  // The component reads commander status from myMember.data.teams matched to
  // slots[0].team_id. All our fixture slots use team_id='team1'.
  setMyMemberData(
    makeMember({
      id: 'u1',
      teams: [{ team_id: 'team1', role: asCommander ? 'commander' : 'soldier' }],
    }),
  );

  const onUrgent  = vi.fn();
  const onNewSlot = vi.fn();
  const onSlotClick = vi.fn();
  const onToast   = vi.fn();

  const utils = render(
    <SlotsScreen
      slots={slots}
      members={members}
      onUrgent={onUrgent}
      onNewSlot={onNewSlot}
      onSlotClick={onSlotClick}
      onToast={onToast}
    />,
  );
  return { ...utils, onUrgent, onNewSlot, onSlotClick, onToast };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlotsScreen', () => {
  beforeEach(() => {
    mockUpdateState.mutateAsync.mockReset();
    mockUpdateState.mutateAsync.mockResolvedValue(undefined);
    setMyMemberData(null);
  });

  // -------- header / list rendering -------------------------------------

  it('renders the screen header', () => {
    renderScreen();
    expect(screen.getByText(/Open & upcoming/i)).toBeInTheDocument();
  });

  it('renders only published slots by default (the default filter is "published")', () => {
    renderScreen({ slots: ALL_SLOTS });
    // Published slots show.
    expect(screen.getByRole('heading', { level: 3, name: 'Night patrol' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Urgent recon' })).toBeInTheDocument();
    // Non-published are hidden by default filter.
    expect(screen.queryByRole('heading', { level: 3, name: 'Day watch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Gate duty' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Cancelled sweep' })).not.toBeInTheDocument();
  });

  it('renders the urgent badge for published+urgent slots', () => {
    renderScreen({ slots: [PUB_URGENT] });
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('renders the filled / needed count for each slot row', () => {
    renderScreen({ slots: [PUB_NIGHT] });
    // PUB_NIGHT: filled 1, needed 3 → "1 / 3 needed"
    expect(screen.getByText(/1\s*\/\s*3/)).toBeInTheDocument();
    expect(screen.getByText(/needed/i)).toBeInTheDocument();
  });

  it('renders state-chip counts that reflect ALL slots regardless of which chips are on', () => {
    renderScreen({ slots: ALL_SLOTS });
    const filterGroup = screen.getByRole('group', { name: /Filter by slot state/i });
    // 2 published, 1 draft, 1 completed, 1 cancelled
    expect(within(filterGroup).getByText('Published')).toBeInTheDocument();
    expect(within(filterGroup).getByText('Drafts')).toBeInTheDocument();
    expect(within(filterGroup).getByText('Completed')).toBeInTheDocument();
    expect(within(filterGroup).getByText('Cancelled')).toBeInTheDocument();
    // Counts appear next to chip labels (spans).
    const chipCounts = filterGroup.querySelectorAll('.filter-count');
    const counts = Array.from(chipCounts).map((n) => n.textContent);
    expect(counts).toEqual(['2', '1', '1', '1']);
  });

  // -------- empty states ------------------------------------------------

  it('shows the "no duty slots yet" empty state when slots is empty', () => {
    renderScreen({ slots: [] });
    expect(screen.getByText(/No duty slots yet/i)).toBeInTheDocument();
  });

  it('shows the "nothing matches those filters" empty state when filters exclude every slot', () => {
    // Pass only a draft so the default 'published' filter matches nothing.
    renderScreen({ slots: [DRAFT_DAY] });
    expect(screen.getByText(/Nothing matches those filters/i)).toBeInTheDocument();
  });

  it('shows the "no states selected" empty state when every state chip is off', async () => {
    const user = userEvent.setup();
    renderScreen({ slots: ALL_SLOTS });
    const filterGroup = screen.getByRole('group', { name: /Filter by slot state/i });
    // Default is just 'published' on — turn it off.
    await user.click(within(filterGroup).getByText('Published'));
    expect(screen.getByText(/No states selected/i)).toBeInTheDocument();
  });

  // -------- filter chips ------------------------------------------------

  it('toggling a state chip on adds slots in that state to the visible list', async () => {
    const user = userEvent.setup();
    renderScreen({ slots: ALL_SLOTS });
    // Draft row not visible by default.
    expect(screen.queryByRole('heading', { level: 3, name: 'Day watch' })).not.toBeInTheDocument();
    const filterGroup = screen.getByRole('group', { name: /Filter by slot state/i });
    await user.click(within(filterGroup).getByText('Drafts'));
    expect(screen.getByRole('heading', { level: 3, name: 'Day watch' })).toBeInTheDocument();
    // Published rows still visible (multi-select).
    expect(screen.getByRole('heading', { level: 3, name: 'Night patrol' })).toBeInTheDocument();
  });

  it('toggling Completed chip on reveals completed slots; toggling off hides them', async () => {
    const user = userEvent.setup();
    renderScreen({ slots: ALL_SLOTS });
    const filterGroup = screen.getByRole('group', { name: /Filter by slot state/i });
    await user.click(within(filterGroup).getByText('Completed'));
    expect(screen.getByRole('heading', { level: 3, name: 'Gate duty' })).toBeInTheDocument();
    await user.click(within(filterGroup).getByText('Completed'));
    expect(screen.queryByRole('heading', { level: 3, name: 'Gate duty' })).not.toBeInTheDocument();
  });

  it('toggling Cancelled chip on reveals cancelled slots', async () => {
    const user = userEvent.setup();
    renderScreen({ slots: ALL_SLOTS });
    const filterGroup = screen.getByRole('group', { name: /Filter by slot state/i });
    await user.click(within(filterGroup).getByText('Cancelled'));
    expect(screen.getByRole('heading', { level: 3, name: 'Cancelled sweep' })).toBeInTheDocument();
  });

  it('chip data-on attribute reflects which states are selected', async () => {
    const user = userEvent.setup();
    renderScreen({ slots: ALL_SLOTS });
    const filterGroup = screen.getByRole('group', { name: /Filter by slot state/i });
    const publishedBtn = within(filterGroup).getByText('Published').closest('button')!;
    const draftsBtn    = within(filterGroup).getByText('Drafts').closest('button')!;
    expect(publishedBtn).toHaveAttribute('data-on', '1');
    expect(draftsBtn).toHaveAttribute('data-on', '0');
    await user.click(draftsBtn);
    expect(draftsBtn).toHaveAttribute('data-on', '1');
  });

  // -------- row click invokes onSlotClick -------------------------------

  it('clicking a slot row invokes onSlotClick with that slot', async () => {
    const user = userEvent.setup();
    const { onSlotClick } = renderScreen({ slots: [PUB_NIGHT] });
    await user.click(screen.getByRole('heading', { level: 3, name: 'Night patrol' }));
    expect(onSlotClick).toHaveBeenCalledTimes(1);
    expect(onSlotClick).toHaveBeenCalledWith(PUB_NIGHT);
  });

  it('clicking the row-level "View slot" button also invokes onSlotClick', async () => {
    const user = userEvent.setup();
    const { onSlotClick } = renderScreen({ slots: [PUB_NIGHT] });
    // Two "View slot" buttons could exist if more slots; restrict to one slot.
    await user.click(screen.getByRole('button', { name: /View slot/i }));
    expect(onSlotClick).toHaveBeenCalledWith(PUB_NIGHT);
  });

  // -------- top-bar action buttons --------------------------------------

  it('renders "New slot" button regardless of commander/soldier status, and clicking calls onNewSlot', async () => {
    const user = userEvent.setup();
    const { onNewSlot } = renderScreen({ slots: [PUB_NIGHT], asCommander: false });
    const newBtn = screen.getByRole('button', { name: /New slot/i });
    expect(newBtn).toBeInTheDocument();
    await user.click(newBtn);
    expect(onNewSlot).toHaveBeenCalledTimes(1);
  });

  it('renders "Urgent call-up" button and clicking calls onUrgent', async () => {
    const user = userEvent.setup();
    const { onUrgent } = renderScreen({ slots: [PUB_NIGHT] });
    await user.click(screen.getByRole('button', { name: /Urgent call-up/i }));
    expect(onUrgent).toHaveBeenCalledTimes(1);
  });

  it('"Bulk-cancel" button is visible for commanders', () => {
    renderScreen({ slots: [PUB_NIGHT], asCommander: true });
    expect(screen.getByRole('button', { name: /Bulk-cancel/i })).toBeInTheDocument();
  });

  it('"Bulk-cancel" button is hidden for soldiers', () => {
    renderScreen({ slots: [PUB_NIGHT], asCommander: false });
    expect(screen.queryByRole('button', { name: /Bulk-cancel/i })).not.toBeInTheDocument();
  });

  it('"Bulk-cancel" button is hidden when there are no slots (no team_id can be derived)', () => {
    renderScreen({ slots: [], asCommander: true });
    expect(screen.queryByRole('button', { name: /Bulk-cancel/i })).not.toBeInTheDocument();
  });

  // -------- draft Publish action ----------------------------------------

  it('renders a Publish button on draft rows; clicking it calls useUpdateSlotState with state="published"', async () => {
    const user = userEvent.setup();
    // Show drafts to make the draft row visible.
    const { onToast, onSlotClick } = renderScreen({ slots: [DRAFT_DAY] });
    const filterGroup = screen.getByRole('group', { name: /Filter by slot state/i });
    await user.click(within(filterGroup).getByText('Drafts'));

    // Use exact match to avoid colliding with the "Published" chip (whose
    // accessible name is "Published <count>").
    const publishBtn = screen.getByRole('button', { name: /^Publish$/i });
    await user.click(publishBtn);

    expect(mockUpdateState.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockUpdateState.mutateAsync.mock.calls[0][0];
    expect(arg.slotId).toBe('s3');
    expect(arg.state).toBe('published');
    expect(arg.teamId).toBe('team1');
    expect(arg.actorId).toBe('u1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.slotTitle).toBe('Day watch');
    // Toast fires after success.
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Published "Day watch"/));
    // Publishing should not propagate as a row click.
    expect(onSlotClick).not.toHaveBeenCalled();
  });

  it('renders an Assign button only on published under-filled rows; clicking calls onSlotClick', async () => {
    const user = userEvent.setup();
    const { onSlotClick } = renderScreen({ slots: [PUB_NIGHT] });
    // PUB_NIGHT is published, filled 1 / needed 3 → Assign button shows.
    const assignBtn = screen.getByRole('button', { name: /^Assign$/i });
    await user.click(assignBtn);
    expect(onSlotClick).toHaveBeenCalledWith(PUB_NIGHT);
  });

  it('does NOT render an Assign button on fully filled published rows', () => {
    const filledSlot = slot({ id: 'sx', state: 'published', needed: 1, filled: 1, assignee_ids: ['m1'], title: 'Full' });
    renderScreen({ slots: [filledSlot] });
    expect(screen.queryByRole('button', { name: /^Assign$/i })).not.toBeInTheDocument();
  });

  it('completed slots render with a "completed" state badge and no Assign/Publish controls', async () => {
    const user = userEvent.setup();
    renderScreen({ slots: [COMPLETED_GATE] });
    // Turn on Completed filter so the row renders.
    const filterGroup = screen.getByRole('group', { name: /Filter by slot state/i });
    await user.click(within(filterGroup).getByText('Completed'));
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Assign$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Publish$/i })).not.toBeInTheDocument();
  });

  it('draft rows render a "Draft" badge', async () => {
    const user = userEvent.setup();
    renderScreen({ slots: [DRAFT_DAY] });
    const filterGroup = screen.getByRole('group', { name: /Filter by slot state/i });
    await user.click(within(filterGroup).getByText('Drafts'));
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });
});
