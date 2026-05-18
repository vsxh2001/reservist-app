import { beforeAll, describe, expect, it } from 'vitest';
import {
  ANON_KEY,
  getDivisionId,
  getTeamId,
  rest,
  supabaseReachable,
} from './_supabase.js';
import { COMMANDER_AUTH_USER_ID } from './_jwt.js';

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

  it('divisions table returns the seeded Mahlaka 6 (commander JWT)', async () => {
    const rows = await rest<{ id: string; name: string }[]>(
      '/divisions?select=id,name',
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Mahlaka 6');
  });

  it('teams_view returns the M6 team with member + commander counts (commander JWT)', async () => {
    const rows = await rest<{
      id: string;
      name: string;
      project_name: string;
      crest: string;
      invite_code: string | null;
      invite_expires_at: string | null;
      member_count: number;
      commander_count: number;
    }[]>(
      '/teams_view?select=id,name,project_name,crest,invite_code,invite_expires_at,member_count,commander_count',
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const m6 = rows.find((r) => r.crest === 'M6');
    expect(m6).toBeDefined();
    expect(m6!.project_name).toBe('Carmel');
    // member_count is at least 24 (concurrent tests may transiently add members).
    expect(m6!.member_count).toBeGreaterThanOrEqual(24);
    expect(m6!.commander_count).toBe(2);
    // Seed backfills invite_expires_at = now() + 7d for any team with an invite_code.
    expect(m6!.invite_code).toBeTruthy();
    expect(m6!.invite_expires_at).toBeTruthy();
    expect(Date.parse(m6!.invite_expires_at!)).toBeGreaterThan(Date.now());
  });

  it('members_view returns the seeded members with leveled skills + teams array (commander JWT)', async () => {
    const rows = await rest<{
      name: string;
      status: string;
      teams: { team_id: string; role: string }[];
      skills: { name: string; level: string }[];
    }[]>(
      `/members_view?division_id=eq.${divisionId}&select=name,status,teams,skills`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(rows.length).toBeGreaterThanOrEqual(24);
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

  it('slots_view returns single-assignee slots (commander JWT)', async () => {
    const rows = await rest<{
      title: string;
      urgent: boolean;
      state: string;
      assignee_id: string | null;
    }[]>(
      `/slots_view?team_id=eq.${teamId}&select=title,urgent,state,assignee_id`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    const urgent = rows.find((r) => r.title.startsWith('Northern QRF'));
    expect(urgent).toBeDefined();
    expect(urgent!.urgent).toBe(true);
    expect(urgent!.state).toBe('published');
    // Seed assigns Yoni Avraham to the Northern QRF slot.
    expect(urgent!.assignee_id).not.toBeNull();
  });

  it('skills list exists for the division (commander JWT)', async () => {
    const skills = await rest<{ name: string }[]>(
      `/skills?division_id=eq.${divisionId}&select=name&order=name`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.find((s) => s.name === 'Night Ops')).toBeDefined();
  });

  it('team_members has at least 24 rows with 2 commanders for the seeded team (commander JWT)', async () => {
    const rows = await rest<{ role: string }[]>(
      `/team_members?team_id=eq.${teamId}&select=role`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    // At least 24 (concurrent tests may transiently add/remove members).
    expect(rows.length).toBeGreaterThanOrEqual(24);
    expect(rows.filter((r) => r.role === 'commander').length).toBe(2);
  });
});
