import { useEffect, useState } from 'react';
import { useToast } from './lib/useToast';
import { Sidebar } from './components/Sidebar';
import { CommanderTopbar } from './components/CommanderTopbar';
import { DashboardOverlays } from './components/DashboardOverlays';
import { DashboardScreenRouter } from './components/DashboardScreenRouter';
import { Icon } from './components/Icon';
import {
  useActivity, useApprovedPicksForTeam, useJoinRequests, useMembers, useMyMember, useSkills, useSlots,
  useDivision,
} from './lib/queries';
import { useActiveTeam } from './lib/team-context';
import { useRealtime } from './lib/realtime';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './lib/auth';
import type { Filters, Member, Screen, Slot } from './lib/types';

const titleFor: Record<Screen, { title: string; em: string }> = {
  roster:   { title: 'Who is in', em: 'the team' },
  slots:    { title: 'Open & upcoming', em: 'duty slots' },
  activity: { title: 'Team', em: 'activity' },
  calendar: { title: 'Team', em: 'calendar' },
  day:      { title: 'Team', em: 'day view' },
  reviews:  { title: 'Commander', em: 'reviews' },
  settings: { title: 'Team', em: 'settings' },
  requests: { title: 'Join', em: 'requests' },
  admin:    { title: 'Division', em: 'admin' },
};

export function Dashboard({ onSwitchToReservist, onReplayTour }: { onSwitchToReservist?: () => void; onReplayTour?: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { team, teams, setTeamId } = useActiveTeam();
  const division = useDivision();
  const myMember = useMyMember(user?.id);
  const members = useMembers(team?.id);
  const skills = useSkills(division.data?.id);
  const slots = useSlots(team?.id);
  const activity = useActivity(team?.id);
  const joinRequests = useJoinRequests(team?.id);
  const approvedPicks = useApprovedPicksForTeam(team?.id);
  useRealtime(team?.id);

  const isDivisionAdmin = myMember.data?.is_division_admin ?? false;

  const [active, setActive] = useState<Screen>('roster');
  const [filters, setFilters] = useState<Filters>({ status: [], skills: [], q: '' });
  const [selected, setSelected] = useState<string[]>([]);
  const [person, setPerson] = useState<Member | null>(null);
  const [slotDrawer, setSlotDrawer] = useState<Slot | null>(null);
  const { toast, showToast } = useToast(2200);
  const [modal, setModal] = useState<{ open: boolean; urgent: boolean; preselected: string | null; cloneFrom?: Slot | null }>({
    open: false, urgent: false, preselected: null,
  });
  const [bellOpen, setBellOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        (document.querySelector('.search input') as HTMLInputElement | null)?.focus();
      }
      if (e.key === 'Escape') {
        if (modal.open) setModal({ open: false, urgent: false, preselected: null });
        else if (slotDrawer) setSlotDrawer(null);
        else if (person) setPerson(null);
        else if (bellOpen) setBellOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal.open, person, bellOpen, slotDrawer]);

  useEffect(() => {
    if (person && members.data) {
      const fresh = members.data.find((m) => m.id === person.id);
      if (fresh && fresh.status_set_at !== person.status_set_at) setPerson(fresh);
    }
  }, [members.data, person]);

  useEffect(() => {
    if (slotDrawer && slots.data) {
      const fresh = slots.data.find((s) => s.id === slotDrawer.id);
      if (fresh) setSlotDrawer(fresh);
      else setSlotDrawer(null);
    }
  }, [slots.data]);

  if (!team) {
    return (
      <div style={{ padding: 40, color: 'var(--ink-soft)' }}>
        {teams.length === 0 ? 'No teams found. Contact your division commander.' : 'Loading team…'}
      </div>
    );
  }

  const t = titleFor[active];
  const hasUrgentOpen = (slots.data ?? []).some((s) => s.state === 'published' && s.urgent && s.assignee_id === null);

  return (
    <div className="app">
      <Sidebar
        team={team}
        teams={teams}
        setTeamId={setTeamId}
        members={members.data ?? []}
        slots={slots.data ?? []}
        pendingRequests={(joinRequests.data ?? []).length}
        active={active}
        onNav={(s) => { setActive(s); setPerson(null); setBellOpen(false); setMobileNavOpen(false); }}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        isDivisionAdmin={isDivisionAdmin}
      />

      <div className="main">
        <CommanderTopbar
          title={t}
          hasUrgentOpen={hasUrgentOpen}
          bellOpen={bellOpen}
          onToggleBell={() => setBellOpen((v) => !v)}
          activity={activity.data ?? []}
          onSwitchToReservist={onSwitchToReservist}
          onReplayTour={onReplayTour}
          onOpenMobileMenu={() => setMobileNavOpen(true)}
          onOpenInviteSettings={() => { setActive('settings'); showToast('Open settings → Invite link'); }}
          onNewSlot={(urgent) => setModal({ open: true, urgent, preselected: urgent ? null : selected[0] ?? null })}
        />

        <DashboardScreenRouter
          active={active}
          team={team}
          members={members}
          skills={skills}
          slots={slots}
          activity={activity}
          division={division}
          filters={filters}
          onFilters={setFilters}
          selected={selected}
          setSelected={setSelected}
          onPerson={setPerson}
          onSlotDrawer={setSlotDrawer}
          onModalOpen={({ urgent, preselected }) => setModal({ open: true, urgent, preselected })}
          onSetActive={setActive}
          setTeamId={setTeamId}
          onSettingsRefresh={() => qc.invalidateQueries({ queryKey: ['teams-for-member'] })}
          onToast={showToast}
        />

        <DashboardOverlays
          team={team}
          divisionId={division.data?.id ?? ''}
          members={members.data ?? []}
          slots={slots.data ?? []}
          skills={skills.data ?? []}
          approvedPicks={approvedPicks.data ?? []}
          person={person}
          onClosePerson={() => setPerson(null)}
          slotDrawer={slotDrawer}
          onCloseSlot={() => setSlotDrawer(null)}
          onCloneSlot={(s) => {
            setSlotDrawer(null);
            setModal({ open: true, urgent: s.urgent, preselected: null, cloneFrom: s });
          }}
          modal={modal}
          onCloseModal={() => setModal({ open: false, urgent: false, preselected: null })}
          onToast={showToast}
        />

        <div
          className="toast"
          data-open={toast ? '1' : '0'}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <Icon name="check" size={12}/> {toast}
        </div>
      </div>
    </div>
  );
}
