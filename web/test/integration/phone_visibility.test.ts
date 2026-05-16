// web/test/integration/phone_visibility.test.ts
//
// PRD §7.2 — phone visibility opt-in.
//
// Scenarios verified against members_view:
//   1. Soldier A sees own phone unconditionally (regardless of opt-in flag).
//   2. Soldier B (same division, soldier role) sees A's phone as null when
//      A.phone_visible_to_peers = false.
//   3. Soldier B sees A's phone when A.phone_visible_to_peers = true.
//   4. Soldier C (different division) NEVER sees A's phone even when A opted in
//      — division boundary is enforced ahead of opt-in.
//   5. Commander sees phones for team members regardless of opt-in.
//
// Test fixtures:
//   - Soldier A = Eitan Cohen (seeded, auth = b0000000-…, division Mahlaka 6).
//   - Soldier B = freshly inserted member in Mahlaka 6, backed by a brand-new
//     auth user. Not assigned to any team — division-scope read is what we
//     verify here; team membership is irrelevant for phone visibility.
//   - Soldier C = freshly inserted member in a brand-new division, backed by a
//     brand-new auth user. Demonstrates cross-division isolation.
//   - Commander = Yoni Avraham (seeded, auth = a0000000-…, also division admin).
//
// Both new auth users + members + division are created in beforeAll via
// the service role / GoTrue admin API and torn down in afterAll, leaving
// no state behind for sibling test files.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getDivisionId,
  getMemberIdByName,
  rest,
  restStatus,
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  supabaseReachable,
} from './_supabase.js';
import {
  COMMANDER_AUTH_USER_ID,
  SOLDIER_AUTH_USER_ID,
} from './_jwt.js';

const AS_SOLDIER_A = { as: { asAuthUserId: SOLDIER_AUTH_USER_ID } } as const;
const AS_COMMANDER = { as: { asAuthUserId: COMMANDER_AUTH_USER_ID } } as const;
const AS_SVCR = { as: { asServiceRole: true } } as const;

// Brand-new auth users — created in beforeAll, deleted in afterAll.
const SOLDIER_B_AUTH_USER_ID = 'd0000000-0000-0000-0000-0000000000b1';
const SOLDIER_C_AUTH_USER_ID = 'd0000000-0000-0000-0000-0000000000c1';
const AS_SOLDIER_B = { as: { asAuthUserId: SOLDIER_B_AUTH_USER_ID } } as const;
const AS_SOLDIER_C = { as: { asAuthUserId: SOLDIER_C_AUTH_USER_ID } } as const;

async function adminCall(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined ?? {}),
    },
  });
}

async function createAuthUser(authUserId: string, email: string): Promise<void> {
  const res = await adminCall('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      id: authUserId,
      email,
      password: 'unused-pwd-12345',
      email_confirm: true,
    }),
  });
  if (!res.ok && res.status !== 422 /* already exists */) {
    throw new Error(
      `Failed to create auth user ${authUserId}: ${res.status} ${await res.text()}`,
    );
  }
}

async function deleteAuthUser(authUserId: string): Promise<void> {
  await adminCall(`/auth/v1/admin/users/${authUserId}`, { method: 'DELETE' });
}

