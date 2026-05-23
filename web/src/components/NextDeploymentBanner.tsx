/**
 * NextDeploymentBanner — top-of-dashboard call-to-action for the reservist's
 * next upcoming deployment window. Click/Enter opens the pick screen.
 *
 * Returns null when there is no upcoming window so the parent can drop it in
 * unconditionally without an extra outer check.
 */

import { Icon } from './Icon';
import { activate } from '../lib/a11y';
import { windowCountdown } from '../lib/calendarUtils';
import type { DeploymentWindow } from '../lib/types';

interface Props {
  window: DeploymentWindow | null;
  onOpen: () => void;
}

export function NextDeploymentBanner({ window, onOpen }: Props) {
  if (!window) return null;
  const countdown = windowCountdown(window.start_date, window.end_date);
  return (
    <section
      {...activate(onOpen)}
      aria-label={`Open ${window.label} deployment window`}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: 16, marginBottom: 14,
        background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: 12,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: 'var(--accent)', color: 'var(--card)',
        display: 'grid', placeItems: 'center', flexShrink: 0,
      }}>
        <Icon name="calendar" size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase',
          letterSpacing: '.08em', color: 'var(--ink-mute)',
        }}>My next deployment</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 400, marginTop: 2 }}>
            {window.label}
          </span>
          {countdown && (
            <span
              data-testid="banner-countdown"
              style={{
                fontFamily: 'var(--mono)', fontSize: 11,
                color: countdown === 'in progress' ? 'var(--accent-deep)' : 'var(--ink-soft)',
              }}
            >
              · {countdown}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, fontFamily: 'var(--mono)' }}>
          {window.start_date} → {window.end_date} · {window.approved_count} approved · {window.proposed_count} proposed
        </div>
      </div>
      <Icon name="chevRight" size={16} />
    </section>
  );
}
