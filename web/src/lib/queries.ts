import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import {
  notifyUrgentCallUp, notifySlotAssigned, notifyPickDecided,
  notifySlotChanged, notifySlotCancelled, notifySlotUnassigned,
  notifyBulkCancelled, notifyDayAdded, notifyStatusChanged,
} from './notify';
import { initialsFromName } from './text';
import type {
  ActivityItem, DeploymentPick, DeploymentWindow, Division, JoinRequest,
  Member, Project, Slot, SkillLevel, Status, Team, TeamRole,
} from './types';

// ---------------------------------------------------------------------------
// Division / project / team queries
// ---------------------------------------------------------------------------

export function useDivision() {
  return useQuery({
    queryKey: ['division'],
    queryFn: async (): Promise<Division | null> => {
      const { data, error } = await supabase
        .from('divisions')
        .select('id, name, created_at')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Division | null;
    },
  });
}

export function useProjects(divisionId: string | undefined) {
  return useQuery({
    queryKey: ['projects', divisionId],
    enabled: !!divisionId,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('id, division_id, name, sort_idx')
        .eq('division_id', divisionId!)
        .order('sort_idx');
      if (error) throw error;
      return data as Project[];
    },
  });
}

export function useTeamsForMember(memberId: string | undefined) {
  return useQuery({
    queryKey: ['teams-for-member', memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<Team[]> => {
      // Get team_ids this member belongs to
      const { data: memberships, error: mErr } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('member_id', memberId!);
      if (mErr) throw mErr;
      const teamIds = ((memberships ?? []) as { team_id: string }[]).map((m) => m.team_id);
      if (teamIds.length === 0) return [];
      const { data, error } = await supabase
        .from('teams_view')
        .select('*')
        .in('id', teamIds)
        .order('project_name')
        .order('name');
      if (error) throw error;
      return data as Team[];
    },
  });
}

export function useTeamsForDivision(divisionId: string | undefined) {
  return useQuery({
    queryKey: ['teams-for-division', divisionId],
    enabled: !!divisionId,
    queryFn: async (): Promise<Team[]> => {
      const { data, error } = await supabase
        .from('teams_view')
        .select('*')
        .eq('division_id', divisionId!)
        .order('project_name')
        .order('name');
      if (error) throw error;
      return data as Team[];
    },
  });
}

export function useTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team', teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<Team | null> => {
      const { data, error } = await supabase
        .from('teams_view')
        .select('*')
        .eq('id', teamId!)
        .maybeSingle();
      if (error) throw error;
      return data as Team | null;
    },
  });
}

// ---------------------------------------------------------------------------
// Member queries
// ---------------------------------------------------------------------------

export function useMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: ['members', teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<Member[]> => {
      // Get member_ids for this team
      const { data: memberships, error: mErr } = await supabase
        .from('team_members')
        .select('member_id')
        .eq('team_id', teamId!);
      if (mErr) throw mErr;
      const memberIds = ((memberships ?? []) as { member_id: string }[]).map((m) => m.member_id);
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase
        .from('members_view')
        .select('*')
        .in('id', memberIds)
        .order('name');
      if (error) throw error;
      return data as Member[];
    },
  });
}

export function useMembersInDivision(divisionId: string | undefined) {
  return useQuery({
    queryKey: ['members-in-division', divisionId],
    enabled: !!divisionId,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('members_view')
        .select('*')
        .eq('division_id', divisionId!)
        .order('name');
      if (error) throw error;
      return data as Member[];
    },
  });
}

export function useMyMember(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-member', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Member | null> => {
      const { data, error } = await supabase
        .from('members_view')
        .select('*')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data as Member | null;
    },
  });
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export function useSkills(divisionId: string | undefined) {
  return useQuery({
    queryKey: ['skills', divisionId],
    enabled: !!divisionId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('skills')
        .select('name')
        .eq('division_id', divisionId!)
        .order('name');
      if (error) throw error;
      return ((data ?? []) as { name: string }[]).map((s) => s.name);
    },
  });
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export function useSlots(teamId: string | undefined) {
  return useQuery({
    queryKey: ['slots', teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase
        .from('slots_view')
        .select('*')
        .eq('team_id', teamId!)
        .order('urgent', { ascending: false })
        .order('start_at', { ascending: true });
      if (error) throw error;
      return data as Slot[];
    },
  });
}

export function useMySlots(memberId: string | undefined) {
  return useQuery({
    queryKey: ['my-slots', memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase
        .from('slots_view')
        .select('*')
        .eq('assignee_id', memberId!)
        .order('start_at');
      if (error) throw error;
      return data as Slot[];
    },
  });
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

export function useActivity(teamId: string | undefined) {
  return useQuery({
    queryKey: ['activity', teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<ActivityItem[]> => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('team_id', teamId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ActivityItem[];
    },
  });
}

/**
 * Reservist-scoped activity feed: actions where the reservist is the actor,
 * scoped to a single team. Used by the My recent activity card on the
 * reservist dashboard so they can see a short history of their own status
 * changes / pick proposals without seeing other members' actions.
 */
export function useMyRecentActivity(memberId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ['my-activity', memberId, teamId],
    enabled: !!memberId && !!teamId,
    queryFn: async (): Promise<ActivityItem[]> => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('actor_id', memberId!)
        .eq('team_id', teamId!)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as ActivityItem[];
    },
  });
}

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

