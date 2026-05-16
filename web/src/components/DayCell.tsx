// web/src/components/DayCell.tsx
import type { PickState } from '../lib/types';

interface Props {
  date: Date;
  /** Pick state if any, otherwise undefined renders as 'empty'. */
  state?: PickState;
  inWindow: boolean;
  isToday?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}

const stateStyle: Record<PickState, { bg: string; fg: string; border: string }> = {
  proposed:  { bg: 'var(--accent-tint)', fg: 'var(--accent-deep)', border: 'var(--accent)' },
  approved:  { bg: 'var(--accent)',      fg: 'var(--card)',        border: 'var(--accent-deep)' },
  rejected:  { bg: 'var(--urgent-bg)',   fg: 'var(--urgent-deep)', border: 'var(--urgent)' },
  withdrawn: { bg: 'transparent',        fg: 'var(--ink-mute)',    border: 'var(--line)' },
};

export function DayCell({ date, state, inWindow, isToday, disabled, onClick, title }: Props) {
  const s = state ? stateStyle[state] : null;
  const interactive = !disabled && inWindow && !!onClick;
  return (
    <button
      type="button"
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      title={title}
      style={{
        appearance: 'none',
        height: 44, minWidth: 44,
        padding: 0,
        borderRadius: 8,
        border: '1px ' + (state === 'withdrawn' ? 'dashed ' : 'solid ') + (s ? s.border : 'var(--line-soft)'),
        background: s ? s.bg : 'var(--card)',
        color: s ? s.fg : 'var(--ink)',
        opacity: inWindow ? (disabled ? 0.6 : 1) : 0.25,
        cursor: interactive ? 'pointer' : 'default',
        fontFamily: isToday ? 'var(--serif)' : 'var(--sans)',
        fontSize: isToday ? 18 : 13,
        fontWeight: 500,
        display: 'grid', placeItems: 'center',
        position: 'relative',
      }}
    >
      {date.getDate()}
      {isToday && (
        <span style={{
          position: 'absolute', insetInlineStart: '50%', bottom: 4,
          transform: 'translateX(-50%)',
          width: 4, height: 4, borderRadius: 99,
          background: s ? s.fg : 'var(--accent)',
        }} />
      )}
    </button>
  );
}
