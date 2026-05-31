/**
 * CommanderTopbar — top bar + bell-popover for the commander dashboard.
 *
 * Pure presentational: parent owns the `active` screen, the `bellOpen` state,
 * and every action callback. Extracting this bundle (header + popover) trims
 * ~60 LOC out of Dashboard.tsx and keeps the orchestrator file focused on
 * data, screens, and lifecycle.
 *
 * The screen "title" struct (`{ title, em }`) is passed in directly so the
 * parent's title map stays the source of truth.
 */

import { Button } from './atoms';
import { Icon } from './Icon';
import type { ActivityItem } from '../lib/types';

interface Props {
  title: { title: string; em: string };
  hasUrgentOpen: boolean;
  bellOpen: boolean;
  onToggleBell: () => void;
  activity: ActivityItem[];
  onSwitchToReservist?: () => void;
  onReplayTour?: () => void;
  onOpenMobileMenu: () => void;
  onOpenInviteSettings: () => void;
  onNewSlot: (urgent: boolean) => void;
}

export function CommanderTopbar({
  title,
  hasUrgentOpen,
  bellOpen,
  onToggleBell,
  activity,
  onSwitchToReservist,
  onReplayTour,
  onOpenMobileMenu,
  onOpenInviteSettings,
  onNewSlot,
}: Props) {
  return (
    <>
      <header className="topbar">
        <Button variant="ghost" size="icon" className="mobile-menu-btn" data-tip="Menu"
                onClick={onOpenMobileMenu}
                style={{ marginRight: 2 }}>
          <Icon name="filter" size={16} />
        </Button>
        <h1 className="topbar-title">{title.title} <em>{title.em}</em></h1>
        <div className="topbar-actions">
          <Button variant="ghost" size="icon"
                  onClick={onToggleBell}
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
          {onReplayTour && (
            <Button variant="ghost" size="icon" onClick={onReplayTour} data-tip="App tour">
              <Icon name="help" size={15}/>
            </Button>
          )}
          <Button variant="ghost" size="icon" data-tip="Invite member"
                  onClick={onOpenInviteSettings}>
            <Icon name="link" size={15}/>
          </Button>
          {onSwitchToReservist && (
            <Button variant="ghost" size="sm" onClick={onSwitchToReservist} data-tip="See reservist view">
              <Icon name="user" size={13} /> Reservist view
            </Button>
          )}
          <span style={{ width: 1, height: 22, background: 'var(--line)' }}/>
          <Button variant="outline" icon="plus" onClick={() => onNewSlot(false)}>
            New slot
          </Button>
          <Button variant="urgent" icon="urgent" onClick={() => onNewSlot(true)}>
            Urgent call-up
          </Button>
        </div>
      </header>

      <div className="bell-pop" data-open={bellOpen ? '1' : '0'} onClick={(e) => e.stopPropagation()}>
        <div className="bell-pop-head">
          <Icon name="activity" size={11}/> Activity · last 24h
        </div>
        <div className="bell-pop-body">
          {activity.slice(0, 6).map((a) => (
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
          {activity.length === 0 && (
            <div style={{ padding: 14, color: 'var(--ink-soft)', fontSize: 12.5 }}>No activity yet.</div>
          )}
        </div>
      </div>
    </>
  );
}
