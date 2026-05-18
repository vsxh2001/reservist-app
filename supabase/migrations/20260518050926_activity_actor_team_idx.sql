-- migration: activity_actor_team_idx
-- Adds a composite index on activity_log(actor_id, team_id, created_at desc)
-- to cover the useMyRecentActivity access pattern:
--   SELECT ... FROM activity_log
--   WHERE actor_id = :m AND team_id = :t
--   ORDER BY created_at DESC LIMIT 10
--
-- The existing activity_unit_idx and activity_team_idx each cover only a single
-- column, so Postgres cannot satisfy the two-column equality predicate + sort
-- from either alone. This index eliminates the heap fetch for that query by
-- making actor_id the leading column (highest selectivity) followed by team_id
-- and the sort direction.

create index if not exists activity_actor_team_idx
  on activity_log(actor_id, team_id, created_at desc);