describe('members_view phone visibility opt-in (PRD §7.2)', () => {
  let m6DivisionId: string;
  let soldierAId: string;       // Eitan Cohen (seeded, M6)
  let originalAOptIn: boolean;
  let soldierBMemberId: string; // freshly inserted M6 member
  let foreignDivisionId: string;
  let soldierCMemberId: string; // freshly inserted member in foreign division

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    m6DivisionId = await getDivisionId();
    soldierAId = await getMemberIdByName('Eitan Cohen');

    // Capture Soldier A's opt-in flag (defaults to false) so we can restore.
    const aBefore = await rest<{ phone_visible_to_peers: boolean }[]>(
      `/members?id=eq.${soldierAId}&select=phone_visible_to_peers`,
      AS_SVCR,
    );
    originalAOptIn = aBefore[0].phone_visible_to_peers;

    // Create the two synthetic auth users for Soldiers B and C.
    await createAuthUser(SOLDIER_B_AUTH_USER_ID, 'phonevis-b@test.local');
    await createAuthUser(SOLDIER_C_AUTH_USER_ID, 'phonevis-c@test.local');

    // Soldier B — a new member in the same division as Soldier A (M6).
    const memberB = await rest<{ id: string }[]>('/members', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        division_id: m6DivisionId,
        name: 'PhoneVis Same-Division Peer',
        initials: 'PB',
        tone: 1,
        phone: '+972 50-111-2222',
        status: 'available',
        auth_user_id: SOLDIER_B_AUTH_USER_ID,
      }),
      ...AS_SVCR,
    });
    soldierBMemberId = memberB[0].id;

    // Brand-new division for Soldier C (foreign w.r.t. Eitan's M6).
    const div = await rest<{ id: string }[]>('/divisions', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({ name: 'PhoneVis Cross-Division' }),
      ...AS_SVCR,
    });
    foreignDivisionId = div[0].id;

    // Soldier C — a new member in the foreign division.
    const memberC = await rest<{ id: string }[]>('/members', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        division_id: foreignDivisionId,
        name: 'PhoneVis Cross-Division Peer',
        initials: 'PC',
        tone: 2,
        phone: '+972 50-333-4444',
        status: 'available',
        auth_user_id: SOLDIER_C_AUTH_USER_ID,
      }),
      ...AS_SVCR,
    });
    soldierCMemberId = memberC[0].id;
  });

  afterAll(async () => {
    // Restore Soldier A's opt-in to its seed default.
    await restStatus(`/members?id=eq.${soldierAId}`, {
      method: 'PATCH',
      body: JSON.stringify({ phone_visible_to_peers: originalAOptIn }),
      ...AS_SVCR,
    });
    // Delete fresh members.
    if (soldierBMemberId) {
      await restStatus(`/members?id=eq.${soldierBMemberId}`, {
        method: 'DELETE',
        ...AS_SVCR,
      });
    }
    if (soldierCMemberId) {
      await restStatus(`/members?id=eq.${soldierCMemberId}`, {
        method: 'DELETE',
        ...AS_SVCR,
      });
    }
    // Delete the foreign division.
    if (foreignDivisionId) {
      await restStatus(`/divisions?id=eq.${foreignDivisionId}`, {
        method: 'DELETE',
        ...AS_SVCR,
      });
    }
    // Delete the synthetic auth users.
    await deleteAuthUser(SOLDIER_B_AUTH_USER_ID);
    await deleteAuthUser(SOLDIER_C_AUTH_USER_ID);
  });

  // Helper: read Soldier A's row from members_view as a given principal.
  async function readAPhoneAs(opts: { as: { asAuthUserId: string } }): Promise<string | null> {
    const rows = await rest<{ id: string; phone: string | null }[]>(
      `/members_view?id=eq.${soldierAId}&select=id,phone`,
      opts,
    );
    if (rows.length === 0) return null;
    return rows[0].phone;
  }

  async function setAOptIn(value: boolean): Promise<void> {
    await rest(`/members?id=eq.${soldierAId}`, {
      method: 'PATCH',
      body: JSON.stringify({ phone_visible_to_peers: value }),
      ...AS_SVCR,
    });
  }

  it('soldier A sees own phone unconditionally (opt-in OFF)', async () => {
    await setAOptIn(false);
    const phone = await readAPhoneAs(AS_SOLDIER_A);
    expect(phone).toBeTruthy();
  });

  it('soldier B sees A.phone as null when opt-in is OFF', async () => {
    await setAOptIn(false);
    const phone = await readAPhoneAs(AS_SOLDIER_B);
    expect(phone).toBeNull();
  });

  it('soldier B sees A.phone when opt-in is ON', async () => {
    await setAOptIn(true);
    const phone = await readAPhoneAs(AS_SOLDIER_B);
    expect(phone).toBeTruthy();
  });

  it('soldier C (different division) never sees A.phone, even when opt-in is ON', async () => {
    await setAOptIn(true);

    // Soldier C's division_id != Soldier A's division_id, so the RLS
    // policy on `members` filters Eitan out before the view's CASE ever
    // returns him. Result: 0 rows.
    const rows = await rest<{ id: string; phone: string | null }[]>(
      `/members_view?id=eq.${soldierAId}&select=id,phone`,
      AS_SOLDIER_C,
    );
    expect(rows.length).toBe(0);
  });

  it('commander sees A.phone for team members regardless of opt-in', async () => {
    await setAOptIn(false);
    const offPhone = await readAPhoneAs(AS_COMMANDER);
    expect(offPhone).toBeTruthy();

    await setAOptIn(true);
    const onPhone = await readAPhoneAs(AS_COMMANDER);
    expect(onPhone).toBeTruthy();
  });
});
