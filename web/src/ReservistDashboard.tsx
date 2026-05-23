import { useMemo, useState } from 'react';
import { useToast } from './lib/useToast';
import { Button } from './components/atoms';
import { Icon } from './components/Icon';
import { DeploymentPickScreen } from './components/DeploymentPickScreen';
import { ReservistSlotRow } from './components/ReservistSlotRow';
import { DeploymentWindowRow } from './components/DeploymentWindowRow';
import { PushNotificationsCardBody } from './components/PushNotificationsCardBody';
import { Card } from './components/Card';
import { MyStatusCard } from './components/MyStatusCard';
import { MyPhoneVisibilityCard } from './components/MyPhoneVisibilityCard';
import { MySkillsCard } from './components/MySkillsCard';
import { MyActivityCard } from './components/MyActivityCard';
import { NextDeploymentBanner } from './components/NextDeploymentBanner';
import { MyProfileSection } from './components/MyProfileSection';
import { useAuth } from './lib/auth';
import { useActiveTeam } from './lib/team-context';
import {
  useMembers, useMyDeploymentWindows, useMyMember, useMyRecentActivity, useMySlots,
} from './lib/queries';
import { isoDay } from './lib/calendarUtils';
import { MS_PER_DAY } from './lib/constants';
import { useRealtime } from './lib/realtime';
import { usePushSubscription } from './lib/usePushSubscription';
import { fmtPhoneIL } from './lib/phone';
import {
  type DeploymentWindow, type Member,
} from './lib/types';