export function useJoinRequests(teamId: string | undefined) {
  return useQuery({
    queryKey: ['join-requests', teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<JoinRequest[]> => {
      const { data, error } = await supabase
        .from('join_requests')
        .select('*')
        .eq('team_id', teamId!)
        .eq('state', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as JoinRequest[];
    },
  });
}

// ---------------------------------------------------------------------------
// Deployment windows + picks
// ---------------------------------------------------------------------------

export function useMyDeploymentWindows(userId: string | undefined, teamId?: string) {
  return useQuery({
    queryKey: ['my-deployment-windows', userId, teamId ?? null],
    enabled: !!userId,
    queryFn: async (): Promise<DeploymentWindow[]> => {
      let q = supabase
        .from('deployment_windows_view')
        .select('*')
        .eq('member_id', userId!)
        .order('start_date', { ascending: false });
      if (teamId) {
        q = q.eq('team_id', teamId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as DeploymentWindow[];
    },
  });
}

export function useMemberDeploymentWindows(memberId: string | undefined, teamId: string | undefined) {
  return useQuery({
    queryKey: ['deployment-windows', memberId, teamId ?? null],
    enabled: !!memberId && !!teamId,
    queryFn: async (): Promise<DeploymentWindow[]> => {
      const { data, error } = await supabase
        .from('deployment_windows_view')
        .select('*')
        .eq('member_id', memberId!)
        .eq('team_id', teamId!)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data as DeploymentWindow[];
    },
  });
}

export function useDeploymentPicks(windowId: string | undefined) {
  return useQuery({
    queryKey: ['deployment-picks', windowId],
    enabled: !!windowId,
    queryFn: async (): Promise<DeploymentPick[]> => {
      const { data, error } = await supabase
        .from('deployment_picks')
        .select('*')
        .eq('window_id', windowId!)
        .order('date');
      if (error) throw error;
      return data as DeploymentPick[];
    },
  });
}

// ---------------------------------------------------------------------------
// Day aggregate
// ---------------------------------------------------------------------------

export interface DayAggregateMember {
  memberId: string;
  memberName: string;
  initials: string;
  tone: number;
  status: import('./types').Status;
  reasons: DayReason[];
}

export type DayReason =
  | { kind: 'pick' }
  | { kind: 'slot'; slotTitle: string };

export function useTeamDayAggregate(teamId: string | undefined, dateISO: string) {
  return useQuery({
    queryKey: ['team-day', teamId, dateISO],
    enabled: !!teamId && !!dateISO,
    queryFn: async (): Promise<DayAggregateMember[]> => {
      const dayStart = new Date(`${dateISO}T00:00:00`);
      const dayEnd   = new Date(`${dateISO}T23:59:59.999`);
      const dayStartISO = dayStart.toISOString();
      const dayEndISO   = dayEnd.toISOString();

      // 1. Approved deployment picks for this date (via windows that belong to the team)
      const { data: picks, error: picksErr } = await supabase
        .from('deployment_picks')
        .select('id, window_id, date, state, deployment_windows!inner(member_id, team_id, members!inner(id, name, initials, tone, status))')
        .eq('state', 'approved')
        .eq('date', dateISO)
        .eq('deployment_windows.team_id', teamId!);
      if (picksErr) throw picksErr;

      // 2. Published slots whose window overlaps with this day, joined to their single assignee
      const { data: assignees, error: assigneesErr } = await supabase
        .from('slots')
        .select('id, title, state, start_at, end_at, team_id, assignee_id, members!inner(id, name, initials, tone, status)')
        .eq('state', 'published')
        .eq('team_id', teamId!)
        .not('assignee_id', 'is', null)
        .lte('start_at', dayEndISO)
        .or(`end_at.gte.${dayStartISO},end_at.is.null`);
      if (assigneesErr) throw assigneesErr;

      const map = new Map<string, DayAggregateMember>();

      type JoinedMember = { id: string; name: string; initials: string; tone: number; status: Status };
      // PostgREST returns the joined `members` row as a single object when the
      // FK is to-one, or as an array when ambiguous. Type both possibilities so
      // we narrow at the access site without `as any`.
      type Joined = JoinedMember | JoinedMember[] | null | undefined;
      const pickOne = (m: Joined): JoinedMember | null =>
        Array.isArray(m) ? (m[0] ?? null) : (m ?? null);
      type PickRow = { deployment_windows?: { team_id?: string; members?: Joined } };
      type SlotRow = { title: string; members?: Joined };

      // Process picks
      for (const pick of (picks ?? []) as unknown as PickRow[]) {
        const win = pick.deployment_windows;
        if (!win) continue;
        if (win.team_id !== teamId) continue;
        const member = pickOne(win.members);
        if (!member) continue;
        const memberId = member.id;
        if (!map.has(memberId)) {
          map.set(memberId, {
            memberId,
            memberName: member.name,
            initials: member.initials,
            tone: member.tone,
            status: member.status,
            reasons: [],
          });
        }
        map.get(memberId)!.reasons.push({ kind: 'pick' });
      }

      // Process slot assignees (single assignee per slot)
      for (const row of (assignees ?? []) as unknown as SlotRow[]) {
        const member = pickOne(row.members);
        if (!member) continue;
        const memberId = member.id;
        if (!map.has(memberId)) {
          map.set(memberId, {
            memberId,
            memberName: member.name,
            initials: member.initials,
            tone: member.tone,
            status: member.status,
            reasons: [],
          });
        }
        const existing = map.get(memberId)!.reasons;
        const alreadyHasSlot = existing.some(
          (r) => r.kind === 'slot' && r.slotTitle === row.title,
        );
        if (!alreadyHasSlot) {
          existing.push({ kind: 'slot', slotTitle: row.title });
        }
      }

      return Array.from(map.values()).sort((a, b) => a.memberName.localeCompare(b.memberName));
    },
  });
}

export function useApprovedPicksForTeam(teamId: string | undefined) {
  return useQuery({
    queryKey: ['approved-picks', teamId],
    enabled: !!teamId,
    queryFn: async (): Promise<{ member_id: string; date: string }[]> => {
      // Fetch all deployment windows for the team to get their member_id mapping.
      const { data: windows, error: wErr } = await supabase
        .from('deployment_windows')
        .select('id, member_id')
        .eq('team_id', teamId!);
      if (wErr) throw wErr;
      if (!windows || windows.length === 0) return [];

      const windowToMember = new Map<string, string>(
        (windows as { id: string; member_id: string }[]).map((w) => [w.id, w.member_id]),
      );
      const windowIds = [...windowToMember.keys()];

      const { data: picks, error: pErr } = await supabase
        .from('deployment_picks')
        .select('window_id, date')
        .in('window_id', windowIds)
        .eq('state', 'approved');
      if (pErr) throw pErr;

      return ((picks ?? []) as { window_id: string; date: string }[]).flatMap((p) => {
        const member_id = windowToMember.get(p.window_id);
        return member_id ? [{ member_id, date: p.date }] : [];
      });
    },
  });
}

// ---------------------------------------------------------------------------
// Invite lookup
// ---------------------------------------------------------------------------

export function useTeamByInvite(code: string | null) {
  return useQuery({
    queryKey: ['team-by-invite', code],
    enabled: !!code,
    queryFn: async (): Promise<Team | null> => {
      const { data, error } = await supabase
        .from('teams_view')
        .select('*')
        .eq('invite_code', code!)
        .maybeSingle();
      if (error) throw error;
      return data as Team | null;
    },
  });
}

/**
 * inspect_invite RPC — three-way discriminator for the JoinScreen.
 *
 * After 20260517032643 the teams SELECT carve-out filters expired invites
 * at the RLS level, collapsing "expired" and "not found" into the same null
 * result for the direct table lookup. This RPC returns an explicit status
 * so the screen can render the right error message.
 *
 * Returns one row with status ∈ { 'valid', 'expired', 'not_found' }.
 * `team_id` + `division_id` are non-null only when status = 'valid'.
 * `team_name` is populated for both 'valid' and 'expired'.
 */
export interface InviteInspection {
  status: 'valid' | 'expired' | 'not_found';
  team_id: string | null;
  team_name: string | null;
  division_id: string | null;
}
export function useInspectInvite(code: string | null) {
  return useQuery({
    queryKey: ['inspect-invite', code],
    enabled: !!code,
    queryFn: async (): Promise<InviteInspection> => {
      const { data, error } = await supabase
        .rpc('inspect_invite', { p_invite_code: code! });
      if (error) throw error;
      const row = (data as InviteInspection[] | null)?.[0];
      // Fallback to 'not_found' if the RPC returns an empty array (shouldn't
      // happen given the union-all in the migration, but defensive).
      return row ?? { status: 'not_found', team_id: null, team_name: null, division_id: null };
    },
  });
}

// ---------------------------------------------------------------------------
// Claim-profile RPCs (RLS-safe path for unlinked auth users)
//
// Under the RLS tightening, `members` SELECT is scoped to the caller's
// division. A freshly-authenticated user has no member row yet, so
// `current_division_id()` is NULL and a direct SELECT returns nothing.
// The two RPCs below route the claim flow through SECURITY DEFINER
// functions that gate on a team invite code + (for the mutation) on
// the caller's auth.uid().
// ---------------------------------------------------------------------------

/** Unclaimed member shape returned by `list_unclaimed_members_by_invite`. */
export interface UnclaimedMember {
  id: string;
  name: string;
  initials: string;
  tone: number;
  division_id: string;
}

export function useUnclaimedMembersByInvite(inviteCode: string | null) {
  return useQuery({
    queryKey: ['unclaimed-members-by-invite', inviteCode],
    enabled: !!inviteCode && inviteCode.trim().length > 0,
    queryFn: async (): Promise<UnclaimedMember[]> => {
      const { data, error } = await supabase.rpc('list_unclaimed_members_by_invite', {
        p_invite_code: inviteCode!,
      });
      if (error) throw error;
      return (data ?? []) as UnclaimedMember[];
    },
  });
}

export function useClaimMemberByInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string;
      inviteCode: string;
      email: string | null;
    }) => {
      const { error } = await supabase.rpc('claim_member_by_invite', {
        p_member_id: vars.memberId,
        p_invite_code: vars.inviteCode,
        p_email: vars.email,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-member'] });
      qc.invalidateQueries({ queryKey: ['unclaimed-members-by-invite'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — team membership
// ---------------------------------------------------------------------------

export function useUpdateTeamMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      teamId: string; memberId: string; role: TeamRole;
      actorId: string; actorName: string; memberName: string;
    }) => {
      const { error } = await supabase
        .from('team_members')
        .upsert(
          { team_id: vars.teamId, member_id: vars.memberId, role: vars.role },
          { onConflict: 'team_id,member_id' },
        );
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: vars.role === 'commander' ? 'promoted' : 'set soldier role for',
        what: vars.memberName,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['teams-for-member'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useRemoveTeamMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      teamId: string; memberId: string;
      actorId: string; actorName: string; memberName: string;
    }) => {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', vars.teamId)
        .eq('member_id', vars.memberId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'removed',
        what: `${vars.memberName} from the team`,
        tone: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['teams-for-member'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — status
// ---------------------------------------------------------------------------

export function useSelfUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; status: Status; note: string | null; until: string | null;
      teamId: string; actorName: string;
    }) => {
      const { error } = await supabase
        .from('members')
        .update({
          status: vars.status,
          status_note: vars.note,
          status_until: vars.until,
          status_set_by: vars.memberId,
          status_set_at: new Date().toISOString(),
        })
        .eq('id', vars.memberId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.memberId,
        actor_name: vars.actorName,
        verb: 'set status to',
        what: vars.status + (vars.until ? ` (until ${vars.until})` : ''),
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['my-member'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      qc.invalidateQueries({ queryKey: ['my-activity'] });
    },
  });
}

export function useUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string;
      status: Status;
      note: string | null;
      until: string | null;
      setBy: string;
      actorName: string;
      memberName: string;
      teamId: string;
      /** Human-readable status label for the push title (e.g. "Unavailable"). */
      statusLabel: string;
    }) => {
      const { error } = await supabase
        .from('members')
        .update({
          status: vars.status,
          status_note: vars.note,
          status_until: vars.until,
          status_set_by: vars.setBy,
          status_set_at: new Date().toISOString(),
        })
        .eq('id', vars.memberId);
      if (error) throw error;

      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.setBy,
        actor_name: vars.actorName,
        verb: `set ${vars.memberName}'s status to`,
        what: vars.status + (vars.until ? ` (until ${vars.until})` : ''),
        tone: 'accent',
      });

      // Push the affected member — but not when a commander is editing their
      // own status (setBy === memberId), where "a commander changed your
      // status" would be misleading and self-redundant.
      if (vars.setBy !== vars.memberId) {
        void notifyStatusChanged(vars.teamId, vars.memberId, vars.statusLabel);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      // The commander may be editing their own status from a desktop drawer
      // while their phone shows the reservist dashboard's MyStatusCard. The
      // members invalidation refreshes the roster but not the personal
      // ['my-member'] cache — invalidate it explicitly so the acting session
      // doesn't lag a realtime tick behind.
      qc.invalidateQueries({ queryKey: ['my-member'] });
    },
    onError: () => {
      // useUpdateStatus does the members UPDATE and the activity_log insert
      // as two separate Supabase calls. If the second fails the first has
      // already committed; invalidate the caches so the UI refetches the
      // true server state instead of leaving the user with the optimistic
      // assumption that nothing happened.
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['my-member'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — skills
// ---------------------------------------------------------------------------

export function useSetMemberSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; divisionId: string; skillName: string; level: SkillLevel;
      actorId: string; actorName: string; memberName: string; teamId: string;
    }) => {
      const { data: skill, error: sErr } = await supabase
        .from('skills').select('id')
        .eq('division_id', vars.divisionId).eq('name', vars.skillName).maybeSingle();
      if (sErr) throw sErr;
      if (!skill) throw new Error(`Skill "${vars.skillName}" not in this division`);
      const { error } = await supabase
        .from('member_skills')
        .upsert({ member_id: vars.memberId, skill_id: skill.id, level: vars.level },
                { onConflict: 'member_id,skill_id' });
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'graded',
        what: `${vars.memberName}'s ${vars.skillName} at ${vars.level}`,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['my-member'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      qc.invalidateQueries({ queryKey: ['my-activity'] });
    },
  });
}

export function useRemoveMemberSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; divisionId: string; skillName: string;
      actorId: string; actorName: string; memberName: string; teamId: string;
    }) => {
      const { data: skill } = await supabase
        .from('skills').select('id')
        .eq('division_id', vars.divisionId).eq('name', vars.skillName).maybeSingle();
      if (!skill) return;
      const { error } = await supabase
        .from('member_skills')
        .delete()
        .eq('member_id', vars.memberId)
        .eq('skill_id', skill.id);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'removed skill',
        what: `${vars.memberName}'s ${vars.skillName}`,
        tone: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['my-member'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      qc.invalidateQueries({ queryKey: ['my-activity'] });
    },
  });
}

