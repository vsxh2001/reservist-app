import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type {
  ActivityItem, DeploymentPick, DeploymentWindow, JoinRequest,
  Member, Slot, SlotSkill, SkillLevel, Status, Unit,
} from './types';

export function useUnit() {
  return useQuery({
    queryKey: ['unit'],
    queryFn: async (): Promise<Unit> => {
      const { data, error } = await supabase
        .from('units')
        .select('id, name, short_name, crest, invite_code')
        .limit(1)
        .single();
      if (error) throw error;
      return data as Unit;
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
      return (data as Member | null);
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

export function useSelfUpdateStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; status: Status; note: string | null; until: string | null;
      unitId: string; actorName: string;
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
        unit_id: vars.unitId,
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

export function useMembers(unitId: string | undefined) {
  return useQuery({
    queryKey: ['members', unitId],
    enabled: !!unitId,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('members_view')
        .select('*')
        .eq('unit_id', unitId!)
        .order('name');
      if (error) throw error;
      return data as Member[];
    },
  });
}

export function useRoles(unitId: string | undefined) {
  return useQuery({
    queryKey: ['roles', unitId],
    enabled: !!unitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('name')
        .eq('unit_id', unitId!)
        .order('sort_idx');
      if (error) throw error;
      return (data ?? []).map((r) => r.name as string);
    },
  });
}

export function useSkills(unitId: string | undefined) {
  return useQuery({
    queryKey: ['skills', unitId],
    enabled: !!unitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('skills')
        .select('name')
        .eq('unit_id', unitId!)
        .order('name');
      if (error) throw error;
      return (data ?? []).map((s) => s.name as string);
    },
  });
}

export function useSlots(unitId: string | undefined) {
  return useQuery({
    queryKey: ['slots', unitId],
    enabled: !!unitId,
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase
        .from('slots_view')
        .select('*')
        .eq('unit_id', unitId!)
        .order('urgent', { ascending: false })
        .order('start_at', { ascending: true });
      if (error) throw error;
      return data as Slot[];
    },
  });
}

export function useActivity(unitId: string | undefined) {
  return useQuery({
    queryKey: ['activity', unitId],
    enabled: !!unitId,
    queryFn: async (): Promise<ActivityItem[]> => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .eq('unit_id', unitId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ActivityItem[];
    },
  });
}

export function useCreateSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      unitId: string;
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
          unit_id: vars.unitId,
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
          .eq('unit_id', vars.unitId).in('name', names);
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
        unit_id: vars.unitId,
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
      unitId: string; actorName: string; slotTitle: string; memberNames: string[];
    }) => {
      if (!vars.memberIds.length) return;
      const { error } = await supabase.from('slot_assignees').insert(
        vars.memberIds.map((id) => ({
          slot_id: vars.slotId, member_id: id, assigned_by: vars.assignedBy,
        })),
      );
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId,
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
      unitId: string; actorName: string; slotTitle: string; memberName: string;
    }) => {
      const { error } = await supabase
        .from('slot_assignees')
        .delete()
        .eq('slot_id', vars.slotId)
        .eq('member_id', vars.memberId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId,
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
      unitId: string;
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
            .eq('unit_id', vars.unitId).in('name', names);
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
        unit_id: vars.unitId,
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
      actorId: string; unitId: string; actorName: string; slotTitle: string;
    }) => {
      const { error } = await supabase
        .from('slots')
        .update({ state: vars.state })
        .eq('id', vars.slotId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId,
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
      unitId: string;
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
        unit_id: vars.unitId,
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

export function useSetMemberSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; unitId: string; skillName: string; level: SkillLevel;
      actorId: string; actorName: string; memberName: string;
    }) => {
      const { data: skill, error: sErr } = await supabase
        .from('skills').select('id')
        .eq('unit_id', vars.unitId).eq('name', vars.skillName).maybeSingle();
      if (sErr) throw sErr;
      if (!skill) throw new Error(`Skill "${vars.skillName}" not in this unit`);
      const { error } = await supabase
        .from('member_skills')
        .upsert({ member_id: vars.memberId, skill_id: skill.id, level: vars.level },
                { onConflict: 'member_id,skill_id' });
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId,
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
      memberId: string; unitId: string; skillName: string;
      actorId: string; actorName: string; memberName: string;
    }) => {
      const { data: skill } = await supabase
        .from('skills').select('id')
        .eq('unit_id', vars.unitId).eq('name', vars.skillName).maybeSingle();
      if (!skill) return;
      const { error } = await supabase
        .from('member_skills')
        .delete()
        .eq('member_id', vars.memberId)
        .eq('skill_id', skill.id);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId,
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

export function useDeleteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; memberName: string;
      actorId: string; actorName: string; unitId: string;
    }) => {
      const { error } = await supabase.from('members').delete().eq('id', vars.memberId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: 'removed',
        what: `${vars.memberName} from the unit`,
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

export function usePromoteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; isCommander: boolean;
      actorId: string; actorName: string; memberName: string; unitId: string;
    }) => {
      const { error } = await supabase
        .from('members')
        .update({ is_commander: vars.isCommander })
        .eq('id', vars.memberId);
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId,
        actor_id: vars.actorId,
        actor_name: vars.actorName,
        verb: vars.isCommander ? 'promoted' : 'demoted',
        what: `${vars.memberName} ${vars.isCommander ? 'to commander' : 'from commander'}`,
        tone: 'accent',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}

