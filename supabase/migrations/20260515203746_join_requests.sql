-- Join requests (PRD §10 risk 3: commander approves new joiners)

create type join_state_enum as enum ('pending', 'approved', 'rejected');

create table join_requests (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references units(id) on delete cascade,
  name        text not null,
  phone       text not null,
  role_name   text,
  skill_names text[] not null default '{}',
  note        text,
  state       join_state_enum not null default 'pending',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references members(id) on delete set null
);

create index join_requests_unit_state_idx on join_requests(unit_id, state, created_at desc);

alter table join_requests enable row level security;

create policy "anon read join_requests"   on join_requests for select using (true);
create policy "anon insert join_requests" on join_requests for insert with check (state = 'pending');
create policy "anon update join_requests" on join_requests for update using (true) with check (true);
create policy "anon delete join_requests" on join_requests for delete using (true);

alter publication supabase_realtime add table join_requests;
