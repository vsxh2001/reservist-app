-- Prevent duplicate slots per (team_id, title, start_at).
--
-- Local-dev re-running parts of seed.sql created two identical slot rows
-- (same team, same title, same start time). The app has no UI path that
-- intentionally produces two slots in the same shift slot with the same
-- name — that's always a duplicate from a retried mutation or a partial
-- seed replay.
--
-- A simple unique index gives us idempotency without changing any code:
-- seed.sql inserts can use `ON CONFLICT DO NOTHING`, retried mutations
-- fail cleanly (caller's catch-block surfaces a toast), and the activity
-- feed stops showing twins.

create unique index if not exists slots_team_title_start_uniq
  on slots(team_id, title, start_at);
