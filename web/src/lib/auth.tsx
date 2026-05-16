import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User as AuthUser } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface SessionUser {
  id: string;        // members.id (not auth.users.id)
  name: string;
}

/**
 * Argument shape for the dev-only mock-auth picker. We need the email
 * to drive GoTrue's `signInWithPassword` against the seeded `@test.local`
 * auth users (password is the literal string `'unused'`, set in seed.sql §P).
 * Producing a real session — not just a localStorage shim — is required so
 * the RLS-tightened queries downstream actually return data.
 */
export interface MockSignInUser {
  id: string;
  name: string;
  email: string;
}

export type AuthStatus = 'loading' | 'no-session' | 'no-link' | 'linked';

interface AuthCtx {
  user: SessionUser | null;
  authUser: AuthUser | null;
  status: AuthStatus;
  signInWithGoogle: () => Promise<void>;
  signInAsMock: (u: MockSignInUser) => Promise<void>;
  signOut: () => Promise<void>;
  /** Forces a re-resolution of the auth.users → members link (call after claim). */
  refreshLink: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const MOCK_KEY = 'reservist.mockUser';
const MOCK_FLAG = import.meta.env.VITE_MOCK_AUTH === '1';
/**
 * Password baked into seed.sql §P for every `@test.local` auth user:
 *   encrypted_password = crypt('unused', gen_salt('bf'))
 * Used only by the dev-only mock picker. Never used in production.
 */
const MOCK_PASSWORD = 'unused';

async function resolveMember(authUserId: string): Promise<SessionUser | null> {
  const { data, error } = await supabase
    .from('members')
    .select('id, name')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id as string, name: data.name as string };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Mock path (only active when VITE_MOCK_AUTH=1) — keeps the dev picker working.
  const loadMock = (): SessionUser | null => {
    if (!MOCK_FLAG) return null;
    try {
      const raw = localStorage.getItem(MOCK_KEY);
      return raw ? JSON.parse(raw) as SessionUser : null;
    } catch {
      return null;
    }
  };

  const applySession = async (session: Session | null) => {
    if (!session) {
      setAuthUser(null);
      const mock = loadMock();
      if (mock) {
        setUser(mock);
        setStatus('linked');
      } else {
        setUser(null);
        setStatus('no-session');
      }
      return;
    }
    setAuthUser(session.user);
    const linked = await resolveMember(session.user.id);
    if (linked) {
      setUser(linked);
      setStatus('linked');
    } else {
      setUser(null);
      setStatus('no-link');
    }
  };

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data } = await supabase.auth.getSession();
      await applySession(data.session);
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        void applySession(session);
      });
      unsub = () => sub.subscription.unsubscribe();
    })();
    return () => { if (unsub) unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  };

  const signInAsMock = async (u: MockSignInUser) => {
    if (!MOCK_FLAG) {
      console.warn('Mock sign-in attempted without VITE_MOCK_AUTH=1');
      return;
    }
    // Drive a real GoTrue session so RLS-protected queries actually return
    // rows. The seeded `@test.local` users use password 'unused' (seed.sql §P).
    const { error } = await supabase.auth.signInWithPassword({
      email: u.email,
      password: MOCK_PASSWORD,
    });
    if (error) {
      console.error('Mock sign-in failed:', error);
      throw error;
    }
    // The onAuthStateChange listener wired up in the effect will call
    // applySession() and resolve the members row → status='linked'.
    // We still write the mock localStorage key so the flow has a
    // belt-and-suspenders fallback if the listener fires late.
    localStorage.setItem(MOCK_KEY, JSON.stringify({ id: u.id, name: u.name }));
  };

  const signOut = async () => {
    localStorage.removeItem(MOCK_KEY);
    await supabase.auth.signOut();
    setUser(null);
    setAuthUser(null);
    setStatus('no-session');
  };

  const refreshLink = async () => {
    if (!authUser) return;
    const linked = await resolveMember(authUser.id);
    if (linked) {
      setUser(linked);
      setStatus('linked');
    } else {
      setStatus('no-link');
    }
  };

  return (
    <Ctx.Provider value={{
      user, authUser, status,
      signInWithGoogle, signInAsMock, signOut, refreshLink,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
