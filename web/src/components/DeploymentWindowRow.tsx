import { Icon } from './Icon';
import { windowCountdown } from '../lib/calendarUtils';
import type { DeploymentWindow } from '../lib/types';

interface Props {
  w: DeploymentWindow;
  onOpen: () => void;
  /** Visual dim: used on the dashboard for closed windows so the eye reads them as archived. */
  dim?: boolean;
}

/**
 * Compact row used on the reservist dashboard's "My deployments" card —
 * one tappable strip per window with label, countdown, date range, and the
 * proposed/approved/rejected counts.
 */
export function DeploymentWindowRow({ w, onOpen, dim }: Props) {
  const labelColor = dim ? 'var(--ink-soft)' : 'var(--ink)';
  const countdown = w.state === 'open' ? windowCountdown(w.start_date, w.end_date) : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: dim ? 'var(--paper-deep)' : 'var(--card)',
        border: '1px solid var(--line-soft)',
        borderRadius: 8,
        cursor: 'pointer',
        opacity: dim ? 0.85 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 500, fontSize: 13, color: labelColor }}>
            {w.label}
          </span>
          {countdown && (
            <span
              data-testid="window-countdown"
              style={{
                fontFamily: 'var(--mono)', fontSize: 10.5,
                color: countdown === 'in progress' ? 'var(--accent-deep)' : 'var(--ink-soft)',
              }}
            >
              {countdown}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2,
          fontFamily: 'var(--mono)',
        }}>
          {w.start_date} → {w.end_date}
          {' · '}
          <span style={{ color: w.approved_count > 0 ? 'var(--accent-deep)' : 'var(--ink-soft)' }}>
            {w.approved_count} approved
          </span>
          {w.proposed_count > 0 && (
            <>{' · '}{w.proposed_count} proposed</>
          )}
          {w.rejected_count > 0 && (
            <>
              {' · '}
              <span style={{ color: 'var(--urgent-deep)' }}>{w.rejected_count} rejected</span>
            </>
          )}
        </div>
      </div>
      <span style={{
        fontSize: 10, fontFamily: 'var(--mono)',
        padding: '2px 6px', borderRadius: 4,
        textTransform: 'uppercase', letterSpacing: '.06em',
        background: w.state === 'open' ? 'var(--accent-tint)' : 'var(--paper-deep)',
        color: w.state === 'open' ? 'var(--accent-deep)' : 'var(--ink-mute)',
        border: '1px solid ' + (w.state === 'open' ? 'var(--accent)' : 'var(--line-soft)'),
      }}>
        {w.state}
      </span>
      <Icon name="chevRight" size={14} />
    </div>
  );
}
