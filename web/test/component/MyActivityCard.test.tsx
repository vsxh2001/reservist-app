/**
 * MyActivityCard tests — extracted from ReservistDashboard in #97.
 *
 * Covers the empty-list null guard, basic row rendering, and the
 * "Showing latest N" cap hint that surfaces when the list hits the
 * server-side limit.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyActivityCard } from '../../src/components/MyActivityCard';
import type { ActivityItem } from '../../src/lib/types';

function row(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 'a-1',
    team_id: 'team-1',
    actor_id: 'm-actor',
    actor_name: 'Bravo Squad',
    verb: 'created duty slot',
    what: 'Northern QRF',
    tone: 'accent',
    created_at: new Date().toISOString(),
    ...overrides,
  } as unknown as ActivityItem;
}

describe('MyActivityCard', () => {
  it('renders nothing when activity is empty (parent can drop it in unconditionally)', () => {
    const { container } = render(<MyActivityCard activity={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the testid hook and one row per activity item', () => {
    const items = [
      row({ id: 'a-1', verb: 'assigned' }),
      row({ id: 'a-2', verb: 'unassigned' }),
      row({ id: 'a-3', verb: 'edited slot' }),
    ];
    render(<MyActivityCard activity={items} />);
    expect(screen.getByTestId('my-activity')).toBeInTheDocument();
    expect(screen.getByTestId('my-activity-row-a-1')).toBeInTheDocument();
    expect(screen.getByTestId('my-activity-row-a-2')).toBeInTheDocument();
    expect(screen.getByTestId('my-activity-row-a-3')).toBeInTheDocument();
  });

  it('shows the verb and "what" detail with bullet separator', () => {
    render(<MyActivityCard activity={[row({ verb: 'created duty slot', what: 'Northern QRF' })]} />);
    expect(screen.getByText('created duty slot')).toBeInTheDocument();
    expect(screen.getByText(/Northern QRF/)).toBeInTheDocument();
  });

  it('omits the "·" detail block when `what` is null', () => {
    render(<MyActivityCard activity={[row({ verb: 'logged in', what: null })]} />);
    expect(screen.getByText('logged in')).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('shows the "Showing latest 10" hint when at the cap (>= 10 items)', () => {
    const items = Array.from({ length: 10 }, (_, i) => row({ id: `a-${i}` }));
    render(<MyActivityCard activity={items} />);
    expect(screen.getByTestId('my-activity-cap-hint')).toHaveTextContent(/Showing latest 10/);
  });

  it('omits the cap hint when below 10 items', () => {
    const items = Array.from({ length: 5 }, (_, i) => row({ id: `a-${i}` }));
    render(<MyActivityCard activity={items} />);
    expect(screen.queryByTestId('my-activity-cap-hint')).not.toBeInTheDocument();
  });
});