export function ReservistDashboard({ onSwitchView }: { onSwitchView?: () => void }) {
  const { user, signOut } = useAuth();
  const { team, teams, setTeamId } = useActiveTeam();
  const me = useMyMember(user?.id);
  const slots = useMySlots(me.data?.id);
  const windows = useMyDeploymentWindows(user?.id, team?.id);
  const teamMembers = useMembers(team?.id);
  const myActivity = useMyRecentActivity(me.data?.id, team?.id);
  const memberById = useMemo(() => {
    const map = new Map<string, Member>();
    for (const m of teamMembers.data ?? []) map.set(m.id, m);
    return map;
  }, [teamMembers.data]);
  const [activeWindow, setActiveWindow] = useState<DeploymentWindow | null>(null);
  const [showAllClosedDeployments, setShowAllClosedDeployments] = useState(false);

  const nextWindow = useMemo(() => {
    // Compare as YYYY-MM-DD strings to avoid UTC/local midnight skew.
    const todayStr = isoDay(new Date());
    return (windows.data ?? [])
      .filter((w) => w.state === 'open' && w.end_date >= todayStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
  }, [windows.data]);

  useRealtime(team?.id);

  const { toast, showToast } = useToast(2000);

  const { pushSub, pushBusy, handleEnablePush, handleDisablePush, handleTestPush } =
    usePushSubscription(user?.id, showToast);

  if (me.isLoading) {
    return <Splash text="Loading…" />;
  }
  if (!me.data) {
    return <Splash text="Profile not found. Maybe ask a commander to re-invite you." />;
  }

  if (activeWindow) {
    const creator = activeWindow.created_by
      ? memberById.get(activeWindow.created_by)?.name ?? null
      : null;
    return (
      <DeploymentPickScreen
        window={activeWindow}
        creatorName={creator}
        actorMemberId={me.data.id}
        actorName={user?.name ?? me.data.name}
        onClose={() => setActiveWindow(null)}
        onToast={showToast}
      />
    );
  }

  // PRD §7.6 — when the team's `show_unit_schedule` flag is off, reservists
  // only see slots they are personally assigned to. Urgent slots are always
  // visible regardless of the flag (so call-ups still reach the reservist).
  const myMemberId = me.data?.id;
  const visibleSlots = (slots.data ?? []).filter((s) => {
    if (team && s.team_id !== team.id) return false;
    if (team && team.show_unit_schedule === false) {
      return s.urgent === true || (myMemberId != null && s.assignee_id === myMemberId);
    }
    return true;
  });
  const upcoming = visibleSlots.filter((s) => s.state === 'published' && new Date(s.start_at) >= new Date(Date.now() - MS_PER_DAY));
  const urgent = upcoming.filter((s) => s.urgent);
  const regular = upcoming.filter((s) => !s.urgent);
  // Cancelled slots the reservist was assigned to, within a recent/near window
  // (7 days back → 30 days forward). Surfaced separately so the reservist
  // notices a cancellation they cared about; falls off after the start date
  // passes by a week so the card doesn't accumulate stale rows.
  const cancelledAssigned = myMemberId == null ? [] : visibleSlots.filter((s) => {
    if (s.state !== 'cancelled') return false;
    if (s.assignee_id !== myMemberId) return false;
    const t = new Date(s.start_at).getTime();
    const now = Date.now();
    return t >= now - 7 * MS_PER_DAY && t <= now + 30 * MS_PER_DAY;
  });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
      background: 'var(--paper)', color: 'var(--ink)',
    }}>
      <header className="topbar" style={{ borderBottom: '1px solid var(--line)' }}>
        <h1 className="topbar-title">My <em>duty</em></h1>
        <div className="topbar-actions">
          {onSwitchView && (
            <Button variant="ghost" size="sm" onClick={onSwitchView} data-tip="Commander view">
              <Icon name="settings" size={13} /> Commander
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={() => { void signOut(); }} data-tip="Sign out">
            <Icon name="x" size={15} />
          </Button>
        </div>
      </header>

      <div className="scroll" style={{ padding: '20px 18px 60px' }}>
        <MyProfileSection me={me.data} team={team ?? null} teams={teams} onSelectTeam={setTeamId} />

        <NextDeploymentBanner window={nextWindow} onOpen={() => setActiveWindow(nextWindow!)} />

        {/* All other deployment windows (open + recent) */}
        {(() => {
          const all = windows.data ?? [];
          const others = nextWindow
            ? all.filter((w) => w.id !== nextWindow.id)
            : all;
          if (others.length === 0) return null;
          // Open windows: soonest start_date first (most actionable for the
          // reservist). Closed/recent retain the underlying DESC order.
          const open = others
            .filter((w) => w.state === 'open')
            .slice()
            .sort((a, b) => a.start_date.localeCompare(b.start_date));
          const closed = others.filter((w) => w.state !== 'open');
          return (
            <Card title="My deployments">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {open.map((w) => (
                  <DeploymentWindowRow
                    key={w.id}
                    w={w}
                    onOpen={() => setActiveWindow(w)}
                  />
                ))}
                {closed.length > 0 && (() => {
                  const CAP = 5;
                  const visible = showAllClosedDeployments ? closed : closed.slice(0, CAP);
                  const hiddenCount = closed.length - visible.length;
                  return (
                    <>
                      <div style={{
                        fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
                        textTransform: 'uppercase', letterSpacing: '.08em',
                        color: 'var(--ink-mute)', marginTop: open.length > 0 ? 6 : 0,
                      }}>Recent</div>
                      {visible.map((w) => (
                        <DeploymentWindowRow
                          key={w.id}
                          w={w}
                          onOpen={() => setActiveWindow(w)}
                          dim
                        />
                      ))}
                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          data-testid="show-more-closed"
                          onClick={() => setShowAllClosedDeployments(true)}
                          className="filter-clear"
                          style={{ alignSelf: 'flex-start', marginTop: 2 }}
                        >
                          Show {hiddenCount} more
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </Card>
          );
        })()}

        {/* Status card */}
        {user && team && (
          <MyStatusCard
            member={me.data}
            userName={user.name}
            teamId={team.id}
            onToast={showToast}
          />
        )}

        {/* Phone visibility opt-in (PRD §7.2) */}
        <MyPhoneVisibilityCard member={me.data} onToast={showToast} />

        {/* My skills self-edit (PRD §7.2) */}
        {user && team && (
          <MySkillsCard
            member={me.data}
            userName={user.name}
            teamId={team.id}
            onToast={showToast}
          />
        )}

        {/* Push notifications opt-in (PRD §7.8) */}
        <Card title="Notifications">
          <PushNotificationsCardBody
            pushSub={pushSub}
            pushBusy={pushBusy}
            hasUser={!!user}
            onEnable={handleEnablePush}
            onDisable={handleDisablePush}
            onTest={handleTestPush}
            buttonGap={6}
          />
        </Card>

        {/* My upcoming duty */}
        <Card title="My upcoming duty">
          {slots.isLoading ? (
            <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Loading…</div>
          ) : upcoming.length === 0 && cancelledAssigned.length === 0 ? (
            <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
              Nothing scheduled for you right now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cancelledAssigned.length > 0 && (
                <div
                  data-testid="cancelled-section"
                  style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                >
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
                    textTransform: 'uppercase', letterSpacing: '.08em',
                    color: 'var(--ink-mute)',
                  }}>
                    Cancelled
                  </div>
                  {cancelledAssigned.map((s) => (
                    <ReservistSlotRow key={s.id} s={s} memberById={memberById} myMemberId={me.data!.id} />
                  ))}
                  {(urgent.length > 0 || regular.length > 0) && <div style={{ height: 4 }} />}
                </div>
              )}
              {urgent.length > 0 && (
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '.08em',
                  color: 'var(--urgent)', display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <Icon name="urgent" size={11} /> Urgent
                </div>
              )}
              {urgent.map((s) => (
                <ReservistSlotRow key={s.id} s={s} memberById={memberById} myMemberId={me.data!.id} />
              ))}
              {urgent.length > 0 && regular.length > 0 && <div style={{ height: 4 }} />}
              {regular.map((s) => (
                <ReservistSlotRow key={s.id} s={s} memberById={memberById} myMemberId={me.data!.id} />
              ))}
            </div>
          )}
        </Card>

        <MyActivityCard activity={myActivity.data ?? []} />

        <Card title="My contact">
          <div
            data-testid="contact-visibility-hint"
            style={{ fontSize: 11.5, color: 'var(--ink-soft)', lineHeight: 1.45, marginBottom: 8 }}
          >
            {me.data.phone_visible_to_peers
              ? <>Visible to commanders <b>and division peers</b>. Flip the toggle above to hide from peers.</>
              : <>Visible to commanders only. Flip the toggle above to share with division peers.</>}
          </div>
          <div style={{
            padding: '10px 12px', background: 'var(--paper-deep)',
            borderRadius: 8, border: '1px solid var(--line-soft)',
            fontFamily: 'var(--mono)', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ flex: 1 }}>{fmtPhoneIL(me.data.phone)}</span>
            <button className="filter-clear" onClick={() => { navigator.clipboard?.writeText(me.data!.phone); showToast('Phone copied'); }}>
              Copy
            </button>
          </div>
        </Card>

        <div style={{ marginTop: 18, fontSize: 11, color: 'var(--ink-mute)', textAlign: 'center', fontFamily: 'var(--mono)' }}>
          {team?.name}
        </div>
      </div>

      <div
        className="toast"
        data-open={toast ? '1' : '0'}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Icon name="check" size={12}/> {toast}
      </div>
    </div>
  );
}

function Splash({ text }: { text: string }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--ink-soft)', padding: 24, textAlign: 'center' }}>
      {text}
    </div>
  );
}
