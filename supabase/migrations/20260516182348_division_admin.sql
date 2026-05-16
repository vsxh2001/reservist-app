-- Migration: division_admin
-- Adds is_division_admin flag to members, sort_idx to projects, rebuilds members_view.

-- ─────────────────────────────────────────
-- 1. Add sort_idx to projects (was missing; types already declare it)
-- ─────────────────────────────────────────
alter table projects add column if not exists sort_idx int not null default 0;

-- ─────────────────────────────────────────
-- 2. Add is_division_admin flag to members
-- ─────────────────────────────────────────
alter table members add column is_division_admin boolean not null default false;

-- ─────────────────────────────────────────
-- 3. Rebuild members_view to expose is_division_admin
-- ─────────────────────────────────────────
drop view if exists members_view;

create or replace view members_view as
select
  m.id, m.division_id, m.name, m.initials, m.tone, m.phone,
  m.joined, m.last_seen, m.calls_this_year,
  m.status, m.status_note, m.status_until, m.status_set_at,
  m.auth_user_id, m.email,
  m.is_division_admin,
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
