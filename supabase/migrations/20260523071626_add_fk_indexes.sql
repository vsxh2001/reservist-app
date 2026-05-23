-- FK indexes for nullable member references
-- These are write-only audit columns in current query patterns (low selectivity on reads),
-- but Postgres still scans them during ON DELETE SET NULL cascades and referential checks.

create index if not exists idx_slots_created_by      on slots(created_by);
create index if not exists idx_slots_assigned_by     on slots(assigned_by);
create index if not exists idx_members_status_set_by on members(status_set_by);
create index if not exists idx_join_requests_resolved_by       on join_requests(resolved_by);
create index if not exists idx_deployment_windows_created_by   on deployment_windows(created_by);
create index if not exists idx_deployment_picks_resolved_by    on deployment_picks(resolved_by);
