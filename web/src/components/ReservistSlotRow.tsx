import { useState } from 'react';
import { Icon } from './Icon';
import { fmtWhen } from '../lib/calendarUtils';
import { normalizePhoneToE164IL } from '../lib/phone';
import type { Member } from '../lib/types';

/**
 * Subset of `Slot` the reservist-side slot list actually reads. Kept local so
 * the row component can render any slot-like shape — including the cancelled
 * card on the dashboard, which doesn't always have every Slot field populated.
 */
export interface ReservistSlotRowSlot {
  id: string;
  title: string;
  urgent: boolean;
  state: 'draft' | 'published' | 'completed' | 'cancelled';
  start_at: string;
  duration: string | null;
  location: string | null;
  notes: string | null;
  assignee_id: string | null;
}

interface Props {
  s: ReservistSlotRowSlot;
  /** Map of member-id → Member for resolving the assignee row to a display name. */
  memberById?: Map<string, Member>;
  /** The signed-in reservist's member id, so we can render "You" instead of their name. */
  myMemberId?: string;
}

/**
 * The reservist-side slot row used on both `My upcoming duty` and the
 * `Cancelled` card. Collapsed by default; tapping the row reveals notes plus
 * the assignee block (with tap-to-call / WhatsApp shortcuts for peers whose
 * phone is visible).
 */
export function ReservistSlotRow({ s, memberById, myMemberId }: Props) {
  const [open, setOpen] = useState(false);
  const cancelled = s.state === 'cancelled';
  const hasDetail = Boolean(s.notes) || s.assignee_id !== null;
  const toggle = () => { if (hasDetail) setOpen((v) => !v); };

  return (
    <div
      role={hasDetail ? 'button' : undefined}
      tabIndex={hasDetail ? 0 : undefined}
      aria-expanded={hasDetail ? open : undefined}
      onClick={toggle}
      onKeyDown={(e) => {
        if (!hasDetail) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
      style={{
        border: '1px solid ' + (cancelled ? 'var(--line-soft)' : s.urgent ? 'var(--urgent)' : 'var(--line-soft)'),
        borderRadius: 10, padding: 12,
        background: cancelled ? 'var(--paper-deep)' : s.urgent ? 'var(--urgent-bg)' : 'var(--paper-deep)',
        position: 'relative', overflow: 'hidden',
        cursor: hasDetail ? 'pointer' : 'default',
        opacity: cancelled ? 0.7 : 1,
      }}
    >
      {s.urgent && !cancelled && <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: 'var(--urgent)',
      }}/>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontWeight: 500, fontSize: 14, flex: 1, minWidth: 0,
          textDecoration: cancelled ? 'line-through' : 'none',
          color: cancelled ? 'var(--ink-soft)' : 'inherit',
        }}>{s.title}</div>
        {cancelled && (
          <span style={{
            fontSize: 10, fontFamily: 'var(--mono)',
            padding: '2px 6px', borderRadius: 4,
            textTransform: 'uppercase', letterSpacing: '.06em',
            background: 'var(--urgent-bg)', color: 'var(--urgent-deep)',
            border: '1px solid var(--urgent)',
          }}>
            Cancelled
          </span>
        )}
        {hasDetail && (
          <Icon name={open ? 'chevDown' : 'chevRight'} size={14} />
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="calendar" size={11}/> {fmtWhen(s.start_at)}
        </span>
        {s.duration && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="clock" size={11}/> {s.duration}
        </span>}
        {s.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="pin" size={11}/> {s.location}
        </span>}
      </div>
      {open && hasDetail && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--line-soft)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {s.notes && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>
              {s.notes}
            </div>
          )}
          {s.assignee_id !== null && (
            <div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '.08em',
                color: 'var(--ink-mute)', marginBottom: 4,
              }}>
                Assigned
              </div>
              <div
                data-testid="assignees"
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                {(() => {
                  const id = s.assignee_id!;
                  const isMe = id === myMemberId;
                  const m = memberById?.get(id);
                  const name = isMe ? 'You' : (m?.name ?? '—');
                  const e164 = !isMe && m?.phone ? normalizePhoneToE164IL(m.phone) : null;
                  return (
                    <div
                      key={id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 12.5, color: 'var(--ink-2)',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0, fontWeight: isMe ? 500 : 400 }}>
                        {name}
                      </span>
                      {e164 && (
                        <>
                          <a
                            href={`tel:+${e164}`}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Call ${name}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 40, height: 40, borderRadius: 6,
                              border: '1px solid var(--line-strong)', color: 'var(--ink-2)',
                              textDecoration: 'none',
                            }}
                          >
                            <Icon name="phone" size={12} />
                          </a>
                          <a
                            href={`https://wa.me/${e164}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`WhatsApp ${name}`}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 40, height: 40, borderRadius: 6,
                              border: '1px solid var(--line-strong)', color: 'var(--ink-2)',
                              textDecoration: 'none',
                            }}
                          >
                            <Icon name="whatsapp" size={12} />
                          </a>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
