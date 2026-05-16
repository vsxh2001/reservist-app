// Sidebar nav for the commander dashboard.

function Sidebar({ active, onNav, urgentCount, members }) {
  const counts = React.useMemo(() => {
    const by = { available: 0, standby: 0, released: 0, unavailable: 0 };
    members.forEach((m) => { by[m.status] = (by[m.status] || 0) + 1; });
    return by;
  }, [members]);

  const nav = [
    { id: 'roster',     label: 'Roster',     icon: 'roster',   count: members.length },
    { id: 'slots',      label: 'Duty slots', icon: 'slots',    count: 3, urgent: urgentCount > 0 },
    { id: 'calendar',   label: 'Calendar',   icon: 'calendar' },
    { id: 'activity',   label: 'Activity',   icon: 'activity', count: 12 },
  ];
  const nav2 = [
    { id: 'reviews',    label: 'Reviews',    icon: 'reviews' },
    { id: 'settings',   label: 'Settings',   icon: 'settings' },
  ];

  return (
    <aside className="sidebar">
      <div className="sb-unit" data-comment-anchor="unit-header">
        <div className="sb-crest">{window.UNIT.crest}</div>
        <div className="sb-unit-meta">
          <div className="sb-unit-name">{window.UNIT.name}</div>
          <div className="sb-unit-sub">
            <b>{members.length}</b> members · <b>{counts.available}</b> available
          </div>
        </div>
      </div>

      <div className="sb-nav">
        {nav.map((n) => (
          <div key={n.id} className="sb-link"
               data-active={active === n.id ? '1' : '0'}
               onClick={() => onNav(n.id)}>
            <Icon name={n.icon} size={15} />
            <span>{n.label}</span>
            {n.urgent
              ? <span className="sb-dot-urgent" />
              : (n.count != null && <span className="sb-count">{n.count}</span>)}
          </div>
        ))}

        <div className="sb-section">Unit</div>
        {nav2.map((n) => (
          <div key={n.id} className="sb-link"
               data-active={active === n.id ? '1' : '0'}
               onClick={() => onNav(n.id)}>
            <Icon name={n.icon} size={15} />
            <span>{n.label}</span>
          </div>
        ))}
      </div>

      <div className="sb-me">
        <Avatar initials="YA" tone={0} status="available" />
        <div className="sb-me-meta">
          <div className="sb-me-name">Yoni Avraham</div>
          <div className="sb-me-role">Commander · {window.UNIT.shortName}</div>
        </div>
        <Icon name="chevDown" size={12} />
      </div>
    </aside>
  );
}

Object.assign(window, { Sidebar });
