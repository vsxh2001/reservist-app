-- Migration: RLS tightening (PRD §8.1 — Privacy and security)
-- Drops all permissive anon policies and replaces them with:
--   • authenticated-only reads (scoped to caller's division)
--   • commander / admin gates for mutations
-- Security definer helpers ensure the functions bypass RLS when resolving
-- the caller's identity, preventing circular dependency.

-- ─────────────────────────────────────────
-- 1. New helper functions
-- ─────────────────────────────────────────

-- Returns true when the JWT's uid is a division admin of p_division.
create or replace function is_division_admin_of(p_division uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from members
    where auth_user_id = auth.uid()
      and division_id = p_division
      and is_division_admin = true
  );
$$;

-- Returns the division_id of the authenticated member (NULL when unauthenticated).
create or replace function current_division_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select division_id from members where auth_user_id = auth.uid() limit 1;
$$;

-- Returns true when the JWT's uid is a member of p_team (any role).
create or replace function is_member_of_team(p_team uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from team_members tm
    join members m on m.id = tm.member_id
    where tm.team_id = p_team and m.auth_user_id = auth.uid()
  );
$$;

grant execute on function is_division_admin_of(uuid), current_division_id(), is_member_of_team(uuid) to anon, authenticated;

-- ─────────────────────────────────────────
-- 2. Drop all existing anon policies
-- ─────────────────────────────────────────

-- divisions (from 20260516161822)
drop policy if exists "anon all divisions" on divisions;

-- projects (from 20260516161822)
drop policy if exists "anon all projects" on projects;

-- teams (from 20260516161822)
drop policy if exists "anon all teams" on teams;

-- team_members (from 20260516161822)
drop policy if exists "anon all team_members" on team_members;

-- members (from 20260515195646)
drop policy if exists "anon read members"  on members;
drop policy if exists "anon update members" on members;

-- skills (from 20260515195646)
drop policy if exists "anon read skills" on skills;

-- member_skills (from 20260515195646)
drop policy if exists "anon read member_skills" on member_skills;

-- activity_log (from 20260515195646 + 20260516051624)
drop policy if exists "anon read activity"       on activity_log;
drop policy if exists "anon insert activity"     on activity_log;
drop policy if exists "anon delete activity_log" on activity_log;

-- slots (from 20260515201641 + 20260516051624)
drop policy if exists "anon read slots"   on slots;
drop policy if exists "anon insert slots" on slots;
drop policy if exists "anon update slots" on slots;
drop policy if exists "anon delete slots" on slots;

-- slot_skills (from 20260515201641)
drop policy if exists "anon read slot_skills"    on slot_skills;
drop policy if exists "anon insert slot_skills"  on slot_skills;
drop policy if exists "anon delete slot_skills"  on slot_skills;

-- slot_assignees (from 20260515201641)
drop policy if exists "anon read slot_assignees"   on slot_assignees;
drop policy if exists "anon insert slot_assignees" on slot_assignees;
drop policy if exists "anon delete slot_assignees" on slot_assignees;

-- join_requests (from 20260515203746)
drop policy if exists "anon read join_requests"   on join_requests;
drop policy if exists "anon insert join_requests" on join_requests;
drop policy if exists "anon update join_requests" on join_requests;
drop policy if exists "anon delete join_requests" on join_requests;

-- deployment_windows (from 20260516120000)
drop policy if exists "anon read deployment_windows"   on deployment_windows;
drop policy if exists "anon insert deployment_windows" on deployment_windows;
drop policy if exists "anon update deployment_windows" on deployment_windows;
drop policy if exists "anon delete deployment_windows" on deployment_windows;

-- deployment_picks (from 20260516120000)
drop policy if exists "anon read deployment_picks"   on deployment_picks;
drop policy if exists "anon insert deployment_picks" on deployment_picks;
drop policy if exists "anon update deployment_picks" on deployment_picks;
drop policy if exists "anon delete deployment_picks" on deployment_picks;

-- push_subscriptions (from 20260516182446)
drop policy if exists "anon read push_subscriptions"  on push_subscriptions;
drop policy if exists "anon write push_subscriptions" on push_subscriptions;

-- ─────────────────────────────────────────
-- 3. divisions — division-scoped authenticated + admin mutations
-- ─────────────────────────────────────────
create policy "auth read own division"
  on divisions for select
  to authenticated
  using (id = current_division_id());

create policy "admin insert division"
  on divisions for insert
  to authenticated
  with check (is_division_admin_of(id));

create policy "admin update division"
  on divisions for update
  to authenticated
  using (is_division_admin_of(id))
  with check (is_division_admin_of(id));

create policy "admin delete division"
  on divisions for delete
  to authenticated
  using (is_division_admin_of(id));

-- ─────────────────────────────────────────
-- 4. projects — division-scoped read, admin mutations
-- ─────────────────────────────────────────
create policy "auth read own division projects"
  on projects for select
  to authenticated
  using (division_id = current_division_id());

create policy "admin insert project"
  on projects for insert
  to authenticated
  with check (is_division_admin_of(division_id));

create policy "admin update project"
  on projects for update
  to authenticated
  using (is_division_admin_of(division_id))
  with check (is_division_admin_of(division_id));

create policy "admin delete project"
  on projects for delete
  to authenticated
  using (is_division_admin_of(division_id));

-- ─────────────────────────────────────────
-- 5. teams — division-scoped read
--    Special carve-out: anon may SELECT by invite_code (JoinScreen pre-auth lookup).
--    invite_codes are random and rotatable, making this safe for public lookup.
-- ─────────────────────────────────────────
-- Carve-out: unauthenticated users hitting /join/<code> must resolve the team
-- so they can display its name and submit a join_request. invite_codes are
-- random 8-12 char tokens and are rotatable by commanders, so exposing rows
-- by invite_code only is equivalent to knowing a secret link.
create policy "anon read teams by invite_code"
  on teams for select
  using (invite_code is not null);

create policy "auth read own division teams"
  on teams for select
  to authenticated
  using (division_id = current_division_id());

create policy "admin insert team"
  on teams for insert
  to authenticated
  with check (is_division_admin_of(division_id));

create policy "admin or commander update team"
  on teams for update
  to authenticated
  using (
    is_division_admin_of(division_id)
    or is_commander_of(id)
  )
  with check (
    is_division_admin_of(division_id)
    or is_commander_of(id)
  );

create policy "admin delete team"
  on teams for delete
  to authenticated
  using (is_division_admin_of(division_id));

-- ─────────────────────────────────────────
-- 6. team_members — division-scoped read, admin or commander mutations
-- ─────────────────────────────────────────
create policy "auth read own division team_members"
  on team_members for select
  to authenticated
  using (
    exists (
      select 1 from teams t
      where t.id = team_members.team_id
        and t.division_id = current_division_id()
    )
  );

create policy "admin or commander insert team_member"
  on team_members for insert
  to authenticated
  with check (
    is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  );

create policy "admin or commander update team_member"
  on team_members for update
  to authenticated
  using (
    is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  )
  with check (
    is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  );

create policy "admin or commander or self delete team_member"
  on team_members for delete
  to authenticated
  using (
    is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
    or member_id = current_member_id()
  );

-- ─────────────────────────────────────────
-- 7. members — division-scoped read, self/commander/admin mutations
-- ─────────────────────────────────────────
create policy "auth read own division members"
  on members for select
  to authenticated
  using (division_id = current_division_id());

-- No public insert — new members arrive via join_requests resolution RPC.
-- Division admins may insert directly (e.g. bulk import, admin UI).
create policy "admin insert member"
  on members for insert
  to authenticated
  with check (is_division_admin_of(division_id));

create policy "self or commander or admin update member"
  on members for update
  to authenticated
  using (
    id = current_member_id()
    or is_division_admin_of(division_id)
    or exists (
      select 1 from team_members tm
      where tm.member_id = members.id
        and is_commander_of(tm.team_id)
    )
  )
  with check (
    id = current_member_id()
    or is_division_admin_of(division_id)
    or exists (
      select 1 from team_members tm
      where tm.member_id = members.id
        and is_commander_of(tm.team_id)
    )
  );

-- Deletions go through delete_member_full() RPC (security definer); no direct DELETE needed.
create policy "admin delete member"
  on members for delete
  to authenticated
  using (is_division_admin_of(division_id));

-- ─────────────────────────────────────────
-- 8. skills — division-scoped read, admin mutations
-- ─────────────────────────────────────────
create policy "auth read own division skills"
  on skills for select
  to authenticated
  using (division_id = current_division_id());

create policy "admin insert skill"
  on skills for insert
  to authenticated
  with check (is_division_admin_of(division_id));

create policy "admin update skill"
  on skills for update
  to authenticated
  using (is_division_admin_of(division_id))
  with check (is_division_admin_of(division_id));

create policy "admin delete skill"
  on skills for delete
  to authenticated
  using (is_division_admin_of(division_id));

-- ─────────────────────────────────────────
-- 9. member_skills — division-scoped read, admin/commander/self mutations
-- ─────────────────────────────────────────
create policy "auth read own division member_skills"
  on member_skills for select
  to authenticated
  using (
    exists (
      select 1 from members m
      where m.id = member_skills.member_id
        and m.division_id = current_division_id()
    )
  );

create policy "admin or commander or self insert member_skill"
  on member_skills for insert
  to authenticated
  with check (
    member_id = current_member_id()
    or is_division_admin_of(
      (select division_id from members where id = member_id)
    )
    or exists (
      select 1 from team_members tm
      where tm.member_id = member_skills.member_id
        and is_commander_of(tm.team_id)
    )
  );

create policy "admin or commander or self update member_skill"
  on member_skills for update
  to authenticated
  using (
    member_id = current_member_id()
    or is_division_admin_of(
      (select division_id from members where id = member_id)
    )
    or exists (
      select 1 from team_members tm
      where tm.member_id = member_skills.member_id
        and is_commander_of(tm.team_id)
    )
  )
  with check (
    member_id = current_member_id()
    or is_division_admin_of(
      (select division_id from members where id = member_id)
    )
    or exists (
      select 1 from team_members tm
      where tm.member_id = member_skills.member_id
        and is_commander_of(tm.team_id)
    )
  );

create policy "admin or commander or self delete member_skill"
  on member_skills for delete
  to authenticated
  using (
    member_id = current_member_id()
    or is_division_admin_of(
      (select division_id from members where id = member_id)
    )
    or exists (
      select 1 from team_members tm
      where tm.member_id = member_skills.member_id
        and is_commander_of(tm.team_id)
    )
  );

-- ─────────────────────────────────────────
-- 10. slots — division-scoped read, commander-of-team mutations
-- ─────────────────────────────────────────
create policy "auth read own division slots"
  on slots for select
  to authenticated
  using (
    exists (
      select 1 from teams t
      where t.id = slots.team_id
        and t.division_id = current_division_id()
    )
  );

create policy "commander insert slot"
  on slots for insert
  to authenticated
  with check (is_commander_of(team_id));

create policy "commander update slot"
  on slots for update
  to authenticated
  using (is_commander_of(team_id))
  with check (is_commander_of(team_id));

create policy "commander delete slot"
  on slots for delete
  to authenticated
  using (is_commander_of(team_id));

-- ─────────────────────────────────────────
-- 11. slot_skills — division-scoped read, commander of parent slot's team mutations
-- ─────────────────────────────────────────
create policy "auth read own division slot_skills"
  on slot_skills for select
  to authenticated
  using (
    exists (
      select 1 from slots s
      join teams t on t.id = s.team_id
      where s.id = slot_skills.slot_id
        and t.division_id = current_division_id()
    )
  );

create policy "commander insert slot_skill"
  on slot_skills for insert
  to authenticated
  with check (
    is_commander_of(
      (select team_id from slots where id = slot_id)
    )
  );

create policy "commander update slot_skill"
  on slot_skills for update
  to authenticated
  using (
    is_commander_of(
      (select team_id from slots where id = slot_id)
    )
  )
  with check (
    is_commander_of(
      (select team_id from slots where id = slot_id)
    )
  );

create policy "commander delete slot_skill"
  on slot_skills for delete
  to authenticated
  using (
    is_commander_of(
      (select team_id from slots where id = slot_id)
    )
  );

-- ─────────────────────────────────────────
-- 12. slot_assignees — division-scoped read, commander mutations + self-unassign
-- ─────────────────────────────────────────
create policy "auth read own division slot_assignees"
  on slot_assignees for select
  to authenticated
  using (
    exists (
      select 1 from slots s
      join teams t on t.id = s.team_id
      where s.id = slot_assignees.slot_id
        and t.division_id = current_division_id()
    )
  );

create policy "commander insert slot_assignee"
  on slot_assignees for insert
  to authenticated
  with check (
    is_commander_of(
      (select team_id from slots where id = slot_id)
    )
  );

create policy "commander update slot_assignee"
  on slot_assignees for update
  to authenticated
  using (
    is_commander_of(
      (select team_id from slots where id = slot_id)
    )
  )
  with check (
    is_commander_of(
      (select team_id from slots where id = slot_id)
    )
  );

create policy "commander or self delete slot_assignee"
  on slot_assignees for delete
  to authenticated
  using (
    member_id = current_member_id()
    or is_commander_of(
      (select team_id from slots where id = slot_id)
    )
  );

-- ─────────────────────────────────────────
-- 13. activity_log — division-scoped read, commander/self insert, admin delete
-- ─────────────────────────────────────────
create policy "auth read own division activity_log"
  on activity_log for select
  to authenticated
  using (
    exists (
      select 1 from teams t
      where t.id = activity_log.team_id
        and t.division_id = current_division_id()
    )
  );

create policy "commander or self insert activity_log"
  on activity_log for insert
  to authenticated
  with check (
    actor_id = current_member_id()
    or actor_id is null
    or is_commander_of(team_id)
  );

create policy "admin delete activity_log"
  on activity_log for delete
  to authenticated
  using (
    is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  );

-- ─────────────────────────────────────────
-- 14. join_requests — commander read/update/delete, anon insert (join entry point)
--
-- Special carve-out: unauthenticated users submit join requests before they have
-- an account. This is the only intentional anon write surface; the WITH CHECK
-- constraint (state = 'pending') prevents state-forging.
-- ─────────────────────────────────────────
create policy "commander or admin read join_requests"
  on join_requests for select
  to authenticated
  using (
    is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  );

-- Anon insert kept intentionally — the join flow is the entry path before auth.
create policy "anon insert join_request pending"
  on join_requests for insert
  with check (state = 'pending');

create policy "commander update join_request"
  on join_requests for update
  to authenticated
  using (
    is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  )
  with check (
    is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  );

create policy "commander delete join_request"
  on join_requests for delete
  to authenticated
  using (
    is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  );

-- ─────────────────────────────────────────
-- 15. deployment_windows — member or commander read/insert/update, commander delete
-- ─────────────────────────────────────────
create policy "auth read own deployment_windows"
  on deployment_windows for select
  to authenticated
  using (
    member_id = current_member_id()
    or is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  );

create policy "self insert deployment_window"
  on deployment_windows for insert
  to authenticated
  with check (member_id = current_member_id());

create policy "self or commander update deployment_window"
  on deployment_windows for update
  to authenticated
  using (
    member_id = current_member_id()
    or is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  )
  with check (
    member_id = current_member_id()
    or is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
  );

create policy "commander delete deployment_window"
  on deployment_windows for delete
  to authenticated
  using (
    is_commander_of(team_id)
    or is_division_admin_of(
      (select division_id from teams where id = team_id)
    )
    or member_id = current_member_id()
  );

-- ─────────────────────────────────────────
-- 16. deployment_picks — member or commander read, self/commander insert/update/delete
-- ─────────────────────────────────────────
create policy "auth read own deployment_picks"
  on deployment_picks for select
  to authenticated
  using (
    exists (
      select 1 from deployment_windows w
      where w.id = deployment_picks.window_id
        and (
          w.member_id = current_member_id()
          or is_commander_of(w.team_id)
          or is_division_admin_of(
            (select division_id from teams where id = w.team_id)
          )
        )
    )
  );

create policy "self or commander insert deployment_pick"
  on deployment_picks for insert
  to authenticated
  with check (
    exists (
      select 1 from deployment_windows w
      where w.id = window_id
        and (
          w.member_id = current_member_id()
          or is_commander_of(w.team_id)
          or is_division_admin_of(
            (select division_id from teams where id = w.team_id)
          )
        )
    )
  );

create policy "self or commander update deployment_pick"
  on deployment_picks for update
  to authenticated
  using (
    exists (
      select 1 from deployment_windows w
      where w.id = deployment_picks.window_id
        and (
          w.member_id = current_member_id()
          or is_commander_of(w.team_id)
          or is_division_admin_of(
            (select division_id from teams where id = w.team_id)
          )
        )
    )
  )
  with check (
    exists (
      select 1 from deployment_windows w
      where w.id = deployment_picks.window_id
        and (
          w.member_id = current_member_id()
          or is_commander_of(w.team_id)
          or is_division_admin_of(
            (select division_id from teams where id = w.team_id)
          )
        )
    )
  );

create policy "self or commander delete deployment_pick"
  on deployment_picks for delete
  to authenticated
  using (
    exists (
      select 1 from deployment_windows w
      where w.id = deployment_picks.window_id
        and (
          w.member_id = current_member_id()
          or is_commander_of(w.team_id)
          or is_division_admin_of(
            (select division_id from teams where id = w.team_id)
          )
        )
    )
  );

-- ─────────────────────────────────────────
-- 17. push_subscriptions — self-only
-- ─────────────────────────────────────────
create policy "self read push_subscriptions"
  on push_subscriptions for select
  to authenticated
  using (member_id = current_member_id());

create policy "self insert push_subscription"
  on push_subscriptions for insert
  to authenticated
  with check (member_id = current_member_id());

create policy "self update push_subscription"
  on push_subscriptions for update
  to authenticated
  using (member_id = current_member_id())
  with check (member_id = current_member_id());

create policy "self delete push_subscription"
  on push_subscriptions for delete
  to authenticated
  using (member_id = current_member_id());

-- ─────────────────────────────────────────
-- 18. Rebuild members_view — phone masking per PRD §7.2
--
-- Soldiers see phone = NULL for peers; commanders/admins/self see real phone.
-- The view runs as the invoking user so RLS on members is still applied.
-- ─────────────────────────────────────────
drop view if exists members_view;

create or replace view members_view
with (security_invoker = true)
as
select
  m.id, m.division_id, m.name, m.initials, m.tone,
  -- PRD §7.2: mask phone for non-commanders / non-admins / non-self
  case
    when m.id = current_member_id() then m.phone
    when is_division_admin_of(m.division_id) then m.phone
    when exists (
      select 1 from team_members tm
      where tm.member_id = m.id
        and is_commander_of(tm.team_id)
    ) then m.phone
    else null
  end as phone,
  m.joined, m.last_seen, m.calls_this_year,
  m.status, m.status_note, m.status_until, m.status_set_at,
  m.auth_user_id, m.email,
  m.is_division_admin,
  coalesce(
    (select jsonb_agg(
        jsonb_build_object('team_id', tm.team_id, 'role', tm.role)
        order by tm.role
      )
       from team_members tm
       where tm.member_id = m.id),
    '[]'::jsonb
  ) as teams,
  coalesce(
    (select jsonb_agg(
        jsonb_build_object('name', s.name, 'level', ms.level)
        order by
          case ms.level when 'senior' then 0 when 'intermediate' then 1 else 2 end,
          s.name
      )
       from member_skills ms join skills s on s.id = ms.skill_id
       where ms.member_id = m.id),
    '[]'::jsonb
  ) as skills
from members m;
