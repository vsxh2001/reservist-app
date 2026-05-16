/**
 * Roster component tests.
 *
 * Roster accepts all data as props (members, skills, slots, filters, etc.) so
 * it is mountable without a real Supabase connection.
 *
 * It does call two hooks that touch external state:
 *   - useAuth()    → needs AuthProvider or a vi.mock
 *   - useAssignToSlot() → returns a mutation object; mocked below
 *
 * We vi.mock both so no AuthProvider / QueryClientProvider is needed.
 *
 * SkillEditor inside PersonDrawer is not separately exported — skipped per spec.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Filters, Member, Slot } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
  }),
}));

const mockAssignToSlot = { mutateAsync: vi.fn(), isPending: false };
vi.mock('../../src/lib/queries', () => ({
  useAssignToSlot: () => mockAssignToSlot,
}));

import { Roster } from '../../src/components/Roster';

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
    skills: [],
    teams: [{ team_id: 'team1', role: 'soldier' }],
    ...overrides,
  };
}

const ALICE = makeMember({ id: 'm1', name: 'Alice Cohen', status: 'available' });
const BOB   = makeMember({ id: 'm2', name: 'Bob Levi',   status: 'unavailable', initials: 'BL' });
const CAROL = makeMember({ id: 'm3', name: 'Carol Paz',  status: 'standby',     initials: 'CP' });

const EMPTY_FILTERS: Filters = { status: [], skills: [], q: '' };
const NO_SLOTS: Slot[] = [];

function renderRoster(
  members: Member[],
  filters: Filters = EMPTY_FILTERS,
  selected: string[] = [],
) {
  const onFilters = vi.fn();
  const setSelected = vi.fn();
  const onPerson = vi.fn();
  const onToast = vi.fn();
  const onNewSlotWith = vi.fn();

  const utils = render(
    <Roster
      members={members}
      skills={['Marksmanship', 'Driving']}
      slots={NO_SLOTS}
      teamId="team1"
      filters={filters}
      onFilters={onFilters}
      selected={selected}
      setSelected={setSelected}
      onPerson={onPerson}
      onToast={onToast}
      onNewSlotWith={onNewSlotWith}
    />,
  );
  return { ...utils, onFilters, setSelected, onPerson, onToast };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Roster', () => {
  beforeEach(() => {
    mockAssignToSlot.mutateAsync.mockReset();
  });

  it('renders all members when no filters are active', () => {
    renderRoster([ALICE, BOB, CAROL]);
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    expect(screen.getByText('Carol Paz')).toBeInTheDocument();
  });

  it('shows "Nobody matches" empty state when filtered list is empty', () => {
    // Filter to available but pass only unavailable members.
    renderRoster([BOB], { status: ['available'], skills: [], q: '' });
    expect(screen.getByText(/Nobody matches those filters/i)).toBeInTheDocument();
    expect(screen.queryByText('Bob Levi')).not.toBeInTheDocument();
  });

  it('applies text search filter — shows matching member only', () => {
    renderRoster([ALICE, BOB], { ...EMPTY_FILTERS, q: 'alice' });
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.queryByText('Bob Levi')).not.toBeInTheDocument();
  });

  it('shows correct total count in stat block', () => {
    renderRoster([ALICE, BOB, CAROL]);
    // stat block shows "3" for total
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onPerson when a roster row is clicked', async () => {
    const user = userEvent.setup();
    const { onPerson } = renderRoster([ALICE]);
    // Click the row (contains Alice's name)
    await user.click(screen.getByText('Alice Cohen'));
    expect(onPerson).toHaveBeenCalledWith(ALICE);
  });

  it('shows "Clear all" button when a status filter is active', () => {
    renderRoster([ALICE], { status: ['available'], skills: [], q: '' });
    expect(screen.getByText(/Clear all/i)).toBeInTheDocument();
  });

  it('does NOT show "Clear all" when no filters are active', () => {
    renderRoster([ALICE]);
    expect(screen.queryByText(/Clear all/i)).not.toBeInTheDocument();
  });
});
