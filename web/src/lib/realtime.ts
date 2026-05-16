import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export function useRealtime(unitId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!unitId) return;
    const ch = supabase
      .channel(`unit:${unitId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `unit_id=eq.${unitId}` },
        () => qc.invalidateQueries({ queryKey: ['members'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log', filter: `unit_id=eq.${unitId}` },
        () => qc.invalidateQueries({ queryKey: ['activity'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slots', filter: `unit_id=eq.${unitId}` },
        () => qc.invalidateQueries({ queryKey: ['slots'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'slot_assignees' },
        () => qc.invalidateQueries({ queryKey: ['slots'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deployment_windows', filter: `unit_id=eq.${unitId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['deployment-windows'] });
          qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deployment_picks' },
        // No unit_id column on deployment_picks, so no filter clause here.
        () => {
          qc.invalidateQueries({ queryKey: ['deployment-picks'] });
          qc.invalidateQueries({ queryKey: ['deployment-windows'] });
          qc.invalidateQueries({ queryKey: ['my-deployment-windows'] });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [unitId, qc]);
}
