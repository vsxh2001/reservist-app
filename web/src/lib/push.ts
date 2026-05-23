/**
 * push.ts — web push subscription management.
 *
 * PLATFORM NOTES
 * --------------
 * - iOS requires the app to be installed to the Home Screen (PWA standalone
 *   mode) AND served over HTTPS. Notification permission is gated behind a
 *   user gesture. Minimum: iOS 16.4 + Safari/WebKit.
 * - Android Chrome works on a dev cert after manual trust (Settings → Security
 *   → Certificates or flag #allow-insecure-localhost).
 * - Desktop Chrome/Edge work on HTTPS (including Vite's basicSsl cert after
 *   accepting the browser warning once).
 *
 * Architecture
 * ------------
 * We register a secondary service worker at /sw-push.js that handles push
 * events and notification clicks. This keeps push logic isolated from the
 * VitePWA-managed precache worker (sw.js). The two workers co-exist; browsers
 * allow multiple registrations under different scopes or paths.
 *
 * The VitePWA autoUpdate worker handles offline + manifest; sw-push.js handles
 * only push + notificationclick. Subscriptions are stored in the
 * push_subscriptions table, keyed on (member_id, endpoint).
 */

import { supabase } from './supabase';
import { humanizeError } from './errors';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** Path to our secondary push-only service worker (served from /public). */
const PUSH_SW_URL = '/sw-push.js';

// ── helpers ────────────────────────────────────────────────────────────────

/** Convert VAPID public key from base64url to Uint8Array (required by pushManager.subscribe). */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0))) as Uint8Array<ArrayBuffer>;
}

/** Ensure the push service worker is registered and return its registration. */
async function getPushSWRegistration(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.');
  }
  // Re-use an existing registration for our push SW if one exists.
  const existing = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(PUSH_SW_URL, { scope: '/' });
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Request push notification permission, subscribe the current device, and
 * upsert the subscription into push_subscriptions for this member.
 *
 * Returns { ok: true } on success or { ok: false, reason } on failure.
 */
export async function subscribeToPush(
  memberId: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'VITE_VAPID_PUBLIC_KEY is not set in environment.' };
  }

  if (!('Notification' in window)) {
    return { ok: false, reason: 'This browser does not support notifications.' };
  }

  // Request permission — must be called from a user gesture.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: `Notification permission ${permission}.` };
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await getPushSWRegistration();
  } catch (err: unknown) {
    return { ok: false, reason: humanizeError(err, 'SW registration failed') };
  }

  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  } catch (err: unknown) {
    return { ok: false, reason: humanizeError(err, 'Push subscribe failed') };
  }

  const { endpoint, keys } = subscription.toJSON() as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      member_id: memberId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'member_id,endpoint' },
  );

  if (error) {
    return { ok: false, reason: `DB upsert failed: ${error.message}` };
  }

  return { ok: true };
}

/**
 * Read the current push subscription from the push SW registration.
 * Returns null if not subscribed or if the browser doesn't support it.
 */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
    if (!reg) return null;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Unsubscribe the current device and delete the row from push_subscriptions.
 */
export async function unsubscribeFromPush(memberId: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const { endpoint } = sub;
    await sub.unsubscribe();
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('member_id', memberId)
      .eq('endpoint', endpoint);
  } catch (err) {
    console.warn('[push] unsubscribe error:', err);
  }
}

/**
 * Send a local test notification via the push SW message channel.
 * This does NOT exercise the server path but verifies permission, SW
 * wiring, and notification display end-to-end on the current device.
 */
export async function sendTestPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration(PUSH_SW_URL);
  if (!reg?.active) {
    // Wait up to 3 s for the SW to activate.
    await new Promise<void>((resolve) => {
      const sw = reg?.installing ?? reg?.waiting;
      if (!sw) { resolve(); return; }
      sw.addEventListener('statechange', function handler() {
        if (sw.state === 'activated') { sw.removeEventListener('statechange', handler); resolve(); }
      });
      setTimeout(resolve, 3000);
    });
  }
  const active = (await navigator.serviceWorker.getRegistration(PUSH_SW_URL))?.active;
  active?.postMessage({ type: 'TEST_PUSH' });
}
