-- Skill levels: senior / intermediate / junior on each member's skill
-- and a min_level requirement on each slot's required skills.

create type skill_level_enum as enum ('junior', 'intermediate', 'senior');

alter table member_skills
  add column level skill_level_enum not null default 'intermediate';

alter table slot_skills
  add column min_level skill_level_enum not null default 'intermediate';

-- Rebuild members_view with leveled skills as jsonb array.
drop view if exists members_view;
create view members_view as
select
  m.id, m.unit_id, m.name, m.initials, m.tone, m.phone,
  m.is_commander, m.joined, m.last_seen, m.calls_this_year,
  m.status, m.status_note, m.status_until, m.status_set_at,
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

-- Rebuild slots_view with leveled requirements.
drop view if exists slots_view;
create view slots_view as
select
  s.id, s.unit_id, s.title, s.urgent, s.state,
  s.start_at, s.end_at, s.duration, s.location, s.needed, s.notes,
  s.created_at,
  r.name as role,
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
from slots s
left join roles r on r.id = s.role_id;
