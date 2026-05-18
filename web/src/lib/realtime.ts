import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export function useRealtime(teamId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!teamId) return;
    const ch = supabase
      .channel(`team:${teamId}`)
      // members no longer have team_id directly — broad-invalidate on any row change
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' },
        () => {
          qc.invalidateQueries({ queryKey: ['members'] });
          qc.invalidateQueries({ queryKey: ['my-member'] });
          qc.invalidateQueries({ queryKey: ['members-in-division'] });
        })
      // team_members join table — invalidate memberships and team-for-member caches
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' },
        () => {
          qc.invalidateQueries({ queryKey: ['members'] });
          qc.invalidateQueries({ queryKey: ['teams-for-member'] });
          qc.invalidateQueries({ queryKey: ['team'] });
          qc.invalidateQueries({ queryKey: ['teams-for-division'] });
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log', filter: `team_id=eq.${teamId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['activity'] });
          qc.invalidateQueries({ queryKey: ['my-activity'] });
        })
      // slots now carry assignee_id directly; one subscription covers create / edit / assign / unassign.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots', filter: `team_id=eq.${teamId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['slots'] });
          qc.invalidateQueries({ queryKey: ['my-slots'] });
          qc.invalidateQueries({ queryKey: ['team-day'] });
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'join_requests', filter: `team_id=eq.${teamId}` },
        () => qc.invalidateQueries({ queryKey: ['join-requests'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deployment_windows', filter: `team_id=eq.${teamId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['deployment-windows'] });
          qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
        })
      // deployment_picks has no team_id — broad invalidation
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deployment_picks' },
        () => {
          qc.invalidateQueries({ queryKey: ['deployment-picks'] });
          qc.invalidateQueries({ queryKey: ['deployment-windows'] });
          qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
          qc.invalidateQueries({ queryKey: ['team-day'] });
          qc.invalidateQueries({ queryKey: ['approved-picks'] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [teamId, qc]);
}
