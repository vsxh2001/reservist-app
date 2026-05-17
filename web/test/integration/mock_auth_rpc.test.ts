// web/test/integration/mock_auth_rpc.test.ts
//
// Integration coverage for the dev-only `list_mock_auth_members()` RPC
// introduced in 20260516233349. The LoginPicker calls this RPC from an
// anonymous (pre-session) caller when VITE_MOCK_AUTH=1, so the contract
// being tested is:
//
//   • anon callers may invoke it (no auth required);
//   • only @test.local seeded users come back (production safety net);
//   • the shape includes `email` and `auth_user_id` so the picker can
//     drive supabase.auth.signInWithPassword with the seeded password.
//
// Seed reference: supabase/seed.sql §P creates exactly 5 auth users:
//   commander-yoni@test.local, soldier-eitan@test.local, unclaimed-charlie@test.local,
//   commander-asaf@test.local, commander-tomer@test.local.

import { beforeAll, describe, expect, it } from 'vitest';
import { rest, supabaseReachable } from './_supabase.js';

const AS_ANON = { as: { asAnon: true } } as const;

interface MockAuthRow {
  id: string;
  name: string;
  initials: string;
  tone: number;
  division_id: string;
  auth_user_id: string;
  email: string;
}

describe('list_mock_auth_members() RPC', () => {
  beforeAll(async () => {
    if (!(await supabaseReachable())) {
      throw new Error('Supabase not reachable. Run `supabase start` first.');
    }
  });

  it('anon caller can invoke the RPC (no auth required)', async () => {
    const rows = await rest<MockAuthRow[]>('/rpc/list_mock_auth_members', {
      method: 'POST',
      body: '{}',
      ...AS_ANON,
    });
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('returns only @test.local emails (production safety net)', async () => {
    const rows = await rest<MockAuthRow[]>('/rpc/list_mock_auth_members', {
      method: 'POST',
      body: '{}',
      ...AS_ANON,
    });
    for (const r of rows) {
      expect(r.email.endsWith('@test.local')).toBe(true);
    }
  });

  it('returns the 5 seeded mock auth users with claimed member rows', async () => {
    const rows = await rest<MockAuthRow[]>('/rpc/list_mock_auth_members', {
      method: 'POST',
      body: '{}',
      ...AS_ANON,
    });
    // Charlie is unclaimed in seed (auth_user_id is set but the member row
    // for "Charlie" doesn't link back via auth_user_id — see seed §P notes).
    // Concrete seeded claimed users: Yoni, Eitan, Asaf, Tomer.
    const names = rows.map((r) => r.name).sort();
    for (const expected of ['Yoni Avraham', 'Eitan Cohen', 'Asaf Doron', 'Tomer Bachar']) {
      expect(names).toContain(expected);
    }
  });

  it('payload shape includes the fields LoginPicker needs', async () => {
    const rows = await rest<MockAuthRow[]>('/rpc/list_mock_auth_members', {
      method: 'POST',
      body: '{}',
      ...AS_ANON,
    });
    const first = rows[0];
    expect(typeof first.id).toBe('string');
    expect(typeof first.name).toBe('string');
    expect(typeof first.initials).toBe('string');
    expect(typeof first.tone).toBe('number');
    expect(typeof first.division_id).toBe('string');
    expect(typeof first.auth_user_id).toBe('string');
    expect(typeof first.email).toBe('string');
  });

  it('rows are ordered by name ascending', async () => {
    const rows = await rest<MockAuthRow[]>('/rpc/list_mock_auth_members', {
      method: 'POST',
      body: '{}',
      ...AS_ANON,
    });
    const names = rows.map((r) => r.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });

  it('does NOT leak non-@test.local auth users that exist in auth.users', async () => {
    // Insert a stray non-test auth user via the GoTrue admin API, then
    // confirm the RPC filter excludes it. PostgREST doesn't expose
    // auth.users for direct INSERT, so the admin endpoint is the right
    // surface for this safety-net check.
    const SUPABASE_URL = (await import('./_supabase.js')).SUPABASE_URL;
    const { SERVICE_ROLE_KEY } = await import('./_jwt.js');
    const strayEmail = `stray-${Date.now()}@example.com`;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        email: strayEmail,
        password: 'unused',
        email_confirm: true,
      }),
    });
    expect(res.ok).toBe(true);
    const created = (await res.json()) as { id: string };
    const strayId = created.id;

    try {
      const rows = await rest<MockAuthRow[]>('/rpc/list_mock_auth_members', {
        method: 'POST',
        body: '{}',
        ...AS_ANON,
      });
      for (const r of rows) {
        expect(r.email).not.toBe(strayEmail);
        expect(r.email.endsWith('@test.local')).toBe(true);
      }
    } finally {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${strayId}`, {
        method: 'DELETE',
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      }).catch(() => undefined);
    }
  });
});
