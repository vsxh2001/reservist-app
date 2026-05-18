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
