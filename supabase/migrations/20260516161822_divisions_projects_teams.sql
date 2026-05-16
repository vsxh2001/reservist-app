-- Migration: divisions / projects / teams
-- Restructures the single-unit flat schema into Division → Project → Team hierarchy.
-- Members pool at division level; operational data (slots, deployments, activity) scopes to team.

-- ─────────────────────────────────────────
-- 0. Drop views that reference columns we are about to change
-- ─────────────────────────────────────────
drop view if exists deployment_windows_view;
drop view if exists slots_view;
drop view if exists members_view;

-- ─────────────────────────────────────────
-- 1. New tables & types
-- ─────────────────────────────────────────
create type team_role_enum as enum ('commander', 'soldier');

create table divisions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table projects (
  id           uuid primary key default gen_random_uuid(),
  division_id  uuid not null references divisions(id) on delete cascade,
  name         text not null,
  created_at   timestamptz not null default now()
);

-- teams reuses the current units row id (captured below) so FK renames keep pointing at valid data
create table teams (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  division_id  uuid not null references divisions(id) on delete cascade,
  name         text not null,
  short_name   text,
  crest        text,
  invite_code  text unique,
  established  text,
  created_at   timestamptz not null default now()
);

create table team_members (
  team_id    uuid not null references teams(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  role       team_role_enum not null default 'soldier',
  joined_at  timestamptz not null default now(),
  primary key (team_id, member_id)
);

-- ─────────────────────────────────────────
-- 2a. DDL: add division_id to members; rename unit_id/team_id across tables
--    (must happen unconditionally — even on a fresh db reset)
-- ─────────────────────────────────────────

-- members: add division_id
alter table members add column division_id uuid references divisions(id) on delete cascade;

-- skills: rename unit_id → division_id, rebuild constraint
alter table skills rename column unit_id to division_id;
alter table skills drop constraint if exists skills_unit_id_fkey;
alter table skills add constraint skills_division_id_fkey
  foreign key (division_id) references divisions(id) on delete cascade;
alter table skills drop constraint if exists skills_unit_id_name_key;
alter table skills add constraint skills_division_id_name_key unique (division_id, name);

-- slots: rename unit_id → team_id, rebuild FK
alter table slots rename column unit_id to team_id;
alter table slots drop constraint if exists slots_unit_id_fkey;
alter table slots add constraint slots_team_id_fkey
  foreign key (team_id) references teams(id) on delete cascade;
drop index if exists slots_unit_start_idx;
drop index if exists slots_urgent_idx;

-- deployment_windows: rename unit_id → team_id, rebuild FK
alter table deployment_windows rename column unit_id to team_id;
alter table deployment_windows drop constraint if exists deployment_windows_unit_id_fkey;
alter table deployment_windows add constraint deployment_windows_team_id_fkey
  foreign key (team_id) references teams(id) on delete cascade;
drop index if exists deployment_windows_unit_idx;

-- activity_log: rename unit_id → team_id, rebuild FK
alter table activity_log rename column unit_id to team_id;
alter table activity_log drop constraint if exists activity_log_unit_id_fkey;
alter table activity_log add constraint activity_log_team_id_fkey
  foreign key (team_id) references teams(id) on delete cascade;
drop index if exists activity_unit_idx;

-- join_requests: rename unit_id → team_id, drop role_name, rebuild FK
alter table join_requests rename column unit_id to team_id;
alter table join_requests drop constraint if exists join_requests_unit_id_fkey;
alter table join_requests add constraint join_requests_team_id_fkey
  foreign key (team_id) references teams(id) on delete cascade;
alter table join_requests drop column if exists role_name;
drop index if exists join_requests_unit_state_idx;

-- ─────────────────────────────────────────
-- 2b. Data backfill: only runs if a units row exists (i.e. upgrade from old schema)
--    On a fresh db reset, units is empty so this entire block is a no-op.
-- ─────────────────────────────────────────
do $$
declare
  v_unit_id   uuid;
  v_div_id    uuid;
  v_proj_id   uuid;
begin
  -- Capture the one units row that exists
  select id into v_unit_id from units limit 1;

  -- Only backfill when a real units row was found
  if v_unit_id is null then
    return;
  end if;

  -- Insert division
  insert into divisions (name)
  values ('Mahlaka 6')
  returning id into v_div_id;

  -- Insert project
  insert into projects (division_id, name)
  values (v_div_id, 'Carmel')
  returning id into v_proj_id;

  -- Insert team with the SAME id as the old units row so all FK renames keep pointing at valid data
  insert into teams (id, project_id, division_id, name, short_name, crest, invite_code, established)
  select v_unit_id, v_proj_id, v_div_id,
         u.name, u.short_name, u.crest, u.invite_code, u.established
  from units u
  where u.id = v_unit_id;

  -- Populate members.division_id
  update members set division_id = v_div_id;

  -- Port is_commander into team_members
  insert into team_members (team_id, member_id, role)
  select v_unit_id,
         m.id,
         case when m.is_commander then 'commander'::team_role_enum else 'soldier'::team_role_enum end
  from members m;

  -- Remap skills.division_id from old units id to new division id
  update skills set division_id = v_div_id;

end;
$$;

-- ─────────────────────────────────────────
-- 3. Rebuild indexes on renamed columns
-- ─────────────────────────────────────────
create index skills_division_idx on skills(division_id);
create index slots_team_start_idx on slots(team_id, start_at);
create index slots_urgent_idx on slots(team_id, urgent) where state = 'published';
create index deployment_windows_team_idx on deployment_windows(team_id, state);
create index activity_team_idx on activity_log(team_id, created_at desc);
create index join_requests_team_state_idx on join_requests(team_id, state, created_at desc);

-- ─────────────────────────────────────────
-- 4. Drop members columns no longer needed
-- ─────────────────────────────────────────
alter table members drop column if exists unit_id;
alter table members drop column if exists is_commander;
alter table members drop column if exists role_id;

-- ─────────────────────────────────────────
-- 5. Drop remaining references to roles, then drop old tables
-- ─────────────────────────────────────────
-- slots still has role_id → roles; drop it (view was already dropped above)
alter table slots drop column if exists role_id;

drop table if exists roles;
drop table if exists units;

-- ─────────────────────────────────────────
-- 6. Rebuild views
-- ─────────────────────────────────────────

-- members_view: replaces is_commander / role with teams jsonb array
create or replace view members_view as
select
  m.id, m.division_id, m.name, m.initials, m.tone, m.phone,
  m.joined, m.last_seen, m.calls_this_year,
  m.status, m.status_note, m.status_until, m.status_set_at,
  m.auth_user_id, m.email,
  coalesce(
    (select jsonb_agg(
        jsonb_build_object('team_id', tm.team_id, 'role', tm.role)
        order by tm.role
      )
       from team_members tm
       where tm.member_id = m.id),
    '[]'::jsonb
  ) as teams,
  coalesce(
    (select jsonb_agg(
        jsonb_build_object('name', s.name, 'level', ms.level)
        order by
          case ms.level when 'senior' then 0 when 'intermediate' then 1 else 2 end,
          s.name
      )
       from member_skills ms join skills s on s.id = ms.skill_id
       where ms.member_id = m.id),
    '[]'::jsonb
  ) as skills
from members m;

-- slots_view: team_id instead of unit_id, no role column (roles table is gone)
create or replace view slots_view as
select
  s.id, s.team_id, s.title, s.urgent, s.state,
  s.start_at, s.end_at, s.duration, s.location, s.needed, s.notes,
  s.created_at,
  coalesce(
    (select jsonb_agg(
        jsonb_build_object('name', sk.name, 'min_level', ss.min_level)
        order by sk.name
      )
       from slot_skills ss join skills sk on sk.id = ss.skill_id
       where ss.slot_id = s.id),
    '[]'::jsonb
  ) as skills,
  coalesce(
    (select array_agg(sa.member_id)
       from slot_assignees sa
       where sa.slot_id = s.id),
    array[]::uuid[]
  ) as assignee_ids,
  (select count(*)::int from slot_assignees sa where sa.slot_id = s.id) as filled
from slots s;

-- deployment_windows_view: shape unchanged, team_id flows through *
create or replace view deployment_windows_view as
select
  w.*,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'proposed')  as proposed_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'approved')  as approved_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'rejected')  as rejected_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'withdrawn') as withdrawn_count
