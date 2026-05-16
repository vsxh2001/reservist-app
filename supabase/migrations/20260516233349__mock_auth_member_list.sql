-- Migration: Public-but-safe RPC for the dev-only mock-auth picker.
--
-- After 20260516192409__rls_tightening.sql the `members` SELECT policy is
-- `to authenticated`, and `members_view` runs with security_invoker=true.
-- That breaks LoginPicker's mock-auth member list, which queries the view
-- while the user is still anonymous (pre-session).
--
-- This RPC returns only the members linked to seeded test auth users
-- (emails ending in '@test.local'). Those users live exclusively in
-- seed.sql §P and never exist in production data, so anon callers in
-- production see an empty list even if VITE_MOCK_AUTH=1 were enabled there
-- by mistake.
--
-- `email` is returned so the client can drive supabase.auth.signInWithPassword
-- using the seeded ('unused') password — the picker needs a real GoTrue
-- session, not just a localStorage shim, so subsequent queries pass RLS.

create or replace function list_mock_auth_members()
returns table (
  id            uuid,
  name          text,
  initials      text,
  tone          int,
  division_id   uuid,
  auth_user_id  uuid,
  email         text
)
language sql stable security definer set search_path = public, auth
as $$
  select m.id, m.name, m.initials, m.tone, m.division_id, m.auth_user_id, u.email::text
  from members m
  join auth.users u on u.id = m.auth_user_id
  where u.email like '%@test.local'
  order by m.name;
$$;

grant execute on function list_mock_auth_members() to anon, authenticated;
