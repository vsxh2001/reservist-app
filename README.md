# Reservist App

An unofficial, grassroots web/PWA tool that helps IDF reservists (miluim) and
their commanders coordinate duty and deployment. Commanders get a roster +
duty-slot dashboard; reservists get profile, status, and upcoming-duty surfaces.
Scale target is squad/platoon (10–30 people). See
[`Reservist_App_PRD_v1.md`](./Reservist_App_PRD_v1.md) §1 for the full product
spec.

## Architecture

- Self-hosted **Supabase** (Postgres 17 + PostgREST + GoTrue + Realtime) driven
  by the Supabase CLI from `supabase/config.toml`. Migrations live in
  `supabase/migrations/`, demo data in `supabase/seed.sql`.
- **Vite 5 + React 18 + TypeScript** single-page app in `web/`, with
  **TanStack Query** for data fetching and cache.
- **Service Worker + Web Push** via `vite-plugin-pwa` (Workbox). A
  Node sidecar (`web/scripts/push-sidecar.mjs`) listens to Supabase Realtime
  and dispatches VAPID web-push messages.
- Local dev runs over HTTPS via `@vitejs/plugin-basic-ssl`; Vite proxies
  `/rest`, `/auth`, `/realtime`, `/storage`, `/functions` to Supabase so the
  page stays same-origin.

## Local development

### Prerequisites

- Docker (the Supabase CLI runs Postgres, PostgREST, GoTrue, etc. as
  containers).
