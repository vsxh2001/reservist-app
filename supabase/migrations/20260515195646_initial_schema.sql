-- Reservist app MVP schema
-- v0: commander dashboard — units, members, roles, skills, statuses

create type status_enum as enum ('available', 'standby', 'released', 'unavailable');

create table units (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  short_name   text not null,
  crest        text not null,
  established  text,
  invite_code  text unique,
  created_at   timestamptz not null default now()
);

create table roles (
  id        uuid primary key default gen_random_uuid(),
  unit_id   uuid not null references units(id) on delete cascade,
  name      text not null,
  sort_idx  int  not null default 0,
  unique (unit_id, name)
);

create table skills (
  id       uuid primary key default gen_random_uuid(),
  unit_id  uuid not null references units(id) on delete cascade,
  name     text not null,
  unique (unit_id, name)
);

create table members (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references units(id) on delete cascade,
  name            text not null,
  initials        text not null,
  tone            int  not null default 0,
  phone           text not null,
  role_id         uuid references roles(id) on delete set null,
  is_commander    boolean not null default false,
  joined          text,
  last_seen       text,
  calls_this_year int  not null default 0,
  status          status_enum not null default 'released',
  status_note     text,
  status_until    date,
  status_set_by   uuid references members(id) on delete set null,
  status_set_at   timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index members_unit_idx on members(unit_id);
create index members_status_idx on members(status);

create table member_skills (
  member_id uuid not null references members(id) on delete cascade,
  skill_id  uuid not null references skills(id) on delete cascade,
  primary key (member_id, skill_id)
);

create table activity_log (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references units(id) on delete cascade,
  actor_id   uuid references members(id) on delete set null,
  actor_name text not null,
  verb       text not null,
  what       text,
  tone       text,
  created_at timestamptz not null default now()
);

create index activity_unit_idx on activity_log(unit_id, created_at desc);

-- members with role name + skills array.
create or replace view members_view as
select
  m.id, m.unit_id, m.name, m.initials, m.tone, m.phone,
  m.is_commander, m.joined, m.last_seen, m.calls_this_year,
  m.status, m.status_note, m.status_until, m.status_set_at,
  r.name as role,
  coalesce(
    (select array_agg(s.name order by s.name)
       from member_skills ms join skills s on s.id = ms.skill_id
       where ms.member_id = m.id),
    array[]::text[]
  ) as skills
from members m
left join roles r on r.id = m.role_id;

-- Mock-login MVP: open access. Tighten with RLS once real auth lands.
alter table units         enable row level security;
alter table roles         enable row level security;
alter table skills        enable row level security;
alter table members       enable row level security;
alter table member_skills enable row level security;
alter table activity_log  enable row level security;

create policy "anon read units"         on units         for select using (true);
create policy "anon read roles"         on roles         for select using (true);
create policy "anon read skills"        on skills        for select using (true);
create policy "anon read members"       on members       for select using (true);
create policy "anon read member_skills" on member_skills for select using (true);
create policy "anon read activity"      on activity_log  for select using (true);

create policy "anon update members" on members for update using (true) with check (true);
create policy "anon insert activity" on activity_log for insert with check (true);
