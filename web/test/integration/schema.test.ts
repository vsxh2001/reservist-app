import { beforeAll, describe, expect, it } from 'vitest';
import { ANON_KEY, getUnitId, rest, supabaseReachable } from './_supabase';

describe('Supabase schema contracts', () => {
  let unitId: string;

  beforeAll(async () => {
    if (!ANON_KEY) {
      console.warn('VITE_SUPABASE_ANON_KEY missing — integration tests will fail');
    }
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable at the configured URL — start it first with `supabase start`.');
    }
    unitId = await getUnitId();
  });

  it('units view returns the seeded Mahlaka 6', async () => {
    const rows = await rest<{ id: string; name: string; short_name: string; crest: string; invite_code: string }[]>(
      '/units?select=id,name,short_name,crest,invite_code',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].crest).toBe('M6');
    expect(rows[0].short_name).toBe('Mahlaka 6');
    expect(typeof rows[0].invite_code).toBe('string');
  });

  it('members_view returns 24 members with leveled skills', async () => {
    const rows = await rest<{ name: string; status: string; skills: { name: string; level: string }[] }[]>(
      `/members_view?unit_id=eq.${unitId}&select=name,status,skills`,
    );
    expect(rows.length).toBe(24);
    const yoni = rows.find((r) => r.name === 'Yoni Avraham');
    expect(yoni).toBeDefined();
    expect(yoni!.status).toBe('available');
    const ops = yoni!.skills.find((s) => s.name === 'Night Ops');
    expect(ops?.level).toBe('senior');
    // Every skill row carries a level
    for (const r of rows) {
      for (const s of r.skills) {
        expect(['junior', 'intermediate', 'senior']).toContain(s.level);
      }
    }
  });

  it('slots_view returns slots with min_level on each required skill', async () => {
    const rows = await rest<{ title: string; urgent: boolean; state: string; filled: number; needed: number; assignee_ids: string[]; skills: { name: string; min_level: string }[] }[]>(
      `/slots_view?unit_id=eq.${unitId}&select=title,urgent,state,filled,needed,assignee_ids,skills`,
    );
    const urgent = rows.find((r) => r.title.startsWith('Northern QRF'));
    expect(urgent).toBeDefined();
    expect(urgent!.urgent).toBe(true);
    expect(urgent!.state).toBe('published');
    expect(urgent!.assignee_ids.length).toBe(urgent!.filled);
    const nightOps = urgent!.skills.find((s) => s.name === 'Night Ops');
    expect(nightOps?.min_level).toBe('senior');
  });

  it('roles and skills lists exist for the unit', async () => {
    const roles = await rest<{ name: string }[]>(`/roles?unit_id=eq.${unitId}&select=name&order=sort_idx`);
    const skills = await rest<{ name: string }[]>(`/skills?unit_id=eq.${unitId}&select=name&order=name`);
    expect(roles.length).toBeGreaterThan(0);
    expect(skills.length).toBeGreaterThan(0);
    expect(skills.find((s) => s.name === 'Night Ops')).toBeDefined();
  });
});
