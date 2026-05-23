import { useEffect, useState } from 'react';
import { useToast } from './lib/useToast';
import { Sidebar } from './components/Sidebar';
import { Roster } from './components/Roster';
import { PersonDrawer } from './components/PersonDrawer';
import { SlotsScreen } from './components/SlotsScreen';
import { SlotDrawer } from './components/SlotDrawer';
import { CommanderTopbar } from './components/CommanderTopbar';
import { ActivityScreen } from './components/ActivityScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { RequestsScreen } from './components/RequestsScreen';
import { CalendarScreen } from './components/CalendarScreen';
import { CommanderDayView } from './components/CommanderDayView';
import { DivisionAdminScreen } from './components/DivisionAdminScreen';
import { NewSlotModal } from './components/NewSlotModal';
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

export function Dashboard({ onSwitchToReservist }: { onSwitchToReservist?: () => void }) {
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
          onOpenMobileMenu={() => setMobileNavOpen(true)}
          onOpenInviteSettings={() => { setActive('settings'); showToast('Open settings → Invite link'); }}
          onNewSlot={(urgent) => setModal({ open: true, urgent, preselected: urgent ? null : selected[0] ?? null })}
        />

        <div className="scroll">
          {active === 'roster' && (
            members.isLoading || skills.isLoading
              ? <div style={{ padding: 40, color: 'var(--ink-soft)' }}>Loading roster…</div>
              : members.error
                ? <div style={{ padding: 40, color: 'var(--st-unav)' }}>Failed: {(members.error as Error).message}</div>
                : (
                  <Roster
                    members={members.data ?? []}
                    skills={skills.data ?? []}
                    slots={slots.data ?? []}
                    teamId={team.id}
                    filters={filters}
                    onFilters={setFilters}
                    selected={selected}
                    setSelected={setSelected}
                    onPerson={setPerson}
                    onToast={showToast}
                    onNewSlotWith={(memberId) => setModal({ open: true, urgent: false, preselected: memberId })}
                  />
                )
          )}
          {active === 'slots' && (
            <SlotsScreen
              slots={slots.data ?? []}
              members={members.data ?? []}
              onUrgent={() => setModal({ open: true, urgent: true, preselected: null })}
              onNewSlot={() => setModal({ open: true, urgent: false, preselected: null })}
              onSlotClick={setSlotDrawer}
              onToast={showToast}
            />
          )}
          {active === 'activity' && <ActivityScreen items={activity.data ?? []} />}
          {active === 'settings' && (
            <SettingsScreen
              team={team}
              divisionId={division.data?.id ?? ''}
              skills={skills.data ?? []}
              onToast={showToast}
              onRefresh={() => qc.invalidateQueries({ queryKey: ['teams-for-member'] })}
            />
          )}
          {active === 'requests' && (
            <RequestsScreen team={team} onToast={showToast} />
          )}
          {active === 'calendar' && (
            <CalendarScreen
              slots={slots.data ?? []}
              members={members.data ?? []}
              onSlotClick={setSlotDrawer}
            />
          )}
          {active === 'day' && (
            <CommanderDayView teamId={team.id} />
          )}
          {active === 'admin' && (
            <DivisionAdminScreen
              onOpenTeam={(id) => { setTeamId(id); setActive('roster'); }}
              onToast={showToast}
            />
          )}
        </div>

        {person && (
          <PersonDrawer
            person={person}
            team={team}
            allSkills={skills.data ?? []}
            divisionId={division.data?.id ?? ''}
            onClose={() => setPerson(null)}
            onToast={showToast}
          />
        )}

        {slotDrawer && (
          <SlotDrawer
            slot={slotDrawer}
            members={members.data ?? []}
            allSlots={slots.data ?? []}
            approvedPicks={approvedPicks.data ?? []}
            teamId={team.id}
            onClose={() => setSlotDrawer(null)}
            onClone={(s) => {
              setSlotDrawer(null);
              setModal({ open: true, urgent: s.urgent, preselected: null, cloneFrom: s });
            }}
            onToast={showToast}
          />
        )}

        <NewSlotModal
          open={modal.open}
          urgent={modal.urgent}
          members={members.data ?? []}
          slots={slots.data ?? []}
          approvedPicks={approvedPicks.data ?? []}
          teamId={team.id}
          preselected={modal.preselected}
          cloneFrom={modal.cloneFrom ?? null}
          onClose={() => setModal({ open: false, urgent: false, preselected: null })}
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
