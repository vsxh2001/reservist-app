// Roster screen — the heart of the commander dashboard.
// Implements PRD §7.4: filter (status, role, skills), text search,
// tap-to-call / tap-to-whatsapp, bulk select + copy phones.

const STATUS_ORDER = ['available', 'standby', 'released', 'unavailable'];

function StatusFilter({ value, counts, onChange }) {
  // Multi-select via clicking pill segments
  const toggle = (s) => {
    const next = new Set(value);
    if (next.has(s)) next.delete(s); else next.add(s);
    onChange([...next]);
  };
  return (
    <div className="filter-group" role="radiogroup" aria-label="Filter by status">
      <button data-on={value.length === 0 ? '1' : '0'}
              onClick={() => onChange([])}>
        All
        <span className="filter-count">{counts.total}</span>
      </button>
      {STATUS_ORDER.map((s) => (
        <button key={s}
                data-on={value.includes(s) ? '1' : '0'}
                onClick={() => toggle(s)}>
          <span className="dot" style={{
            width: 7, height: 7, borderRadius: 99,
            background: `var(--st-${s === 'available' ? 'avail' : s === 'standby' ? 'stand' : s === 'released' ? 'rel' : 'unav'})`,
          }}/>
          {window.STATUS_LABEL[s]}
          <span className="filter-count">{counts[s] || 0}</span>
        </button>
      ))}
    </div>
  );
}

