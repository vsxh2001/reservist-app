// Shared helpers for integration tests against the local Supabase REST API.
// These tests hit the live stack on 127.0.0.1:54321 — `supabase start` first.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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

export async function supabaseReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/divisions?select=id&limit=1`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function rest<T = unknown>(
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined ?? {}),
  };
  if (init.prefer) headers.Prefer = init.prefer;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { ...init, headers });
  if (!res.ok) {
    throw new Error(`REST ${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('application/json') ? await res.json() : (undefined as T);
}

export async function getDivisionId(): Promise<string> {
  const rows = await rest<{ id: string }[]>('/divisions?select=id&limit=1');
  if (!rows.length) throw new Error('No division seeded. Run `supabase db reset`.');
  return rows[0].id;
}

export async function getTeamId(): Promise<string> {
  // Pin to the original M6 team by crest so seed expansion (multiple teams)
  // doesn't change which team the schema tests assert against.
  const rows = await rest<{ id: string }[]>('/teams?crest=eq.M6&select=id&limit=1');
  if (!rows.length) throw new Error('No M6 team seeded. Run `supabase db reset`.');
  return rows[0].id;
}

export async function getMemberIdByName(name: string): Promise<string> {
  const enc = encodeURIComponent(name);
  const rows = await rest<{ id: string }[]>(`/members?name=eq.${enc}&select=id`);
  if (!rows.length) throw new Error(`Member "${name}" not found`);
  return rows[0].id;
}