- Node 22+ and npm (CI pins Node 22).
- Supabase CLI. Install from
  [supabase.com/docs/guides/local-development](https://supabase.com/docs/guides/local-development).
  This repo expects it at `~/.local/bin/supabase` (or anywhere on `PATH`).

### Bring up the stack

```sh
git clone <this-repo> reservist_app
cd reservist_app

# 1. Start the local Supabase stack (db on 54322, REST on 54321, Studio on 54323)
supabase start

# 2. Apply migrations + seed (idempotent — destroys local data)
supabase db reset
```

`supabase/config.toml` declares the ports above, enables migrations and
`seed.sql` on reset, sets `auth.site_url = https://localhost:5174`, and enables
the Google OAuth provider (requires
`SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` env vars for real OAuth
to work).

### Configure the web app

```sh
cd web
cp .env.example .env
```

`web/.env` variables:

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | yes | Supabase REST/Auth/Realtime base URL. Local default: `http://127.0.0.1:54321`. |
| `VITE_SUPABASE_ANON_KEY` | yes | Public anon key. The local dev value is in `.env.example`; rotate for any non-local deploy. |
| `VITE_VAPID_PUBLIC_KEY` | optional | VAPID public key for web push. Generate with `node -e 'const w=require("web-push"); console.log(JSON.stringify(w.generateVAPIDKeys()))'`. |
| `VITE_MOCK_AUTH` | optional | Set to `1` to expose the legacy member-picker login alongside Google OAuth. Dev only. |
| `SUPABASE_JWT_SECRET` | tests only | Used by the integration suite to mint HS256 JWTs. Defaults to the local-dev secret. |
| `SUPABASE_SERVICE_ROLE_KEY` | tests / sidecar only | Bypasses all RLS — never expose to the browser. Defaults to the local-dev key. |

### Install and run

```sh
cd web
npm install
npm run dev
```

The dev server listens on `https://localhost:5174` (and on the LAN IP for
mobile testing). The first HTTPS visit shows a self-signed cert warning —
accept once. iOS Safari needs a trusted cert (e.g. mkcert) before the service
worker will fully register.

### Useful scripts

From `web/`:

```sh
npm run dev               # vite, HTTPS dev server
npm run build             # tsc -b && vite build
npm run preview           # vite preview
npm run lint              # eslint .
npm run lint:fix          # eslint . --fix
npm run test              # vitest run (all suites)
npm run test:watch        # vitest (interactive)
npm run test:ui           # vitest --ui
npm run test:unit         # vitest run, excludes test/integration/**
npm run test:integration  # vitest run test/integration
npx tsc -b --noEmit       # typecheck only
```

## Domain model

`supabase/migrations/20260516161822_divisions_projects_teams.sql` restructured
the original flat schema into a four-level hierarchy:

- `divisions` own members and skills. Each member has exactly one
  `division_id`.
- `projects` belong to a division.
- `teams` belong to a project (and back-reference the division). A team has an
  `invite_code` used for the join flow.
- `team_members` joins `members` ↔ `teams` with a `team_role_enum` of
  `commander` or `soldier`. Operational data (`slots`, `deployment_windows`,
  `activity_log`, `join_requests`) is scoped to a `team_id`.

`members_view`, `slots_view`, `deployment_windows_view`, and `teams_view`
project the underlying tables for the UI; `members_view` masks `phone` for
peers (see Security).

## Testing layers

- **Unit / component** — Vitest + happy-dom (`web/vitest.config.ts`). Setup in
  `web/test/setup.ts`. Run with `npm run test:unit`.
- **Integration** — Vitest hits a live local Supabase via REST. Each test
  mints an HS256 JWT with `mintJwtForAuthUser()` in
  `web/test/integration/_jwt.ts` so policies that gate on `to authenticated`
  apply. Fixture setup uses `serviceRoleHeaders()` to bypass RLS. Run with
  `supabase start && npm run test:integration`.
- **Lint + typecheck** — `npm run lint` (ESLint flat config) and
  `npx tsc -b --noEmit`.

### End-to-end tests

- **Playwright** drives a real browser against the Vite dev server. Specs live
  in `web/test/e2e/*.spec.ts`; config in `web/playwright.config.ts`.
- Run with `cd web && npm run test:e2e`. Requires the local Supabase stack to
  be running (`supabase start`) with `supabase/seed.sql` applied. The smoke
  spec pre-seeds a Supabase auth session in `localStorage` (HS256-signed JWT
  for the seeded commander `a0000000-0000-0000-0000-000000000001`), skips the
  LoginPicker, and asserts the Dashboard's Roster screen renders seeded
  members.
- Playwright auto-starts the dev server with `VITE_MOCK_AUTH=1` and the
  local-dev Supabase URL / anon key inlined in `playwright.config.ts`, so no
  pre-existing `web/.env` is required.
- On first run, browser binaries are downloaded into `~/.cache/ms-playwright`
  via `npx playwright install chromium`. On distros Playwright does not
  officially recognise (e.g. Ubuntu 26.04 at the time of writing), force a
  supported fallback with
  `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium`.

## Auth modes

- **Google OAuth via Supabase** (`auth.external.google` in `config.toml`) is
  the production path. `web/src/lib/auth.tsx` calls
  `supabase.auth.signInWithOAuth({ provider: 'google' })` and resolves the
  resulting `auth.users.id` to a `members` row via `members.auth_user_id`.
- **Claim-profile flow** — a new Google user with no linked `members` row
  enters the claim screen, types a team `invite_code`, and picks an unclaimed
  member. Backed by the SECURITY DEFINER RPCs
  `list_unclaimed_members_by_invite()` and `claim_member_by_invite()` in
  migration `20260516194414__claim_profile_rpc.sql`.
- **Legacy mock picker** — set `VITE_MOCK_AUTH=1` to expose a no-OAuth member
  picker that writes to `localStorage`. Dev/demo only; the resulting "session"
  has no real JWT and will fail any RLS-gated request.

## Security posture

- **RLS everywhere.** Migration `20260516192409__rls_tightening.sql` drops the
  initial permissive anon policies and replaces them with `to authenticated`
  policies scoped to the caller's division via the
  `current_division_id()` / `is_commander_of(team)` /
  `is_division_admin_of(division)` SECURITY DEFINER helpers.
- **Phone masking.** `members_view` returns `phone` only for the caller
  themself, commanders of any team the target belongs to, and division
  admins; all other authenticated readers see `NULL`.
- **Service-role key.** Used only by (a) the integration test suite to set up
  fixtures, and (b) the push sidecar. It must never be embedded in the web
  bundle.
- **`activity_log` is append-only.** There is no UPDATE policy; inserts are
  gated to the actor themself or a team commander, and only division admins
  can delete.
- **Join requests are the only anon write surface** — the `pending` state is
  enforced via `WITH CHECK` so the state cannot be forged.

## Web push sidecar

`web/scripts/push-sidecar.mjs` subscribes to Supabase Realtime with the
service-role JWT and fans out web-push notifications on:

1. `INSERT` into `slots` where `urgent = true` → notifies every member of
   `slot.team_id` (via `team_members`).
2. `UPDATE` of `deployment_picks` where `state` becomes `approved` or
   `rejected` → notifies the reservist who owns the parent
   `deployment_windows.member_id`.

Required environment:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase base URL (defaults to local dev). |
| `SUPABASE_SERVICE_ROLE_KEY` | Auth for the Realtime socket and the lookups. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | VAPID keypair (the public half is also `VITE_VAPID_PUBLIC_KEY` in `web/.env`). Generate with `node -e 'const w=require("web-push"); console.log(JSON.stringify(w.generateVAPIDKeys()))'`. |
| `VAPID_MAILTO` | Contact URL for the VAPID `aud`. Defaults to `mailto:admin@reservist.local`. |

Run it next to `npm run dev`:

```sh
node web/scripts/push-sidecar.mjs
# or, for smoke testing, drain once and exit:
node web/scripts/push-sidecar.mjs --once
```

Endpoints that respond `404` / `410` are pruned from `push_subscriptions`
automatically.

## PWA + offline

- Manifest, icons, and Workbox runtime caching are wired in
  `web/vite.config.ts` via `vite-plugin-pwa`. PWA dev mode is enabled
  (`devOptions.enabled = true`) so the service worker registers on
  `npm run dev`.
- Android Chrome installs via the menu → "Install app".
- iOS Safari requires a trusted certificate before it will fully register a
  service worker; the basic-ssl plugin only emits a self-signed cert. Use
  mkcert or a real cert when testing PWA installation on iOS.

## CI / PR workflow

`.github/workflows/ci.yml` runs on every push and PR to `main`:

- **`web` job** — Node 22, `npm ci`, `npm run lint`,
  `npx tsc --noEmit`, `npm run test:unit`, `npm run build`. Uses placeholder
  Supabase env vars so unit tests do not need a live stack.
- **`integration` job** — needs `web`. Installs the Supabase CLI from the
  pinned release tarball, runs `supabase start` with non-essential services
  excluded, writes `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from
  `supabase status -o env`, runs `npm run test:integration`, then
  `supabase stop --no-backup`.

Both jobs must pass before merge.

## Known limitations / follow-ups

- RLS edge cases — `members.is_division_admin` is the only escape hatch for
  cross-team admin work; teams that span unusual project/division boundaries
  may surface gaps that need a per-policy review.
- `activity_log` is intentionally immutable (no UPDATE policy). Corrections
  require a division admin delete + reinsert.
- Hebrew copy and full RTL rendering are not yet shipped (PRD §6).
- The push sidecar is a single-process Node script — no retry queue, no
  durable backlog. Restart it after Supabase reboots.
- The local Supabase anon and service-role keys in `web/.env.example` are the
  standard published local-dev values. Rotate them for any non-local
  environment.

## Repo layout

```
reservist_app/
  Reservist_App_PRD_v1.md       Product spec
  supabase/
    config.toml                 CLI + service ports + auth providers
    migrations/                 Ordered SQL — applied by supabase db reset
    seed.sql                    Mahlaka 6 / Carmel demo data
  web/
    src/                        React app (Dashboard, ReservistDashboard, lib/)
    test/                       Vitest unit + integration suites
    scripts/push-sidecar.mjs    Web-push fanout
    vite.config.ts              Dev server, PWA, basic-ssl, Supabase proxy
    vitest.config.ts            Test runner config
  .github/workflows/ci.yml      web + integration CI jobs
```
