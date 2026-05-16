// Icons + atoms (Avatar, StatusPill, Tag, etc.)
// Stroke icons inspired by Phosphor / Lucide line set.

const Icon = ({ name, size = 16, stroke = 1.6, ...rest }) => {
  const P = { available: () => <><circle cx="8" cy="8" r="3.2"/></>,
              search: () => <><circle cx="7.5" cy="7.5" r="4.8"/><path d="M11 11l3 3"/></>,
              x: () => <><path d="M4 4l8 8M12 4l-8 8"/></>,
              check: () => <><path d="M3.5 8.5l3 3 6-6"/></>,
              chevDown: () => <><path d="M4 6l4 4 4-4"/></>,
              chevRight: () => <><path d="M6 4l4 4-4 4"/></>,
              filter: () => <><path d="M2.5 4h11M4.5 8h7M6.5 12h3"/></>,
              sort: () => <><path d="M4 5l2-2 2 2M6 3v10M12 11l-2 2-2-2M10 13V3"/></>,
              plus: () => <><path d="M8 3v10M3 8h10"/></>,
              minus: () => <><path d="M3 8h10"/></>,
              bell: () => <><path d="M4 11h8l-1-2V7a3 3 0 0 0-6 0v2l-1 2zM6.5 13a1.5 1.5 0 0 0 3 0"/></>,
              phone: () => <><path d="M5 3.5h2l1 2.5-1.4 1A6 6 0 0 0 9 9.4l1-1.4 2.5 1V11a1.5 1.5 0 0 1-1.5 1.5A8.5 8.5 0 0 1 3.5 4 1.5 1.5 0 0 1 5 2.5"/></>,
              whatsapp: () => <><path d="M3 13l.9-2.7A5 5 0 1 1 6 13.2zM6.2 7.6c.4 1 1.2 1.8 2.2 2.2.3.1.6.1.8-.1l.4-.4c.1-.1.3-.2.5-.1l1 .4c.2.1.3.3.3.5v.5c0 .3-.2.5-.5.5a4 4 0 0 1-3.9-3.9c0-.3.2-.5.5-.5h.5c.2 0 .4.1.5.3l.4 1c.1.2 0 .4-.1.5l-.4.4c-.2.2-.2.5-.1.8z"/></>,
              copy: () => <><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M11 5V4a1.5 1.5 0 0 0-1.5-1.5h-5A1.5 1.5 0 0 0 3 4v5A1.5 1.5 0 0 0 4.5 10.5h.5"/></>,
              roster: () => <><circle cx="6" cy="6" r="2"/><path d="M2.5 12c.6-1.8 1.8-2.8 3.5-2.8s2.9 1 3.5 2.8M11 7a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6M10.5 9.5c1.5 0 2.5.8 3 2"/></>,
              calendar: () => <><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M5 2.5v2M11 2.5v2M2.5 6.5h11"/></>,
              slots: () => <><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M2.5 6.5h11M6.5 6.5v7"/></>,
              activity: () => <><path d="M2 8h2.5l1.5-4 3 8 1.5-4H14"/></>,
              reviews: () => <><path d="M8 2.5l1.7 3.4 3.8.5-2.7 2.6.7 3.8L8 11l-3.5 1.8.7-3.8L2.5 6.4l3.8-.5z"/></>,
              settings: () => <><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4"/></>,
              urgent: () => <><path d="M8 2.5l6 11H2z"/><path d="M8 7v3"/><circle cx="8" cy="11.6" r=".6" fill="currentColor"/></>,
              clock: () => <><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/></>,
              pin: () => <><path d="M8 13.5l3-4.5a3 3 0 1 0-6 0z"/><circle cx="8" cy="8.5" r="1"/></>,
              skill: () => <><path d="M3 11l3-3 2.5 2.5L13 5"/><path d="M10 5h3v3"/></>,
              user: () => <><circle cx="8" cy="6" r="2.5"/><path d="M3 13c.7-2.4 2.5-3.5 5-3.5s4.3 1.1 5 3.5"/></>,
              users: () => <><circle cx="6" cy="6" r="2"/><path d="M2 13c.5-2 1.8-3 4-3s3.5 1 4 3M11 8a2 2 0 1 0 0-4M14 13c-.4-1.7-1.4-2.5-3-2.7"/></>,
              star: () => <><path d="M8 2.5l1.7 3.4 3.8.5-2.7 2.6.7 3.8L8 11l-3.5 1.8.7-3.8L2.5 6.4l3.8-.5z" fill="currentColor"/></>,
              starOpen: () => <><path d="M8 2.5l1.7 3.4 3.8.5-2.7 2.6.7 3.8L8 11l-3.5 1.8.7-3.8L2.5 6.4l3.8-.5z"/></>,
              moreHoriz: () => <><circle cx="3.5" cy="8" r=".9" fill="currentColor"/><circle cx="8" cy="8" r=".9" fill="currentColor"/><circle cx="12.5" cy="8" r=".9" fill="currentColor"/></>,
              shield: () => <><path d="M8 2L3 4v4.5C3 11.5 5.5 13 8 14c2.5-1 5-2.5 5-5.5V4z"/></>,
              eyeOff: () => <><path d="M2 2l12 12M6 5.5A6 6 0 0 0 2 8c1.5 2.5 3.5 4 6 4 1 0 1.9-.2 2.7-.6M11.8 11.8C13.1 11 14.2 9.7 15 8a8 8 0 0 0-7-4M6.5 8a1.5 1.5 0 0 0 1.5 1.5"/></>,
              edit: () => <><path d="M10.5 3.5l2 2M3 13l1-3 6.5-6.5 2 2L6 12z"/></>,
              link: () => <><path d="M9 5h2.5a2.5 2.5 0 1 1 0 5H9M7 11H4.5a2.5 2.5 0 1 1 0-5H7M5.5 8h5"/></>,
              dollar: () => <><path d="M10 5H7a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 1 0 3H5.5M8 3v2M8 11v2"/></>,
              radio: () => <><circle cx="8" cy="8" r="1.5"/><path d="M5.5 5.5a3.5 3.5 0 0 0 0 5M10.5 5.5a3.5 3.5 0 0 1 0 5M3 3.5a7 7 0 0 0 0 9M13 3.5a7 7 0 0 1 0 9"/></>,
            }[name] || (() => null);
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: 'block' }} {...rest}>
      <P />
    </svg>
  );
};

