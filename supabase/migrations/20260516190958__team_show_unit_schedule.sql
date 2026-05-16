-- PRD §7.6 — per-team setting: whether reservists see all team slots,
-- or only slots they are personally assigned to (urgent slots are always
-- visible — see ReservistDashboard.tsx filter).
--
-- Additive change: new boolean column with default true preserves existing
-- behaviour. Filtering is applied client-side; this column is exposed via
-- teams_view so the reservist dashboard can read it without an extra round-trip.

alter table teams
  add column show_unit_schedule boolean not null default true;

-- Recreate teams_view to surface the new column. Definition mirrors
-- 20260516161822_divisions_projects_teams.sql §6. `create or replace view`
-- forbids reordering or inserting columns mid-list, so drop first.
drop view if exists teams_view;
create view teams_view as
select
  t.id, t.project_id, t.division_id, t.name, t.crest, t.invite_code, t.established,
  p.name as project_name,
  (select count(*)::int from team_members tm where tm.team_id = t.id)                           as member_count,
  (select count(*)::int from team_members tm where tm.team_id = t.id and tm.role = 'commander') as commander_count,
  t.show_unit_schedule
from teams t
join projects p on p.id = t.project_id;
