// Root app — wires sidebar nav, roster, drawer, modal, tweaks panel.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "accent": "olive",
  "density": "comfortable",
  "pillStyle": "filled",
  "urgentEmphasis": "loud"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // map accent → data-accent attribute (olive is the default → no attr needed)
  const accentAttr = t.accent === 'olive' ? null : t.accent;

  const [members, setMembers] = React.useState(window.MEMBERS);
  const [active, setActive] = React.useState('roster');
  const [filters, setFilters] = React.useState({ status: [], roles: [], skills: [], q: '' });
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [person, setPerson] = React.useState(null);

  const [modal, setModal] = React.useState({ open: false, urgent: false, preselected: [] });
  const [bellOpen, setBellOpen] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  // Keyboard: ⌘K / ⌃K focuses search; Esc closes drawer / modal
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        document.querySelector('.search input')?.focus();
      }
      if (e.key === 'Escape') {
        if (modal.open) setModal({ open: false });
        else if (person) setPerson(null);
        else if (bellOpen) setBellOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal.open, person, bellOpen]);

  const showToast = React.useCallback((msg) => {
    setToast(msg);
    clearTimeout(showToast._tid);
    showToast._tid = setTimeout(() => setToast(null), 2200);
  }, []);

  const updatePerson = (next) => {
    setMembers((arr) => arr.map((m) => m.id === next.id ? next : m));
    setPerson(next);
  };

  const screenTitle = {
    roster:   { eyebrow: 'Roster',     title: 'Who is in', em: 'Carmel-6' },
    slots:    { eyebrow: 'Duty',       title: 'Open & upcoming', em: 'duty slots' },
    calendar: { eyebrow: 'Schedule',   title: 'Unit', em: 'calendar' },
    activity: { eyebrow: 'Activity',   title: 'Unit', em: 'activity' },
    reviews:  { eyebrow: 'Reviews',    title: 'Commander', em: 'reviews' },
    settings: { eyebrow: 'Settings',   title: 'Unit', em: 'settings' },
  }[active];

  return (
    <div className="app"
         data-theme={t.theme === 'dark' ? 'dark' : null}
         data-accent={accentAttr}
         data-density={t.density === 'compact' ? 'compact' : null}
         data-pillstyle={t.pillStyle !== 'filled' ? t.pillStyle : null}>
      <Sidebar active={active}
               onNav={(id) => { setActive(id); setPerson(null); setBellOpen(false); }}
               members={members}
               urgentCount={1} />

      <div className="main">
        {/* Top bar */}
        <header className="topbar">
          <h1 className="topbar-title">
            {screenTitle.title} <em>{screenTitle.em}</em>
          </h1>
          <div className="topbar-actions">
            <Button variant="ghost" size="icon"
                    onClick={() => setBellOpen((v) => !v)}
                    data-tip="Activity"
                    style={{ position: 'relative' }}>
              <Icon name="bell" size={15}/>
              <span style={{
                position: 'absolute', top: 6, right: 6,
                width: 7, height: 7, borderRadius: 99,
                background: 'var(--urgent)',
                boxShadow: '0 0 0 2px var(--paper)',
              }}/>
            </Button>
            <Button variant="ghost" size="icon" data-tip="Invite member">
              <Icon name="link" size={15}/>
            </Button>
            <span style={{ width: 1, height: 22, background: 'var(--line)' }}/>
            <Button variant="outline"
                    icon="plus"
                    onClick={() => setModal({ open: true, urgent: false, preselected: selectedIds })}>
              New slot
            </Button>
            <Button variant="urgent"
                    icon="urgent"
                    onClick={() => setModal({ open: true, urgent: true, preselected: [] })}>
              Urgent call-up
            </Button>
          </div>
        </header>

        {/* Bell pop */}
        <div className="bell-pop" data-open={bellOpen ? '1' : '0'} onClick={(e) => e.stopPropagation()}>
          <div className="bell-pop-head">
            <Icon name="activity" size={11}/> Activity · last 24h
          </div>
          <div className="bell-pop-body">
            {window.ACTIVITY.slice(0, 6).map((a) => (
              <div key={a.id} className="bell-item">
                <div className="icon-dot" data-tone={a.tone}>
                  <Icon name={a.tone === 'urgent' ? 'urgent' : a.tone === 'accent' ? 'check' : 'user'} size={12}/>
                </div>
                <div style={{ flex: 1 }}>
                  <b>{a.who}</b> {a.verb}{a.what && <> <b>{a.what}</b></>}.
                  <span className="when">{a.when}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="scroll">
          {active === 'roster' && (
            <Roster
              filters={filters}
              onFilters={setFilters}
              members={members}
              selected={selectedIds}
              setSelected={setSelectedIds}
              onSelect={setPerson}
              onNewSlot={() => setModal({ open: true, urgent: false, preselected: selectedIds })}
              onUrgent={() => setModal({ open: true, urgent: true, preselected: [] })}
              onToast={showToast}
            />
          )}
          {active === 'slots' && (
            <SlotsScreen members={members}
                         onUrgent={() => setModal({ open: true, urgent: true, preselected: [] })}
                         onToast={showToast}/>
          )}
          {active === 'calendar' && (
            <PlaceholderScreen
              icon="calendar"
              title="Unit calendar"
              subtitle="Month and week views with all duty slots, color-coded by status. Reservists with “unit schedule” enabled will see this too."
            />
          )}
          {active === 'activity' && <ActivityFeed/>}
          {active === 'reviews' && (
            <PlaceholderScreen
              icon="reviews"
              title="Commander reviews"
              subtitle="Private notes on reservists, visible only to commanders. Open a person's drawer (from the roster) to see and write reviews."
            />
          )}
          {active === 'settings' && (
            <PlaceholderScreen
              icon="settings"
              title="Unit settings"
              subtitle="Roles, skill tags, invite link, commander permissions, audit log. Available in any reservist's drawer."
            />
          )}
        </div>

        {/* Drawer */}
        {person && (
          <PersonDrawer
            person={person}
            onClose={() => setPerson(null)}
            onUpdate={updatePerson}
            onToast={showToast}
          />
        )}

        {/* New slot / urgent call-up modal */}
        <NewSlotModal
          open={modal.open}
          urgent={modal.urgent}
          members={members}
          preselected={modal.preselected}
          onClose={() => setModal({ open: false })}
          onPublish={(action, data) => {
            setModal({ open: false });
            showToast(
              action === 'draft'
                ? 'Slot saved as draft'
                : data.urgent
                  ? `Urgent call-up published — notified ${members.length}`
                  : `Slot published — notified ${data.picked.length}`
            );
            setSelectedIds([]);
          }}
        />

        {/* Toast */}
        <div className="toast" data-open={toast ? '1' : '0'}>
          <Icon name="check" size={12}/> {toast}
        </div>
      </div>

      {/* Tweaks panel */}
      <TweaksPanel title="Tweaks">
        <TweakSection label="Theme"/>
        <TweakRadio label="Mode" value={t.theme}
                    options={['light', 'dark']}
                    onChange={(v) => setTweak('theme', v)} />
        <TweakRadio label="Accent" value={t.accent}
                    options={[
                      { value: 'olive', label: 'Olive' },
                      { value: 'clay',  label: 'Clay'  },
                      { value: 'indigo', label: 'Indigo' },
                    ]}
                    onChange={(v) => setTweak('accent', v)} />

        <TweakSection label="Layout"/>
        <TweakRadio label="Density" value={t.density}
                    options={['compact', 'comfortable']}
                    onChange={(v) => setTweak('density', v)} />

        <TweakSection label="Status pills"/>
        <TweakRadio label="Style" value={t.pillStyle}
                    options={['filled', 'dot', 'underline']}
                    onChange={(v) => setTweak('pillStyle', v)} />

        <TweakSection label="Urgent call-ups"/>
        <TweakRadio label="Emphasis" value={t.urgentEmphasis}
                    options={['loud', 'subtle']}
                    onChange={(v) => setTweak('urgentEmphasis', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
