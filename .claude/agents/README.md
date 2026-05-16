# Reservist App — Subagent Team

Project-scoped subagents. Triggered by description match or named explicitly via `Agent(subagent_type: "<name>")`.

| Agent | When to use |
|-------|-------------|
| `db-engineer` | Postgres schema, migrations, RLS, seed, views. |
| `frontend-designer` | Visual design, tokens, layout, component aesthetics. |
| `ux-engineer` | Interaction, flows, form/filter UX, copy, a11y. |
| `mobile-pwa-specialist` | PWA, SW, mobile layout, iOS quirks, push, install. |
| `auth-rls-specialist` | Supabase Auth (OTP / magic link / anon), RLS scoping, multi-unit isolation. |
| `ts-contract-keeper` | Fix `tsc` errors after refactors. Behavior-preserving only. |
| `reservist-reviewer` | Read-only code review against PRD + type contract + design system. |

## Coordination rules

1. **DB first**, then frontend agents in parallel — schema is the contract everything reads.
2. **`lib/types.ts` is frozen** during a parallel run. Whoever owns it (usually orchestrator) updates it first, then dispatches.
3. **Disjoint file scopes** when running agents in parallel. Each agent's `.md` lists owned + off-limits surfaces.
4. **Reviewer at the end**, not interleaved — it sees uncommitted diff.

## Re-using briefs

The agent `.md` body is the system prompt for that subagent. Edit those files to evolve role over time — for example, when real auth lands, the `auth-rls-specialist` brief should be updated with the new patterns and the `frontend-designer` brief should mention that LoginPicker has been replaced.
