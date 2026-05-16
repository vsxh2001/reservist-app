-- Full member purge, including the linked auth.users row.
--
-- The browser-side client cannot delete from auth.users directly (anon key
-- lacks the required privileges). This SECURITY DEFINER function does it on
-- the caller's behalf, gated on the caller being either a commander of one of
-- the target member's teams or a division admin on the target's division.
--
-- Cascades:
--   * delete on auth.users -> cascades to auth.identities, auth.sessions, ...
--     and (via members.auth_user_id ... on delete set null) clears the link.
--   * delete on members    -> cascades to team_members, member_skills,
--     slot_assignees, deployment_windows, push_subscriptions, and sets
--     actor/created_by columns to null per existing FK definitions.

create or replace function delete_member_full(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_auth_user_id uuid;
  v_division_id  uuid;
  v_authorized   boolean := false;
begin
  -- Look up the target member; bail out quietly if no such row.
  select m.auth_user_id, m.division_id
    into v_auth_user_id, v_division_id
  from members m
  where m.id = p_member_id;

  if not found then
    raise exception 'member % not found', p_member_id using errcode = 'P0002';
  end if;

  -- Authorize: caller must be a division admin on the member's division,
  -- or a commander of at least one team the member belongs to.
  select exists (
    select 1
    from members caller
    where caller.auth_user_id = auth.uid()
      and caller.division_id = v_division_id
      and caller.is_division_admin = true
  )
  or exists (
    select 1
    from team_members tm
    where tm.member_id = p_member_id
      and is_commander_of(tm.team_id)
  )
  into v_authorized;

  if not v_authorized then
    raise exception 'not authorized to delete member %', p_member_id
      using errcode = '42501';
  end if;

  -- Atomic purge: delete the auth user first (if linked), then the member row.
  if v_auth_user_id is not null then
    delete from auth.users where id = v_auth_user_id;
  end if;

  delete from members where id = p_member_id;
end;
$$;

grant execute on function delete_member_full(uuid) to anon, authenticated;
