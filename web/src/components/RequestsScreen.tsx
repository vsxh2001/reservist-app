import { Avatar, Button, Tag } from './atoms';
import { Icon } from './Icon';
import {
  useApproveJoinRequest, useJoinRequests, useRejectJoinRequest,
  useDivision,
} from '../lib/queries';
import { useAuth } from '../lib/auth';
import type { Team } from '../lib/types';

function fmtRel(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface Props {
  team: Team;
  onToast: (msg: string) => void;
}

export function RequestsScreen({ team, onToast }: Props) {
  const { user } = useAuth();
  const division = useDivision();
  const requests = useJoinRequests(team.id);
  const approve = useApproveJoinRequest();
  const reject = useRejectJoinRequest();

  const doApprove = async (r: any) => {
    if (!user) return;
    await approve.mutateAsync({
      requestId: r.id,
      teamId: team.id,
      divisionId: division.data?.id ?? team.division_id,
      actorId: user.id,
      actorName: user.name,
      name: r.name,
      phone: r.phone,
      skillNames: r.skill_names ?? [],
    });
    onToast(`Approved ${r.name}`);
  };

  const doReject = async (r: any) => {
    if (!user) return;
    await reject.mutateAsync({
      requestId: r.id,
      teamId: team.id,
      actorId: user.id,
      actorName: user.name,
      name: r.name,
    });
    onToast(`Rejected ${r.name}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{
        padding: '10px 14px', borderRadius: 8,
        background: 'var(--accent-tint)', color: 'var(--accent-ink)',
        border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
        fontSize: 12.5, lineHeight: 1.5,
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <Icon name="shield" size={14} />
        <div>
          Per <b>PRD §10 risk 3</b>: anyone with the invite link can request — but a commander must approve before they appear in the roster.
        </div>
      </div>

      {requests.isLoading ? (
        <div style={{ color: 'var(--ink-soft)', padding: 14 }}>Loading…</div>
      ) : (requests.data ?? []).length === 0 ? (
        <div className="empty">
          <Icon name="users" size={32} stroke={1.2} />
          <div className="title">No pending requests</div>
          <div>Share the invite link in <i>Settings</i> to grow the team.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(requests.data ?? []).map((r) => {
            const initials = r.name.split(' ').map((p: string) => p[0]).slice(0, 2).join('').toUpperCase();
            return (
              <div key={r.id} style={{
                border: '1px solid var(--line)',
                borderRadius: 12, padding: 14,
                background: 'var(--card)',
                display: 'grid',
                gridTemplateColumns: '40px 1fr auto',
                gap: 12, alignItems: 'flex-start',
              }}>
                <Avatar initials={initials} tone={Math.abs(r.name.length) % 8} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                    {r.phone} · requested {fmtRel(r.created_at)}
                  </div>
                  {r.skill_names.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                      {r.skill_names.map((s: string) => <Tag key={s}>{s}</Tag>)}
                    </div>
                  )}
                  {r.note && (
                    <div style={{
                      marginTop: 8, fontSize: 12.5, color: 'var(--ink-soft)',
                      borderLeft: '2px solid var(--line)', paddingLeft: 8, fontStyle: 'italic',
                    }}>
                      "{r.note}"
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Button size="sm" variant="primary" icon="check"
                          disabled={approve.isPending} onClick={() => doApprove(r)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="ghost" icon="x"
                          disabled={reject.isPending} onClick={() => doReject(r)}
                          style={{ color: 'var(--urgent-deep)' }}>
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
