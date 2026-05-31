import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { Button } from './atoms';
import { usePrefs } from '../lib/prefs';

/**
 * OnboardingTour — a first-run, role-aware welcome carousel.
 *
 * A slideshow (not a spotlight tour) so it can introduce the whole app
 * regardless of the current screen, works for both the commander and the
 * reservist surface, and has no fragile dependency on anchoring to live DOM
 * nodes across ~15 screens. Mounted by RoleRouter on first authenticated load
 * (and re-openable from the "?" in either top bar). The parent owns the
 * "seen" flag — this component just calls `onClose` on finish or skip.
 */

export type TourRole = 'commander' | 'reservist';

interface Step { icon: IconName; title: string; body: string }

interface Props {
  role: TourRole;
  isDivisionAdmin?: boolean;
  onClose: () => void;
}

const WELCOME: Step = {
  icon: 'shield',
  title: 'Welcome to Reservist',
  body: "Your unit's reserve-duty hub — availability, duty slots, and deployments in one place. Here's a quick tour.",
};

const COMMANDER_STEPS: Step[] = [
  { icon: 'roster', title: 'Roster',
    body: 'See everyone on your team, filter by availability or skill, and open a profile to update status, skills, or team membership.' },
  { icon: 'slots', title: 'Duty slots & call-ups',
    body: 'Post duty shifts, flag urgent call-ups, and assign members. Open vs. filled slots are shown at a glance.' },
  { icon: 'calendar', title: 'Calendar & day view',
    body: "Browse published slots by month, or pick a date to see exactly who's on duty that day." },
  { icon: 'users', title: 'Join requests',
    body: 'People join through your invite link. Review their skills and approve or reject — each approval adds them to the team.' },
  { icon: 'activity', title: 'Activity log',
    body: 'A running record of roster changes, assignments, and approvals — exportable as CSV.' },
  { icon: 'settings', title: 'Settings & invites',
    body: 'Manage your invite link, the division skill catalog, what reservists can see, and the display language.' },
];

const ADMIN_STEP: Step = {
  icon: 'shield',
  title: 'Division admin',
  body: 'As a division admin you can create teams and projects, manage members across teams, and grant admin rights.',
};

const RESERVIST_STEPS: Step[] = [
  { icon: 'available', title: 'Your availability',
    body: 'Set whether you’re available, on standby, or unavailable — with an optional note and end date. Commanders plan around it.' },
  { icon: 'skill', title: 'Your skills',
    body: 'Add your skills and set each level so you’re matched to the right duty.' },
  { icon: 'slots', title: 'Upcoming duty',
    body: 'See the slots you’re assigned to, including urgent call-ups and any cancellations.' },
  { icon: 'calendar', title: 'Deployments',
    body: 'When a deployment window opens, mark the days you can serve. Your next deployment shows at the top.' },
  { icon: 'phone', title: 'Phone visibility',
    body: 'Choose whether peers can see your phone number. Commanders always can.' },
  { icon: 'bell', title: 'Notifications',
    body: 'Turn on push notifications for urgent call-ups and deployment decisions.' },
];

const CLOSING: Step = {
  icon: 'check',
  title: "You're all set",
  body: 'Turn on notifications so you never miss an urgent call-up. You can replay this tour anytime from the “?” in the top bar.',
};

export function buildSteps(role: TourRole, isDivisionAdmin = false): Step[] {
  const middle =
    role === 'commander'
      ? [...COMMANDER_STEPS, ...(isDivisionAdmin ? [ADMIN_STEP] : [])]
      : RESERVIST_STEPS;
  return [WELCOME, ...middle, CLOSING];
}

export function OnboardingTour({ role, isDivisionAdmin = false, onClose }: Props) {
  const { dir } = usePrefs();
  const steps = useMemo(() => buildSteps(role, isDivisionAdmin), [role, isDivisionAdmin]);
  const [i, setI] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const last = steps.length - 1;
  const step = steps[i];

  const go = useCallback((to: number) => {
    setI(Math.min(Math.max(to, 0), last));
  }, [last]);
  const next = useCallback(() => {
    setI((cur) => (cur >= last ? cur : cur + 1));
  }, [last]);
  const back = useCallback(() => setI((cur) => (cur <= 0 ? 0 : cur - 1)), []);

  // Focus the dialog on mount so keyboard nav + screen readers start here.
  useEffect(() => { dialogRef.current?.focus(); }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    // Arrow nav, mirrored for RTL so "forward" follows reading direction.
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === forward) { e.preventDefault(); next(); return; }
    if (e.key === backward) { e.preventDefault(); back(); return; }
    // Minimal focus trap: the dialog holds the only interactive controls, so
    // keep Tab inside it.
    if (e.key === 'Tab') {
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault(); first.focus();
      }
    }
  };

  return (
    <div className="modal-overlay" data-open="1" onClick={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onb-title"
        aria-describedby="onb-body"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{ width: 440, maxWidth: '92vw' }}
      >
        <div style={{ position: 'relative', padding: '34px 30px 22px', textAlign: 'center' }}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Skip tour"
            data-tip="Skip"
            style={{ position: 'absolute', top: 12, insetInlineEnd: 12 }}
          >
            <Icon name="x" size={14} />
          </Button>

          <div
            aria-hidden="true"
            style={{
              width: 52, height: 52, margin: '0 auto 16px',
              display: 'grid', placeItems: 'center', borderRadius: 14,
              background: 'var(--accent-tint)', color: 'var(--accent)',
            }}
          >
            <Icon name={step.icon} size={24} />
          </div>

          <h2 id="onb-title" style={{ margin: '0 0 8px', fontSize: 19 }}>{step.title}</h2>
          <p id="onb-body" style={{ margin: 0, color: 'var(--ink-soft)', lineHeight: 1.5, fontSize: 14 }}>
            {step.body}
          </p>

          {/* Progress dots — clickable, with an SR-only step count. */}
          <div
            role="tablist"
            aria-label="Tour progress"
            style={{ display: 'flex', justifyContent: 'center', gap: 7, margin: '22px 0 4px' }}
          >
            {steps.map((s, k) => (
              <button
                key={s.title}
                role="tab"
                aria-selected={k === i}
                aria-label={`Step ${k + 1} of ${steps.length}: ${s.title}`}
                tabIndex={-1}
                onClick={() => go(k)}
                style={{
                  width: k === i ? 18 : 7, height: 7, borderRadius: 99, border: 0,
                  padding: 0, cursor: 'pointer', transition: 'width .18s, background .18s',
                  background: k === i ? 'var(--accent)' : 'var(--line)',
                }}
              />
            ))}
          </div>
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, padding: '14px 22px', borderTop: '1px solid var(--line-soft)',
            background: 'var(--card-soft)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            Step {i + 1} of {steps.length}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={back} disabled={i === 0}>
              Back
            </Button>
            {i === last ? (
              <Button variant="primary" size="sm" icon="check" onClick={onClose}>
                Done
              </Button>
            ) : (
              <Button variant="primary" size="sm" iconRight="chevRight" onClick={next}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
