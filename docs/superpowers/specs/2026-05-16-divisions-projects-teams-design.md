# Divisions, Projects, Teams — Design Spec

**Status:** Draft
**Date:** 2026-05-16
**Scope:** Re-architecture of the org hierarchy. Replaces the single-`units` model with Division → Project → Team. Members pool at division; operational data (slots, deployments, activity, join requests) lives at team. Commanders are team-scoped, multi-commander per team supported.

## 1. Concept

```
Division
  └─ Project    (organizational container — no permissions, no data)
       └─ Team  (operational; commanders + slots + deployments + activity)
            └─ Members (assigned via team_members join row)
```

- A **member** belongs to one **division** (the identity pool). They can be on any number of **teams** concurrently, with a per-team role (`soldier` or `commander`).
- A **team** can have many commanders. A person can be commander of multiple teams.
- A **project** is purely a labelled folder for grouping teams in UI. It has no operational data and no permissions.

## 2. Data model

### New tables

```sql
create table divisions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table projects (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references divisions(id) on delete cascade,
  name         text not null,
  sort_idx     int  not null default 0
);

create table teams (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  name         text not null,
  crest        text not null default '?',
  invite_code  text unique,
  established  text,
  created_at   timestamptz not null default now()
);

create type team_role_enum as enum ('soldier', 'commander');

create table team_members (
  team_id    uuid not null references teams(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  role       team_role_enum not null default 'soldier',
  joined_at  timestamptz not null default now(),
  primary key (team_id, member_id)
);
create index team_members_member_idx on team_members(member_id);
```

### Modified tables

- `members`: drop `unit_id`, add `division_id uuid not null references divisions(id) on delete cascade`. Drop `is_commander` (now per-team via `team_members.role`). Keep `auth_user_id`, `email`, and the rest.
- `skills`: rename `unit_id` to `division_id`. Skill taxonomy is division-level.
- `slots`, `deployment_windows`, `activity_log`, `join_requests`: rename `unit_id` to `team_id`. FKs point at `teams(id)` on delete cascade.

### New view: `teams_view`

Exposes per-team counts useful for the sidebar + roster:

```sql
create view teams_view as
select
  t.id, t.project_id, t.name, t.crest, t.invite_code, t.established, t.created_at,
  p.division_id, p.name as project_name,
  (select count(*)::int from team_members tm where tm.team_id = t.id) as member_count,
  (select count(*)::int from team_members tm where tm.team_id = t.id and tm.role = 'commander') as commander_count
from teams t
join projects p on p.id = t.project_id;
```

### Modified view: `members_view`

Replaces the deprecated `role` column with a per-team relations array. The view returns one row per member with their teams encoded as jsonb:

```sql
create view members_view as
select
  m.id, m.division_id, m.name, m.initials, m.tone, m.phone,
  m.joined, m.last_seen, m.calls_this_year,
  m.status, m.status_note, m.status_until, m.status_set_at,
  m.auth_user_id, m.email,
  coalesce(
    (select jsonb_agg(jsonb_build_object('team_id', tm.team_id, 'role', tm.role) order by tm.joined_at)
       from team_members tm where tm.member_id = m.id),
    '[]'::jsonb
  ) as teams,
  coalesce(
    (select jsonb_agg(jsonb_build_object('name', s.name, 'level', ms.level)
       order by case ms.level when 'senior' then 0 when 'intermediate' then 1 else 2 end, s.name)
     from member_skills ms join skills s on s.id = ms.skill_id
     where ms.member_id = m.id),
    '[]'::jsonb
  ) as skills
from members m;
```

A separate `team_members_view` is *not* added; `members_view.teams` covers it.

### Helper function

```sql
create or replace function is_commander_of(team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    join members m on m.id = tm.member_id
    where tm.team_id = team
      and tm.role = 'commander'
      and m.auth_user_id = auth.uid()
  );
$$;
grant execute on function is_commander_of(uuid) to anon, authenticated;
```

Used by future RLS policies. Permissive anon policies remain for MVP.

## 3. Permissions

**MVP keeps RLS permissive.** The schema is shaped so a follow-up migration can tighten it without further refactoring:

- Read on team-scoped tables (`slots`, `deployment_windows`, `activity_log`, `join_requests`): `team_id in (select team_id from team_members tm join members m on m.id = tm.member_id where m.auth_user_id = auth.uid())`.
- Write on team-scoped tables: same, plus `is_commander_of(team_id)`.
- Read on `members`: `division_id = current_division()` (function added in tightening migration; for MVP, anon).

