import { Button } from './atoms';

interface Props {
  /** `'loading'` until the SW reports back; then the current `PushSubscription` or `null`. */
  pushSub: PushSubscription | null | 'loading';
  /** True while an enable/disable/test mutation is in flight — caller's hook controls this. */
  pushBusy: boolean;
  /**
   * Whether the user is signed in. When false, "Enable push" stays disabled so we
   * don't trigger the SW subscribe flow without a member id to attach the
   * subscription to. The caller's hook handles the case where userId becomes
   * available later.
   */
  hasUser: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onTest: () => void;
  /**
   * Spacing between the two action buttons in the "enabled" state. Settings
   * uses 8, the reservist dashboard uses 6 — keep that small distinction so
   * the cards visually match their hosts.
   */
  buttonGap?: number;
}

/**
 * Shared body for the push-notifications opt-in card. Settings (commander)
 * and ReservistDashboard both render this in their own outer wrapper
 * (`Section` vs `Card`) so we expose only the inside.
 *
 * Hosts pull the `pushSub` + `pushBusy` state and the three handlers from
 * `usePushSubscription(userId, showToast)` and pass them through.
 */
export function PushNotificationsCardBody({
  pushSub, pushBusy, hasUser, onEnable, onDisable, onTest, buttonGap = 8,
}: Props) {
  if (pushSub === 'loading') {
    return (
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
        Checking notification status…
      </div>
    );
  }
  if (pushSub) {
    return (
      <>
        <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
          Push notifications are <strong>enabled</strong> on this device. You'll get alerts
          for urgent call-ups and deployment pick decisions.
        </div>
        <div style={{ display: 'flex', gap: buttonGap, flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" disabled={pushBusy} onClick={onDisable}>
            Disable push
          </Button>
          <Button size="sm" variant="outline" disabled={pushBusy} onClick={onTest}>
            Send test push
          </Button>
        </div>
      </>
    );
  }
  return (
    <>
      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
        Enable push notifications to get alerts for urgent call-ups and deployment pick
        decisions — even when the app is closed.
        {' '}On iOS, install the app to your Home Screen first (iOS 16.4+).
      </div>
      <Button size="sm" variant="primary" icon="bell" disabled={pushBusy || !hasUser} onClick={onEnable}>
        Enable push
      </Button>
    </>
  );
}
