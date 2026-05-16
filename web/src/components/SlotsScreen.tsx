import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { Avatar, Button, SkillChip } from './atoms';
import { useUpdateSlotState } from '../lib/queries';
import { useAuth } from '../lib/auth';
import type { Member, Slot, SlotState } from '../lib/types';

interface Props {
  slots: Slot[];
  members: Member[];
  onUrgent: () => void;
  onNewSlot: () => void;
  onSlotClick: (s: Slot) => void;
  onToast: (msg: string) => void;
}

const STATE_ORDER: SlotState[] = ['published', 'draft', 'completed', 'cancelled'];
const STATE_LABEL: Record<SlotState, string> = {
  published: 'Published',
  draft:     'Drafts',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (sameDay) return `Today, ${hh}:${mm}`;
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + `, ${hh}:${mm}`;
}

const stateBadgeStyle: Record<SlotState, { bg: string; color: string }> = {
  draft:     { bg: 'var(--card-soft)',   color: 'var(--ink-soft)' },
  published: { bg: 'var(--accent-tint)', color: 'var(--accent-deep)' },
  completed: { bg: 'var(--st-rel-bg)',   color: 'var(--st-rel)' },
  cancelled: { bg: 'var(--urgent-bg)',   color: 'var(--urgent-deep)' },
};

export function SlotsScreen({ slots, members, onUrgent, onNewSlot, onSlotClick, onToast }: Props) {
  const { user } = useAuth();
  const updateState = useUpdateSlotState();
  const [statesOn, setStatesOn] = useState<SlotState[]>(['published']);

  const counts = useMemo(() => {
    const c: Record<SlotState, number> = { draft: 0, published: 0, completed: 0, cancelled: 0 };
    slots.forEach((s) => { c[s.state] += 1; });
    return c;
  }, [slots]);

  const visible = useMemo(
    () => slots.filter((s) => statesOn.includes(s.state)),
    [slots, statesOn],
  );

  const toggleState = (s: SlotState) => {
    setStatesOn((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);
  };

  const publishDraft = async (e: React.MouseEvent, s: Slot) => {
    e.stopPropagation();
    if (!user) return;
    await updateState.mutateAsync({
      slotId: s.id, state: 'published', actorId: user.id,
      unitId: s.unit_id, actorName: user.name, slotTitle: s.title,
    });
    onToast(`Published "${s.title}"`);
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ flex: 1, minInlineSize: 160 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            Open & upcoming
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="outline" icon="plus" onClick={onNewSlot}>New slot</Button>
          <Button variant="urgent" icon="urgent" onClick={onUrgent}>Urgent call-up</Button>
        </div>
      </div>

      <div className="filter-group" role="group" aria-label="Filter by slot state"
           style={{ marginBlockEnd: 14, flexWrap: 'wrap', height: 'auto', minBlockSize: 34 }}>
        {STATE_ORDER.map((s) => (
          <button key={s} data-on={statesOn.includes(s) ? '1' : '0'} onClick={() => toggleState(s)}>
            {STATE_LABEL[s]}
            <span className="filter-count">{counts[s] || 0}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="empty">
          <Icon name="slots" size={32} stroke={1.2} />
          <div className="title">
            {slots.length === 0
              ? 'No duty slots yet'
              : statesOn.length === 0
                ? 'No states selected'
                : 'Nothing matches those filters'}
          </div>
          <div>
            {slots.length === 0
              ? 'Create one with "New slot" or post an "Urgent call-up".'
              : statesOn.length === 0
                ? 'Toggle a state chip above to see slots.'
                : 'Toggle another state above to see more.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visible.map((s) => {
            const assignees = s.assignee_ids.map((id) => members.find((m) => m.id === id)).filter(Boolean) as Member[];
            const empty = Math.max(0, s.needed - s.filled);
            const isDraft = s.state === 'draft';
            const isReadOnly = s.state === 'completed' || s.state === 'cancelled';
            const accent = isDraft || isReadOnly ? 'var(--line)' : (s.urgent ? 'var(--urgent)' : 'var(--line)');
            return (
              <div key={s.id} onClick={() => onSlotClick(s)} style={{
                border: '1px solid ' + accent,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--card)',
                padding: 20,
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 16,
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                opacity: isReadOnly ? 0.78 : 1,
              }}>
                {s.urgent && s.state === 'published' &&
                  <div style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: 4, background: 'var(--urgent)' }}/>}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 400, letterSpacing: '-.01em' }}>
                      {s.title}
                    </h3>
                    {isDraft ? (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10,
                        padding: '2px 7px', borderRadius: 4,
                        textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600,
                        background: stateBadgeStyle.draft.bg, color: stateBadgeStyle.draft.color,
                        border: '1px dashed var(--line-strong)',
                      }}>Draft</span>
                    ) : s.urgent && s.state === 'published' ? (
                      <span className="urgent-flag" style={{ position: 'static' }}>
                        <Icon name="urgent" size={10}/> Urgent
                      </span>
                    ) : null}
                    {isReadOnly && (
                      <span style={{
                        fontFamily: 'var(--mono)', fontSize: 10,
                        padding: '2px 7px', borderRadius: 4,
                        textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 600,
                        background: stateBadgeStyle[s.state].bg, color: stateBadgeStyle[s.state].color,
                      }}>{s.state}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', color: 'var(--ink-soft)', fontSize: 13, marginBottom: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="calendar" size={13}/> {fmtWhen(s.start_at)}
                    </span>
                    {s.duration && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="clock" size={13}/> {s.duration}
                    </span>}
                    {s.location && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Icon name="pin" size={13}/> {s.location}
                    </span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex' }}>
                      {assignees.map((m, i) => (
                        <div key={m.id} style={{ marginInlineStart: i === 0 ? 0 : -8 }}>
                          <Avatar initials={m.initials} tone={m.tone} size="sm" />
                        </div>
                      ))}
                      {[...Array(empty)].map((_, i) => (
                        <div key={'e' + i} style={{
                          marginInlineStart: -8,
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
                    {s.skills.map((sk) => <SkillChip key={sk.name} name={sk.name} min_level={sk.min_level} />)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}
                     onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" onClick={() => onSlotClick(s)}>
                    {isReadOnly ? 'View slot' : isDraft ? 'Open draft' : 'View slot'}
                  </Button>
                  {isDraft && (
                    <Button size="sm" icon="check"
                            disabled={updateState.isPending}
                            onClick={(e) => publishDraft(e, s)}>
                      Publish
                    </Button>
                  )}
                  {!isDraft && !isReadOnly && s.filled < s.needed && s.state === 'published' && (
                    <Button size="sm" icon="plus" onClick={() => onSlotClick(s)}>
                      Assign
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
