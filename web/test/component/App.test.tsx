/**
 * App routing tests.
 *
 * `App.tsx` wires up providers (QueryClient, Prefs, Auth, Team) and a
 * `<Gate />` that picks the top-level screen based on `useAuth().status`:
 *
 *   'loading'    → splash placeholder
 *   'no-session' → <LoginPicker />
 *   'no-link'    → <ClaimProfileScreen />
 *   'linked'     → <RoleRouter /> which inspects useMyMember + useActiveTeam
 *                  to choose Dashboard (commander) vs ReservistDashboard.
 *
 * We mock all child components to simple placeholders so we only assert
 * the routing decision — none of the real screens (with their own data
 * dependencies) are mounted. The `useAuth` / `useMyMember` / `useActiveTeam`
 * hooks are mocked at module-level so providers don't need real backends.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

type AuthStatus = 'loading' | 'no-session' | 'no-link' | 'linked';

interface MockTeam { id: string; name: string }
interface MockMembership { team_id: string; role: 'commander' | 'reservist' }
interface MockMember { id: string; name: string; teams: MockMembership[] }

let authStatus: AuthStatus = 'loading';
let authUserId: string | null = null;
let myMember: { isLoading: boolean; data: MockMember | null } = {
  isLoading: false,
  data: null,
};
let activeTeam: MockTeam | null = null;

vi.mock('../../src/lib/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: authUserId ? { id: authUserId, name: 'Test User' } : null,
    authUser: null,
    status: authStatus,
    signInWithGoogle: vi.fn(),
    signInAsMock: vi.fn(),
    signOut: vi.fn(),
    refreshLink: vi.fn(),
  }),
}));

vi.mock('../../src/lib/prefs', () => ({
  PrefsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/lib/team-context', () => ({
  TeamProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useActiveTeam: () => ({
    team: activeTeam,
    teams: activeTeam ? [activeTeam] : [],
    setTeamId: vi.fn(),
  }),
}));

vi.mock('../../src/lib/queries', () => ({
  useMyMember: () => myMember,
}));

vi.mock('../../src/components/LoginPicker', () => ({
  LoginPicker: () => <div data-testid="login-picker">LoginPicker</div>,
}));

vi.mock('../../src/components/ClaimProfileScreen', () => ({
  ClaimProfileScreen: () => <div data-testid="claim-screen">ClaimProfileScreen</div>,
}));

vi.mock('../../src/components/JoinScreen', () => ({
  JoinScreen: ({ code }: { code: string }) => (
    <div data-testid="join-screen">JoinScreen:{code}</div>
  ),
}));

vi.mock('../../src/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../src/Dashboard', () => ({
  Dashboard: ({ onSwitchToReservist }: { onSwitchToReservist?: () => void }) => (
    <div data-testid="dashboard">
      Dashboard
      {onSwitchToReservist && (
        <button type="button" onClick={onSwitchToReservist}>
          To Reservist
        </button>
      )}
    </div>
  ),
}));

vi.mock('../../src/ReservistDashboard', () => ({
  ReservistDashboard: ({ onSwitchView }: { onSwitchView?: () => void }) => (
    <div data-testid="reservist-dashboard">
      ReservistDashboard
      {onSwitchView && (
        <button type="button" onClick={onSwitchView}>
          To Commander
        </button>
      )}
    </div>
  ),
}));

// Tanstack QueryClientProvider in App.tsx is harmless; we keep the real one.

import App from '../../src/App';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetState() {
  authStatus = 'loading';
  authUserId = null;
  myMember = { isLoading: false, data: null };
  activeTeam = null;
  // App.tsx's Gate reads window.location to detect /join — make sure tests
  // start on '/' with no query so we hit the auth-status branch.
  window.history.replaceState({}, '', '/');
  sessionStorage.clear();
}

const TEAM_A: MockTeam = { id: 'team-a', name: 'Carmel' };

const COMMANDER_MEMBER: MockMember = {
  id: 'member-1',
  name: 'Cmdr Tester',
  teams: [{ team_id: 'team-a', role: 'commander' }],
};

const RESERVIST_MEMBER: MockMember = {
  id: 'member-2',
  name: 'Pvt Tester',
  teams: [{ team_id: 'team-a', role: 'reservist' }],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('App routing (Gate)', () => {
  beforeEach(() => {
    resetState();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("status='loading' shows a splash and no top-level screen", () => {
    authStatus = 'loading';
    render(<App />);

    expect(screen.getByText(/Loading…/i)).toBeInTheDocument();
    expect(screen.queryByTestId('login-picker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('claim-screen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reservist-dashboard')).not.toBeInTheDocument();
  });

  it("status='no-session' renders LoginPicker", () => {
    authStatus = 'no-session';
    render(<App />);

    expect(screen.getByTestId('login-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('claim-screen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reservist-dashboard')).not.toBeInTheDocument();
  });

  it("status='no-link' renders ClaimProfileScreen", () => {
    authStatus = 'no-link';
    render(<App />);

    expect(screen.getByTestId('claim-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('login-picker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reservist-dashboard')).not.toBeInTheDocument();
  });

  it("status='linked' + commander on active team renders Dashboard", () => {
    authStatus = 'linked';
    authUserId = 'member-1';
    myMember = { isLoading: false, data: COMMANDER_MEMBER };
    activeTeam = TEAM_A;
    render(<App />);

    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('reservist-dashboard')).not.toBeInTheDocument();
  });

  it("status='linked' + reservist-only renders ReservistDashboard (no commander switch)", () => {
    authStatus = 'linked';
    authUserId = 'member-2';
    myMember = { isLoading: false, data: RESERVIST_MEMBER };
    activeTeam = TEAM_A;
    render(<App />);

    expect(screen.getByTestId('reservist-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    // Non-commanders don't get the back-to-commander button.
    expect(screen.queryByRole('button', { name: /To Commander/i })).not.toBeInTheDocument();
  });

  it("commander can toggle to reservist view and back via the App-level switches", async () => {
    authStatus = 'linked';
    authUserId = 'member-1';
    myMember = { isLoading: false, data: COMMANDER_MEMBER };
    activeTeam = TEAM_A;
    render(<App />);

    // Starts on Dashboard.
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();

    // Click the prop the App injected ("See reservist view") — stub button.
    await userEvent.click(screen.getByRole('button', { name: /To Reservist/i }));
    expect(screen.getByTestId('reservist-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();

    // The reservist view, for a commander, exposes the switch-back.
    await userEvent.click(screen.getByRole('button', { name: /To Commander/i }));
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('reservist-dashboard')).not.toBeInTheDocument();
  });

  it("status='linked' but profile still loading shows a profile-loading placeholder", () => {
    authStatus = 'linked';
    authUserId = 'member-1';
    myMember = { isLoading: true, data: null };
    activeTeam = TEAM_A;
    render(<App />);

    expect(screen.getByText(/Loading profile…/i)).toBeInTheDocument();
    expect(screen.queryByTestId('dashboard')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reservist-dashboard')).not.toBeInTheDocument();
  });
});
