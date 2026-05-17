-- Migration: enforce invite_expires_at across the anon carve-outs.
--
-- `invite_expires_at` was added in 20260516190942__invite_expiry.sql but
-- nothing actually rejects expired invites. Three surfaces accept any
-- non-null invite_code regardless of expiry:
--
--   1. teams SELECT carve-out "anon read teams by invite_code"
--      (20260516192409__rls_tightening.sql)
--   2. RPC list_unclaimed_members_by_invite(p_invite_code text)
--      (20260516194414__claim_profile_rpc.sql)
--   3. RPC claim_member_by_invite(p_member_id, p_invite_code, p_email)
--      (20260516194414__claim_profile_rpc.sql)
--
-- This migration tightens all three. NULL `invite_expires_at` is treated
-- as "never expires" to preserve historic behaviour for any team whose
-- invite was provisioned before the column existed (defensive — the seed
-- backfills now()+7d on every team with an invite_code, but production
-- data may differ).

-- ─────────────────────────────────────────
-- 1. teams SELECT carve-out
-- ─────────────────────────────────────────
drop policy if exists "anon read teams by invite_code" on teams;
create policy "anon read teams by invite_code"
  on teams for select
  using (
    invite_code is not null
    and (invite_expires_at is null or invite_expires_at > now())
  );

-- ─────────────────────────────────────────
-- 2. list_unclaimed_members_by_invite — add expiry filter
-- ─────────────────────────────────────────
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
    and (t.invite_expires_at is null or t.invite_expires_at > now())
    and m.auth_user_id is null
  order by m.name;
$$;

-- Re-grant: create or replace preserves grants in newer PG but is no-op here.
grant execute on function list_unclaimed_members_by_invite(text) to anon, authenticated;

-- ─────────────────────────────────────────
-- 3. claim_member_by_invite — raise on expired invite
-- ─────────────────────────────────────────
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

  -- Resolve the target division via the invite code + expiry gate. NULL
  -- expiry is treated as "never expires".
  select m.division_id into v_target_division
  from members m
  join teams t on t.division_id = m.division_id
  where m.id = p_member_id
    and t.invite_code = p_invite_code
    and (t.invite_expires_at is null or t.invite_expires_at > now())
    and m.auth_user_id is null
  limit 1;

  if v_target_division is null then
    raise exception 'Member not found, invite mismatch, or invite expired'
      using errcode = 'P0002';
  end if;

  update members
  set auth_user_id = v_caller_uid,
      email = coalesce(p_email, email)
  where id = p_member_id;
end;
$$;

grant execute on function claim_member_by_invite(uuid, text, text) to authenticated;
