import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Team } from '../src/lib/types';
import type { SessionUser } from '../src/lib/auth';

// Mock the two upstream modules before importing the provider so the
// provider captures the mocked references. `useAuth` only contributes
// `user?.id`, and `useTeamsForMember` is a React Query hook whose
// `.data` field the provider reads — the rest of the query object is
// unused, so a minimal shape is enough.
const authState: { user: SessionUser | null } = { user: { id: 'm-self', name: 'Self' } };
const teamsState: { data: Team[] | undefined } = { data: undefined };

vi.mock('../src/lib/auth', () => ({
  useAuth: () => ({ user: authState.user }),
}));
vi.mock('../src/lib/queries', () => ({
  useTeamsForMember: (memberId: string | undefined) => {
    void memberId;
    return teamsState;
  },
}));

import { TeamProvider, useActiveTeam } from '../src/lib/team-context';

// Must match team-context.tsx KEY const — duplicated on purpose so a
// rename in the production module breaks this test loudly instead of
// silently passing against a fresh localStorage.
const KEY = 'reservist.activeTeam';

function makeTeam(id: string, name = id): Team {
  return {
    id,
    project_id: 'p-1',
    division_id: 'd-1',
    name,
    crest: '',
    invite_code: null,
    invite_expires_at: null,
    established: null,
    member_count: 0,
    commander_count: 0,
    project_name: 'Project',
    show_unit_schedule: true,
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <TeamProvider>{children}</TeamProvider>;
}

function resetState() {
  localStorage.clear();
  authState.user = { id: 'm-self', name: 'Self' };
  teamsState.data = undefined;
}

describe('TeamProvider', () => {
  beforeEach(resetState);
  afterEach(resetState);

  it('exposes team=null + teams=[] while teams.data is undefined (loading)', () => {
    teamsState.data = undefined;
    const { result } = renderHook(() => useActiveTeam(), { wrapper });
    expect(result.current.team).toBeNull();
    expect(result.current.teams).toEqual([]);
  });

  it('exposes team=null + teams=[] when the member belongs to no teams', () => {
    teamsState.data = [];
    const { result } = renderHook(() => useActiveTeam(), { wrapper });
    expect(result.current.team).toBeNull();
    expect(result.current.teams).toEqual([]);
  });

  it('auto-picks the first team and persists it when localStorage is empty', async () => {
    const teams = [makeTeam('t-a', 'Alpha'), makeTeam('t-b', 'Bravo')];
    teamsState.data = teams;
    const { result } = renderHook(() => useActiveTeam(), { wrapper });
    await waitFor(() => expect(result.current.team?.id).toBe('t-a'));
    expect(result.current.teams).toEqual(teams);
    expect(localStorage.getItem(KEY)).toBe('t-a');
  });

  it('rehydrates the active team from localStorage on mount', async () => {
    localStorage.setItem(KEY, 't-b');
    teamsState.data = [makeTeam('t-a'), makeTeam('t-b'), makeTeam('t-c')];
    const { result } = renderHook(() => useActiveTeam(), { wrapper });
    await waitFor(() => expect(result.current.team?.id).toBe('t-b'));
    // The effect must NOT clobber the valid stored id with the first team.
    expect(localStorage.getItem(KEY)).toBe('t-b');
  });

  it('auto-corrects a stale stored id that is no longer in the teams list', async () => {
    // Simulates a member who was removed from team t-ghost between sessions —
    // the provider must fall back to the first team they currently belong to
    // rather than leaving `team=null` forever.
    localStorage.setItem(KEY, 't-ghost');
    teamsState.data = [makeTeam('t-a'), makeTeam('t-b')];
    const { result } = renderHook(() => useActiveTeam(), { wrapper });
    await waitFor(() => expect(result.current.team?.id).toBe('t-a'));
    expect(localStorage.getItem(KEY)).toBe('t-a');
  });

  it('setTeamId switches the active team and persists the new id', async () => {
    const teams = [makeTeam('t-a'), makeTeam('t-b')];
    teamsState.data = teams;
    const { result } = renderHook(() => useActiveTeam(), { wrapper });
    await waitFor(() => expect(result.current.team?.id).toBe('t-a'));
    act(() => { result.current.setTeamId('t-b'); });
    expect(result.current.team?.id).toBe('t-b');
    expect(localStorage.getItem(KEY)).toBe('t-b');
  });

  it('useActiveTeam throws a clear error when called outside the provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() => renderHook(() => useActiveTeam())).toThrow(/useActiveTeam outside TeamProvider/);
    } finally {
      consoleError.mockRestore();
    }
  });
});
