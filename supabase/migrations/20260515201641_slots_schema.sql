-- Slots schema (PRD §7.5)

create type slot_state_enum as enum ('draft', 'published', 'completed', 'cancelled');

create table slots (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references units(id) on delete cascade,
  title       text not null,
  urgent      boolean not null default false,
  state       slot_state_enum not null default 'published',
  start_at    timestamptz not null,
  end_at      timestamptz,
  duration    text,
  location    text,
  role_id     uuid references roles(id) on delete set null,
  needed      int  not null default 1,
  notes       text,
  created_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index slots_unit_start_idx on slots(unit_id, start_at);
create index slots_urgent_idx on slots(unit_id, urgent) where state = 'published';

create table slot_skills (
  slot_id  uuid not null references slots(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  primary key (slot_id, skill_id)
);

create table slot_assignees (
  slot_id    uuid not null references slots(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references members(id) on delete set null,
  primary key (slot_id, member_id)
);

create or replace view slots_view as
select
  s.id, s.unit_id, s.title, s.urgent, s.state,
  s.start_at, s.end_at, s.duration, s.location, s.needed, s.notes,
  s.created_at,
  r.name as role,
  coalesce(
    (select array_agg(sk.name order by sk.name)
       from slot_skills ss join skills sk on sk.id = ss.skill_id
       where ss.slot_id = s.id),
    array[]::text[]
  ) as skills,
  coalesce(
    (select array_agg(sa.member_id)
       from slot_assignees sa
       where sa.slot_id = s.id),
    array[]::uuid[]
  ) as assignee_ids,
  (select count(*)::int from slot_assignees sa where sa.slot_id = s.id) as filled
from slots s
left join roles r on r.id = s.role_id;

alter table slots          enable row level security;
alter table slot_skills    enable row level security;
alter table slot_assignees enable row level security;

create policy "anon read slots"          on slots          for select using (true);
create policy "anon read slot_skills"    on slot_skills    for select using (true);
create policy "anon read slot_assignees" on slot_assignees for select using (true);
create policy "anon insert slots"          on slots          for insert with check (true);
create policy "anon insert slot_skills"    on slot_skills    for insert with check (true);
create policy "anon insert slot_assignees" on slot_assignees for insert with check (true);
create policy "anon update slots"        on slots        for update using (true) with check (true);
create policy "anon delete slot_skills"    on slot_skills    for delete using (true);
create policy "anon delete slot_assignees" on slot_assignees for delete using (true);
