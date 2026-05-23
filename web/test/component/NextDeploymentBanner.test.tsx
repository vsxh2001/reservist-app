/**
 * NextDeploymentBanner tests — focused on the extracted component's branches.
 *
 * The banner is purely presentational once `window` and `onOpen` are passed
 * in. We verify (a) the null-render guard, (b) the countdown copy variants,
 * and (c) the click/keyboard activation contract.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextDeploymentBanner } from '../../src/components/NextDeploymentBanner';
import type { DeploymentWindow } from '../../src/lib/types';

function makeWindow(overrides: Partial<DeploymentWindow> = {}): DeploymentWindow {
  return {
    id: 'w1',
    team_id: 'team-1',
    label: 'June drill',
    start_date: '2099-06-10',
    end_date: '2099-06-20',
    state: 'open',
    notes: null,
    created_by: 'm-creator',
    approved_count: 2,
    proposed_count: 5,
    ...overrides,
  } as unknown as DeploymentWindow;
}

describe('NextDeploymentBanner', () => {
  it('returns null when window is null (no DOM emitted)', () => {
    const { container } = render(<NextDeploymentBanner window={null} onOpen={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders label, date range, and counts when window is set', () => {
    render(<NextDeploymentBanner window={makeWindow()} onOpen={() => {}} />);
    expect(screen.getByText('June drill')).toBeInTheDocument();
    expect(screen.getByText(/2099-06-10/)).toBeInTheDocument();
    expect(screen.getByText(/2099-06-20/)).toBeInTheDocument();
    expect(screen.getByText(/2 approved/)).toBeInTheDocument();
    expect(screen.getByText(/5 proposed/)).toBeInTheDocument();
  });

  it('emits a countdown for a near-future window (<= 60 days out)', () => {
    // windowCountdown returns null past 60 days, so place start ~5 days out.
    const start = new Date(Date.now() + 5 * 86_400_000);
    const end = new Date(Date.now() + 6 * 86_400_000);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    render(<NextDeploymentBanner window={makeWindow({ start_date: iso(start), end_date: iso(end) })} onOpen={() => {}} />);
    const countdown = screen.queryByTestId('banner-countdown');
    expect(countdown).toBeInTheDocument();
    expect(countdown!.textContent).toMatch(/starts in|tomorrow|in progress/);
  });

  it('omits the countdown for a far-future window (> 60 days out)', () => {
    render(<NextDeploymentBanner window={makeWindow()} onOpen={() => {}} />);
    expect(screen.queryByTestId('banner-countdown')).not.toBeInTheDocument();
  });

  it('exposes aria-label and role="button" so screen readers announce the activation target', () => {
    render(<NextDeploymentBanner window={makeWindow()} onOpen={() => {}} />);
    const banner = screen.getByRole('button', { name: /Open June drill deployment window/i });
    expect(banner).toBeInTheDocument();
  });

  it('calls onOpen when clicked', async () => {
    const onOpen = vi.fn();
    render(<NextDeploymentBanner window={makeWindow()} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /Open June drill/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('calls onOpen when Enter is pressed while focused', async () => {
    const onOpen = vi.fn();
    render(<NextDeploymentBanner window={makeWindow()} onOpen={onOpen} />);
    const banner = screen.getByRole('button', { name: /Open June drill/i });
    banner.focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
