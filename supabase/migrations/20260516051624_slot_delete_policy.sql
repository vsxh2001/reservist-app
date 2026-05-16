-- Anon delete policy on slots — needed for slot lifecycle teardown
-- (test cleanup, future commander hard-delete flow).
create policy "anon delete slots" on slots for delete using (true);

-- Same for activity_log — admin scrub + test cleanup. Real auth flow
-- will replace these with commander-scoped policies.
create policy "anon delete activity_log" on activity_log for delete using (true);
