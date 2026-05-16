import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button, SkillChip, StatusPill } from './atoms';
import {
  SKILL_LEVELS, SKILL_LEVEL_LABEL,
  memberMatchesAllSkillReqs, meetsSkillReq,
  findMemberConflicts, findDeploymentConflicts,
  type Member, type SkillLevel, type Slot, type SlotSkill,
} from '../lib/types';
import { useCreateSlot } from '../lib/queries';
import { useAuth } from '../lib/auth';

interface Props {
  open: boolean;
  urgent: boolean;
  members: Member[];
  skills: string[];
  slots: Slot[];
  approvedPicks: { member_id: string; date: string }[];
  unitId: string;
  preselected: string[];
  cloneFrom?: Slot | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

type SkillReqMap = Record<string, SkillLevel | undefined>;

const cycleNext = (cur: SkillLevel | undefined): SkillLevel | undefined => {
  if (cur === undefined) return 'junior';
  const i = SKILL_LEVELS.indexOf(cur);
  return i === SKILL_LEVELS.length - 1 ? undefined : SKILL_LEVELS[i + 1];
};

export function NewSlotModal({
  open, urgent: defaultUrgent, members, skills: allSkills, slots, approvedPicks, unitId,
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
  const [skillReqs, setSkillReqs] = useState<SkillReqMap>({});
  const [needed, setNeeded] = useState(3);
  const [picked, setPicked] = useState<string[]>(preselected);

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
      setDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
      setStart(`${String(startD.getHours()).padStart(2, '0')}:${String(startD.getMinutes()).padStart(2, '0')}`);
      setEnd(`${String(endD.getHours()).padStart(2, '0')}:${String(endD.getMinutes()).padStart(2, '0')}`);
      const reqs: SkillReqMap = {};
      for (const s of cloneFrom.skills) reqs[s.name] = s.min_level;
      setSkillReqs(reqs);
      setNeeded(cloneFrom.needed);
      setPicked(preselected);
      return;
    }
    setUrgent(defaultUrgent);
    setTitle(defaultUrgent ? 'Northern QRF — Sector 4' : '');
    setLocation(defaultUrgent ? 'Tzomet Bilu staging' : '');
    setSkillReqs(defaultUrgent ? { 'Night Ops': 'intermediate' } : {});
    setNeeded(defaultUrgent ? 6 : 3);
    setPicked(preselected);
  }, [open, defaultUrgent, preselected, cloneFrom]);

  if (!open) return null;

  const requiredSkills: SlotSkill[] = Object.entries(skillReqs)
    .filter(([, lvl]) => lvl !== undefined)
    .map(([name, min_level]) => ({ name, min_level: min_level as SkillLevel }));

  const candidates = members
    .filter((m) => (m.status === 'available' || m.status === 'standby'))
    .filter((m) => memberMatchesAllSkillReqs(m.skills, requiredSkills))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'available' ? -1 : 1;
      const seniorA = requiredSkills.filter((r) => meetsSkillReq(a.skills, { name: r.name, min_level: 'senior' })).length;
      const seniorB = requiredSkills.filter((r) => meetsSkillReq(b.skills, { name: r.name, min_level: 'senior' })).length;
      return seniorB - seniorA || a.name.localeCompare(b.name);
    });

  const toggle = (id: string) => {
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };
  const cycleSkill = (s: string) => {
    setSkillReqs((p) => ({ ...p, [s]: cycleNext(p[s]) }));
  };

  const submit = async (state: 'draft' | 'published') => {
    if (!user) return;
    const startAt = new Date(`${date}T${start}:00`).toISOString();
    const startD = new Date(`${date}T${start}:00`);
    const endD = new Date(`${date}T${end}:00`);
    if (endD <= startD) endD.setDate(endD.getDate() + 1);
    const endAt = endD.toISOString();
    const hrs = Math.round((endD.getTime() - startD.getTime()) / 3600000);

    await createSlot.mutateAsync({
      unitId,
      title: title || (urgent ? 'Urgent call-up' : 'New duty slot'),
      urgent,
      state,
      startAt,
      endAt,
      duration: `${hrs}h`,
      location: location || null,
      skills: requiredSkills,
      needed,
      assigneeIds: picked,
      createdBy: user.id,
      actorName: user.name,
    });
    onClose();
    onToast(
      state === 'draft'
        ? 'Slot saved as draft'
        : urgent
          ? `Urgent call-up published — notified ${members.length}`
          : `Slot published — notified ${picked.length}`,
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
            <label>People needed</label>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              border: '1px solid var(--line-strong)', borderRadius: 7,
              background: 'var(--card)', height: 34, padding: '0 6px',
              maxInlineSize: 180,
            }}>
              <button className="action-btn" style={{ background: 'transparent', border: 0 }}
                      onClick={() => setNeeded(Math.max(1, needed - 1))}>
                <Icon name="minus" size={12} />
              </button>
              <div style={{ flex: 1, textAlign: 'center', fontFamily: 'var(--serif)', fontSize: 18 }}>
                {needed}
              </div>
              <button className="action-btn" style={{ background: 'transparent', border: 0 }}
                      onClick={() => setNeeded(needed + 1)}>
                <Icon name="plus" size={12} />
              </button>
            </div>
          </div>

          <div className="form-row">
            <label>
              Required skills
              <span style={{ marginInlineStart: 8, color: 'var(--ink-soft)', fontSize: 11, fontWeight: 400 }}>
                tap to cycle: off → ≥ Junior → ≥ Intermediate → ≥ Senior
              </span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allSkills.map((s) => {
                const lvl = skillReqs[s];
                const on = lvl !== undefined;
                return (
                  <button key={s} onClick={() => cycleSkill(s)} aria-pressed={on} style={{
                    appearance: 'none', font: 'inherit',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 11.5, padding: '4px 9px', borderRadius: 5,
                    border: '1px solid ' + (on ? 'var(--accent)' : 'var(--line)'),
                    background: on ? 'var(--accent-tint)' : 'var(--card)',
                    color: on ? 'var(--accent-deep)' : 'var(--ink-2)',
                    cursor: 'pointer', fontWeight: 500,
                  }}>
                    <span>{s}</span>
                    <span style={{
                      fontSize: 10, fontFamily: 'var(--mono)',
                      letterSpacing: '.04em',
                      opacity: on ? 1 : 0.55,
                    }}>
                      {on ? `≥ ${SKILL_LEVEL_LABEL[lvl!]}` : 'off'}
                    </span>
                  </button>
                );
              })}
            </div>
            {requiredSkills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBlockStart: 8 }}>
                {requiredSkills.map((r) => (
                  <SkillChip key={r.name} name={r.name} min_level={r.min_level} />
                ))}
              </div>
            )}
          </div>

          <div className="form-row">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Assign reservists</span>
              <span style={{ color: 'var(--ink-soft)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                {picked.length} / {needed} picked · {candidates.length} match
              </span>
            </label>
            <div className="who-grid">
              {candidates.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: 12, textAlign: 'center', color: 'var(--ink-soft)', fontSize: 12.5 }}>
                  No available reservists match the filters above.
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
                         data-on={picked.includes(m.id) ? '1' : '0'}
                         onClick={() => toggle(m.id)}
                         title={tooltipText}
                         style={totalConflicts ? { borderColor: 'var(--urgent)' } : undefined}>
                      <Avatar initials={m.initials} tone={m.tone} size="sm" status={m.status}/>
                      <span className="nm">{m.name}</span>
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
              ? <><b style={{ color: 'var(--urgent-deep)' }}>Urgent flag on.</b> Push notification sent to everyone in the unit.</>
              : <>Assignees will get a push notification. They cannot decline (v1).</>}
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
