import { useEffect, useState } from 'react';
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
import { NewSlotModal } from './components/NewSlotModal';
import { Button } from './components/atoms';
import { Icon } from './components/Icon';
import {
  useActivity, useJoinRequests, useMembers, useRoles, useSkills, useSlots, useUnit,
} from './lib/queries';
import { useRealtime } from './lib/realtime';
import { useQueryClient } from '@tanstack/react-query';
import type { Filters, Member, Screen, Slot } from './lib/types';

const titleFor: Record<Screen, { title: string; em: string }> = {
  roster:   { title: 'Who is in', em: 'Carmel-6' },
  slots:    { title: 'Open & upcoming', em: 'duty slots' },
  activity: { title: 'Unit', em: 'activity' },
  calendar: { title: 'Unit', em: 'calendar' },
  day:      { title: 'Unit', em: 'day view' },
  reviews:  { title: 'Commander', em: 'reviews' },
  settings: { title: 'Unit', em: 'settings' },
  requests: { title: 'Join', em: 'requests' },
};

export function Dashboard({ onSwitchToReservist }: { onSwitchToReservist?: () => void }) {
  const qc = useQueryClient();
  const unit = useUnit();
  const members = useMembers(unit.data?.id);
  const roles = useRoles(unit.data?.id);
  const skills = useSkills(unit.data?.id);
  const slots = useSlots(unit.data?.id);
  const activity = useActivity(unit.data?.id);
  const joinRequests = useJoinRequests(unit.data?.id);
  useRealtime(unit.data?.id);

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

  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout((showToast as any)._tid);
    (showToast as any)._tid = setTimeout(() => setToast(null), 2200);
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

  if (!unit.data) {
    return <div style={{ padding: 40, color: 'var(--ink-soft)' }}>Loading unit…</div>;
  }

  const t = titleFor[active];
  const hasUrgentOpen = (slots.data ?? []).some((s) => s.state === 'published' && s.urgent && s.filled < s.needed);

  return (
    <div className="app">
      <Sidebar
        unit={unit.data}
        members={members.data ?? []}
        slots={slots.data ?? []}
        pendingRequests={(joinRequests.data ?? []).length}
        active={active}
        onNav={(s) => { setActive(s); setPerson(null); setBellOpen(false); setMobileNavOpen(false); }}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
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
            members.isLoading || roles.isLoading || skills.isLoading
              ? <div style={{ padding: 40, color: 'var(--ink-soft)' }}>Loading roster…</div>
              : members.error
                ? <div style={{ padding: 40, color: 'var(--st-unav)' }}>Failed: {(members.error as Error).message}</div>
                : (
                  <Roster
                    members={members.data ?? []}
                    skills={skills.data ?? []}
                    slots={slots.data ?? []}
                    unitId={unit.data.id}
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
              unit={unit.data}
              roles={roles.data ?? []}
              skills={skills.data ?? []}
              onToast={showToast}
              onRefresh={() => qc.invalidateQueries({ queryKey: ['unit'] })}
            />
          )}
          {active === 'requests' && (
            <RequestsScreen unit={unit.data} onToast={showToast} />
          )}
          {active === 'calendar' && (
            <CalendarScreen
              slots={slots.data ?? []}
              members={members.data ?? []}
              onSlotClick={setSlotDrawer}
            />
          )}
          {active === 'day' && unit.data && (
            <CommanderDayView unitId={unit.data.id} />
          )}
        </div>

        {person && (
          <PersonDrawer
            person={person}
            allSkills={skills.data ?? []}
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
          unitId={unit.data.id}
          preselected={modal.preselected}
          cloneFrom={modal.cloneFrom ?? null}
          onClose={() => setModal({ open: false, urgent: false, preselected: [] })}
          onToast={showToast}
        />

        <div className="toast" data-open={toast ? '1' : '0'}>
          <Icon name="check" size={12}/> {toast}
        </div>
      </div>
    </div>
  );
}
