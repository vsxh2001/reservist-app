// Shared helpers for integration tests against the local Supabase REST API.
// These tests hit the live stack on 127.0.0.1:54321 — `supabase start` first.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { authHeaders, anonHeaders, serviceRoleHeaders, mintJwtForAuthUser, SERVICE_ROLE_KEY } from './_jwt.js';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../../.env');

function readEnv(key: string): string | undefined {
  try {
    const raw = readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && m[1] === key) return m[2];
    }
  } catch {
    // fallthrough
  }
  return process.env[key];
}

export const SUPABASE_URL = readEnv('VITE_SUPABASE_URL') ?? 'http://127.0.0.1:54321';
export const ANON_KEY = readEnv('VITE_SUPABASE_ANON_KEY') ?? '';

// Re-export for tests that need them
export { authHeaders, anonHeaders, serviceRoleHeaders, mintJwtForAuthUser, SERVICE_ROLE_KEY };

// Impersonation options for rest()
export type RestAs =
  | { asAuthUserId: string }
  | { asServiceRole: true }
  | { asAnon: true };

export async function supabaseReachable(): Promise<boolean> {
  try {
    // Use anon key for reachability check — teams are selectable by invite_code carve-out.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/teams?select=id&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function rest<T = unknown>(
  path: string,
  init: RequestInit & { prefer?: string; as?: RestAs } = {},
): Promise<T> {
  const { as, prefer, ...fetchInit } = init;

  let baseHeaders: Record<string, string>;
  if (as && 'asServiceRole' in as) {
    baseHeaders = serviceRoleHeaders();
  } else if (as && 'asAuthUserId' in as) {
    baseHeaders = authHeaders(as.asAuthUserId);
  } else if (as && 'asAnon' in as) {
    baseHeaders = anonHeaders();
  } else {
    // Default to service role so legacy tests (before auth tightening) still work.
    baseHeaders = serviceRoleHeaders();
  }

  const headers: Record<string, string> = {
    ...baseHeaders,
    ...(fetchInit.headers as Record<string, string> | undefined ?? {}),
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...fetchInit, headers });
  if (!res.ok) {
    throw new Error(`REST ${fetchInit.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('application/json') ? await res.json() : (undefined as T);
}

// Convenience: rest that returns the HTTP status instead of throwing.
// Useful for negative test assertions.
export async function restStatus(
  path: string,
  init: RequestInit & { prefer?: string; as?: RestAs } = {},
): Promise<{ status: number; body: string }> {
  const { as, prefer, ...fetchInit } = init;

  let baseHeaders: Record<string, string>;
  if (as && 'asServiceRole' in as) {
    baseHeaders = serviceRoleHeaders();
  } else if (as && 'asAuthUserId' in as) {
    baseHeaders = authHeaders(as.asAuthUserId);
  } else if (as && 'asAnon' in as) {
    baseHeaders = anonHeaders();
  } else {
    baseHeaders = serviceRoleHeaders();
  }

  const headers: Record<string, string> = {
    ...baseHeaders,
    ...(fetchInit.headers as Record<string, string> | undefined ?? {}),
  };
  if (prefer) headers.Prefer = prefer;

  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...fetchInit, headers });
  const body = await res.text();
  return { status: res.status, body };
}

export async function getDivisionId(): Promise<string> {
  const rows = await rest<{ id: string }[]>('/divisions?select=id&limit=1', { as: { asServiceRole: true } });
  if (!rows.length) throw new Error('No division seeded. Run `supabase db reset`.');
  return rows[0].id;
}

export async function getTeamId(): Promise<string> {
  // Pin to the original M6 team by crest so seed expansion (multiple teams)
  // doesn't change which team the schema tests assert against.
  const rows = await rest<{ id: string }[]>('/teams?crest=eq.M6&select=id&limit=1', { as: { asServiceRole: true } });
  if (!rows.length) throw new Error('No M6 team seeded. Run `supabase db reset`.');
  return rows[0].id;
}

export async function getMemberIdByName(name: string): Promise<string> {
  const enc = encodeURIComponent(name);
  const rows = await rest<{ id: string }[]>(`/members?name=eq.${enc}&select=id`, { as: { asServiceRole: true } });
  if (!rows.length) throw new Error(`Member "${name}" not found`);
  return rows[0].id;
}

// Seeds an auth.users row + links it to the named member using service-role.
// Uses a deterministic UUID derived from the member name so tests are repeatable.
// Note: pre-seeded members (Yoni Avraham, Eitan Cohen) already have fixed UUIDs
// from seed.sql §P and should not be re-seeded.
export async function seedAuthUserForMember(memberId: string, email: string, authUserId: string): Promise<void> {
  // Insert auth user via the admin API (service role bypasses auth.users RLS).
  // PostgREST exposes auth.users through /auth/v1/admin/users with the service role.
  // For simplicity in integration tests we use the pg REST approach: POST to auth.users
  // is not available via PostgREST by default, so we do it via a service-role RPC.
  // Instead: we update the member row directly (service-role can do this).
  await rest(`/members?id=eq.${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify({ auth_user_id: authUserId }),
    as: { asServiceRole: true },
  });
}
