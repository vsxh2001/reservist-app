# Divisions / Projects / Teams — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Re-architect from a single `units` row to `Division → Project → Team → Members`, with team-scoped operational data and per-team commanders.

**Architecture:** Phase 1 lands DB + lib contract in parallel worktrees. Phase 2 lands commander + reservist UI in parallel. Phase 3 updates tests.

**Spec:** `docs/superpowers/specs/2026-05-16-divisions-projects-teams-design.md`.

---

## Locked contract (read before assigning agents)

### Type contract — `web/src/lib/types.ts` (new exports)

```ts
export interface Division { id: string; name: string; created_at: string }

export interface Project { id: string; division_id: string; name: string; sort_idx: number }

export interface Team {
  id: string; project_id: string; division_id: string;
  name: string; crest: string; invite_code: string | null;
  established: string | null;
  member_count: number; commander_count: number;
  project_name: string;
}

export type TeamRole = 'soldier' | 'commander';

export interface TeamMembership { team_id: string; role: TeamRole }

// `Member` GAINS `division_id`, `teams: TeamMembership[]`; LOSES `unit_id`, `is_commander`, `role`.
```

### Query contract — `web/src/lib/queries.ts` (new + renamed hooks)

```
useDivision()                          → Division | null   (the seeded one for MVP)
useTeamsForMember(memberId)            → Team[]            (teams the member is on)
useTeamsForDivision(divisionId)        → Team[]            (commander-of-N view — flat list)
useTeam(teamId)                        → Team | null

// Renamed (old → new), unit_id → team_id everywhere:
useMembers(teamId)                     ← was unit
useSkills(divisionId)                  ← skills are division-scoped
useSlots(teamId)
useActivity(teamId)
useJoinRequests(teamId)
useSlotsByMember(memberId)             — unchanged (uses slot_assignees)
useMemberDeploymentWindows(memberId, teamId)
useMyDeploymentWindows(userId, teamId)
useUnitDayAggregate(teamId, dateISO)   → renamed useTeamDayAggregate
useApprovedPicksForUnit(unitId)        → renamed useApprovedPicksForTeam(teamId)

// Brand-new:
useUpdateTeamMembership({ teamId, memberId, role })  → upserts the team_members row
useRemoveTeamMembership({ teamId, memberId })        → deletes the row

// All other mutations (createSlot, updateStatus, etc.) take `teamId` where they previously took `unitId`.
```

### Active-team context — `web/src/lib/team-context.tsx` (new file)

```ts
export function TeamProvider({ children }: { children: ReactNode })
export function useActiveTeam(): { team: Team | null; setTeamId(id: string): void; teams: Team[] }
```

Wraps the user's available teams (via `useTeamsForMember`), persists the active team id in `localStorage`, exposes a switcher.

---

## File structure

**Create (Agent A — DB):**
- `supabase/migrations/<ts>_divisions_projects_teams.sql`

**Modify (Agent A):**
- `supabase/seed.sql` — full rewrite for new shape

**Create (Agent B — lib):**
- `web/src/lib/team-context.tsx`

**Rewrite (Agent B):**
- `web/src/lib/types.ts` — Division/Project/Team/TeamRole/TeamMembership; Member loses `unit_id` + `is_commander` + `role`; `Filters` unchanged.
- `web/src/lib/queries.ts` — entire file: rename unit_id → team_id; add new hooks per contract.
- `web/src/lib/realtime.ts` — `useRealtime(teamId)` now; subscriptions filter by `team_id`.

**Modify (Agent C — commander UI):**
- `web/src/Dashboard.tsx` — consumes `useActiveTeam`, passes `activeTeam` down.
- `web/src/components/Sidebar.tsx` — team picker header; nav unchanged.
- `web/src/components/Roster.tsx` — `members` filtered by team membership; commander toggle is per-team.
- `web/src/components/PersonDrawer.tsx` — "Permissions" section becomes per-team-membership editor (add/remove team, toggle role).
- `web/src/components/SlotsScreen.tsx`, `SlotDrawer.tsx`, `NewSlotModal.tsx`, `RequestsScreen.tsx`, `ActivityScreen.tsx`, `CalendarScreen.tsx`, `CommanderDayView.tsx`, `SettingsScreen.tsx`, `DeploymentWindowDrawer.tsx` — `unitId` prop / `useUnit()` → `activeTeam.id` / `useActiveTeam()`.

