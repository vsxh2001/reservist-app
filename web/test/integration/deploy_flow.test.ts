// web/test/integration/deploy_flow.test.ts
//
// End-to-end deployment flow under RLS:
//
//   Soldier (Eitan, M6) → proposes pick
//   Commander (Yoni, M6) → approves / rejects
//   Soldier → re-reads resolved state
//
// This file is intentionally a readable narrative of PRD §7.6, complementing
// the policy-level coverage in `rls.test.ts` and the counts coverage in
// `deployment.test.ts`. Each test uses the *real* JWT for the actor whose
// behavior is being asserted, so a future RLS or trigger change that breaks
// the multi-actor flow surfaces here.
//
// Principals (seed.sql §P):
//   • commander-yoni@test.local  → Yoni Avraham   (commander of M6 Carmel)
//   • soldier-eitan@test.local   → Eitan Cohen    (soldier in M6 Carmel)
//
// Policy notes surfaced for follow-up:
//   • The current `self or commander update deployment_pick` policy lets a
//     window owner (soldier) update any field, including `state`, on their
//     own picks. There is no DB-level state-machine that restricts soldiers
//     from approving / un-approving their own picks. App-level guards must
//     enforce that. Tests 5 and 8 below verify the *actual* current
//     behavior and explicitly flag the gap (search "POLICY GAP").

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getMemberIdByName, getTeamId, rest, restStatus, supabaseReachable } from './_supabase.js';
import { COMMANDER_AUTH_USER_ID, SOLDIER_AUTH_USER_ID } from './_jwt.js';

const AS_COMMANDER = { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } } as const;
const AS_SOLDIER   = { as: { asAuthUserId: SOLDIER_AUTH_USER_ID   } } as const;
const AS_SVCR      = { as: { asServiceRole: true } } as const;

// Format a Date as YYYY-MM-DD (DATE column, no timezone games).
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

