/**
 * ReservistDashboard component tests.
 *
 * ReservistDashboard is the self-service view used by reservists. It calls:
 *   - useAuth()                      → current session (mocked)
 *   - useActiveTeam()                → active team + team list (mocked)
 *   - useMyMember(userId)            → the current member row
 *   - useMySlots(memberId)           → slots assigned (or visible) to me
 *   - useMyDeploymentWindows(...)    → my windows
 *   - useSelfUpdateStatus()          → mutation: status change
 *   - useSetPhoneVisibility()        → mutation: phone-visibility toggle
 *   - useRealtime(teamId)            → subscription side-effect (mocked to no-op)
 *
 * Coverage skipped (intentionally — outside ReservistDashboard's own behavior):
 *   - DeploymentPickScreen body: covered by its own test suite. We only verify
 *     that ReservistDashboard mounts it (handing off via setActiveWindow).
 *   - Slot card formatting / urgent styling: SlotRow is internal; we assert
 *     presence of slot titles and the "Urgent" section header instead.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  DeploymentWindow,
  Member,
  Slot,
  Team,
} from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks — must precede the component import.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Reservist Test' },
    authUser: null,
    status: 'linked',
    signOut: vi.fn(),
  }),
}));

// ── team-context ────────────────────────────────────────────────────────────
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

// ── realtime — no-op side effect ────────────────────────────────────────────
vi.mock('../../src/lib/realtime', () => ({
  useRealtime: () => {},
}));

// ── push — happy-dom has no PushManager / SW registration. Mock so the
//    Notifications card renders deterministically without touching the
//    real service-worker layer.
const currentSubscriptionMock = vi.fn();
const subscribeToPushMock = vi.fn();
const unsubscribeFromPushMock = vi.fn();
const sendTestPushMock = vi.fn();
vi.mock('../../src/lib/push', () => ({
  currentSubscription: () => currentSubscriptionMock(),
  subscribeToPush: (memberId: string) => subscribeToPushMock(memberId),
  unsubscribeFromPush: (memberId: string) => unsubscribeFromPushMock(memberId),
  sendTestPush: () => sendTestPushMock(),
}));

// ── queries hooks ──────────────────────────────────────────────────────────
let myMemberState: { data: Member | null; isLoading: boolean } = {
  data: null,
  isLoading: false,
};
let mySlotsState: { data: Slot[]; isLoading: boolean } = {
  data: [],
  isLoading: false,
};
let myWindowsState: { data: DeploymentWindow[]; isLoading: boolean } = {
  data: [],
  isLoading: false,
};

const selfUpdateStatusMut = { mutateAsync: vi.fn(), isPending: false };
const setPhoneVisibilityMut = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
};
const setMemberSkillMut = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
};
const removeMemberSkillMut = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
};
let allSkillsState: { data: string[] | undefined } = { data: ['Night Ops', 'Medic', 'Driver'] };

let teamMembersState: { data: { id: string; name: string }[] | undefined; isLoading: boolean } = {
  data: [],
  isLoading: false,
};

vi.mock('../../src/lib/queries', () => ({
  useMyMember: () => myMemberState,
  useMySlots: () => mySlotsState,
  useMyDeploymentWindows: () => myWindowsState,
  useMembers: () => teamMembersState,
  useSelfUpdateStatus: () => selfUpdateStatusMut,
  useSetPhoneVisibility: () => setPhoneVisibilityMut,
  useSetMemberSkill: () => setMemberSkillMut,
  useRemoveMemberSkill: () => removeMemberSkillMut,
  useSkills: () => allSkillsState,
  // DeploymentPickScreen imports these from queries too.
  useDeploymentPicks: () => ({ data: [], isLoading: false, error: null }),
  useProposeDayPick: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWithdrawDayPick: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSetReservistNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ReservistDashboard } from '../../src/ReservistDashboard';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team1',
    project_id: 'proj1',
    division_id: 'div1',
    name: 'Alpha Company',
    crest: 'lion',
    invite_code: 'alpha-001',
    invite_expires_at: null,
    established: '2024-01',
    member_count: 10,
    commander_count: 2,
    project_name: 'Reservist Pilot',
    show_unit_schedule: true,
    ...overrides,
  };
}

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    division_id: 'div1',
    name: 'Yael Cohen',
    initials: 'YC',
    tone: 0,
    phone: '+972 52-000-0001',
    joined: '2023-01',
    last_seen: '2 days ago',
    calls_this_year: 0,
    status: 'available',
    status_note: 'On duty',
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
  const inOneDay = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  return {
    id: 's1',
    team_id: 'team1',
    title: 'Future patrol',
    urgent: false,
    state: 'published',
    start_at: inOneDay,
    end_at: null,
    duration: '4h',
    location: 'Base North',
    needed: 1,
    notes: null,
    role: null,
    skills: [],
    assignee_ids: ['m1'],
    filled: 1,
    ...overrides,
  };
}

function makeWindow(overrides: Partial<DeploymentWindow> = {}): DeploymentWindow {
  return {
    id: 'w1',
    member_id: 'm1',
    team_id: 'team1',
    label: 'June drill',
    start_date: '2099-06-01',
    end_date: '2099-06-07',
    notes: null,
    state: 'open',
    created_by: 'u1',
    created_at: new Date().toISOString(),
    proposed_count: 1,
    approved_count: 0,
    rejected_count: 0,
    withdrawn_count: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReservistDashboard', () => {
  beforeEach(() => {
    activeTeamState.team = makeTeam();
    activeTeamState.teams = [makeTeam()];
    myMemberState = { data: makeMember(), isLoading: false };
    mySlotsState = { data: [], isLoading: false };
    myWindowsState = { data: [], isLoading: false };
    selfUpdateStatusMut.mutateAsync.mockReset();
    selfUpdateStatusMut.mutateAsync.mockResolvedValue(undefined);
    selfUpdateStatusMut.isPending = false;
    setPhoneVisibilityMut.mutate.mockReset();
    setPhoneVisibilityMut.mutateAsync.mockReset();
    setPhoneVisibilityMut.isPending = false;
    setMemberSkillMut.mutateAsync.mockReset();
    setMemberSkillMut.mutateAsync.mockResolvedValue(undefined);
    setMemberSkillMut.isPending = false;
    removeMemberSkillMut.mutateAsync.mockReset();
    removeMemberSkillMut.mutateAsync.mockResolvedValue(undefined);
    removeMemberSkillMut.isPending = false;
    allSkillsState = { data: ['Night Ops', 'Medic', 'Driver'] };
    teamMembersState = { data: [], isLoading: false };
    setTeamIdMock.mockReset();
    currentSubscriptionMock.mockReset();
    currentSubscriptionMock.mockResolvedValue(null);
    subscribeToPushMock.mockReset();
    subscribeToPushMock.mockResolvedValue({ ok: true });
    unsubscribeFromPushMock.mockReset();
    unsubscribeFromPushMock.mockResolvedValue(undefined);
    sendTestPushMock.mockReset();
    sendTestPushMock.mockResolvedValue(undefined);
  });

  // -------- header ------------------------------------------------------

  it('renders the header with the reservist first name, status pill, and avatar', () => {
    myMemberState = {
      data: makeMember({
        name: 'Yael Cohen',
        initials: 'YC',
        status: 'available',
      }),
      isLoading: false,
    };
    render(<ReservistDashboard />);

    // First name appears in the profile card heading.
    expect(screen.getByText(/Yael/)).toBeInTheDocument();

    // StatusPill renders "Available" once for the user's current status.
    expect(screen.getByText('Available')).toBeInTheDocument();

    // Avatar uses the `.avatar` class and shows the initials.
    const avatar = document.querySelector('.avatar');
    expect(avatar).not.toBeNull();
    expect(avatar!.textContent).toContain('YC');
  });

  // -------- status edit -------------------------------------------------

  it('Change opens the edit form; Save calls useSelfUpdateStatus with the right payload', async () => {
    const user = userEvent.setup();
    myMemberState = {
      data: makeMember({
        id: 'm1',
        status: 'available',
        status_note: 'Initial note',
        status_until: null,
      }),
      isLoading: false,
    };

    render(<ReservistDashboard />);

    // Click "Change" to enter edit mode.
    await user.click(screen.getByRole('button', { name: /Change/i }));

    // Edit form renders the four status options as buttons. Pick "standby".
    // The buttons contain a <StatusPill /> showing the label.
    const standbyOption = screen.getByText('Standby').closest('button')!;
    await user.click(standbyOption);

    // Set an optional note.
    const noteInput = screen.getByPlaceholderText(/exam period/i);
    await user.clear(noteInput);
    await user.type(noteInput, 'Travelling');

    // Save.
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(selfUpdateStatusMut.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = selfUpdateStatusMut.mutateAsync.mock.calls[0][0];
    expect(arg).toEqual({
      memberId: 'm1',
      status: 'standby',
      note: 'Travelling',
      until: null,
      teamId: 'team1',
      actorName: 'Reservist Test',
    });
  });

  // -------- upcoming duty ----------------------------------------------

  it('lists published slots starting in the future under "My upcoming duty"', () => {
    const futureSlot = makeSlot({
      id: 's1',
      title: 'Future patrol',
      state: 'published',
      urgent: false,
      start_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    });
    mySlotsState = { data: [futureSlot], isLoading: false };

    render(<ReservistDashboard />);

    expect(screen.getByText('My upcoming duty')).toBeInTheDocument();
    expect(screen.getByText('Future patrol')).toBeInTheDocument();
  });

  it('renders an "Urgent" header and the urgent slot when an urgent published slot is upcoming', () => {
    const urgentSlot = makeSlot({
      id: 's-urg',
      title: 'Urgent recall',
      urgent: true,
      state: 'published',
      start_at: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    });
    const regularSlot = makeSlot({
      id: 's-reg',
      title: 'Routine drill',
      urgent: false,
      state: 'published',
      start_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    });
    mySlotsState = { data: [urgentSlot, regularSlot], isLoading: false };

    render(<ReservistDashboard />);

    // The card body shows an "Urgent" sub-header only when an urgent slot exists.
    expect(screen.getByText(/^Urgent$/)).toBeInTheDocument();
    expect(screen.getByText('Urgent recall')).toBeInTheDocument();
    expect(screen.getByText('Routine drill')).toBeInTheDocument();
  });

  it('shows the empty-state line when there are no upcoming slots', () => {
    mySlotsState = { data: [], isLoading: false };
    render(<ReservistDashboard />);
    expect(screen.getByText(/Nothing scheduled for you right now/i)).toBeInTheDocument();
  });

  // -------- cancelled assignments --------------------------------------

  it('Cancelled section surfaces a cancelled slot the reservist was assigned to', () => {
    const cancelled = makeSlot({
      id: 's-cancel',
      title: 'Was: patrol',
      state: 'cancelled',
      start_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      assignee_ids: ['m1'],
    });
    mySlotsState = { data: [cancelled], isLoading: false };

    render(<ReservistDashboard />);

    const section = screen.getByTestId('cancelled-section');
    expect(section).toBeInTheDocument();
    expect(section.textContent).toMatch(/Cancelled/);
    expect(section.textContent).toMatch(/Was: patrol/);
  });

  it('Cancelled section is hidden when no cancelled slot is in the recent window', () => {
    const livePub = makeSlot({
      id: 's-live',
      title: 'Routine',
      state: 'published',
      start_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    mySlotsState = { data: [livePub], isLoading: false };

    render(<ReservistDashboard />);
    expect(screen.queryByTestId('cancelled-section')).not.toBeInTheDocument();
  });

  it('Cancelled section is hidden for cancellations the reservist is NOT assigned to', () => {
    const cancelled = makeSlot({
      id: 's-cancel',
      title: 'Other team patrol',
      state: 'cancelled',
      start_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      assignee_ids: ['m-other'],
    });
    mySlotsState = { data: [cancelled], isLoading: false };

    render(<ReservistDashboard />);
    expect(screen.queryByTestId('cancelled-section')).not.toBeInTheDocument();
  });

  it('Cancelled section drops cancellations older than 7 days', () => {
    const stale = makeSlot({
      id: 's-stale',
      title: 'Last month patrol',
      state: 'cancelled',
      start_at: new Date(Date.now() - 14 * 86_400_000).toISOString(),
      assignee_ids: ['m1'],
    });
    mySlotsState = { data: [stale], isLoading: false };

    render(<ReservistDashboard />);
    expect(screen.queryByTestId('cancelled-section')).not.toBeInTheDocument();
    // Empty state still shown since the only slot is filtered out.
    expect(screen.getByText(/Nothing scheduled for you right now/i)).toBeInTheDocument();
  });

  it('Cancelled SlotRow renders a "Cancelled" pill alongside the title', () => {
    const cancelled = makeSlot({
      id: 's-cancel',
      title: 'Was: drill',
      state: 'cancelled',
      start_at: new Date(Date.now() + 86_400_000).toISOString(),
      assignee_ids: ['m1'],
    });
    mySlotsState = { data: [cancelled], isLoading: false };

    render(<ReservistDashboard />);
    const section = screen.getByTestId('cancelled-section');
    expect(within(section).getByText('Cancelled', { selector: 'span' })).toBeInTheDocument();
  });

  // -------- phone visibility -------------------------------------------

  it('Phone visibility card reflects phone_visible_to_peers=false and clicking On calls setPhoneVisibility', async () => {
    const user = userEvent.setup();
    myMemberState = {
      data: makeMember({ id: 'm1', phone_visible_to_peers: false }),
      isLoading: false,
    };
    render(<ReservistDashboard />);

    // The card title is "Phone visibility".
    expect(screen.getByText('Phone visibility')).toBeInTheDocument();

    // Off should be selected when phone_visible_to_peers is false.
    const offBtn = screen.getByRole('button', { name: 'Off' });
    expect(offBtn).toHaveAttribute('data-on', '1');

    const onBtn = screen.getByRole('button', { name: 'On' });
    expect(onBtn).toHaveAttribute('data-on', '0');

    // Clicking On (when currently off) fires the mutation.
    await user.click(onBtn);
    expect(setPhoneVisibilityMut.mutate).toHaveBeenCalledTimes(1);
    const [vars] = setPhoneVisibilityMut.mutate.mock.calls[0];
    expect(vars).toEqual({ memberId: 'm1', visible: true });
  });

  it('Phone visibility reflects phone_visible_to_peers=true and Off click flips visibility', async () => {
    const user = userEvent.setup();
    myMemberState = {
      data: makeMember({ id: 'm1', phone_visible_to_peers: true }),
      isLoading: false,
    };
    render(<ReservistDashboard />);

    const onBtn = screen.getByRole('button', { name: 'On' });
    expect(onBtn).toHaveAttribute('data-on', '1');

    const offBtn = screen.getByRole('button', { name: 'Off' });
    expect(offBtn).toHaveAttribute('data-on', '0');

    await user.click(offBtn);
    expect(setPhoneVisibilityMut.mutate).toHaveBeenCalledTimes(1);
    expect(setPhoneVisibilityMut.mutate.mock.calls[0][0]).toEqual({
      memberId: 'm1',
      visible: false,
    });
  });

  // -------- deployment windows -----------------------------------------

  it('renders the next deployment window banner and clicking it switches to DeploymentPickScreen', async () => {
    const user = userEvent.setup();
    const win = makeWindow({
      id: 'w1',
      label: 'June drill',
      start_date: '2099-06-01',
      end_date: '2099-06-07',
      state: 'open',
    });
    myWindowsState = { data: [win], isLoading: false };

    render(<ReservistDashboard />);

    // The "My next deployment" header + label render in the banner.
    expect(screen.getByText(/My next deployment/i)).toBeInTheDocument();
    const labelEl = screen.getByText('June drill');
    expect(labelEl).toBeInTheDocument();

    // Click the banner (role=button). DeploymentPickScreen takes over.
    const banner = labelEl.closest('[role="button"]') as HTMLElement | null;
    expect(banner).not.toBeNull();
    await user.click(banner!);

    // DeploymentPickScreen renders a Back button (data-tip="Back") in its header.
    const back = document.querySelector('button[data-tip="Back"]');
    expect(back).not.toBeNull();
    // And the window range appears in its header.
    expect(screen.getByText(/2099-06-01/)).toBeInTheDocument();
  });

  // -------- view switch ------------------------------------------------

  it('renders the Commander view-switch button when onSwitchView is provided, and clicking it invokes the callback', async () => {
    const user = userEvent.setup();
    const onSwitchView = vi.fn();
    render(<ReservistDashboard onSwitchView={onSwitchView} />);

    const btn = screen.getByRole('button', { name: /Commander/i });
    await user.click(btn);
    expect(onSwitchView).toHaveBeenCalledTimes(1);
  });

  it('omits the Commander view-switch button when onSwitchView is not provided', () => {
    render(<ReservistDashboard />);
    expect(screen.queryByRole('button', { name: /Commander/i })).not.toBeInTheDocument();
  });

  // -------- loading / empty profile branches ---------------------------

  it('renders a loading splash while useMyMember is loading', () => {
    myMemberState = { data: null, isLoading: true };
    render(<ReservistDashboard />);
    // Use a regex tolerant of the unicode ellipsis used in the source.
    expect(screen.getByText(/Loading/)).toBeInTheDocument();
  });

  it('renders a "profile not found" splash when there is no member row', () => {
    myMemberState = { data: null, isLoading: false };
    render(<ReservistDashboard />);
    expect(screen.getByText(/Profile not found/i)).toBeInTheDocument();
  });

  // Suppress unused-import warning for `within` (kept for future scoping).
  it('scopes the upcoming-duty header to a known region', () => {
    mySlotsState = { data: [], isLoading: false };
    render(<ReservistDashboard />);
    const heading = screen.getByText('My upcoming duty');
    const card = heading.closest('section')!;
    expect(within(card).getByText(/Nothing scheduled/i)).toBeInTheDocument();
  });

  // -------- notifications opt-in ---------------------------------------

  it('Notifications card shows Enable push when not subscribed', async () => {
    currentSubscriptionMock.mockResolvedValue(null);
    render(<ReservistDashboard />);
    expect(await screen.findByRole('button', { name: /Enable push/i })).toBeInTheDocument();
  });

  it('Notifications card shows Disable + Test push when subscribed', async () => {
    const fakeSub = { endpoint: 'https://push.example/abc' } as unknown as PushSubscription;
    currentSubscriptionMock.mockResolvedValue(fakeSub);
    render(<ReservistDashboard />);
    expect(await screen.findByRole('button', { name: /Disable push/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send test push/i })).toBeInTheDocument();
  });

  it('Enable push button calls subscribeToPush with the user.id (= member id)', async () => {
    const user = userEvent.setup();
    currentSubscriptionMock.mockResolvedValue(null);
    render(<ReservistDashboard />);

    await user.click(await screen.findByRole('button', { name: /Enable push/i }));
    expect(subscribeToPushMock).toHaveBeenCalledWith('u1');
  });

  it('Disable push button calls unsubscribeFromPush and updates the card', async () => {
    const user = userEvent.setup();
    const fakeSub = { endpoint: 'https://push.example/abc' } as unknown as PushSubscription;
    currentSubscriptionMock.mockResolvedValue(fakeSub);
    render(<ReservistDashboard />);

    await user.click(await screen.findByRole('button', { name: /Disable push/i }));
    expect(unsubscribeFromPushMock).toHaveBeenCalledWith('u1');
    expect(await screen.findByRole('button', { name: /Enable push/i })).toBeInTheDocument();
  });

  it('Send test push button calls sendTestPush', async () => {
    const user = userEvent.setup();
    const fakeSub = { endpoint: 'https://push.example/abc' } as unknown as PushSubscription;
    currentSubscriptionMock.mockResolvedValue(fakeSub);
    render(<ReservistDashboard />);

    await user.click(await screen.findByRole('button', { name: /Send test push/i }));
    expect(sendTestPushMock).toHaveBeenCalledTimes(1);
  });

  // -------- slot row expand --------------------------------------------

  it('SlotRow shows filled/needed inline; tap reveals notes + skill chips', async () => {
    const user = userEvent.setup();
    mySlotsState = {
      data: [
        makeSlot({
          id: 's-detail',
          title: 'Border drill',
          notes: 'Pickup at base 06:30. Bring rifle + 2 mags.',
          needed: 3,
          filled: 1,
          skills: [{ name: 'Night Ops', min_level: 'senior' }],
        }),
      ],
      isLoading: false,
    };

    render(<ReservistDashboard />);

    // Filled/needed badge is always visible (no tap required).
    expect(screen.getByText('1/3')).toBeInTheDocument();
    // Notes hidden until tap.
    expect(screen.queryByText(/Pickup at base/)).not.toBeInTheDocument();

    const row = screen.getByText('Border drill').closest('[role="button"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.getAttribute('aria-expanded')).toBe('false');
    await user.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(/Pickup at base/)).toBeInTheDocument();
    expect(screen.getByText('Night Ops')).toBeInTheDocument();
  });

  it('SlotRow without detail (no notes, no skills, needed=0, no assignees) is not interactive', () => {
    mySlotsState = {
      data: [
        makeSlot({
          id: 's-bare',
          title: 'Bare patrol',
          notes: null,
          needed: 0,
          filled: 0,
          skills: [],
          assignee_ids: [],
        }),
      ],
      isLoading: false,
    };

    render(<ReservistDashboard />);
    const titleEl = screen.getByText('Bare patrol');
    // The row container is the closest div with the slot border styling. It
    // must not have role=button when there's no detail to show.
    expect(titleEl.closest('[role="button"]')).toBeNull();
  });

  it('SlotRow toggle is keyboard-accessible (Enter expands)', async () => {
    const user = userEvent.setup();
    mySlotsState = {
      data: [
        makeSlot({
          id: 's-kbd',
          title: 'KBD patrol',
          notes: 'Quiet sector',
          needed: 1,
          filled: 0,
        }),
      ],
      isLoading: false,
    };

    render(<ReservistDashboard />);
    const row = screen.getByText('KBD patrol').closest('[role="button"]') as HTMLElement;
    row.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Quiet sector')).toBeInTheDocument();
  });

  // -------- deployments list -------------------------------------------

  it('My deployments card hides when only one window exists (banner covers it)', () => {
    myWindowsState = {
      data: [makeWindow({ id: 'w-only', state: 'open', start_date: '2099-06-01' })],
      isLoading: false,
    };
    render(<ReservistDashboard />);
    expect(screen.queryByText('My deployments')).not.toBeInTheDocument();
  });

  it('My deployments card lists open windows beyond the banner', () => {
    myWindowsState = {
      data: [
        makeWindow({ id: 'w-banner', label: 'June drill', state: 'open', start_date: '2099-06-01', end_date: '2099-06-07' }),
        makeWindow({ id: 'w-extra', label: 'August exercise', state: 'open', start_date: '2099-08-10', end_date: '2099-08-14' }),
      ],
      isLoading: false,
    };
    render(<ReservistDashboard />);
    expect(screen.getByText('My deployments')).toBeInTheDocument();
    // Banner shows June (closest upcoming open). Card lists August.
    expect(screen.getByText('August exercise')).toBeInTheDocument();
  });

  it('My deployments card surfaces closed windows under a Recent subheading', () => {
    myWindowsState = {
      data: [
        makeWindow({ id: 'w-active', label: 'Current op', state: 'open', start_date: '2099-06-01', end_date: '2099-06-07' }),
        makeWindow({ id: 'w-past', label: 'March drill', state: 'closed', start_date: '2025-03-01', end_date: '2025-03-05', approved_count: 2 }),
      ],
      isLoading: false,
    };
    render(<ReservistDashboard />);
    // Recent subheading exists because there's at least one closed window.
    expect(screen.getByText('Recent')).toBeInTheDocument();
    expect(screen.getByText('March drill')).toBeInTheDocument();
  });

  it('Open deployment row renders a "starts in N days" countdown', () => {
    const isoDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Banner must be sooner than the windows we want to test inside the card.
    const bannerStart = new Date(); bannerStart.setDate(bannerStart.getDate() + 1);
    const start = new Date(); start.setDate(start.getDate() + 5);
    const end = new Date(start); end.setDate(end.getDate() + 3);

    myWindowsState = {
      data: [
        makeWindow({ id: 'w-banner', label: 'Banner', state: 'open',
          start_date: isoDay(bannerStart), end_date: isoDay(bannerStart) }),
        makeWindow({ id: 'w-soon',   label: 'Soon op', state: 'open',
          start_date: isoDay(start), end_date: isoDay(end) }),
      ],
      isLoading: false,
    };
    render(<ReservistDashboard />);

    // The card's deployment row, not the banner.
    const card = screen.getByText('My deployments').closest('section') as HTMLElement;
    const row = within(card).getByText('Soon op').closest('[role="button"]') as HTMLElement;
    expect(within(row).getByText(/starts in 5 days/)).toBeInTheDocument();
  });

  it('Open deployment row renders "in progress" when today falls inside the window', () => {
    const isoDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Banner needs an earlier start_date than the "Live op" we want in the
    // card, AND its end_date must be >= today (else nextWindow drops it).
    const bannerStart = new Date(); bannerStart.setDate(bannerStart.getDate() - 2);
    const bannerEnd = new Date(); bannerEnd.setDate(bannerEnd.getDate() + 4);
    const start = new Date(); start.setDate(start.getDate() - 1);
    const end = new Date(); end.setDate(end.getDate() + 3);

    myWindowsState = {
      data: [
        makeWindow({ id: 'w-banner', label: 'Banner', state: 'open',
          start_date: isoDay(bannerStart), end_date: isoDay(bannerEnd) }),
        makeWindow({ id: 'w-live',   label: 'Live op', state: 'open',
          start_date: isoDay(start), end_date: isoDay(end) }),
      ],
      isLoading: false,
    };
    render(<ReservistDashboard />);

    const card = screen.getByText('My deployments').closest('section') as HTMLElement;
    const row = within(card).getByText('Live op').closest('[role="button"]') as HTMLElement;
    expect(within(row).getByText(/in progress/)).toBeInTheDocument();
  });

  it('Closed deployment rows do not render a countdown', () => {
    myWindowsState = {
      data: [
        makeWindow({ id: 'w-active', label: 'Current op', state: 'open', start_date: '2099-06-01', end_date: '2099-06-07' }),
        makeWindow({ id: 'w-past', label: 'March drill', state: 'closed', start_date: '2025-03-01', end_date: '2025-03-05' }),
      ],
      isLoading: false,
    };
    render(<ReservistDashboard />);
    const row = screen.getByText('March drill').closest('[role="button"]') as HTMLElement;
    expect(within(row).queryByTestId('window-countdown')).not.toBeInTheDocument();
  });

  it('Open deployments are sorted soonest-first in the card', () => {
    const isoDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const banner = new Date(); banner.setDate(banner.getDate() + 1);
    const later = new Date(); later.setDate(later.getDate() + 90);
    const sooner = new Date(); sooner.setDate(sooner.getDate() + 30);

    myWindowsState = {
      data: [
        makeWindow({ id: 'w-banner', label: 'Banner', state: 'open', start_date: isoDay(banner), end_date: isoDay(banner) }),
        makeWindow({ id: 'w-later',  label: 'Later op', state: 'open', start_date: isoDay(later), end_date: isoDay(later) }),
        makeWindow({ id: 'w-sooner', label: 'Sooner op', state: 'open', start_date: isoDay(sooner), end_date: isoDay(sooner) }),
      ],
      isLoading: false,
    };
    render(<ReservistDashboard />);

    const card = screen.getByText('My deployments').closest('section') as HTMLElement;
    const text = card.textContent ?? '';
    const iSooner = text.indexOf('Sooner op');
    const iLater = text.indexOf('Later op');
    expect(iSooner).toBeGreaterThan(-1);
    expect(iLater).toBeGreaterThan(iSooner);
  });

  it('Clicking a deployment row opens DeploymentPickScreen for that window', async () => {
    const user = userEvent.setup();
    myWindowsState = {
      data: [
        makeWindow({ id: 'w-banner', label: 'Banner', state: 'open', start_date: '2099-06-01', end_date: '2099-06-07' }),
        makeWindow({ id: 'w-extra', label: 'Extra op', state: 'open', start_date: '2099-08-10', end_date: '2099-08-14' }),
      ],
      isLoading: false,
    };
    render(<ReservistDashboard />);

    const row = screen.getByText('Extra op').closest('[role="button"]') as HTMLElement;
    await user.click(row);
    // DeploymentPickScreen renders a header containing the window label.
    expect(await screen.findByText(/Extra op/)).toBeInTheDocument();
  });

  // -------- status until preset chips ----------------------------------

  it('status edit hides preset chips when pending status is available', async () => {
    const user = userEvent.setup();
    myMemberState = { data: makeMember({ status: 'available' }), isLoading: false };
    render(<ReservistDashboard />);

    await user.click(screen.getByRole('button', { name: /Change/i }));
    expect(screen.queryByRole('button', { name: /^3 days$/i })).not.toBeInTheDocument();
  });

  it('status edit shows preset chips after switching to a non-available status', async () => {
    const user = userEvent.setup();
    myMemberState = { data: makeMember({ status: 'available' }), isLoading: false };
    render(<ReservistDashboard />);

    await user.click(screen.getByRole('button', { name: /Change/i }));
    const unavailableOption = screen.getByText('Unavailable').closest('button') as HTMLElement;
    await user.click(unavailableOption);
    expect(screen.getByRole('button', { name: /^3 days$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1 week$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^2 weeks$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^1 month$/i })).toBeInTheDocument();
  });

  it('clicking a preset chip writes the corresponding YYYY-MM-DD into the date input', async () => {
    const user = userEvent.setup();
    myMemberState = { data: makeMember({ status: 'unavailable' }), isLoading: false };
    render(<ReservistDashboard />);

    await user.click(screen.getByRole('button', { name: /Change/i }));
    await user.click(screen.getByRole('button', { name: /^1 week$/i }));

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).not.toBeNull();
    // 7 days from today, formatted the same way the component does.
    const expected = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    })();
    expect(dateInput.value).toBe(expected);
  });

  it('Clear chip empties the until field; chip only shows when a value is set', async () => {
    const user = userEvent.setup();
    myMemberState = { data: makeMember({ status: 'unavailable' }), isLoading: false };
    render(<ReservistDashboard />);

    await user.click(screen.getByRole('button', { name: /Change/i }));
    expect(screen.queryByRole('button', { name: /^Clear$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^1 week$/i }));
    const clear = screen.getByRole('button', { name: /^Clear$/i });
    await user.click(clear);

    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe('');
    expect(screen.queryByRole('button', { name: /^Clear$/i })).not.toBeInTheDocument();
  });

  // -------- self-edit skills (PRD §7.2) --------------------------------

  it('My skills card shows empty hint when member has no skills', () => {
    myMemberState = { data: makeMember({ skills: [] }), isLoading: false };
    render(<ReservistDashboard />);
    expect(screen.getByText('My skills')).toBeInTheDocument();
    expect(screen.getByText(/No skills yet/i)).toBeInTheDocument();
  });

  it('My skills Edit toggle exposes the add-skill picker with division skills', async () => {
    const user = userEvent.setup();
    myMemberState = { data: makeMember({ skills: [] }), isLoading: false };
    render(<ReservistDashboard />);

    // Card has Edit button; click to enter edit mode.
    const editBtn = within(screen.getByText('My skills').closest('section')!)
      .getByRole('button', { name: /^Edit$/i });
    await user.click(editBtn);

    // Skill <select> dropdown is now mounted. Options reflect division skills.
    const select = screen.getByDisplayValue('Add a skill…') as HTMLSelectElement;
    const opts = Array.from(select.options).map((o) => o.value);
    expect(opts).toEqual(['', 'Night Ops', 'Medic', 'Driver']);
  });

  it('Add button on My skills calls useSetMemberSkill with the picked name + level', async () => {
    const user = userEvent.setup();
    myMemberState = { data: makeMember({ id: 'm1', division_id: 'div1', skills: [] }), isLoading: false };
    render(<ReservistDashboard />);

    const card = screen.getByText('My skills').closest('section')!;
    await user.click(within(card).getByRole('button', { name: /^Edit$/i }));

    // Pick "Medic", level "Senior".
    await user.selectOptions(screen.getByDisplayValue('Add a skill…'), 'Medic');
    await user.selectOptions(screen.getByDisplayValue('Junior'), 'senior');
    await user.click(within(card).getByRole('button', { name: /^Add$/i }));

    expect(setMemberSkillMut.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 'm1',
        divisionId: 'div1',
        skillName: 'Medic',
        level: 'senior',
      }),
    );
  });

  it('Cycling a skill level on an existing chip calls useSetMemberSkill with the next level', async () => {
    const user = userEvent.setup();
    myMemberState = {
      data: makeMember({
        id: 'm1', division_id: 'div1',
        skills: [{ name: 'Night Ops', level: 'junior' }],
      }),
      isLoading: false,
    };
    render(<ReservistDashboard />);

    const card = screen.getByText('My skills').closest('section')!;
    await user.click(within(card).getByRole('button', { name: /^Edit$/i }));

    // The level cycle button is labelled with the current level.
    await user.click(within(card).getByRole('button', { name: /Junior/i }));

    expect(setMemberSkillMut.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: 'Night Ops',
        level: 'intermediate',
      }),
    );
  });

  it('Remove (x) on an existing chip calls useRemoveMemberSkill', async () => {
    const user = userEvent.setup();
    myMemberState = {
      data: makeMember({
        id: 'm1', division_id: 'div1',
        skills: [{ name: 'Driver', level: 'intermediate' }],
      }),
      isLoading: false,
    };
    render(<ReservistDashboard />);

    const card = screen.getByText('My skills').closest('section')!;
    await user.click(within(card).getByRole('button', { name: /^Edit$/i }));
    await user.click(within(card).getByRole('button', { name: /Remove Driver/i }));

    expect(removeMemberSkillMut.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ skillName: 'Driver' }),
    );
  });

  // -------- slot co-assignees ------------------------------------------

  it('expanded SlotRow shows co-assignees with "You" for current member', async () => {
    const user = userEvent.setup();
    myMemberState = { data: makeMember({ id: 'm1', name: 'Yael Cohen' }), isLoading: false };
    teamMembersState = {
      data: [
        { id: 'm1', name: 'Yael Cohen' },
        { id: 'm2', name: 'Daniel Katz' },
        { id: 'm3', name: 'Noa Shapira' },
      ],
      isLoading: false,
    };
    mySlotsState = {
      data: [
        makeSlot({
          id: 's-assignees',
          title: 'Three-up patrol',
          notes: null,
          needed: 3,
          filled: 3,
          assignee_ids: ['m1', 'm2', 'm3'],
        }),
      ],
      isLoading: false,
    };

    render(<ReservistDashboard />);
    const row = screen.getByText('Three-up patrol').closest('[role="button"]') as HTMLElement;
    await user.click(row);

    // The "Assigned (3)" header renders, with names joined by commas.
    expect(screen.getByText('Assigned (3)')).toBeInTheDocument();
    // Names are joined into a single text node; assert on the concatenated value.
    expect(screen.getByText('You, Daniel Katz, Noa Shapira')).toBeInTheDocument();
  });

  it('falls back to em-dash for assignee ids missing from the members map', async () => {
    const user = userEvent.setup();
    myMemberState = { data: makeMember({ id: 'm1' }), isLoading: false };
    // Note: only 'm1' is in the members map; 'm-unknown' should render as '—'.
    teamMembersState = {
      data: [{ id: 'm1', name: 'Yael Cohen' }],
      isLoading: false,
    };
    mySlotsState = {
      data: [
        makeSlot({
          id: 's-mystery',
          title: 'Mystery slot',
          needed: 2,
          filled: 2,
          assignee_ids: ['m1', 'm-unknown'],
        }),
      ],
      isLoading: false,
    };

    render(<ReservistDashboard />);
    await user.click(screen.getByText('Mystery slot').closest('[role="button"]') as HTMLElement);
    expect(screen.getByText('You, —')).toBeInTheDocument();
  });

  // -------- "Set as available" shortcut on collapsed status card ------

  it('Set as available shortcut is hidden when status is already available', () => {
    myMemberState = { data: makeMember({ status: 'available' }), isLoading: false };
    render(<ReservistDashboard />);
    expect(screen.queryByRole('button', { name: /^Set as available$/i })).not.toBeInTheDocument();
  });

  it('Set as available shortcut appears when status is unavailable', () => {
    myMemberState = { data: makeMember({ status: 'unavailable' }), isLoading: false };
    render(<ReservistDashboard />);
    expect(screen.getByRole('button', { name: /^Set as available$/i })).toBeInTheDocument();
  });

  it('Clicking Set as available calls useSelfUpdateStatus with status=available, note=null, until=null', async () => {
    const user = userEvent.setup();
    myMemberState = {
      data: makeMember({
        id: 'm1',
        status: 'unavailable',
        status_note: 'Reserves leave',
        status_until: '2099-08-01',
      }),
      isLoading: false,
    };
    render(<ReservistDashboard />);

    await user.click(screen.getByRole('button', { name: /^Set as available$/i }));

    expect(selfUpdateStatusMut.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId: 'm1',
        status: 'available',
        note: null,
        until: null,
      }),
    );
  });

  // -------- status_until countdown hint --------------------------------

  it('My status shows a "N days left" hint when status_until is within 30 days', () => {
    const isoDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const target = new Date(); target.setDate(target.getDate() + 5);
    myMemberState = {
      data: makeMember({ status: 'unavailable', status_until: isoDay(target) }),
      isLoading: false,
    };
    render(<ReservistDashboard />);
    expect(screen.getByTestId('status-until-hint')).toHaveTextContent('5 days left');
  });

  it('My status shows no hint when status_until is null', () => {
    myMemberState = {
      data: makeMember({ status: 'available', status_until: null }),
      isLoading: false,
    };
    render(<ReservistDashboard />);
    expect(screen.queryByTestId('status-until-hint')).not.toBeInTheDocument();
  });

  it('My status shows no hint when status_until is more than 30 days out', () => {
    const isoDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const target = new Date(); target.setDate(target.getDate() + 90);
    myMemberState = {
      data: makeMember({ status: 'unavailable', status_until: isoDay(target) }),
      isLoading: false,
    };
    render(<ReservistDashboard />);
    expect(screen.queryByTestId('status-until-hint')).not.toBeInTheDocument();
  });

  // -------- status set-ago hint ----------------------------------------

  it('My status shows a "set N ago" hint sourced from status_set_at', () => {
    const ago = new Date(Date.now() - 3 * 86_400_000).toISOString();
    myMemberState = {
      data: makeMember({ status: 'standby', status_set_at: ago }),
      isLoading: false,
    };
    render(<ReservistDashboard />);
    expect(screen.getByTestId('status-set-ago')).toHaveTextContent(/set\s+3 days ago/);
  });

  it('My status omits the set-ago hint when status_set_at is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    myMemberState = {
      data: makeMember({ status: 'available', status_set_at: future }),
      isLoading: false,
    };
    render(<ReservistDashboard />);
    expect(screen.queryByTestId('status-set-ago')).not.toBeInTheDocument();
  });

  it('My status shows "expired" when status_until is in the past', () => {
    const isoDay = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const target = new Date(); target.setDate(target.getDate() - 2);
    myMemberState = {
      data: makeMember({ status: 'unavailable', status_until: isoDay(target) }),
      isLoading: false,
    };
    render(<ReservistDashboard />);
    expect(screen.getByTestId('status-until-hint')).toHaveTextContent('expired');
  });
});
