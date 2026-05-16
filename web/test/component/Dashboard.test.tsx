/**
 * Dashboard component tests.
 *
 * Dashboard is the commander shell. It owns:
 *   - active-screen state (Roster / Slots / Activity / Calendar / Day /
 *     Settings / Requests / Admin) driven by Sidebar's onNav callback.
 *   - the toast strip (fed via `onToast` from child screens).
 *   - the "Reservist view" header button when `onSwitchToReservist` is set.
 *
 * It composes many heavy children (Roster, SlotsScreen, NewSlotModal, ...) and
 * a long list of data hooks. To keep the surface focused on the *shell wiring*
 * we mock all of the child screens to simple placeholders and stub every hook
 * with deterministic data. The Sidebar is stubbed too: its placeholder exposes
 * nav buttons + a team switcher that we drive from the tests.
 *
 * Skipped (covered by other suites):
 *   - Inside-screen behavior (Roster, SlotsScreen, etc. each have their own tests).
 *   - Realtime subscription effects (`useRealtime` is mocked to a no-op).
 *   - The bell-popover content and Cmd-K keyboard shortcut.
 *   - "Reviews" screen — defined in the `Screen` type but not reachable from
 *     Dashboard's current Sidebar nav (no item).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Member, Screen as ScreenType, Slot, Team } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks — declared before the component import.
// ---------------------------------------------------------------------------

// ── auth ───────────────────────────────────────────────────────────────────
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
    signOut: vi.fn(),
  }),
}));

// ── realtime: no-op side effect ────────────────────────────────────────────
vi.mock('../../src/lib/realtime', () => ({
  useRealtime: () => {},
}));

// ── team-context (active team + switcher) ──────────────────────────────────
const activeTeamState: { team: Team | null; teams: Team[] } = {
  team: null,
  teams: [],
};
const setTeamIdMock = vi.fn();
vi.mock('../../src/lib/team-context', () => ({
  useActiveTeam: () => ({
    team: activeTeamState.team,
    teams: activeTeamState.teams,
    setTeamId: setTeamIdMock,
  }),
}));

// ── data hooks ─────────────────────────────────────────────────────────────
let membersState: { data: Member[]; isLoading: boolean; error: unknown } = {
  data: [], isLoading: false, error: null,
};
let slotsState: { data: Slot[]; isLoading: boolean; error: unknown } = {
  data: [], isLoading: false, error: null,
};
let activityState: { data: unknown[]; isLoading: boolean } = { data: [], isLoading: false };
let joinRequestsState: { data: unknown[]; isLoading: boolean } = { data: [], isLoading: false };
let skillsState: { data: string[]; isLoading: boolean } = { data: [], isLoading: false };
let divisionState: { data: { id: string; name: string } | null; isLoading: boolean } = {
  data: { id: 'div-1', name: 'Test Division' },
  isLoading: false,
};
let myMemberState: { data: Member | null; isLoading: boolean } = {
  data: null,
  isLoading: false,
};
const approvedPicksState = { data: [], isLoading: false };

// Spies — track which team-id each hook was called with.
const useMembersSpy = vi.fn();
const useSlotsSpy = vi.fn();
const useActivitySpy = vi.fn();
const useJoinRequestsSpy = vi.fn();

vi.mock('../../src/lib/queries', () => ({
  useMembers: (teamId: string | undefined) => {
    useMembersSpy(teamId);
    return membersState;
  },
  useSlots: (teamId: string | undefined) => {
    useSlotsSpy(teamId);
    return slotsState;
  },
  useActivity: (teamId: string | undefined) => {
    useActivitySpy(teamId);
    return activityState;
  },
  useJoinRequests: (teamId: string | undefined) => {
    useJoinRequestsSpy(teamId);
    return joinRequestsState;
  },
  useSkills: () => skillsState,
  useDivision: () => divisionState,
  useMyMember: () => myMemberState,
  useApprovedPicksForTeam: () => approvedPicksState,
}));

// ── child screens & heavy components ───────────────────────────────────────
//
// Sidebar placeholder: renders a `team-switcher` <select> driven from props
// plus a nav button per Screen. The buttons let tests assert that
// Dashboard correctly responds to `onNav(...)`.
vi.mock('../../src/components/Sidebar', () => {
  const SCREENS: ScreenType[] = [
    'roster', 'slots', 'activity', 'calendar', 'day',
    'settings', 'requests', 'admin',
  ];
  return {
    Sidebar: (props: {
      team: Team;
      teams: Team[];
      setTeamId: (id: string) => void;
      onNav: (s: ScreenType) => void;
      isDivisionAdmin?: boolean;
    }) => (
      <aside data-testid="sidebar-mock">
        <div data-testid="sidebar-team-id">{props.team.id}</div>
        <select
          data-testid="team-switcher"
          value={props.team.id}
          onChange={(e) => props.setTeamId(e.target.value)}
        >
          {props.teams.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        {SCREENS.map((s) => {
          // Hide admin button unless this commander is a division admin.
          if (s === 'admin' && !props.isDivisionAdmin) return null;
          return (
            <button
              key={s}
              data-testid={`nav-${s}`}
              onClick={() => props.onNav(s)}
            >
              nav:{s}
            </button>
          );
        })}
      </aside>
    ),
  };
});

vi.mock('../../src/components/Roster', () => ({
  Roster: (props: { onToast: (m: string) => void; teamId: string }) => (
    <div data-testid="roster-mock" data-team-id={props.teamId}>
      <button
        data-testid="roster-fire-toast"
        onClick={() => props.onToast('roster toast fired')}
      >
        fire toast
      </button>
    </div>
  ),
}));

vi.mock('../../src/components/SlotsScreen', () => ({
  SlotsScreen: () => <div data-testid="slots-mock">slots-mock</div>,
}));

vi.mock('../../src/components/ActivityScreen', () => ({
  ActivityScreen: () => <div data-testid="activity-mock">activity-mock</div>,
}));

vi.mock('../../src/components/SettingsScreen', () => ({
  SettingsScreen: () => <div data-testid="settings-mock">settings-mock</div>,
}));

vi.mock('../../src/components/RequestsScreen', () => ({
  RequestsScreen: () => <div data-testid="requests-mock">requests-mock</div>,
}));

vi.mock('../../src/components/CalendarScreen', () => ({
  CalendarScreen: () => <div data-testid="calendar-mock">calendar-mock</div>,
}));

vi.mock('../../src/components/CommanderDayView', () => ({
  CommanderDayView: () => <div data-testid="day-mock">day-mock</div>,
}));

vi.mock('../../src/components/DivisionAdminScreen', () => ({
  DivisionAdminScreen: () => <div data-testid="admin-mock">admin-mock</div>,
}));

vi.mock('../../src/components/PersonDrawer', () => ({
  PersonDrawer: () => <div data-testid="person-drawer-mock" />,
}));

vi.mock('../../src/components/SlotDrawer', () => ({
  SlotDrawer: () => <div data-testid="slot-drawer-mock" />,
}));

vi.mock('../../src/components/NewSlotModal', () => ({
  NewSlotModal: () => <div data-testid="new-slot-modal-mock" />,
}));

// QueryClient wrapper — used by Dashboard via useQueryClient().
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '../../src/Dashboard';

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-1',
    project_id: 'proj-1',
    division_id: 'div-1',
    name: 'Alpha Company',
    crest: 'lion',
    invite_code: 'alpha-001',
    invite_expires_at: null,
    established: '2024-01',
    member_count: 12,
    commander_count: 2,
    project_name: 'Reservist Pilot',
    show_unit_schedule: false,
    ...overrides,
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    division_id: 'div-1',
    name: 'Commander Test',
    initials: 'CT',
    tone: 0,
    phone: '+972 50-000-0000',
    joined: '2023-01',
    last_seen: null,
    calls_this_year: 0,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: new Date().toISOString(),
    is_division_admin: false,
    phone_visible_to_peers: false,
    skills: [],
    teams: [{ team_id: 'team-1', role: 'commander' }],
    ...overrides,
  };
}

function renderDashboard(props: { onSwitchToReservist?: () => void } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <Dashboard {...props} />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard', () => {
  beforeEach(() => {
    activeTeamState.team = makeTeam();
    activeTeamState.teams = [
      makeTeam(),
      makeTeam({ id: 'team-2', name: 'Bravo Squad' }),
    ];
    membersState = { data: [], isLoading: false, error: null };
    slotsState = { data: [], isLoading: false, error: null };
    activityState = { data: [], isLoading: false };
    joinRequestsState = { data: [], isLoading: false };
    skillsState = { data: ['Medic'], isLoading: false };
    divisionState = {
      data: { id: 'div-1', name: 'Test Division' },
      isLoading: false,
    };
    myMemberState = { data: makeMember(), isLoading: false };
    setTeamIdMock.mockReset();
    useMembersSpy.mockReset();
    useSlotsSpy.mockReset();
    useActivitySpy.mockReset();
    useJoinRequestsSpy.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------- default screen ----------------------------------------------

  it('renders the Roster screen by default', () => {
    renderDashboard();
    expect(screen.getByTestId('roster-mock')).toBeInTheDocument();
    // The other screens should not be mounted yet.
    expect(screen.queryByTestId('slots-mock')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-mock')).not.toBeInTheDocument();
  });

  it('renders the loading splash when there is no active team', () => {
    activeTeamState.team = null;
    activeTeamState.teams = [];
    renderDashboard();
    expect(screen.getByText(/No teams found/i)).toBeInTheDocument();
    // Sidebar is not rendered in the no-team branch.
    expect(screen.queryByTestId('sidebar-mock')).not.toBeInTheDocument();
  });

  // -------- screen switching --------------------------------------------

  it('switches to SlotsScreen when Sidebar fires onNav("slots")', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTestId('nav-slots'));

    expect(screen.getByTestId('slots-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('roster-mock')).not.toBeInTheDocument();
  });

  it('switches to ActivityScreen when Sidebar fires onNav("activity")', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTestId('nav-activity'));

    expect(screen.getByTestId('activity-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('roster-mock')).not.toBeInTheDocument();
  });

  it('switches to SettingsScreen via onNav("settings")', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTestId('nav-settings'));

    expect(screen.getByTestId('settings-mock')).toBeInTheDocument();
  });

  it('switches to CalendarScreen via onNav("calendar")', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTestId('nav-calendar'));

    expect(screen.getByTestId('calendar-mock')).toBeInTheDocument();
  });

  it('switches to RequestsScreen via onNav("requests")', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTestId('nav-requests'));

    expect(screen.getByTestId('requests-mock')).toBeInTheDocument();
  });

  it('switches to CommanderDayView via onNav("day")', async () => {
    const user = userEvent.setup();
    renderDashboard();

    await user.click(screen.getByTestId('nav-day'));

    expect(screen.getByTestId('day-mock')).toBeInTheDocument();
  });

  // -------- division-admin gating ---------------------------------------

  it('exposes the admin nav and reaches DivisionAdminScreen when is_division_admin is true', async () => {
    const user = userEvent.setup();
    myMemberState = {
      data: makeMember({ is_division_admin: true }),
      isLoading: false,
    };
    renderDashboard();

    const adminBtn = screen.getByTestId('nav-admin');
    expect(adminBtn).toBeInTheDocument();

    await user.click(adminBtn);
    expect(screen.getByTestId('admin-mock')).toBeInTheDocument();
  });

  it('hides the admin nav when is_division_admin is false', () => {
    myMemberState = {
      data: makeMember({ is_division_admin: false }),
      isLoading: false,
    };
    renderDashboard();

    expect(screen.queryByTestId('nav-admin')).not.toBeInTheDocument();
  });

  // -------- team switcher -----------------------------------------------

  it('passes team-context.setTeamId through to the Sidebar', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // The Sidebar mock exposes a <select> bound to setTeamId.
    const sw = screen.getByTestId('team-switcher') as HTMLSelectElement;
    await user.selectOptions(sw, 'team-2');

    expect(setTeamIdMock).toHaveBeenCalledWith('team-2');
  });

  it("queries each team's data with the active team's id", () => {
    activeTeamState.team = makeTeam({ id: 'team-99' });
    activeTeamState.teams = [makeTeam({ id: 'team-99' })];
    renderDashboard();

    // Each data hook receives the active team's id.
    expect(useMembersSpy).toHaveBeenCalledWith('team-99');
    expect(useSlotsSpy).toHaveBeenCalledWith('team-99');
    expect(useActivitySpy).toHaveBeenCalledWith('team-99');
    expect(useJoinRequestsSpy).toHaveBeenCalledWith('team-99');
  });

  // -------- toast strip -------------------------------------------------

  it('shows the toast strip when a child screen fires onToast', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // Toast container starts closed (data-open="0").
    const toast = document.querySelector('.toast') as HTMLElement;
    expect(toast).not.toBeNull();
    expect(toast.getAttribute('data-open')).toBe('0');

    await user.click(screen.getByTestId('roster-fire-toast'));

    // Now the toast strip is open and contains the message text.
    expect(toast.getAttribute('data-open')).toBe('1');
    expect(toast.textContent).toContain('roster toast fired');
  });

  // -------- Reservist view --------------------------------------------

  it('renders the "Reservist view" button and calls the callback when clicked', async () => {
    const user = userEvent.setup();
    const onSwitchToReservist = vi.fn();
    renderDashboard({ onSwitchToReservist });

    const btn = screen.getByRole('button', { name: /Reservist view/i });
    await user.click(btn);
    expect(onSwitchToReservist).toHaveBeenCalledTimes(1);
  });

  it('omits the "Reservist view" button when no callback is supplied', () => {
    renderDashboard();
    expect(
      screen.queryByRole('button', { name: /Reservist view/i }),
    ).not.toBeInTheDocument();
  });
});
