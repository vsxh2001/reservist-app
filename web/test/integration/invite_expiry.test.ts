// web/test/integration/invite_expiry.test.ts
//
// Coverage for the invite_expires_at gate added in 20260517032643. Three
// anon-reachable surfaces are now expiry-aware:
//
//   1. teams SELECT carve-out ("anon read teams by invite_code")
//   2. RPC list_unclaimed_members_by_invite(p_invite_code text)
//   3. RPC claim_member_by_invite(p_member_id, p_invite_code, p_email)
//
// To stay hermetic against other integration files that mutate M6's seed
// state in parallel, this file creates a throwaway team + member with its
// own random invite_code in beforeAll and tears it down in afterAll.
// Nothing here mutates seed-owned rows.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SUPABASE_URL,
  anonHeaders,
  authHeaders,
  rest,
  serviceRoleHeaders,
  supabaseReachable,
  SERVICE_ROLE_KEY,
} from './_supabase.js';

const AS_ANON = { as: { asAnon: true } } as const;
const AS_SVCR = { as: { asServiceRole: true } } as const;

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

async function setExpiry(teamId: string, iso: string | null): Promise<void> {
  await rest(`/teams?id=eq.${teamId}`, {
    method: 'PATCH',
    body: JSON.stringify({ invite_expires_at: iso }),
    ...AS_SVCR,
  });
}

