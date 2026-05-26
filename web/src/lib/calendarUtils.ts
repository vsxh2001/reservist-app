// Shared month-grid helpers for deployment screens.
// CalendarScreen.tsx has its own copy with slightly different padding rules
// (always 42 cells); kept separate to avoid touching that screen.

import { MS_PER_DAY } from './constants';

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Local-time wall-clock formatter: returns `HH:MM` (24h, zero-padded).
 * Accepts either a Date or an ISO string for caller convenience.
 */
export function fmtClock(t: Date | string): string {
  const d = typeof t === 'string' ? new Date(t) : t;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Compact "ago" relative-time formatter used by activity / requests lists
 * where vertical space matters. Distinct from `relativeAgo` which leans
 * verbose ("3 hr ago", "over a year ago") for the reservist activity card.
 *
 *   <60s    → "just now"
 *   <60min  → "N min ago"
 *   <24h    → "Nh ago"
 *   <48h    → "yesterday"
 *   else    → "Nd ago"
 *
 * `now` is injectable for deterministic tests.
 */
export function fmtRelCompact(iso: string, now: Date = new Date()): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 2) return 'yesterday';
  return `${Math.floor(diff / 86400)}d ago`;
}

export function monthsBetween(startISO: string, endISO: string): Date[] {
  // Inputs are date-only `YYYY-MM-DD` (Postgres `date`). Parse the year/month
  // in local time the same way `windowCountdown`/`untilHint` do — `new Date(str)`
  // reads a date-only string as UTC midnight, which in a negative-offset
  // timezone lands on the previous calendar month and renders a stray month.
  const [sy, sm] = startISO.split('-').map(Number);
  const [ey, em] = endISO.split('-').map(Number);
  const months: Date[] = [];
  const cursor = new Date(sy, sm - 1, 1);
  const last = new Date(ey, em - 1, 1);
  while (cursor <= last) {
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

export interface MonthGridCell {
  date: Date;
  inMonth: boolean;
  inWindow: boolean;
}

/** Returns Mon-Sun cells for `monthFirst`, padded to a full trailing week. */
export function monthGridCells(monthFirst: Date, startISO: string, endISO: string): MonthGridCell[] {
  const year = monthFirst.getFullYear();
  const month = monthFirst.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7; // week starts Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: MonthGridCell[] = [];
  // Parse the date-only window bounds in local time so they compare cleanly
  // against the local-midnight `d` below. `new Date(str)` would read them as
  // UTC midnight, shifting the boundary day across local midnight and
  // mis-flagging the window's first/last day in any non-UTC timezone.
  const [wsy, wsm, wsd] = startISO.split('-').map(Number);
  const [wey, wem, wed] = endISO.split('-').map(Number);
  const winStart = new Date(wsy, wsm - 1, wsd);
  const winEnd = new Date(wey, wem - 1, wed);
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

/**
 * Format a slot's `start_at` ISO timestamp for the reservist's "My upcoming
 * duty" list. Same-day → "Today, HH:MM"; the day after → "Tomorrow, HH:MM";
 * the day before → "Yesterday, HH:MM"; within the next six days → "in N days,
 * Wed, Jun 24, HH:MM" (weekday helps the reservist scan a busy list at a
 * glance); else falls back to "Wed, Jun 24, HH:MM".
 *
 * `now` is injectable so tests don't depend on wall-clock time.
 */
export function fmtWhen(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  // Strip wall-clock-time so we compare *calendar* days, immune to DST drift.
  const dayDiff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) /
      MS_PER_DAY,
  );

  if (dayDiff === 0) {
    // Imminent same-day slots: append "(in N min)" or "(in N hr)" when the
    // start is in the future within 5 hours, so a reservist tapping the app
    // right before a duty doesn't need to subtract clock times themselves.
    const deltaMin = Math.round((d.getTime() - now.getTime()) / 60_000);
    if (deltaMin > 0 && deltaMin <= 300) {
      if (deltaMin < 60) return `Today, ${time} · in ${deltaMin} min`;
      const hr = Math.round(deltaMin / 60);
      return `Today, ${time} · in ${hr} hr`;
    }
    return `Today, ${time}`;
  }
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  if (dayDiff === -1) return `Yesterday, ${time}`;

  const calendar = d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (dayDiff >= 2 && dayDiff <= 6) return `in ${dayDiff} days · ${calendar}, ${time}`;
  return `${calendar}, ${time}`;
}

/**
 * Returns a humanised "N units ago" string for a past ISO timestamp.
 * Used by the reservist's My status card to surface when their override
 * was last set (PRD §7.3 — commanders can change a reservist's status,
 * so the reservist should at least see *when* it was last changed).
 *
 *   <30s    → "just now"
 *   <60min  → "N min ago"
 *   <24h    → "N hr ago"
 *   <30d    → "N day(s) ago"
 *   <12mo   → "N mo ago"
 *   else    → "over a year ago"
 *
 * Returns null for a future timestamp (caller decides what to render).
 */
export function relativeAgo(iso: string, now: Date = new Date()): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const deltaMs = now.getTime() - t;
  if (deltaMs < 0) return null;
  const sec = Math.floor(deltaMs / 1000);
  if (sec < 30) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return '1 day ago';
  if (day < 30) return `${day} days ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} mo ago`;
  return 'over a year ago';
}

/**
 * Returns a friendly hint for a `status_until` date (YYYY-MM-DD), used in
 * the reservist's "My status" card so they can see at a glance how long
 * the override has left without subtracting dates in their head.
 *
 *   today  > date   → "expired" (caller may also want to clear it)
 *   today == date   → "expires today"
 *   today + 1       → "expires tomorrow"
 *   ≤ today + 30    → "N days left"
 *   else            → null
 */
export function untilHint(dateISO: string, now: Date = new Date()): string | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = dateISO.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const days = Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
  if (days < 0) return 'expired';
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  if (days <= 30) return `${days} days left`;
  return null;
}

/**
 * Returns a relative-time hint for a deployment-window pair of dates,
 * used in the reservist's "My deployments" list. Both arguments are
 * `YYYY-MM-DD` strings (date-only). Returns null when nothing useful
 * applies (e.g. the window is already finished, or more than 60 days
 * out — we don't want to clutter every row with "in 184 days").
 *
 *   today < start  ≤ start+60  → "starts in N days" / "starts tomorrow"
 *   start ≤ today ≤ end        → "in progress"
 *   today > end                → null (caller can still show state pill)
 *
 * `now` is injectable so tests don't drift with the wall clock.
 */
export function windowCountdown(startISO: string, endISO: string, now: Date = new Date()): string | null {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  if (today > end) return null;
  if (today >= start) return 'in progress';

  const days = Math.round((start.getTime() - today.getTime()) / MS_PER_DAY);
  if (days === 1) return 'starts tomorrow';
  if (days <= 60) return `starts in ${days} days`;
  return null;
}
