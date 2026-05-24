# Deploy runbook

End-to-end checklist for shipping Reservist to hosted Supabase + Vercel.

The repository ships with dormant CI workflows and env templates that
go live the moment the right secrets are set. Nothing in this doc
modifies code — it lists the one-time accounts, secrets, and console
clicks the operator needs.

## Prerequisites

- Domain name (optional but recommended; Vercel subdomain works for staging)
- Supabase account
- Vercel account
- Google Cloud Console access (for OAuth in production)

## 1. Supabase Cloud setup

1. Create project at <https://supabase.com>. Choose region close to
   reservists (e.g. `eu-central-1` for IL users).
2. Note the **project ref** (alphanumeric subdomain prefix) and **DB
   password** set during creation.
3. Mint a personal access token: <https://supabase.com/dashboard/account/tokens>.
4. Set Edge Function secrets via the dashboard
   (Project Settings → Edge Functions → Secrets). Every key listed in
   `supabase/.env.example` belongs here:
   - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` —
     generate with `npx web-push generate-vapid-keys`. Subject must
     be `mailto:you@yourdomain` or an `https:` URL.
   - `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` /
     `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` — from the Google OAuth
     client you create in step 4.
   - `CORS_ALLOWED_ORIGINS` (optional) — comma-separated origin list.
     When set, the `send-push` function narrows from `*`. See PR #128.
   - `SEND_PUSH_RATE_MAX` (optional) — defaults to 30 sends/minute
     per caller. See PR #130.

## 2. Google OAuth for production

1. <https://console.cloud.google.com> → APIs & Services → Credentials.
2. New OAuth 2.0 Web client.
3. **Authorized JS origins**: your Vercel domain
   (e.g. `https://reservist.vercel.app` or your custom one).
4. **Authorized redirect URI**: `https://<project-ref>.supabase.co/auth/v1/callback`.
5. Paste client id + secret into Supabase Edge Function secrets (step 1).

## 3. Vercel project setup

1. <https://vercel.com> → Add New → Project → Import this repo.
2. **Root directory**: `web/`.
3. **Build command**: leave default (Vite).
4. **Environment variables** (Production scope, see `web/.env.production.example`):
   - `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = anon key from Supabase project API settings
   - `VITE_VAPID_PUBLIC_KEY` = same value as `VAPID_PUBLIC_KEY` set in step 1
   - Do **not** set `VITE_MOCK_AUTH` in production.
5. Run `vercel link` locally once to seed `.vercel/project.json`. From
   that file extract:
   - `VERCEL_ORG_ID` (orgId)
   - `VERCEL_PROJECT_ID` (projectId)
6. Mint a Vercel token at <https://vercel.com/account/tokens>.

## 4. GitHub repo secrets

Repo Settings → Secrets and variables → Actions → New repository secret:

| name | value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | PAT from step 1.3 |
| `SUPABASE_PROJECT_REF` | from step 1.2 |
| `SUPABASE_DB_PASSWORD` | from step 1.2 |
| `VERCEL_TOKEN` | from step 3.6 |
| `VERCEL_ORG_ID` | from step 3.5 |
| `VERCEL_PROJECT_ID` | from step 3.5 |

## 5. First deploy

Push any commit to `main`. Both workflows fire:

- `.github/workflows/deploy-supabase.yml` runs `supabase link`,
  `supabase db push` (apply migrations), `supabase functions deploy`.
- `.github/workflows/deploy-vercel.yml` runs `vercel pull`,
  `vercel build --prod`, `vercel deploy --prebuilt --prod`.

Both no-op cleanly when the corresponding secret is absent — partial
setup is safe.

## 6. Smoke test

After deploy:

1. Visit the Vercel URL → see the login picker.
2. Click "Sign in with Google" → OAuth round-trip → land on dashboard.
3. As commander, open Settings → Invite link → copy → open in incognito.
4. New invitee can sign in, claim profile, join team.
5. Commander assigns invitee to a slot → invitee gets a push (if VAPID is
   configured and the device has accepted notifications).

## Common failures

| symptom | cause | fix |
|---|---|---|
| `db push` hangs forever | `SUPABASE_DB_PASSWORD` missing | Set the secret. PR #131 guard catches this with an upfront error. |
| OAuth redirect mismatch | Google client's redirect URI doesn't match Supabase callback | Reread step 2.4. |
| Deep link 404 (e.g. `/join/xyz`) | SPA rewrite missing | `vercel.json` from PR #132 should handle this; check Vercel deploy logs. |
| Push works locally but not on iOS | Not installed to Home Screen, or VAPID misconfigured | iOS 16.4+ requires standalone install. Re-check `VAPID_*` secrets. |
| 429 from `send-push` | Per-caller rate limit hit | Raise `SEND_PUSH_RATE_MAX` if legit, or investigate the caller. |

## Rollback

Each workflow runs idempotently. To roll back:

- **Web**: redeploy a prior commit via Vercel dashboard → Deployments → Promote.
- **DB**: write a forward-fix migration. Supabase doesn't have first-class
  "revert last migration" without snapshots, and `supabase db reset` is
  destructive.
- **Edge Functions**: redeploy the prior file via `supabase functions
  deploy` from a checkout of the prior commit.