**Modify (Agent D — reservist + auth + app):**
- `web/src/ReservistDashboard.tsx` — team picker if multi-team; queries filtered by active team.
- `web/src/components/ClaimProfileScreen.tsx` — unchanged surface; reads team membership after claim.
- `web/src/components/JoinScreen.tsx` — joins a team, not a unit; `join_requests.team_id`.
- `web/src/components/LoginPicker.tsx` — mock picker lists all members, sets active team to first team they're on.
- `web/src/components/DeploymentPickScreen.tsx` — already team-scoped via window; no change beyond import paths.
- `web/src/App.tsx` — wrap `<Gate>` with `<TeamProvider>` (after `<AuthProvider>` so it can read the signed-in member).

**Modify (Agent E — tests, runs last):**
- `web/test/integration/schema.test.ts` — assert new tables, joins, member_count column on `teams_view`.
- `web/test/integration/mutations.test.ts` — replace `unit_id` references with team_id; verify `team_members` round-trip.
- `web/test/integration/deployment.test.ts` — `team_id` on windows.
- `web/test/types.test.ts` — type assertions for new shapes.

---

## Phase 1 — DB + lib (parallel: A + B)

### Task A1: Schema migration + seed

**Files:**
- Create: `supabase/migrations/<ts>_divisions_projects_teams.sql`
- Rewrite: `supabase/seed.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/<ts>_divisions_projects_teams.sql
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

-- Migrate existing `units` data into the new chain, preserving ids where useful.
do $$
declare
  div_id   uuid;
  proj_id  uuid;
  team_id  uuid;
  u        record;
begin
  for u in select * from units loop
    insert into divisions (id, name) values (gen_random_uuid(), u.name)
      returning id into div_id;
    insert into projects (division_id, name, sort_idx) values (div_id, 'Carmel', 0)
      returning id into proj_id;
    insert into teams (id, project_id, name, crest, invite_code, established)
      values (u.id, proj_id, u.short_name, u.crest, u.invite_code, u.established)
      returning id into team_id;
    -- members.unit_id keeps the same value as the new team_id (we preserve u.id above).
  end loop;
end $$;

-- members: drop unit_id, add division_id, drop is_commander, port memberships.
alter table members add column division_id uuid references divisions(id) on delete cascade;
update members m set division_id = (select division_id from projects p where p.id = (select project_id from teams t where t.id = m.unit_id));
alter table members alter column division_id set not null;

insert into team_members (team_id, member_id, role, joined_at)
select m.unit_id, m.id,
       case when m.is_commander then 'commander'::team_role_enum else 'soldier'::team_role_enum end,
       m.created_at
from members m
where m.unit_id is not null;

alter table members drop column is_commander;
alter table members drop column role_id; -- the deprecated military-role field
alter table members drop column unit_id;

-- skills: unit_id → division_id
alter table skills add column division_id uuid references divisions(id) on delete cascade;
update skills s set division_id = (select division_id from projects p where p.id = (select project_id from teams t where t.id = s.unit_id));
alter table skills alter column division_id set not null;
alter table skills drop constraint if exists skills_unit_id_name_key;
alter table skills drop column unit_id;
create unique index skills_division_name_idx on skills(division_id, name);

-- slots, deployment_windows, activity_log, join_requests: unit_id → team_id
alter table slots rename column unit_id to team_id;
alter table slots add constraint slots_team_fk foreign key (team_id) references teams(id) on delete cascade;
alter table slots drop constraint slots_unit_id_fkey;

alter table deployment_windows rename column unit_id to team_id;
alter table deployment_windows add constraint deployment_windows_team_fk foreign key (team_id) references teams(id) on delete cascade;
alter table deployment_windows drop constraint deployment_windows_unit_id_fkey;

alter table activity_log rename column unit_id to team_id;
alter table activity_log add constraint activity_log_team_fk foreign key (team_id) references teams(id) on delete cascade;
alter table activity_log drop constraint activity_log_unit_id_fkey;

alter table join_requests rename column unit_id to team_id;
alter table join_requests add constraint join_requests_team_fk foreign key (team_id) references teams(id) on delete cascade;
alter table join_requests drop constraint join_requests_unit_id_fkey;
-- Also drop the deprecated role_name column on join_requests (PRD v1.1).
alter table join_requests drop column if exists role_name;

-- Drop the now-empty roles table and the old units table (it was a one-row holder).
drop table if exists roles;
drop table if exists units;

-- Rebuild members_view to expose teams as jsonb + drop the role column.
drop view if exists members_view;
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

-- Rebuild slots_view + deployment_windows_view with team_id projected through.
drop view if exists slots_view;
create view slots_view as
select
  s.id, s.team_id, s.title, s.urgent, s.state,
  s.start_at, s.end_at, s.duration, s.location, s.needed, s.notes,
  s.created_at,
  coalesce(
    (select jsonb_agg(jsonb_build_object('name', sk.name, 'min_level', ss.min_level) order by sk.name)
       from slot_skills ss join skills sk on sk.id = ss.skill_id
       where ss.slot_id = s.id),
    '[]'::jsonb
  ) as skills,
  coalesce(
    (select array_agg(sa.member_id) from slot_assignees sa where sa.slot_id = s.id),
    array[]::uuid[]
  ) as assignee_ids,
  (select count(*)::int from slot_assignees sa where sa.slot_id = s.id) as filled
from slots s;

drop view if exists deployment_windows_view;
create view deployment_windows_view as
select
  w.*,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'proposed')  as proposed_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'approved')  as approved_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'rejected')  as rejected_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'withdrawn') as withdrawn_count
from deployment_windows w;

create view teams_view as
select
  t.id, t.project_id, t.name, t.crest, t.invite_code, t.established, t.created_at,
  p.division_id, p.name as project_name,
  (select count(*)::int from team_members tm where tm.team_id = t.id) as member_count,
  (select count(*)::int from team_members tm where tm.team_id = t.id and tm.role = 'commander') as commander_count
from teams t
join projects p on p.id = t.project_id;

-- Helper for future RLS.
create or replace function is_commander_of(team uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members tm
    join members m on m.id = tm.member_id
    where tm.team_id = team and tm.role = 'commander' and m.auth_user_id = auth.uid()
  );
$$;
grant execute on function is_commander_of(uuid) to anon, authenticated;

-- Permissive anon policies for the new tables (MVP).
alter table divisions    enable row level security;
alter table projects     enable row level security;
alter table teams        enable row level security;
alter table team_members enable row level security;

create policy "anon read divisions"    on divisions    for select using (true);
create policy "anon read projects"     on projects     for select using (true);
create policy "anon read teams"        on teams        for select using (true);
create policy "anon read team_members" on team_members for select using (true);
create policy "anon write divisions"    on divisions    for all using (true) with check (true);
create policy "anon write projects"     on projects     for all using (true) with check (true);
create policy "anon write teams"        on teams        for all using (true) with check (true);
create policy "anon write team_members" on team_members for all using (true) with check (true);

-- Realtime publications
alter publication supabase_realtime add table team_members;
alter publication supabase_realtime add table teams;
```

