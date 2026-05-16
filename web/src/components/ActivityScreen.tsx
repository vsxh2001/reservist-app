import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { ActivityItem } from '../lib/types';

type RangeKey = 'today' | '7d' | '30d' | 'all';
type Category = 'status' | 'slot' | 'membership' | 'join' | 'other';

const rangeLabels: Record<RangeKey, string> = {
  today: 'Today', '7d': '7 days', '30d': '30 days', all: 'All',
};
const rangeWindow: Record<RangeKey, number | null> = {
  today: 0,
  '7d': 7 * 86400_000,
  '30d': 30 * 86400_000,
  all: null,
};

const categoryLabels: Record<Category, string> = {
  status: 'Status', slot: 'Slots', membership: 'Members', join: 'Join requests', other: 'Other',
};

function categorize(a: ActivityItem): Category {
  const v = a.verb.toLowerCase();
  if (v.includes('status')) return 'status';
  if (v.includes('slot') || v.includes('assigned') || v.includes('unassigned') || v.includes('call-up')) return 'slot';
  if (v.includes('promoted') || v.includes('demoted') || v.includes('removed')) return 'membership';
  if (v.includes('join')) return 'join';
  return 'other';
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtRel(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return 'yesterday';
  return `${Math.floor(diff / 86400)}d ago`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = startOfToday();
  if (d.getTime() === today) return 'Today';
  if (d.getTime() === today - 86400_000) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function ActivityScreen({ items }: { items: ActivityItem[] }) {
  const [range, setRange] = useState<RangeKey>('7d');
  const [cats, setCats] = useState<Category[]>([]);
  const [actor, setActor] = useState<string>('');

  const actors = useMemo(() => {
    const set = new Set(items.map((a) => a.actor_name));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const win = rangeWindow[range];
    const cutoff = range === 'today' ? startOfToday() : (win != null ? Date.now() - win : 0);
    return items.filter((a) => {
      if (cutoff && new Date(a.created_at).getTime() < cutoff) return false;
      if (cats.length && !cats.includes(categorize(a))) return false;
      if (actor && a.actor_name !== actor) return false;
      return true;
    });
  }, [items, range, cats, actor]);

  const grouped = useMemo(() => {
    const m = new Map<string, ActivityItem[]>();
    for (const a of filtered) {
      const k = dayLabel(a.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const toggleCat = (c: Category) => {
    setCats((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);
  };

  const hasFilters = cats.length > 0 || actor !== '' || range !== '7d';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)',
        background: 'var(--card)', padding: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <div className="filters" style={{ marginBottom: 0 }}>
          <div className="filter-group">
            {(Object.keys(rangeLabels) as RangeKey[]).map((r) => (
              <button key={r} data-on={range === r ? '1' : '0'} onClick={() => setRange(r)}>
                {rangeLabels[r]}
              </button>
            ))}
          </div>
          <div className="filter-group">
            {(Object.keys(categoryLabels) as Category[]).map((c) => (
              <button key={c} data-on={cats.includes(c) ? '1' : '0'} onClick={() => toggleCat(c)}>
                {categoryLabels[c]}
              </button>
            ))}
          </div>
          <select className="select" value={actor} onChange={(e) => setActor(e.target.value)} style={{ maxInlineSize: 200 }}>
            <option value="">All actors</option>
            {actors.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {hasFilters && (
            <button className="filter-clear" onClick={() => { setRange('7d'); setCats([]); setActor(''); }}>
              Clear
            </button>
          )}
          <span style={{ marginInlineStart: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-soft)' }}>
            {filtered.length} / {items.length}
          </span>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="empty">
          <Icon name="activity" size={32} stroke={1.2} />
          <div className="title">Nothing matches</div>
          <div>Try widening the date range or clearing filters.</div>
        </div>
      ) : (
        grouped.map(([day, group]) => (
          <div key={day} style={{
            border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)',
            background: 'var(--card)', padding: 18,
          }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 11,
              color: 'var(--ink-mute)', textTransform: 'uppercase',
              letterSpacing: '.08em', marginBottom: 12,
            }}>
              {day}
            </div>
            <div className="timeline">
              {group.map((a) => (
                <div key={a.id} className="timeline-item">
                  <div className="timeline-dot" data-tone={a.tone} />
                  <div className="timeline-content">
                    <b>{a.actor_name}</b> {a.verb}
                    {a.what && <> <b>{a.what}</b></>}.
                    <span className="when">{fmtRel(a.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
