// web/src/components/DeploymentPickScreen.tsx
import { useMemo, useState } from 'react';
import { Button } from './atoms';
import { Icon } from './Icon';
import { DayCell } from './DayCell';
import {
  useDeploymentPicks,
  useProposeDayPick,
  useSetReservistNote,
  useWithdrawDayPick,
} from '../lib/queries';
import { isoDay, monthGridCells, monthsBetween } from '../lib/calendarUtils';
import type { DeploymentPick, DeploymentWindow } from '../lib/types';

interface Props {
  window: DeploymentWindow;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function DeploymentPickScreen({ window: w, onClose, onToast }: Props) {
  const picks = useDeploymentPicks(w.id);
  const propose = useProposeDayPick();
  const withdraw = useWithdrawDayPick();
  const [busyDay, setBusyDay] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, DeploymentPick>();
    for (const p of picks.data ?? []) m.set(p.date, p);
    return m;
  }, [picks.data]);

  const months = monthsBetween(w.start_date, w.end_date);
  const today = isoDay(new Date());

  const tap = async (dateISO: string) => {
    if (w.state === 'closed') return;
    if (busyDay) return;
    setBusyDay(dateISO);
    try {
      const existing = byDate.get(dateISO);
      if (!existing || existing.state === 'rejected' || existing.state === 'withdrawn') {
        await propose.mutateAsync({ windowId: w.id, date: dateISO, reservistNote: null });
        onToast(`Marked ${dateISO}`);
      } else if (existing.state === 'proposed' || existing.state === 'approved') {
        await withdraw.mutateAsync({ pickId: existing.id });
        onToast(`Withdrew ${dateISO}`);
      }
    } finally {
      setBusyDay(null);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
      background: 'var(--paper)', color: 'var(--ink)',
    }}>
      <header className="topbar" style={{ borderBottom: '1px solid var(--line)' }}>
        <Button variant="ghost" size="icon" onClick={onClose} data-tip="Back">
          <Icon name="chevRight" size={15} style={{ transform: 'rotate(180deg)' }} />
        </Button>
        <h1 className="topbar-title">{w.label} <em>{w.start_date} → {w.end_date}</em></h1>
      </header>

      <div className="scroll" style={{ padding: '16px 14px 60px' }}>
        <div style={{
          padding: 14, marginBottom: 18,
          background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
          display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12.5,
        }}>
          <Legend color="var(--accent)"      label={`${w.approved_count} approved`}  />
          <Legend color="var(--accent-tint)" label={`${w.proposed_count} proposed`}  />
          <Legend color="var(--urgent-bg)"   label={`${w.rejected_count} rejected`}  />
          {w.withdrawn_count > 0 && (
            <Legend color="var(--paper-deep)" label={`${w.withdrawn_count} withdrawn`} />
          )}
          {w.state === 'closed' && (
            <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Closed
            </span>
          )}
        </div>

        {w.notes && w.notes.trim().length > 0 && (
          <div
            data-testid="window-notes"
            style={{
              padding: 12, marginBottom: 18,
              background: 'var(--paper-deep)',
              border: '1px solid var(--line-soft)',
              borderRadius: 10,
            }}
          >
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
              textTransform: 'uppercase', letterSpacing: '.08em',
              color: 'var(--ink-mute)', marginBottom: 6,
            }}>From your commander</div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
              {w.notes}
            </div>
          </div>
        )}

        {months.map((m) => (
          <section key={`${m.getFullYear()}-${m.getMonth()}`} style={{ marginBottom: 22 }}>
            <h2 style={{
              margin: '0 0 10px',
              fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 400, letterSpacing: '-.01em',
            }}>
              {m.toLocaleString('en-US', { month: 'long' })} <em style={{ color: 'var(--ink-soft)' }}>{m.getFullYear()}</em>
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
                <div key={d} style={{
                  fontFamily: 'var(--mono)', fontSize: 10.5,
                  textTransform: 'uppercase', letterSpacing: '.08em',
                  color: 'var(--ink-mute)', textAlign: 'center', padding: '4px 0',
                }}>{d}</div>
              ))}
              {monthGridCells(m, w.start_date, w.end_date).map((c, i) => {
                const iso = isoDay(c.date);
                const pick = byDate.get(iso);
                return (
                  <DayCell
                    key={i}
                    date={c.date}
                    state={pick?.state}
                    inWindow={c.inMonth && c.inWindow}
                    isToday={iso === today}
                    disabled={busyDay !== null && busyDay !== iso}
                    onClick={() => tap(iso)}
                    title={pick?.commander_note ?? pick?.reservist_note ?? undefined}
                  />
                );
              })}
            </div>
          </section>
        ))}

        <MyNotes picks={picks.data ?? []} disabled={w.state === 'closed'} onToast={onToast} />
        <CommanderDecisions picks={picks.data ?? []} />
      </div>
    </div>
  );
}

