import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface SessionUser {
  id: string;
  name: string;
}

interface AuthCtx {
  user: SessionUser | null;
  login: (u: SessionUser) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = 'reservist.mockUser';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  }, [user]);

  return (
    <Ctx.Provider value={{ user, login: setUser, logout: () => setUser(null) }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
