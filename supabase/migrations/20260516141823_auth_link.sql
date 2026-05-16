-- Link members to Supabase Auth users.
-- Rebuild members_view so the new column is exposed via PostgREST.

alter table members add column auth_user_id uuid references auth.users(id) on delete set null;
create unique index members_auth_user_idx on members(auth_user_id) where auth_user_id is not null;

alter table members add column email text;

-- Helper used by RLS policies (when we tighten them in a follow-up migration)
-- and by the client to resolve "which member row is the caller?".
create or replace function current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from members where auth_user_id = auth.uid() limit 1;
$$;

grant execute on function current_member_id() to anon, authenticated;

-- Permissive read on auth_user_id so the client can detect whether a member is already linked
-- (used by the ClaimProfileScreen to filter out already-claimed rows).
-- Existing select policy on members already covers this; nothing additional needed.

-- Rebuild members_view so the new columns flow through.
drop view if exists members_view;
create view members_view as
select
  m.id, m.unit_id, m.name, m.initials, m.tone, m.phone,
  m.is_commander, m.joined, m.last_seen, m.calls_this_year,
  m.status, m.status_note, m.status_until, m.status_set_at,
  m.auth_user_id, m.email,
  r.name as role,
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
from members m
left join roles r on r.id = m.role_id;
