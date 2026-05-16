import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button, IconButton, SkillChip, StatusPill } from './atoms';
import { DeploymentWindowDrawer } from './DeploymentWindowDrawer';
import {
  SKILL_LEVELS, SKILL_LEVEL_LABEL, STATUS_LABEL,
  type DeploymentWindow, type Member, type SkillLevel, type Status,
} from '../lib/types';
import {
  useCreateDeploymentWindow, useDeleteMember, useMemberDeploymentWindows,
  usePromoteMember, useRemoveMemberSkill, useSetMemberSkill, useUpdateStatus,
} from '../lib/queries';
import { useAuth } from '../lib/auth';

interface Props {
  person: Member;
  allSkills: string[];
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function PersonDrawer({ person, allSkills, onClose, onToast }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = useState<'profile' | 'activity' | 'reviews'>('profile');
  const [editingStatus, setEditingStatus] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<Status>(person.status);
  const [note, setNote] = useState<string>(person.status_note ?? '');
  const [until, setUntil] = useState<string>(person.status_until ?? '');
  const updateStatus = useUpdateStatus();
  const promote = usePromoteMember();
  const remove = useDeleteMember();
  const setSkill = useSetMemberSkill();
  const removeSkill = useRemoveMemberSkill();
  const createWindow = useCreateDeploymentWindow();
  const windows = useMemberDeploymentWindows(person.id);
  const [openingWindow, setOpeningWindow] = useState<DeploymentWindow | null>(null);
  const [newWinOpen, setNewWinOpen] = useState(false);
  const [nwLabel, setNwLabel] = useState('');
  const [nwStart, setNwStart] = useState('');
  const [nwEnd, setNwEnd] = useState('');
  const [nwNotes, setNwNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);

  useEffect(() => {
    setTab('profile');
    setEditingStatus(false);
    setPendingStatus(person.status);
    setNote(person.status_note ?? '');
    setUntil(person.status_until ?? '');
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
      unitId: person.unit_id,
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
      unitId: person.unit_id,
    });
    onToast(`${person.name} removed from unit`);
    onClose();
  };

  const togglePromote = async () => {
    if (!user) return;
    await promote.mutateAsync({
      memberId: person.id,
      isCommander: !person.is_commander,
      actorId: user.id,
      actorName: user.name,
      memberName: person.name,
      unitId: person.unit_id,
    });
    onToast(person.is_commander ? `${person.name} demoted` : `${person.name} promoted to commander`);
  };

  const submitNewWindow = async () => {
    if (!user) return;
    try {
      await createWindow.mutateAsync({
        memberId: person.id, unitId: person.unit_id,
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

  return (
    <>
      <div className="drawer-overlay" data-open="1" onClick={onClose} />
      <div className="drawer" data-open="1" role="dialog" aria-label={person.name}>
        <div className="drawer-head">
          <Avatar initials={person.initials} tone={person.tone} status={person.status} size="xl" />
          <div className="drawer-head-meta">
            <h3 className="name">
              {person.name.split(' ')[0]} <em>{person.name.split(' ').slice(1).join(' ')}</em>
            </h3>
            {person.is_commander && (
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
              <Button variant="primary" size="sm" icon="phone" onClick={() => onToast(`Calling ${person.name}…`)}>Call</Button>
              <Button size="sm" icon="whatsapp" onClick={() => onToast(`Opening WhatsApp with ${person.name}…`)}>WhatsApp</Button>
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
                  <span>{person.phone.replace('+972 ', '0').replace(/-/g, ' ')}</span>
                  <IconButton icon="copy" tip="Copy" onClick={() => { navigator.clipboard?.writeText(person.phone); onToast('Phone copied'); }} />
                  <IconButton icon="whatsapp" tip="WhatsApp" tone="whatsapp" onClick={() => onToast(`Opening WhatsApp with ${person.name}…`)} />
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
                        memberId: person.id, unitId: person.unit_id,
                        skillName: name, level,
                        actorId: user.id, actorName: user.name, memberName: person.name,
                      }, { onSuccess: () => onToast(`${name} → ${SKILL_LEVEL_LABEL[level]}`) });
                    }}
                    onRemove={(name) => {
                      if (!user) return;
                      removeSkill.mutate({
                        memberId: person.id, unitId: person.unit_id,
                        skillName: name,
                        actorId: user.id, actorName: user.name, memberName: person.name,
                      }, { onSuccess: () => onToast(`Removed ${name}`) });
                    }}
                  />
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
                <h4>Permissions</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <div style={{ flex: 1 }}>
                    {person.is_commander
                      ? <>This member is a <b>commander</b> of this unit.</>
                      : <>This member is a <b>reservist</b> (no commander rights).</>}
                  </div>
                  <Button size="sm" variant={person.is_commander ? 'ghost' : 'outline'}
                          disabled={promote.isPending || person.id === user?.id}
                          onClick={togglePromote}>
                    {person.is_commander ? 'Demote' : 'Promote to commander'}
                  </Button>
                </div>
                {person.id === user?.id && (
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 6, fontFamily: 'var(--mono)' }}>
                    You can't demote yourself. Ask another commander.
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <h4>Remove from unit</h4>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5, marginBlockEnd: 10 }}>
                  Deletes the profile, skill assignments, and slot bookings. Activity entries authored by this member stay logged but anonymized. PRD §8.1 — full personal-data removal.
                </div>
                {!confirmDelete ? (
                  <Button size="sm" variant="outline"
                          icon="x"
                          disabled={person.id === user?.id}
                          onClick={() => setConfirmDelete(true)}
                          style={{ color: 'var(--urgent-deep)', borderColor: 'var(--urgent)' }}>
                    Remove {person.name.split(' ')[0]}
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
