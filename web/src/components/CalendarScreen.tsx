import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button, SkillChip } from './atoms';
import { isoDay } from '../lib/calendarUtils';
import type { Member, Slot } from '../lib/types';

interface Props {
  slots: Slot[];
  members: Member[];
  onSlotClick?: (s: Slot) => void;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function CalendarScreen({ slots, members, onSlotClick }: Props) {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState<string | null>(isoDay(new Date()));

  const byDay = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      if (s.state === 'cancelled') continue;
      const k = isoDay(new Date(s.start_at));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [slots]);

  const month = cursor.getMonth();
  const year = cursor.getFullYear();
  const firstDay = startOfMonth(cursor);
  const offset = (firstDay.getDay() + 6) % 7; // week starts Mon (PRD users in IL)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: ({ date: Date; inMonth: boolean })[] = [];
  for (let i = 0; i < offset; i++) {
    const d = new Date(year, month, 1 - (offset - i));
    cells.push({ date: d, inMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(year, month, i), inMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
    if (cells.length >= 42) break;
  }

  const todayKey = isoDay(new Date());
  const selectedSlots = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h2 style={{
          margin: 0,
          fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400,
          letterSpacing: '-.01em',
        }}>
          {cursor.toLocaleString('en-US', { month: 'long' })} <em style={{ color: 'var(--ink-soft)' }}>{year}</em>
        </h2>
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
          <Button size="sm" variant="ghost" onClick={() => setCursor(addMonths(cursor, -1))}>‹ Prev</Button>
          <Button size="sm" variant="outline" onClick={() => setCursor(startOfMonth(new Date()))}>Today</Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(addMonths(cursor, 1))}>Next ›</Button>
        </div>
      </div>

      <div style={{
        border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)',
        background: 'var(--card)', overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
          background: 'var(--card-soft)',
          borderBottom: '1px solid var(--line)',
        }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} style={{
              padding: '8px 10px',
              fontFamily: 'var(--mono)', fontSize: 10.5,
              textTransform: 'uppercase', letterSpacing: '.08em',
              color: 'var(--ink-mute)',
            }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map(({ date, inMonth }, i) => {
            const k = isoDay(date);
            const daySlots = byDay.get(k) ?? [];
            const isToday = k === todayKey;
            const isSelected = k === selected;
            return (
              <button key={i} onClick={() => setSelected(k)} style={{
                appearance: 'none', font: 'inherit', textAlign: 'start',
                padding: '6px 8px 8px',
                minHeight: 78,
                borderInlineEnd: (i + 1) % 7 === 0 ? 0 : '1px solid var(--line-soft)',
                borderBottom: i < 35 ? '1px solid var(--line-soft)' : 0,
                background: isSelected ? 'var(--accent-tint)'
                          : isToday ? 'var(--card-soft)'
                          : 'transparent',
                cursor: 'pointer',
                opacity: inMonth ? 1 : 0.4,
                position: 'relative',
              }}>
                <div style={{
                  fontFamily: isToday ? 'var(--serif)' : 'var(--sans)',
                  fontSize: isToday ? 18 : 12,
                  fontWeight: isToday ? 400 : 500,
                  color: isToday ? 'var(--accent-deep)' : 'var(--ink)',
                  lineHeight: 1,
                  marginBottom: 6,
                }}>
                  {date.getDate()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {daySlots.slice(0, 3).map((s) => (
                    <div key={s.id} style={{
                      fontSize: 10.5,
                      padding: '1px 4px',
                      borderRadius: 3,
                      background: s.urgent ? 'var(--urgent-bg)' : 'var(--accent-tint)',
                      color: s.urgent ? 'var(--urgent-deep)' : 'var(--accent-deep)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {fmtTime(s.start_at)} {s.title}
                    </div>
                  ))}
                  {daySlots.length > 3 && (
                    <div style={{ fontSize: 10, color: 'var(--ink-mute)' }}>+{daySlots.length - 3} more</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{
        border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)',
        background: 'var(--card)', padding: 18,
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase',
          letterSpacing: '.08em', color: 'var(--ink-mute)', marginBottom: 10,
        }}>
          {selected ? new Date(selected).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Pick a day'}
        </div>
        {selectedSlots.length === 0 ? (
          <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No duty scheduled.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedSlots.map((s) => {
              const assignees = s.assignee_ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as Member[];
              return (
                <div key={s.id} onClick={() => onSlotClick?.(s)} style={{
                  border: '1px solid ' + (s.urgent ? 'var(--urgent)' : 'var(--line-soft)'),
                  borderRadius: 10, padding: 12,
                  background: s.urgent ? 'var(--urgent-bg)' : 'var(--paper-deep)',
                  cursor: onSlotClick ? 'pointer' : 'default',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {s.urgent && <div style={{
                    position: 'absolute', top: 0, bottom: 0,
                    insetInlineStart: 0, width: 3, background: 'var(--urgent)',
                  }}/>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{s.title}</div>
                    {s.urgent && <span className="urgent-flag" style={{ position: 'static' }}>
                      <Icon name="urgent" size={10}/> Urgent
                    </span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="clock" size={11}/> {fmtTime(s.start_at)}{s.duration ? ` · ${s.duration}` : ''}
                    </span>
                    {s.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="pin" size={11}/> {s.location}
                    </span>}
                    {s.role && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="shield" size={11}/> {s.role}
                    </span>}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex' }}>
                      {assignees.slice(0, 5).map((m, i) => (
                        <div key={m.id} style={{ marginInlineStart: i === 0 ? 0 : -8 }}>
                          <Avatar initials={m.initials} tone={m.tone} size="sm" />
                        </div>
                      ))}
                    </div>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
                      {s.filled}/{s.needed}
                    </span>
                    {s.skills.map((sk) => <SkillChip key={sk.name} name={sk.name} min_level={sk.min_level} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
