/**
 * AuthProvider tests.
 *
 * `AuthProvider` (`web/src/lib/auth.tsx`) is the auth hinge every
 * screen reads from via `useAuth`. Every component test mocks it
 * (LoginPicker, App, Sidebar, Roster, etc.), but the provider itself
 * was previously untested.
 *
 * Auth tightening / multi-team work (PRD §7.1 and the deferred RLS
 * follow-ups) will need to touch this hinge. Same precedent as #160
 * (TeamProvider) and #159 (PrefsProvider): pin the small, previously-
 * untested provider before the swap so the contract is explicit and
 * any regression is loud.
 *
 * The mock branch is gated by a *module-level* constant
 *   const MOCK_FLAG = import.meta.env.VITE_MOCK_AUTH === '1';
 * so we need to stub the env BEFORE importing the provider. Same
 * `vi.stubEnv` + `vi.resetModules` + dynamic-import pattern as
 * `LoginPicker.test.tsx`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Session, User as AuthUser } from '@supabase/supabase-js';
import type { ComponentType, ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

interface MemberRow {
  id: string;
  name: string;
}

let getSessionResult: { data: { session: Session | null } } = {
  data: { session: null },
};
let memberLookupResult: {
  data: MemberRow | null;
  error: { message: string } | null;
} = { data: null, error: null };

// Capture the most recent onAuthStateChange listener so a test can fire
// a synthetic SIGNED_IN / SIGNED_OUT and observe applySession running.
let lastAuthCallback:
  | ((event: string, session: Session | null) => void)
  | null = null;
const unsubscribeSpy = vi.fn();

const signInWithOAuthSpy = vi.fn();
const signInWithPasswordSpy = vi.fn();
const signOutSpy = vi.fn();
const fromSpy = vi.fn();

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve(getSessionResult),
      onAuthStateChange: (
        cb: (event: string, session: Session | null) => void,
      ) => {
        lastAuthCallback = cb;
        return { data: { subscription: { unsubscribe: unsubscribeSpy } } };
      },
      signInWithOAuth: (...args: unknown[]) => {
        signInWithOAuthSpy(...args);
        return Promise.resolve({ error: null });
      },
      signInWithPassword: (...args: unknown[]) => {
        signInWithPasswordSpy(...args);
        return Promise.resolve({ error: null });
      },
      signOut: () => {
        signOutSpy();
        return Promise.resolve({ error: null });
      },
    },
    from: (table: string) => {
      fromSpy(table);
      // The provider only reads `members` via .select().eq().maybeSingle().
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve(memberLookupResult),
          }),
        }),
      };
    },
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_KEY = 'reservist.mockUser';

function makeAuthUser(id: string): AuthUser {
  // The provider only reads `session.user.id`. Cast the minimal shape
  // through `unknown` so the test isn't on the hook for the full
  // `AuthUser` field set, which is large and unrelated.
  return { id } as unknown as AuthUser;
}

function makeSession(userId: string): Session {
  return {
    access_token: 'tok',
    refresh_token: 'rtok',
    expires_in: 3600,
    expires_at: 0,
    token_type: 'bearer',
    user: makeAuthUser(userId),
  } as unknown as Session;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AuthModule {
  AuthProvider: ComponentType<{ children: ReactNode }>;
  useAuth: () => {
    user: { id: string; name: string } | null;
    authUser: AuthUser | null;
    status: 'loading' | 'no-session' | 'no-link' | 'linked';
    signInWithGoogle: () => Promise<void>;
    signInAsMock: (u: {
      id: string;
      name: string;
      email: string;
    }) => Promise<void>;
    signOut: () => Promise<void>;
    refreshLink: () => Promise<void>;
  };
}

/**
 * Import `auth` with `VITE_MOCK_AUTH` stubbed to `flag`. The provider
 * captures `MOCK_FLAG` at module-load time, so we must reset the module
 * registry between tests for the next dynamic import to re-evaluate it.
 */
async function loadAuth(flag: '1' | '0' | undefined): Promise<AuthModule> {
  if (flag === undefined) {
    vi.stubEnv('VITE_MOCK_AUTH', '');
  } else {
    vi.stubEnv('VITE_MOCK_AUTH', flag);
  }
  vi.resetModules();
  return (await import('../src/lib/auth')) as unknown as AuthModule;
}