export function useAddSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { divisionId: string; name: string }) => {
      const { error } = await supabase.from('skills').insert({ division_id: vars.divisionId, name: vars.name });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['skills'] }); },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { divisionId: string; name: string }) => {
      const { error } = await supabase.from('skills').delete().eq('division_id', vars.divisionId).eq('name', vars.name);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['skills'] }); },
  });
}

// ---------------------------------------------------------------------------
// Mutations — slots
// ---------------------------------------------------------------------------

export function useCreateSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      teamId: string;
      title: string;
      urgent: boolean;
      state: 'draft' | 'published';
      startAt: string;
      endAt: string | null;
      duration: string | null;
      location: string | null;
      assigneeId: string | null;
      createdBy: string;
      actorName: string;
    }) => {
      const { data: slot, error: sErr } = await supabase
        .from('slots')
        .insert({
          team_id: vars.teamId,
          title: vars.title,
          urgent: vars.urgent,
          state: vars.state,
          start_at: vars.startAt,
          end_at: vars.endAt,
          duration: vars.duration,
          location: vars.location,
          assignee_id: vars.assigneeId,
          created_by: vars.createdBy,
        })
        .select('id')
        .single();
      if (sErr) throw sErr;
      const slotId = slot.id as string;

      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.createdBy,
        actor_name: vars.actorName,
        verb: vars.urgent ? 'posted an urgent call-up' : 'created duty slot',
        what: vars.title,
        tone: vars.urgent ? 'urgent' : 'accent',
      });

      // Fire-and-forget push notifications. Urgent → fan out to every team
      // member; assigned slot → just the assignee. Failures are logged inside
      // notify.ts, never bubble to the UI.
      if (vars.urgent) {
        const { data: rows } = await supabase
          .from('team_members')
          .select('member_id')
          .eq('team_id', vars.teamId);
        const memberIds = ((rows ?? []) as { member_id: string }[]).map((r) => r.member_id);
        if (memberIds.length) void notifyUrgentCallUp(vars.teamId, memberIds, vars.title);
      } else if (vars.assigneeId) {
        void notifySlotAssigned(vars.teamId, vars.assigneeId, vars.title);
      }

      return slotId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      // Creating an already-assigned slot needs the reservist's personal
      // ['my-slots'] cache to refresh, and the team day view caches the
      // assignment too. Realtime fans these out for other devices; this
      // covers the acting commander's own view without the round-trip lag.
      qc.invalidateQueries({ queryKey: ['my-slots'] });
      qc.invalidateQueries({ queryKey: ['team-day'] });
    },
  });
}

