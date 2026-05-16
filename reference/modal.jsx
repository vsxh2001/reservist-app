// New duty slot modal — also supports urgent call-up flag (PRD §7.5).

function NewSlotModal({ open, urgent: defaultUrgent, members, preselected, onClose, onPublish }) {
  const [urgent, setUrgent] = React.useState(!!defaultUrgent);
  const [title, setTitle] = React.useState(defaultUrgent ? 'Northern QRF — Sector 4' : '');
  const [date, setDate] = React.useState('2026-05-21');
  const [start, setStart] = React.useState('22:00');
  const [end, setEnd] = React.useState('06:00');
  const [location, setLocation] = React.useState(defaultUrgent ? 'Tzomet Bilu staging' : '');
  const [role, setRole] = React.useState(defaultUrgent ? 'Rifleman' : '');
  const [skills, setSkills] = React.useState(defaultUrgent ? ['Night Ops'] : []);
  const [needed, setNeeded] = React.useState(defaultUrgent ? 6 : 3);
  const [picked, setPicked] = React.useState(preselected || []);

  React.useEffect(() => {
    if (open) {
      setUrgent(!!defaultUrgent);
      setTitle(defaultUrgent ? 'Northern QRF — Sector 4' : '');
      setLocation(defaultUrgent ? 'Tzomet Bilu staging' : '');
      setRole(defaultUrgent ? 'Rifleman' : '');
      setSkills(defaultUrgent ? ['Night Ops'] : []);
      setNeeded(defaultUrgent ? 6 : 3);
      setPicked(preselected || []);
    }
  }, [open, defaultUrgent, preselected]);

  if (!open) return null;

  // suggest candidates: available + role match + skills match
  const candidates = members.filter((m) => {
    if (m.status !== 'available' && m.status !== 'standby') return false;
    if (role && m.role !== role) return false;
    if (skills.length && !skills.every((s) => m.skills.includes(s))) return false;
    return true;
  }).sort((a, b) => {
    // Available before standby
    if (a.status !== b.status) return a.status === 'available' ? -1 : 1;
    // More skill matches first
    const sa = skills.filter((s) => a.skills.includes(s)).length;
    const sb = skills.filter((s) => b.skills.includes(s)).length;
    return sb - sa || a.name.localeCompare(b.name);
  });

  const toggle = (id) => {
    setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };

  const toggleSkill = (s) => {
    setSkills((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);
  };

  const SkillChips = () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {window.SKILLS.map((s) => (
        <button key={s} onClick={() => toggleSkill(s)}
                style={{
                  appearance: 'none', font: 'inherit',
                  fontSize: 11, padding: '3px 8px', borderRadius: 4,
                  border: '1px solid ' + (skills.includes(s) ? 'var(--accent)' : 'var(--line)'),
                  background: skills.includes(s) ? 'var(--accent-tint)' : 'var(--card)',
                  color: skills.includes(s) ? 'var(--accent-deep)' : 'var(--ink-2)',
                  cursor: 'pointer', fontWeight: 500,
                }}>
          {s}
        </button>
      ))}
    </div>
  );

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
            <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--ink-soft)', cursor: 'pointer' }}>
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
              <input className="input" type="date" value={date}
                     onChange={(e) => setDate(e.target.value)} />
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

          <div className="form-grid">
            <div className="form-row">
              <label>Required role</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">— Any role —</option>
                {window.ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-row">
              <label>People needed</label>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                border: '1px solid var(--line-strong)', borderRadius: 7,
                background: 'var(--card)', height: 34, padding: '0 6px',
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
          </div>

          <div className="form-row">
            <label>Required skills</label>
            <SkillChips />
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
              {candidates.map((m) => (
                <div key={m.id} className="who-card"
                     data-on={picked.includes(m.id) ? '1' : '0'}
                     onClick={() => toggle(m.id)}>
                  <Avatar initials={m.initials} tone={m.tone} size="sm" status={m.status}/>
                  <span className="nm">{m.name}</span>
                  <StatusPill status={m.status}/>
                </div>
              ))}
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
            <Button variant="outline" onClick={() => onPublish('draft', { title, date, start, end, location, role, skills, needed, picked, urgent })}>
              Save draft
            </Button>
          )}
          <Button variant={urgent ? 'urgent' : 'primary'}
                  icon={urgent ? 'radio' : 'check'}
                  onClick={() => onPublish('publish', { title, date, start, end, location, role, skills, needed, picked, urgent })}>
            {urgent ? 'Publish & notify all' : 'Publish slot'}
          </Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewSlotModal });
