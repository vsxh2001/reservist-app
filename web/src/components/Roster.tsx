import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button, Check, IconButton, SkillChip, StatusPill, Tag } from './atoms';
import {
  SKILL_LEVELS, SKILL_LEVEL_LABEL, STATUS_LABEL, STATUS_ORDER,
  memberMatchesAllSkillReqs,
  type Filters, type Member, type SkillFilter, type SkillLevel, type Slot, type Status,
} from '../lib/types';
import { useAssignToSlot } from '../lib/queries';
import { useAuth } from '../lib/auth';
import { CrossTeamRecruitDrawer } from './CrossTeamRecruitDrawer';

const fmtPhone = (p: string) => p.replace('+972 ', '0').replace(/-/g, ' ');

interface CountsByStatus { total: number; available: number; standby: number; released: number; unavailable: number }

function StatusFilter({
  value, counts, onChange,
}: { value: Status[]; counts: CountsByStatus; onChange: (v: Status[]) => void }) {
  const toggle = (s: Status) => {
    const next = new Set(value);
    if (next.has(s)) next.delete(s); else next.add(s);
    onChange([...next]);
  };
  const tone: Record<Status, string> = {
    available: 'var(--st-avail)',
    standby:   'var(--st-stand)',
    released:  'var(--st-rel)',
    unavailable: 'var(--st-unav)',
  };
  return (
    <div className="filter-group" role="radiogroup" aria-label="Filter by status">
      <button data-on={value.length === 0 ? '1' : '0'} onClick={() => onChange([])}>
        All
        <span className="filter-count">{counts.total}</span>
      </button>
      {STATUS_ORDER.map((s) => (
        <button key={s} data-on={value.includes(s) ? '1' : '0'} onClick={() => toggle(s)}>
          <span className="dot" style={{ width: 7, height: 7, borderRadius: 99, background: tone[s] }} />
          {STATUS_LABEL[s]}
          <span className="filter-count">{counts[s] || 0}</span>
        </button>
      ))}
    </div>
  );
}

