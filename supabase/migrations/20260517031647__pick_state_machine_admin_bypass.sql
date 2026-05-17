-- Migration: extend deployment_picks state-machine trigger
--
-- Adds two bypasses to enforce_deployment_pick_state_machine:
--   1. Service-role caller — any transition (admin tooling, server-side
--      maintenance scripts, integration test setup).
--   2. Division admin of the window's team's division — any transition
--      (mirror of team-commander bypass, scoped one level up).
--
-- Soldier rule (proposed → withdrawn only) is unchanged.

create or replace function enforce_deployment_pick_state_machine()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_is_authorized boolean;
  v_window_member uuid;
begin
  -- Non-state update (e.g. reservist_note patch): let existing RLS decide.
  if new.state = old.state then
    return new;
  end if;

  -- Service role bypass: GoTrue stamps role='service_role' in the JWT for
  -- the service_role key. auth.role() handles both legacy
  -- `request.jwt.claim.role` and modern `request.jwt.claims` (JSON) forms.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- Resolve the window's owning member and whether the caller is either
  -- a team commander or a division admin scoped to the team's division.
  select dw.member_id,
         is_commander_of(dw.team_id)
           or is_division_admin_of(t.division_id)
    into v_window_member,
         v_is_authorized
    from deployment_windows dw
    join teams t on t.id = dw.team_id
   where dw.id = new.window_id;

  if v_is_authorized then
    return new;
  end if;

  -- Non-authorized path: caller must be the window's member.
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

-- Trigger definition is unchanged; the BEFORE UPDATE binding remains.
drop trigger if exists deployment_pick_state_machine on deployment_picks;
create trigger deployment_pick_state_machine
  before update of state on deployment_picks
  for each row
  execute function enforce_deployment_pick_state_machine();
