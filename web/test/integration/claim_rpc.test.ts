// web/test/integration/claim_rpc.test.ts
//
// Integration tests for the claim-profile RPCs introduced by
// 20260516194414__claim_profile_rpc.sql. The tightened RLS on `members`
// prevents an unlinked auth user from listing peers directly, so the
// flow now goes through two SECURITY DEFINER functions:
//
//   list_unclaimed_members_by_invite(text)
//   claim_member_by_invite(uuid, text, text)
//
// Principals used:
//   - anon: anon key only (no JWT)
//   - unlinked auth user: c0000000-0000-0000-0000-000000000001 (seed §P)
//     This auth row exists but has NO members.auth_user_id pointing at it.
//   - service role: to inspect seed + reset state between runs.

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SUPABASE_URL,
  anonHeaders,
  authHeaders,
  rest,
  restStatus,
  serviceRoleHeaders,
  supabaseReachable,
} from './_supabase.js';

const UNLINKED_AUTH_USER_ID = 'c0000000-0000-0000-0000-000000000001';

const AS_ANON = { as: { asAnon: true } } as const;
const AS_UNLINKED = { as: { asAuthUserId: UNLINKED_AUTH_USER_ID } } as const;
const AS_SVCR = { as: { asServiceRole: true } } as const;

interface UnclaimedMember {
  id: string;
  name: string;
  initials: string;
  tone: number;
  division_id: string;
}