function SkillFilterBuilder({
  options, value, onChange,
}: {
  options: string[];
  value: SkillFilter[];
  onChange: (v: SkillFilter[]) => void;
}) {
  const [name, setName] = useState('');
  const [level, setLevel] = useState<SkillLevel>('junior');

  const taken = new Set(value.map((v) => v.name));
  const available = options.filter((o) => !taken.has(o));

  const add = () => {
    if (!name) return;
    onChange([...value, { name, min_level: level }]);
    setName('');
    setLevel('junior');
  };
  const remove = (n: string) => onChange(value.filter((v) => v.name !== n));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        border: '1px solid var(--line-strong)', borderRadius: 7,
        background: 'var(--card)', height: 30, paddingInline: 6,
      }}>
        <Icon name="skill" size={13} />
        <select
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            appearance: 'none', border: 0, background: 'transparent',
            font: 'inherit', fontSize: 12.5, color: 'var(--ink-2)',
            paddingInline: 4, cursor: 'pointer', outline: 'none',
          }}
        >
          <option value="">Skill…</option>
          {available.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <span style={{ width: 1, height: 16, background: 'var(--line)' }} />
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value as SkillLevel)}
          aria-label="Minimum level"
          style={{
            appearance: 'none', border: 0, background: 'transparent',
            font: 'inherit', fontSize: 12.5, color: 'var(--ink-2)',
            paddingInline: 4, cursor: 'pointer', outline: 'none',
          }}
        >
          {SKILL_LEVELS.map((l) => (
            <option key={l} value={l}>{`≥ ${SKILL_LEVEL_LABEL[l]}`}</option>
          ))}
        </select>
        <button
          className="action-btn"
          style={{ background: 'transparent', border: 0 }}
          disabled={!name}
          aria-label="Add skill requirement"
          onClick={add}
        >
          <Icon name="plus" size={12} />
        </button>
      </div>
      {value.map((s) => (
        <span
          key={s.name}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <SkillChip name={s.name} min_level={s.min_level} />
          <button
            className="filter-clear"
            aria-label={`Remove ${s.name}`}
            onClick={() => remove(s.name)}
            style={{ paddingInline: 4 }}
          >
            <Icon name="x" size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}

interface Props {
  members: Member[];
  skills: string[];
  slots: Slot[];
  teamId: string;
  filters: Filters;
  onFilters: (f: Filters) => void;
  selected: string[];
  setSelected: (s: string[]) => void;
  onPerson: (m: Member) => void;
  onToast: (msg: string) => void;
  onNewSlotWith: (memberIds: string[]) => void;
}

export function Roster(props: Props) {
  const { members, skills, slots, teamId, filters, onFilters, selected, setSelected, onPerson, onToast, onNewSlotWith } = props;
  const { user } = useAuth();
  const assignToSlot = useAssignToSlot();
  const [popOpen, setPopOpen] = useState(false);
  const [recruitOpen, setRecruitOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Close popover on outside click / Esc.
  useEffect(() => {
    if (!popOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) setPopOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setPopOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [popOpen]);

  // Slots that can still take more people.
  const openSlots = useMemo(
    () => slots
      .filter((s) => s.state === 'published' && s.filled < s.needed)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [slots],
  );

  const assignSelectedToSlot = async (s: Slot) => {
    if (!user) return;
    const fresh = selected.filter((id) => !s.assignee_ids.includes(id));
    if (fresh.length === 0) {
      onToast(`Already on "${s.title}"`);
      setPopOpen(false);
      return;
    }
    const names = fresh.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean) as string[];
    await assignToSlot.mutateAsync({
      slotId: s.id, memberIds: fresh, assignedBy: user.id,
      teamId, actorName: user.name, slotTitle: s.title, memberNames: names,
    });
    setSelected([]);
    setPopOpen(false);
    onToast(`Assigned ${fresh.length} to ${s.title}`);
  };
  const [sort, setSort] = useState<{ key: 'status' | 'name'; dir: 'asc' | 'desc' }>({ key: 'status', dir: 'asc' });

  const counts = useMemo<CountsByStatus>(() => {
    const by: CountsByStatus = { total: members.length, available: 0, standby: 0, released: 0, unavailable: 0 };
    members.forEach((m) => { by[m.status] = (by[m.status] || 0) + 1; });
    return by;
  }, [members]);

  const visible = useMemo(() => {
    let arr = members.slice();
    if (filters.status.length) arr = arr.filter((m) => filters.status.includes(m.status));
    if (filters.skills.length) arr = arr.filter((m) => memberMatchesAllSkillReqs(m.skills, filters.skills));
    if (filters.q) {
      const q = filters.q.toLowerCase();
      arr = arr.filter((m) =>
        m.name.toLowerCase().includes(q) ||
        m.skills.some((s) => s.name.toLowerCase().includes(q)) ||
        m.phone.includes(q));
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'status') {
      arr.sort((a, b) => (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)) * dir || a.name.localeCompare(b.name));
    } else if (sort.key === 'name') {
      arr.sort((a, b) => a.name.localeCompare(b.name) * dir);
    }
    return arr;
  }, [members, filters, sort]);

  const toggleSort = (key: 'status' | 'name') => {
    setSort((p) => p.key === key ? { key, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  };

  const toggleSelect = (id: string) => {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const copyPhones = () => {
    const list = selected.length ? members.filter((m) => selected.includes(m.id)) : visible;
    const text = list.map((m) => m.phone).join('\n');
    navigator.clipboard?.writeText(text);
    onToast(`Copied ${list.length} phone number${list.length === 1 ? '' : 's'}`);
  };

  const hasFilters = filters.status.length || filters.skills.length || filters.q;

  return (
    <>
      <div className="stats">
        <div className="stat" data-active={filters.status.length === 0 ? '1' : '0'} onClick={() => onFilters({ ...filters, status: [] })}>
          <div className="stat-label">Total roster</div>
          <div className="stat-num">{counts.total}<em>members</em></div>
          <div className="stat-delta">+2 this quarter</div>
        </div>
        <div className="stat"
             data-active={filters.status.length === 1 && filters.status[0] === 'available' ? '1' : '0'}
             onClick={() => onFilters({ ...filters, status: ['available'] })}>
          <div className="stat-label"><span className="dot" style={{ background: 'var(--st-avail)' }}/>Available now</div>
          <div className="stat-num">{counts.available}<em>can be called</em></div>
          <div className="stat-delta">{counts.total === 0 ? '—' : `${Math.round(counts.available / counts.total * 100)}% of unit`}</div>
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
        <div className="stat">
          <div className="stat-label" style={{ color: 'var(--urgent-deep)' }}>
            <Icon name="urgent" size={12}/> Open call-up
          </div>
          <div className="stat-num" style={{ color: 'var(--urgent-deep)' }}>
            0<em style={{ color: 'var(--urgent-deep)' }}>v1.x — coming</em>
          </div>
          <div className="stat-delta" style={{ color: 'var(--urgent)' }}>Slots not in MVP v0</div>
        </div>
      </div>

      <div className="filters">
        <div className="search">
          <Icon name="search" size={14} />
          <input placeholder="Search by name, skill, phone…"
                 value={filters.q}
                 onChange={(e) => onFilters({ ...filters, q: e.target.value })} />
          <span className="kbd">⌘ K</span>
        </div>
        <StatusFilter value={filters.status} counts={counts} onChange={(v) => onFilters({ ...filters, status: v })} />
        <SkillFilterBuilder options={skills} value={filters.skills} onChange={(v) => onFilters({ ...filters, skills: v })} />
        {hasFilters ? (
          <button className="filter-clear" onClick={() => onFilters({ status: [], skills: [], q: '' })}>
            Clear all
          </button>
        ) : null}
        <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--ink-soft)', fontFamily: 'var(--mono)' }}>
            {visible.length} of {members.length}
          </span>
          <Button variant="ghost" size="sm" icon="copy" onClick={copyPhones}>Copy phones</Button>
          <Button variant="ghost" size="sm" icon="plus" onClick={() => setRecruitOpen(true)}>Recruit</Button>
        </div>
      </div>

      <div className="roster" data-cols="6">
        <div className="roster-head">
          <span />
          <span className="sortable" data-on={sort.key === 'name' ? '1' : '0'} onClick={() => toggleSort('name')}>
            Name <Icon name="sort" size={11} />
          </span>
          <span className="sortable" data-on={sort.key === 'status' ? '1' : '0'} onClick={() => toggleSort('status')}>Status</span>
          <span>Skills</span>
          <span>Contact</span>
          <span style={{ textAlign: 'end' }}>Actions</span>
        </div>

        {visible.length === 0 ? (
          <div className="empty">
            <Icon name="search" size={32} stroke={1.2} />
            <div className="title">Nobody matches those filters</div>
            <div>Try removing a constraint or clearing the search.</div>
          </div>
        ) : visible.map((m) => (
          <RosterRow
            key={m.id}
            m={m}
            teamId={teamId}
            selected={selected.includes(m.id)}
            onPerson={onPerson}
            onToggle={() => toggleSelect(m.id)}
            onToast={onToast}
          />
        ))}
      </div>

      {selected.length > 0 && (
        <div className="bulk-bar" style={{ position: 'sticky' }}>
          <span className="count">{selected.length} selected</span>
          <span className="sep" />
          <button onClick={copyPhones}><Icon name="copy" size={12}/> Copy phones</button>
          <div ref={popRef} style={{ position: 'relative' }}>
            <button data-primary={popOpen ? '1' : undefined}
                    aria-haspopup="listbox"
                    aria-expanded={popOpen}
                    onClick={() => setPopOpen((v) => !v)}>
              <Icon name="slots" size={12}/> Assign to slot
              <Icon name="chevDown" size={10} />
            </button>
            {popOpen && (
              <div role="listbox" aria-label="Open slots" style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                insetInlineEnd: 0,
                background: 'var(--card)',
                color: 'var(--ink)',
                border: '1px solid var(--line-strong)',
                borderRadius: 10,
                boxShadow: 'var(--shadow-lg)',
                minInlineSize: 260,
                maxInlineSize: 'min(360px, calc(100vw - 24px))',
                maxBlockSize: '60vh',
                overflow: 'auto',
                padding: 6,
                zIndex: 20,
              }}>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 10.5, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '.08em',
                  color: 'var(--ink-mute)', padding: '6px 8px 4px',
                }}>
                  Open slots
                </div>
                {openSlots.length === 0 ? (
                  <div style={{ padding: '8px 10px 6px', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                    No open slots with room.
                  </div>
                ) : (
                  openSlots.map((s) => {
                    const fresh = selected.filter((id) => !s.assignee_ids.includes(id));
                    const dup = selected.length - fresh.length;
                    const room = s.needed - s.filled;
                    const when = new Date(s.start_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <button key={s.id}
                              onClick={() => assignSelectedToSlot(s)}
                              disabled={assignToSlot.isPending || fresh.length === 0}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr auto',
                                gap: 4,
                                inlineSize: '100%',
                                textAlign: 'start',
                                appearance: 'none',
                                border: 0,
                                background: 'transparent',
                                color: 'inherit',
                                font: 'inherit',
                                padding: '8px 10px',
                                borderRadius: 7,
                                cursor: fresh.length === 0 ? 'not-allowed' : 'pointer',
                                opacity: fresh.length === 0 ? 0.55 : 1,
                                minBlockSize: 40,
                              }}>
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                          {s.urgent && <Icon name="urgent" size={11} style={{ verticalAlign: -1, marginInlineEnd: 4, color: 'var(--urgent)' }} />}
                          {s.title}
                        </span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
                          {s.filled}/{s.needed}
                        </span>
                        <span style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--ink-soft)' }}>
                          {when}
                          {dup > 0 && <> · <em style={{ fontStyle: 'normal', color: 'var(--ink-mute)' }}>{dup} already on slot</em></>}
                          {fresh.length > room && <> · <em style={{ fontStyle: 'normal', color: 'var(--urgent-deep)' }}>only {room} seat{room === 1 ? '' : 's'} left</em></>}
                        </span>
                      </button>
                    );
                  })
                )}
                <div style={{ height: 1, background: 'var(--line-soft)', margin: '4px 6px' }} />
                <button
                  onClick={() => { onNewSlotWith(selected); setPopOpen(false); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    inlineSize: '100%', appearance: 'none', border: 0,
                    background: 'transparent', color: 'var(--accent-deep)',
                    font: 'inherit', fontSize: 12.5, fontWeight: 500,
                    padding: '8px 10px', borderRadius: 7, cursor: 'pointer',
                    textAlign: 'start', minBlockSize: 40,
                  }}>
                  <Icon name="plus" size={12} /> New slot with these
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setSelected([])}><Icon name="x" size={12}/></button>
        </div>
      )}

      {recruitOpen && (
        <CrossTeamRecruitDrawer
          onClose={() => setRecruitOpen(false)}
          onToast={onToast}
        />
      )}
    </>
  );
}

