import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button, IconButton, SkillChip, StatusPill } from './atoms';
import {
  findMemberConflicts, findDeploymentConflicts,
  type Member, type Slot,
} from '../lib/types';
import { useAssignToSlot, useUnassignFromSlot, useUpdateSlot, useUpdateSlotState } from '../lib/queries';
import { useAuth } from '../lib/auth';
import { fmtClock, isoDay } from '../lib/calendarUtils';
import { humanizeError } from '../lib/errors';
import { activate } from '../lib/a11y';
import { MS_PER_HOUR } from '../lib/constants';
import { getActiveMembers } from '../lib/members';

interface Props {
  slot: Slot;
  members: Member[];
  allSlots: Slot[];
  approvedPicks: { member_id: string; date: string }[];
  teamId: string;
  onClose: () => void;
  onClone: (slot: Slot) => void;
  onToast: (msg: string) => void;
}

// Local date/time helpers — value-binding for native date/time inputs needs local strings.
const isoToLocalDate = (iso: string): string => isoDay(new Date(iso));
const isoToLocalTime = (iso: string): string => fmtClock(iso);

export function SlotDrawer({ slot, members, allSlots, approvedPicks, teamId, onClose, onClone, onToast }: Props) {
  const { user } = useAuth();
  const assign = useAssignToSlot();
  const unassign = useUnassignFromSlot();
  const updateState = useUpdateSlotState();
  const updateSlot = useUpdateSlot();
  const [picking, setPicking] = useState(false);
  const [pickId, setPickId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  // Edit form state — seeded from slot when entering edit mode.
  const [eTitle, setETitle] = useState(slot.title);
  const [eUrgent, setEUrgent] = useState(slot.urgent);
  const [eDate, setEDate] = useState(isoToLocalDate(slot.start_at));
  const [eStart, setEStart] = useState(isoToLocalTime(slot.start_at));
  const [eEnd, setEEnd] = useState(slot.end_at ? isoToLocalTime(slot.end_at) : isoToLocalTime(slot.start_at));
  const [eLocation, setELocation] = useState(slot.location ?? '');

  const canEdit = slot.state === 'draft' || slot.state === 'published';

  // Seed when entering edit mode (or when slot identity changes mid-edit).
  useEffect(() => {
    if (!editing) return;
    setETitle(slot.title);
    setEUrgent(slot.urgent);
    setEDate(isoToLocalDate(slot.start_at));
    setEStart(isoToLocalTime(slot.start_at));
    setEEnd(slot.end_at ? isoToLocalTime(slot.end_at) : isoToLocalTime(slot.start_at));
    setELocation(slot.location ?? '');
  }, [editing, slot.id]);

  // Esc closes edit/picking before the drawer (Dashboard owns final drawer close).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) { e.stopPropagation(); setEditing(false); }
      else if (picking) { e.stopPropagation(); setPicking(false); setPickId(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editing, picking]);

  const assignee = useMemo(
    () => slot.assignee_id ? members.find((m) => m.id === slot.assignee_id) ?? null : null,
    [slot.assignee_id, members],
  );
  const candidates = useMemo(() => {
    return getActiveMembers(members).filter((m) => m.id !== slot.assignee_id);
  }, [members, slot.assignee_id]);

  const commitAssign = async () => {
    if (!user || !pickId) { setPicking(false); return; }
    const m = members.find((x) => x.id === pickId);
    if (!m) return;
    try {
      await assign.mutateAsync({
        slotId: slot.id,
        memberId: pickId,
        assignedBy: user.id,
        teamId,
        actorName: user.name,
        slotTitle: slot.title,
        memberName: m.name,
      });
    } catch (err) {
      onToast(humanizeError(err, 'Failed to assign'));
      return;
    }
    setPickId(null);
    setPicking(false);
    onToast(`Assigned ${m.name}`);
  };

  const doUnassign = async (m: Member) => {
    if (!user) return;
    try {
      await unassign.mutateAsync({
        slotId: slot.id, memberId: m.id, actorId: user.id,
        teamId, actorName: user.name,
        slotTitle: slot.title, memberName: m.name,
      });
    } catch (err) {
      onToast(humanizeError(err, 'Failed to unassign'));
      return;
    }
    onToast(`Unassigned ${m.name}`);
  };

  const setState = async (state: 'completed' | 'cancelled' | 'published') => {
    if (!user) return;
    try {
      await updateState.mutateAsync({
        slotId: slot.id, state, actorId: user.id, teamId,
        actorName: user.name, slotTitle: slot.title,
        assigneeId: slot.assignee_id,
      });
    } catch (err) {
      onToast(humanizeError(err, 'Failed to update slot state'));
      return;
    }
    if (state === 'published') {
      onToast(`Published "${slot.title}"`);
    } else {
      onToast(state === 'cancelled' ? 'Slot cancelled' : 'Slot marked complete');
      onClose();
    }
  };

  const saveEdit = async () => {
    if (!user) return;
    const startD = new Date(`${eDate}T${eStart}:00`);
    const endD = new Date(`${eDate}T${eEnd}:00`);
    if (endD <= startD) endD.setDate(endD.getDate() + 1);
    const hrs = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / MS_PER_HOUR));

    try {
      await updateSlot.mutateAsync({
        slotId: slot.id,
        teamId,
        patch: {
          title: eTitle.trim() || slot.title,
          urgent: eUrgent,
          startAt: startD.toISOString(),
          endAt: endD.toISOString(),
          duration: `${hrs}h`,
          location: eLocation.trim() ? eLocation.trim() : null,
        },
        actorId: user.id,
        actorName: user.name,
        assigneeId: slot.assignee_id,
        slotTitle: slot.title,
      });
    } catch (err) {
      onToast(humanizeError(err, 'Failed to save'));
      return;
    }
    setEditing(false);
    onToast('Slot updated');
  };

  const stateBadge: Record<string, { bg: string; color: string }> = {
    draft:     { bg: 'var(--card-soft)',  color: 'var(--ink-soft)' },
    published: { bg: 'var(--accent-tint)', color: 'var(--accent-deep)' },
    completed: { bg: 'var(--st-rel-bg)',   color: 'var(--st-rel)' },
    cancelled: { bg: 'var(--urgent-bg)',   color: 'var(--urgent-deep)' },
  };

  return (
    <>
      <div className="drawer-overlay" data-open="1" onClick={onClose} />
      <div className="drawer" data-open="1" role="dialog" aria-label={slot.title}>
        <div className="drawer-head" style={{ background: slot.urgent ? 'var(--urgent-bg)' : 'var(--card-soft)' }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: slot.urgent ? 'var(--urgent)' : 'var(--accent)',
            color: '#FFF7F1',
            display: 'grid', placeItems: 'center',
            flexShrink: 0,
          }}>
            <Icon name={slot.urgent ? 'urgent' : 'slots'} size={26} />
          </div>
          <div className="drawer-head-meta">
            <h3 className="name">{slot.title}</h3>
            <div className="role-line" style={{ flexWrap: 'wrap' }}>
              {slot.urgent && <span className="urgent-flag" style={{ position: 'static' }}>
                <Icon name="urgent" size={10}/> Urgent
              </span>}
              <span style={{
                fontFamily: 'var(--mono)', fontSize: 10,
                padding: '1px 6px', borderRadius: 4,
                textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600,
                background: stateBadge[slot.state].bg, color: stateBadge[slot.state].color,
              }}>{slot.state}</span>
              {canEdit && !editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  aria-label="Edit slot"
                  style={{
                    appearance: 'none', border: 0, background: 'transparent',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    color: 'var(--accent-deep)', cursor: 'pointer',
                    font: 'inherit', fontSize: 11.5, fontWeight: 500,
                    paddingInline: 4, paddingBlock: 2,
                  }}>
                  <Icon name="edit" size={11} /> Edit
                </button>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--ink-soft)' }}>
              <Icon name="calendar" size={12} style={{ display: 'inline', verticalAlign: -1, marginInlineEnd: 4 }} />
              {new Date(slot.start_at).toLocaleString()}
              {slot.duration && <> · <Icon name="clock" size={12} style={{ display: 'inline', verticalAlign: -1, marginInlineEnd: 2 }} />{slot.duration}</>}
              {slot.location && <> · <Icon name="pin" size={12} style={{ display: 'inline', verticalAlign: -1, marginInlineEnd: 2 }} />{slot.location}</>}
            </div>
          </div>
          <button className="action-btn" onClick={onClose} aria-label="Close" style={{ alignSelf: 'flex-start' }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="drawer-body">
          {editing ? (
            <div className="drawer-section">
              <h4>Edit slot</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-row">
                  <label>Title</label>
                  <input className="input" value={eTitle} onChange={(e) => setETitle(e.target.value)} />
                </div>

                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5,
                  color: 'var(--ink-soft)', cursor: 'pointer',
                }}>
                  <input type="checkbox" checked={eUrgent} onChange={(e) => setEUrgent(e.target.checked)} />
                  Mark as urgent
                </label>

                <div className="form-grid">
                  <div className="form-row">
                    <label>Date</label>
                    <input className="input" type="date" value={eDate} onChange={(e) => setEDate(e.target.value)} />
                  </div>
                  <div className="form-row">
                    <label>Location</label>
                    <input className="input" value={eLocation}
                           placeholder="Base or staging area"
                           onChange={(e) => setELocation(e.target.value)} />
                  </div>
                  <div className="form-row">
                    <label>Start time</label>
                    <input className="input" type="time" value={eStart} onChange={(e) => setEStart(e.target.value)} />
                  </div>
                  <div className="form-row">
                    <label>End time</label>
                    <input className="input" type="time" value={eEnd} onChange={(e) => setEEnd(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button size="sm" variant="primary" icon="check"
                          disabled={updateSlot.isPending}
                          onClick={saveEdit}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="drawer-section">
                <h4>
                  Assigned
                  {slot.state === 'published' && !assignee && (
                    <span className="edit" {...activate(() => setPicking((v) => !v))}>
                      {picking ? 'Cancel' : '+ Assign'}
                    </span>
                  )}
                  {slot.state === 'published' && assignee && (
                    <span className="edit" {...activate(() => doUnassign(assignee))}>
                      Unassign
                    </span>
                  )}
                </h4>
                {!assignee && !picking && (
                  <div style={{ color: 'var(--ink-soft)', fontSize: 12.5, fontStyle: 'italic' }}>
                    Unassigned.
                  </div>
                )}
                {assignee && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 7,
                    background: 'var(--paper-deep)',
                    border: '1px solid var(--line-soft)',
                  }}>
                    <Avatar initials={assignee.initials} tone={assignee.tone} size="sm" status={assignee.status}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{assignee.name}</div>
                      {assignee.skills.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {assignee.skills.map((sk) => (
                            <SkillChip key={sk.name} name={sk.name} level={sk.level} />
                          ))}
                        </div>
                      )}
                    </div>
                    <StatusPill status={assignee.status} />
                    {slot.state === 'published' && (
                      <IconButton icon="x" tip="Unassign" onClick={() => doUnassign(assignee)} />
                    )}
                  </div>
                )}

                {picking && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', margin: '8px 0 6px' }}>
                      {candidates.length} available
                    </div>
                    <div className="who-grid">
                      {candidates.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', padding: 12, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12.5 }}>
                          No reservists match.
                        </div>
                      )}
                      {candidates.map((m) => {
                        const slotConflicts = findMemberConflicts(m.id, slot.start_at, slot.end_at, allSlots, slot.id);
                        const deployConflicts = findDeploymentConflicts(m.id, slot.start_at, slot.end_at, approvedPicks);
                        const totalConflicts = slotConflicts.length + deployConflicts.length;
                        const slotTitles = slotConflicts.map((c) => `Already on: ${c.title}`);
                        const deployTitles = deployConflicts.map((c) => `Deployment pick on ${c.date}`);
                        const tooltipText = totalConflicts
                          ? [...slotTitles, ...deployTitles].join('; ')
                          : undefined;
                        return (
                          <div key={m.id} className="who-card"
                               data-on={pickId === m.id ? '1' : '0'}
                               onClick={() => setPickId(pickId === m.id ? null : m.id)}
                               title={tooltipText}
                               style={totalConflicts ? { borderColor: 'var(--urgent)' } : undefined}>
                            <Avatar initials={m.initials} tone={m.tone} size="sm" status={m.status}/>
                            <span className="nm">{m.name}</span>
                            {m.skills.length > 0 && (
                              <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 3 }}>
                                {m.skills.slice(0, 2).map((sk) => (
                                  <SkillChip key={sk.name} name={sk.name} level={sk.level} />
                                ))}
                              </span>
                            )}
                            {totalConflicts > 0 && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                fontSize: 10, fontFamily: 'var(--mono)',
                                color: 'var(--urgent-deep)',
                                background: 'var(--urgent-bg)',
                                padding: '1px 5px', borderRadius: 4,
                                letterSpacing: '.04em', textTransform: 'uppercase', fontWeight: 600,
                              }}>
                                <Icon name="urgent" size={9} /> {totalConflicts}
                              </span>
                            )}
                            <StatusPill status={m.status}/>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <Button size="sm" variant="ghost" onClick={() => { setPicking(false); setPickId(null); }}>Cancel</Button>
                      <Button size="sm" variant="primary" icon="check"
                              disabled={!pickId || assign.isPending}
                              onClick={commitAssign}>
                        Assign
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="drawer-section">
                <h4>Actions</h4>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {slot.state === 'draft' && (
                    <Button size="sm" variant="primary" icon="check"
                            disabled={updateState.isPending}
                            onClick={() => setState('published')}>
                      Publish
                    </Button>
                  )}
                  {slot.state === 'published' && (
                    <Button size="sm" variant="outline" icon="check"
                            disabled={updateState.isPending}
                            onClick={() => setState('completed')}>
                      Mark complete
                    </Button>
                  )}
                  <Button size="sm" variant="outline" icon="copy"
                          onClick={() => onClone(slot)}>
                    Clone
                  </Button>
                  {(slot.state === 'published' || slot.state === 'draft') && (
                    <Button size="sm" variant="ghost" icon="x"
                            disabled={updateState.isPending}
                            onClick={() => setState('cancelled')}
                            style={{ color: 'var(--urgent-deep)' }}>
                      Cancel slot
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
