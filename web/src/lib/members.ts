/**
 * members.ts — shared member-list helpers.
 *
 * `getActiveMembers` returns the subset of a member list that a commander
 * would consider for an assignment (currently: status `available` or
 * `standby`), sorted with `available` first and then alphabetically by name.
 *
 * Lives outside `types.ts` so the type module stays focused on shapes.
 */

import type { Member } from './types';

export function getActiveMembers(members: Member[]): Member[] {
  return members
    .filter((m) => m.status === 'available' || m.status === 'standby')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'available' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}