// A simple dropdown for role / skill filters.
function MultiDropdown({ label, options, value, onChange, icon }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const toggle = (v) => {
    const next = new Set(value);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange([...next]);
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="chip-dropdown"
           data-on={value.length > 0 ? '1' : '0'}
           onClick={() => setOpen(!open)}>
        {icon && <Icon name={icon} size={13} />}
        <span>{label}{value.length > 0 ? ` · ${value.length}` : ''}</span>
        <Icon name="chevDown" size={11} className="chev" />
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          width: 240, maxHeight: 280, overflow: 'auto',
          background: 'var(--card)', border: '1px solid var(--line-strong)',
          borderRadius: 8, boxShadow: 'var(--shadow-md)', zIndex: 5,
          padding: 6, fontSize: 13,
        }}>
          {value.length > 0 && (
            <div style={{
              padding: '4px 8px 6px', borderBottom: '1px solid var(--line-soft)',
              marginBottom: 4, display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', fontSize: 11.5, color: 'var(--ink-soft)',
            }}>
              <span><b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{value.length}</b> selected</span>
              <button className="filter-clear" onClick={() => onChange([])}>Clear</button>
            </div>
          )}
          {options.map((opt) => (
            <div key={opt} onClick={() => toggle(opt)}
                 style={{
                   display: 'flex', alignItems: 'center', gap: 8,
                   padding: '6px 8px', borderRadius: 5, cursor: 'pointer',
                   background: value.includes(opt) ? 'var(--accent-tint)' : 'transparent',
                 }}>
              <Check on={value.includes(opt)} />
              <span style={{ color: value.includes(opt) ? 'var(--accent-deep)' : 'var(--ink-2)', fontWeight: value.includes(opt) ? 500 : 400 }}>{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Format phone for display, hide some digits in dot mode? — keep raw for now
const fmtPhone = (p) => p.replace('+972 ', '0').replace(/-/g, ' ');

function Roster({ filters, onFilters, members, onSelect, onNewSlot, onUrgent, selected, setSelected, onToast }) {
  const [sort, setSort] = React.useState({ key: 'status', dir: 'asc' });

  const counts = React.useMemo(() => {
    const by = { total: members.length };
    STATUS_ORDER.forEach((s) => { by[s] = members.filter((m) => m.status === s).length; });
    return by;
  }, [members]);

  // Apply filters
  const visible = React.useMemo(() => {
    let arr = members.slice();
    if (filters.status.length) arr = arr.filter((m) => filters.status.includes(m.status));
    if (filters.roles.length)  arr = arr.filter((m) => filters.roles.includes(m.role));
    if (filters.skills.length) arr = arr.filter((m) => filters.skills.every((s) => m.skills.includes(s)));
    if (filters.q) {
      const q = filters.q.toLowerCase();
      arr = arr.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        m.skills.some((s) => s.toLowerCase().includes(q)) ||
        m.phone.includes(q));
    }

    // Sort
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'status') {
      arr.sort((a, b) => (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) * dir || a.name.localeCompare(b.name));
    } else if (sort.key === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name) * dir);
    } else if (sort.key === 'role') {
      arr.sort((a, b) => a.role.localeCompare(b.role) * dir);
    } else if (sort.key === 'seen') {
      arr.sort((a, b) => (a.lastSeen || '').localeCompare(b.lastSeen || '') * dir);
    }
    return arr;
  }, [members, filters, sort]);

  const toggleSort = (key) => {
    setSort((p) => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const toggleSelect = (id) => {
    setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  };

  const copyPhones = () => {
    const list = (selected.length ? members.filter((m) => selected.includes(m.id)) : visible);
    const text = list.map((m) => m.phone).join('\n');
    navigator.clipboard?.writeText(text);
    onToast(`Copied ${list.length} phone number${list.length === 1 ? '' : 's'} to clipboard`);
  };

  const hasFilters = filters.status.length || filters.roles.length || filters.skills.length || filters.q;

  return (
    <>
      {/* Stats row */}
      <div className="stats">
        <div className="stat"
             data-active={filters.status.length === 0 ? '1' : '0'}
             onClick={() => onFilters({ ...filters, status: [] })}>
          <div className="stat-label">Total roster</div>
          <div className="stat-num">{counts.total}<em>members</em></div>
          <div className="stat-delta">+2 this quarter</div>
        </div>
        <div className="stat"
             data-active={filters.status.length === 1 && filters.status[0] === 'available' ? '1' : '0'}
             onClick={() => onFilters({ ...filters, status: ['available'] })}>
          <div className="stat-label"><span className="dot" style={{ background: 'var(--st-avail)' }}/>Available now</div>
          <div className="stat-num">{counts.available}<em>can be called</em></div>
          <div className="stat-delta">{Math.round(counts.available / counts.total * 100)}% of unit</div>
        </div>
        <div className="stat"
             data-active={filters.status.length === 1 && filters.status[0] === 'standby' ? '1' : '0'}
             onClick={() => onFilters({ ...filters, status: ['standby'] })}>
          <div className="stat-label"><span className="dot" style={{ background: 'var(--st-stand)' }}/>On standby</div>
          <div className="stat-num">{counts.standby}<em>ready to go</em></div>
          <div className="stat-delta">avg 14h response</div>
        </div>
        <div className="stat"
             data-active={filters.status.length === 1 && filters.status[0] === 'unavailable' ? '1' : '0'}
             onClick={() => onFilters({ ...filters, status: ['unavailable'] })}>
          <div className="stat-label"><span className="dot" style={{ background: 'var(--st-unav)' }}/>Unavailable</div>
          <div className="stat-num">{counts.unavailable}<em>blocked</em></div>
          <div className="stat-delta">{counts.unavailable === 0 ? '—' : 'next free Jun 28'}</div>
        </div>
        <div className="stat" onClick={onUrgent}>
          <div className="stat-label" style={{ color: 'var(--urgent-deep)' }}>
            <Icon name="urgent" size={12}/> Open call-up
          </div>
          <div className="stat-num" style={{ color: 'var(--urgent-deep)' }}>
            1<em style={{ color: 'var(--urgent-deep)' }}>Sector 4 · 6 needed</em>
          </div>
          <div className="stat-delta" style={{ color: 'var(--urgent)' }}>2 of 6 filled · started 12 min ago</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters">
        <div className="search">
          <Icon name="search" size={14} />
          <input placeholder="Search by name, skill, role, phone…"
                 value={filters.q}
                 onChange={(e) => onFilters({ ...filters, q: e.target.value })} />
          <span className="kbd">⌘ K</span>
        </div>
        <StatusFilter
          value={filters.status}
          counts={counts}
          onChange={(v) => onFilters({ ...filters, status: v })}
        />
        <MultiDropdown
          label="Role"
          icon="shield"
          options={window.ROLES}
          value={filters.roles}
          onChange={(v) => onFilters({ ...filters, roles: v })}
        />
        <MultiDropdown
          label="Skills"
          icon="skill"
          options={window.SKILLS}
          value={filters.skills}
          onChange={(v) => onFilters({ ...filters, skills: v })}
        />
        {hasFilters ? (
          <button className="filter-clear" onClick={() => onFilters({ status: [], roles: [], skills: [], q: '' })}>
            Clear all
          </button>
        ) : null}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'var(--mono)' }}>
            {visible.length} of {members.length}
          </span>
          <Button variant="ghost" size="sm" icon="copy" onClick={copyPhones}>
            Copy phones
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="roster">
        <div className="roster-head">
          <span />
          <span className="sortable" data-on={sort.key === 'name' ? '1' : '0'} onClick={() => toggleSort('name')}>
            Name <Icon name="sort" size={11} />
          </span>
          <span className="sortable" data-on={sort.key === 'role' ? '1' : '0'} onClick={() => toggleSort('role')}>
            Role
          </span>
          <span className="sortable" data-on={sort.key === 'status' ? '1' : '0'} onClick={() => toggleSort('status')}>
            Status
          </span>
          <span>Skills</span>
          <span>Contact</span>
          <span style={{ textAlign: 'right' }}>Actions</span>
        </div>

        {visible.length === 0 ? (
          <div className="empty">
            <Icon name="search" size={32} stroke={1.2} />
            <div className="title">Nobody matches those filters</div>
            <div>Try removing a constraint or clearing the search.</div>
          </div>
        ) : visible.map((m) => (
          <RosterRow key={m.id} m={m}
                     selected={selected.includes(m.id)}
                     onSelect={onSelect}
                     onToggle={() => toggleSelect(m.id)}
                     onToast={onToast} />
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div className="bulk-bar">
          <span className="count">{selected.length} selected</span>
          <span className="sep" />
          <button onClick={() => { copyPhones(); }}>
            <Icon name="copy" size={12}/> Copy phones
          </button>
          <button onClick={onNewSlot} data-primary="1">
            <Icon name="plus" size={12}/> Assign to slot
          </button>
          <button onClick={() => setSelected([])}>
            <Icon name="x" size={12}/>
          </button>
        </div>
      )}
    </>
  );
}

function RosterRow({ m, selected, onSelect, onToggle, onToast }) {
  const callPhone = (e) => {
    e.stopPropagation();
    onToast(`Calling ${m.name}…`);
  };
  const callWhatsApp = (e) => {
    e.stopPropagation();
    onToast(`Opening WhatsApp with ${m.name}…`);
  };
  return (
    <div className="roster-row"
         data-selected={selected ? '1' : '0'}
         onClick={() => onSelect(m)}>
      <Check on={selected}
             onClick={(e) => { e.stopPropagation(); onToggle(); }} />
      <div className="cell-name">
        <Avatar initials={m.initials} tone={m.tone} status={m.status} />
        <div className="meta">
          <div className="nm">
            {m.name}
            {m.isCommander && <span style={{
              marginLeft: 6, fontSize: 10, padding: '1px 5px',
              background: 'var(--accent-tint)', color: 'var(--accent-deep)',
              borderRadius: 3, fontFamily: 'var(--mono)',
              textTransform: 'uppercase', letterSpacing: '.06em',
              verticalAlign: 1, fontWeight: 600,
            }}>CMDR</span>}
          </div>
          <div className="sub">{m.lastSeen}</div>
        </div>
      </div>
      <Role role={m.role} />
      <div>
        <StatusPill status={m.status} />
        {m.statusUntil && (
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 3, fontFamily: 'var(--mono)' }}>
            until {m.statusUntil.slice(5).replace('-', '/')}
          </div>
        )}
      </div>
      <div className="cell-skills">
        {m.skills.slice(0, 3).map((s) => <Tag key={s}>{s}</Tag>)}
        {m.skills.length > 3 && <Tag>+{m.skills.length - 3}</Tag>}
      </div>
      <div className="cell-contact">{fmtPhone(m.phone)}</div>
      <div className="actions">
        <IconButton icon="phone" tip="Call" tone="phone" onClick={callPhone} />
        <IconButton icon="whatsapp" tip="WhatsApp" tone="whatsapp" onClick={callWhatsApp} />
        <IconButton icon="moreHoriz" tip="More" onClick={(e) => { e.stopPropagation(); onSelect(m); }} />
      </div>
    </div>
  );
}

Object.assign(window, { Roster });
