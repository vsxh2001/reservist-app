// Shared month-grid helpers for deployment screens.
// CalendarScreen.tsx has its own copy with slightly different padding rules
// (always 42 cells); kept separate to avoid touching that screen.

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthsBetween(startISO: string, endISO: string): Date[] {
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
      86_400_000,
  );

  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Tomorrow, ${time}`;
  if (dayDiff === -1) return `Yesterday, ${time}`;

  const calendar = d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (dayDiff >= 2 && dayDiff <= 6) return `in ${dayDiff} days · ${calendar}, ${time}`;
  return `${calendar}, ${time}`;
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
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
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
  const dayMs = 86_400_000;

  if (today > end) return null;
  if (today >= start) return 'in progress';

  const days = Math.round((start.getTime() - today.getTime()) / dayMs);
  if (days === 1) return 'starts tomorrow';
  if (days <= 60) return `starts in ${days} days`;
  return null;
}
