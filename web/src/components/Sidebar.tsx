import { useMemo } from 'react';
import { Icon, type IconName } from './Icon';
import { Avatar } from './atoms';
import type { Member, Screen, Slot, Status, Unit } from '../lib/types';
import { useAuth } from '../lib/auth';

interface Props {
  unit: Unit;
  members: Member[];
  slots: Slot[];
  pendingRequests: number;
  active: Screen;
  onNav: (s: Screen) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface Item { id: Screen; label: string; icon: IconName; count?: number; urgent?: boolean; disabled?: boolean }

export function Sidebar({ unit, members, slots, pendingRequests, active, onNav, mobileOpen, onCloseMobile }: Props) {
  const { user, signOut } = useAuth();
  const counts = useMemo(() => {
    const by: Record<Status, number> = { available: 0, standby: 0, released: 0, unavailable: 0 };
    members.forEach((m) => { by[m.status] = (by[m.status] || 0) + 1; });
    return by;
  }, [members]);

  const openSlots = slots.filter((s) => s.state === 'published' && s.filled < s.needed).length;
  const hasUrgent = slots.some((s) => s.state === 'published' && s.urgent && s.filled < s.needed);

  const nav: Item[] = [
    { id: 'roster',   label: 'Roster',     icon: 'roster',   count: members.length },
    { id: 'slots',    label: 'Duty slots', icon: 'slots',    count: openSlots, urgent: hasUrgent },
    { id: 'calendar', label: 'Calendar',   icon: 'calendar' },
    { id: 'day',      label: 'Day view',   icon: 'clock' },
    { id: 'activity', label: 'Activity',   icon: 'activity' },
  ];
  const nav2: Item[] = [
    { id: 'requests', label: 'Join requests', icon: 'users', count: pendingRequests, urgent: pendingRequests > 0 },
    { id: 'reviews',  label: 'Reviews',  icon: 'reviews', disabled: true },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

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

  return (
    <>
      {mobileOpen && <div className="sidebar-backdrop" onClick={onCloseMobile} />}
    <aside className="sidebar" data-mobile-open={mobileOpen ? '1' : '0'}>
      <div className="sb-unit">
        <div className="sb-crest">{unit.crest}</div>
        <div className="sb-unit-meta">
          <div className="sb-unit-name">{unit.name}</div>
          <div className="sb-unit-sub">
            <b>{members.length}</b> members · <b>{counts.available}</b> available
          </div>
        </div>
      </div>

      <div className="sb-nav">
        {nav.map(renderLink)}
        <div className="sb-section">Unit</div>
        {nav2.map(renderLink)}
      </div>

      <div className="sb-me" onClick={() => { void signOut(); }} title="Sign out">
        <Avatar initials={user?.name.split(' ').map((p) => p[0]).slice(0, 2).join('') ?? '?'} tone={0} status="available" />
        <div className="sb-me-meta">
          <div className="sb-me-name">{user?.name ?? 'Unknown'}</div>
          <div className="sb-me-role">Commander · {unit.short_name}</div>
        </div>
        <Icon name="chevDown" size={12} />
      </div>
    </aside>
    </>
  );
}
