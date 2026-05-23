import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { SKILL_LEVEL_LABEL, STATUS_LABEL, type SkillLevel, type Status } from '../lib/types';

export function Avatar({
  initials, tone = 0, size = 'md', status,
}: {
  name?: string;
  initials: string;
  tone?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  status?: Status;
}) {
  return (
    <div
      className="avatar"
      data-size={size === 'md' ? null : size}
      data-tone={tone}
    >
      {initials}
      {status && <span className="status-ring" data-status={status} />}
    </div>
  );
}

export function StatusPill({ status, children }: { status: Status; children?: ReactNode }) {
  return (
    <span className="pill" data-status={status}>
      <span className="dot" />
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

export function Tag({
  children, tone, mono,
}: { children: ReactNode; tone?: 'accent'; mono?: boolean }) {
  return (
    <span className={'tag' + (mono ? ' tag-mono' : '')} data-tone={tone}>
      {children}
    </span>
  );
}

/**
 * SkillChip — leveled skill pill.
 * `level`: shown in member contexts (the level the member has).
 * `min_level`: shown in slot/requirement contexts (minimum needed); rendered with a "≥" prefix.
 */
export function SkillChip(
  props:
    | { name: string; level: SkillLevel; min_level?: never }
    | { name: string; min_level: SkillLevel; level?: never },
) {
  const isRequirement = 'min_level' in props && props.min_level !== undefined;
  const lvl: SkillLevel = isRequirement ? props.min_level! : props.level!;
  const label = SKILL_LEVEL_LABEL[lvl];
  return (
    <span
      className="skill-chip"
      data-level={lvl}
      data-kind={isRequirement ? 'req' : 'have'}
      title={isRequirement ? `Requires ${label} or higher` : `Level: ${label}`}
    >
      <span className="skill-chip-name">{props.name}</span>
      <span className="skill-chip-lvl">
        {isRequirement && <span className="skill-chip-gte" aria-hidden="true">≥</span>}
        {label}
      </span>
    </span>
  );
}

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'ghost' | 'outline' | 'primary' | 'urgent';
  size?: 'sm' | 'icon' | 'icon-sm';
  icon?: IconName;
  iconRight?: IconName;
}

export function Button({ children, variant, size, icon, iconRight, className, ...rest }: BtnProps) {
  // Icon-only buttons (no visible children, just an icon) need an a11y name.
  // Many callers already pass `data-tip` for the visual tooltip but skip
  // `aria-label`; derive one from data-tip when the caller didn't provide an
  // explicit aria-label or aria-labelledby. Cheap, backward-compatible, and
  // means screen readers stop hearing an unnamed button.
  const restAny = rest as Record<string, unknown>;
  const ariaLabelled = restAny['aria-label'] != null || restAny['aria-labelledby'] != null;
  const dataTip = typeof restAny['data-tip'] === 'string' ? (restAny['data-tip'] as string) : undefined;
  const needsDerivedLabel =
    !ariaLabelled
    && dataTip
    && (size === 'icon' || size === 'icon-sm' || (icon && children == null));
  const derivedProps = needsDerivedLabel ? { 'aria-label': dataTip } : null;
  return (
    <button
      className={'btn' + (className ? ' ' + className : '')}
      data-variant={variant}
      data-size={size}
      {...rest}
      {...derivedProps}
    >
      {icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
}

export function IconButton({
  icon, tip, tone, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; tip?: string; tone?: 'whatsapp' | 'phone' }) {
  return (
    <button className="action-btn" data-tip={tip} data-tone={tone} {...rest}>
      <Icon name={icon} size={14} />
    </button>
  );
}

const roleGlyphs: Record<string, JSX.Element> = {
  'Squad Leader':    <path d="M3 12V5l4-2 6 3v6M7 8v6" />,
  'Rifleman':        <path d="M2.5 10.5L13 4M13 4l-1 3M13 4l-3 1M5 11l-1 1.5" />,
  'Combat Medic':    <><path d="M8 4v8M4 8h8" /><circle cx="8" cy="8" r="5.5" /></>,
  'Combat Engineer': <path d="M3 13l5-5 2 2-5 5zM11 4l1.5 1.5M9.5 5.5L12 8" />,
  'Sharpshooter':    <><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2" /></>,
  'MAG Gunner':      <path d="M2 9h11M3 7h9l-1-2H4zM5 11v1.5M11 11v1.5" />,
  'RPG Gunner':      <path d="M2 9l9-3 2 1.5L4 11zM5 11l-1 2" />,
  'Driver':          <><circle cx="5" cy="11" r="1.5" /><circle cx="11" cy="11" r="1.5" /><path d="M2 11h1.5M13 11h1M3.5 11V7l2-3h5l2 3v4M6.5 7h3" /></>,
  'Signals':         <><circle cx="8" cy="8" r="1" /><path d="M5.5 5.5a3.5 3.5 0 0 0 0 5M10.5 5.5a3.5 3.5 0 0 1 0 5M3 3.5a7 7 0 0 0 0 9M13 3.5a7 7 0 0 1 0 9" /></>,
  'Drone Operator':  <><circle cx="8" cy="8" r="2" /><path d="M3 3l3 3M13 3l-3 3M3 13l3-3M13 13l-3-3" /></>,
  'Intel Analyst':   <path d="M3 4h10v8H3zM5.5 7h5M5.5 9.5h3" />,
  'Logistics':       <path d="M2 7l6-3 6 3v3l-6 3-6-3zM2 7l6 3 6-3M8 10v3.5" />,
};

export function RoleGlyph({ role, size = 14 }: { role: string | null; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {(role && roleGlyphs[role]) || <circle cx="8" cy="8" r="3" />}
    </svg>
  );
}

export function Role({ role, glyph = true }: { role: string | null; glyph?: boolean }) {
  return (
    <span className="role">
      {glyph && <RoleGlyph role={role} />}
      {role}
    </span>
  );
}

export function Check({ on, onClick }: { on: boolean; onClick?: (e: React.SyntheticEvent) => void }) {
  return (
    <span
      className="check"
      data-on={on ? '1' : '0'}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(e);
        }
      }}
      role="checkbox"
      aria-checked={on}
      tabIndex={onClick ? 0 : -1}
    >
      {on && <Icon name="check" size={12} stroke={2.2} />}
    </span>
  );
}
