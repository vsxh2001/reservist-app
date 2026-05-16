-- Migration: invite expiry
-- Adds invite_expires_at to teams (PRD §7.1: revocable + default 7-day expiration).
-- Existing teams with an invite_code get a +7d expiry so dev/test data stays usable.

-- ─────────────────────────────────────────
-- 1. Schema
-- ─────────────────────────────────────────
alter table teams add column invite_expires_at timestamptz;

-- Backfill: anything with an active code gets a 7-day grace window.
update teams
set    invite_expires_at = now() + interval '7 days'
where  invite_code is not null;

-- ─────────────────────────────────────────
-- 2. View: recreate teams_view to expose invite_expires_at
-- ─────────────────────────────────────────
drop view if exists teams_view;

create view teams_view as
select
  t.id, t.project_id, t.division_id, t.name, t.crest,
  t.invite_code, t.invite_expires_at, t.established,
  p.name as project_name,
  (select count(*)::int from team_members tm where tm.team_id = t.id)                           as member_count,
  (select count(*)::int from team_members tm where tm.team_id = t.id and tm.role = 'commander') as commander_count
from teams t
join projects p on p.id = t.project_id;
