/**
 * LoginPicker component tests.
 *
 * LoginPicker is the pre-auth landing screen. It always shows a
 * "Continue with Google" CTA, and — when the build was started with
 * VITE_MOCK_AUTH=1 — it also shows a dev-only mock-member picker
 * backed by the `list_mock_auth_members` RPC.
 *
 * The RPC switch (vs. the old `members_view` query) was forced by the
 * 20260516192409__rls_tightening migration: `members_view` is now
 * security_invoker and the `members` SELECT policy is `to authenticated`
 * only, so anon callers see zero rows. The new RPC is SECURITY DEFINER
 * and filters to `@test.local` auth users so production data never leaks.
 *
 * The mock-auth branch is gated by a *module-level* constant
 *   const MOCK_FLAG = import.meta.env.VITE_MOCK_AUTH === '1';
 * so we need to stub the env BEFORE importing the component. We do this
 * by resetting the module registry per-test and dynamic-importing inside
 * each case.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

interface MockMember {
  id: string;
  name: string;
  initials: string;
  tone: number;
  division_id: string;
  auth_user_id: string;
  email: string;
}

let membersResult: { data: MockMember[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};

const rpcSpy = vi.fn();

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: (name: string) => {
      rpcSpy(name);
      if (name === 'list_mock_auth_members') return Promise.resolve(membersResult);
      throw new Error(`Unexpected RPC in LoginPicker test: ${name}`);
    },
  },
}));

const signInWithGoogleMock = vi.fn(async () => {});
const signInAsMockMock = vi.fn(async () => {});

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: null,
    authUser: null,
    status: 'no-session',
    signInWithGoogle: signInWithGoogleMock,
    signInAsMock: signInAsMockMock,
    signOut: vi.fn(),
    refreshLink: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COMMANDER: MockMember = {
  id: 'm-cmdr',
  name: 'Carmela Commander',
  initials: 'CC',
  tone: 2,
  division_id: 'd-1',
  auth_user_id: 'au-cmdr',
  email: 'commander-carmela@test.local',
};

const RESERVIST: MockMember = {
  id: 'm-res',
  name: 'Ronen Reservist',
  initials: 'RR',
  tone: 1,
  division_id: 'd-1',
  auth_user_id: 'au-res',
  email: 'soldier-ronen@test.local',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Import LoginPicker with VITE_MOCK_AUTH stubbed to `flag`. Because
 * MOCK_FLAG is captured at module-load time, we must reset the module
 * registry between tests so the next dynamic import re-evaluates the
 * top-level `import.meta.env.VITE_MOCK_AUTH === '1'` check.
 */
async function loadLoginPicker(flag: '1' | '0' | undefined): Promise<ComponentType> {
  if (flag === undefined) {
    vi.stubEnv('VITE_MOCK_AUTH', '');
  } else {
    vi.stubEnv('VITE_MOCK_AUTH', flag);
  }
  vi.resetModules();
  const mod = await import('../../src/components/LoginPicker');
  return mod.LoginPicker;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginPicker', () => {
  beforeEach(() => {
    signInWithGoogleMock.mockReset();
    signInWithGoogleMock.mockImplementation(async () => {});
    signInAsMockMock.mockReset();
    signInAsMockMock.mockImplementation(async () => {});
    rpcSpy.mockReset();
    membersResult = { data: [], error: null };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('renders the "Continue with Google" CTA', async () => {
    const LoginPicker = await loadLoginPicker(undefined);
    render(<LoginPicker />);
    expect(screen.getByRole('button', { name: /Continue with Google/i })).toBeInTheDocument();
  });

  it('clicking the Google button calls auth.signInWithGoogle()', async () => {
    const LoginPicker = await loadLoginPicker(undefined);
    render(<LoginPicker />);

    await userEvent.click(screen.getByRole('button', { name: /Continue with Google/i }));

    await waitFor(() => {
      expect(signInWithGoogleMock).toHaveBeenCalledTimes(1);
    });
  });

  it('hides the mock-auth picker when VITE_MOCK_AUTH !== "1"', async () => {
    const LoginPicker = await loadLoginPicker('0');
    render(<LoginPicker />);

    // Helper copy that is only rendered in the non-mock branch.
    expect(screen.getByText(/First sign-in opens a screen to claim your member profile/i)).toBeInTheDocument();

    // Mock-only landmarks must be absent.
    expect(screen.queryByText(/dev — mock login/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Search by name or role/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue as mock/i })).not.toBeInTheDocument();

    // And the list RPC must not have run.
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('shows the mock-auth picker when VITE_MOCK_AUTH === "1"', async () => {
    membersResult = { data: [COMMANDER, RESERVIST], error: null };
    const LoginPicker = await loadLoginPicker('1');
    render(<LoginPicker />);

    // Section banner + search input are gated on the mock flag.
    expect(screen.getByText(/dev — mock login/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search by name or role/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue as mock/i })).toBeInTheDocument();

    // The RPC fetch fires on mount.
    await waitFor(() => {
      expect(rpcSpy).toHaveBeenCalledWith('list_mock_auth_members');
    });

    // Both members render once the promise resolves.
    expect(await screen.findByText('Carmela Commander')).toBeInTheDocument();
    expect(screen.getByText('Ronen Reservist')).toBeInTheDocument();
  });

  it('picking a mock member and confirming calls auth.signInAsMock with email', async () => {
    membersResult = { data: [COMMANDER, RESERVIST], error: null };
    const LoginPicker = await loadLoginPicker('1');
    render(<LoginPicker />);

    // Wait for the row to render — confirms the .then() has resolved.
    const row = await screen.findByText('Ronen Reservist');

    // Continue button starts disabled until a row is picked.
    const continueBtn = screen.getByRole('button', { name: /Continue as mock/i });
    expect(continueBtn).toBeDisabled();

    await userEvent.click(row);
    expect(continueBtn).not.toBeDisabled();

    await userEvent.click(continueBtn);

    await waitFor(() => {
      expect(signInAsMockMock).toHaveBeenCalledTimes(1);
    });
    expect(signInAsMockMock).toHaveBeenCalledWith({
      id: RESERVIST.id,
      name: RESERVIST.name,
      email: RESERVIST.email,
    });
  });

  it('disables the Google button while signInWithGoogle is in flight', async () => {
    // Hold the promise open so we can observe the busy state.
    let resolveGoogle!: () => void;
    signInWithGoogleMock.mockImplementation(
      () => new Promise<void>((res) => { resolveGoogle = res; }),
    );

    const LoginPicker = await loadLoginPicker(undefined);
    render(<LoginPicker />);

    const btn = screen.getByRole('button', { name: /Continue with Google/i });
    expect(btn).not.toBeDisabled();

    await userEvent.click(btn);

    // While the OAuth call is pending, the button stays disabled.
    await waitFor(() => {
      expect(btn).toBeDisabled();
    });

    // Resolve the call → busy flips back off.
    await act(async () => {
      resolveGoogle();
    });
    await waitFor(() => {
      expect(btn).not.toBeDisabled();
    });
  });
});
