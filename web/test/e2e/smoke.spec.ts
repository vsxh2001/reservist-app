import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';

// End-to-end happy-path smoke. Boots the dev server, signs in as the seeded
// commander Yoni Avraham, and asserts the Dashboard's Roster screen renders
// with seeded members visible. Requires the local Supabase stack to be
// running with `supabase/seed.sql` applied.
//
// Why we mint a JWT instead of clicking the LoginPicker's "Continue as mock"
// button: the mock-auth path in `lib/auth.tsx` only writes a name + id to
// localStorage and never gets a real session, so subsequent reads of
// `members_view` are blocked by the post-§192409 `to authenticated` RLS
// policies and the Dashboard never has any members to render. Injecting a
// real authenticated session via `supabase.auth.setSession()` exercises the
// same surface the production Google OAuth flow lands on (auth.users →
// members link → Dashboard), which is the actual happy path worth smoking.

// Local-dev Supabase defaults — same values as `supabase/seed.sql §P` and
// `web/test/integration/_jwt.ts`. These are the static keys shipped by
// `supabase start` and are safe to commit.
const JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';
const COMMANDER_AUTH_USER_ID = 'a0000000-0000-0000-0000-000000000001';

function base64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function mintJwt(authUserId: string, ttlSeconds = 3600): { token: string; iat: number; exp: number } {
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
  return { token: `${signingInput}.${sig}`, iat, exp };
}

test('signed-in commander lands on the Roster with seeded members', async ({ page }) => {
  const { token, exp } = mintJwt(COMMANDER_AUTH_USER_ID);

  // Pre-seed the supabase-js auth storage so the client picks up an existing
  // session on first load and skips the LoginPicker entirely. Storage key
  // mirrors supabase-js's default: `sb-${hostname-prefix}-auth-token` — the
  // page is served from https://127.0.0.1:5174 and `resolveUrl()` rewrites
  // the supabase base URL to the same origin, so the key resolves to
  // `sb-127-auth-token`.
  await page.addInitScript(({ storageKey, token, exp, userId }) => {
    const session = {
      access_token: token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: exp,
      refresh_token: 'mock-refresh-token',
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'commander-yoni@test.local',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: new Date().toISOString(),
      },
    };
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, {
    storageKey: 'sb-127-auth-token',
    token,
    exp,
    userId: COMMANDER_AUTH_USER_ID,
  });

  await page.goto('/');

  // Roster screen header in Dashboard.tsx is `<h1>Who is in <em>the team</em></h1>`.
  await expect(page.getByRole('heading', { name: /Who is in/i })).toBeVisible();

  // Wait for the loading state to clear before asserting on roster content.
  await expect(page.getByText('Loading roster…')).toBeHidden();

  // Yoni Avraham (seeded commander) appears in both the sidebar user badge
  // and the roster body — at least one occurrence is enough for the smoke.
  await expect(page.getByText('Yoni Avraham').first()).toBeVisible();

  // Sanity-check on another seeded member to make sure the roster query
  // actually returned data and we're not just seeing the sidebar badge.
  await expect(page.getByText('Daniel Katz').first()).toBeVisible();

  await page.screenshot({ path: 'test-results/smoke.png', fullPage: true });
});