This second migration is **not** part of this spec.

## 4. Migration mapping

The existing single seeded unit and its data convert deterministically:

1. Create one `divisions` row named `Mahlaka 6`.
2. Create one `projects` row `Carmel` under it.
3. Create one `teams` row inheriting `name`, `crest`, `established`, `invite_code` from the current `units` row. Project = Carmel.
4. Migrate each existing `members` row:
   - `unit_id` → drop; add `division_id` = the new division id.
   - Insert one `team_members` row per member: `(team_id = new_team, member_id, role = 'commander' if old is_commander else 'soldier')`.
   - Drop `members.is_commander`.
5. Rewrite `skills`, `slots`, `slot_*`, `deployment_*`, `activity_log`, `join_requests` `unit_id` → equivalent `team_id` or `division_id`.

All of this is a single migration file + an updated seed. The reset path (`supabase db reset`) is destructive locally; data isn't migrated on remote (no prod). The migration is written for forward-only application.

## 5. UI surfaces

### Sidebar

- New top section above current nav: **team picker**. Shows the team's crest + name. Click → dropdown listing all teams the signed-in member is on, with their role badge. Switching teams sets the active team in client context (persisted to `localStorage`).
- If the member is on exactly one team, no dropdown — just the static header.
- `useActiveTeam()` is a new hook in `lib/team-context.tsx`.

### Dashboard

- All queries take `activeTeamId` instead of `unitId`.
- `useTeam(activeTeamId)` replaces `useUnit()`.
- Sidebar nav, Roster, SlotsScreen, ActivityScreen, CalendarScreen, CommanderDayView, RequestsScreen, SettingsScreen, NewSlotModal, SlotDrawer, PersonDrawer, DeploymentWindowDrawer all rescope to the active team. PersonDrawer's permissions section now shows team-scoped commander toggles, not global.

### Reservist dashboard

- If the user is on multiple teams, a small team picker at the top (chips). Picking a team filters "My next deployment" + "My upcoming duty" to that team.
- The team picker defaults to the most-recently-active team.

### Onboarding

- `LoginPicker` + `ClaimProfileScreen` unchanged — identity is still division-level.
- `JoinScreen` (the `?join=<code>` flow) now joins a **team** by invite code, not the deprecated unit. The `join_requests.team_id` column.

### Permissions surface

- `PersonDrawer` "Permissions" section: per-team-membership editor (add/remove from teams, toggle commander role on each team they're on). Backed by `team_members` mutations.
- Removing a member from all their teams keeps them in the division pool — they don't disappear from `members`. A separate "Remove from division" action (not in this spec) would `DELETE FROM members`.

## 6. Out of scope v1

- Cross-team soldier transfer (search division pool, add to team) — surfaces as a future "Recruit from division" flow.
- Division-admin tier separate from team commanders.
- Project-level reporting (cross-team aggregation).
- Skill taxonomy editor at division level (the schema supports it; the UI lives in SettingsScreen and is per-team today; updating that is a follow-up).
- Tightened RLS using `is_commander_of()` — separate migration.

## 7. Testing

- Integration suite (`web/test/integration/`) gets one new file: `divisions.test.ts` covering division → project → team chain and `team_members` role transitions.
- All existing integration tests get rewritten to operate on the new seed (one team holds the 24 members).
- Unit tests in `web/test/types.test.ts` get a `findMyTeams(member)` helper test.

## 8. Risks

- **Schema shape is invasive.** Every existing table holding `unit_id` gets renamed. Every component referencing `unit.id` or `useUnit()` needs an edit. Mitigation: explicit contract in `lib/types.ts` so each implementing agent works against the same names.
- **Active-team context is now stateful client-side.** Multi-team commanders see one team at a time; switching teams reruns queries. Use TanStack Query keys that include `activeTeamId` so caches don't bleed.
- **Realtime channel topology** is now per-team. `useRealtime(unitId)` becomes `useRealtime(teamId)`, called once per mounted dashboard. If a user is on N teams, only the active team's channel is subscribed — switching teams unsubscribes the old.
- **Demo seed populates a single team.** Demonstrates the chain but doesn't exercise multi-team flows until you add a second team manually after running the seed.