from deployment_windows w;

-- teams_view: id, project_id, division_id, name, crest, invite_code, established,
--             project_name, member_count, commander_count
create or replace view teams_view as
select
  t.id, t.project_id, t.division_id, t.name, t.crest, t.invite_code, t.established,
  p.name as project_name,
  (select count(*)::int from team_members tm where tm.team_id = t.id)                           as member_count,
  (select count(*)::int from team_members tm where tm.team_id = t.id and tm.role = 'commander') as commander_count
from teams t
join projects p on p.id = t.project_id;

-- ─────────────────────────────────────────
-- 7. Helper function: is_commander_of(team uuid) returns boolean
-- ─────────────────────────────────────────
create or replace function is_commander_of(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from team_members tm
    join members m on m.id = tm.member_id
    where tm.team_id = p_team
      and tm.role = 'commander'
      and m.auth_user_id = auth.uid()
  );
$$;

grant execute on function is_commander_of(uuid) to anon, authenticated;

-- ─────────────────────────────────────────
-- 8. RLS on new tables (permissive anon policies matching existing pattern)
-- ─────────────────────────────────────────
alter table divisions    enable row level security;
alter table projects     enable row level security;
alter table teams        enable row level security;
alter table team_members enable row level security;

create policy "anon all divisions"    on divisions    for all using (true) with check (true);
create policy "anon all projects"     on projects     for all using (true) with check (true);
create policy "anon all teams"        on teams        for all using (true) with check (true);
create policy "anon all team_members" on team_members for all using (true) with check (true);

-- ─────────────────────────────────────────
-- 9. Realtime publication for new tables only (other tables already added in prior migrations)
-- ─────────────────────────────────────────
alter publication supabase_realtime add table team_members;
alter publication supabase_realtime add table teams;
