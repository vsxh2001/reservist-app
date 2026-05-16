// web/src/components/DeploymentPickScreen.tsx
import { useMemo, useState } from 'react';
import { Button } from './atoms';
import { Icon } from './Icon';
import { DayCell } from './DayCell';
import { useDeploymentPicks, useProposeDayPick, useWithdrawDayPick } from '../lib/queries';
import type { DeploymentPick, DeploymentWindow } from '../lib/types';

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthsBetween(startISO: string, endISO: string): Date[] {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const months: Date[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function monthGridCells(monthFirst: Date, startISO: string, endISO: string) {
  const year = monthFirst.getFullYear();
  const month = monthFirst.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7; // week starts Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean; inWindow: boolean }[] = [];
  const winStart = new Date(startISO);
  const winEnd = new Date(endISO);
  for (let i = 0; i < offset; i++) {
    const d = new Date(year, month, 1 - (offset - i));
    cells.push({ date: d, inMonth: false, inWindow: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const d = new Date(year, month, i);
    const inWin = d >= winStart && d <= winEnd;
    cells.push({ date: d, inMonth: true, inWindow: inWin });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false, inWindow: false });
  }
  return cells;
}

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
          {w.state === 'closed' && (
            <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              Closed
            </span>
          )}
        </div>

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
      </div>
    </div>
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
