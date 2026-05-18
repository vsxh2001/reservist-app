/**
 * Compute 2-character uppercase initials from a full name.
 * "Yael Cohen"      → "YC"
 * "tamar levi avi"  → "TL" (first two words)
 * "Madonna"         → "M"
 * "" / null / undef → "?"
 */
export function initialsFromName(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const letters = parts
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return letters || '?';
}

/**
 * Split a full name into `{ first, rest }` for the "first name + faded
 * surname" treatment used by the profile card and person drawer.
 *
 *   "Yael Cohen"        → { first: "Yael", rest: "Cohen" }
 *   "Tamar Levi Avi"    → { first: "Tamar", rest: "Levi Avi" }
 *   "Madonna"           → { first: "Madonna", rest: "" }
 *   ""/null/undefined   → { first: "", rest: "" }
 *
 * Whitespace is collapsed; leading/trailing spaces are trimmed.
 */
export function splitName(name: string | null | undefined): { first: string; rest: string } {
  if (!name) return { first: '', rest: '' };
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', rest: '' };
  const [first, ...restParts] = parts;
  return { first, rest: restParts.join(' ') };
}
