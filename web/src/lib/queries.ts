import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type {
  ActivityItem, DeploymentPick, DeploymentWindow, Division, JoinRequest,
  Member, Project, Slot, SlotSkill, SkillLevel, Status, Team, TeamRole,
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
      const teamIds = (memberships ?? []).map((m: any) => m.team_id as string);
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
      const memberIds = (memberships ?? []).map((m: any) => m.member_id as string);
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
      return (data ?? []).map((s: any) => s.name as string);
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
      const { data: rows, error: rErr } = await supabase
        .from('slot_assignees')
        .select('slot_id')
        .eq('member_id', memberId!);
      if (rErr) throw rErr;
      const ids = (rows ?? []).map((x: any) => x.slot_id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('slots_view')
        .select('*')
        .in('id', ids)
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

      // 2. Published slot assignees whose slot overlaps with this day
      const { data: assignees, error: assigneesErr } = await supabase
        .from('slot_assignees')
        .select('member_id, slots!inner(id, title, state, start_at, end_at, team_id), members!inner(id, name, initials, tone, status)')
        .eq('slots.state', 'published')
        .eq('slots.team_id', teamId!)
        .lte('slots.start_at', dayEndISO)
        .or(`end_at.gte.${dayStartISO},end_at.is.null`, { referencedTable: 'slots' });
      if (assigneesErr) throw assigneesErr;

      const map = new Map<string, DayAggregateMember>();

      // Process picks
      for (const pick of (picks ?? []) as any[]) {
        const win = pick.deployment_windows;
        if (!win) continue;
        if (win.team_id !== teamId) continue;
        const member = win.members;
        if (!member) continue;
        const memberId: string = member.id;
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

      // Process slot assignees
      for (const row of (assignees ?? []) as any[]) {
        const slot = row.slots;
        const member = row.members;
        if (!slot || !member) continue;
        const memberId: string = member.id;
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
          (r) => r.kind === 'slot' && r.slotTitle === slot.title,
        );
        if (!alreadyHasSlot) {
          existing.push({ kind: 'slot', slotTitle: slot.title });
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
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
      divisionId: string;
      title: string;
      urgent: boolean;
      state: 'draft' | 'published';
      startAt: string;
      endAt: string | null;
      duration: string | null;
      location: string | null;
      skills: SlotSkill[];
      needed: number;
      assigneeIds: string[];
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
          needed: vars.needed,
          created_by: vars.createdBy,
        })
        .select('id')
        .single();
      if (sErr) throw sErr;
      const slotId = slot.id as string;

      if (vars.skills.length) {
        const names = vars.skills.map((s) => s.name);
        const { data: skillRows } = await supabase
          .from('skills').select('id, name')
          .eq('division_id', vars.divisionId).in('name', names);
        if (skillRows && skillRows.length) {
          const byName = new Map(skillRows.map((s: any) => [s.name, s.id]));
          await supabase.from('slot_skills').insert(
            vars.skills.flatMap((s) => {
              const id = byName.get(s.name);
              return id ? [{ slot_id: slotId, skill_id: id, min_level: s.min_level }] : [];
            }),
          );
        }
      }
      if (vars.assigneeIds.length) {
        await supabase.from('slot_assignees').insert(
          vars.assigneeIds.map((id) => ({
            slot_id: slotId, member_id: id, assigned_by: vars.createdBy,
          })),
        );
      }
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.createdBy,
        actor_name: vars.actorName,
        verb: vars.urgent ? 'posted an urgent call-up' : 'created duty slot',
        what: vars.title,
        tone: vars.urgent ? 'urgent' : 'accent',
      });
      return slotId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useAssignToSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slotId: string; memberIds: string[]; assignedBy: string;
      teamId: string; actorName: string; slotTitle: string; memberNames: string[];
    }) => {
      if (!vars.memberIds.length) return;
      const { error } = await supabase.from('slot_assignees').insert(
        vars.memberIds.map((id) => ({
          slot_id: vars.slotId, member_id: id, assigned_by: vars.assignedBy,
        })),
      );
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.assignedBy,
        actor_name: vars.actorName,
        verb: 'assigned',
        what: `${vars.memberNames.join(', ')} to ${vars.slotTitle}`,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
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
      const { error } = await supabase
        .from('slot_assignees')
        .delete()
        .eq('slot_id', vars.slotId)
        .eq('member_id', vars.memberId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'unassigned',
        what: `${vars.memberName} from ${vars.slotTitle}`,
        tone: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
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
      divisionId: string;
      patch: {
        title?: string;
        urgent?: boolean;
        startAt?: string;
        endAt?: string | null;
        duration?: string | null;
        location?: string | null;
        needed?: number;
        notes?: string | null;
      };
      replaceSkills?: SlotSkill[];
      actorId: string;
      actorName: string;
    }) => {
      const row: Record<string, unknown> = {};
      if (vars.patch.title !== undefined)    row.title     = vars.patch.title;
      if (vars.patch.urgent !== undefined)   row.urgent    = vars.patch.urgent;
      if (vars.patch.startAt !== undefined)  row.start_at  = vars.patch.startAt;
      if (vars.patch.endAt !== undefined)    row.end_at    = vars.patch.endAt;
      if (vars.patch.duration !== undefined) row.duration  = vars.patch.duration;
      if (vars.patch.location !== undefined) row.location  = vars.patch.location;
      if (vars.patch.needed !== undefined)   row.needed    = vars.patch.needed;
      if (vars.patch.notes !== undefined)    row.notes     = vars.patch.notes;

      if (Object.keys(row).length) {
        const { error } = await supabase.from('slots').update(row).eq('id', vars.slotId);
        if (error) throw error;
      }

      if (vars.replaceSkills) {
        await supabase.from('slot_skills').delete().eq('slot_id', vars.slotId);
        if (vars.replaceSkills.length) {
          const names = vars.replaceSkills.map((s) => s.name);
          const { data: skillRows } = await supabase
            .from('skills').select('id, name')
            .eq('division_id', vars.divisionId).in('name', names);
          if (skillRows && skillRows.length) {
            const byName = new Map(skillRows.map((s: any) => [s.name, s.id]));
            await supabase.from('slot_skills').insert(
              vars.replaceSkills.flatMap((s) => {
                const id = byName.get(s.name);
                return id ? [{ slot_id: vars.slotId, skill_id: id, min_level: s.min_level }] : [];
              }),
            );
          }
        }
      }

      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'edited slot',
        what: vars.patch.title ?? null,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slots'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUpdateSlotState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      slotId: string; state: 'draft' | 'published' | 'completed' | 'cancelled';
      actorId: string; teamId: string; actorName: string; slotTitle: string;
    }) => {
      const { error } = await supabase
        .from('slots')
        .update({ state: vars.state })
        .eq('id', vars.slotId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: `marked slot ${vars.state}`,
        what: vars.slotTitle,
        tone: vars.state === 'cancelled' ? 'urgent' : 'accent',
      });
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
      const { error } = await supabase.from('members').delete().eq('id', vars.memberId);
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
      const initials = vars.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
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
            skillRows.map((s: any) => ({ member_id: m.id, skill_id: s.id })),
          );
        }
      }

      await supabase
        .from('join_requests')
        .update({
          state: 'approved',
          resolved_at: new Date().toISOString(),
          resolved_by: vars.actorId,
        })
        .eq('id', vars.requestId);

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
      const { error } = await supabase
        .from('join_requests')
        .update({
          state: 'rejected',
          resolved_at: new Date().toISOString(),
          resolved_by: vars.actorId,
        })
        .eq('id', vars.requestId);
      if (error) throw error;
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
      patch: { label?: string; startDate?: string; endDate?: string; notes?: string | null; state?: 'open' | 'closed' };
    }) => {
      const row: Record<string, unknown> = {};
      if (vars.patch.label     !== undefined) row.label      = vars.patch.label;
      if (vars.patch.startDate !== undefined) row.start_date = vars.patch.startDate;
      if (vars.patch.endDate   !== undefined) row.end_date   = vars.patch.endDate;
      if (vars.patch.notes     !== undefined) row.notes      = vars.patch.notes;
      if (vars.patch.state     !== undefined) row.state      = vars.patch.state;
      if (Object.keys(row).length === 0) return;
      const { error } = await supabase.from('deployment_windows').update(row).eq('id', vars.windowId);
      if (error) throw error;
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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
    },
  });
}

export function useWithdrawDayPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { pickId: string }) => {
      const { error } = await supabase
        .from('deployment_picks')
        .update({ state: 'withdrawn', resolved_at: new Date().toISOString() })
        .eq('id', vars.pickId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deployment-picks'] });
      qc.invalidateQueries({ queryKey: ['deployment-windows'] });
      qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
    },
  });
}

export function useResolvePick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      pickId: string; nextState: 'approved' | 'rejected';
      commanderNote: string | null;
      actorId: string; actorName: string; teamId: string; memberName: string; date: string;
    }) => {
      const { error } = await supabase
        .from('deployment_picks')
        .update({
          state: vars.nextState, commander_note: vars.commanderNote,
          resolved_at: new Date().toISOString(), resolved_by: vars.actorId,
        })
        .eq('id', vars.pickId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        team_id: vars.teamId, actor_id: vars.actorId, actor_name: vars.actorName,
        verb: vars.nextState === 'approved' ? 'approved deployment day' : 'rejected deployment day',
        what: `${vars.memberName} · ${vars.date}`,
        tone: vars.nextState === 'approved' ? 'accent' : null,
      });
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
