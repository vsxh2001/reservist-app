/**
 * CrossTeamRecruitDrawer component tests.
 *
 * CrossTeamRecruitDrawer is the commander's "recruit from the division roster
 * into one of my teams" drawer. It pulls all its state from hooks:
 *   - useAuth()                 → AuthProvider (mocked: stable commander user)
 *   - useActiveTeam()           → team-context (mocked: active team + commander teams)
 *   - useDivision()             → current division
 *   - useMembersInDivision()    → candidate roster (every member of the division)
 *   - useTeamsForMember(id)     → per-row team-count badge
 *   - useUpdateTeamMembership() → mutation that upserts team_members
 *
 * Coverage skipped (NOT in the component, so no behaviour to assert):
 *   - "Add as soldier" / "Add as commander" buttons: the drawer has a single
 *     "Add N selected" footer button and always inserts with role: 'soldier'.
 *     Commander-role recruiting is not implemented here.
 *   - Skill filter: the drawer only filters by free-text (name or phone),
 *     there is no skill chip filter UI.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Member, Team, Division } from '../../src/lib/types';

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

// Mutable holders so individual tests can vary the active team / commander
// roster without re-mocking the module each time.
const activeTeamState: { team: Team | null; teams: Team[] } = {
  team: null,
  teams: [],
};

vi.mock('../../src/lib/team-context', () => ({
  useActiveTeam: () => ({
    team: activeTeamState.team,
    teams: activeTeamState.teams,
    setTeamId: vi.fn(),
  }),
}));

// Mutable holders for the queries module.
let divisionMembersData: Member[] = [];
let divisionMembersLoading = false;
let divisionData: Division | null = null;
let divisionLoading = false;
const mockUpdateMembership = { mutateAsync: vi.fn(), isPending: false };

vi.mock('../../src/lib/queries', () => ({
  useDivision: () => ({ data: divisionData, isLoading: divisionLoading, error: null }),
  useMembersInDivision: () => ({
    data: divisionMembersData,
    isLoading: divisionMembersLoading,
    error: null,
  }),
  // Row badge — every member shows "N teams". Stub returns empty array.
  useTeamsForMember: () => ({ data: [], isLoading: false, error: null }),
  useUpdateTeamMembership: () => mockUpdateMembership,
}));

import { CrossTeamRecruitDrawer } from '../../src/components/CrossTeamRecruitDrawer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team1',
    project_id: 'p1',
    division_id: 'div1',
    name: 'Alpha',
    crest: 'A',
    invite_code: null,
    invite_expires_at: null,
    established: null,
    member_count: 1,
    commander_count: 1,
    project_name: 'Project One',
    show_unit_schedule: true,
    ...overrides,
  };
}

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
    teams: [],
    ...overrides,
  };
}

const TEAM_ALPHA = makeTeam({ id: 'team1', name: 'Alpha', crest: 'A' });
const TEAM_BRAVO = makeTeam({ id: 'team2', name: 'Bravo', crest: 'B' });

// Division candidates.
const ALICE  = makeMember({ id: 'm1', name: 'Alice Cohen', initials: 'AC', phone: '+972 52-111-1111', teams: [] });
const BOB    = makeMember({ id: 'm2', name: 'Bob Levi',    initials: 'BL', phone: '+972 52-222-2222', teams: [] });
const CAROL  = makeMember({ id: 'm3', name: 'Carol Paz',   initials: 'CP', phone: '+972 52-333-3333', teams: [] });
// Dan is already on TEAM_ALPHA; he should be hidden when destination = team1.
const DAN_IN = makeMember({
  id: 'm4', name: 'Dan Mor', initials: 'DM', phone: '+972 52-444-4444',
  teams: [{ team_id: 'team1', role: 'soldier' }],
});

function renderDrawer() {
  const onClose = vi.fn();
  const onToast = vi.fn();
  const utils = render(<CrossTeamRecruitDrawer onClose={onClose} onToast={onToast} />);
  return { ...utils, onClose, onToast };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CrossTeamRecruitDrawer', () => {
  beforeEach(() => {
    mockUpdateMembership.mutateAsync.mockReset();
    mockUpdateMembership.mutateAsync.mockResolvedValue(undefined);
    mockUpdateMembership.isPending = false;

    // Defaults: division loaded, commander commands TEAM_ALPHA, three free
    // members (ALICE, BOB, CAROL) + DAN already on Alpha.
    divisionData = { id: 'div1', name: 'Division One', created_at: '2024-01-01' };
    divisionLoading = false;
    divisionMembersData = [ALICE, BOB, CAROL, DAN_IN];
    divisionMembersLoading = false;
    activeTeamState.team = TEAM_ALPHA;
    activeTeamState.teams = [TEAM_ALPHA];
  });

  // -------- header / dialog --------------------------------------------------

  it('renders the drawer with the destination team in the aria-label and heading', () => {
    renderDrawer();
    expect(screen.getByRole('dialog', { name: /Recruit to Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: /Recruit to/ })).toBeInTheDocument();
    // Team name rendered inside the <em> of the heading.
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('does NOT render the destination-team picker when the commander has only one team', () => {
    renderDrawer();
    // The team picker only appears when commanderTeams.length > 1.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders the destination-team picker when the commander has multiple teams', () => {
    activeTeamState.team = TEAM_ALPHA;
    activeTeamState.teams = [TEAM_ALPHA, TEAM_BRAVO];
    renderDrawer();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe('team1');
    // Both teams listed.
    expect(screen.getByRole('option', { name: /Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Bravo/ })).toBeInTheDocument();
  });

  // -------- candidate list ---------------------------------------------------

  it('renders division members who are NOT yet on the destination team', () => {
    renderDrawer();
    // Free candidates show.
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    expect(screen.getByText('Carol Paz')).toBeInTheDocument();
    // Dan is already on team1 → excluded.
    expect(screen.queryByText('Dan Mor')).not.toBeInTheDocument();
  });

  it('shows the loading state while division members are loading', () => {
    divisionMembersLoading = true;
    divisionMembersData = [];
    renderDrawer();
    expect(screen.getByText(/Loading division members/i)).toBeInTheDocument();
  });

  // -------- search filter ----------------------------------------------------

  it('search input narrows the candidate list by name', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const search = screen.getByPlaceholderText(/Search by name or phone/i);
    await user.type(search, 'alice');
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.queryByText('Bob Levi')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol Paz')).not.toBeInTheDocument();
  });

  it('search input narrows the candidate list by phone', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const search = screen.getByPlaceholderText(/Search by name or phone/i);
    // BOB's phone contains "222-2222"; the search filters by raw .includes().
    await user.type(search, '222-2222');
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    expect(screen.queryByText('Alice Cohen')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol Paz')).not.toBeInTheDocument();
  });

  it('shows a "no match" empty state when search yields no candidates', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.type(screen.getByPlaceholderText(/Search by name or phone/i), 'zzz-nobody');
    expect(screen.getByText(/No members match that search/i)).toBeInTheDocument();
  });

  it('clear-search button resets the query and restores the full list', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const search = screen.getByPlaceholderText(/Search by name or phone/i) as HTMLInputElement;
    await user.type(search, 'alice');
    expect(screen.queryByText('Bob Levi')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear search/i }));
    expect(search.value).toBe('');
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
  });

  // -------- selection + add (membership-insert mutation) ---------------------

  it('Add button is disabled until a candidate is selected', () => {
    renderDrawer();
    // Footer button reads "Add selected" when none picked (no leading count).
    const addBtn = screen.getByRole('button', { name: /^Add\s+selected$/ });
    expect(addBtn).toBeDisabled();
  });

  it('selecting a member and clicking Add calls useUpdateTeamMembership with { teamId, memberId, role: "soldier" }', async () => {
    const user = userEvent.setup();
    const { onClose, onToast } = renderDrawer();

    await user.click(screen.getByText('Alice Cohen'));
    // Footer label becomes "Add 1 selected".
    const addBtn = screen.getByRole('button', { name: /Add\s+1\s+selected/ });
    expect(addBtn).toBeEnabled();
    await user.click(addBtn);

    await waitFor(() => {
      expect(mockUpdateMembership.mutateAsync).toHaveBeenCalledTimes(1);
    });
    const arg = mockUpdateMembership.mutateAsync.mock.calls[0][0];
    expect(arg.teamId).toBe('team1');
    expect(arg.memberId).toBe('m1');
    expect(arg.role).toBe('soldier');
    expect(arg.actorId).toBe('u1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.memberName).toBe('Alice Cohen');

    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Recruited 1 member to Alpha/));
    expect(onClose).toHaveBeenCalled();
  });

  it('selecting multiple members fires one mutation per recruit and toasts the combined count', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer();

    await user.click(screen.getByText('Alice Cohen'));
    await user.click(screen.getByText('Bob Levi'));

    await user.click(screen.getByRole('button', { name: /Add\s+2\s+selected/ }));

    await waitFor(() => {
      expect(mockUpdateMembership.mutateAsync).toHaveBeenCalledTimes(2);
    });
    const memberIds = mockUpdateMembership.mutateAsync.mock.calls.map((c) => c[0].memberId).sort();
    expect(memberIds).toEqual(['m1', 'm2']);
    // Every call uses role 'soldier'.
    for (const call of mockUpdateMembership.mutateAsync.mock.calls) {
      expect(call[0].role).toBe('soldier');
      expect(call[0].teamId).toBe('team1');
    }
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Recruited 2 members to Alpha/));
  });

  it('toggling a selected member off deselects them (Add disables again)', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const row = screen.getByText('Alice Cohen');
    await user.click(row);
    expect(screen.getByRole('button', { name: /Add\s+1\s+selected/ })).toBeEnabled();
    await user.click(row);
    expect(screen.getByRole('button', { name: /^Add\s+selected$/ })).toBeDisabled();
  });

  it('shows an error toast and keeps the drawer open when the mutation rejects', async () => {
    const user = userEvent.setup();
    mockUpdateMembership.mutateAsync.mockRejectedValueOnce(new Error('boom'));
    const { onClose, onToast } = renderDrawer();

    await user.click(screen.getByText('Alice Cohen'));
    await user.click(screen.getByRole('button', { name: /Add\s+1\s+selected/ }));

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Error: boom/));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  // -------- empty state (no recruitable members) -----------------------------

  it('shows "all division members are already on this team" when every candidate is already on the destination team', () => {
    // Both members already belong to team1 → alreadyOnTeam covers everything.
    divisionMembersData = [
      makeMember({ id: 'm1', name: 'Alice Cohen', teams: [{ team_id: 'team1', role: 'soldier' }] }),
      makeMember({ id: 'm2', name: 'Bob Levi',    teams: [{ team_id: 'team1', role: 'soldier' }] }),
    ];
    renderDrawer();
    expect(
      screen.getByText(/All division members are already on this team/i),
    ).toBeInTheDocument();
  });

  it('shows the "no members in division yet" empty state when the division has zero members', () => {
    divisionMembersData = [];
    renderDrawer();
    expect(screen.getByText(/No members in division yet/i)).toBeInTheDocument();
  });

  // -------- close ------------------------------------------------------------

  it('clicking the Close button invokes onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /Close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the Cancel footer button invokes onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
