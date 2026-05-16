-- Migration: Claim-profile RPC (regression fix for RLS tightening)
--
-- The RLS tightening (20260516192409__rls_tightening.sql) scopes `members`
-- SELECT to `division_id = current_division_id()`. For a freshly-signed-in
-- user whose auth.users row is not yet linked to a member row,
-- `current_member_id()` returns NULL → `current_division_id()` is NULL →
-- the user sees zero members and cannot pick themselves on ClaimProfileScreen.
--
-- Fix: route the claim flow through SECURITY DEFINER RPCs that resolve a
-- team invite code to its division and expose only the unclaimed members
-- of that division, without leaking the full members table.
--
-- The invite code is a rotatable per-team secret (same trust model as the
-- existing anon `teams SELECT by invite_code` carve-out), so exposing
-- unclaimed members keyed on a known invite is equivalent to the existing
-- join-flow disclosure.

-- ─────────────────────────────────────────
-- 1. list_unclaimed_members_by_invite
-- ─────────────────────────────────────────
-- Returns the unclaimed members (auth_user_id IS NULL) belonging to the
-- division of the team identified by p_invite_code. Grantable to anon so
-- the screen can resolve the list before the auth session is fully wired.
create or replace function list_unclaimed_members_by_invite(p_invite_code text)
returns table (
  id          uuid,
  name        text,
  initials    text,
  tone        int,
  division_id uuid
)
language sql stable security definer set search_path = public
as $$
  select m.id, m.name, m.initials, m.tone, m.division_id
  from members m
  join teams t on t.division_id = m.division_id
  where t.invite_code = p_invite_code
    and m.auth_user_id is null
  order by m.name;
$$;

grant execute on function list_unclaimed_members_by_invite(text) to anon, authenticated;

-- ─────────────────────────────────────────
-- 2. claim_member_by_invite
-- ─────────────────────────────────────────
-- Claims a member row for the caller's auth.uid(). The invite code must
-- match the member's division, and neither the member nor the caller may
-- already be linked. SECURITY DEFINER lets us bypass the tightened members
-- SELECT/UPDATE policies while still gating on the secret invite code +
-- the caller's authenticated identity.
create or replace function claim_member_by_invite(
  p_member_id   uuid,
  p_invite_code text,
  p_email       text
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_caller_uid      uuid := auth.uid();
  v_target_division uuid;
begin
  if v_caller_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Block re-linking: a single auth.users row may only correspond to one member.
  if exists (select 1 from members where auth_user_id = v_caller_uid) then
    raise exception 'Already linked to a member' using errcode = '23505';
  end if;

  -- Confirm the invite code matches the target member's division and the
  -- member is still unclaimed.
  select m.division_id into v_target_division
  from members m
  join teams t on t.division_id = m.division_id
  where m.id = p_member_id
    and t.invite_code = p_invite_code
    and m.auth_user_id is null
  limit 1;

  if v_target_division is null then
    raise exception 'Member not found or invite mismatch' using errcode = 'P0002';
  end if;

  update members
  set auth_user_id = v_caller_uid,
      email = coalesce(p_email, email)
  where id = p_member_id;
end;
$$;

grant execute on function claim_member_by_invite(uuid, text, text) to authenticated;
