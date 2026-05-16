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