function resetState() {
  localStorage.clear();
  getSessionResult = { data: { session: null } };
  memberLookupResult = { data: null, error: null };
  lastAuthCallback = null;
  unsubscribeSpy.mockReset();
  signInWithOAuthSpy.mockReset();
  signInWithPasswordSpy.mockReset();
  signOutSpy.mockReset();
  fromSpy.mockReset();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthProvider', () => {
  beforeEach(resetState);
  afterEach(() => {
    vi.unstubAllEnvs();
    resetState();
  });

  it('starts in status="loading" before getSession resolves', async () => {
    // The initial useState value is observable before the mount effect
    // has a chance to await getSession(). renderHook returns synchronously,
    // so reading `result.current` immediately captures the pre-effect state.
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    expect(result.current.status).toBe('loading');
    expect(result.current.user).toBeNull();
    expect(result.current.authUser).toBeNull();
    // Drain the in-flight effect so the unresolved Promise doesn't leak
    // into the next test.
    await waitFor(() => expect(result.current.status).not.toBe('loading'));
  });

  it('resolves to status="no-session" when there is no session and no mock', async () => {
    getSessionResult = { data: { session: null } };
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-session'));
    expect(result.current.user).toBeNull();
    expect(result.current.authUser).toBeNull();
  });

  it('ignores a stored mock user when VITE_MOCK_AUTH !== "1"', async () => {
    localStorage.setItem(
      MOCK_KEY,
      JSON.stringify({ id: 'm-mock', name: 'Mock' }),
    );
    getSessionResult = { data: { session: null } };
    const mod = await loadAuth('0');
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    // Without the mock flag the stored shim is ignored — guards production
    // builds against a leftover dev localStorage acting as a fake login.
    await waitFor(() => expect(result.current.status).toBe('no-session'));
    expect(result.current.user).toBeNull();
  });

  it('uses a stored mock user when VITE_MOCK_AUTH === "1" and no session', async () => {
    localStorage.setItem(
      MOCK_KEY,
      JSON.stringify({ id: 'm-mock', name: 'Mock Member' }),
    );
    getSessionResult = { data: { session: null } };
    const mod = await loadAuth('1');
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('linked'));
    expect(result.current.user).toEqual({ id: 'm-mock', name: 'Mock Member' });
    // authUser stays null — the mock path is a shim, not a real GoTrue session.
    expect(result.current.authUser).toBeNull();
  });

  it('resolves to status="linked" when the session links to a members row', async () => {
    getSessionResult = { data: { session: makeSession('au-1') } };
    memberLookupResult = { data: { id: 'm-1', name: 'Real Member' }, error: null };
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('linked'));
    expect(result.current.user).toEqual({ id: 'm-1', name: 'Real Member' });
    expect(result.current.authUser?.id).toBe('au-1');
    expect(fromSpy).toHaveBeenCalledWith('members');
  });

  it('resolves to status="no-link" when the session has no matching members row', async () => {
    // This is the post-OAuth-pre-claim state: a real GoTrue session exists
    // but the auth.users.id has not yet been linked to a `members` row.
    // The ClaimProfileScreen relies on this branch to render.
    getSessionResult = { data: { session: makeSession('au-orphan') } };
    memberLookupResult = { data: null, error: null };
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-link'));
    expect(result.current.user).toBeNull();
    expect(result.current.authUser?.id).toBe('au-orphan');
  });

  it('onAuthStateChange callback transitions linked → no-session on sign-out event', async () => {
    getSessionResult = { data: { session: makeSession('au-1') } };
    memberLookupResult = { data: { id: 'm-1', name: 'Real' }, error: null };
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('linked'));
    // Now fire SIGNED_OUT through the listener the provider registered.
    expect(lastAuthCallback).not.toBeNull();
    await act(async () => {
      lastAuthCallback!('SIGNED_OUT', null);
    });
    await waitFor(() => expect(result.current.status).toBe('no-session'));
    expect(result.current.user).toBeNull();
    expect(result.current.authUser).toBeNull();
  });

  it('unsubscribes the onAuthStateChange listener on unmount', async () => {
    getSessionResult = { data: { session: null } };
    const mod = await loadAuth(undefined);
    const { result, unmount } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-session'));
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('signInWithGoogle calls signInWithOAuth with redirectTo=origin', async () => {
    getSessionResult = { data: { session: null } };
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-session'));
    await act(async () => {
      await result.current.signInWithGoogle();
    });
    expect(signInWithOAuthSpy).toHaveBeenCalledTimes(1);
    expect(signInWithOAuthSpy).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  });

  it('signInAsMock is a no-op + warns when VITE_MOCK_AUTH !== "1"', async () => {
    getSessionResult = { data: { session: null } };
    const mod = await loadAuth('0');
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-session'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await act(async () => {
        await result.current.signInAsMock({
          id: 'm-x',
          name: 'X',
          email: 'x@test.local',
        });
      });
      expect(signInWithPasswordSpy).not.toHaveBeenCalled();
      expect(localStorage.getItem(MOCK_KEY)).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('signInAsMock calls signInWithPassword and writes the mock localStorage key when MOCK_FLAG is set', async () => {
    getSessionResult = { data: { session: null } };
    const mod = await loadAuth('1');
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-session'));
    await act(async () => {
      await result.current.signInAsMock({
        id: 'm-mock',
        name: 'Mocky',
        email: 'mocky@test.local',
      });
    });
    // The seeded `@test.local` users all share the literal password
    // 'unused' (seed.sql §P). Re-asserting that contract here means a
    // future rename / rotation breaks loudly instead of leaving a silent
    // dev-only auth hole.
    expect(signInWithPasswordSpy).toHaveBeenCalledWith({
      email: 'mocky@test.local',
      password: 'unused',
    });
    // Belt-and-suspenders fallback so the mock survives a late
    // onAuthStateChange (see auth.tsx comment).
    expect(JSON.parse(localStorage.getItem(MOCK_KEY)!)).toEqual({
      id: 'm-mock',
      name: 'Mocky',
    });
  });

  it('signOut clears the mock key, calls supabase.auth.signOut, and resets to no-session', async () => {
    localStorage.setItem(
      MOCK_KEY,
      JSON.stringify({ id: 'm-mock', name: 'Mock' }),
    );
    getSessionResult = { data: { session: null } };
    const mod = await loadAuth('1');
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('linked'));
    await act(async () => {
      await result.current.signOut();
    });
    expect(localStorage.getItem(MOCK_KEY)).toBeNull();
    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('no-session');
    expect(result.current.user).toBeNull();
    expect(result.current.authUser).toBeNull();
  });

  it('refreshLink is a no-op when there is no authUser', async () => {
    getSessionResult = { data: { session: null } };
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-session'));
    fromSpy.mockReset();
    await act(async () => {
      await result.current.refreshLink();
    });
    // No members lookup fires when authUser is null — guards against
    // refreshLink() being called from a stale ClaimProfileScreen after
    // sign-out.
    expect(fromSpy).not.toHaveBeenCalled();
    expect(result.current.status).toBe('no-session');
  });

  it('refreshLink stays no-link when the members row still does not exist', async () => {
    // The retry-before-claim race: the user taps "refresh" while the
    // members insert hasn't committed yet. The provider must keep
    // status='no-link' rather than silently flipping to 'linked'.
    getSessionResult = { data: { session: makeSession('au-1') } };
    memberLookupResult = { data: null, error: null };
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-link'));
    await act(async () => {
      await result.current.refreshLink();
    });
    expect(result.current.status).toBe('no-link');
    expect(result.current.user).toBeNull();
  });

  it('treats a PostgREST error from the members lookup the same as no row (status="no-link")', async () => {
    // resolveMember collapses both `{data: null, error}` and
    // `{data: null, error: null}` into `null`. When deferred RLS work
    // lands, the SELECT may start returning {error: '...'} for callers
    // whose auth.users.id has no policy match; the provider must still
    // land at status='no-link' rather than throwing or stalling.
    getSessionResult = { data: { session: makeSession('au-rls') } };
    memberLookupResult = { data: null, error: { message: 'rls denied' } };
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-link'));
    expect(result.current.user).toBeNull();
    expect(result.current.authUser?.id).toBe('au-rls');
  });

  it('refreshLink promotes no-link → linked when the members row now exists', async () => {
    // Start with a session but no linked members row: ClaimProfileScreen
    // is the post-OAuth landing state. After the user claims a profile,
    // refreshLink() re-runs the lookup; the next response carries the row.
    getSessionResult = { data: { session: makeSession('au-1') } };
    memberLookupResult = { data: null, error: null };
    const mod = await loadAuth(undefined);
    const { result } = renderHook(() => mod.useAuth(), {
      wrapper: ({ children }) => <mod.AuthProvider>{children}</mod.AuthProvider>,
    });
    await waitFor(() => expect(result.current.status).toBe('no-link'));
    // Simulate the claim flow having inserted the link row.
    memberLookupResult = { data: { id: 'm-1', name: 'Now Linked' }, error: null };
    await act(async () => {
      await result.current.refreshLink();
    });
    expect(result.current.status).toBe('linked');
    expect(result.current.user).toEqual({ id: 'm-1', name: 'Now Linked' });
  });

  it('useAuth throws a clear error when called outside the provider', async () => {
    const mod = await loadAuth(undefined);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => mod.useAuth())).toThrow(
        /useAuth outside AuthProvider/,
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
