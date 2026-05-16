// web/test/integration/deployment.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMemberIdByName, getUnitId, rest, supabaseReachable } from './_supabase';

describe('Deployment windows + picks', () => {
  let unitId: string;
  let memberId: string;
  let actorId: string;
  let windowId: string;

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    unitId = await getUnitId();
    memberId = await getMemberIdByName('Eitan Cohen');
    actorId = await getMemberIdByName('Yoni Avraham');
    const created = await rest<{ id: string }[]>('/deployment_windows', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        member_id: memberId, unit_id: unitId,
        label: 'Integration test window',
        start_date: '2030-01-01', end_date: '2030-01-15',
        notes: 'vitest', created_by: actorId,
      }),
    });
    windowId = created[0].id;
  });

  afterAll(async () => {
    await rest(`/deployment_windows?id=eq.${windowId}`, { method: 'DELETE' });
    // Clean up any activity_log rows we generated
    await rest(`/activity_log?unit_id=eq.${unitId}&actor_id=eq.${actorId}&verb=in.(approved%20deployment%20day,rejected%20deployment%20day,recorded%20deployment%20day,opened%20deployment%20window,edited%20deployment%20window,closed%20deployment%20window)`, { method: 'DELETE' });
  });

  it('view returns zero counts initially', async () => {
    const rows = await rest<{ proposed_count: number; approved_count: number; rejected_count: number; withdrawn_count: number }[]>(
      `/deployment_windows_view?id=eq.${windowId}&select=proposed_count,approved_count,rejected_count,withdrawn_count`,
    );
    expect(rows[0]).toEqual({ proposed_count: 0, approved_count: 0, rejected_count: 0, withdrawn_count: 0 });
  });

  it('proposes a pick and view increments proposed_count', async () => {
    await rest('/deployment_picks', {
      method: 'POST',
      body: JSON.stringify({ window_id: windowId, date: '2030-01-05', state: 'proposed' }),
    });
    const rows = await rest<{ proposed_count: number }[]>(`/deployment_windows_view?id=eq.${windowId}&select=proposed_count`);
    expect(rows[0].proposed_count).toBe(1);
  });

  it('rejects unique constraint on (window_id, date)', async () => {
    let threw = false;
    try {
      await rest('/deployment_picks', {
        method: 'POST',
        body: JSON.stringify({ window_id: windowId, date: '2030-01-05', state: 'proposed' }),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  it('approves the pick and counts shift', async () => {
    await rest(`/deployment_picks?window_id=eq.${windowId}&date=eq.2030-01-05`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'approved', resolved_at: new Date().toISOString(), resolved_by: actorId }),
    });
    const rows = await rest<{ proposed_count: number; approved_count: number }[]>(
      `/deployment_windows_view?id=eq.${windowId}&select=proposed_count,approved_count`,
    );
    expect(rows[0]).toEqual({ proposed_count: 0, approved_count: 1 });
  });

  it('closing a window preserves picks', async () => {
    await rest(`/deployment_windows?id=eq.${windowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'closed' }),
    });
    const picks = await rest<{ state: string }[]>(
      `/deployment_picks?window_id=eq.${windowId}&select=state`,
    );
    expect(picks.length).toBeGreaterThan(0);
  });

  it('CHECK constraint rejects end_date before start_date', async () => {
    let threw = false;
    try {
      await rest('/deployment_windows', {
        method: 'POST',
        body: JSON.stringify({
          member_id: memberId, unit_id: unitId, label: 'bad',
          start_date: '2030-02-01', end_date: '2030-01-01', created_by: actorId,
        }),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
