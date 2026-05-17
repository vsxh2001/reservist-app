-- Migration: anon-callable inspect_invite RPC.
--
-- Context: 20260517032643 tightened the teams SELECT carve-out to filter
-- expired invites at the RLS layer. JoinScreen's `useTeamByInvite` now sees
-- `null` for both nonexistent and expired codes — collapsing the distinct
-- "invite expired" UX state into a generic "not found" message.
--
-- This RPC restores the three-way distinction without re-exposing expired
-- team rows to anon. It returns a small discriminator + team name only when
-- the invite is currently valid. For expired invites, it emits status='expired'
-- and `team_name` so the screen can render "Ask <team>'s commander to renew".
--
-- Trust model: invite codes are random rotatable per-team secrets (same as the
-- existing anon `teams SELECT by invite_code` carve-out). Exposing the team
-- name to someone who already knows the invite code is equivalent to the
-- existing pre-#23 disclosure.

create or replace function inspect_invite(p_invite_code text)
returns table (
  status      text,        -- 'valid' | 'expired' | 'not_found'
  team_id     uuid,        -- populated when status='valid'
  team_name   text,        -- populated when status='valid' or 'expired'
  division_id uuid         -- populated when status='valid'
)
language plpgsql stable security definer set search_path = public
as $$
begin
  return query
  with hit as (
    select
      t.id          as t_id,
      t.name        as t_name,
      t.division_id as t_div,
      t.invite_expires_at as t_exp
    from teams t
    where t.invite_code = p_invite_code
    limit 1
  ),
  result as (
    select
      case
        when h.t_id is null then 'not_found'
        when h.t_exp is not null and h.t_exp <= now() then 'expired'
        else 'valid'
      end::text as r_status,
      case when h.t_exp is null or h.t_exp > now() then h.t_id end as r_team_id,
      h.t_name as r_team_name,
      case when h.t_exp is null or h.t_exp > now() then h.t_div end as r_division_id
    from hit h
    union all
    select 'not_found'::text, null::uuid, null::text, null::uuid
    where not exists (select 1 from hit)
  )
  select r_status, r_team_id, r_team_name, r_division_id from result;
end;
$$;

grant execute on function inspect_invite(text) to anon, authenticated;