export function useAssignToSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slotId: string; memberId: string; assignedBy: string;
      teamId: string; actorName: string; slotTitle: string; memberName: string;
    }) => {
      // Refuse to clobber an existing assignee. Two commanders racing on the
      // same slot would otherwise each succeed and produce two activity_log
      // rows + two push notifications. Constrain the UPDATE to the
      // unassigned state and check the affected row count.
      const { data: rows, error } = await supabase
        .from('slots')
        .update({ assignee_id: vars.memberId })
        .eq('id', vars.slotId)
        .is('assignee_id', null)
        .select('id');
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error('This slot already has an assignee. Refresh to see the current assignment.');
      }
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.assignedBy,
        actor_name: vars.actorName,
        verb: 'assigned',
        what: `${vars.memberName} to ${vars.slotTitle}`,
        tone: 'accent',
      });
      void notifySlotAssigned(vars.teamId, vars.memberId, vars.slotTitle);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['my-slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUnassignFromSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slotId: string; memberId: string; actorId: string;
      teamId: string; actorName: string; slotTitle: string; memberName: string;
    }) => {
      // Already guarded against clobbering: `.eq('assignee_id', vars.memberId)`
      // means the UPDATE matches zero rows when someone else has reassigned
      // the slot. Pull the row count so we can skip the phantom activity_log
      // entry + push that would otherwise fire on a 0-row update.
      const { data: rows, error } = await supabase
        .from('slots')
        .update({ assignee_id: null })
        .eq('id', vars.slotId)
        .eq('assignee_id', vars.memberId)
        .select('id');
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error('That member is no longer assigned to this slot. Refresh to see the current state.');
      }
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'unassigned',
        what: `${vars.memberName} from ${vars.slotTitle}`,
        tone: null,
      });
      void notifySlotUnassigned(vars.teamId, vars.memberId, vars.slotTitle);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['my-slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUpdateSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slotId: string;
      teamId: string;
      patch: {
        title?: string;
        urgent?: boolean;
        startAt?: string;
        endAt?: string | null;
        duration?: string | null;
        location?: string | null;
        notes?: string | null;
      };
      actorId: string;
      actorName: string;
      /** Optional — when set, the slot's current assignee receives a push (PRD §7.8). */
      assigneeId?: string | null;
      /** Optional — used to compose the push title; falls back to patch.title. */
      slotTitle?: string;
    }) => {
      const row: Record<string, unknown> = {};
      if (vars.patch.title !== undefined)    row.title     = vars.patch.title;
      if (vars.patch.urgent !== undefined)   row.urgent    = vars.patch.urgent;
      if (vars.patch.startAt !== undefined)  row.start_at  = vars.patch.startAt;
      if (vars.patch.endAt !== undefined)    row.end_at    = vars.patch.endAt;
      if (vars.patch.duration !== undefined) row.duration  = vars.patch.duration;
      if (vars.patch.location !== undefined) row.location  = vars.patch.location;
      if (vars.patch.notes !== undefined)    row.notes     = vars.patch.notes;

      if (Object.keys(row).length) {
        const { error } = await supabase.from('slots').update(row).eq('id', vars.slotId);
        if (error) throw error;
      }

      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'edited slot',
        what: vars.patch.title ?? null,
        tone: 'accent',
      });

      if (vars.assigneeId) {
        const pushTitle = vars.patch.title ?? vars.slotTitle ?? 'duty slot';
        void notifySlotChanged(vars.teamId, vars.assigneeId, pushTitle);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: () => {
      // useUpdateSlot runs the slots UPDATE then the activity_log INSERT in
      // sequence. If the second fails the slot is already mutated server-side;
      // invalidate so the UI refetches ground truth instead of trusting stale
      // local data.
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['my-slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUpdateSlotState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slotId: string; state: 'draft' | 'published' | 'completed' | 'cancelled';
      /** The state the caller last saw — guards against a concurrent transition. */
      currentState: 'draft' | 'published' | 'completed' | 'cancelled';
      actorId: string; teamId: string; actorName: string; slotTitle: string;
      /** Optional — when set + state==='cancelled', the assignee receives a push (PRD §7.8). */
      assigneeId?: string | null;
    }) => {
      // Two commanders can act on the same slot at once (e.g. one publishes
      // while another cancels). The `.eq('state', currentState)` guard makes
      // the UPDATE a no-op when the slot already moved on; the 0-row result
      // then surfaces a clean error instead of logging the change twice and
      // firing a duplicate cancellation push. Mirrors useResolvePick.
      const { data: rows, error } = await supabase
        .from('slots')
        .update({ state: vars.state })
        .eq('id', vars.slotId)
        .eq('state', vars.currentState)
        .select('id');
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error('This slot was already changed by another commander. Refresh to see the current state.');
      }
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: `marked slot ${vars.state}`,
        what: vars.slotTitle,
        tone: vars.state === 'cancelled' ? 'urgent' : 'accent',
      });

      if (vars.state === 'cancelled' && vars.assigneeId) {
        void notifySlotCancelled(vars.teamId, vars.assigneeId, vars.slotTitle);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — member lifecycle
// ---------------------------------------------------------------------------

export function useDeleteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; memberName: string;
      actorId: string; actorName: string; teamId: string;
    }) => {
      // Purge the member row AND any linked auth.users row in one atomic,
      // authorization-gated server-side call. The anon client cannot touch
      // auth.users directly, so we delegate to a SECURITY DEFINER function.
      const { error } = await supabase.rpc('delete_member_full', {
        p_member_id: vars.memberId,
      });
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'removed',
        what: `${vars.memberName} from the division`,
        tone: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — join requests
// ---------------------------------------------------------------------------

export function useSubmitJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      teamId: string; name: string; phone: string;
      skillNames: string[]; note: string | null;
    }) => {
      const { data, error } = await supabase
        .from('join_requests')
        .insert({
          team_id: vars.teamId,
          name: vars.name,
          phone: vars.phone,
          skill_names: vars.skillNames,
          note: vars.note,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['join-requests'] }); },
  });
}

