/**
 * csv.ts — RFC 4180 helpers for activity-log export.
 *
 * Lived inline in ActivityScreen.tsx until it tripped the
 * react-refresh/only-export-components lint warning (HMR needs component
 * files to export only components). Hoisted unchanged.
 */

import type { ActivityItem } from './types';

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