const Avatar = ({ name, initials, tone = 0, size = 'md', status }) => (
  <div className="avatar" data-size={size === 'md' ? null : size} data-tone={tone}
       aria-label={name} title={name}>
    {initials}
    {status && <span className="status-ring" data-status={status} />}
  </div>
);

const StatusPill = ({ status, children }) => (
  <span className="pill" data-status={status}>
    <span className="dot" />
    {children || (window.STATUS_LABEL && window.STATUS_LABEL[status]) || status}
  </span>
);

const Tag = ({ children, tone, mono }) => (
  <span className={"tag" + (mono ? " tag-mono" : "")} data-tone={tone}>{children}</span>
);

const Button = ({ children, variant, size, icon, iconRight, ...rest }) => (
  <button className="btn" data-variant={variant} data-size={size} {...rest}>
    {icon && <Icon name={icon} />}
    {children}
    {iconRight && <Icon name={iconRight} />}
  </button>
);

const IconButton = ({ icon, tip, tone, size = 'icon-sm', ...rest }) => (
  <button className="action-btn" data-tip={tip} data-tone={tone} {...rest}>
    <Icon name={icon} size={14} />
  </button>
);

// Role symbol — small svg for the role label
const RoleGlyph = ({ role, size = 14 }) => {
  // Subtle glyph differentiations — kept minimal/civilian
  const map = {
    "Squad Leader":    <path d="M3 12V5l4-2 6 3v6M7 8v6"/>,
    "Rifleman":        <path d="M2.5 10.5L13 4M13 4l-1 3M13 4l-3 1M5 11l-1 1.5"/>,
    "Combat Medic":    <><path d="M8 4v8M4 8h8"/><circle cx="8" cy="8" r="5.5"/></>,
    "Combat Engineer": <path d="M3 13l5-5 2 2-5 5zM11 4l1.5 1.5M9.5 5.5L12 8"/>,
    "Sharpshooter":    <><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2"/></>,
    "MAG Gunner":      <path d="M2 9h11M3 7h9l-1-2H4zM5 11v1.5M11 11v1.5"/>,
    "RPG Gunner":      <path d="M2 9l9-3 2 1.5L4 11zM5 11l-1 2"/>,
    "Driver":          <><circle cx="5" cy="11" r="1.5"/><circle cx="11" cy="11" r="1.5"/><path d="M2 11h1.5M13 11h1M3.5 11V7l2-3h5l2 3v4M6.5 7h3"/></>,
    "Signals":         <><circle cx="8" cy="8" r="1"/><path d="M5.5 5.5a3.5 3.5 0 0 0 0 5M10.5 5.5a3.5 3.5 0 0 1 0 5M3 3.5a7 7 0 0 0 0 9M13 3.5a7 7 0 0 1 0 9"/></>,
    "Drone Operator":  <><circle cx="8" cy="8" r="2"/><path d="M3 3l3 3M13 3l-3 3M3 13l3-3M13 13l-3-3"/></>,
    "Intel Analyst":   <path d="M3 4h10v8H3zM5.5 7h5M5.5 9.5h3"/>,
    "Logistics":       <path d="M2 7l6-3 6 3v3l-6 3-6-3zM2 7l6 3 6-3M8 10v3.5"/>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      {map[role] || <circle cx="8" cy="8" r="3"/>}
    </svg>
  );
};

const Role = ({ role, glyph = true }) => (
  <span className="role">
    {glyph && <RoleGlyph role={role} />}
    {role}
  </span>
);

const Check = ({ on, onClick }) => (
  <span className="check" data-on={on ? '1' : '0'} onClick={onClick} role="checkbox" aria-checked={!!on}>
    {on && <Icon name="check" size={12} stroke={2.2} />}
  </span>
);

// Initials helper from name
const initialsOf = (name) => name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

Object.assign(window, {
  Icon, Avatar, StatusPill, Tag, Button, IconButton, RoleGlyph, Role, Check, initialsOf,
});
