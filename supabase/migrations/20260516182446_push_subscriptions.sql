-- push_subscriptions: stores per-device web push subscription objects.
-- One row per (member, push endpoint). Endpoint is the unique identity for a
-- push subscription; it changes when the user re-subscribes.
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (member_id, endpoint)
);

create index push_subscriptions_member_idx on push_subscriptions(member_id);

alter table push_subscriptions enable row level security;

-- Open policies for MVP; tighten before public beta.
create policy "anon read push_subscriptions"
  on push_subscriptions for select using (true);

create policy "anon write push_subscriptions"
  on push_subscriptions for all using (true) with check (true);

alter publication supabase_realtime add table push_subscriptions;
