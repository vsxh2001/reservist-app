-- Migration: phone visibility opt-in (PRD §7.2)
--
-- Adds an opt-in flag so a reservist can choose to expose their phone to
-- fellow division members. Defaults to OFF so existing behaviour
-- (phone hidden from peers) is preserved.
--
-- The flag is enforced inside `members_view`'s phone CASE expression:
-- when `phone_visible_to_peers = true` and the requesting user is in the
-- same division, the phone is returned. All previous visibility branches
-- (self, division-admin, commander-of-team) are preserved verbatim.

-- 1. Column ----------------------------------------------------------------
alter table members
  add column phone_visible_to_peers boolean not null default false;

-- 2. Recreate members_view with the extra branch ---------------------------
drop view if exists members_view;

create view members_view
with (security_invoker = true)
as
select
  m.id, m.division_id, m.name, m.initials, m.tone,
  -- PRD §7.2: mask phone for non-commanders / non-admins / non-self,
  -- unless the target member opted in to share their phone with peers
  -- in their division.
  case
    when m.id = current_member_id() then m.phone
    when is_division_admin_of(m.division_id) then m.phone
    when exists (
      select 1 from team_members tm
      where tm.member_id = m.id
        and is_commander_of(tm.team_id)
    ) then m.phone
    when m.phone_visible_to_peers = true
         and m.division_id = current_division_id() then m.phone
    else null
  end as phone,
  m.joined, m.last_seen, m.calls_this_year,
  m.status, m.status_note, m.status_until, m.status_set_at,
  m.auth_user_id, m.email,
  m.is_division_admin,
  m.phone_visible_to_peers,
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