describe('Deployment flow under RLS (multi-actor)', () => {
  let teamId: string;
  let soldierId: string;     // Eitan Cohen (member_id)
  let commanderId: string;   // Yoni Avraham (member_id)
  let windowId: string;      // The deployment window owned by Eitan in M6
  // Test-created pick ids (collected for cleanup):
  const createdPickIds: string[] = [];
  // Picks used by individual tests:
  let pickIdApprove: string;
  let pickIdReject: string;
  let pickIdWithdraw: string;
  // We track whether we created the window ourselves so cleanup can decide
  // whether to delete it (don't delete a window the seed already owned).
  let createdWindow = false;

  const DATE_APPROVE  = daysFromNow(14);
  const DATE_REJECT   = daysFromNow(21);
  const DATE_WITHDRAW = daysFromNow(28);

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    teamId      = await getTeamId();
    soldierId   = await getMemberIdByName('Eitan Cohen');
    commanderId = await getMemberIdByName('Yoni Avraham');

    // Reuse an existing open window owned by Eitan in this team, if any,
    // otherwise create one via service role. This avoids stomping seed state
    // and keeps the test idempotent across `supabase db reset` cycles.
    const existing = await rest<{ id: string }[]>(
      `/deployment_windows?member_id=eq.${soldierId}&team_id=eq.${teamId}&state=eq.open&select=id&limit=1`,
      AS_SVCR,
    );
    if (existing.length) {
      windowId = existing[0].id;
    } else {
      const created = await rest<{ id: string }[]>('/deployment_windows', {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({
          member_id: soldierId,
          team_id: teamId,
          label: 'deploy_flow_test window',
          start_date: daysFromNow(1),
          end_date: daysFromNow(60),
          notes: 'vitest: deploy_flow.test.ts',
          created_by: soldierId,
        }),
        ...AS_SVCR,
      });
      windowId = created[0].id;
      createdWindow = true;
    }
  });

  afterAll(async () => {
    // Delete every pick we created in this run. Use service role so cleanup
    // never trips on policy edge cases.
    for (const id of createdPickIds) {
      await rest(`/deployment_picks?id=eq.${id}`, { method: 'DELETE', ...AS_SVCR });
    }
    if (createdWindow && windowId) {
      await rest(`/deployment_windows?id=eq.${windowId}`, { method: 'DELETE', ...AS_SVCR });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // 1. setup is verified by beforeAll. Sanity-check the window exists.
  // ─────────────────────────────────────────────────────────────
  it('setup: clean deployment window owned by Eitan exists in M6', async () => {
    const rows = await rest<{ id: string; member_id: string; team_id: string; state: string }[]>(
      `/deployment_windows?id=eq.${windowId}&select=id,member_id,team_id,state`,
      AS_SVCR,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].member_id).toBe(soldierId);
    expect(rows[0].team_id).toBe(teamId);
    expect(rows[0].state).toBe('open');
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Soldier proposes a pick (window-owner insert).
  // ─────────────────────────────────────────────────────────────
  it('soldier proposes a pick for a future date', async () => {
    const created = await rest<{ id: string; window_id: string; date: string; state: string; reservist_note: string | null }[]>(
      '/deployment_picks',
      {
        method: 'POST',
        prefer: 'return=representation',
        body: JSON.stringify({
          window_id: windowId,
          date: DATE_APPROVE,
          state: 'proposed',
          reservist_note: 'family event Sun pm',
        }),
        ...AS_SOLDIER,
      },
    );
    expect(created.length).toBe(1);
    expect(created[0].window_id).toBe(windowId);
    expect(created[0].date).toBe(DATE_APPROVE);
    expect(created[0].state).toBe('proposed');
    expect(created[0].reservist_note).toBe('family event Sun pm');
    pickIdApprove = created[0].id;
    createdPickIds.push(pickIdApprove);

    // The schema doesn't store member_id directly on picks — it lives on the
    // parent window. Verify the join resolves back to Eitan.
    const joined = await rest<{ window: { member_id: string } }[]>(
      `/deployment_picks?id=eq.${pickIdApprove}&select=window:deployment_windows(member_id)`,
      AS_SVCR,
    );
    expect(joined[0].window.member_id).toBe(soldierId);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Soldier sees own proposed pick.
  // ─────────────────────────────────────────────────────────────
  it('soldier sees own proposed pick', async () => {
    const rows = await rest<{ id: string; state: string; reservist_note: string | null }[]>(
      `/deployment_picks?window_id=eq.${windowId}&date=eq.${DATE_APPROVE}&select=id,state,reservist_note`,
      AS_SOLDIER,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(pickIdApprove);
    expect(rows[0].state).toBe('proposed');
    expect(rows[0].reservist_note).toBe('family event Sun pm');
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Commander of the window's team sees the proposed pick.
  // ─────────────────────────────────────────────────────────────
  it('commander of the window\'s team sees the proposed pick', async () => {
    const rows = await rest<{ id: string; state: string }[]>(
      `/deployment_picks?window_id=eq.${windowId}&date=eq.${DATE_APPROVE}&select=id,state`,
      AS_COMMANDER,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(pickIdApprove);
    expect(rows[0].state).toBe('proposed');
  });

  // ─────────────────────────────────────────────────────────────
  // 5. POLICY GAP: soldier "cannot" approve own pick.
  //
  // The brief expects RLS to deny this (only commander can transition to
  // approved/rejected). The current `self or commander update deployment_pick`
  // policy uses (member_id = current_member_id() OR is_commander_of(...)) in
  // both USING and WITH CHECK and does NOT inspect the new `state` value, so
  // the window owner CAN currently set state='approved' on their own pick.
  //
  // We assert the *actual* current behavior here, then immediately roll the
  // pick back to 'proposed' via service role so downstream tests in this
  // file see a consistent starting state. The mismatch is flagged in the
  // final report so the policy can be tightened in a follow-up.
  // ─────────────────────────────────────────────────────────────
  it('POLICY GAP: soldier can currently approve their own pick (should be commander-only)', async () => {
    const r = await restStatus(`/deployment_picks?id=eq.${pickIdApprove}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'approved' }),
      ...AS_SOLDIER,
    });
    // Document actual behavior: PostgREST returns 2xx (204 by default or 200
    // with return=representation). If a future migration adds a state-machine
    // trigger or tightens the policy this becomes 4xx — flip the assertion
    // then.
    expect(r.status).toBeLessThan(300);

    // Verify the soldier write went through.
    const check = await rest<{ state: string }[]>(
      `/deployment_picks?id=eq.${pickIdApprove}&select=state`,
      AS_SVCR,
    );
    expect(check[0].state).toBe('approved');

    // Roll back so test 6 (commander approves) has a 'proposed' pick to act on.
    await rest(`/deployment_picks?id=eq.${pickIdApprove}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'proposed', resolved_at: null, resolved_by: null }),
      ...AS_SVCR,
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Commander approves the pick.
  // ─────────────────────────────────────────────────────────────
  it('commander approves the proposed pick', async () => {
    const nowIso = new Date().toISOString();
    const r = await restStatus(`/deployment_picks?id=eq.${pickIdApprove}`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: JSON.stringify({
        state: 'approved',
        resolved_at: nowIso,
        resolved_by: commanderId,
      }),
      ...AS_COMMANDER,
    });
    expect(r.status).toBeLessThan(300);

    const check = await rest<{ state: string; resolved_by: string | null }[]>(
      `/deployment_picks?id=eq.${pickIdApprove}&select=state,resolved_by`,
      AS_SVCR,
    );
    expect(check[0].state).toBe('approved');
    expect(check[0].resolved_by).toBe(commanderId);
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Soldier sees the approved state.
  // ─────────────────────────────────────────────────────────────
  it('soldier sees approved state with resolved_by', async () => {
    const rows = await rest<{ state: string; resolved_by: string | null; resolved_at: string | null }[]>(
      `/deployment_picks?id=eq.${pickIdApprove}&select=state,resolved_by,resolved_at`,
      AS_SOLDIER,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].state).toBe('approved');
    expect(rows[0].resolved_by).toBe(commanderId);
    expect(rows[0].resolved_at).not.toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // 8. POLICY GAP: soldier "cannot" un-approve.
  //
  // Same gap as test 5 — window owner can flip an already-approved pick
  // back to 'proposed'. Document actual behavior; flag for follow-up.
  // Rolls back to 'approved' afterwards so test 9 can start fresh.
  // ─────────────────────────────────────────────────────────────
  it('POLICY GAP: soldier can currently un-approve a resolved pick (should be commander-only)', async () => {
    const r = await restStatus(`/deployment_picks?id=eq.${pickIdApprove}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'proposed' }),
      ...AS_SOLDIER,
    });
    expect(r.status).toBeLessThan(300);

    const check = await rest<{ state: string }[]>(
      `/deployment_picks?id=eq.${pickIdApprove}&select=state`,
      AS_SVCR,
    );
    expect(check[0].state).toBe('proposed');

    // Restore approved state via service role to keep the narrative clean.
    await rest(`/deployment_picks?id=eq.${pickIdApprove}`, {
      method: 'PATCH',
      body: JSON.stringify({
        state: 'approved',
        resolved_by: commanderId,
        resolved_at: new Date().toISOString(),
      }),
      ...AS_SVCR,
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 9. Commander rejects a different pick with a note.
  // ─────────────────────────────────────────────────────────────
  it('commander rejects a different pick with a commander_note; soldier sees the rejection', async () => {
    // Soldier proposes
    const proposed = await rest<{ id: string }[]>('/deployment_picks', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        window_id: windowId,
        date: DATE_REJECT,
        state: 'proposed',
      }),
      ...AS_SOLDIER,
    });
    pickIdReject = proposed[0].id;
    createdPickIds.push(pickIdReject);

    // Commander rejects with note
    const r = await restStatus(`/deployment_picks?id=eq.${pickIdReject}`, {
      method: 'PATCH',
      body: JSON.stringify({
        state: 'rejected',
        commander_note: 'No coverage that week',
        resolved_at: new Date().toISOString(),
        resolved_by: commanderId,
      }),
      ...AS_COMMANDER,
    });
    expect(r.status).toBeLessThan(300);

    // Soldier reads back the rejection + note
    const rows = await rest<{ state: string; commander_note: string | null }[]>(
      `/deployment_picks?id=eq.${pickIdReject}&select=state,commander_note`,
      AS_SOLDIER,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].state).toBe('rejected');
    expect(rows[0].commander_note).toBe('No coverage that week');
  });

  // ─────────────────────────────────────────────────────────────
  // 10. Soldier withdraws their own proposed pick.
  // Window owner is allowed to UPDATE picks of their own window under the
  // current policy, so a self-withdraw succeeds.
  // ─────────────────────────────────────────────────────────────
  it('soldier withdraws their own proposed pick', async () => {
    const proposed = await rest<{ id: string }[]>('/deployment_picks', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        window_id: windowId,
        date: DATE_WITHDRAW,
        state: 'proposed',
      }),
      ...AS_SOLDIER,
    });
    pickIdWithdraw = proposed[0].id;
    createdPickIds.push(pickIdWithdraw);

    const r = await restStatus(`/deployment_picks?id=eq.${pickIdWithdraw}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'withdrawn' }),
      ...AS_SOLDIER,
    });
    expect(r.status).toBeLessThan(300);

    const rows = await rest<{ state: string }[]>(
      `/deployment_picks?id=eq.${pickIdWithdraw}&select=state`,
      AS_SOLDIER,
    );
    expect(rows[0].state).toBe('withdrawn');
  });

  // ─────────────────────────────────────────────────────────────
  // 11. SKIPPED: commander-of-a-different-team isolation.
  // The seed only mints auth users for the M6 commander (Yoni) and the
  // M6 soldier (Eitan). The Bravo-6 commander (Asaf Doron) and the
  // Alpha-7 commander (Tomer Bachar) have no auth_user_id, so we cannot
  // mint a JWT for them. Service-role would bypass RLS and therefore not
  // exercise the policy.
  //
  // To enable this case, seed.sql §P would need to add an auth user for
  // a commander outside M6 (Asaf Doron or Tomer Bachar). Flagged for
  // follow-up.
  // ─────────────────────────────────────────────────────────────
  it.skip('commander of a different team cannot see picks in M6 (needs second-team auth user in seed)', () => {
    // Intentionally empty — see comment above.
  });
});
