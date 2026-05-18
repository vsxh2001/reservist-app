import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, StatusPill, Tag, Avatar, SkillChip, Check } from '../../src/components/atoms';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
describe('Button', () => {
  it('renders its text content', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    await user.click(screen.getByRole('button', { name: 'Click me' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('sets data-variant attribute', () => {
    render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole('button', { name: 'Primary' })).toHaveAttribute('data-variant', 'primary');
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled</Button>);
    const btn = screen.getByRole('button', { name: 'Disabled' });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders ghost variant with correct data-variant', () => {
    render(<Button variant="ghost">Ghost</Button>);
    expect(screen.getByRole('button', { name: 'Ghost' })).toHaveAttribute('data-variant', 'ghost');
  });

  it('derives aria-label from data-tip on an icon-only Button (size="icon")', () => {
    render(<Button variant="ghost" size="icon" data-tip="Back" />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('derives aria-label from data-tip on an icon-only Button (size="icon-sm")', () => {
    render(<Button variant="ghost" size="icon-sm" data-tip="Close" />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('does not override an explicit aria-label on an icon Button', () => {
    render(<Button variant="ghost" size="icon" data-tip="Back" aria-label="Go back" />);
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('does not derive aria-label for a labelled (text-content) Button even if data-tip is set', () => {
    render(<Button variant="ghost" size="sm" data-tip="Commander view">Commander</Button>);
    expect(screen.getByRole('button', { name: 'Commander' })).toBeInTheDocument();
    // Sanity check: the data-tip value is not also exposed as the accessible name.
    expect(screen.queryByRole('button', { name: 'Commander view' })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// StatusPill
// ---------------------------------------------------------------------------
describe('StatusPill', () => {
  it.each([
    ['available', 'Available'],
    ['standby', 'Standby'],
    ['released', 'Released'],
    ['unavailable', 'Unavailable'],
  ] as const)('renders "%s" label for status %s', (status, label) => {
    render(<StatusPill status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------
describe('Tag', () => {
  it('renders children', () => {
    render(<Tag>Alpha</Tag>);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('sets data-tone="accent" when tone prop is "accent"', () => {
    render(<Tag tone="accent">Beta</Tag>);
    const el = screen.getByText('Beta');
    expect(el).toHaveAttribute('data-tone', 'accent');
  });

  it('does not set data-tone when tone is not provided', () => {
    render(<Tag>Gamma</Tag>);
    // attribute may be absent or empty — just ensure no stray value
    const el = screen.getByText('Gamma');
    expect(el).not.toHaveAttribute('data-tone', 'accent');
  });
});

// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
describe('Avatar', () => {
  it('renders initials', () => {
    render(<Avatar initials="AB" />);
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('sets data-tone attribute', () => {
    render(<Avatar initials="CD" tone={3} />);
    const el = screen.getByText('CD');
    expect(el).toHaveAttribute('data-tone', '3');
  });

  it('renders status-ring span when status prop set', () => {
    const { container } = render(<Avatar initials="EF" status="available" />);
    const ring = container.querySelector('.status-ring');
    expect(ring).toBeInTheDocument();
    expect(ring).toHaveAttribute('data-status', 'available');
  });

  it('does not render status-ring when status is not set', () => {
    const { container } = render(<Avatar initials="GH" />);
    expect(container.querySelector('.status-ring')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// SkillChip
// ---------------------------------------------------------------------------
describe('SkillChip', () => {
  it('renders skill name', () => {
    render(<SkillChip name="Marksmanship" level="junior" />);
    expect(screen.getByText('Marksmanship')).toBeInTheDocument();
  });

  it('renders level label in member context', () => {
    render(<SkillChip name="Navigation" level="senior" />);
    expect(screen.getByText('Senior')).toBeInTheDocument();
  });

  it('renders level label for slot-context with "≥" prefix', () => {
    render(<SkillChip name="Driving" min_level="intermediate" />);
    // The ≥ glyph is aria-hidden, check both texts exist
    expect(screen.getByText('Intermediate')).toBeInTheDocument();
    // The aria-hidden span holding ≥
    const { container } = render(<SkillChip name="Driving" min_level="intermediate" />);
    expect(container.querySelector('.skill-chip-gte')).toBeInTheDocument();
  });

  it('does NOT render ≥ for member-context', () => {
    const { container } = render(<SkillChip name="Driving" level="junior" />);
    expect(container.querySelector('.skill-chip-gte')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------
describe('Check', () => {
  it('renders checkmark icon when on=true', () => {
    const { container } = render(<Check on={true} />);
    // The Icon renders an <svg> child when on is true
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('does not render checkmark icon when on=false', () => {
    const { container } = render(<Check on={false} />);
    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });

  it('has aria-checked=true when on=true', () => {
    render(<Check on={true} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
  });

  it('has aria-checked=false when on=false', () => {
    render(<Check on={false} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
  });
});