export function useUnitByInvite(code: string | null) {
  return useQuery({
    queryKey: ['unit-by-invite', code],
    enabled: !!code,
    queryFn: async (): Promise<Unit | null> => {
      const { data, error } = await supabase
        .from('units')
        .select('id, name, short_name, crest, invite_code')
        .eq('invite_code', code!)
        .maybeSingle();
      if (error) throw error;
      return (data as Unit | null);
    },
  });
}

export function useJoinRequests(unitId: string | undefined) {
  return useQuery({
    queryKey: ['join-requests', unitId],
    enabled: !!unitId,
    queryFn: async (): Promise<JoinRequest[]> => {
      const { data, error } = await supabase
        .from('join_requests')
        .select('*')
        .eq('unit_id', unitId!)
        .eq('state', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as JoinRequest[];
    },
  });
}

export function useSubmitJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      unitId: string; name: string; phone: string;
      roleName: string | null; skillNames: string[]; note: string | null;
    }) => {
      const { data, error } = await supabase
        .from('join_requests')
        .insert({
          unit_id: vars.unitId,
          name: vars.name,
          phone: vars.phone,
          role_name: vars.roleName,
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
      requestId: string; unitId: string; actorId: string; actorName: string;
      name: string; phone: string; roleName: string | null; skillNames: string[];
    }) => {
      const initials = vars.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
      const tone = Math.floor(Math.random() * 8);
      let roleId: string | null = null;
      if (vars.roleName) {
        const { data: r } = await supabase
          .from('roles').select('id')
          .eq('unit_id', vars.unitId).eq('name', vars.roleName).maybeSingle();
        roleId = r?.id ?? null;
      }
      const { data: m, error: mErr } = await supabase
        .from('members')
        .insert({
          unit_id: vars.unitId,
          name: vars.name,
          initials,
          tone,
          phone: vars.phone,
          role_id: roleId,
          is_commander: false,
          joined: new Date().toISOString().slice(0, 7),
          last_seen: 'just joined',
          status: 'released',
        })
        .select('id')
        .single();
      if (mErr) throw mErr;

      if (vars.skillNames.length) {
        const { data: skillRows } = await supabase
          .from('skills').select('id, name')
          .eq('unit_id', vars.unitId).in('name', vars.skillNames);
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
        unit_id: vars.unitId,
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
      requestId: string; unitId: string; actorId: string; actorName: string; name: string;
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
        unit_id: vars.unitId,
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

export function useAddRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { unitId: string; name: string }) => {
      const { count } = await supabase.from('roles').select('*', { count: 'exact', head: true }).eq('unit_id', vars.unitId);
      const { error } = await supabase.from('roles').insert({
        unit_id: vars.unitId, name: vars.name, sort_idx: count ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { unitId: string; name: string }) => {
      const { count } = await supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('unit_id', vars.unitId)
        .eq('role_id', (await supabase.from('roles').select('id').eq('unit_id', vars.unitId).eq('name', vars.name).single()).data?.id);
      if ((count ?? 0) > 0) {
        throw new Error(`Role "${vars.name}" is in use by ${count} member(s).`);
      }
      const { error } = await supabase.from('roles').delete().eq('unit_id', vars.unitId).eq('name', vars.name);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); },
  });
}

