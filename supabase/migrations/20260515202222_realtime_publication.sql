-- Enable realtime change streaming on operational tables
alter publication supabase_realtime add table members;
alter publication supabase_realtime add table activity_log;
alter publication supabase_realtime add table slots;
alter publication supabase_realtime add table slot_assignees;
