-- Individual slots: each slot represents one duty period for one person.
--
-- Schema changes:
--   * slots.assignee_id (uuid, null = unassigned), FK members ON DELETE SET NULL
--   * backfill assignee_id from slot_assignees (most recent assignment wins)
--   * drop slot_assignees, slot_skills tables and their RLS
--   * drop slots.needed (capacity is always 1)
--   * rebuild slots_view to expose assignee_id directly; skills array gone
--
-- Skills stay on the member side (member_skills) — commander still sees them
-- in the roster and uses judgment to pick. We just stop matching them at the
-- slot level.

alter table slots
  add column assignee_id uuid references members(id) on delete set null;

-- Backfill: pick the most-recent assignee per slot. For slots whose old
-- needed > 1, only the latest assignment survives — fine for the new model,
-- and seed data only ever assigned one member per slot anyway.
update slots s
set assignee_id = latest.member_id
from (
  select distinct on (slot_id) slot_id, member_id
  from slot_assignees
  order by slot_id, assigned_at desc
) latest
where s.id = latest.slot_id;

create index slots_assignee_idx on slots(assignee_id) where assignee_id is not null;

drop view if exists slots_view;

drop table if exists slot_assignees;
drop table if exists slot_skills;

alter table slots drop column needed;

create view slots_view as
select
  s.id, s.team_id, s.title, s.urgent, s.state,
  s.start_at, s.end_at, s.duration, s.location, s.notes,
  s.assignee_id,
  s.created_at
from slots s;
