/**
 * CommanderTopbar tests — extracted from Dashboard.tsx in this PR.
 *
 * Pure presentational: all state via props, all changes via callbacks.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommanderTopbar } from '../../src/components/CommanderTopbar';
import type { ActivityItem } from '../../src/lib/types';

function makeActivity(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 'a1',
    team_id: 't1',
    actor_id: 'm1',
    actor_name: 'Avi',
    verb: 'created duty slot',
    what: 'Patrol',
    tone: 'accent',
    created_at: new Date().toISOString(),
    ...overrides,
  } as unknown as ActivityItem;
}

function makeProps(overrides: Partial<React.ComponentProps<typeof CommanderTopbar>> = {}): React.ComponentProps<typeof CommanderTopbar> {
  return {
    title: { title: 'Roster', em: '· Alpha' },
    hasUrgentOpen: false,
    bellOpen: false,
    onToggleBell: vi.fn(),
    activity: [],
    onSwitchToReservist: undefined,
    onOpenMobileMenu: vi.fn(),
    onOpenInviteSettings: vi.fn(),
    onNewSlot: vi.fn(),
    ...overrides,
  };
}

describe('CommanderTopbar', () => {
  it('renders the title text and em fragment', () => {
    render(<CommanderTopbar {...makeProps({ title: { title: 'Duty slots', em: '· Alpha' } })} />);
    expect(screen.getByText('Duty slots')).toBeInTheDocument();
    expect(screen.getByText('· Alpha')).toBeInTheDocument();
  });

  it('emits the urgent dot when hasUrgentOpen is true', () => {
    const { container, rerender } = render(<CommanderTopbar {...makeProps({ hasUrgentOpen: false })} />);
    // The dot is the only span inside the bell button with the urgent background var;
    // grep for the background color attribute on a span.
    const without = container.querySelectorAll('span[style*="--urgent"]');
    expect(without).toHaveLength(0);
    rerender(<CommanderTopbar {...makeProps({ hasUrgentOpen: true })} />);
    const withDot = container.querySelectorAll('span[style*="--urgent"]');
    expect(withDot.length).toBeGreaterThan(0);
  });

  it('Activity bell button calls onToggleBell', async () => {
    const onToggleBell = vi.fn();
    render(<CommanderTopbar {...makeProps({ onToggleBell })} />);
    await userEvent.click(screen.getByRole('button', { name: /Activity/i }));
    expect(onToggleBell).toHaveBeenCalledTimes(1);
  });

  it('Invite-member shortcut calls onOpenInviteSettings', async () => {
    const onOpenInviteSettings = vi.fn();
    render(<CommanderTopbar {...makeProps({ onOpenInviteSettings })} />);
    await userEvent.click(screen.getByRole('button', { name: /Invite member/i }));
    expect(onOpenInviteSettings).toHaveBeenCalledTimes(1);
  });

  it('"New slot" calls onNewSlot(false); "Urgent call-up" calls onNewSlot(true)', async () => {
    const onNewSlot = vi.fn();
    render(<CommanderTopbar {...makeProps({ onNewSlot })} />);
    await userEvent.click(screen.getByRole('button', { name: 'New slot' }));
    expect(onNewSlot).toHaveBeenLastCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Urgent call-up' }));
    expect(onNewSlot).toHaveBeenLastCalledWith(true);
  });

  it('mobile-menu button calls onOpenMobileMenu', async () => {
    const onOpenMobileMenu = vi.fn();
    render(<CommanderTopbar {...makeProps({ onOpenMobileMenu })} />);
    await userEvent.click(screen.getByRole('button', { name: /Menu/i }));
    expect(onOpenMobileMenu).toHaveBeenCalledTimes(1);
  });

  it('renders "Reservist view" button when onSwitchToReservist is provided', () => {
    const { rerender } = render(<CommanderTopbar {...makeProps({ onSwitchToReservist: undefined })} />);
    expect(screen.queryByRole('button', { name: /Reservist view/i })).not.toBeInTheDocument();
    rerender(<CommanderTopbar {...makeProps({ onSwitchToReservist: () => {} })} />);
    expect(screen.getByRole('button', { name: /Reservist view/i })).toBeInTheDocument();
  });

  it('bell popover toggles open via data-open attribute when bellOpen changes', () => {
    const { container, rerender } = render(<CommanderTopbar {...makeProps({ bellOpen: false })} />);
    expect(container.querySelector('.bell-pop')).toHaveAttribute('data-open', '0');
    rerender(<CommanderTopbar {...makeProps({ bellOpen: true })} />);
    expect(container.querySelector('.bell-pop')).toHaveAttribute('data-open', '1');
  });

  it('renders up to 6 activity rows; shows empty-state copy when activity is empty', () => {
    const eight = Array.from({ length: 8 }, (_, i) => makeActivity({ id: `a-${i}`, actor_name: `Actor ${i}` }));
    const { container, rerender } = render(<CommanderTopbar {...makeProps({ activity: eight })} />);
    expect(container.querySelectorAll('.bell-item')).toHaveLength(6);
    rerender(<CommanderTopbar {...makeProps({ activity: [] })} />);
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
  });
});
