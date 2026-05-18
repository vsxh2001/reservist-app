import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button, SkillChip, StatusPill } from './atoms';
import {
  findMemberConflicts, findDeploymentConflicts,
  type Member, type Slot,
} from '../lib/types';
import { useCreateSlot } from '../lib/queries';
import { useAuth } from '../lib/auth';
import { fmtClock, isoDay } from '../lib/calendarUtils';

interface Props {
  open: boolean;
  urgent: boolean;
  members: Member[];
  slots: Slot[];
  approvedPicks: { member_id: string; date: string }[];
  teamId: string;
  /** Member ID to preselect as the slot's assignee, or null for "no one yet". */
  preselected: string | null;
  cloneFrom?: Slot | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export function NewSlotModal({
  open, urgent: defaultUrgent, members, slots, approvedPicks, teamId,
  preselected, cloneFrom, onClose, onToast,
}: Props) {
  const { user } = useAuth();
  const createSlot = useCreateSlot();
  const [urgent, setUrgent] = useState(defaultUrgent);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('2026-05-21');
  const [start, setStart] = useState('22:00');
  const [end, setEnd] = useState('06:00');
  const [location, setLocation] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(preselected);

  useEffect(() => {
    if (!open) return;
    if (cloneFrom) {
      setUrgent(cloneFrom.urgent);
      setTitle(cloneFrom.title);
      setLocation(cloneFrom.location ?? '');
      const startD = new Date(cloneFrom.start_at);
      const endD = cloneFrom.end_at ? new Date(cloneFrom.end_at) : new Date(startD.getTime() + 3600_000);
      const today = new Date();
      // Keep time-of-day, shift date to today so the clone is forward-dated by default.
      setDate(isoDay(today));
      setStart(fmtClock(startD));
      setEnd(fmtClock(endD));
      setPickedId(preselected);
      return;
    }
    setUrgent(defaultUrgent);
    setTitle(defaultUrgent ? 'Northern QRF — Sector 4' : '');
    setLocation(defaultUrgent ? 'Tzomet Bilu staging' : '');
    setPickedId(preselected);
  }, [open, defaultUrgent, preselected, cloneFrom]);

  if (!open) return null;

  // Show every active member, sorted by status then name. Skills are shown for
  // the commander's reference; selection is not constrained.
  const candidates = members
    .filter((m) => (m.status === 'available' || m.status === 'standby'))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'available' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const submit = async (state: 'draft' | 'published') => {
    if (!user) return;
    const startAt = new Date(`${date}T${start}:00`).toISOString();
    const startD = new Date(`${date}T${start}:00`);
    const endD = new Date(`${date}T${end}:00`);
    if (endD <= startD) endD.setDate(endD.getDate() + 1);
    const endAt = endD.toISOString();
    const hrs = Math.round((endD.getTime() - startD.getTime()) / 3600000);

    try {
      await createSlot.mutateAsync({
        teamId,
        title: title || (urgent ? 'Urgent call-up' : 'New duty slot'),
        urgent,
        state,
        startAt,
        endAt,
        duration: `${hrs}h`,
        location: location || null,
        assigneeId: pickedId,
        createdBy: user.id,
        actorName: user.name,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onToast(`Failed to create slot: ${message}`);
      return;
    }
    onClose();
    onToast(
      state === 'draft'
        ? 'Slot saved as draft'
        : urgent
          ? `Urgent call-up published — notified ${members.length}`
          : pickedId
            ? 'Slot published — assignee notified'
            : 'Slot published — unassigned',
    );
  };

  return (
    <div className="modal-overlay" data-open="1" onClick={onClose}>
      <div className="modal" data-urgent={urgent ? '1' : '0'} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{urgent ? <>Urgent <em>call-up</em></> : <>New <em>duty slot</em></>}</h2>
          {urgent ? (
            <span className="urgent-flag">
              <Icon name="urgent" size={10}/> Urgent
            </span>
          ) : (
            <label style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-soft)', cursor: 'pointer' }}>
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
              Mark as urgent
            </label>
          )}
          <button className="action-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14}/>
          </button>
        </div>

        <div className="modal-body">
          <div className="form-row">
            <label>Title</label>
            <input className="input" value={title}
                   placeholder="e.g. Outpost rotation — Bravo"
                   onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="form-grid">
            <div className="form-row">
              <label>Date</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Location</label>
              <input className="input" value={location}
                     placeholder="Base or staging area"
                     onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="form-row">
              <label>Start time</label>
              <input className="input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="form-row">
              <label>End time</label>
              <input className="input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="form-row">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Assign reservist</span>
              <span style={{ color: 'var(--ink-soft)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                {pickedId ? '1 picked' : 'none picked'} · {candidates.length} available
              </span>
            </label>
            <div className="who-grid">
              {candidates.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 12, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12.5 }}>
                  No available reservists.
                </div>
              )}
              {(() => {
                const startAtISO = (() => { try { return new Date(`${date}T${start}:00`).toISOString(); } catch { return null; } })();
                const endAtISO = (() => {
                  try {
                    const sd = new Date(`${date}T${start}:00`);
                    const ed = new Date(`${date}T${end}:00`);
                    if (ed <= sd) ed.setDate(ed.getDate() + 1);
                    return ed.toISOString();
                  } catch { return null; }
                })();
                return candidates.map((m) => {
                  const slotConflicts = startAtISO && endAtISO
                    ? findMemberConflicts(m.id, startAtISO, endAtISO, slots)
                    : [];
                  const deployConflicts = startAtISO
                    ? findDeploymentConflicts(m.id, startAtISO, endAtISO, approvedPicks)
                    : [];
                  const totalConflicts = slotConflicts.length + deployConflicts.length;
                  const slotTitles = slotConflicts.map((c) => `Already on: ${c.title}`);
                  const deployTitles = deployConflicts.map((c) => `Deployment pick on ${c.date}`);
                  const tooltipText = totalConflicts
                    ? [...slotTitles, ...deployTitles].join('; ')
                    : undefined;
                  return (
                    <div key={m.id} className="who-card"
                         data-on={pickedId === m.id ? '1' : '0'}
                         onClick={() => setPickedId(pickedId === m.id ? null : m.id)}
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
                });
              })()}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <div className="left">
            {urgent
              ? <><b style={{ color: 'var(--urgent-deep)' }}>Urgent flag on.</b> Push notification sent to everyone in the team.</>
              : <>The assignee will get a push notification. They cannot decline (v1).</>}
          </div>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!urgent && (
            <Button variant="outline" disabled={createSlot.isPending} onClick={() => submit('draft')}>
              Save draft
            </Button>
          )}
          <Button variant={urgent ? 'urgent' : 'primary'}
                  icon={urgent ? 'radio' : 'check'}
                  disabled={createSlot.isPending}
                  onClick={() => submit('published')}>
            {urgent ? 'Publish & notify all' : 'Publish slot'}
          </Button>
        </div>
      </div>
    </div>
  );
}
