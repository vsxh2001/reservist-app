// Person detail drawer.
// Profile, status edit, contact, recent activity, private commander reviews.

function PersonDrawer({ person, onClose, onUpdate, onToast }) {
  const [tab, setTab] = React.useState('profile');
  const [editingStatus, setEditingStatus] = React.useState(false);

  React.useEffect(() => { setTab('profile'); setEditingStatus(false); }, [person?.id]);

  if (!person) return null;

  const setStatus = (s) => {
    onUpdate({ ...person, status: s });
    setEditingStatus(false);
    onToast(`Status set to ${window.STATUS_LABEL[s]}`);
  };

  const recentActivity = [
    { dot: 'accent', body: <><b>Assigned</b> to Outpost Rotation by Daniel Katz</>, when: '2h ago' },
    { dot: null,     body: <>Set status to <b>{window.STATUS_LABEL[person.status]}</b></>, when: '4h ago' },
    { dot: 'accent', body: <>Completed slot <b>Sector 7 patrol</b></>, when: 'May 11' },
    { dot: null,     body: <>Skill added: <b>Night Ops</b></>, when: 'Apr 22' },
    { dot: null,     body: <>Joined the unit</>, when: person.joined },
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
            <div className="role-line">
              <RoleGlyph role={person.role} />
              <b>{person.role}</b>
              {person.isCommander && (
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  background: 'var(--accent-tint)', color: 'var(--accent-deep)',
                  padding: '1px 6px', borderRadius: 4,
                  textTransform: 'uppercase', letterSpacing: '.06em',
                  fontWeight: 600,
                }}>COMMANDER</span>
              )}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <Button variant="primary" size="sm" icon="phone"
                      onClick={() => onToast(`Calling ${person.name}…`)}>
                Call
              </Button>
              <Button size="sm" icon="whatsapp"
                      onClick={() => onToast(`Opening WhatsApp with ${person.name}…`)}>
                WhatsApp
              </Button>
              <Button size="sm" variant="ghost" icon="copy"
                      onClick={() => { navigator.clipboard?.writeText(person.phone); onToast('Phone copied'); }}/>
            </div>
          </div>
          <button className="action-btn" onClick={onClose} aria-label="Close" style={{ alignSelf: 'flex-start' }}>
            <Icon name="x" size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--line-soft)',
          padding: '0 18px', gap: 4,
        }}>
          {['profile', 'activity', 'reviews'].map((t) => (
            <button key={t}
                    onClick={() => setTab(t)}
                    style={{
                      appearance: 'none', border: 0, background: 'transparent',
                      font: 'inherit', fontSize: 12.5, fontWeight: 500,
                      padding: '10px 12px',
                      color: tab === t ? 'var(--ink)' : 'var(--ink-soft)',
                      borderBottom: '2px solid ' + (tab === t ? 'var(--accent)' : 'transparent'),
                      marginBottom: -1, cursor: 'pointer',
                      letterSpacing: '-.005em',
                      textTransform: 'capitalize',
                    }}>
              {t}
              {t === 'reviews' && <span style={{
                marginLeft: 4, fontFamily: 'var(--mono)',
                fontSize: 10.5, color: 'var(--ink-mute)',
              }}>2</span>}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'profile' && (
            <ProfileTab person={person}
                        editingStatus={editingStatus}
                        setEditingStatus={setEditingStatus}
                        setStatus={setStatus} />
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
          {tab === 'reviews' && <ReviewsTab person={person} onToast={onToast} />}
        </div>
      </div>
    </>
  );
}

function ProfileTab({ person, editingStatus, setEditingStatus, setStatus }) {
  return (
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
              {person.statusNote || <span style={{ fontStyle: 'italic' }}>No note</span>}
              {person.statusUntil && <> · <b>until {person.statusUntil}</b></>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {['available', 'standby', 'released', 'unavailable'].map((s) => (
              <button key={s}
                      onClick={() => setStatus(s)}
                      style={{
                        appearance: 'none', border: '1px solid var(--line-strong)',
                        background: s === person.status ? 'var(--accent-tint)' : 'var(--card)',
                        padding: '10px 12px', borderRadius: 7, cursor: 'pointer',
                        font: 'inherit', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                <StatusPill status={s} />
                {s === person.status && <Icon name="check" size={12}/>}
              </button>
            ))}
            <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4, fontFamily: 'var(--mono)' }}>
              Override will be logged as “set by Yoni Avraham, today”.
            </div>
          </div>
        )}
      </div>

      <div className="drawer-section">
        <h4>Contact
          <span className="edit">Visible to commanders only</span>
        </h4>
        <div className="drawer-contact">
          <span>{person.phone.replace('+972 ', '0').replace(/-/g, ' ')}</span>
          <IconButton icon="copy" tip="Copy"/>
          <IconButton icon="whatsapp" tip="WhatsApp" tone="whatsapp"/>
        </div>
      </div>

      <div className="drawer-section">
        <h4>Skills <span className="edit">Edit</span></h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {person.skills.map((s) => <Tag key={s} tone="accent">{s}</Tag>)}
          <span className="tag" style={{ cursor: 'pointer', borderStyle: 'dashed', color: 'var(--ink-soft)' }}>
            + Add
          </span>
        </div>
      </div>

      <div className="drawer-section">
        <h4>Service</h4>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
          fontSize: 13,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Joined</div>
            <div style={{ marginTop: 3 }}>{person.joined}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Call-ups (YTD)</div>
            <div style={{ marginTop: 3, fontFamily: 'var(--serif)', fontSize: 22, lineHeight: 1 }}>{person.callsThisYear}</div>
          </div>
        </div>
      </div>
    </>
  );
}

function ReviewsTab({ person, onToast }) {
  // Per PRD §7.7 — commander-only, reservist cannot see them.
  // The risk callout from PRD §10 is acknowledged inline.
  const reviews = [
    {
      author: 'Daniel Katz', date: 'May 4, 2026',
      rating: 5,
      body: 'Showed up early, ran the medic refresh better than the official course. Asks the right questions. Want her on every drill.',
    },
    {
      author: 'Yoni Avraham', date: 'Mar 18, 2026',
      rating: 4,
      body: 'Solid under pressure during night convoy. Slow to update status after release — worth a friendly nudge.',
    },
  ];
  return (
    <>
      <div className="drawer-section" style={{ paddingTop: 12 }}>
        <div style={{
          padding: '10px 12px', borderRadius: 7,
          background: 'var(--accent-tint)',
          color: 'var(--accent-ink)',
          border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
          fontSize: 12, lineHeight: 1.5,
          display: 'flex', gap: 8, alignItems: 'flex-start',
          marginBottom: 14,
        }}>
          <Icon name="eyeOff" size={14}/>
          <div>
            Visible only to commanders of this unit. {person.name.split(' ')[0]} cannot see these.
            Keep them factual and operational — see <a style={{ color: 'inherit', textDecoration: 'underline' }} href="#">guidelines</a>.
          </div>
        </div>

        {reviews.map((r, i) => (
          <div key={i} className="review">
            <div className="who">
              <b>{r.author}</b> · {r.date}
              <span className="stars">
                {[1,2,3,4,5].map((n) => <Icon key={n} name={n <= r.rating ? 'star' : 'starOpen'} size={10}/>)}
              </span>
              <span className="private-tag">
                <Icon name="eyeOff" size={9}/> Private
              </span>
            </div>
            <div className="body">{r.body}</div>
          </div>
        ))}

        <button className="btn" data-variant="outline" style={{ width: '100%', marginTop: 8 }}
                onClick={() => onToast('New review — coming soon')}>
          <Icon name="plus" size={12}/> Add review
        </button>
      </div>
    </>
  );
}

Object.assign(window, { PersonDrawer });
