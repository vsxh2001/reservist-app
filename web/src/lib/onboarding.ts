// First-run onboarding state. Member-scoped so each profile (incl. the mock
// LoginPicker users) sees the tour once, and versioned so a future expansion of
// the tour can re-trigger it for everyone by bumping VERSION. localStorage is
// wrapped in try/catch to match lib/prefs — a disabled/again-throwing store
// must never break the dashboard; it just means the tour shows each load.

const VERSION = 'v1';
const keyFor = (memberId: string) => `reservist.onboarded.${VERSION}.${memberId}`;

/** True when this member has already finished or skipped the tour. */
export function hasSeenOnboarding(memberId: string): boolean {
  if (!memberId) return false;
  try {
    return localStorage.getItem(keyFor(memberId)) === '1';
  } catch {
    return false;
  }
}

/** Records that the member has seen the tour (on finish or skip). */
export function markOnboardingSeen(memberId: string): void {
  if (!memberId) return;
  try {
    localStorage.setItem(keyFor(memberId), '1');
  } catch {
    // Ignore — a write failure just re-shows the tour next load.
  }
}

/** Clears the flag so the tour shows again (used by the "replay" control). */
export function resetOnboarding(memberId: string): void {
  if (!memberId) return;
  try {
    localStorage.removeItem(keyFor(memberId));
  } catch {
    // Ignore.
  }
}
