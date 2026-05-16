// web/test/integration/deployment.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMemberIdByName, getTeamId, rest, supabaseReachable } from './_supabase.js';
import { COMMANDER_AUTH_USER_ID, SOLDIER_AUTH_USER_ID } from './_jwt.js';

describe('Deployment windows + picks', () => {
  let teamId: string;
  let memberId: string;   // Eitan Cohen — the seeded soldier
  let actorId: string;    // Yoni Avraham — the seeded commander
  let windowId: string | undefined;
  let pickId: string | undefined;

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    teamId = await getTeamId();
    memberId = await getMemberIdByName('Eitan Cohen');
    actorId  = await getMemberIdByName('Yoni Avraham');

    // Soldier creates their own deployment window (self = member_id).
    const created = await rest<{ id: string }[]>('/deployment_windows', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        member_id: memberId, team_id: teamId,
        label: 'Integration test window',
        start_date: '2030-01-01', end_date: '2030-01-15',
        notes: 'vitest', created_by: actorId,
      }),
      as: { asAuthUserId: SOLDIER_AUTH_USER_ID },
    });
    windowId = created[0].id;

    // Soldier proposes a pick in their own window.
    const seededPick = await rest<{ id: string }[]>('/deployment_picks', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({ window_id: windowId, date: '2030-01-05', state: 'proposed' }),
      as: { asAuthUserId: SOLDIER_AUTH_USER_ID },
    });
    pickId = seededPick[0].id;
  });

  afterAll(async () => {
    // Service role for cleanup — avoids policy edge cases during teardown.
    if (windowId) {
      await rest(`/deployment_windows?id=eq.${windowId}`, {
        method: 'DELETE',
        as: { asServiceRole: true },
      });
    }
    await rest(`/activity_log?team_id=eq.${teamId}&actor_id=eq.${actorId}&verb=in.(approved%20deployment%20day,rejected%20deployment%20day,recorded%20deployment%20day,opened%20deployment%20window,edited%20deployment%20window,closed%20deployment%20window)`, {
      method: 'DELETE',
      as: { asServiceRole: true },
    });
  });

  it('view reflects seed pick (one proposed) — soldier reads own window', async () => {
    const rows = await rest<{
      proposed_count: number;
      approved_count: number;
      rejected_count: number;
      withdrawn_count: number;
    }[]>(
      `/deployment_windows_view?id=eq.${windowId}&select=proposed_count,approved_count,rejected_count,withdrawn_count`,
      { as: { asAuthUserId: SOLDIER_AUTH_USER_ID } },
    );
    expect(rows[0]).toEqual({ proposed_count: 1, approved_count: 0, rejected_count: 0, withdrawn_count: 0 });
  });

  it('soldier proposes another pick on a different date and view increments proposed_count', async () => {
    await rest('/deployment_picks', {
      method: 'POST',
      body: JSON.stringify({ window_id: windowId, date: '2030-01-06', state: 'proposed' }),
      as: { asAuthUserId: SOLDIER_AUTH_USER_ID },
    });
    const rows = await rest<{ proposed_count: number }[]>(
      `/deployment_windows_view?id=eq.${windowId}&select=proposed_count`,
      { as: { asAuthUserId: SOLDIER_AUTH_USER_ID } },
    );
    expect(rows[0].proposed_count).toBe(2);
  });

  it('rejects unique constraint on (window_id, date)', async () => {
    await expect(rest('/deployment_picks', {
      method: 'POST',
      body: JSON.stringify({ window_id: windowId, date: '2030-01-05', state: 'proposed' }),
      as: { asAuthUserId: SOLDIER_AUTH_USER_ID },
    })).rejects.toThrow();
  });

  it('commander approves the seeded pick and counts shift', async () => {
    await rest(`/deployment_picks?id=eq.${pickId}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'approved', resolved_at: new Date().toISOString(), resolved_by: actorId }),
      as: { asAuthUserId: COMMANDER_AUTH_USER_ID },
    });
    const rows = await rest<{ proposed_count: number; approved_count: number }[]>(
      `/deployment_windows_view?id=eq.${windowId}&select=proposed_count,approved_count`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(rows[0]).toEqual({ proposed_count: 1, approved_count: 1 });
  });

  it('commander closes a window; picks preserve their states', async () => {
    await rest(`/deployment_windows?id=eq.${windowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
      as: { asAuthUserId: COMMANDER_AUTH_USER_ID },
    });
    const picks = await rest<{ date: string; state: string }[]>(
      `/deployment_picks?window_id=eq.${windowId}&select=date,state&order=date`,
      { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } },
    );
    expect(picks.length).toBeGreaterThan(0);
    // Seeded pick is now approved, the other is still proposed.
    expect(picks.find((p) => p.date === '2030-01-05')?.state).toBe('approved');
  });

  it('CHECK constraint rejects end_date before start_date', async () => {
    await expect(rest('/deployment_windows', {
      method: 'POST',
      body: JSON.stringify({
        member_id: memberId, team_id: teamId, label: 'bad',
        start_date: '2030-02-01', end_date: '2030-01-01', created_by: actorId,
      }),
      as: { asAuthUserId: SOLDIER_AUTH_USER_ID },
    })).rejects.toThrow();
  });
});
