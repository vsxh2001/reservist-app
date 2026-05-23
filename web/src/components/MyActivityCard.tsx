/**
 * MyActivityCard — reservist's own recent activity feed (last 10 items).
 *
 * Pure presentational: takes a list of activity rows and renders them. The
 * parent owns the `useMyRecentActivity` query — keeping the card data-agnostic
 * lets it be reused in any future "personal activity" surface (PRD §7.9).
 *
 * Renders nothing when the list is empty, so callers can drop it in
 * unconditionally without an extra outer check.
 */

import { Card } from './Card';
import { relativeAgo } from '../lib/calendarUtils';
import type { ActivityItem } from '../lib/types';

interface Props {
  activity: ActivityItem[];
}

const ACTIVITY_CAP = 10;

export function MyActivityCard({ activity }: Props) {
  if (activity.length === 0) return null;
  return (
    <Card title="My recent activity">
      <div
        data-testid="my-activity"
        style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
      >
        {activity.map((a) => (
          <div
            key={a.id}
            data-testid={`my-activity-row-${a.id}`}
            style={{
              padding: '8px 10px',
              background: 'var(--paper-deep)',
              border: '1px solid var(--line-soft)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 12.5,
            }}
          >
            <div
              className="timeline-dot"
              data-tone={a.tone}
              aria-hidden="true"
              style={{ marginTop: 0, flexShrink: 0 }}
            />
            <span style={{ flex: 1, minWidth: 0, color: 'var(--ink-2)' }}>
              <b>{a.verb}</b>
              {a.what ? <> · {a.what}</> : null}
            </span>
            <time
              dateTime={a.created_at}
              title={new Date(a.created_at).toLocaleString()}
              style={{
                fontFamily: 'var(--mono)', fontSize: 10.5,
                color: 'var(--ink-mute)', flexShrink: 0,
              }}
            >
              {relativeAgo(a.created_at) ?? ''}
            </time>
          </div>
        ))}
        {activity.length >= ACTIVITY_CAP && (
          <div
            data-testid="my-activity-cap-hint"
            style={{
              marginTop: 4, fontSize: 10.5,
              fontFamily: 'var(--mono)', color: 'var(--ink-mute)',
              textAlign: 'center',
            }}
          >
            Showing latest {ACTIVITY_CAP}
          </div>
        )}
      </div>
    </Card>
  );
}
