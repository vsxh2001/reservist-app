import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { useTeamsForMember } from './queries';
import type { Team } from './types';

interface TeamCtx {
  team: Team | null;
  teams: Team[];
  setTeamId: (id: string) => void;
}

const Ctx = createContext<TeamCtx | null>(null);
const KEY = 'reservist.activeTeam';

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const teams = useTeamsForMember(user?.id);
  const [activeId, setActive] = useState<string | null>(
    () => localStorage.getItem(KEY),
  );

  useEffect(() => {
    if (!teams.data || teams.data.length === 0) return;
    if (activeId && teams.data.some((t) => t.id === activeId)) return;
    const first = teams.data[0].id;
    setActive(first);
    localStorage.setItem(KEY, first);
  }, [teams.data, activeId]);

  const setTeamId = (id: string) => {
    setActive(id);
    localStorage.setItem(KEY, id);
  };

  const team = (teams.data ?? []).find((t) => t.id === activeId) ?? null;

  return (
    <Ctx.Provider value={{ team, teams: teams.data ?? [], setTeamId }}>
      {children}
    </Ctx.Provider>
  );
}

export function useActiveTeam(): TeamCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useActiveTeam outside TeamProvider');
  return v;
}
