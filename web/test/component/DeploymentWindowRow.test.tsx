/**
 * DeploymentWindowRow tests — focused on the extracted compact row that
 * appears on the reservist dashboard's "My deployments" card. Heavier
 * scenarios (which windows show on the dashboard, banner vs list) belong
 * in ReservistDashboard.test.tsx; here we exercise just the row.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeploymentWindowRow } from '../../src/components/DeploymentWindowRow';
import type { DeploymentWindow } from '../../src/lib/types';

function makeWindow(overrides: Partial<DeploymentWindow> = {}): DeploymentWindow {
  return {
    id: 'w1',
    member_id: 'm1',
    team_id: 't1',
    label: 'June drill',
    start_date: '2099-06-01',
    end_date: '2099-06-07',
    notes: null,
    state: 'open',
    created_by: null,
    created_at: new Date().toISOString(),
    proposed_count: 0,
    approved_count: 0,
    rejected_count: 0,
    withdrawn_count: 0,
    ...overrides,
  };
}

describe('DeploymentWindowRow', () => {
  it('renders label, date range, state badge', () => {
    render(<DeploymentWindowRow w={makeWindow()} onOpen={() => {}} />);
    expect(screen.getByText('June drill')).toBeInTheDocument();
    expect(screen.getByText(/2099-06-01/)).toBeInTheDocument();
    expect(screen.getByText(/2099-06-07/)).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('clicking the row calls onOpen', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DeploymentWindowRow w={makeWindow()} onOpen={onOpen} />);
    await user.click(screen.getByText('June drill'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('Enter key triggers onOpen for keyboard users', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DeploymentWindowRow w={makeWindow()} onOpen={onOpen} />);
    const row = screen.getByRole('button');
    row.focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('Space key triggers onOpen', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DeploymentWindowRow w={makeWindow()} onOpen={onOpen} />);
    const row = screen.getByRole('button');
    row.focus();
    await user.keyboard(' ');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows the countdown only for open windows whose start is within range', () => {
    // windowCountdown returns null when the start is > 60 days out, so pin the
    // test window to "starts tomorrow" relative to now.
    const tomorrow = new Date(Date.now() + 86_400_000);
    const day = (d: Date): string =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const startISO = day(tomorrow);
    const endISO = day(new Date(tomorrow.getTime() + 6 * 86_400_000));

    const { rerender } = render(
      <DeploymentWindowRow
        w={makeWindow({ state: 'open', start_date: startISO, end_date: endISO })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByTestId('window-countdown')).toBeInTheDocument();

    rerender(
      <DeploymentWindowRow
        w={makeWindow({ state: 'closed', start_date: startISO, end_date: endISO })}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByTestId('window-countdown')).not.toBeInTheDocument();
  });

  it('renders the closed state with the closed badge text', () => {
    render(<DeploymentWindowRow w={makeWindow({ state: 'closed' })} onOpen={() => {}} />);
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('shows approved count always; shows proposed only when > 0; shows rejected only when > 0', () => {
    const { rerender } = render(
      <DeploymentWindowRow
        w={makeWindow({ approved_count: 3, proposed_count: 0, rejected_count: 0 })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/3 approved/)).toBeInTheDocument();
    expect(screen.queryByText(/proposed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/rejected/)).not.toBeInTheDocument();

    rerender(
      <DeploymentWindowRow
        w={makeWindow({ approved_count: 1, proposed_count: 2, rejected_count: 4 })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText(/1 approved/)).toBeInTheDocument();
    expect(screen.getByText(/2 proposed/)).toBeInTheDocument();
    expect(screen.getByText(/4 rejected/)).toBeInTheDocument();
  });

  it('dim prop visually dims the row but keeps it interactive', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DeploymentWindowRow w={makeWindow()} onOpen={onOpen} dim />);
    const row = screen.getByRole('button');
    expect(row.style.opacity).toBe('0.85');
    await user.click(row);
    expect(onOpen).toHaveBeenCalled();
  });
});