describe('invite_expires_at enforcement', () => {
  let teamId: string;
  let projectId: string;
  let divisionId: string;
  let memberId: string;
  let inviteCode: string;
  let claimerAuthId: string;
  let claimerEmail: string;
  const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString();
  const PAST = '2020-01-01T00:00:00Z';

  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
    // Use the existing M6 division + Carmel project to host the throwaway
    // team — they're shared infra and we don't mutate them. Pick by name.
    const projects = await rest<{ id: string; division_id: string }[]>(
      '/projects?name=eq.Carmel&select=id,division_id&limit=1',
      AS_SVCR,
    );
    expect(projects.length).toBe(1);
    projectId = projects[0].id;
    divisionId = projects[0].division_id;

    // Throwaway team with a random invite_code so the carve-out is
    // testable in isolation.
    inviteCode = `expiry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const team = await rest<{ id: string }[]>('/teams', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        project_id: projectId,
        division_id: divisionId,
        name: 'Invite Expiry Test Team',
        short_name: 'X-EXP',
        crest: 'XEXP',
        invite_code: inviteCode,
        invite_expires_at: FUTURE,
        established: 'Established 2026',
      }),
      ...AS_SVCR,
    });
    teamId = team[0].id;

    // Throwaway unclaimed member so the claim_member_by_invite test has a
    // target that no other file can race on.
    const member = await rest<{ id: string }[]>('/members', {
      method: 'POST',
      prefer: 'return=representation',
      body: JSON.stringify({
        division_id: divisionId,
        name: `Expiry Test Member ${Date.now()}`,
        initials: 'ET',
        tone: 0,
        phone: '+972 50-000-0000',
        status: 'available',
        joined: '2026-01',
      }),
      ...AS_SVCR,
    });
    memberId = member[0].id;

    // Throwaway auth user (the "claimer"). Lives entirely in this file so
    // other parallel integration files cannot race on its link state.
    claimerEmail = `expiry-claimer-${Date.now()}@test.local`;
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: claimerEmail,
        password: 'unused',
        email_confirm: true,
      }),
    });
    expect(authRes.ok).toBe(true);
    const authBody = (await authRes.json()) as { id: string };
    claimerAuthId = authBody.id;
  });

  afterAll(async () => {
    // Tear down throwaway rows in reverse order. Use service role; ignore
    // failures (best-effort cleanup).
    if (memberId) {
      await rest(`/members?id=eq.${memberId}`, { method: 'DELETE', ...AS_SVCR }).catch(
        () => undefined,
      );
    }
    if (teamId) {
      await rest(`/teams?id=eq.${teamId}`, { method: 'DELETE', ...AS_SVCR }).catch(
        () => undefined,
      );
    }
    // Tear down the throwaway auth user via the GoTrue admin API.
    if (claimerAuthId) {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${claimerAuthId}`, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }).catch(() => undefined);
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Sanity: future expiry — all three surfaces accept.
  // ─────────────────────────────────────────────────────────────
  it('future expiry: anon /teams resolves by invite_code', async () => {
    await setExpiry(teamId, FUTURE);
    const rows = await rest<{ id: string }[]>(
      `/teams?invite_code=eq.${encodeURIComponent(inviteCode)}&select=id`,
      AS_ANON,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(teamId);
  });

  it('future expiry: list_unclaimed_members_by_invite includes our throwaway member', async () => {
    await setExpiry(teamId, FUTURE);
    const rows = await rest<{ id: string }[]>('/rpc/list_unclaimed_members_by_invite', {
      method: 'POST',
      body: JSON.stringify({ p_invite_code: inviteCode }),
      ...AS_ANON,
    });
    // Division-scoped — our throwaway member must appear.
    expect(rows.some((r) => r.id === memberId)).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────
  // Past expiry: all three surfaces reject.
  // ─────────────────────────────────────────────────────────────
  it('past expiry: anon /teams returns 0 rows', async () => {
    await setExpiry(teamId, PAST);
    const rows = await rest<{ id: string }[]>(
      `/teams?invite_code=eq.${encodeURIComponent(inviteCode)}&select=id`,
      AS_ANON,
    );
    expect(rows.length).toBe(0);
  });

  it('past expiry: list_unclaimed_members_by_invite returns 0 rows', async () => {
    await setExpiry(teamId, PAST);
    const rows = await rest<{ id: string }[]>('/rpc/list_unclaimed_members_by_invite', {
      method: 'POST',
      body: JSON.stringify({ p_invite_code: inviteCode }),
      ...AS_ANON,
    });
    expect(rows).toEqual([]);
  });

  it('past expiry: claim_member_by_invite raises P0002', async () => {
    await setExpiry(teamId, PAST);
    const r = await rpcStatus(
      'claim_member_by_invite',
      {
        p_member_id: memberId,
        p_invite_code: inviteCode,
        p_email: claimerEmail,
      },
      { authUserId: claimerAuthId },
    );
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body).toMatch(/P0002|Member not found|invite mismatch|invite expired/i);

    // Confirm no link was applied to our throwaway member.
    const after = await rest<{ auth_user_id: string | null }[]>(
      `/members?id=eq.${memberId}&select=auth_user_id`,
      AS_SVCR,
    );
    expect(after[0].auth_user_id).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────
  // Boundary: strict `> now()`. Exactly-now is treated as expired.
  // ─────────────────────────────────────────────────────────────
  it('boundary: expiry one second ago rejects, one minute ahead accepts', async () => {
    await setExpiry(teamId, new Date(Date.now() - 1_000).toISOString());
    const expired = await rest<{ id: string }[]>(
      `/teams?invite_code=eq.${encodeURIComponent(inviteCode)}&select=id`,
      AS_ANON,
    );
    expect(expired.length).toBe(0);

    await setExpiry(teamId, new Date(Date.now() + 60_000).toISOString());
    const valid = await rest<{ id: string }[]>(
      `/teams?invite_code=eq.${encodeURIComponent(inviteCode)}&select=id`,
      AS_ANON,
    );
    expect(valid.length).toBe(1);
  });

  // ─────────────────────────────────────────────────────────────
  // NULL expiry: treated as "never expires" (backwards-compat path).
  // ─────────────────────────────────────────────────────────────
  it('NULL expiry: anon /teams resolves (never-expires path)', async () => {
    await setExpiry(teamId, null);
    const rows = await rest<{ id: string }[]>(
      `/teams?invite_code=eq.${encodeURIComponent(inviteCode)}&select=id`,
      AS_ANON,
    );
    expect(rows.length).toBe(1);
  });
});