export function useApproveJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      requestId: string; teamId: string; divisionId: string;
      actorId: string; actorName: string;
      name: string; phone: string; skillNames: string[];
    }) => {
      // Claim the request FIRST, before provisioning anything. Two commanders
      // can hit Approve (or Approve + Reject) on the same request at once; the
      // `.eq('state', 'pending')` guard makes the loser's UPDATE a no-op (0
      // rows) so we throw before creating a member. Provisioning first would
      // leave a duplicate orphan member behind on the losing approve. A join
      // request is only ever resolved from 'pending', so the source state is
      // hardcoded rather than caller-supplied. Mirrors useResolvePick.
      const { data: claimed, error: claimErr } = await supabase
        .from('join_requests')
        .update({
          state: 'approved',
          resolved_at: new Date().toISOString(),
          resolved_by: vars.actorId,
        })
        .eq('id', vars.requestId)
        .eq('state', 'pending')
        .select('id');
      if (claimErr) throw claimErr;
      if (!claimed || claimed.length === 0) {
        throw new Error('This join request was already resolved by another commander.');
      }

      // Tradeoff of claiming first: if a provisioning insert below fails
      // (FK/RLS/network), the request is already 'approved' and drops out of
      // the pending list, so it can't be retried from the UI. That is rarer
      // and less corrupting than the duplicate-orphan-member it replaces;
      // closing it fully would need a server-side transaction (RPC).
      const initials = initialsFromName(vars.name);
      const tone = Math.floor(Math.random() * 8);

      const { data: m, error: mErr } = await supabase
        .from('members')
        .insert({
          division_id: vars.divisionId,
          name: vars.name,
          initials,
          tone,
          phone: vars.phone,
          joined: new Date().toISOString().slice(0, 7),
          last_seen: 'just joined',
          status: 'released',
        })
        .select('id')
        .single();
      if (mErr) throw mErr;

      // Add as soldier to the team
      await supabase.from('team_members').insert({
        team_id: vars.teamId,
        member_id: m.id,
        role: 'soldier',
      });

      if (vars.skillNames.length) {
        const { data: skillRows } = await supabase
          .from('skills').select('id, name')
          .eq('division_id', vars.divisionId).in('name', vars.skillNames);
        if (skillRows && skillRows.length) {
          await supabase.from('member_skills').insert(
            (skillRows as { id: string; name: string }[]).map((s) => ({ member_id: m.id, skill_id: s.id })),
          );
        }
      }

      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'approved join request',
        what: vars.name,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['join-requests'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useRejectJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      requestId: string; teamId: string; actorId: string; actorName: string; name: string;
    }) => {
      // Guard the pending->rejected transition so a concurrent approve/reject
      // of the same request can't double-log. A join request is only ever
      // resolved from 'pending'. Mirrors useResolvePick.
      const { data: rows, error } = await supabase
        .from('join_requests')
        .update({
          state: 'rejected',
          resolved_at: new Date().toISOString(),
          resolved_by: vars.actorId,
        })
        .eq('id', vars.requestId)
        .eq('state', 'pending')
        .select('id');
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error('This join request was already resolved by another commander.');
      }
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'rejected join request',
        what: vars.name,
        tone: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['join-requests'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — deployment windows + picks
// ---------------------------------------------------------------------------

export function useCreateDeploymentWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; teamId: string;
      label: string; startDate: string; endDate: string; notes: string | null;
      createdBy: string; actorName: string; memberName: string;
    }) => {
      const { data, error } = await supabase
        .from('deployment_windows')
        .insert({
          member_id: vars.memberId, team_id: vars.teamId,
          label: vars.label, start_date: vars.startDate, end_date: vars.endDate,
          notes: vars.notes, created_by: vars.createdBy,
        })
        .select('id')
        .single();
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId, actor_id: vars.createdBy, actor_name: vars.actorName,
        verb: 'opened deployment window',
        what: `${vars.memberName} · ${vars.label} (${vars.startDate} → ${vars.endDate})`,
        tone: 'accent',
      });
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUpdateDeploymentWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      windowId: string; teamId: string; actorId: string; actorName: string;
      patch: {
        label?: string; startDate?: string; endDate?: string; notes?: string | null;
        state?: 'open' | 'closed';
        /** The state the caller last saw. Required when `state` is set so a
         *  concurrent open/close can't double-fire; ignored for metadata edits. */
        currentState?: 'open' | 'closed';
      };
    }) => {
      const row: Record<string, unknown> = {};
      if (vars.patch.label     !== undefined) row.label      = vars.patch.label;
      if (vars.patch.startDate !== undefined) row.start_date = vars.patch.startDate;
      if (vars.patch.endDate   !== undefined) row.end_date   = vars.patch.endDate;
      if (vars.patch.notes     !== undefined) row.notes      = vars.patch.notes;
      if (vars.patch.state     !== undefined) row.state      = vars.patch.state;
      if (Object.keys(row).length === 0) return;
      // Only a state transition (open<->closed) needs the concurrency guard;
      // metadata-only edits keep their original unguarded behavior. When the
      // guard applies and the window already moved on, the 0-row result
      // surfaces a clean error instead of logging the close/open twice.
      const guarding = vars.patch.state !== undefined && vars.patch.currentState !== undefined;
      let q = supabase.from('deployment_windows').update(row).eq('id', vars.windowId);
      if (guarding) q = q.eq('state', vars.patch.currentState!);
      const { data: rows, error } = await q.select('id');
      if (error) throw error;
      if (guarding && (!rows || rows.length === 0)) {
        throw new Error('This deployment window was already changed by another commander. Refresh to see the current state.');
      }
      await supabase.from('activity_log').insert({
        team_id: vars.teamId, actor_id: vars.actorId, actor_name: vars.actorName,
        verb: vars.patch.state === 'closed' ? 'closed deployment window' : 'edited deployment window',
        what: null, tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useProposeDayPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      windowId: string; date: string; reservistNote: string | null;
      /** Optional actor metadata; when present we log to activity_log so the
       *  reservist's My recent activity card surfaces the pick. */
      actorId?: string; actorName?: string; teamId?: string;
    }) => {
      const { error } = await supabase
        .from('deployment_picks')
        .upsert({
          window_id: vars.windowId, date: vars.date,
          state: 'proposed', reservist_note: vars.reservistNote,
          commander_note: null, resolved_at: null, resolved_by: null,
          proposed_at: new Date().toISOString(),
        }, { onConflict: 'window_id,date' });
      if (error) throw error;
      if (vars.actorId && vars.teamId) {
        await supabase.from('activity_log').insert({
          team_id: vars.teamId,
          actor_id: vars.actorId,
          actor_name: vars.actorName ?? '',
          verb: 'proposed deployment day',
          what: vars.date,
          tone: 'accent',
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-activity'] });
    },
  });
}

export function useSetReservistNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { pickId: string; note: string | null }) => {
      const { error } = await supabase
        .from('deployment_picks')
        .update({ reservist_note: vars.note })
        .eq('id', vars.pickId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
    },
  });
}

