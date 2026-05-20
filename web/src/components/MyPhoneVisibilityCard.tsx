import { Card } from './Card';
import { Icon } from './Icon';
import { useSetPhoneVisibility } from '../lib/queries';
import { fmtPhoneIL } from '../lib/phone';
import { humanizeError } from '../lib/errors';
import type { Member } from '../lib/types';

interface Props {
  member: Member;
  onToast: (msg: string) => void;
}

/**
 * Reservist-controlled toggle for sharing their phone number with peers
 * in the division. Commanders and division admins always see the phone
 * regardless of this flag (enforced by RLS / the `members_view`).
 *
 * PRD §7.2.
 */
export function MyPhoneVisibilityCard({ member, onToast }: Props) {
  const setPhoneVisibility = useSetPhoneVisibility();

  const setVisible = (visible: boolean) => {
    if (member.phone_visible_to_peers === visible) return;
    setPhoneVisibility.mutate(
      { memberId: member.id, visible },
      {
        onSuccess: () => onToast(visible ? 'Phone shared with division' : 'Phone hidden from peers'),
        onError: (err) => onToast(humanizeError(err, 'Failed to update phone visibility')),
      },
    );
  };

  return (
    <Card title="Phone visibility">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
        <div style={{ flex: 1, fontSize: 13 }}>
          Share my phone with division members
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
            When off, only commanders and division admins can see your phone.
          </div>
        </div>
        <div className="filter-group">
          <button
            data-on={member.phone_visible_to_peers ? '1' : '0'}
            disabled={setPhoneVisibility.isPending}
            onClick={() => setVisible(true)}
          >On</button>
          <button
            data-on={!member.phone_visible_to_peers ? '1' : '0'}
            disabled={setPhoneVisibility.isPending}
            onClick={() => setVisible(false)}
          >Off</button>
        </div>
      </div>
      <div
        data-testid="phone-visibility-preview"
        style={{
          marginTop: 10, padding: '8px 10px',
          background: 'var(--paper-deep)', border: '1px solid var(--line-soft)',
          borderRadius: 8, fontSize: 11.5, lineHeight: 1.45,
          color: 'var(--ink-soft)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <Icon name="phone" size={11} />
        <span style={{ flex: 1 }}>
          Peers in your division see:{' '}
          {member.phone_visible_to_peers ? (
            <b style={{ color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
              {fmtPhoneIL(member.phone)}
            </b>
          ) : (
            <em>hidden</em>
          )}
        </span>
      </div>
    </Card>
  );
}
