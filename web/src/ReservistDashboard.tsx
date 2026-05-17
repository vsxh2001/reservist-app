import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, SkillChip, StatusPill } from './components/atoms';
import { Icon } from './components/Icon';
import { DeploymentPickScreen } from './components/DeploymentPickScreen';
import { useAuth } from './lib/auth';
import { useActiveTeam } from './lib/team-context';
import {
  useMembers, useMyDeploymentWindows, useMyMember, useMySlots,
  useRemoveMemberSkill, useSelfUpdateStatus, useSetMemberSkill,
  useSetPhoneVisibility, useSkills,
} from './lib/queries';
import { useRealtime } from './lib/realtime';
import {
  currentSubscription, sendTestPush, subscribeToPush, unsubscribeFromPush,
} from './lib/push';
import {
  SKILL_LEVELS, SKILL_LEVEL_LABEL,
  STATUS_LABEL,
  type DeploymentWindow, type SkillLevel, type Status,
} from './lib/types';

/** Today + offset days, formatted YYYY-MM-DD in local time (status_until is a DATE column). */
function computeUntilDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

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
  const teamMembers = useMembers(team?.id);
  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of teamMembers.data ?? []) map.set(m.id, m.name);
    return map;
  }, [teamMembers.data]);
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
  const setMemberSkill = useSetMemberSkill();
  const removeMemberSkill = useRemoveMemberSkill();
  const allSkills = useSkills(me.data?.division_id);
  const [editingSkills, setEditingSkills] = useState(false);
  const [addSkillName, setAddSkillName] = useState('');
  const [addSkillLevel, setAddSkillLevel] = useState<SkillLevel>('junior');
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState<Status>('available');
  const [note, setNote] = useState('');
  const [until, setUntil] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Push notification state — mirrors the commander SettingsScreen surface
  // so reservists can opt into urgent call-up + pick-decision alerts.
  const [pushSub, setPushSub] = useState<PushSubscription | null | 'loading'>('loading');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    currentSubscription().then((sub) => {
      if (!cancelled) setPushSub(sub);
    });
    return () => { cancelled = true; };
  }, []);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2000);
  };

  const handleEnablePush = async () => {
    if (!user) { showToast('Sign in to enable notifications'); return; }
    setPushBusy(true);
    const result = await subscribeToPush(user.id);
    setPushBusy(false);
    if (result.ok) {
      const sub = await currentSubscription();
      setPushSub(sub);
      showToast('Push notifications enabled');
    } else {
      showToast(result.reason ?? 'Failed to enable push');
    }
  };

  const handleDisablePush = async () => {
    if (!user) return;
    setPushBusy(true);
    await unsubscribeFromPush(user.id);
    setPushSub(null);
    setPushBusy(false);
    showToast('Push notifications disabled');
  };

  const handleTestPush = async () => {
    setPushBusy(true);
    await sendTestPush();
    setPushBusy(false);
    showToast('Test notification sent — check your device');
  };

  const cycleSkillLevel = async (name: string, currentLevel: SkillLevel) => {
    if (!me.data || !user || !team) return;
    const next = SKILL_LEVELS[(SKILL_LEVELS.indexOf(currentLevel) + 1) % SKILL_LEVELS.length];
    try {
      await setMemberSkill.mutateAsync({
        memberId: me.data.id,
        divisionId: me.data.division_id,
        skillName: name,
        level: next,
        actorId: me.data.id,
        actorName: user.name,
        memberName: me.data.name,
        teamId: team.id,
      });
      showToast(`${name}: ${SKILL_LEVEL_LABEL[next]}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update skill');
    }
  };

  const removeSkill = async (name: string) => {
    if (!me.data || !user || !team) return;
    try {
      await removeMemberSkill.mutateAsync({
        memberId: me.data.id,
        divisionId: me.data.division_id,
        skillName: name,
        actorId: me.data.id,
        actorName: user.name,
        memberName: me.data.name,
        teamId: team.id,
      });
      showToast(`Removed ${name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove skill');
    }
  };

  const addSkill = async () => {
    if (!me.data || !user || !team || !addSkillName) return;
    try {
      await setMemberSkill.mutateAsync({
        memberId: me.data.id,
        divisionId: me.data.division_id,
        skillName: addSkillName,
        level: addSkillLevel,
        actorId: me.data.id,
        actorName: user.name,
        memberName: me.data.name,
        teamId: team.id,
      });
      setAddSkillName('');
      setAddSkillLevel('junior');
      showToast(`Added ${addSkillName}: ${SKILL_LEVEL_LABEL[addSkillLevel]}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add skill');
    }
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

        {/* All other deployment windows (open + recent) */}
        {(() => {
          const all = windows.data ?? [];
          const others = nextWindow
            ? all.filter((w) => w.id !== nextWindow.id)
            : all;
          if (others.length === 0) return null;
          const open = others.filter((w) => w.state === 'open');
          const closed = others.filter((w) => w.state !== 'open');
          return (
            <Card title="My deployments">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {open.map((w) => (
                  <DeploymentRow
                    key={w.id}
                    w={w}
                    onOpen={() => setActiveWindow(w)}
                  />
                ))}
                {closed.length > 0 && (
                  <>
                    <div style={{
                      fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
                      textTransform: 'uppercase', letterSpacing: '.08em',
                      color: 'var(--ink-mute)', marginTop: open.length > 0 ? 6 : 0,
                    }}>Recent</div>
                    {closed.map((w) => (
                      <DeploymentRow
                        key={w.id}
                        w={w}
                        onOpen={() => setActiveWindow(w)}
                        dim
                      />
                    ))}
                  </>
                )}
              </div>
            </Card>
          );
        })()}

        {/* Status card */}
        <Card title="My status" right={!editing && <button className="filter-clear" onClick={startEdit}>Change</button>}>
          {!editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
              {me.data.status !== 'available' && user && (
                <button
                  type="button"
                  disabled={update.isPending}
                  onClick={async () => {
                    if (!me.data || !user) return;
                    try {
                      await update.mutateAsync({
                        memberId: me.data.id,
                        status: 'available',
                        note: null,
                        until: null,
                        teamId: team?.id ?? '',
                        actorName: user.name,
                      });
                      showToast('Status set to Available');
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : 'Failed to update');
                    }
                  }}
                  style={{
                    appearance: 'none', font: 'inherit', fontSize: 12,
                    padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                    border: '1px solid var(--accent)',
                    background: 'var(--accent-tint)',
                    color: 'var(--accent-deep)',
                    fontWeight: 500,
                    textAlign: 'center',
                  }}
                >
                  Set as available
                </button>
              )}
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
                {pending !== 'available' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                    {([
                      { label: '3 days',  days: 3 },
                      { label: '1 week',  days: 7 },
                      { label: '2 weeks', days: 14 },
                      { label: '1 month', days: 30 },
                    ] as const).map((preset) => {
                      const target = computeUntilDate(preset.days);
                      const active = until === target;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setUntil(target)}
                          style={{
                            appearance: 'none', font: 'inherit', fontSize: 12,
                            padding: '4px 10px', borderRadius: 14, cursor: 'pointer',
                            border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line-strong)'),
                            background: active ? 'var(--accent-tint)' : 'var(--card)',
                            color: active ? 'var(--accent-deep)' : 'var(--ink-2)',
                            fontWeight: active ? 600 : 400,
                          }}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                    {until && (
                      <button
                        type="button"
                        onClick={() => setUntil('')}
                        style={{
                          appearance: 'none', font: 'inherit', fontSize: 12,
                          padding: '4px 10px', borderRadius: 14, cursor: 'pointer',
                          border: '1px dashed var(--line-strong)',
                          background: 'transparent', color: 'var(--ink-soft)',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
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

        {/* My skills self-edit (PRD §7.2) */}
        <Card
          title="My skills"
          right={
            <button
              className="filter-clear"
              onClick={() => setEditingSkills((v) => !v)}
            >
              {editingSkills ? 'Done' : 'Edit'}
            </button>
          }
        >
          {!editingSkills ? (
            me.data.skills.length === 0 ? (
              <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                No skills yet. Tap <b>Edit</b> to add what you know.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {me.data.skills.map((s) => (
                  <SkillChip key={s.name} name={s.name} level={s.level} />
                ))}
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {me.data.skills.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {me.data.skills.map((s) => (
                    <div
                      key={s.name}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '4px 6px 4px 10px', borderRadius: 16,
                        background: 'var(--paper-deep)',
                        border: '1px solid var(--line-soft)',
                        fontSize: 12,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{s.name}</span>
                      <button
                        type="button"
                        onClick={() => cycleSkillLevel(s.name, s.level)}
                        disabled={setMemberSkill.isPending}
                        style={{
                          appearance: 'none', font: 'inherit', fontSize: 10.5,
                          padding: '2px 6px', borderRadius: 10, cursor: 'pointer',
                          border: '1px solid var(--accent)',
                          background: 'var(--accent-tint)',
                          color: 'var(--accent-deep)',
                          textTransform: 'uppercase', letterSpacing: '.04em',
                        }}
                        title="Cycle level: junior → intermediate → senior"
                      >
                        {SKILL_LEVEL_LABEL[s.level]}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSkill(s.name)}
                        disabled={removeMemberSkill.isPending}
                        aria-label={`Remove ${s.name}`}
                        style={{
                          appearance: 'none', font: 'inherit',
                          padding: 0, width: 20, height: 20, borderRadius: 10,
                          cursor: 'pointer',
                          border: 'none', background: 'transparent',
                          display: 'grid', placeItems: 'center',
                          color: 'var(--ink-soft)',
                        }}
                      >
                        <Icon name="x" size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(() => {
                const known = new Set(me.data.skills.map((s) => s.name));
                const available = (allSkills.data ?? []).filter((n) => !known.has(n));
                if (available.length === 0) {
                  return (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                      You already have every skill in this division.
                    </div>
                  );
                }
                return (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      value={addSkillName}
                      onChange={(e) => setAddSkillName(e.target.value)}
                      style={{
                        flex: 1, minWidth: 140,
                        padding: '6px 8px',
                        border: '1px solid var(--line-strong)',
                        borderRadius: 6,
                        font: 'inherit', background: 'var(--card)', color: 'inherit',
                      }}
                    >
                      <option value="">Add a skill…</option>
                      {available.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <select
                      value={addSkillLevel}
                      onChange={(e) => setAddSkillLevel(e.target.value as SkillLevel)}
                      style={{
                        padding: '6px 8px',
                        border: '1px solid var(--line-strong)',
                        borderRadius: 6,
                        font: 'inherit', background: 'var(--card)', color: 'inherit',
                      }}
                    >
                      {SKILL_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>{SKILL_LEVEL_LABEL[lvl]}</option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      variant="primary"
                      icon="check"
                      disabled={!addSkillName || setMemberSkill.isPending}
                      onClick={addSkill}
                    >
                      Add
                    </Button>
                  </div>
                );
              })()}
            </div>
          )}
        </Card>

        {/* Push notifications opt-in (PRD §7.8) */}
        <Card title="Notifications">
          {pushSub === 'loading' ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>
              Checking notification status…
            </div>
          ) : pushSub ? (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
                Push notifications are <strong>enabled</strong> on this device.
                You'll get alerts for urgent call-ups and deployment pick decisions.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button size="sm" variant="ghost" disabled={pushBusy} onClick={handleDisablePush}>
                  Disable push
                </Button>
                <Button size="sm" variant="outline" disabled={pushBusy} onClick={handleTestPush}>
                  Send test push
                </Button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 10 }}>
                Enable push notifications to get alerts for urgent call-ups and deployment pick decisions —
                even when the app is closed.
                {' '}On iOS, install the app to your Home Screen first (iOS 16.4+).
              </div>
              <Button size="sm" variant="primary" icon="bell" disabled={pushBusy || !user} onClick={handleEnablePush}>
                Enable push
              </Button>
            </>
          )}
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
              {urgent.map((s) => (
                <SlotRow key={s.id} s={s} memberNameById={memberNameById} myMemberId={me.data!.id} />
              ))}
              {urgent.length > 0 && regular.length > 0 && <div style={{ height: 4 }} />}
              {regular.map((s) => (
                <SlotRow key={s.id} s={s} memberNameById={memberNameById} myMemberId={me.data!.id} />
              ))}
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

interface SlotRowSlot {
  id: string;
  title: string;
  urgent: boolean;
  start_at: string;
  duration: string | null;
  location: string | null;
  needed: number;
  filled: number;
  notes: string | null;
  skills: { name: string; min_level: SkillLevel }[];
  assignee_ids: string[];
}

function SlotRow({ s, memberNameById, myMemberId }: {
  s: SlotRowSlot;
  memberNameById?: Map<string, string>;
  myMemberId?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasDetail =
    Boolean(s.notes) ||
    s.skills.length > 0 ||
    s.needed > 0 ||
    s.assignee_ids.length > 0;
  const toggle = () => { if (hasDetail) setOpen((v) => !v); };
  return (
    <div
      role={hasDetail ? 'button' : undefined}
      tabIndex={hasDetail ? 0 : undefined}
      aria-expanded={hasDetail ? open : undefined}
      onClick={toggle}
      onKeyDown={(e) => {
        if (!hasDetail) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
      style={{
        border: '1px solid ' + (s.urgent ? 'var(--urgent)' : 'var(--line-soft)'),
        borderRadius: 10, padding: 12,
        background: s.urgent ? 'var(--urgent-bg)' : 'var(--paper-deep)',
        position: 'relative', overflow: 'hidden',
        cursor: hasDetail ? 'pointer' : 'default',
      }}
    >
      {s.urgent && <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: 'var(--urgent)',
      }}/>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 500, fontSize: 14, flex: 1, minWidth: 0 }}>{s.title}</div>
        {hasDetail && (
          <Icon name={open ? 'chevDown' : 'chevRight'} size={14} />
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-soft)', display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="calendar" size={11}/> {fmtWhen(s.start_at)}
        </span>
        {s.duration && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="clock" size={11}/> {s.duration}
        </span>}
        {s.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="pin" size={11}/> {s.location}
        </span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--mono)' }}>
          {s.filled}/{s.needed}
        </span>
      </div>
      {open && hasDetail && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px solid var(--line-soft)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {s.notes && (
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>
              {s.notes}
            </div>
          )}
          {s.skills.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {s.skills.map((sk) => (
                <SkillChip key={sk.name} name={sk.name} level={sk.min_level} />
              ))}
            </div>
          )}
          {s.assignee_ids.length > 0 && (
            <div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: '.08em',
                color: 'var(--ink-mute)', marginBottom: 4,
              }}>
                Assigned ({s.assignee_ids.length})
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                {s.assignee_ids
                  .map((id) => {
                    if (id === myMemberId) return 'You';
                    return memberNameById?.get(id) ?? '—';
                  })
                  .join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeploymentRow({
  w, onOpen, dim,
}: {
  w: DeploymentWindow;
  onOpen: () => void;
  dim?: boolean;
}) {
  const labelColor = dim ? 'var(--ink-soft)' : 'var(--ink)';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: dim ? 'var(--paper-deep)' : 'var(--card)',
        border: '1px solid var(--line-soft)',
        borderRadius: 8,
        cursor: 'pointer',
        opacity: dim ? 0.85 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 13, color: labelColor }}>
          {w.label}
        </div>
        <div style={{
          fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2,
          fontFamily: 'var(--mono)',
        }}>
          {w.start_date} → {w.end_date}
          {' · '}
          <span style={{ color: w.approved_count > 0 ? 'var(--accent-deep)' : 'var(--ink-soft)' }}>
            {w.approved_count} approved
          </span>
          {w.proposed_count > 0 && (
            <>{' · '}{w.proposed_count} proposed</>
          )}
          {w.rejected_count > 0 && (
            <>{' · '}{w.rejected_count} rejected</>
          )}
        </div>
      </div>
      <span style={{
        fontSize: 10, fontFamily: 'var(--mono)',
        padding: '2px 6px', borderRadius: 4,
        textTransform: 'uppercase', letterSpacing: '.06em',
        background: w.state === 'open' ? 'var(--accent-tint)' : 'var(--paper-deep)',
        color: w.state === 'open' ? 'var(--accent-deep)' : 'var(--ink-mute)',
        border: '1px solid ' + (w.state === 'open' ? 'var(--accent)' : 'var(--line-soft)'),
      }}>
        {w.state}
      </span>
      <Icon name="chevRight" size={14} />
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