export function useWithdrawDayPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      pickId: string;
      /** The state the caller last saw — guards against a concurrent resolve. */
      currentState: 'proposed' | 'approved' | 'rejected' | 'withdrawn';
      /** Optional actor metadata for activity_log; pass the pick's date so the
       *  log entry's `what` field carries enough context to render. */
      actorId?: string; actorName?: string; teamId?: string; date?: string;
    }) => {
      // A reservist can withdraw a day at the same instant a commander
      // approves/rejects it. The `.eq('state', currentState)` guard makes the
      // withdrawal a no-op if the pick already moved on, so we don't log a
      // phantom withdrawal over a decision. Mirrors useResolvePick.
      const { data: rows, error } = await supabase
        .from('deployment_picks')
        .update({ state: 'withdrawn', resolved_at: new Date().toISOString() })
        .eq('id', vars.pickId)
        .eq('state', vars.currentState)
        .select('id');
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error('This deployment day was already changed. Refresh to see the current state.');
      }
      if (vars.actorId && vars.teamId) {
        await supabase.from('activity_log').insert({
          team_id: vars.teamId,
          actor_id: vars.actorId,
          actor_name: vars.actorName ?? '',
          verb: 'withdrew deployment day',
          what: vars.date ?? null,
          tone: null,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-activity'] });
    },
  });
}