function MyNotes({
  picks, disabled, onToast,
}: {
  picks: DeploymentPick[];
  disabled: boolean;
  onToast: (msg: string) => void;
}) {
  const setNote = useSetReservistNote();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const rows = useMemo(() => {
    return picks
      .filter((p) => p.state !== 'withdrawn')
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [picks]);

  if (rows.length === 0) return null;

  const startEdit = (p: DeploymentPick) => {
    if (disabled) return;
    setEditingId(p.id);
    setDraft(p.reservist_note ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const save = async (pickId: string) => {
    const trimmed = draft.trim();
    try {
      await setNote.mutateAsync({ pickId, note: trimmed.length > 0 ? trimmed : null });
      onToast(trimmed.length > 0 ? 'Note saved' : 'Note cleared');
      cancelEdit();
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Save failed');
    }
  };

  return (
    <section
      data-testid="my-notes"
      style={{
        marginTop: 6, marginBottom: 18, padding: 16,
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
      }}
    >
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
        textTransform: 'uppercase', letterSpacing: '.08em',
        color: 'var(--ink-mute)', marginBottom: 10,
      }}>My notes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((p) => {
          const isEditing = editingId === p.id;
          const hasNote = !!(p.reservist_note && p.reservist_note.trim().length > 0);
          return (
            <div
              key={p.id}
              data-testid={`my-note-row-${p.date}`}
              style={{
                display: 'flex', flexDirection: 'column', gap: 6,
                padding: '8px 10px',
                background: 'var(--paper-deep)', border: '1px solid var(--line-soft)',
                borderRadius: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{p.date}</span>
                <span
                  style={{
                    fontSize: 10, fontFamily: 'var(--mono)',
                    padding: '2px 6px', borderRadius: 4,
                    textTransform: 'uppercase', letterSpacing: '.06em',
                    background: p.state === 'approved' ? 'var(--accent-tint)'
                      : p.state === 'rejected' ? 'var(--urgent-bg)'
                      : 'var(--paper-deep)',
                    color: p.state === 'approved' ? 'var(--accent-deep)'
                      : p.state === 'rejected' ? 'var(--urgent-deep)'
                      : 'var(--ink-mute)',
                    border: '1px solid '
                      + (p.state === 'approved' ? 'var(--accent)'
                      : p.state === 'rejected' ? 'var(--urgent)'
                      : 'var(--line-soft)'),
                  }}
                >
                  {p.state}
                </span>
                {!isEditing && !disabled && (
                  <button
                    type="button"
                    onClick={() => startEdit(p)}
                    className="filter-clear"
                    style={{ marginInlineStart: 'auto' }}
                  >
                    {hasNote ? 'Edit' : 'Add note'}
                  </button>
                )}
              </div>
              {isEditing ? (
                <>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    autoFocus
                    placeholder="Why this day — wedding, exam, etc."
                    style={{
                      width: '100%', resize: 'vertical',
                      padding: '6px 8px', fontSize: 12.5,
                      background: 'var(--card)', color: 'var(--ink)',
                      border: '1px solid var(--line-strong)', borderRadius: 6,
                      font: 'inherit',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={setNote.isPending}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => save(p.id)} disabled={setNote.isPending}>
                      Save
                    </Button>
                  </div>
                </>
              ) : hasNote ? (
                <div style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>
                  {p.reservist_note}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CommanderDecisions({ picks }: { picks: DeploymentPick[] }) {
  const decided = picks
    .filter((p) => p.commander_note && p.commander_note.trim().length > 0)
    .sort((a, b) => {
      const ar = a.resolved_at ?? a.proposed_at;
      const br = b.resolved_at ?? b.proposed_at;
      return br.localeCompare(ar);
    });
  if (decided.length === 0) return null;
  return (
    <section
      data-testid="commander-decisions"
      style={{
        marginTop: 6, padding: 16,
        background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12,
      }}
    >
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
        textTransform: 'uppercase', letterSpacing: '.08em',
        color: 'var(--ink-mute)', marginBottom: 10,
      }}>Commander notes</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {decided.map((p) => (
          <div
            key={p.id}
            style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '8px 10px',
              background: 'var(--paper-deep)', border: '1px solid var(--line-soft)',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{p.date}</span>
              <span
                style={{
                  fontSize: 10, fontFamily: 'var(--mono)',
                  padding: '2px 6px', borderRadius: 4,
                  textTransform: 'uppercase', letterSpacing: '.06em',
                  background: p.state === 'approved' ? 'var(--accent-tint)'
                    : p.state === 'rejected' ? 'var(--urgent-bg)'
                    : 'var(--paper-deep)',
                  color: p.state === 'approved' ? 'var(--accent-deep)'
                    : p.state === 'rejected' ? 'var(--urgent-deep)'
                    : 'var(--ink-mute)',
                  border: '1px solid '
                    + (p.state === 'approved' ? 'var(--accent)'
                    : p.state === 'rejected' ? 'var(--urgent)'
                    : 'var(--line-soft)'),
                }}
              >
                {p.state}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>
              {p.commander_note}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 4, background: color, border: '1px solid var(--line)' }} />
      {label}
    </span>
  );
}
