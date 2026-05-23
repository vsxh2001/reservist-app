import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { ActivityFiltersBar } from './ActivityFiltersBar';
import { fmtRelCompact } from '../lib/calendarUtils';
import { MS_PER_DAY } from '../lib/constants';
import type { ActivityItem } from '../lib/types';

// ---------------------------------------------------------------------------
// CSV helpers (RFC 4180)
// ---------------------------------------------------------------------------

/** RFC 4180 cell escape: wrap in quotes when the cell contains `, " \r \n`. */
export function csvEscape(v: string | null | undefined): string {
  const s = v ?? '';
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV body with columns: created_at, actor_name, verb, what. */
export function buildActivityCSV(items: ActivityItem[]): string {
  const header = ['created_at', 'actor_name', 'verb', 'what'].join(',');
  const rows = items.map((a) =>
    [a.created_at, a.actor_name, a.verb, a.what ?? ''].map(csvEscape).join(','),
  );
  // RFC 4180 calls for CRLF line endings.
  return [header, ...rows].join('\r\n') + '\r\n';
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Slugify a team name for use in a filename. */
function slugTeam(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'team';
}

function downloadBlob(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Parse a "YYYY-MM-DD" string into local midnight. Returns null for empty. */
function parseLocalDate(ymd: string): number | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d)).getTime();
}

const fmtRel = fmtRelCompact;

function dayLabel(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const today = startOfToday();
  if (d.getTime() === today) return 'Today';
  if (d.getTime() === today - MS_PER_DAY) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface ActivityScreenProps {
  items: ActivityItem[];
  /** Used as the slug in the CSV filename. Defaults to "team". */
  teamName?: string;
}

export function ActivityScreen({ items, teamName }: ActivityScreenProps) {
  const [actorQuery, setActorQuery] = useState<string>('');
  const [selectedVerbs, setSelectedVerbs] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  /** Distinct verbs present in the current data, alphabetized. */
  const availableVerbs = useMemo(() => {
    const set = new Set<string>();
    for (const a of items) set.add(a.verb);
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  }, [items]);

  const filtered = useMemo(() => {
    const q = actorQuery.trim().toLowerCase();
    const fromMs = parseLocalDate(dateFrom);
    // "To" is inclusive of the chosen day, so add one day's worth of ms.
    const toRaw = parseLocalDate(dateTo);
    const toMs = toRaw == null ? null : toRaw + MS_PER_DAY;

    return items.filter((a) => {
      if (q && !a.actor_name.toLowerCase().includes(q)) return false;
      if (selectedVerbs.length > 0 && !selectedVerbs.includes(a.verb)) return false;
      const t = new Date(a.created_at).getTime();
      if (fromMs != null && t < fromMs) return false;
      if (toMs != null && t >= toMs) return false;
      return true;
    });
  }, [items, actorQuery, selectedVerbs, dateFrom, dateTo]);

  const grouped = useMemo(() => {
    const m = new Map<string, ActivityItem[]>();
    for (const a of filtered) {
      const k = dayLabel(a.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return Array.from(m.entries());
  }, [filtered]);

  const toggleVerb = (v: string) => {
    setSelectedVerbs((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  const hasActiveFilters =
    actorQuery !== '' || selectedVerbs.length > 0 || dateFrom !== '' || dateTo !== '';

  const clearAll = () => {
    setActorQuery('');
    setSelectedVerbs([]);
    setDateFrom('');
    setDateTo('');
  };

  const handleDownload = () => {
    const slug = slugTeam(teamName ?? 'team');
    const stamp = ymdLocal(new Date());
    const filename = `activity-${slug}-${stamp}.csv`;
    downloadBlob(filename, buildActivityCSV(filtered));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ActivityFiltersBar
        actorQuery={actorQuery}
        onActorQueryChange={setActorQuery}
        availableVerbs={availableVerbs}
        selectedVerbs={selectedVerbs}
        onToggleVerb={toggleVerb}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onClear={clearAll}
        hasActiveFilters={hasActiveFilters}
        visibleCount={filtered.length}
        totalCount={items.length}
        onDownloadCSV={handleDownload}
      />

      {grouped.length === 0 ? (
        <div className="empty">
          <Icon name="activity" size={32} stroke={1.2} />
          <div className="title">Nothing matches</div>
          <div>Try widening the date range or clearing filters.</div>
        </div>
      ) : (
        grouped.map(([day, group]) => (
          <div
            key={day}
            style={{
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--card)',
              padding: 18,
            }}
          >
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--ink-mute)',
                textTransform: 'uppercase',
                letterSpacing: '.08em',
                marginBottom: 12,
              }}
            >
              {day}
            </div>
            <div className="timeline">
              {group.map((a) => (
                <div key={a.id} className="timeline-item">
                  <div className="timeline-dot" data-tone={a.tone} />
                  <div className="timeline-content">
                    <b>{a.actor_name}</b> {a.verb}
                    {a.what && (
                      <>
                        {' '}
                        <b>{a.what}</b>
                      </>
                    )}
                    .
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
