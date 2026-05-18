import { useEffect, useRef, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Roster } from './components/Roster';
import { PersonDrawer } from './components/PersonDrawer';
import { SlotsScreen } from './components/SlotsScreen';
import { SlotDrawer } from './components/SlotDrawer';
import { ActivityScreen } from './components/ActivityScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { RequestsScreen } from './components/RequestsScreen';
import { CalendarScreen } from './components/CalendarScreen';
import { CommanderDayView } from './components/CommanderDayView';
import { DivisionAdminScreen } from './components/DivisionAdminScreen';
import { NewSlotModal } from './components/NewSlotModal';
import { Button } from './components/atoms';
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
  const [toast, setToast] = useState<string | null>(null);
  const [modal, setModal] = useState<{ open: boolean; urgent: boolean; preselected: string[]; cloneFrom?: Slot | null }>({
    open: false, urgent: false, preselected: [],
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
        if (modal.open) setModal({ open: false, urgent: false, preselected: [] });
        else if (slotDrawer) setSlotDrawer(null);
        else if (person) setPerson(null);
        else if (bellOpen) setBellOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal.open, person, bellOpen, slotDrawer]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);
  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2200);
  };

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
  const hasUrgentOpen = (slots.data ?? []).some((s) => s.state === 'published' && s.urgent && s.filled < s.needed);

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
        <header className="topbar">
          <Button variant="ghost" size="icon" className="mobile-menu-btn" data-tip="Menu"
                  onClick={() => setMobileNavOpen(true)}
                  style={{ marginRight: 2 }}>
            <Icon name="filter" size={16} />
          </Button>
          <h1 className="topbar-title">{t.title} <em>{t.em}</em></h1>
          <div className="topbar-actions">
            <Button variant="ghost" size="icon"
                    onClick={() => setBellOpen((v) => !v)}
                    data-tip="Activity"
                    style={{ position: 'relative' }}>
              <Icon name="bell" size={15}/>
              {hasUrgentOpen && <span style={{
                position: 'absolute', top: 6, right: 6,
                width: 7, height: 7, borderRadius: 99,
                background: 'var(--urgent)',
                boxShadow: '0 0 0 2px var(--paper)',
              }}/>}
            </Button>
            <Button variant="ghost" size="icon" data-tip="Invite member"
                    onClick={() => { setActive('settings'); showToast('Open settings → Invite link'); }}>
              <Icon name="link" size={15}/>
            </Button>
            {onSwitchToReservist && (
              <Button variant="ghost" size="sm" onClick={onSwitchToReservist} data-tip="See reservist view">
                <Icon name="user" size={13} /> Reservist view
              </Button>
            )}
            <span style={{ width: 1, height: 22, background: 'var(--line)' }}/>
            <Button variant="outline" icon="plus"
                    onClick={() => setModal({ open: true, urgent: false, preselected: selected })}>
              New slot
            </Button>
            <Button variant="urgent" icon="urgent"
                    onClick={() => setModal({ open: true, urgent: true, preselected: [] })}>
              Urgent call-up
            </Button>
          </div>
        </header>

        <div className="bell-pop" data-open={bellOpen ? '1' : '0'} onClick={(e) => e.stopPropagation()}>
          <div className="bell-pop-head">
            <Icon name="activity" size={11}/> Activity · last 24h
          </div>
          <div className="bell-pop-body">
            {(activity.data ?? []).slice(0, 6).map((a) => (
              <div key={a.id} className="bell-item">
                <div className="icon-dot" data-tone={a.tone}>
                  <Icon name={a.tone === 'urgent' ? 'urgent' : a.tone === 'accent' ? 'check' : 'user'} size={12}/>
                </div>
                <div style={{ flex: 1 }}>
                  <b>{a.actor_name}</b> {a.verb}{a.what && <> <b>{a.what}</b></>}.
                  <span className="when">{new Date(a.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {(activity.data ?? []).length === 0 && (
              <div style={{ padding: 14, color: 'var(--ink-soft)', fontSize: 12.5 }}>No activity yet.</div>
            )}
          </div>
        </div>

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
                    onNewSlotWith={(ids) => setModal({ open: true, urgent: false, preselected: ids })}
                  />
                )
          )}
          {active === 'slots' && (
            <SlotsScreen
              slots={slots.data ?? []}
              members={members.data ?? []}
              onUrgent={() => setModal({ open: true, urgent: true, preselected: [] })}
              onNewSlot={() => setModal({ open: true, urgent: false, preselected: [] })}
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
            skills={skills.data ?? []}
            allSlots={slots.data ?? []}
            approvedPicks={approvedPicks.data ?? []}
            teamId={team.id}
            divisionId={division.data?.id ?? ''}
            onClose={() => setSlotDrawer(null)}
            onClone={(s) => {
              setSlotDrawer(null);
              setModal({ open: true, urgent: s.urgent, preselected: [], cloneFrom: s });
            }}
            onToast={showToast}
          />
        )}

        <NewSlotModal
          open={modal.open}
          urgent={modal.urgent}
          members={members.data ?? []}
          skills={skills.data ?? []}
          slots={slots.data ?? []}
          approvedPicks={approvedPicks.data ?? []}
          teamId={team.id}
          divisionId={division.data?.id ?? ''}
          preselected={modal.preselected}
          cloneFrom={modal.cloneFrom ?? null}
          onClose={() => setModal({ open: false, urgent: false, preselected: [] })}
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
