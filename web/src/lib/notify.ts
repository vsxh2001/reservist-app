/**
 * notify.ts — thin client wrapper around the `send-push` Edge Function.
 *
 * Callers fire-and-forget: every `notify*` returns a promise but mutations
 * intentionally do not `await` it, because:
 *   - Push delivery is best-effort, not authoritative.
 *   - We don't want a slow push fan-out to delay the optimistic UI update.
 *
 * The function itself enforces commander-of-team authorization, so this
 * module just shapes the payload and surfaces any error in the console for
 * the developer (no toast — pushes are background plumbing).
 */

import { supabase } from './supabase';

interface NotifyOpts {
  memberIds: string[];
  /** Required for any fan-out beyond self — the function checks caller is a commander of this team. */
  teamId?: string;
  title: string;
  body: string;
  /** Where the SW navigates on click. Defaults to '/'. */
  url?: string;
  /** Same `tag` collapses on the device — used so a status update doesn't pile up. */
  tag?: string;
}

async function invokeSendPush(opts: NotifyOpts): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('send-push', {
      body: {
        member_ids: opts.memberIds,
        team_id: opts.teamId,
        title: opts.title,
        body: opts.body,
        url: opts.url,
        tag: opts.tag,
      },
    });
    if (error) {
      console.warn('[notify] send-push returned error:', error.message);
    }
  } catch (err) {
    console.warn('[notify] send-push invocation threw:', err);
  }
}

/** Notify every member of `teamId` about an urgent call-up. */
export function notifyUrgentCallUp(teamId: string, memberIds: string[], slotTitle: string): Promise<void> {
  return invokeSendPush({
    memberIds,
    teamId,
    title: `Urgent: ${slotTitle}`,
    body: 'New urgent call-up posted in your team',
    tag: `urgent:${teamId}`,
  });
}

/** Notify a single member they were assigned to a duty slot. */
export function notifySlotAssigned(teamId: string, memberId: string, slotTitle: string): Promise<void> {
  return invokeSendPush({
    memberIds: [memberId],
    teamId,
    title: `Assigned: ${slotTitle}`,
    body: 'A commander assigned you to a duty slot',
    tag: `assigned:${memberId}`,
  });
}

/** Notify the slot's current assignee that the commander edited the slot. */
export function notifySlotChanged(teamId: string, memberId: string, slotTitle: string): Promise<void> {
  return invokeSendPush({
    memberIds: [memberId],
    teamId,
    title: `Slot updated: ${slotTitle}`,
    body: 'A commander changed details on a duty slot you are on.',
    tag: `slot-changed:${memberId}`,
  });
}

/** Notify the slot's current assignee that the slot was cancelled. */
export function notifySlotCancelled(teamId: string, memberId: string, slotTitle: string): Promise<void> {
  return invokeSendPush({
    memberIds: [memberId],
    teamId,
    title: `Cancelled: ${slotTitle}`,
    body: 'A commander cancelled a duty slot you were on.',
    tag: `slot-cancelled:${memberId}`,
  });
}

/**
 * Notify every affected assignee that a commander bulk-cancelled a range of
 * duty slots (PRD §7.8). Single grouped fan-out — one push per member — so a
 * wide range cancellation costs one Edge Function invocation, not one per
 * slot, and stays clear of the per-caller rate limit.
 */
export function notifyBulkCancelled(teamId: string, memberIds: string[]): Promise<void> {
  return invokeSendPush({
    memberIds,
    teamId,
    title: 'Slots cancelled',
    body: 'A commander cancelled duty slots you were assigned to.',
    tag: `bulk-cancelled:${teamId}`,
  });
}

/** Notify a member that a commander unassigned them from a duty slot. */
export function notifySlotUnassigned(teamId: string, memberId: string, slotTitle: string): Promise<void> {
  return invokeSendPush({
    memberIds: [memberId],
    teamId,
    title: `Unassigned: ${slotTitle}`,
    body: 'A commander removed you from this duty slot.',
    tag: `slot-unassigned:${memberId}`,
  });
}

/** Notify a reservist that a deployment pick was approved or rejected. */
export function notifyPickDecided(
  teamId: string,
  memberId: string,
  decision: 'approved' | 'rejected',
  windowLabel: string,
): Promise<void> {
  return invokeSendPush({
    memberIds: [memberId],
    teamId,
    title: decision === 'approved' ? `Approved: ${windowLabel}` : `Declined: ${windowLabel}`,
    body: decision === 'approved'
      ? 'Your deployment pick was approved.'
      : 'Your deployment pick was declined.',
    tag: `pick:${memberId}:${decision}`,
  });
}
