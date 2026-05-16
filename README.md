# Reservist App

Grassroots coordination tool for IDF reservist commanders and reservists. Web dashboard for commanders, PWA reservist surface for self-service.

See [`Reservist_App_PRD_v1.md`](./Reservist_App_PRD_v1.md) for the product spec.

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vite + React + TypeScript, TanStack Query, PWA via `vite-plugin-pwa` |
| Backend | Self-hosted Supabase (Postgres + PostgREST + GoTrue + Realtime) via Docker |
| Auth | Mock login picker (MVP). Phone OTP / magic link / anon-sign-in to land in v1.x |
| Local HTTPS | `@vitejs/plugin-basic-ssl` + Vite proxy for Supabase same-origin |
| Tests | Vitest (unit + REST integration) |

## Repo layout

```
reservist_app/
├── Reservist_App_PRD_v1.md         product spec
├── reference/                      pristine HTML/JSX design prototype
├── supabase/                       migrations + seed.sql + config.toml
│   ├── migrations/                 ordered SQL files
│   └── seed.sql                    Mahlaka 6 — Carmel demo data
├── web/                            Vite app
│   ├── src/                        app code (Dashboard, ReservistDashboard, components, lib)
│   ├── test/                       vitest unit + integration
│   └── vite.config.ts              dev server + PWA + SSL + Supabase proxy
└── .claude/agents/                 project subagent briefs (Claude Code)
```

## Local dev

Prerequisites: Docker, Node 22+, `gh` (optional), `supabase` CLI v2 (`~/.local/bin/supabase` or PATH).

```sh
# 1. Bring up Supabase locally (Postgres on 54322, REST on 54321, Studio on 54323)
~/.local/bin/supabase start

# 2. Frontend
cd web
cp .env.example .env
npm install
npm run dev          # https://localhost:5174 + http://10.0.0.<x>:5174 on LAN
```

First HTTPS visit shows a self-signed cert warning — accept once. Vite proxies `/rest`, `/auth`, `/realtime`, `/storage`, `/functions` to Supabase so the page stays same-origin.

## Mobile / PWA

Open the LAN URL on a phone. Android Chrome can install via ⋮ → "Install app". iOS Safari needs a trusted cert (mkcert install or real cert) before SW will fully register.

## Tests

```sh
cd web
npm test                  # all (Supabase must be running for integration suite)
npm run test:unit         # unit only
npm run test:integration  # REST roundtrip suite
npm run test:watch        # interactive
```

## Reset DB

```sh
~/.local/bin/supabase db reset
```

Re-runs migrations + `seed.sql`. Destroys local data.

## Subagent team

`/reload-plugins` in Claude Code loads `.claude/agents/*.md`:

| Agent | Use for |
|-------|---------|
| `db-engineer` | Schema, migrations, RLS, seed, views |
| `frontend-designer` | Visual design, tokens, components |
| `ux-engineer` | Flows, forms, copy, a11y |
| `mobile-pwa-specialist` | PWA, SW, mobile layout, iOS quirks |
| `auth-rls-specialist` | Supabase Auth, RLS scoping |
| `ts-contract-keeper` | tsc-error cleanup |
| `reservist-reviewer` | Read-only review vs PRD + design system |

See `.claude/agents/README.md` for coordination rules.

## Status (MVP)

Commander dashboard: roster + filters + drawer, slots (CRUD + draft/publish/cancel + conflict detection), join requests + approval, activity feed with filters, settings (roles/skills CRUD, invite link, RTL toggle), realtime cross-client updates, account deletion.

Reservist dashboard: profile, self status + note + until, my upcoming duty.

Not shipped: web push, phone OTP, RLS scoping per unit, Hebrew copy catalog (RTL layout works, strings still English).
