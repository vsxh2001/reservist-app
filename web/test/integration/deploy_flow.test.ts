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
// State-machine enforcement (PRD §7.6):
//   A BEFORE UPDATE trigger (enforce_deployment_pick_state_machine) ensures:
//     • Commanders of the window's team may perform any state transition.
//     • Window owners (soldiers) may only do proposed → withdrawn.
//     • All other state transitions by soldiers are blocked (errcode 42501).
//   Tests 5 and 8 assert the new gate — these were formerly flagged POLICY GAP.

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
  // 5. Soldier cannot approve own pick.
  //
  // The state-machine trigger (enforce_deployment_pick_state_machine) blocks
  // any state transition from a non-commander caller except proposed→withdrawn.
  // Attempting proposed→approved as the window owner must fail with errcode
  // 42501 ("insufficient_privilege") surfaced by PostgREST as a 4xx response.
  // ─────────────────────────────────────────────────────────────
  it('soldier cannot approve own pick', async () => {
    const r = await restStatus(`/deployment_picks?id=eq.${pickIdApprove}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'approved' }),
      ...AS_SOLDIER,
    });
    // Trigger raises errcode 42501 → PostgREST returns 403 or 400.
    expect(r.status).toBeGreaterThanOrEqual(400);

    // Verify the pick state was not changed.
    const check = await rest<{ state: string }[]>(
      `/deployment_picks?id=eq.${pickIdApprove}&select=state`,
      AS_SVCR,
    );
    expect(check[0].state).toBe('proposed');
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
  // 8. Soldier cannot un-approve a resolved pick.
  //
  // After a commander approves, the trigger blocks the soldier from flipping
  // the pick back to 'proposed' (approved→proposed is not in the allowed
  // soldier transition set). The pick must remain approved.
  // ─────────────────────────────────────────────────────────────
  it('soldier cannot un-approve resolved pick', async () => {
    const r = await restStatus(`/deployment_picks?id=eq.${pickIdApprove}`, {
      method: 'PATCH',
      body: JSON.stringify({ state: 'proposed' }),
      ...AS_SOLDIER,
    });
    // Trigger raises errcode 42501 → PostgREST returns 403 or 400.
    expect(r.status).toBeGreaterThanOrEqual(400);

    // Verify approved state is preserved.
    const check = await rest<{ state: string }[]>(
      `/deployment_picks?id=eq.${pickIdApprove}&select=state`,
      AS_SVCR,
    );
    expect(check[0].state).toBe('approved');
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
  // 11. Commander-of-a-different-team isolation.
  // The Alpha-7 commander (Tomer Bachar, Mahlaka 7) is in a different
  // *division* than M6. RLS `members_view` scoping uses
  // current_division_id(), so Tomer's queries against M6's deployment
  // tables should return empty / be denied.
  //
  // Bravo-6 commander (Asaf Doron) is in the *same* division as M6 but a
  // different team — that's also a useful case for the slot/pick UPDATE
  // policies. Asserted via UPDATE attempt below.
  // ─────────────────────────────────────────────────────────────
  it('Alpha-7 commander (different division) cannot read M6 picks', async () => {
    const AS_ALPHA = { as: { asAuthUserId: 'e0000000-0000-0000-0000-000000000001' } } as const;
    const rows = await rest<{ id: string }[]>(
      `/deployment_picks?window_id=eq.${windowId}&select=id`,
      AS_ALPHA,
    );
    // Cross-division: RLS should hide every row.
    expect(rows).toHaveLength(0);
  });

  it('Bravo-6 commander (same division, different team) cannot read M6 picks', async () => {
    const AS_BRAVO = { as: { asAuthUserId: 'd0000000-0000-0000-0000-000000000001' } } as const;
    const rows = await rest<{ id: string }[]>(
      `/deployment_picks?window_id=eq.${windowId}&select=id`,
      AS_BRAVO,
    );
    // Same division but caller is not a commander of M6's team — RLS should hide.
    expect(rows).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────
  // 12. Service-role bypass.
  // The state-machine trigger fires for every UPDATE regardless of role,
  // but service_role represents admin tooling / server-side scripts that
  // must be able to force-correct picks. After 20260517031647 the trigger
  // short-circuits when current_setting('request.jwt.claim.role') is
  // 'service_role', allowing transitions a soldier would normally be
  // blocked from (e.g. withdrawn → approved).
  // ─────────────────────────────────────────────────────────────
  it('service role can force-transition withdrawn → approved (admin tooling bypass)', async () => {
    // pickIdWithdraw was withdrawn by the soldier in test 10. Service role
    // re-opens it to approved. Without the new bypass this raises 42501.
    const r = await restStatus(`/deployment_picks?id=eq.${pickIdWithdraw}`, {
      method: 'PATCH',
      body: JSON.stringify({
        state: 'approved',
        resolved_at: new Date().toISOString(),
        resolved_by: commanderId,
      }),
      ...AS_SVCR,
    });
    expect(r.status).toBeLessThan(300);

    const rows = await rest<{ state: string }[]>(
      `/deployment_picks?id=eq.${pickIdWithdraw}&select=state`,
      AS_SVCR,
    );
    expect(rows[0].state).toBe('approved');
  });

  // ─────────────────────────────────────────────────────────────
  // 13. Division-admin bypass.
  // A division admin who is NOT a commander of the window's team should
  // still be able to transition pick states for any team in the division.
  // We promote Asaf (Bravo-6 commander, same division as M6) to division
  // admin for the duration of this test, then demote afterwards.
  // ─────────────────────────────────────────────────────────────
  it('division admin can transition picks across teams in their division', async () => {
    const ASAF_AUTH_ID = 'd0000000-0000-0000-0000-000000000001';
    const AS_ASAF = { as: { asAuthUserId: ASAF_AUTH_ID } } as const;
    // Resolve Asaf's member row id and verify he's not an M6 commander.
    const asaf = await rest<{ id: string }[]>(
      `/members?auth_user_id=eq.${ASAF_AUTH_ID}&select=id&limit=1`,
      AS_SVCR,
    );
    expect(asaf.length).toBe(1);
    const asafMemberId = asaf[0].id;

    // Create a fresh proposed pick to operate on (using a date that is
    // unused by earlier tests to avoid the (window_id, date) unique).
    const FRESH_DATE = daysFromNow(35);
    const created = await rest<{ id: string }[]>('/deployment_picks', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        window_id: windowId,
        date: FRESH_DATE,
        state: 'proposed',
      }),
      ...AS_SOLDIER,
    });
    const pickId = created[0].id;
    createdPickIds.push(pickId);

    // Pre-condition is covered by test 11 (Bravo commander can't even read
    // M6 picks). Skip a redundant trigger-block assertion here — RLS would
    // hide the row anyway, returning 204 with 0-rows-updated rather than
    // raising the trigger.

    // Promote Asaf to division admin (service role bypasses RLS on members).
    await rest(`/members?id=eq.${asafMemberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_division_admin: true }),
      ...AS_SVCR,
    });

    try {
      // Now the transition should succeed via the division-admin bypass.
      const ok = await restStatus(`/deployment_picks?id=eq.${pickId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          state: 'approved',
          resolved_at: new Date().toISOString(),
          resolved_by: asafMemberId,
        }),
        ...AS_ASAF,
      });
      expect(ok.status).toBeLessThan(300);

      const check = await rest<{ state: string; resolved_by: string | null }[]>(
        `/deployment_picks?id=eq.${pickId}&select=state,resolved_by`,
        AS_SVCR,
      );
      expect(check[0].state).toBe('approved');
      expect(check[0].resolved_by).toBe(asafMemberId);
    } finally {
      // Demote regardless of test outcome — keeps seed state pristine for
      // the next file in the integration run.
      await rest(`/members?id=eq.${asafMemberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_division_admin: false }),
        ...AS_SVCR,
      });
    }
  });
});
