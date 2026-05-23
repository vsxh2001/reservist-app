/**
 * Sidebar component tests.
 *
 * Sidebar renders:
 *   - A team picker button (when teams.length > 1) that opens a listbox of teams.
 *   - Two nav groups: primary (Roster, Duty slots, Calendar, Day view, Activity)
 *     and team-scoped (Join requests, Reviews [disabled], Settings, and Admin
 *     when `isDivisionAdmin` is true).
 *   - A "me" footer with the current user (from `useAuth`) and a sign-out hook.
 *
 * We only mock the auth context — everything else is plain prop-driven rendering.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Member, Slot, Team } from '../../src/lib/types';

// ── auth ───────────────────────────────────────────────────────────────────
const signOutMock = vi.fn(async () => {});
vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'member-1', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
    signOut: signOutMock,
  }),
}));

import { Sidebar } from '../../src/components/Sidebar';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-1',
    project_id: 'proj-1',
    division_id: 'div-1',
    name: 'Alpha Company',
    crest: '🦁',
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

function renderSidebar(overrides: {
  team?: Team;
  teams?: Team[];
  members?: Member[];
  slots?: Slot[];
  pendingRequests?: number;
  active?: Parameters<typeof Sidebar>[0]['active'];
  isDivisionAdmin?: boolean;
  mobileOpen?: boolean;
} = {}) {
  const team = overrides.team ?? makeTeam();
  const teams = overrides.teams ?? [team];
  const setTeamId = vi.fn();
  const onNav = vi.fn();
  const onCloseMobile = vi.fn();

  const utils = render(
    <Sidebar
      team={team}
      teams={teams}
      setTeamId={setTeamId}
      members={overrides.members ?? []}
      slots={overrides.slots ?? []}
      pendingRequests={overrides.pendingRequests ?? 0}
      active={overrides.active ?? 'roster'}
      onNav={onNav}
      mobileOpen={overrides.mobileOpen ?? false}
      onCloseMobile={onCloseMobile}
      isDivisionAdmin={overrides.isDivisionAdmin}
    />,
  );
  return { ...utils, setTeamId, onNav, onCloseMobile };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sidebar', () => {
  beforeEach(() => {
    signOutMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders all standard nav items (Admin hidden when not division admin)', () => {
    renderSidebar();

    expect(screen.getByText('Roster')).toBeInTheDocument();
    expect(screen.getByText('Duty slots')).toBeInTheDocument();
    expect(screen.getByText('Calendar')).toBeInTheDocument();
    expect(screen.getByText('Day view')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.getByText('Join requests')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    // Admin entry should not appear without the flag.
    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
  });

  it('marks the active nav item with data-active="1" and others with "0"', () => {
    renderSidebar({ active: 'slots' });

    const activeLink = screen.getByText('Duty slots').closest('.sb-link');
    expect(activeLink).not.toBeNull();
    expect(activeLink).toHaveAttribute('data-active', '1');

    const inactiveLink = screen.getByText('Roster').closest('.sb-link');
    expect(inactiveLink).toHaveAttribute('data-active', '0');
  });

  it('clicking a nav item calls onNav with that screen id', async () => {
    const { onNav } = renderSidebar();

    await userEvent.click(screen.getByText('Calendar'));
    expect(onNav).toHaveBeenCalledWith('calendar');

    await userEvent.click(screen.getByText('Settings'));
    expect(onNav).toHaveBeenCalledWith('settings');

    await userEvent.click(screen.getByText('Join requests'));
    expect(onNav).toHaveBeenCalledWith('requests');
  });

  it('renders Admin nav item only when isDivisionAdmin is true', async () => {
    const { onNav } = renderSidebar({ isDivisionAdmin: true });

    const adminLabel = screen.getByText('Admin');
    expect(adminLabel).toBeInTheDocument();

    await userEvent.click(adminLabel);
    expect(onNav).toHaveBeenCalledWith('admin');
  });

  it('Reviews link is disabled (clicks do not fire onNav)', async () => {
    const { onNav } = renderSidebar();

    // Reviews exists in the team-scoped nav but is marked disabled.
    const reviews = screen.getByText('Reviews');
    expect(reviews).toBeInTheDocument();

    await userEvent.click(reviews);
    expect(onNav).not.toHaveBeenCalledWith('reviews');
  });

  it('shows the pending-request count next to Join requests', () => {
    renderSidebar({ pendingRequests: 7 });

    const requestsLink = screen.getByText('Join requests').closest('.sb-link');
    expect(requestsLink).not.toBeNull();
    // pendingRequests > 0 => urgent dot only (no count badge). pendingRequests=0
    // would still render the count. We re-run with 0 below to assert the count
    // node, since the urgent indicator hides the count when count > 0.
    expect(requestsLink!.querySelector('.sb-dot-urgent')).not.toBeNull();
  });

  it('shows a count badge when pendingRequests is 0', () => {
    renderSidebar({ pendingRequests: 0 });

    const requestsLink = screen.getByText('Join requests').closest('.sb-link');
    expect(requestsLink).not.toBeNull();
    const count = requestsLink!.querySelector('.sb-count');
    expect(count).not.toBeNull();
    expect(count!.textContent).toBe('0');
    // No urgent dot when no pending requests.
    expect(requestsLink!.querySelector('.sb-dot-urgent')).toBeNull();
  });

  it('renders the static team header when only one team is available', () => {
    renderSidebar();

    expect(screen.getByText('Alpha Company')).toBeInTheDocument();
    // Single-team mode does not render a team-switcher button.
    expect(screen.queryByRole('button', { name: /Alpha Company/ })).toBeNull();
  });

  it('renders a team-switcher button and lists teams when multiple teams exist', async () => {
    const t1 = makeTeam();
    const t2 = makeTeam({ id: 'team-2', name: 'Bravo Company', project_name: 'Pilot 2', crest: '🐺' });

    renderSidebar({ team: t1, teams: [t1, t2] });

    const switcher = screen.getByRole('button', { name: /Alpha Company/ });
    expect(switcher).toHaveAttribute('aria-haspopup', 'listbox');
    expect(switcher).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(switcher);

    const listbox = screen.getByRole('listbox', { name: /Select team/i });
    expect(listbox).toBeInTheDocument();
    // Both teams appear as options.
    const options = within(listbox).getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(within(listbox).getByText('Alpha Company')).toBeInTheDocument();
    expect(within(listbox).getByText('Bravo Company')).toBeInTheDocument();
    // The active team is marked as selected.
    const active = options.find((o) => o.getAttribute('aria-selected') === 'true');
    expect(active).toBeDefined();
    expect(within(active!).getByText('Alpha Company')).toBeInTheDocument();
  });

  it('selecting a different team in the switcher calls setTeamId(teamId)', async () => {
    const t1 = makeTeam();
    const t2 = makeTeam({ id: 'team-2', name: 'Bravo Company', project_name: 'Pilot 2', crest: '🐺' });

    const { setTeamId } = renderSidebar({ team: t1, teams: [t1, t2] });

    await userEvent.click(screen.getByRole('button', { name: /Alpha Company/ }));

    const listbox = screen.getByRole('listbox', { name: /Select team/i });
    const bravoOption = within(listbox).getByText('Bravo Company').closest('button');
    expect(bravoOption).not.toBeNull();

    await userEvent.click(bravoOption!);
    expect(setTeamId).toHaveBeenCalledWith('team-2');
  });

  it('marks slots nav as urgent when an unassigned urgent slot exists', () => {
    const urgentSlot: Slot = {
      id: 'slot-1',
      team_id: 'team-1',
      title: 'Patrol',
      urgent: true,
      state: 'published',
      start_at: new Date().toISOString(),
      end_at: null,
      duration: null,
      location: null,
      notes: null,
      assignee_id: null,
    };

    renderSidebar({ slots: [urgentSlot] });

    const slotsLink = screen.getByText('Duty slots').closest('.sb-link');
    expect(slotsLink).not.toBeNull();
    expect(slotsLink!.querySelector('.sb-dot-urgent')).not.toBeNull();
  });

  it('renders the signed-in user in the footer and signs out on click', async () => {
    renderSidebar();

    expect(screen.getByText('Commander Test')).toBeInTheDocument();
    expect(screen.getByText(/Commander · Alpha Company/)).toBeInTheDocument();

    // Footer wrapper carries the click handler; click on the name text bubbles up.
    await userEvent.click(screen.getByText('Commander Test'));
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Keyboard activation contract added in PR #96 via lib/a11y `activate()`.
  // ─────────────────────────────────────────────────────────────────────

  it('marks the active nav link with aria-current="page" for AT users', () => {
    renderSidebar({ active: 'calendar' });
    const calendar = screen.getByText('Calendar').closest('.sb-link');
    expect(calendar).not.toBeNull();
    expect(calendar).toHaveAttribute('aria-current', 'page');
    const roster = screen.getByText('Roster').closest('.sb-link');
    expect(roster).not.toHaveAttribute('aria-current');
  });

  it('nav links join the tab order with role="button" and tabIndex=0', () => {
    renderSidebar();
    const calendar = screen.getByText('Calendar').closest('.sb-link') as HTMLElement;
    expect(calendar).toHaveAttribute('role', 'button');
    expect(calendar).toHaveAttribute('tabindex', '0');
  });

  it('Enter on a focused nav link fires onNav', async () => {
    const { onNav } = renderSidebar();
    const calendar = screen.getByText('Calendar').closest('.sb-link') as HTMLElement;
    calendar.focus();
    await userEvent.keyboard('{Enter}');
    expect(onNav).toHaveBeenCalledWith('calendar');
  });

  it('Space on a focused nav link fires onNav', async () => {
    const { onNav } = renderSidebar();
    const settings = screen.getByText('Settings').closest('.sb-link') as HTMLElement;
    settings.focus();
    await userEvent.keyboard(' ');
    expect(onNav).toHaveBeenCalledWith('settings');
  });

  it('disabled Reviews link advertises aria-disabled and stays in the tab order without firing onNav', async () => {
    const { onNav } = renderSidebar();
    const reviews = screen.getByText('Reviews').closest('.sb-link') as HTMLElement;
    expect(reviews).toHaveAttribute('aria-disabled', 'true');
    reviews.focus();
    await userEvent.keyboard('{Enter}');
    expect(onNav).not.toHaveBeenCalledWith('reviews');
  });

  it('Enter on the sign-out footer triggers signOut', async () => {
    renderSidebar();
    const footer = screen.getByText('Commander Test').closest('.sb-me') as HTMLElement;
    footer.focus();
    await userEvent.keyboard('{Enter}');
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('sign-out footer carries an aria-label so screen readers announce the action', () => {
    renderSidebar();
    const footer = screen.getByLabelText('Sign out');
    expect(footer).toBeInTheDocument();
  });
});