export function useResolvePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      pickId: string; nextState: 'approved' | 'rejected';
      commanderNote: string | null;
      actorId: string; actorName: string; teamId: string;
      memberId: string; memberName: string;
      windowLabel: string;
      date: string;
    }) => {
      // Two commanders can hit Approve/Reject on the same pick at the same
      // moment. The `.eq('state', 'pending')` guard makes the UPDATE a no-op
      // when the pick has already been resolved; the returned row count is
      // then 0 and we surface a clean error instead of logging the resolve
      // twice + firing duplicate push notifications. See PRD §7.4.
      const { data: rows, error } = await supabase
        .from('deployment_picks')
        .update({
          state: vars.nextState, commander_note: vars.commanderNote,
          resolved_at: new Date().toISOString(), resolved_by: vars.actorId,
        })
        .eq('id', vars.pickId)
        .eq('state', 'pending')
        .select('id');
      if (error) throw error;
      if (!rows || rows.length === 0) {
        throw new Error('This deployment pick was already resolved by another commander.');
      }
      await supabase.from('activity_log').insert({
        team_id: vars.teamId, actor_id: vars.actorId, actor_name: vars.actorName,
        verb: vars.nextState === 'approved' ? 'approved deployment day' : 'rejected deployment day',
        what: `${vars.memberName} · ${vars.date}`,
        tone: vars.nextState === 'approved' ? 'accent' : null,
      });
      void notifyPickDecided(vars.teamId, vars.memberId, vars.nextState, `${vars.windowLabel} · ${vars.date}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useDirectAddPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      windowId: string; date: string;
      actorId: string; actorName: string; teamId: string; memberName: string;
      /** The window's member — receives a push that they were recorded for the day. */
      memberId: string;
      /** Used to compose the push title (label · date). */
      windowLabel: string;
    }) => {
      const { error } = await supabase
        .from('deployment_picks')
        .upsert({
          window_id: vars.windowId, date: vars.date,
          state: 'approved', proposed_at: new Date().toISOString(),
          resolved_at: new Date().toISOString(), resolved_by: vars.actorId,
        }, { onConflict: 'window_id,date' });
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId, actor_id: vars.actorId, actor_name: vars.actorName,
        verb: 'recorded deployment day',
        what: `${vars.memberName} · ${vars.date}`,
        tone: 'accent',
      });
      void notifyDayAdded(vars.teamId, vars.memberId, vars.windowLabel);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Division-admin mutations — projects, teams, admin flag
// ---------------------------------------------------------------------------

/**
 * Create a project within a division.
 * Activity is logged against the first team in the division (division-level ops).
 */
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      divisionId: string; name: string; sortIdx: number;
      actorId: string; actorName: string; unitId: string;
    }) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({ division_id: vars.divisionId, name: vars.name, sort_idx: vars.sortIdx })
        .select('id')
        .single();
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.unitId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'created project',
        what: vars.name,
        tone: 'accent',
      });
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/** Rename a project or update its sort_idx. */
export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      projectId: string;
      patch: { name?: string; sort_idx?: number };
      actorId: string; actorName: string; unitId: string;
    }) => {
      const row: Record<string, unknown> = {};
      if (vars.patch.name     !== undefined) row.name     = vars.patch.name;
      if (vars.patch.sort_idx !== undefined) row.sort_idx = vars.patch.sort_idx;
      if (Object.keys(row).length) {
        const { error } = await supabase.from('projects').update(row).eq('id', vars.projectId);
        if (error) throw error;
      }
      await supabase.from('activity_log').insert({
        team_id: vars.unitId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'renamed project',
        what: vars.patch.name ?? null,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/** Create a team within a project. */
export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      projectId: string; divisionId: string; name: string; crest: string;
      actorId: string; actorName: string; unitId: string;
    }) => {
      const { data, error } = await supabase
        .from('teams')
        .insert({ project_id: vars.projectId, division_id: vars.divisionId, name: vars.name, crest: vars.crest })
        .select('id')
        .single();
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.unitId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'created team',
        what: vars.name,
        tone: 'accent',
      });
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams-for-division'] });
      qc.invalidateQueries({ queryKey: ['teams-for-member'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/** Rename a team, change its crest, or move it to another project. */
export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      teamId: string;
      patch: { name?: string; crest?: string; project_id?: string };
      actorId: string; actorName: string;
    }) => {
      const row: Record<string, unknown> = {};
      if (vars.patch.name       !== undefined) row.name       = vars.patch.name;
      if (vars.patch.crest      !== undefined) row.crest      = vars.patch.crest;
      if (vars.patch.project_id !== undefined) row.project_id = vars.patch.project_id;
      if (Object.keys(row).length) {
        const { error } = await supabase.from('teams').update(row).eq('id', vars.teamId);
        if (error) throw error;
      }
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'updated team',
        what: vars.patch.name ?? null,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams-for-division'] });
      qc.invalidateQueries({ queryKey: ['teams-for-member'] });
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

/**
 * PRD §7.6 — flip the per-team `show_unit_schedule` flag.
 * When false, reservists only see slots they are personally assigned to
 * (plus urgent slots — filter lives in ReservistDashboard.tsx).
 */
export function useSetTeamShowUnitSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { teamId: string; value: boolean }) => {
      const { error } = await supabase
        .from('teams')
        .update({ show_unit_schedule: vars.value })
        .eq('id', vars.teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams-for-division'] });
      qc.invalidateQueries({ queryKey: ['teams-for-member'] });
      qc.invalidateQueries({ queryKey: ['team'] });
    },
  });
}

/**
 * Grant or revoke division-admin status for a member.
 * Self-revoke is blocked: a caller must ensure memberId !== actorId before calling.
 */
export function useSetDivisionAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; isAdmin: boolean;
      actorId: string; actorName: string; memberName: string; unitId: string;
    }) => {
      if (vars.memberId === vars.actorId && !vars.isAdmin) {
        throw new Error('Cannot revoke your own division-admin role.');
      }
      const { error } = await supabase
        .from('members')
        .update({ is_division_admin: vars.isAdmin })
        .eq('id', vars.memberId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.unitId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: vars.isAdmin ? 'granted division-admin to' : 'revoked division-admin from',
        what: vars.memberName,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['members-in-division'] });
      qc.invalidateQueries({ queryKey: ['my-member'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — phone visibility opt-in (PRD §7.2)
// ---------------------------------------------------------------------------

/**
 * Toggle the reservist's `phone_visible_to_peers` flag. When true, the member's
 * phone is exposed to other members in the same division via `members_view`.
 * Commanders / division admins / self always see the phone regardless of this flag.
 */
export function useSetPhoneVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { memberId: string; visible: boolean }) => {
      const { error } = await supabase
        .from('members')
        .update({ phone_visible_to_peers: vars.visible })
        .eq('id', vars.memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['my-member'] });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — bulk-cancel slots in a date range
// ---------------------------------------------------------------------------

/**
 * Cancel all draft/published slots for a team whose `start_at` falls within
 * the half-open interval [fromISO, toISO]. Returns the count of cancelled
 * slots. A single activity_log row is written summarising the bulk action;
 * per-slot state changes are not individually logged (the trigger-less
 * convention follows `useUpdateSlotState`, which also writes one row per
 * call).
 */
export function useBulkCancelSlots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      teamId: string;
      fromISO: string;
      toISO: string;
      actorId: string;
      actorName: string;
    }): Promise<number> => {
      const { data, error } = await supabase
        .from('slots')
        .update({ state: 'cancelled' })
        .eq('team_id', vars.teamId)
        .in('state', ['draft', 'published'])
        .gte('start_at', vars.fromISO)
        .lte('start_at', vars.toISO)
        .select('id, assignee_id');
      if (error) throw error;
      const rows = (data ?? []) as { id: string; assignee_id: string | null }[];
      const count = rows.length;
      if (count > 0) {
        await supabase.from('activity_log').insert({
          team_id: vars.teamId,
          actor_id: vars.actorId,
          actor_name: vars.actorName,
          verb: 'bulk-cancelled slots',
          what: `${count} slot${count === 1 ? '' : 's'} in range`,
          tone: 'urgent',
        });

        // One grouped fan-out (not one invoke per slot) keeps bulk cancel
        // under the send-push per-caller rate limit, while still giving every
        // assignee the parity notification the single-cancel path sends (§7.8).
        const assigneeIds = [
          ...new Set(rows.map((r) => r.assignee_id).filter((id): id is string => !!id)),
        ];
        if (assigneeIds.length) void notifyBulkCancelled(vars.teamId, assigneeIds);
      }
      return count;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['my-slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
