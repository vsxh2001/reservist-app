/**
 * csv.ts — RFC 4180 helpers for activity-log export.
 *
 * Lived inline in ActivityScreen.tsx until it tripped the
 * react-refresh/only-export-components lint warning (HMR needs component
 * files to export only components). Hoisted unchanged.
 */

import type { ActivityItem } from './types';

/**
 * Spreadsheet formula-injection guard. Excel / Sheets / LibreOffice treat a
 * cell whose first character is `=`, `+`, `-`, or `@` as a formula, so a value
 * like `=HYPERLINK(...)` becomes live code on open. They also strip leading
 * whitespace in an unquoted cell before parsing, so ` =1+1` is just as live —
 * hence the leading `\s` in the trigger. Member names and free-text activity
 * descriptions are user-controlled, so we prefix any such cell with a single
 * quote to force it to read as text. (Google Sheets renders that apostrophe
 * literally; that cosmetic cost is the accepted OWASP "CSV Injection" trade.)
 */
function neutralizeFormula(s: string): string {
  return /^[\s=+@-]/.test(s) ? `'${s}` : s;
}

/**
 * Cell escape: first neutralize formula injection, then apply RFC 4180 quoting
 * (wrap in quotes when the cell contains `, " \r \n`).
 */
export function csvEscape(v: string | null | undefined): string {
  const s = neutralizeFormula(v ?? '');
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
