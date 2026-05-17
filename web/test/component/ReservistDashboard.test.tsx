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

vi.mock('../../src/lib/queries', () => ({
  useMyMember: () => myMemberState,
  useMySlots: () => mySlotsState,
  useMyDeploymentWindows: () => myWindowsState,
  useSelfUpdateStatus: () => selfUpdateStatusMut,
  useSetPhoneVisibility: () => setPhoneVisibilityMut,
  // DeploymentPickScreen imports these from queries too.
  useDeploymentPicks: () => ({ data: [], isLoading: false, error: null }),
  useProposeDayPick: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useWithdrawDayPick: () => ({ mutateAsync: vi.fn(), isPending: false }),
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

  it('SlotRow without detail (no notes, no skills, needed=0) is not interactive', () => {
    mySlotsState = {
      data: [
        makeSlot({
          id: 's-bare',
          title: 'Bare patrol',
          notes: null,
          needed: 0,
          filled: 0,
          skills: [],
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
});
