import { useState } from 'react';
import { Card } from './Card';
import { Icon } from './Icon';
import { Button, StatusPill } from './atoms';
import { useSelfUpdateStatus } from '../lib/queries';
import { isoDay, relativeAgo, untilHint } from '../lib/calendarUtils';
import { humanizeError } from '../lib/errors';
import { STATUS_LABEL, type Member, type Status } from '../lib/types';

/** Today + offset days, formatted YYYY-MM-DD in local time. */
function computeUntilDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return isoDay(d);
}

interface Props {
  member: Member;
  userName: string;
  teamId: string;
  onToast: (msg: string) => void;
}

/**
 * Reservist self-edit of duty status. Encapsulates the editor state and
 * the underlying `useSelfUpdateStatus` mutation so the dashboard only
 * has to wire member, user, team, and a toast sink.
 */
export function MyStatusCard({ member, userName, teamId, onToast }: Props) {
  const update = useSelfUpdateStatus();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Status>('available');
  const [note, setNote] = useState('');
  const [until, setUntil] = useState('');

  const startEdit = () => {
    setPending(member.status);
    setNote(member.status_note ?? '');
    setUntil(member.status_until ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (until && until < computeUntilDate(0)) {
      onToast('"Until" date must be today or later');
      return;
    }
    try {
      await update.mutateAsync({
        memberId: member.id,
        status: pending,
        note: note.trim() ? note.trim() : null,
        until: until || null,
        teamId,
        actorName: userName,
      });
      setEditing(false);
      onToast(`Status set to ${STATUS_LABEL[pending]}`);
    } catch (err) {
      onToast(humanizeError(err, 'Failed to update status'));
    }
  };

  const setAvailable = async () => {
    try {
      await update.mutateAsync({
        memberId: member.id,
        status: 'available',
        note: null,
        until: null,
        teamId,
        actorName: userName,
      });
      onToast('Status set to Available');
    } catch (err) {
      onToast(humanizeError(err, 'Failed to update'));
    }
  };

  return (
    <Card
      title="My status"
      right={!editing ? <button className="filter-clear" onClick={startEdit}>Change</button> : undefined}
    >
      {!editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', background: 'var(--paper-deep)',
              borderRadius: 8, border: '1px solid var(--line-soft)',
            }}>
              <StatusPill status={member.status} />
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', flex: 1, minWidth: 0 }}>
                {member.status_note || <span style={{ fontStyle: 'italic' }}>No note</span>}
                {(() => {
                  const ago = relativeAgo(member.status_set_at);
                  return ago ? (
                    <span
                      data-testid="status-set-ago"
                      style={{
                        marginInlineStart: 6,
                        fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--ink-mute)',
                      }}
                    >
                      · set {ago}
                    </span>
                  ) : null;
                })()}
                {member.status_until && (
                  <>
                    {' '}·{' '}<b>until {member.status_until}</b>
                    {(() => {
                      const hint = untilHint(member.status_until);
                      return hint ? (
                        <span
                          data-testid="status-until-hint"
                          style={{
                            marginInlineStart: 6,
                            fontFamily: 'var(--mono)', fontSize: 10.5,
                            color: hint === 'expired' ? 'var(--urgent-deep)' : 'var(--ink-mute)',
                          }}
                        >
                          · {hint}
                        </span>
                      ) : null;
                    })()}
                  </>
                )}
              </div>
            </div>
            {member.status !== 'available' && (
              <button
                type="button"
                disabled={update.isPending}
                onClick={setAvailable}
                style={{
                  appearance: 'none', font: 'inherit', fontSize: 12,
                  padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                  border: '1px solid var(--accent)',
                  background: 'var(--accent-tint)',
                  color: 'var(--accent-deep)',
                  fontWeight: 500,
                  textAlign: 'center',
                }}
              >
                Set as available
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {(['available', 'standby', 'released', 'unavailable'] as Status[]).map((s) => (
                <button key={s} onClick={() => setPending(s)} style={{
                  appearance: 'none',
                  border: '1px solid ' + (s === pending ? 'var(--accent)' : 'var(--line-strong)'),
                  background: s === pending ? 'var(--accent-tint)' : 'var(--card)',
                  padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                  font: 'inherit', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <StatusPill status={s} />
                  {s === pending && <Icon name="check" size={12}/>}
                </button>
              ))}
            </div>
            <div className="form-row">
              <label>Note (optional)</label>
              <input className="input" value={note}
                     placeholder="e.g. exam period, abroad until..."
                     onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Until (optional)</label>
              {pending !== 'available' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {([
                    { label: '3 days',  days: 3 },
                    { label: '1 week',  days: 7 },
                    { label: '2 weeks', days: 14 },
                    { label: '1 month', days: 30 },
                  ] as const).map((preset) => {
                    const target = computeUntilDate(preset.days);
                    const active = until === target;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setUntil(target)}
                        style={{
                          appearance: 'none', font: 'inherit', fontSize: 12,
                          padding: '4px 10px', borderRadius: 14, cursor: 'pointer',
                          border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line-strong)'),
                          background: active ? 'var(--accent-tint)' : 'var(--card)',
                          color: active ? 'var(--accent-deep)' : 'var(--ink-2)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                  {until && (
                    <button
                      type="button"
                      onClick={() => setUntil('')}
                      style={{
                        appearance: 'none', font: 'inherit', fontSize: 12,
                        padding: '4px 10px', borderRadius: 14, cursor: 'pointer',
                        border: '1px dashed var(--line-strong)',
                        background: 'transparent', color: 'var(--ink-soft)',
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
              <input className="input" type="date" value={until}
                     min={computeUntilDate(0)}
                     onChange={(e) => setUntil(e.target.value)} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" variant="primary" icon="check"
                      disabled={update.isPending} onClick={save}>
                Save
              </Button>
            </div>
          </div>
        )}
    </Card>
  );
}