- [ ] **Step 2: Rewrite `supabase/seed.sql`**

Rewrite to seed:
- 1 division `Mahlaka 6`
- 1 project `Carmel`
- 1 team `Mahlaka 6 — Carmel` (inherits crest M6, invite_code carmel-6-J3xK)
- 24 `members` with `division_id`
- 24 `team_members` rows: `Yoni Avraham` and `Daniel Katz` as commanders, rest as soldiers
- skills with `division_id`
- member_skills (with levels — unchanged)
- 3 slots with `team_id`
- 1 deployment window (Avi Mizrahi)
- activity_log entries with `team_id`

Same structure as the prior seed but routed through the new chain. Use a CTE pattern.

- [ ] **Step 3: Apply + verify**

```bash
~/.local/bin/supabase db reset --workdir /home/hadassi/Code/reservist_app
KEY=$(grep VITE_SUPABASE_ANON_KEY /home/hadassi/Code/reservist_app/web/.env | cut -d= -f2)
curl -s "http://127.0.0.1:54321/rest/v1/teams_view?select=name,member_count,commander_count" -H "apikey: $KEY"
# expect: one row, member_count=24, commander_count=2
curl -s "http://127.0.0.1:54321/rest/v1/members_view?name=eq.Yoni%20Avraham&select=name,teams,skills" -H "apikey: $KEY"
# expect: teams contains one row with role='commander'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/ supabase/seed.sql
git commit -m "feat(db): divisions/projects/teams schema + team_members + migration of existing data"
```

