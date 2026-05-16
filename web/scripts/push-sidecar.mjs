/**
 * push-sidecar.mjs — Reservist web push dispatcher.
 *
 * Listens to Supabase Realtime and fans out web-push notifications when:
 *   1. A new urgent slot is inserted (urgent = true) → all members of the
 *      slot's team get a "Urgent call-up" notification.
 *   2. A deployment_pick is updated and its new state is 'approved' or
 *      'rejected' → the owning reservist (deployment_windows.member_id) gets
 *      a "Pick approved" / "Pick rejected" notification.
 *
 * Run alongside `npm run dev`:
 *   node web/scripts/push-sidecar.mjs
 *
 * Pass --once to subscribe, drain a brief grace period, and exit:
 *   node web/scripts/push-sidecar.mjs --once
 *
 * Required env vars (typically loaded from supabase/.env or the shell):
 *   VITE_SUPABASE_URL          Supabase URL (defaults to local dev URL)
 *   SUPABASE_SERVICE_ROLE_KEY  Service role JWT — used for Realtime + lookups
 *   VAPID_PUBLIC_KEY           VAPID public key  (base64url)
 *   VAPID_PRIVATE_KEY          VAPID private key (base64url) — keep secret!
 *   VAPID_MAILTO               mailto: / https: contact (defaults to placeholder)
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// ── Config ─────────────────────────────────────────────────────────────────

const SUPABASE_URL   = process.env.VITE_SUPABASE_URL          ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE   = process.env.SUPABASE_SERVICE_ROLE_KEY  ?? '';
const VAPID_PUBLIC   = process.env.VAPID_PUBLIC_KEY           ?? '';
const VAPID_PRIVATE  = process.env.VAPID_PRIVATE_KEY          ?? '';
const VAPID_MAILTO   = process.env.VAPID_MAILTO               ?? 'mailto:admin@reservist.local';

const ONCE = process.argv.includes('--once');

if (!SERVICE_ROLE) {
  console.error('[push] SUPABASE_SERVICE_ROLE_KEY not set — exiting.');
  process.exit(1);
}
if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — exiting.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: {
    // Authenticate the Realtime websocket with the service-role JWT so we
    // receive change events on tables with RLS enabled.
    params: { apikey: SERVICE_ROLE },
  },
});

// ── Push fanout ────────────────────────────────────────────────────────────

/**
 * Look up every push subscription for the given member IDs and POST a payload
 * to each endpoint. Returns { sent, errors } counts for terse logging.
 * Endpoints that respond 404 / 410 are pruned from `push_subscriptions`.
 */
async function fanout(memberIds, payload) {
  if (!memberIds.length) return { sent: 0, errors: 0 };

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('member_id', memberIds);

  if (error) {
    console.error('[push] fetch subscriptions error:', error.message);
    return { sent: 0, errors: 1 };
  }
  if (!subs?.length) return { sent: 0, errors: 0 };

  const msg = JSON.stringify(payload);
  const staleIds = [];
  let sent = 0;
  let errors = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          msg,
        );
        sent += 1;
      } catch (err) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          staleIds.push(sub.id);
        } else {
          errors += 1;
          console.warn('[push] send error (status=%s): %s', status, err?.message);
        }
      }
    }),
  );

  if (staleIds.length) {
    const { error: delErr } = await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', staleIds);
    if (delErr) {
      console.warn('[push] prune error: %s', delErr.message);
    }
  }

  return { sent, errors };
}

// ── Event handlers ─────────────────────────────────────────────────────────

/**
 * Fired on every slots INSERT. Only urgent slots trigger a fan-out.
 * Targets: all members of slot.team_id (via team_members).
 */
async function handleSlotInsert(record) {
  if (!record?.urgent) return;

  const { data: rows, error } = await supabase
    .from('team_members')
    .select('member_id')
    .eq('team_id', record.team_id);

  if (error) {
    console.error('[push] slot=%s team_members fetch error: %s', record.id, error.message);
    return;
  }

  const memberIds = (rows ?? []).map((r) => r.member_id);
  const { sent, errors } = await fanout(memberIds, {
    title: 'Urgent call-up',
    body: record.title,
    url: `/slots/${record.id}`,
  });
  console.log('[push] slot=%s → %d subs sent, %d errors', record.id, sent, errors);
}

/**
 * Fired on every deployment_picks UPDATE. Only state ∈ {approved, rejected}
 * triggers a fan-out, and only to the reservist who owns the parent window.
 */
async function handlePickUpdate(record) {
  if (record?.state !== 'approved' && record?.state !== 'rejected') return;

  const { data: win, error } = await supabase
    .from('deployment_windows')
    .select('member_id, label')
    .eq('id', record.window_id)
    .single();

  if (error || !win) {
    console.error('[push] pick=%s window fetch error: %s', record.id, error?.message);
    return;
  }

  const { sent, errors } = await fanout([win.member_id], {
    title: `Pick ${record.state}`,
    body: `${win.label} on ${record.date}`,
    url: '/calendar',
  });
  console.log('[push] pick=%s → %d subs sent, %d errors', record.id, sent, errors);
}

// ── Realtime subscriptions ─────────────────────────────────────────────────

const channel = supabase.channel('push-sidecar')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'slots' },
    (payload) => handleSlotInsert(payload.new).catch((err) => {
      console.error('[push] handleSlotInsert threw:', err);
    }),
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'deployment_picks' },
    (payload) => handlePickUpdate(payload.new).catch((err) => {
      console.error('[push] handlePickUpdate threw:', err);
    }),
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log(
        '[push] sidecar ready, VAPID public key prefix=%s...',
        VAPID_PUBLIC.slice(0, 8),
      );
      if (ONCE) {
        // In --once mode, give Realtime a moment to deliver in-flight events
        // and then exit cleanly. Useful for smoke tests.
        setTimeout(() => {
          console.log('[push] --once: grace period elapsed, exiting.');
          process.exit(0);
        }, 2000);
      }
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      console.warn('[push] realtime status: %s', status);
    }
  });

// Graceful shutdown.
function shutdown(signal) {
  console.log('[push] %s received — shutting down.', signal);
  channel.unsubscribe().finally(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
