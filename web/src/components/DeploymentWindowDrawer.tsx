// web/src/components/DeploymentWindowDrawer.tsx
import { useEffect, useMemo, useState } from 'react';
import { Button } from './atoms';
import { Icon } from './Icon';
import { DayCell } from './DayCell';
import {
  useDeploymentPicks, useDirectAddPick, useResolvePick,
  useUpdateDeploymentWindow, useWithdrawDayPick,
} from '../lib/queries';
import { isoDay, monthGridCells, monthsBetween } from '../lib/calendarUtils';
import { useAuth } from '../lib/auth';
import type { DeploymentPick, DeploymentWindow } from '../lib/types';

interface Props {
  window: DeploymentWindow;
  memberName: string;
  teamId: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function DeploymentWindowDrawer({ window: w, memberName, teamId, onClose, onToast }: Props) {
  const { user } = useAuth();
  const picks = useDeploymentPicks(w.id);
  const resolve = useResolvePick();
  const direct = useDirectAddPick();
  const withdraw = useWithdrawDayPick();
  const updateWindow = useUpdateDeploymentWindow();

  const [selected, setSelected] = useState<DeploymentPick | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [editingMeta, setEditingMeta] = useState(false);
  const [label, setLabel] = useState(w.label);
  const [startDate, setStartDate] = useState(w.start_date);
  const [endDate, setEndDate] = useState(w.end_date);
  const [notes, setNotes] = useState(w.notes ?? '');

  useEffect(() => {
    setEditingMeta(false);
    setLabel(w.label);
    setStartDate(w.start_date);
    setEndDate(w.end_date);
    setNotes(w.notes ?? '');
    setSelected(null);
    setSelectedDate(null);
    setNoteDraft('');
  }, [w.id]);

  const byDate = useMemo(() => {
    const m = new Map<string, DeploymentPick>();
    for (const p of picks.data ?? []) m.set(p.date, p);
    return m;
  }, [picks.data]);

  const cellTap = (dateISO: string) => {
    if (w.state === 'closed') return;
    const pick = byDate.get(dateISO);
    if (!pick) {
      setSelected(null);
      setSelectedDate(dateISO);
    } else {
      setSelected(pick);
      setSelectedDate(dateISO);
      setNoteDraft(pick.commander_note ?? '');
    }
  };

  const approve = async () => {
    if (!user || !selected) return;
    await resolve.mutateAsync({
      pickId: selected.id, nextState: 'approved',
      commanderNote: noteDraft.trim() ? noteDraft.trim() : null,
      actorId: user.id, actorName: user.name,
      teamId, memberName, date: selected.date,
    });
    onToast(`Approved ${selected.date}`);
    setSelected(null); setSelectedDate(null); setNoteDraft('');
  };
  const reject = async () => {
    if (!user || !selected) return;
    await resolve.mutateAsync({
      pickId: selected.id, nextState: 'rejected',
      commanderNote: noteDraft.trim() ? noteDraft.trim() : null,
      actorId: user.id, actorName: user.name,
      teamId, memberName, date: selected.date,
    });
    onToast(`Rejected ${selected.date}`);
    setSelected(null); setSelectedDate(null); setNoteDraft('');
  };
  const directAdd = async () => {
    if (!user || !selectedDate) return;
    await direct.mutateAsync({
      windowId: w.id, date: selectedDate,
      actorId: user.id, actorName: user.name,
      teamId, memberName,
    });
    onToast(`Added ${selectedDate}`);
    setSelectedDate(null);
  };
  const withdrawApproved = async () => {
    if (!selected) return;
    await withdraw.mutateAsync({ pickId: selected.id });
    onToast(`Withdrew ${selected.date}`);
    setSelected(null); setSelectedDate(null);
  };
  const saveMeta = async () => {
    if (!user) return;
    await updateWindow.mutateAsync({
      windowId: w.id, teamId,
      actorId: user.id, actorName: user.name,
      patch: { label, startDate, endDate, notes: notes.trim() ? notes : null },
    });
    setEditingMeta(false);
    onToast('Window updated');
  };
  const closeWindow = async () => {
    if (!user) return;
    await updateWindow.mutateAsync({
      windowId: w.id, teamId,
      actorId: user.id, actorName: user.name,
      patch: { state: 'closed' },
    });
    onToast('Window closed');
    onClose();
  };

  const months = monthsBetween(w.start_date, w.end_date);
  const today = isoDay(new Date());

  return (
    <>
      <div className="drawer-overlay" data-open="1" onClick={onClose} />
      <div className="drawer" data-open="1" role="dialog" aria-label={w.label}>
        <div className="drawer-head" style={{ background: 'var(--card-soft)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!editingMeta ? (
              <>
                <h3 className="name">{w.label}</h3>
                <div className="role-line" style={{ flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {w.start_date} → {w.end_date}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 10,
                    padding: '1px 6px', borderRadius: 4,
                    textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600,
                    background: w.state === 'open' ? 'var(--accent-tint)' : 'var(--card-soft)',
                    color: w.state === 'open' ? 'var(--accent-deep)' : 'var(--ink-soft)',
                  }}>{w.state}</span>
                  <span className="edit" onClick={() => setEditingMeta(true)}>Edit</span>
                </div>
                {w.notes && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--ink-soft)' }}>{w.notes}</div>
                )}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
                <div className="form-grid">
                  <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingMeta(false); setLabel(w.label); setStartDate(w.start_date); setEndDate(w.end_date); setNotes(w.notes ?? ''); }}>Cancel</Button>
                  <Button size="sm" variant="primary" icon="check" disabled={updateWindow.isPending} onClick={saveMeta}>Save</Button>
                </div>
              </div>
            )}
          </div>
          <button className="action-btn" onClick={onClose} aria-label="Close" style={{ alignSelf: 'flex-start' }}>
            <Icon name="x" size={14}/>
          </button>
        </div>

        <div className="drawer-body">
          {months.map((m) => (
            <section key={`${m.getFullYear()}-${m.getMonth()}`} style={{ marginBottom: 18 }}>
              <h4 style={{
                margin: '0 0 8px',
                fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-mute)',
              }}>
                {m.toLocaleString('en-US', { month: 'long', year: 'numeric' })}
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {['Mo','Tu','We','Th','Fr','Sa','Su'].map((d, i) => (
                  <div key={i} style={{
                    fontFamily: 'var(--mono)', fontSize: 10,
                    color: 'var(--ink-mute)', textAlign: 'center',
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
                      disabled={w.state === 'closed'}
                      onClick={() => cellTap(iso)}
                      title={pick?.commander_note ?? pick?.reservist_note ?? undefined}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          {selectedDate && (
            <div className="drawer-section">
              <h4>{selected ? `${selected.state.toUpperCase()} · ${selectedDate}` : `Empty · ${selectedDate}`}</h4>
              {selected?.reservist_note && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBlockEnd: 8, fontStyle: 'italic' }}>
                  "{selected.reservist_note}"
                </div>
              )}
              {!selected && (
                <Button size="sm" variant="primary" icon="check"
                        disabled={direct.isPending || w.state === 'closed'}
                        onClick={directAdd}>
                  Add as approved
                </Button>
              )}
              {selected?.state === 'proposed' && (
                <>
                  <input className="input" placeholder="Commander note (optional)"
                         value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)}
                         style={{ marginBlockEnd: 8 }} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button size="sm" variant="primary" icon="check"
                            disabled={resolve.isPending} onClick={approve}>Approve</Button>
                    <Button size="sm" variant="ghost" icon="x"
                            disabled={resolve.isPending} onClick={reject}
                            style={{ color: 'var(--urgent-deep)' }}>Reject</Button>
                  </div>
                </>
              )}
              {selected?.state === 'approved' && (
                <Button size="sm" variant="ghost" icon="x"
                        disabled={withdraw.isPending} onClick={withdrawApproved}
                        style={{ color: 'var(--urgent-deep)' }}>
                  Withdraw
                </Button>
              )}
              {selected?.state === 'rejected' && selected.commander_note && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
                  Rejected with note: "{selected.commander_note}"
                </div>
              )}
            </div>
          )}

          {w.state === 'open' && (
            <div className="drawer-section">
              <h4>Window actions</h4>
              <Button size="sm" variant="ghost" icon="x" onClick={closeWindow}
                      disabled={updateWindow.isPending}
                      style={{ color: 'var(--urgent-deep)' }}>
                Close window (archive)
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