### Task B1: lib/types.ts + queries.ts + realtime.ts + team-context.tsx

**Files:**
- Rewrite: `web/src/lib/types.ts`
- Rewrite: `web/src/lib/queries.ts`
- Rewrite: `web/src/lib/realtime.ts`
- Create: `web/src/lib/team-context.tsx`

Per the **Locked contract** above. Match the hook signatures exactly. Component agents (C, D) consume them.

- [ ] **Step 1: Types**

Update `Member` interface: drop `unit_id`, `is_commander`, `role`. Add `division_id`, `teams: TeamMembership[]`. Add `Division`, `Project`, `Team`, `TeamRole`, `TeamMembership` exports. Keep all status/skills/conflict types unchanged.

- [ ] **Step 2: Queries**

Rewrite every hook that previously took `unitId` to take `teamId`. Add new hooks per the contract. Match query key conventions (`['team', teamId]`, `['teams-for-member', memberId]`, etc.). Reuse the existing `supabase` client.

- [ ] **Step 3: Realtime**

`useRealtime(teamId: string | undefined)`. Filter all relevant tables by `team_id=eq.${teamId}`. Subscriptions: members (no team filter — division-wide read, but invalidate `['members', teamId]` since members are now joined via team_members; we'll over-invalidate for simplicity), team_members, slots, slot_assignees, deployment_windows, deployment_picks, activity_log, join_requests.

- [ ] **Step 4: TeamProvider**

```ts
// web/src/lib/team-context.tsx
export function TeamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const teams = useTeamsForMember(user?.id);
  const [activeTeamId, setActive] = useState<string | null>(
    () => localStorage.getItem('reservist.activeTeam'),
  );
  useEffect(() => {
    if (!teams.data?.length) return;
    if (activeTeamId && teams.data.some((t) => t.id === activeTeamId)) return;
    const first = teams.data[0].id;
    setActive(first);
    localStorage.setItem('reservist.activeTeam', first);
  }, [teams.data, activeTeamId]);
  const setTeamId = (id: string) => { setActive(id); localStorage.setItem('reservist.activeTeam', id); };
  const team = (teams.data ?? []).find((t) => t.id === activeTeamId) ?? null;
  return <Ctx.Provider value={{ team, setTeamId, teams: teams.data ?? [] }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 5: TS check**

```
cd /home/hadassi/Code/reservist_app/web && npx tsc --noEmit
```

Expected: 0 errors. (Components will not compile — that's expected during Phase 1. Don't include `src/components/**` or `src/Dashboard.tsx` etc. in tsc's pass — actually we can't easily exclude. So this step will report errors in components that still import old names. Document the count; merge moves to Phase 2.)

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/
git commit -m "feat(lib): division/project/team type contract + queries + realtime + TeamProvider"
```

---

## Phase 2 — Commander + reservist UI (parallel: C + D, both depend on Phase 1)

### Task C1: Commander UI rewrite

**Files (modify):**
- `web/src/Dashboard.tsx`
- `web/src/components/{Sidebar,Roster,PersonDrawer,SlotsScreen,SlotDrawer,NewSlotModal,RequestsScreen,ActivityScreen,CalendarScreen,CommanderDayView,SettingsScreen,DeploymentWindowDrawer}.tsx`

- [ ] **Step 1: Sidebar team-picker header**

Replace the current "M6" crest + unit-name block with a button that opens a dropdown listing all teams the user is on (`useActiveTeam().teams`). Click sets `setTeamId`. Show the active team's crest + name. If only one team, render static (no dropdown affordance).

- [ ] **Step 2: Dashboard rescoping**

Replace `const unit = useUnit();` with `const { team } = useActiveTeam();`. Every downstream query takes `team?.id` instead of `unit.data?.id`. The early return `if (!team)` shows "Pick a team" or auto-redirects on multi-team accounts.

- [ ] **Step 3: PersonDrawer permissions section**

Replace the single "Promote to commander" toggle with a per-team list:
```
For each team this member is on:
  [team name] · role=[soldier|commander]  [Toggle role]  [Remove from team]
```
Plus an "+ Add to a team" affordance that lists teams the member is NOT on (filtered to those the signed-in user commands). Backed by `useUpdateTeamMembership` + `useRemoveTeamMembership`.

- [ ] **Step 4: Slot / activity / calendar / requests / settings rescoping**

Every component currently taking `unitId` as a prop or calling `useUnit()` takes `team.id` from `useActiveTeam()`. Mutations that wrote `unit_id` write `team_id`.

- [ ] **Step 5: TS check + lint + tests**

```
cd /home/hadassi/Code/reservist_app/web
npx tsc --noEmit
npm run lint
npm test
```

All green (tests will be updated by Agent E in Phase 3 — for Phase 2, accept that some integration tests break; unit tests should still pass).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(commander): rescope all surfaces to active team via TeamProvider"
```

### Task D1: Reservist + auth + app shell

**Files (modify):**
- `web/src/ReservistDashboard.tsx`
- `web/src/components/JoinScreen.tsx`
- `web/src/components/LoginPicker.tsx`
- `web/src/App.tsx`

- [ ] **Step 1: App.tsx wraps `<TeamProvider>`**

```tsx
<QueryClientProvider client={qc}>
  <PrefsProvider>
    <AuthProvider>
      <ErrorBoundary>
        <TeamProvider>
          <Gate />
        </TeamProvider>
      </ErrorBoundary>
    </AuthProvider>
  </PrefsProvider>
</QueryClientProvider>
```

Order matters: TeamProvider needs Auth context.

- [ ] **Step 2: ReservistDashboard team picker**

If `teams.length > 1`, render a chip row at the top: each team's name, selecting it sets active team. Default = first team. All downstream queries take active team.

- [ ] **Step 3: JoinScreen → team invite**

`useTeamByInvite(code)` query: looks up `teams` by `invite_code`. The join request inserts `{ team_id, name, phone, skill_names, note }`. Removes the deprecated `role_name` field (already dropped in DB migration).

- [ ] **Step 4: LoginPicker (mock branch)**

Mock branch now picks a member + sets the active team to that member's first team. Read members from `members_view`; teams come via the embedded `teams` jsonb on each member row.

- [ ] **Step 5: TS check + commit**

```
npx tsc --noEmit && git commit -am "feat(reservist+app): TeamProvider plumbing + JoinScreen team-scoped"
```

---

## Phase 3 — Tests + final smoke

### Task E1: Test updates

**Files:**
- `web/test/integration/schema.test.ts`
- `web/test/integration/mutations.test.ts`
- `web/test/integration/deployment.test.ts`
- `web/test/types.test.ts`

- [ ] **Step 1: schema.test.ts**

Assert the new chain: one division → one project → one team. `teams_view.member_count` = 24. `members_view.teams` jsonb shape contains role.

- [ ] **Step 2: mutations.test.ts**

Replace every `unit_id` reference with `team_id`. Add a `team_members` round-trip test: insert a team, insert a `team_members` row, verify `teams_view.member_count` updates.

- [ ] **Step 3: deployment.test.ts**

`team_id` on the test window. Helper member is `Eitan Cohen`; ensure `team_members` row exists for him.

- [ ] **Step 4: types.test.ts**

Add cases for `findMyTeams(member, role?)` helper if added.

- [ ] **Step 5: Full suite green**

```
cd /home/hadassi/Code/reservist_app/web && npm test
```

Expect 80+ tests passing.

- [ ] **Step 6: Commit + open PR**

```
git checkout -b feat/divisions-projects-teams
git push -u origin feat/divisions-projects-teams
gh pr create --base main --head feat/divisions-projects-teams --title "feat: Division → Project → Team re-architecture"
```

Wait for CI green; merge.

---

## Self-review

- Spec coverage: every spec section maps to at least one task. ✓
- No placeholders: each step has concrete code/commands. ✓
- Type drift: query signatures locked in the contract; agents must match exactly.
- Scope: large but coherent — one PR. If it gets bigger than ~30 files, split commander vs reservist into two PRs.
