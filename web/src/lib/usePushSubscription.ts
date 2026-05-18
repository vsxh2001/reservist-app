import { useEffect, useState, useCallback } from 'react';
import {
  currentSubscription,
  sendTestPush,
  subscribeToPush,
  unsubscribeFromPush,
} from './push';

/**
 * Centralizes the push-subscribe / unsubscribe / test flow used by both
 * the commander SettingsScreen and the reservist dashboard.
 *
 * State:
 *   - `pushSub`: `'loading'` until the SW reports back, then the current
 *     `PushSubscription` or `null` (not subscribed / unsupported).
 *   - `pushBusy`: true while one of the handlers is in flight, so callers
 *     can disable their buttons.
 *
 * `userId` is the auth user id used as the `member_id` key in
 * `push_subscriptions`. When undefined, enable is short-circuited with
 * a toast prompting sign-in.
 *
 * `showToast(msg)` is called with all user-visible result strings so the
 * caller controls how toasts are rendered.
 */
export function usePushSubscription(
  userId: string | undefined,
  showToast: (msg: string) => void,
): {
  pushSub: PushSubscription | null | 'loading';
  pushBusy: boolean;
  handleEnablePush: () => Promise<void>;
  handleDisablePush: () => Promise<void>;
  handleTestPush: () => Promise<void>;
} {
  const [pushSub, setPushSub] = useState<PushSubscription | null | 'loading'>('loading');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    currentSubscription().then((sub) => {
      if (!cancelled) setPushSub(sub);
    });
    return () => { cancelled = true; };
  }, []);

  const handleEnablePush = useCallback(async () => {
    if (!userId) { showToast('Sign in to enable notifications'); return; }
    setPushBusy(true);
    const result = await subscribeToPush(userId);
    setPushBusy(false);
    if (result.ok) {
      const sub = await currentSubscription();
      setPushSub(sub);
      showToast('Push notifications enabled');
    } else {
      showToast(result.reason ?? 'Failed to enable push');
    }
  }, [userId, showToast]);

  const handleDisablePush = useCallback(async () => {
    if (!userId) return;
    setPushBusy(true);
    await unsubscribeFromPush(userId);
    setPushSub(null);
    setPushBusy(false);
    showToast('Push notifications disabled');
  }, [userId, showToast]);

  const handleTestPush = useCallback(async () => {
    setPushBusy(true);
    await sendTestPush();
    setPushBusy(false);
    showToast('Test notification sent — check your device');
  }, [showToast]);

  return { pushSub, pushBusy, handleEnablePush, handleDisablePush, handleTestPush };
}
