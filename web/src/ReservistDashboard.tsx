import { useMemo, useState } from 'react';
import { Avatar, Button, SkillChip, StatusPill } from './components/atoms';
import { Icon } from './components/Icon';
import { DeploymentPickScreen } from './components/DeploymentPickScreen';
import { useAuth } from './lib/auth';
import { useActiveTeam } from './lib/team-context';
import {
  useMyDeploymentWindows, useMyMember, useMySlots, useSelfUpdateStatus,
  useSetPhoneVisibility,
} from './lib/queries';
import { useRealtime } from './lib/realtime';
import { STATUS_LABEL, type DeploymentWindow, type Status } from './lib/types';

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `Today, ${hh}:${mm}`;
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + `, ${hh}:${mm}`;
}

export function ReservistDashboard({ onSwitchView }: { onSwitchView?: () => void }) {
  const { user, signOut } = useAuth();
  const { team, teams, setTeamId } = useActiveTeam();
  const me = useMyMember(user?.id);
  const slots = useMySlots(me.data?.id);
  const windows = useMyDeploymentWindows(user?.id, team?.id);
  const [activeWindow, setActiveWindow] = useState<DeploymentWindow | null>(null);

  const nextWindow = useMemo(() => {
    // Compare as YYYY-MM-DD strings to avoid UTC/local midnight skew.
    const t = new Date();
    const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return (windows.data ?? [])
      .filter((w) => w.state === 'open' && w.end_date >= todayStr)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
  }, [windows.data]);

  useRealtime(team?.id);

  const update = useSelfUpdateStatus();
  const setPhoneVisibility = useSetPhoneVisibility();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Status>('available');
  const [note, setNote] = useState('');
  const [until, setUntil] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2000);
  };

  if (me.isLoading) {
    return <Splash text="Loading…" />;
  }
  if (!me.data) {
    return <Splash text="Profile not found. Maybe ask a commander to re-invite you." />;
  }

  if (activeWindow) {
    return (
      <DeploymentPickScreen
        window={activeWindow}
        onClose={() => setActiveWindow(null)}
        onToast={showToast}
      />
    );
  }

  const startEdit = () => {
    setPending(me.data!.status);
    setNote(me.data!.status_note ?? '');
    setUntil(me.data!.status_until ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (!me.data || !user) return;
    await update.mutateAsync({
      memberId: me.data.id,
      status: pending,
      note: note.trim() ? note.trim() : null,
      until: until || null,
      teamId: team?.id ?? '',
      actorName: user.name,
    });
    setEditing(false);
    showToast(`Status set to ${STATUS_LABEL[pending]}`);
  };

  // PRD §7.6 — when the team's `show_unit_schedule` flag is off, reservists
  // only see slots they are personally assigned to. Urgent slots are always
  // visible regardless of the flag (so call-ups still reach the reservist).
  const myMemberId = me.data?.id;
  const visibleSlots = (slots.data ?? []).filter((s) => {
    if (team && s.team_id !== team.id) return false;
    if (team && team.show_unit_schedule === false) {
      return s.urgent === true || (myMemberId != null && s.assignee_ids.includes(myMemberId));
    }
    return true;
  });
  const upcoming = visibleSlots.filter((s) => s.state === 'published' && new Date(s.start_at) >= new Date(Date.now() - 86400000));
  const urgent = upcoming.filter((s) => s.urgent);
  const regular = upcoming.filter((s) => !s.urgent);

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
        {/* Team picker — shown when member is on multiple teams */}
        {teams.length > 1 && (
          <div style={{
            display: 'flex', gap: 6, flexWrap: 'wrap',
            marginBottom: 16,
          }}>
            {teams.map((t) => (
              <button
                key={t.id}
                onClick={() => setTeamId(t.id)}
                style={{
                  appearance: 'none', font: 'inherit',
                  fontSize: 12, padding: '5px 12px', borderRadius: 20,
                  border: '1px solid ' + (team?.id === t.id ? 'var(--accent)' : 'var(--line-strong)'),
                  background: team?.id === t.id ? 'var(--accent-tint)' : 'var(--card)',
                  color: team?.id === t.id ? 'var(--accent-deep)' : 'var(--ink-2)',
                  cursor: 'pointer', fontWeight: team?.id === t.id ? 600 : 400,
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}

        {/* Profile card */}
        <section style={{
          display: 'flex', gap: 14, alignItems: 'center',
          padding: 18, marginBottom: 18,
          background: 'var(--card)', border: '1px solid var(--line)',
          borderRadius: 14,
        }}>
          <Avatar initials={me.data.initials} tone={me.data.tone} status={me.data.status} size="xl" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400, lineHeight: 1.1,
            }}>
              {me.data.name.split(' ')[0]} <em style={{ color: 'var(--ink-soft)' }}>{me.data.name.split(' ').slice(1).join(' ')}</em>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 4 }}>
              {team?.name}
            </div>
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {me.data.skills.map((s) => <SkillChip key={s.name} name={s.name} level={s.level} />)}
            </div>
          </div>
        </section>

        {nextWindow && (
          <section role="button" tabIndex={0}
            onClick={() => setActiveWindow(nextWindow)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveWindow(nextWindow);
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: 16, marginBottom: 14,
              background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: 12,
              cursor: 'pointer',
            }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: 'var(--accent)', color: 'var(--card)',
              display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              <Icon name="calendar" size={20}/>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10.5, textTransform: 'uppercase',
                letterSpacing: '.08em', color: 'var(--ink-mute)',
              }}>My next deployment</div>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 400, marginTop: 2 }}>
                {nextWindow.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 2, fontFamily: 'var(--mono)' }}>
                {nextWindow.start_date} → {nextWindow.end_date} · {nextWindow.approved_count} approved · {nextWindow.proposed_count} proposed
              </div>
            </div>
            <Icon name="chevRight" size={16} />
          </section>
        )}

        {/* Status card */}
        <Card title="My status" right={!editing && <button className="filter-clear" onClick={startEdit}>Change</button>}>
          {!editing ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', background: 'var(--paper-deep)',
              borderRadius: 8, border: '1px solid var(--line-soft)',
            }}>
              <StatusPill status={me.data.status} />
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', flex: 1, minWidth: 0 }}>
                {me.data.status_note || <span style={{ fontStyle: 'italic' }}>No note</span>}
                {me.data.status_until && <> · <b>until {me.data.status_until}</b></>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {(['available', 'standby', 'released', 'unavailable'] as Status[]).map((s) => (
                  <button key={s} onClick={() => setPending(s)} style={{
                    appearance: 'none',
                    border: '1px solid ' + (s === pending ? 'var(--accent)' : 'var(--line-strong)'),
                    background: s === pending ? 'var(--accent-tint)' : 'var(--card)',
                    padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                    font: 'inherit', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <StatusPill status={s} />
                    {s === pending && <Icon name="check" size={12}/>}
                  </button>
                ))}
              </div>
              <div className="form-row">
                <label>Note (optional)</label>
                <input className="input" value={note}
                       placeholder="e.g. exam period, abroad until..."
                       onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="form-row">
                <label>Until (optional)</label>
                <input className="input" type="date" value={until}
                       onChange={(e) => setUntil(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" variant="primary" icon="check"
                        disabled={update.isPending} onClick={save}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Phone visibility opt-in (PRD §7.2) */}
        <Card title="Phone visibility">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 0' }}>
            <div style={{ flex: 1, fontSize: 13 }}>
              Share my phone with division members
              <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                PRD §7.2 — when off, only commanders and division admins can see your phone.
              </div>
            </div>
            <div className="filter-group">
              <button
                data-on={me.data.phone_visible_to_peers ? '1' : '0'}
                disabled={setPhoneVisibility.isPending}
                onClick={() => {
                  if (!me.data || me.data.phone_visible_to_peers) return;
                  setPhoneVisibility.mutate(
                    { memberId: me.data.id, visible: true },
                    { onSuccess: () => showToast('Phone shared with division') },
                  );
                }}
              >On</button>
              <button
                data-on={!me.data.phone_visible_to_peers ? '1' : '0'}
                disabled={setPhoneVisibility.isPending}
                onClick={() => {
                  if (!me.data || !me.data.phone_visible_to_peers) return;
                  setPhoneVisibility.mutate(
                    { memberId: me.data.id, visible: false },
                    { onSuccess: () => showToast('Phone hidden from peers') },
                  );
                }}
              >Off</button>
            </div>
          </div>
        </Card>

        {/* My upcoming duty */}
        <Card title="My upcoming duty">
          {slots.isLoading ? (
            <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Loading…</div>
          ) : upcoming.length === 0 ? (
            <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
              Nothing scheduled for you right now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {urgent.length > 0 && (
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '.08em',
                  color: 'var(--urgent)', display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <Icon name="urgent" size={11} /> Urgent
                </div>
              )}
              {urgent.map((s) => <SlotRow key={s.id} s={s} />)}
              {urgent.length > 0 && regular.length > 0 && <div style={{ height: 4 }} />}
              {regular.map((s) => <SlotRow key={s.id} s={s} />)}
            </div>
          )}
        </Card>

        <Card title="Contact (visible to commanders only)">
          <div style={{
            padding: '10px 12px', background: 'var(--paper-deep)',
            borderRadius: 8, border: '1px solid var(--line-soft)',
            fontFamily: 'var(--mono)', fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ flex: 1 }}>{me.data.phone.replace('+972 ', '0').replace(/-/g, ' ')}</span>
            <button className="filter-clear" onClick={() => { navigator.clipboard?.writeText(me.data!.phone); showToast('Phone copied'); }}>
              Copy
            </button>
          </div>
        </Card>

        <div style={{ marginTop: 18, fontSize: 11, color: 'var(--ink-mute)', textAlign: 'center', fontFamily: 'var(--mono)' }}>
          {team?.name} · PRD §7.6 reservist view
        </div>
      </div>

      <div className="toast" data-open={toast ? '1' : '0'}>
        <Icon name="check" size={12}/> {toast}
      </div>
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{
      background: 'var(--card)', border: '1px solid var(--line)',
      borderRadius: 12, padding: 16, marginBottom: 14,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '.08em',
          color: 'var(--ink-mute)',
        }}>{title}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

function SlotRow({ s }: { s: any }) {
  return (
    <div style={{
      border: '1px solid ' + (s.urgent ? 'var(--urgent)' : 'var(--line-soft)'),
      borderRadius: 10, padding: 12,
      background: s.urgent ? 'var(--urgent-bg)' : 'var(--paper-deep)',
      position: 'relative', overflow: 'hidden',
    }}>
      {s.urgent && <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: 'var(--urgent)',
      }}/>}
      <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>{s.title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="calendar" size={11}/> {fmtWhen(s.start_at)}
        </span>
        {s.duration && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="clock" size={11}/> {s.duration}
        </span>}
        {s.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="pin" size={11}/> {s.location}
        </span>}
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
