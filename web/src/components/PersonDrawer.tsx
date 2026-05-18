import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button, IconButton, SkillChip, StatusPill } from './atoms';
import { DeploymentWindowDrawer } from './DeploymentWindowDrawer';
import {
  SKILL_LEVELS, SKILL_LEVEL_LABEL, STATUS_LABEL,
  type DeploymentWindow, type Member, type SkillLevel, type Status, type Team, type TeamRole,
} from '../lib/types';
import {
  useCreateDeploymentWindow, useDeleteMember, useMemberDeploymentWindows,
  useRemoveMemberSkill, useSetMemberSkill, useUpdateStatus,
  useUpdateTeamMembership, useRemoveTeamMembership, useTeamsForMember,
} from '../lib/queries';
import { useAuth } from '../lib/auth';
import { fmtPhoneIL, normalizePhoneToE164IL } from '../lib/phone';
import { splitName } from '../lib/text';

interface Props {
  person: Member;
  team: Team;
  allSkills: string[];
  divisionId: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function PersonDrawer({ person, team, allSkills, divisionId, onClose, onToast }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'profile' | 'activity' | 'reviews'>('profile');
  const [editingStatus, setEditingStatus] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<Status>(person.status);
  const [note, setNote] = useState<string>(person.status_note ?? '');
  const [until, setUntil] = useState<string>(person.status_until ?? '');
  const updateStatus = useUpdateStatus();
  const updateMembership = useUpdateTeamMembership();
  const removeMembership = useRemoveTeamMembership();
  const remove = useDeleteMember();
  const setSkill = useSetMemberSkill();
  const removeSkill = useRemoveMemberSkill();
  const createWindow = useCreateDeploymentWindow();
  const windows = useMemberDeploymentWindows(person.id, team.id);
  const [openingWindow, setOpeningWindow] = useState<DeploymentWindow | null>(null);
  const [newWinOpen, setNewWinOpen] = useState(false);
  const [nwLabel, setNwLabel] = useState('');
  const [nwStart, setNwStart] = useState('');
  const [nwEnd, setNwEnd] = useState('');
  const [nwNotes, setNwNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [confirmRemoveTeamId, setConfirmRemoveTeamId] = useState<string | null>(null);

  // Teams the current commander commands (to determine which teams they can manage)
  const myTeams = useTeamsForMember(user?.id);

  // Normalized phone for tap-to-call / WhatsApp deep links. `null` => fall back to toast.
  const e164 = normalizePhoneToE164IL(person.phone);

  useEffect(() => {
    setTab('profile');
    setEditingStatus(false);
    setPendingStatus(person.status);
    setNote(person.status_note ?? '');
    setUntil(person.status_until ?? '');
    setShowAddTeam(false);
    setConfirmRemoveTeamId(null);
  }, [person.id]);

  const commitStatus = async () => {
    if (!user) return;
    await updateStatus.mutateAsync({
      memberId: person.id,
      status: pendingStatus,
      note: note.trim() ? note.trim() : null,
      until: until || null,
      setBy: user.id,
      actorName: user.name,
      memberName: person.name,
      teamId: team.id,
    });
    setEditingStatus(false);
    onToast(`Status set to ${STATUS_LABEL[pendingStatus]}`);
  };

  const doDelete = async () => {
    if (!user) return;
    await remove.mutateAsync({
      memberId: person.id,
      memberName: person.name,
      actorId: user.id,
      actorName: user.name,
      teamId: team.id,
    });
    onToast(`${person.name} removed from division`);
    onClose();
  };

  const toggleRole = async (teamId: string, currentRole: TeamRole) => {
    if (!user) return;
    const newRole: TeamRole = currentRole === 'commander' ? 'soldier' : 'commander';
    await updateMembership.mutateAsync({
      teamId, memberId: person.id, role: newRole,
      actorId: user.id, actorName: user.name, memberName: person.name,
    });
    onToast(newRole === 'commander' ? `${person.name} promoted to commander` : `${person.name} demoted to soldier`);
  };

  const doRemoveFromTeam = async (teamId: string) => {
    if (!user) return;
    await removeMembership.mutateAsync({
      teamId, memberId: person.id,
      actorId: user.id, actorName: user.name, memberName: person.name,
    });
    setConfirmRemoveTeamId(null);
    onToast(`${person.name} removed from team`);
    // If removed from the currently-viewed team, close the drawer
    if (teamId === team.id) onClose();
  };

  const addToTeam = async (targetTeamId: string) => {
    if (!user) return;
    await updateMembership.mutateAsync({
      teamId: targetTeamId, memberId: person.id, role: 'soldier',
      actorId: user.id, actorName: user.name, memberName: person.name,
    });
    setShowAddTeam(false);
    onToast(`${person.name} added to team`);
  };

  const submitNewWindow = async () => {
    if (!user) return;
    try {
      await createWindow.mutateAsync({
        memberId: person.id, teamId: team.id,
        label: nwLabel.trim(), startDate: nwStart, endDate: nwEnd,
        notes: nwNotes.trim() ? nwNotes.trim() : null,
        createdBy: user.id, actorName: user.name, memberName: person.name,
      });
      setNewWinOpen(false);
      setNwLabel(''); setNwStart(''); setNwEnd(''); setNwNotes('');
      onToast('Deployment window opened');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open window';
      onToast(`Error: ${msg}`);
    }
  };

  const recentActivity: { dot: string | null; body: JSX.Element; when: string }[] = [
    { dot: 'accent', body: <><b>Assigned</b> to Outpost Rotation by Daniel Katz</>, when: '2h ago' },
    { dot: null,     body: <>Set status to <b>{STATUS_LABEL[person.status]}</b></>, when: '4h ago' },
    { dot: 'accent', body: <>Completed slot <b>Sector 7 patrol</b></>, when: 'May 11' },
    { dot: null,     body: <>Skill added: <b>Night Ops</b></>, when: 'Apr 22' },
    { dot: null,     body: <>Joined the unit</>, when: person.joined ?? '—' },
  ];

  // Teams person is NOT already on, filtered to teams the commander manages
  const personTeamIds = new Set(person.teams.map((tm) => tm.team_id));
  const addableTeams = (myTeams.data ?? []).filter((t) => !personTeamIds.has(t.id));

  return (
    <>
      <div className="drawer-overlay" data-open="1" onClick={onClose} />
      <div className="drawer" data-open="1" role="dialog" aria-label={person.name}>
        <div className="drawer-head">
          <Avatar initials={person.initials} tone={person.tone} status={person.status} size="xl" />
          <div className="drawer-head-meta">
            <h3 className="name">
              {(() => { const n = splitName(person.name); return <>{n.first} <em>{n.rest}</em></>; })()}
            </h3>
            {person.teams.find((tm) => tm.team_id === team.id)?.role === 'commander' && (
              <div className="role-line">
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  background: 'var(--accent-tint)', color: 'var(--accent-deep)',
                  padding: '1px 6px', borderRadius: 4,
                  textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600,
                }}>COMMANDER</span>
              </div>
            )}
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              {e164 ? (
                <a className="btn" data-variant="primary" data-size="sm"
                   href={`tel:+${e164}`} aria-label={`Call ${person.name}`}>
                  <Icon name="phone" />
                  Call
                </a>
              ) : (
                <Button variant="primary" size="sm" icon="phone"
                        onClick={() => onToast(`Calling ${person.name}…`)}>Call</Button>
              )}
              {e164 ? (
                <a className="btn" data-size="sm"
                   href={`https://wa.me/${e164}`} target="_blank" rel="noopener noreferrer"
                   aria-label={`WhatsApp ${person.name}`}>
                  <Icon name="whatsapp" />
                  WhatsApp
                </a>
              ) : (
                <Button size="sm" icon="whatsapp"
                        onClick={() => onToast(`Opening WhatsApp with ${person.name}…`)}>WhatsApp</Button>
              )}
              <Button size="sm" variant="ghost" icon="copy"
                      onClick={() => { navigator.clipboard?.writeText(person.phone); onToast('Phone copied'); }} />
            </div>
          </div>
          <button className="action-btn" onClick={onClose} aria-label="Close" style={{ alignSelf: 'flex-start' }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--line-soft)', padding: '0 18px', gap: 4 }}>
          {(['profile', 'activity', 'reviews'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              appearance: 'none', border: 0, background: 'transparent',
              font: 'inherit', fontSize: 12.5, fontWeight: 500,
              padding: '10px 12px',
              color: tab === t ? 'var(--ink)' : 'var(--ink-soft)',
              borderBottom: '2px solid ' + (tab === t ? 'var(--accent)' : 'transparent'),
              marginBottom: -1, cursor: 'pointer',
              letterSpacing: '-.005em', textTransform: 'capitalize',
            }}>
              {t}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'profile' && (
            <>
              <div className="drawer-section">
                <h4>Current status
                  <span className="edit" onClick={() => setEditingStatus((v) => !v)}>
                    {editingStatus ? 'Cancel' : 'Override'}
                  </span>
                </h4>
                {!editingStatus ? (
                  <div className="drawer-status-bar">
                    <StatusPill status={person.status} />
                    <div className="note">
                      {person.status_note || <span style={{ fontStyle: 'italic' }}>No note</span>}
                      {person.status_until && <> · <b>until {person.status_until}</b></>}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {(['available', 'standby', 'released', 'unavailable'] as Status[]).map((s) => (
                        <button key={s} onClick={() => setPendingStatus(s)}
                          style={{
                            appearance: 'none', border: '1px solid ' + (s === pendingStatus ? 'var(--accent)' : 'var(--line-strong)'),
                            background: s === pendingStatus ? 'var(--accent-tint)' : 'var(--card)',
                            padding: '10px 12px', borderRadius: 7, cursor: 'pointer',
                            font: 'inherit', textAlign: 'left',
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}>
                          <StatusPill status={s} />
                          {s === pendingStatus && <Icon name="check" size={12}/>}
                        </button>
                      ))}
                    </div>
                    <div className="form-row">
                      <label>Note (optional)</label>
                      <input className="input" value={note}
                             placeholder="e.g. Returning from south, ETA 18:00"
                             onChange={(e) => setNote(e.target.value)} />
                    </div>
                    <div className="form-row">
                      <label>Until (optional)</label>
                      <input className="input" type="date" value={until}
                             onChange={(e) => setUntil(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <Button size="sm" variant="ghost" onClick={() => setEditingStatus(false)}>Cancel</Button>
                      <Button size="sm" variant="primary" icon="check"
                              disabled={updateStatus.isPending}
                              onClick={commitStatus}>
                        Save
                      </Button>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontFamily: 'var(--mono)' }}>
                      Override logged as "set by {user?.name ?? 'commander'}, today".
                    </div>
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <h4>Contact<span className="edit">Visible to commanders only</span></h4>
                <div className="drawer-contact">
                  <span>{fmtPhoneIL(person.phone)}</span>
                  <IconButton icon="copy" tip="Copy" onClick={() => { navigator.clipboard?.writeText(person.phone); onToast('Phone copied'); }} />
                  {e164 ? (
                    <a className="action-btn" data-tip="WhatsApp" data-tone="whatsapp"
                       href={`https://wa.me/${e164}`} target="_blank" rel="noopener noreferrer"
                       aria-label={`WhatsApp ${person.name}`}>
                      <Icon name="whatsapp" size={14} />
                    </a>
                  ) : (
                    <IconButton icon="whatsapp" tip="WhatsApp" tone="whatsapp"
                                onClick={() => onToast(`Opening WhatsApp with ${person.name}…`)} />
                  )}
                </div>
              </div>

              <div className="drawer-section">
                <h4>Skills
                  <span className="edit" onClick={() => setEditingSkills((v) => !v)}>
                    {editingSkills ? 'Done' : 'Edit'}
                  </span>
                </h4>
                {!editingSkills ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {person.skills.length === 0 && (
                      <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>No skills tagged.</span>
                    )}
                    {person.skills.map((s) => <SkillChip key={s.name} name={s.name} level={s.level} />)}
                  </div>
                ) : (
                  <SkillEditor
                    held={person.skills}
                    catalog={allSkills}
                    busy={setSkill.isPending || removeSkill.isPending}
                    onSet={(name, level) => {
                      if (!user) return;
                      setSkill.mutate({
                        memberId: person.id, divisionId,
                        skillName: name, level,
                        actorId: user.id, actorName: user.name, memberName: person.name,
                        teamId: team.id,
                      }, { onSuccess: () => onToast(`${name} → ${SKILL_LEVEL_LABEL[level]}`) });
                    }}
                    onRemove={(name) => {
                      if (!user) return;
                      removeSkill.mutate({
                        memberId: person.id, divisionId,
                        skillName: name,
                        actorId: user.id, actorName: user.name, memberName: person.name,
                        teamId: team.id,
                      }, { onSuccess: () => onToast(`Removed ${name}`) });
                    }}
                  />
                )}
              </div>

              <div className="drawer-section">
                <h4>Team memberships
                  <span className="edit" onClick={() => setShowAddTeam((v) => !v)}>
                    {showAddTeam ? 'Cancel' : '+ Add to a team'}
                  </span>
                </h4>

                {showAddTeam && (
                  <div style={{ marginBlockEnd: 10 }}>
                    {addableTeams.length === 0 ? (
                      <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                        No other teams available to add to.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {addableTeams.map((t) => (
                          <button key={t.id}
                                  disabled={updateMembership.isPending}
                                  onClick={() => addToTeam(t.id)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    appearance: 'none', border: '1px dashed var(--line-strong)',
                                    background: 'var(--card)', font: 'inherit', textAlign: 'start',
                                    padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                                    minBlockSize: 40,
                                  }}>
                            <span style={{ fontSize: 18 }}>{t.crest}</span>
                            <span style={{ fontSize: 12.5, color: 'var(--ink)' }}>{t.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', marginInlineStart: 'auto' }}>
                              {t.project_name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {person.teams.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                    Not on any teams.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {person.teams.map((tm) => {
                      const tInfo = (myTeams.data ?? []).find((t) => t.id === tm.team_id);
                      const teamName = tInfo?.name ?? tm.team_id;
                      const isViewedTeam = tm.team_id === team.id;
                      const isConfirmingRemove = confirmRemoveTeamId === tm.team_id;

                      return (
                        <div key={tm.team_id} style={{
                          padding: '10px 12px', borderRadius: 8,
                          background: isViewedTeam ? 'var(--accent-tint)' : 'var(--paper-deep)',
                          border: '1px solid ' + (isViewedTeam ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'var(--line-soft)'),
                          display: 'flex', flexDirection: 'column', gap: 6,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{teamName}</span>
                            <span style={{
                              fontFamily: 'var(--mono)', fontSize: 10,
                              padding: '1px 6px', borderRadius: 4,
                              textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600,
                              background: tm.role === 'commander' ? 'var(--accent-tint)' : 'var(--card-soft)',
                              color: tm.role === 'commander' ? 'var(--accent-deep)' : 'var(--ink-soft)',
                            }}>
                              {tm.role}
                            </span>
                          </div>
                          {!isConfirmingRemove ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Button size="sm" variant="ghost"
                                      disabled={updateMembership.isPending || person.id === user?.id}
                                      onClick={() => toggleRole(tm.team_id, tm.role)}>
                                {tm.role === 'commander' ? 'Demote' : 'Promote to commander'}
                              </Button>
                              <Button size="sm" variant="ghost" icon="x"
                                      disabled={removeMembership.isPending || person.id === user?.id}
                                      onClick={() => setConfirmRemoveTeamId(tm.team_id)}
                                      style={{ color: 'var(--urgent-deep)', marginInlineStart: 'auto' }}>
                                Remove
                              </Button>
                            </div>
                          ) : (
                            <div style={{
                              padding: 8, borderRadius: 6,
                              background: 'var(--urgent-bg)', border: '1px solid var(--urgent)',
                              display: 'flex', flexDirection: 'column', gap: 6,
                            }}>
                              <div style={{ fontSize: 12, color: 'var(--urgent-deep)' }}>
                                Remove <b>{person.name}</b> from <b>{teamName}</b>?
                                {isViewedTeam && <> This will close this drawer.</>}
                              </div>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <Button size="sm" variant="ghost" onClick={() => setConfirmRemoveTeamId(null)}>Cancel</Button>
                                <Button size="sm" variant="urgent" icon="x"
                                        disabled={removeMembership.isPending}
                                        onClick={() => doRemoveFromTeam(tm.team_id)}>
                                  Confirm
                                </Button>
                              </div>
                            </div>
                          )}
                          {person.id === user?.id && (
                            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)' }}>
                              You can't modify your own membership.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <h4>Deployment windows
                  <span className="edit" onClick={() => setNewWinOpen((v) => !v)}>
                    {newWinOpen ? 'Cancel' : '+ New window'}
                  </span>
                </h4>
                {newWinOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBlockEnd: 10 }}>
                    <input className="input" placeholder="Label (e.g. Spring stretch)" value={nwLabel} onChange={(e) => setNwLabel(e.target.value)} />
                    <div className="form-grid">
                      <input className="input" type="date" value={nwStart} onChange={(e) => setNwStart(e.target.value)} />
                      <input className="input" type="date" value={nwEnd} onChange={(e) => setNwEnd(e.target.value)} />
                    </div>
                    <input className="input" placeholder="Notes (optional)" value={nwNotes} onChange={(e) => setNwNotes(e.target.value)} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <Button size="sm" variant="primary" icon="check"
                              disabled={!nwLabel.trim() || !nwStart || !nwEnd || nwEnd < nwStart || createWindow.isPending}
                              onClick={submitNewWindow}>
                        Open window
                      </Button>
                    </div>
                  </div>
                )}
                {(windows.data ?? []).length === 0 ? (
                  <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                    No deployment windows yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(windows.data ?? []).map((w) => (
                      <button key={w.id}
                              onClick={() => setOpeningWindow(w)}
                              style={{
                                appearance: 'none', font: 'inherit', textAlign: 'start',
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '8px 10px', borderRadius: 8,
                                background: 'var(--paper-deep)',
                                border: '1px solid var(--line-soft)',
                                cursor: 'pointer',
                                position: 'relative',
                              }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 13 }}>
                            {w.label}
                            {w.state === 'closed' && (
                              <span style={{
                                marginInlineStart: 6, fontFamily: 'var(--mono)', fontSize: 9.5,
                                background: 'var(--card-soft)', color: 'var(--ink-soft)',
                                padding: '1px 5px', borderRadius: 3,
                                textTransform: 'uppercase', letterSpacing: '.06em',
                              }}>CLOSED</span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                            {w.start_date} → {w.end_date} · {w.approved_count}✓ {w.proposed_count}◌ {w.rejected_count}✕
                          </div>
                        </div>
                        {w.proposed_count > 0 && w.state === 'open' && (
                          <span style={{
                            width: 8, height: 8, borderRadius: 99,
                            background: 'var(--urgent)',
                            boxShadow: '0 0 0 3px color-mix(in srgb, var(--urgent) 20%, transparent)',
                          }}/>
                        )}
                        <Icon name="chevRight" size={12} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <h4>Remove from division</h4>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5, marginBlockEnd: 10 }}>
                  Deletes the profile, skill assignments, and slot bookings. Activity entries authored by this member stay logged but anonymized. PRD §8.1 — full personal-data removal.
                </div>
                {!confirmDelete ? (
                  <Button size="sm" variant="outline"
                          icon="x"
                          disabled={person.id === user?.id}
                          onClick={() => setConfirmDelete(true)}
                          style={{ color: 'var(--urgent-deep)', borderColor: 'var(--urgent)' }}>
                    Remove {splitName(person.name).first}
                  </Button>
                ) : (
                  <div style={{
                    padding: 10, borderRadius: 8,
                    background: 'var(--urgent-bg)',
                    border: '1px solid var(--urgent)',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ fontSize: 12.5, color: 'var(--urgent-deep)' }}>
                      Permanently remove <b>{person.name}</b>? This cannot be undone.
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                      <Button size="sm" variant="urgent" icon="x"
                              disabled={remove.isPending}
                              onClick={doDelete}>
                        Confirm remove
                      </Button>
                    </div>
                  </div>
                )}
                {person.id === user?.id && (
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, fontFamily: 'var(--mono)' }}>
                    You can't remove yourself. Ask another commander.
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <h4>Service</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Joined</div>
                    <div style={{ marginTop: 3 }}>{person.joined ?? '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Call-ups (YTD)</div>
                    <div style={{ marginTop: 3, fontFamily: 'var(--serif)', fontSize: 22, lineHeight: 1 }}>{person.calls_this_year}</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'activity' && (
            <div className="drawer-section">
              <h4>Recent activity</h4>
              <div className="timeline">
                {recentActivity.map((it, i) => (
                  <div key={i} className="timeline-item">
                    <div className="timeline-dot" data-tone={it.dot}/>
                    <div className="timeline-content">
                      {it.body}
                      <span className="when">{it.when}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'reviews' && (
            <div className="drawer-section" style={{ paddingTop: 12 }}>
              <div style={{
                padding: '10px 12px', borderRadius: 7,
                background: 'var(--accent-tint)', color: 'var(--accent-ink)',
                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                fontSize: 12, lineHeight: 1.5,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <Icon name="eyeOff" size={14}/>
                <div>
                  Reviews not enabled in MVP v0. PRD §10 flagged this feature for legal/ethics review
                  before shipping.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
        {openingWindow && (
          <DeploymentWindowDrawer
            window={openingWindow}
            memberName={person.name}
            teamId={team.id}
            onClose={() => setOpeningWindow(null)}
            onToast={onToast}
          />
        )}
    </>
  );
}

function SkillEditor({
  held, catalog, busy, onSet, onRemove,
}: {
  held: { name: string; level: SkillLevel }[];
  catalog: string[];
  busy: boolean;
  onSet: (name: string, level: SkillLevel) => void;
  onRemove: (name: string) => void;
}) {
  const heldMap = new Map(held.map((s) => [s.name, s.level]));
  const missing = catalog.filter((n) => !heldMap.has(n));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {held.map((s) => (
        <div key={s.name} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 8px', borderRadius: 7,
          background: 'var(--paper-deep)', border: '1px solid var(--line-soft)',
        }}>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500 }}>{s.name}</span>
          <div className="filter-group" style={{ height: 28 }}>
            {SKILL_LEVELS.map((lvl) => (
              <button key={lvl} data-on={s.level === lvl ? '1' : '0'}
                      disabled={busy}
                      style={{ height: 22, padding: '0 8px', fontSize: 11 }}
                      onClick={() => s.level !== lvl && onSet(s.name, lvl)}>
                {SKILL_LEVEL_LABEL[lvl]}
              </button>
            ))}
          </div>
          <button className="action-btn"
                  disabled={busy}
                  onClick={() => onRemove(s.name)}
                  title="Remove">
            <Icon name="x" size={12}/>
          </button>
        </div>
      ))}
      {missing.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 6, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            Add skill
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {missing.map((name) => (
              <button key={name}
                      disabled={busy}
                      onClick={() => onSet(name, 'intermediate')}
                      style={{
                        appearance: 'none', font: 'inherit',
                        fontSize: 11, padding: '3px 8px', borderRadius: 4,
                        border: '1px dashed var(--line-strong)',
                        background: 'var(--card)',
                        color: 'var(--ink-2)',
                        cursor: 'pointer', fontWeight: 500,
                      }}>
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
