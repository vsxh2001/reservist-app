import { beforeAll, describe, expect, it } from 'vitest';
import { ANON_KEY, getDivisionId, getTeamId, rest, supabaseReachable } from './_supabase';

describe('Supabase schema contracts', () => {
  let divisionId: string;
  let teamId: string;

  beforeAll(async () => {
    if (!ANON_KEY) {
      console.warn('VITE_SUPABASE_ANON_KEY missing — integration tests will fail');
    }
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable at the configured URL — start it first with `supabase start`.');
    }
    divisionId = await getDivisionId();
    teamId = await getTeamId();
  });

  it('divisions table returns the seeded Mahlaka 6', async () => {
    const rows = await rest<{ id: string; name: string }[]>('/divisions?select=id,name');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Mahlaka 6');
  });

  it('teams_view returns the seeded team with member + commander counts', async () => {
    const rows = await rest<{ id: string; name: string; project_name: string; crest: string; invite_code: string | null; member_count: number; commander_count: number }[]>(
      '/teams_view?select=id,name,project_name,crest,invite_code,member_count,commander_count',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].crest).toBe('M6');
    expect(rows[0].project_name).toBe('Carmel');
    expect(rows[0].member_count).toBe(24);
    expect(rows[0].commander_count).toBe(2);
  });

  it('members_view returns 24 members with leveled skills + teams array', async () => {
    const rows = await rest<{ name: string; status: string; teams: { team_id: string; role: string }[]; skills: { name: string; level: string }[] }[]>(
      `/members_view?division_id=eq.${divisionId}&select=name,status,teams,skills`,
    );
    expect(rows.length).toBe(24);
    const yoni = rows.find((r) => r.name === 'Yoni Avraham');
    expect(yoni).toBeDefined();
    expect(yoni!.status).toBe('available');
    expect(yoni!.teams.some((t) => t.team_id === teamId && t.role === 'commander')).toBe(true);
    const ops = yoni!.skills.find((s) => s.name === 'Night Ops');
    expect(ops?.level).toBe('senior');
    for (const r of rows) {
      for (const s of r.skills) {
        expect(['junior', 'intermediate', 'senior']).toContain(s.level);
      }
    }
  });

  it('slots_view returns slots with min_level on each required skill', async () => {
    const rows = await rest<{ title: string; urgent: boolean; state: string; filled: number; needed: number; assignee_ids: string[]; skills: { name: string; min_level: string }[] }[]>(
      `/slots_view?team_id=eq.${teamId}&select=title,urgent,state,filled,needed,assignee_ids,skills`,
    );
    const urgent = rows.find((r) => r.title.startsWith('Northern QRF'));
    expect(urgent).toBeDefined();
    expect(urgent!.urgent).toBe(true);
    expect(urgent!.state).toBe('published');
    expect(urgent!.assignee_ids.length).toBe(urgent!.filled);
    const nightOps = urgent!.skills.find((s) => s.name === 'Night Ops');
    expect(nightOps?.min_level).toBe('senior');
  });

  it('skills list exists for the division', async () => {
    const skills = await rest<{ name: string }[]>(`/skills?division_id=eq.${divisionId}&select=name&order=name`);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.find((s) => s.name === 'Night Ops')).toBeDefined();
  });

  it('team_members has 24 rows with 2 commanders for the seeded team', async () => {
    const rows = await rest<{ role: string }[]>(`/team_members?team_id=eq.${teamId}&select=role`);
    expect(rows.length).toBe(24);
    expect(rows.filter((r) => r.role === 'commander').length).toBe(2);
  });
});