export function useAddSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { unitId: string; name: string }) => {
      const { error } = await supabase.from('skills').insert({ unit_id: vars.unitId, name: vars.name });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['skills'] }); },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { unitId: string; name: string }) => {
      const { error } = await supabase.from('skills').delete().eq('unit_id', vars.unitId).eq('name', vars.name);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['skills'] }); },
  });
}

export function useMemberDeploymentWindows(memberId: string | undefined) {
  return useQuery({
    queryKey: ['deployment-windows', memberId],
    enabled: !!memberId,
    queryFn: async (): Promise<DeploymentWindow[]> => {
      const { data, error } = await supabase
        .from('deployment_windows_view')
        .select('*')
        .eq('member_id', memberId!)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data as DeploymentWindow[];
    },
  });
}

export function useMyDeploymentWindows(userId: string | undefined) {
  // Same query as commander side; kept under a separate key so reservist + commander
  // can subscribe independently without sharing a cache slot.
  return useQuery({
    queryKey: ['my-deployment-windows', userId],
    enabled: !!userId,
    queryFn: async (): Promise<DeploymentWindow[]> => {
      const { data, error } = await supabase
        .from('deployment_windows_view')
        .select('*')
        .eq('member_id', userId!)
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

export function useCreateDeploymentWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      memberId: string; unitId: string;
      label: string; startDate: string; endDate: string; notes: string | null;
      createdBy: string; actorName: string; memberName: string;
    }) => {
      const { data, error } = await supabase
        .from('deployment_windows')
        .insert({
          member_id: vars.memberId, unit_id: vars.unitId,
          label: vars.label, start_date: vars.startDate, end_date: vars.endDate,
          notes: vars.notes, created_by: vars.createdBy,
        })
        .select('id')
        .single();
      if (error) throw error;
      await supabase.from('activity_log').insert({
        unit_id: vars.unitId, actor_id: vars.createdBy, actor_name: vars.actorName,
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
      windowId: string; unitId: string; actorId: string; actorName: string;
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
        unit_id: vars.unitId, actor_id: vars.actorId, actor_name: vars.actorName,
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
      // Upsert keyed by (window_id, date): re-propose resets commander fields.
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
      actorId: string; actorName: string; unitId: string; memberName: string; date: string;
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
        unit_id: vars.unitId, actor_id: vars.actorId, actor_name: vars.actorName,
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

export function useApprovedPicksForUnit(unitId: string | undefined) {
  return useQuery({
    queryKey: ['approved-picks', unitId],
    enabled: !!unitId,
    queryFn: async (): Promise<{ member_id: string; date: string }[]> => {
      // Step 1: fetch all deployment windows for the unit to get their member_id mapping.
      const { data: windows, error: wErr } = await supabase
        .from('deployment_windows')
        .select('id, member_id')
        .eq('unit_id', unitId!);
      if (wErr) throw wErr;
      if (!windows || windows.length === 0) return [];

      // Build a map from window_id → member_id.
      const windowToMember = new Map<string, string>(
        (windows as { id: string; member_id: string }[]).map((w) => [w.id, w.member_id]),
      );
      const windowIds = [...windowToMember.keys()];

      // Step 2: fetch approved picks for those windows.
      const { data: picks, error: pErr } = await supabase
        .from('deployment_picks')
        .select('window_id, date')
        .in('window_id', windowIds)
        .eq('state', 'approved');
      if (pErr) throw pErr;

      // Project: attach member_id from the map.
      return ((picks ?? []) as { window_id: string; date: string }[]).flatMap((p) => {
        const member_id = windowToMember.get(p.window_id);
        return member_id ? [{ member_id, date: p.date }] : [];
      });
    },
  });
}

export function useDirectAddPick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      windowId: string; date: string;
      actorId: string; actorName: string; unitId: string; memberName: string;
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
        unit_id: vars.unitId, actor_id: vars.actorId, actor_name: vars.actorName,
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
