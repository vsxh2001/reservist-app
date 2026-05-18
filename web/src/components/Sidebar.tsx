import { useMemo, useRef, useState, useEffect } from 'react';
import { Icon, type IconName } from './Icon';
import { Avatar } from './atoms';
import type { Member, Screen, Slot, Status, Team } from '../lib/types';
import { useAuth } from '../lib/auth';
import { initialsFromName } from '../lib/text';

interface Props {
  team: Team;
  teams: Team[];
  setTeamId: (id: string) => void;
  members: Member[];
  slots: Slot[];
  pendingRequests: number;
  active: Screen;
  onNav: (s: Screen) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  isDivisionAdmin?: boolean;
}

interface Item { id: Screen; label: string; icon: IconName; count?: number; urgent?: boolean; disabled?: boolean }

export function Sidebar({ team, teams, setTeamId, members, slots, pendingRequests, active, onNav, mobileOpen, onCloseMobile, isDivisionAdmin }: Props) {
  const { user, signOut } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const counts = useMemo(() => {
    const by: Record<Status, number> = { available: 0, standby: 0, released: 0, unavailable: 0 };
    members.forEach((m) => { by[m.status] = (by[m.status] || 0) + 1; });
    return by;
  }, [members]);

  const openSlots = slots.filter((s) => s.state === 'published' && s.filled < s.needed).length;
  const hasUrgent = slots.some((s) => s.state === 'published' && s.urgent && s.filled < s.needed);

  const nav: Item[] = [
    { id: 'roster',   label: 'Roster',     icon: 'roster',   count: team.member_count },
    { id: 'slots',    label: 'Duty slots', icon: 'slots',    count: openSlots, urgent: hasUrgent },
    { id: 'calendar', label: 'Calendar',   icon: 'calendar' },
    { id: 'day',      label: 'Day view',   icon: 'clock' },
    { id: 'activity', label: 'Activity',   icon: 'activity' },
  ];
  const nav2: Item[] = [
    { id: 'requests', label: 'Join requests', icon: 'users', count: pendingRequests, urgent: pendingRequests > 0 },
    { id: 'reviews',  label: 'Reviews',  icon: 'reviews', disabled: true },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    ...(isDivisionAdmin ? [{ id: 'admin' as Screen, label: 'Admin', icon: 'shield' as IconName }] : []),
  ];

  // Close picker on outside click or Esc.
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pickerRef.current) return;
      if (!pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setPickerOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [pickerOpen]);

  const renderLink = (n: Item) => (
    <div
      key={n.id}
      className="sb-link"
      data-active={active === n.id ? '1' : '0'}
      onClick={() => !n.disabled && onNav(n.id)}
      style={n.disabled ? { opacity: 0.55, cursor: 'not-allowed' } : {}}
    >
      <Icon name={n.icon} size={15} />
      <span>{n.label}</span>
      {n.urgent
        ? <span className="sb-dot-urgent" />
        : (n.count != null && <span className="sb-count">{n.count}</span>)}
    </div>
  );

  const multiTeam = teams.length > 1;

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
    <aside className="sidebar" data-mobile-open={mobileOpen ? '1' : '0'}>
      <div className="sb-unit" ref={pickerRef} style={{ position: 'relative' }}>
        {multiTeam ? (
          <button
            onClick={() => setPickerOpen((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              appearance: 'none', border: 0, background: 'transparent',
              font: 'inherit', cursor: 'pointer', textAlign: 'start',
              padding: 0, minBlockSize: 40, width: '100%',
            }}
            aria-haspopup="listbox"
            aria-expanded={pickerOpen}
          >
            <div className="sb-crest">{team.crest}</div>
            <div className="sb-unit-meta" style={{ flex: 1, minWidth: 0 }}>
              <div className="sb-unit-name">{team.name}</div>
              <div className="sb-unit-sub">
                <b>{team.member_count}</b> members · <b>{counts.available}</b> available
              </div>
            </div>
            <Icon name="chevDown" size={12} style={{ flexShrink: 0, color: 'var(--ink-soft)', transform: pickerOpen ? 'rotate(180deg)' : undefined }} />
          </button>
        ) : (
          <>
            <div className="sb-crest">{team.crest}</div>
            <div className="sb-unit-meta">
              <div className="sb-unit-name">{team.name}</div>
              <div className="sb-unit-sub">
                <b>{team.member_count}</b> members · <b>{counts.available}</b> available
              </div>
            </div>
          </>
        )}

        {pickerOpen && (
          <div
            role="listbox"
            aria-label="Select team"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              insetInlineStart: 0,
              insetInlineEnd: 0,
              background: 'var(--card)',
              border: '1px solid var(--line-strong)',
              borderRadius: 10,
              boxShadow: 'var(--shadow-lg)',
              zIndex: 30,
              overflow: 'hidden',
              padding: 4,
            }}
          >
            {teams.map((t) => (
              <button
                key={t.id}
                role="option"
                aria-selected={t.id === team.id}
                onClick={() => { setTeamId(t.id); setPickerOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  appearance: 'none', border: 0,
                  background: t.id === team.id ? 'var(--accent-tint)' : 'transparent',
                  font: 'inherit', cursor: 'pointer', textAlign: 'start',
                  padding: '8px 10px', borderRadius: 7, width: '100%',
                  minBlockSize: 40,
                } as React.CSSProperties}
              >
                <div style={{
                  fontSize: 20, lineHeight: 1,
                  width: 32, height: 32, display: 'grid', placeItems: 'center',
                  flexShrink: 0,
                }}>{t.crest}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)' }}>
                    {t.project_name}
                  </div>
                </div>
                {t.id === team.id && <Icon name="check" size={12} style={{ color: 'var(--accent-deep)', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sb-nav">
        {nav.map(renderLink)}
        <div className="sb-section">Team</div>
        {nav2.map(renderLink)}
      </div>

      <div className="sb-me" onClick={() => { void signOut(); }} title="Sign out">
        <Avatar initials={initialsFromName(user?.name)} tone={0} status="available" />
        <div className="sb-me-meta">
          <div className="sb-me-name">{user?.name ?? 'Unknown'}</div>
          <div className="sb-me-role">Commander · {team.name}</div>
        </div>
        <Icon name="chevDown" size={12} />
      </div>
    </aside>
    </>
  );
}
