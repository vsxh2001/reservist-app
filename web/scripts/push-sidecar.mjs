/**
 * push-sidecar.mjs — Reservist web push dispatcher.
 *
 * Listens to Supabase Realtime and fans out web push notifications to
 * subscribed members when:
 *   1. A new urgent slot (call-up) is published in a unit.
 *   2. A deployment pick they proposed is approved or rejected.
 *
 * Run alongside `npm run dev`:
 *   node web/scripts/push-sidecar.mjs
 *
 * Pass --once to process one batch of pending events and exit (useful for
 * smoke testing without keeping a long-lived process):
 *   node web/scripts/push-sidecar.mjs --once
 *
 * Required env vars (set in web/.env or supabase/.env or shell):
 *   VITE_SUPABASE_URL        e.g. http://127.0.0.1:54321
 *   VITE_SUPABASE_ANON_KEY   anon JWT
 *   VITE_VAPID_PUBLIC_KEY    VAPID public key (base64url)
 *   VAPID_PRIVATE_KEY        VAPID private key (base64url) — keep secret!
 *   VAPID_MAILTO             mailto: or https: contact URL (defaults to placeholder)
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// ── Config ─────────────────────────────────────────────────────────────────

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL     ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON    = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const VAPID_PUBLIC     = process.env.VITE_VAPID_PUBLIC_KEY  ?? '';
const VAPID_PRIVATE    = process.env.VAPID_PRIVATE_KEY      ?? '';
const VAPID_MAILTO     = process.env.VAPID_MAILTO           ?? 'mailto:admin@reservist.local';

const ONCE = process.argv.includes('--once');

if (!SUPABASE_ANON) {
  console.error('[push-sidecar] VITE_SUPABASE_ANON_KEY not set — exiting.');
  process.exit(1);
}
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('[push-sidecar] VAPID keys not set (VITE_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — exiting.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

console.log('[push-sidecar] Starting. SUPABASE_URL=%s once=%s', SUPABASE_URL, ONCE);

// ── Push fanout ────────────────────────────────────────────────────────────

/**
 * Send a push notification to all subscriptions for the given member IDs.
 * Stale endpoints (410 Gone) are pruned from the DB automatically.
 */
async function fanout(memberIds, payload) {
  if (!memberIds.length) return;

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('member_id', memberIds);

  if (error) {
    console.error('[push-sidecar] fetch subscriptions error:', error.message);
    return;
  }
  if (!subs?.length) return;

  const msg = JSON.stringify(payload);
  const staleIds = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          msg,
        );
        console.log('[push-sidecar] sent to endpoint …%s', sub.endpoint.slice(-12));
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Subscription expired/unsubscribed — prune it.
          staleIds.push(sub.id);
          console.log('[push-sidecar] pruning stale endpoint …%s', sub.endpoint.slice(-12));
        } else {
          console.warn('[push-sidecar] send error (status=%s): %s', err.statusCode, err.message);
        }
      }
    }),
  );

  if (staleIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────

/**
 * Called when a new slot row is inserted.
 * Fires for urgent+published slots; fans out to all members in the same unit.
 */
async function handleSlotInsert(record) {
  if (!record.urgent || record.state !== 'published') return;

  // Fetch all members of the unit that has this slot.
  const { data: members, error } = await supabase
    .from('members')
    .select('id')
    .eq('unit_id', record.unit_id);

  if (error) { console.error('[push-sidecar] slot member fetch error:', error.message); return; }

  const memberIds = (members ?? []).map((m) => m.id);
  console.log('[push-sidecar] urgent slot inserted — notifying %d member(s)', memberIds.length);

  await fanout(memberIds, {
    title: '🚨 Urgent call-up',
    body: record.title ?? 'A new urgent duty slot has been published.',
    url: '/',
  });
}

/**
 * Called when a deployment_pick row is updated.
 * Fires when state changes to 'approved' or 'rejected'.
 */
async function handlePickUpdate(record) {
  if (record.state !== 'approved' && record.state !== 'rejected') return;

  // Resolve the member_id via the parent deployment_window.
  const { data: win, error } = await supabase
    .from('deployment_windows')
    .select('member_id')
    .eq('id', record.window_id)
    .single();

  if (error || !win) {
    console.error('[push-sidecar] deployment_window fetch error:', error?.message);
    return;
  }

  const label = record.state === 'approved' ? 'approved' : 'declined';
  const emoji = record.state === 'approved' ? '✅' : '❌';
  console.log('[push-sidecar] deployment pick %s for member %s', label, win.member_id);

  await fanout([win.member_id], {
    title: `${emoji} Deployment pick ${label}`,
    body: `Your pick for ${record.date} was ${label}.`,
    url: '/',
  });
}

// ── Realtime subscriptions ─────────────────────────────────────────────────

const channel = supabase.channel('push-sidecar')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'slots' },
    (payload) => handleSlotInsert(payload.new).catch(console.error),
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'deployment_picks' },
    (payload) => handlePickUpdate(payload.new).catch(console.error),
  )
  .subscribe((status) => {
    console.log('[push-sidecar] realtime status: %s', status);
    if (ONCE && status === 'SUBSCRIBED') {
      // In --once mode give it a moment to process any in-flight events then exit.
      setTimeout(() => {
        console.log('[push-sidecar] --once: exiting after grace period.');
        process.exit(0);
      }, 2000);
    }
  });

// Graceful shutdown.
process.on('SIGINT', () => {
  console.log('\n[push-sidecar] shutting down…');
  channel.unsubscribe();
  process.exit(0);
});
