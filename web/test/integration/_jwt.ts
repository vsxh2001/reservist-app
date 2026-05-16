// JWT minting helpers for integration tests.
// Uses Node built-in `crypto` — no extra npm dependencies.
// Signs HS256 JWTs that Supabase's local PostgREST instance will accept.

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../../.env');

function readEnv(key: string): string | undefined {
  try {
    const raw = readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && m[1] === key) return m[2].trim();
    }
  } catch {
    // fallthrough to process.env
  }
  return process.env[key];
}

// Local dev default — matches the supabase start JWT_SECRET.
const JWT_SECRET =
  readEnv('SUPABASE_JWT_SECRET') ??
  'super-secret-jwt-token-with-at-least-32-characters-long';

// Anon key — needed as apikey header so the REST gateway accepts requests.
export const ANON_KEY =
  readEnv('VITE_SUPABASE_ANON_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Local dev service-role key (static for supabase local stack).
export const SERVICE_ROLE_KEY =
  readEnv('SUPABASE_SERVICE_ROLE_KEY') ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Fixed test principal UUIDs — must match seed.sql §P.
export const COMMANDER_AUTH_USER_ID       = 'a0000000-0000-0000-0000-000000000001'; // Yoni Avraham, M6 Carmel
export const SOLDIER_AUTH_USER_ID         = 'b0000000-0000-0000-0000-000000000001'; // Eitan Cohen, M6 Carmel
export const BRAVO_COMMANDER_AUTH_USER_ID = 'd0000000-0000-0000-0000-000000000001'; // Asaf Doron, M6 Bravo-6
export const ALPHA_COMMANDER_AUTH_USER_ID = 'e0000000-0000-0000-0000-000000000001'; // Tomer Bachar, Mahlaka 7 Alpha-7

// ─────────────────────────────────────────────────────────────
// mintJwtForAuthUser
// Signs an HS256 JWT accepted by the local Supabase PostgREST.
// Payload role is 'authenticated' so RLS policies that gate on
// `to authenticated` will apply.
// ─────────────────────────────────────────────────────────────
export function mintJwtForAuthUser(authUserId: string, ttlSeconds = 3600): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + ttlSeconds;
  const payload = base64url(JSON.stringify({
    sub: authUserId,
    role: 'authenticated',
    aud: 'authenticated',
    iss: 'supabase-demo',
    iat,
    exp,
  }));
  const signingInput = `${header}.${payload}`;
  const sig = createHmac('sha256', JWT_SECRET)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${signingInput}.${sig}`;
}

// Returns headers that use the service role — bypasses all RLS.
// Use only in beforeAll/afterAll for test fixture setup.
export function serviceRoleHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };
}

// Returns headers that impersonate a specific auth user (RLS applied).
export function authHeaders(authUserId: string): Record<string, string> {
  const token = mintJwtForAuthUser(authUserId);
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// Returns headers for the anonymous role (no JWT, no authenticated context).
export function anonHeaders(): Record<string, string> {
  return {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
  };
}

function base64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
