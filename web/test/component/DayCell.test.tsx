import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayCell } from '../../src/components/DayCell';

const date = new Date(2024, 0, 15); // Jan 15, 2024 → getDate() === 15

describe('DayCell', () => {
  it('renders the day number', () => {
    render(<DayCell date={date} inWindow={true} onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveTextContent('15');
  });

  it('is clickable when inWindow=true and not disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<DayCell date={date} inWindow={true} onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('has disabled HTML attribute when inWindow=false', () => {
    render(<DayCell date={date} inWindow={false} onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('has disabled HTML attribute when disabled=true even if inWindow=true', () => {
    render(<DayCell date={date} inWindow={true} disabled={true} onClick={() => {}} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('inline style changes with pick state — proposed uses accent-tint background', () => {
    render(<DayCell date={date} inWindow={true} state="proposed" onClick={() => {}} />);
    const btn = screen.getByRole('button');
    // happy-dom preserves inline style strings — check bg token
    expect(btn.getAttribute('style')).toContain('var(--accent-tint)');
  });

  it('inline style changes with pick state — approved uses accent background', () => {
    render(<DayCell date={date} inWindow={true} state="approved" onClick={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('style')).toContain('var(--accent)');
  });

  it('no pick state uses card background', () => {
    render(<DayCell date={date} inWindow={true} onClick={() => {}} />);
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('style')).toContain('var(--card)');
  });
});
