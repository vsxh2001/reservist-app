import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { PrefsProvider } from '../../src/lib/prefs';
import { OnboardingTour, buildSteps } from '../../src/components/OnboardingTour';

// The tour is a role-aware slideshow mounted by RoleRouter on first run. These
// tests pin the step composition per role and the dialog's navigation /
// dismissal contract (parent owns the seen-flag via onClose).

function wrap(ui: ReactNode) {
  return render(createElement(PrefsProvider, null, ui));
}

describe('buildSteps', () => {
  it('commander gets the commander set, bookended by welcome + closing', () => {
    const steps = buildSteps('commander', false);
    expect(steps[0].title).toBe('Welcome to Reservist');
    expect(steps[steps.length - 1].title).toBe("You're all set");
    expect(steps.map((s) => s.title)).toContain('Duty slots & call-ups');
    expect(steps.map((s) => s.title)).not.toContain('Your availability');
    expect(steps).toHaveLength(8); // welcome + 6 commander + closing
  });

  it('division admin gets one extra slide', () => {
    const steps = buildSteps('commander', true);
    expect(steps.map((s) => s.title)).toContain('Division admin');
    expect(steps).toHaveLength(9);
  });

  it('reservist gets the reservist set', () => {
    const steps = buildSteps('reservist', false);
    expect(steps.map((s) => s.title)).toContain('Your availability');
    expect(steps.map((s) => s.title)).not.toContain('Roster');
    // isDivisionAdmin is ignored for reservists.
    expect(buildSteps('reservist', true).map((s) => s.title)).not.toContain('Division admin');
    expect(steps).toHaveLength(8);
  });
});

describe('OnboardingTour', () => {
  it('opens on the welcome slide with a full set of progress dots', () => {
    wrap(<OnboardingTour role="commander" onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Welcome to Reservist' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 8')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(8);
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Next advances through the slides; the last slide shows Done', () => {
    wrap(<OnboardingTour role="commander" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Roster' })).toBeTruthy();
    expect(screen.getByText('Step 2 of 8')).toBeTruthy();
    // Walk to the end.
    for (let k = 0; k < 6; k++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: "You're all set" })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('a dot jumps straight to that slide', () => {
    wrap(<OnboardingTour role="reservist" onClose={vi.fn()} />);
    const dots = screen.getAllByRole('tab');
    fireEvent.click(dots[4]);
    expect(screen.getByText('Step 5 of 8')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Deployments' })).toBeTruthy();
  });

  it('Done calls onClose', () => {
    const onClose = vi.fn();
    wrap(<OnboardingTour role="reservist" onClose={onClose} />);
    const dots = screen.getAllByRole('tab');
    fireEvent.click(dots[dots.length - 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Skip calls onClose', () => {
    const onClose = vi.fn();
    wrap(<OnboardingTour role="commander" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the dialog', () => {
    const onClose = vi.fn();
    wrap(<OnboardingTour role="commander" onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ArrowRight advances, ArrowLeft retreats (LTR default)', () => {
    wrap(<OnboardingTour role="commander" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowRight' });
    expect(screen.getByText('Step 2 of 8')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'ArrowLeft' });
    expect(screen.getByText('Step 1 of 8')).toBeTruthy();
  });

  it('exposes a labelled modal dialog', () => {
    wrap(<OnboardingTour role="commander" onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // The accessible name comes from the current slide title.
    expect(within(dialog).getByRole('heading', { name: 'Welcome to Reservist' })).toBeTruthy();
  });
});
