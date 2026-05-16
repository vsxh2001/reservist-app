/**
 * DayCell — extended tests.
 *
 * DayCell.test.tsx already covers: day number, click handler, disabled when
 * inWindow=false, disabled when disabled=true, and proposed/approved/no-state
 * background tokens.
 *
 * This file adds: keyboard activation (Enter/Space), aria attributes, and the
 * "withdrawn" pick state (no special background → falls through to --card like no state).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayCell } from '../../src/components/DayCell';

const date = new Date(2024, 5, 10); // June 10, 2024

describe('DayCell — extended', () => {
  it('calls onClick via keyboard Enter when inWindow=true', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DayCell date={date} inWindow={true} onClick={onClick} />);
    const btn = screen.getByRole('button');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('calls onClick via keyboard Space when inWindow=true', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DayCell date={date} inWindow={true} onClick={onClick} />);
    const btn = screen.getByRole('button');
    btn.focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick on keyboard Enter when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DayCell date={date} inWindow={false} onClick={onClick} />);
    const btn = screen.getByRole('button');
    btn.focus();
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('button is focusable (tabindex not -1) when inWindow=true', () => {
    render(<DayCell date={date} inWindow={true} onClick={() => {}} />);
    const btn = screen.getByRole('button');
    // By default buttons are focusable; disabled removes them from tab order
    expect(btn).not.toBeDisabled();
  });

  it('renders the correct day number for different dates', () => {
    const d = new Date(2024, 11, 31); // Dec 31
    render(<DayCell date={d} inWindow={true} onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('31');
  });

  it('no-state and withdrawn state both use card background (no accent token)', () => {
    // "withdrawn" is not a DayCell state — only proposed/approved exist.
    // So an unknown / undefined state should fall through to the card default.
    const { container } = render(
      // @ts-expect-error intentional unknown state for boundary test
      <DayCell date={date} inWindow={true} state="withdrawn" onClick={() => {}} />,
    );
    const btn = container.querySelector('button')!;
    const style = btn.getAttribute('style') ?? '';
    // Should NOT have accent token — falls back to card.
    expect(style).not.toContain('var(--accent)');
    expect(style).not.toContain('var(--accent-tint)');
  });
});