// Tiny helper around PostgREST's RPC endpoint that lets us drive both
// the status-only and JSON-returning shapes from one place. Mirrors the
// existing rest() / restStatus() helpers in _supabase.ts.
async function rpcStatus(
  fn: string,
  body: Record<string, unknown>,
  as: 'anon' | { authUserId: string } | 'service',
): Promise<{ status: number; body: string }> {
  const headers =
    as === 'anon'
      ? anonHeaders()
      : as === 'service'
        ? serviceRoleHeaders()
        : authHeaders(as.authUserId);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

describe('Claim-profile RPCs', () => {
  let inviteCode: string;
  let unclaimedMemberId: string;

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    // Pin to the Mahlaka 6 — Carmel team's invite code (seed §3).
    const teamRows = await rest<{ invite_code: string }[]>(
      '/teams?crest=eq.M6&select=invite_code&limit=1',
      AS_SVCR,
    );
    expect(teamRows.length).toBe(1);
    expect(teamRows[0].invite_code).toBeTruthy();
    inviteCode = teamRows[0].invite_code;
  });

  beforeEach(async () => {
    // Ensure the unlinked auth user is NOT linked to any member at the start
    // of each test. Tests that perform a successful claim must clean up.
    await rest('/members?auth_user_id=eq.' + UNLINKED_AUTH_USER_ID, {
      method: 'PATCH',
      body: JSON.stringify({ auth_user_id: null }),
      ...AS_SVCR,
    });
    // Pick a member that is definitely unclaimed (Tamar Levi — not seeded as a
    // linked auth user in §P) for the claim flow tests.
    const candidates = await rest<{ id: string }[]>(
      '/members?name=eq.Tamar+Levi&select=id&limit=1',
      AS_SVCR,
    );
    expect(candidates.length).toBe(1);
    unclaimedMemberId = candidates[0].id;
    // Make sure the candidate is actually unclaimed.
    await rest(`/members?id=eq.${unclaimedMemberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ auth_user_id: null }),
      ...AS_SVCR,
    });
  });

  afterEach(async () => {
    // After each test, scrub any claim leakage so subsequent tests can pass.
    await rest('/members?auth_user_id=eq.' + UNLINKED_AUTH_USER_ID, {
      method: 'PATCH',
      body: JSON.stringify({ auth_user_id: null }),
      ...AS_SVCR,
    });
  });

  // ─────────────────────────────────────────────────────────────
  // list_unclaimed_members_by_invite
  // ─────────────────────────────────────────────────────────────
  describe('list_unclaimed_members_by_invite', () => {
    it('anon CAN call it and receives unclaimed members of the invite\'s division', async () => {
      const rows = await rest<UnclaimedMember[]>('/rpc/list_unclaimed_members_by_invite', {
        method: 'POST',
        body: JSON.stringify({ p_invite_code: inviteCode }),
        ...AS_ANON,
      });
      expect(Array.isArray(rows)).toBe(true);
      // The seed leaves all but Yoni Avraham (commander) and Eitan Cohen
      // (soldier) unclaimed in Mahlaka 6 → at least 20 unclaimed members.
      expect(rows.length).toBeGreaterThanOrEqual(20);
      // None of the returned rows should be the linked commander or soldier.
      const names = new Set(rows.map((r) => r.name));
      expect(names.has('Yoni Avraham')).toBe(false);
      expect(names.has('Eitan Cohen')).toBe(false);
      // Tamar Levi is unclaimed in seed → should appear.
      expect(names.has('Tamar Levi')).toBe(true);
    });

    it('anon receives an empty result for an unknown invite code', async () => {
      const rows = await rest<UnclaimedMember[]>('/rpc/list_unclaimed_members_by_invite', {
        method: 'POST',
        body: JSON.stringify({ p_invite_code: 'definitely-not-a-real-code-zzz' }),
        ...AS_ANON,
      });
      expect(rows).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // claim_member_by_invite
  // ─────────────────────────────────────────────────────────────
  describe('claim_member_by_invite', () => {
    it('unauthenticated callers receive 42501 / 4xx', async () => {
      const r = await rpcStatus(
        'claim_member_by_invite',
        {
          p_member_id: unclaimedMemberId,
          p_invite_code: inviteCode,
          p_email: 'someone@test.local',
        },
        'anon',
      );
      // PostgREST surfaces our 42501 RAISE as a 4xx. The exact mapping is
      // PostgREST-version-dependent (often 403); we assert on the family +
      // SQLSTATE in the body.
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
      expect(r.body).toMatch(/42501|Not authenticated/i);
    });

    it('authenticated unlinked user CAN claim an unclaimed member', async () => {
      const r = await rpcStatus(
        'claim_member_by_invite',
        {
          p_member_id: unclaimedMemberId,
          p_invite_code: inviteCode,
          p_email: 'unlinked-claimer@test.local',
        },
        { authUserId: UNLINKED_AUTH_USER_ID },
      );
      expect(r.status).toBeLessThan(300);

      // Confirm the link landed in the DB.
      const after = await rest<{ auth_user_id: string | null; email: string | null }[]>(
        `/members?id=eq.${unclaimedMemberId}&select=auth_user_id,email`,
        AS_SVCR,
      );
      expect(after[0].auth_user_id).toBe(UNLINKED_AUTH_USER_ID);
      expect(after[0].email).toBe('unlinked-claimer@test.local');
    });

    it('re-claiming the same auth user raises 23505', async () => {
      // First claim — should succeed.
      const first = await rpcStatus(
        'claim_member_by_invite',
        {
          p_member_id: unclaimedMemberId,
          p_invite_code: inviteCode,
          p_email: 'unlinked-claimer@test.local',
        },
        { authUserId: UNLINKED_AUTH_USER_ID },
      );
      expect(first.status).toBeLessThan(300);

      // Second claim with the same auth user — should fail with 23505.
      // We need a different unclaimed member to attempt the second claim
      // (otherwise the inner uniqueness check would never fire — the
      // member is already linked too). Pick another unclaimed member.
      const more = await rest<{ id: string }[]>(
        '/members?name=eq.Noa+Shapira&select=id&limit=1',
        AS_SVCR,
      );
      expect(more.length).toBe(1);
      const secondMemberId = more[0].id;

      const second = await rpcStatus(
        'claim_member_by_invite',
        {
          p_member_id: secondMemberId,
          p_invite_code: inviteCode,
          p_email: 'unlinked-claimer@test.local',
        },
        { authUserId: UNLINKED_AUTH_USER_ID },
      );
      expect(second.status).toBeGreaterThanOrEqual(400);
      expect(second.body).toMatch(/23505|Already linked/i);
    });

    it('claim with mismatched invite code fails (P0002)', async () => {
      const r = await rpcStatus(
        'claim_member_by_invite',
        {
          p_member_id: unclaimedMemberId,
          p_invite_code: 'bogus-invite-code',
          p_email: null,
        },
        { authUserId: UNLINKED_AUTH_USER_ID },
      );
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.body).toMatch(/P0002|Member not found|invite mismatch/i);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Regression: the RLS-tightened world without this RPC
  // ─────────────────────────────────────────────────────────────
  describe('regression context: direct members read', () => {
    it('unlinked auth user reading members directly returns 0 rows (RLS scopes to division)', async () => {
      // current_member_id() is NULL → current_division_id() is NULL → empty result.
      const r = await restStatus('/members?select=id&limit=1', AS_UNLINKED);
      const empty =
        r.status !== 200 || (JSON.parse(r.body) as unknown[]).length === 0;
      expect(empty).toBe(true);
    });
  });
});
