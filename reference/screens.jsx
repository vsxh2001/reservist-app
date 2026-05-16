// Minimal placeholder screens for the secondary nav items.
// Roster is the focus; these exist so navigation feels real.

function SlotsScreen({ members, onUrgent, onToast }) {
  const slots = window.SLOTS;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)',
                       textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Open & upcoming
          </div>
        </div>
        <Button variant="urgent" icon="urgent" onClick={onUrgent}>Urgent call-up</Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {slots.map((s) => {
          const assignees = s.assignees.map((id) => members.find((m) => m.id === id)).filter(Boolean);
          return (
            <div key={s.id} style={{
              border: '1px solid ' + (s.urgent ? 'var(--urgent)' : 'var(--line)'),
              borderRadius: 'var(--radius-lg)',
              background: 'var(--card)',
              padding: 20,
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 16,
              position: 'relative',
              overflow: 'hidden',
            }}>
              {s.urgent && <div style={{
                position: 'absolute', top: 0, left: 0, bottom: 0,
                width: 4, background: 'var(--urgent)',
              }}/>}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h3 style={{
                    margin: 0,
                    fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400,
                    letterSpacing: '-.01em', color: 'var(--ink)',
                  }}>{s.title}</h3>
                  {s.urgent && <span className="urgent-flag" style={{ position: 'static' }}>
                    <Icon name="urgent" size={10}/> Urgent
                  </span>}
                </div>
                <div style={{
                  display: 'flex', gap: 18, flexWrap: 'wrap',
                  color: 'var(--ink-soft)', fontSize: 13,
                  marginBottom: 12,
                }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="calendar" size={13}/> {s.date}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="clock" size={13}/> {s.duration}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="pin" size={13}/> {s.location}
                  </span>
                  {s.role && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon name="shield" size={13}/> {s.role}
                  </span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', marginLeft: 0 }}>
                    {assignees.map((m, i) => (
                      <div key={m.id} style={{ marginLeft: i === 0 ? 0 : -8 }}>
                        <Avatar initials={m.initials} tone={m.tone} size="sm"/>
                      </div>
                    ))}
                    {[...Array(Math.max(0, s.needed - s.filled))].map((_, i) => (
                      <div key={'e' + i} style={{
                        marginLeft: -8,
                        width: 26, height: 26, borderRadius: 99,
                        border: '1.5px dashed var(--line-strong)',
                        background: 'var(--paper-deep)',
                        display: 'grid', placeItems: 'center',
                        color: 'var(--ink-mute)',
                      }}>
                        <Icon name="plus" size={11}/>
                      </div>
                    ))}
                  </div>
                  <span style={{
                    fontFamily: 'var(--mono)', fontSize: 12,
                    color: s.filled === s.needed ? 'var(--st-avail)' : 'var(--ink-soft)',
                  }}>
                    {s.filled} / {s.needed} {s.filled === s.needed ? 'filled' : 'needed'}
                  </span>
                  {s.skills.length > 0 && s.skills.map((sk) => <Tag key={sk}>{sk}</Tag>)}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <Button variant="outline" size="sm" onClick={() => onToast('Slot details — coming soon')}>
                  View slot
                </Button>
                {s.filled < s.needed && (
                  <Button size="sm" icon="plus" onClick={() => onToast('Assign — coming soon')}>
                    Assign
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function PlaceholderScreen({ title, subtitle, icon }) {
  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--card)',
      padding: 60,
      textAlign: 'center',
      color: 'var(--ink-soft)',
    }}>
      <Icon name={icon} size={40} stroke={1.1} />
      <h2 style={{
        margin: '14px 0 6px',
        fontFamily: 'var(--serif)',
        fontSize: 32, fontWeight: 400,
        color: 'var(--ink)',
        letterSpacing: '-.01em',
      }}>{title}</h2>
      <div style={{ fontSize: 14, maxWidth: 380, margin: '0 auto' }}>{subtitle}</div>
    </div>
  );
}

function ActivityFeed() {
  return (
    <div style={{
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      background: 'var(--card)',
      padding: 22,
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 11,
        color: 'var(--ink-mute)', textTransform: 'uppercase',
        letterSpacing: '.08em', marginBottom: 12,
      }}>
        Today
      </div>
      <div className="timeline">
        {window.ACTIVITY.map((a) => (
          <div key={a.id} className="timeline-item">
            <div className="timeline-dot" data-tone={a.tone}/>
            <div className="timeline-content">
              <b>{a.who}</b> {a.verb}{a.what && <> <b>{a.what}</b></>}.
              <span className="when">{a.when}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SlotsScreen, PlaceholderScreen, ActivityFeed });