function RosterRow({
  m, teamId, selected, onPerson, onToggle, onToast,
}: {
  m: Member;
  teamId: string;
  selected: boolean;
  onPerson: (m: Member) => void;
  onToggle: () => void;
  onToast: (msg: string) => void;
}) {
  const shown = m.skills.slice(0, 3);
  const isCommander = m.teams.find((t) => t.team_id === teamId)?.role === 'commander';
  return (
    <div className="roster-row" data-selected={selected ? '1' : '0'} onClick={() => onPerson(m)}>
      <Check on={selected} onClick={(e) => { e.stopPropagation(); onToggle(); }} />
      <div className="cell-name">
        <Avatar initials={m.initials} tone={m.tone} status={m.status} />
        <div className="meta">
          <div className="nm">
            {m.name}
            {isCommander && <span style={{
              marginInlineStart: 6, fontSize: 10, padding: '1px 5px',
              background: 'var(--accent-tint)', color: 'var(--accent-deep)',
              borderRadius: 3, fontFamily: 'var(--mono)',
              textTransform: 'uppercase', letterSpacing: '.06em',
              verticalAlign: 1, fontWeight: 600,
            }}>CMDR</span>}
          </div>
          <div className="sub">{m.last_seen}</div>
        </div>
      </div>
      <div>
        <StatusPill status={m.status} />
        {m.status_until && (
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBlockStart: 3, fontFamily: 'var(--mono)' }}>
            until {m.status_until.slice(5).replace('-', '/')}
          </div>
        )}
      </div>
      <div className="cell-skills">
        {shown.map((s) => <SkillChip key={s.name} name={s.name} level={s.level} />)}
        {m.skills.length > 3 && <Tag>+{m.skills.length - 3}</Tag>}
      </div>
      <div className="cell-contact">{fmtPhone(m.phone)}</div>
      <div className="actions">
        <IconButton icon="phone"    tip="Call"     tone="phone"    onClick={(e) => { e.stopPropagation(); onToast(`Calling ${m.name}…`); }} />
        <IconButton icon="whatsapp" tip="WhatsApp" tone="whatsapp" onClick={(e) => { e.stopPropagation(); onToast(`Opening WhatsApp with ${m.name}…`); }} />
        <IconButton icon="moreHoriz" tip="More" onClick={(e) => { e.stopPropagation(); onPerson(m); }} />
      </div>
    </div>
  );
}
