-- Migration: deployment_picks state-machine trigger (PRD §7.6)
--
-- Enforces allowed state transitions at the DB level:
--   Commander (of the window's team) → any transition allowed.
--   Owner (the soldier whose window it is):
--     proposed → withdrawn   (owner-withdraw)
--     all other state changes → blocked (errcode 42501)
--   Non-state column updates (e.g. reservist_note) → pass through;
--     existing RLS policy on deployment_picks already gates row ownership.
--
-- The existing UPDATE policy "self or commander update deployment_pick" is
-- intentionally left unchanged — it handles row-level ownership scoping.
-- This trigger sits above that layer and enforces the transition rules.

create or replace function enforce_deployment_pick_state_machine()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_commander boolean;
  v_window_member uuid;
begin
  -- Non-state update (e.g. reservist_note patch): let existing RLS decide.
  if new.state = old.state then
    return new;
  end if;

  -- Resolve the window's owning member and the caller's commander status.
  select dw.member_id,
         is_commander_of(dw.team_id)
    into v_window_member,
         v_is_commander
    from deployment_windows dw
   where dw.id = new.window_id;

  -- Commanders of the window's team may perform any transition.
  if v_is_commander then
    return new;
  end if;

  -- Non-commander path: caller must be the window's member.
  if v_window_member is null
     or v_window_member <> current_member_id() then
    raise exception 'Not authorized to change pick state'
      using errcode = '42501';
  end if;

  -- The only soldier-allowed transition is proposed → withdrawn.
  if old.state = 'proposed' and new.state = 'withdrawn' then
    return new;
  end if;

  raise exception 'Soldier may only withdraw a proposed pick (got % → %)', old.state, new.state
    using errcode = '42501';
end;
$$;

drop trigger if exists deployment_pick_state_machine on deployment_picks;
create trigger deployment_pick_state_machine
  before update of state on deployment_picks
  for each row
  execute function enforce_deployment_pick_state_machine();
