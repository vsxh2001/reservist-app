-- supabase/migrations/20260516120000_deployment_windows.sql
create type window_state_enum as enum ('open', 'closed');
create type pick_state_enum   as enum ('proposed', 'approved', 'rejected', 'withdrawn');

create table deployment_windows (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  unit_id     uuid not null references units(id)   on delete cascade,
  label       text not null,
  start_date  date not null,
  end_date    date not null,
  notes       text,
  state       window_state_enum not null default 'open',
  created_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index deployment_windows_member_idx on deployment_windows(member_id, start_date);
create index deployment_windows_unit_idx   on deployment_windows(unit_id, state);

create table deployment_picks (
  id             uuid primary key default gen_random_uuid(),
  window_id      uuid not null references deployment_windows(id) on delete cascade,
  date           date not null,
  state          pick_state_enum not null default 'proposed',
  reservist_note text,
  commander_note text,
  proposed_at    timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references members(id) on delete set null,
  unique (window_id, date)
);
create index deployment_picks_window_state_idx on deployment_picks(window_id, state);
create index deployment_picks_date_approved_idx on deployment_picks(date) where state = 'approved';

create or replace view deployment_windows_view as
select
  w.*,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'proposed')  as proposed_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'approved')  as approved_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'rejected')  as rejected_count,
  (select count(*)::int from deployment_picks p where p.window_id = w.id and p.state = 'withdrawn') as withdrawn_count
from deployment_windows w;

alter table deployment_windows enable row level security;
alter table deployment_picks   enable row level security;

create policy "anon read deployment_windows"   on deployment_windows for select using (true);
create policy "anon insert deployment_windows" on deployment_windows for insert with check (true);
create policy "anon update deployment_windows" on deployment_windows for update using (true) with check (true);
create policy "anon delete deployment_windows" on deployment_windows for delete using (true);

create policy "anon read deployment_picks"    on deployment_picks for select using (true);
create policy "anon insert deployment_picks"  on deployment_picks for insert with check (true);
create policy "anon update deployment_picks"  on deployment_picks for update using (true) with check (true);
create policy "anon delete deployment_picks"  on deployment_picks for delete using (true);

alter publication supabase_realtime add table deployment_windows;
alter publication supabase_realtime add table deployment_picks;
