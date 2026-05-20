/**
 * errors.ts — translate raw Supabase/Postgres errors into user-facing toast copy.
 *
 * Why: PostgREST surfaces the raw constraint name and "duplicate key value
 * violates unique constraint" text. Showing that verbatim leaks DB shape
 * and reads as a backend failure even when the cause is a benign UX case
 * (two commanders publishing the same slot title concurrently, a retry
 * after an optimistic-add, etc.).
 *
 * Callers do:
 *
 *   try { await mutation.mutateAsync(...) }
 *   catch (err) { onToast(humanizeError(err, 'Failed to do thing')) }
 *
 * The fallback is mandatory so each call site picks a meaningful default
 * for the case where the heuristics don't match.
 */

const HUMAN_HINTS: Array<{ test: (msg: string) => boolean; copy: string }> = [
  {
    // slots_team_title_start_uniq — see migration 20260520042925.
    test: (m) => m.includes('slots_team_title_start_uniq'),
    copy: 'A slot with this title already exists at this start time.',
  },
  {
    // push_subscriptions_member_id_endpoint_key — re-subscribing the same device.
    test: (m) => m.includes('push_subscriptions_member_id_endpoint_key'),
    copy: 'This device is already subscribed to push notifications.',
  },
  {
    // members_auth_user_idx — claim_member_by_invite duplicate link.
    test: (m) => m.includes('members_auth_user_idx'),
    copy: 'This account is already linked to a member profile.',
  },
  {
    // PostgREST surfaces unique violations with this prefix.
    test: (m) => m.includes('duplicate key value'),
    copy: 'That already exists — refresh and try again.',
  },
  {
    // Network / offline.
    test: (m) => m.toLowerCase().includes('failed to fetch'),
    copy: 'Network error — check your connection and try again.',
  },
];

/**
 * Returns a short, user-facing string for the given error, falling back to
 * `fallback` when no heuristic matches. Never throws.
 */
export function humanizeError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : '');
  for (const { test, copy } of HUMAN_HINTS) {
    if (test(message)) return copy;
  }
  return message ? `${fallback}: ${message}` : fallback;
}
