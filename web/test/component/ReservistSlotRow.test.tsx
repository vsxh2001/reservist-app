/**
 * ReservistSlotRow tests — focused on the extracted component's render +
 * interaction behavior. Heavier scenarios (cancelled-section gating, who is
 * "me") live in ReservistDashboard.test.tsx; here we exercise just the row.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReservistSlotRow, type ReservistSlotRowSlot } from '../../src/components/ReservistSlotRow';
import type { Member } from '../../src/lib/types';

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    division_id: 'div1',
    name: 'Alice Cohen',
    initials: 'AC',
    tone: 0,
    phone: '0541234567',
    joined: '2023-01',
    last_seen: '2 days ago',
    calls_this_year: 0,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: new Date().toISOString(),
    is_division_admin: false,
    phone_visible_to_peers: true,
    skills: [],
    teams: [{ team_id: 't1', role: 'soldier' }],
    ...overrides,
  };
}

function makeSlot(overrides: Partial<ReservistSlotRowSlot> = {}): ReservistSlotRowSlot {
  return {
    id: 's1',
    title: 'Night patrol',
    urgent: false,
    state: 'published',
    start_at: '2099-06-10T20:00:00Z',
    duration: '4h',
    location: 'Base North',
    notes: null,
    assignee_id: null,
    ...overrides,
  };
}

describe('ReservistSlotRow', () => {
  it('renders title, time, duration, location', () => {
    render(<ReservistSlotRow s={makeSlot()} />);
    expect(screen.getByText('Night patrol')).toBeInTheDocument();
    expect(screen.getByText('4h')).toBeInTheDocument();
    expect(screen.getByText('Base North')).toBeInTheDocument();
  });

  it('is non-interactive when no notes and unassigned', () => {
    render(<ReservistSlotRow s={makeSlot()} />);
    const title = screen.getByText('Night patrol');
    expect(title.closest('[role="button"]')).toBeNull();
  });

  it('is interactive when slot has notes', () => {
    render(<ReservistSlotRow s={makeSlot({ notes: 'Bring rifle' })} />);
    const row = screen.getByText('Night patrol').closest('[role="button"]') as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.getAttribute('aria-expanded')).toBe('false');
  });

  it('is interactive when slot has an assignee', () => {
    render(<ReservistSlotRow s={makeSlot({ assignee_id: 'm1' })} />);
    const row = screen.getByText('Night patrol').closest('[role="button"]') as HTMLElement;
    expect(row).not.toBeNull();
  });

  it('clicking expands the row to reveal notes', async () => {
    const user = userEvent.setup();
    render(<ReservistSlotRow s={makeSlot({ notes: 'Bring rifle' })} />);
    const row = screen.getByText('Night patrol').closest('[role="button"]') as HTMLElement;
    expect(screen.queryByText('Bring rifle')).not.toBeInTheDocument();
    await user.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Bring rifle')).toBeInTheDocument();
  });

  it('Enter key expands the row', async () => {
    const user = userEvent.setup();
    render(<ReservistSlotRow s={makeSlot({ notes: 'Quiet sector' })} />);
    const row = screen.getByText('Night patrol').closest('[role="button"]') as HTMLElement;
    row.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText('Quiet sector')).toBeInTheDocument();
  });

  it('shows "You" when assignee_id matches myMemberId', async () => {
    const user = userEvent.setup();
    const memberById = new Map<string, Member>([['m1', makeMember({ id: 'm1', name: 'Yael Cohen' })]]);
    render(
      <ReservistSlotRow
        s={makeSlot({ assignee_id: 'm1' })}
        memberById={memberById}
        myMemberId="m1"
      />,
    );
    const row = screen.getByText('Night patrol').closest('[role="button"]') as HTMLElement;
    await user.click(row);
    const block = screen.getByTestId('assignees');
    expect(within(block).getByText('You')).toBeInTheDocument();
  });

  it('shows the peer name plus tel: + WhatsApp links when peer has a visible phone', async () => {
    const user = userEvent.setup();
    const peer = makeMember({ id: 'm2', name: 'Daniel Katz', phone: '054-123-4567', phone_visible_to_peers: true });
    const memberById = new Map<string, Member>([['m2', peer]]);
    render(
      <ReservistSlotRow
        s={makeSlot({ assignee_id: 'm2' })}
        memberById={memberById}
        myMemberId="m-self"
      />,
    );
    const row = screen.getByText('Night patrol').closest('[role="button"]') as HTMLElement;
    await user.click(row);

    expect(screen.getByText('Daniel Katz')).toBeInTheDocument();
    const call = screen.getByRole('link', { name: 'Call Daniel Katz' });
    expect(call).toHaveAttribute('href', 'tel:+972541234567');
    const wa = screen.getByRole('link', { name: 'WhatsApp Daniel Katz' });
    expect(wa).toHaveAttribute('href', 'https://wa.me/972541234567');
  });

  it('falls back to em-dash when assignee id is missing from the members map', async () => {
    const user = userEvent.setup();
    render(
      <ReservistSlotRow
        s={makeSlot({ assignee_id: 'm-unknown' })}
        memberById={new Map()}
        myMemberId="m-self"
      />,
    );
    const row = screen.getByText('Night patrol').closest('[role="button"]') as HTMLElement;
    await user.click(row);
    const block = screen.getByTestId('assignees');
    expect(within(block).getByText('—')).toBeInTheDocument();
  });

  it('cancelled state renders the "Cancelled" pill alongside the title', () => {
    render(<ReservistSlotRow s={makeSlot({ state: 'cancelled', assignee_id: 'm1' })} />);
    expect(screen.getByText('Cancelled', { selector: 'span' })).toBeInTheDocument();
  });

  it('clicking the call link does not collapse the row (stopPropagation)', async () => {
    const user = userEvent.setup();
    const peer = makeMember({ id: 'm2', name: 'Daniel Katz', phone: '0541234567', phone_visible_to_peers: true });
    const memberById = new Map<string, Member>([['m2', peer]]);
    render(
      <ReservistSlotRow
        s={makeSlot({ assignee_id: 'm2' })}
        memberById={memberById}
        myMemberId="m-self"
      />,
    );
    const row = screen.getByText('Night patrol').closest('[role="button"]') as HTMLElement;
    await user.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');

    const call = screen.getByRole('link', { name: 'Call Daniel Katz' });
    await user.click(call);
    expect(row.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders no call/WhatsApp link when the peer phone is null (opted out)', async () => {
    const user = userEvent.setup();
    const peer = makeMember({ id: 'm2', name: 'Noa Shapira' });
    // members_view returns phone=null when phone_visible_to_peers=false for a peer.
    (peer as unknown as { phone: string | null }).phone = null;
    const memberById = new Map<string, Member>([['m2', peer]]);
    render(
      <ReservistSlotRow
        s={makeSlot({ assignee_id: 'm2' })}
        memberById={memberById}
        myMemberId="m-self"
      />,
    );
    const row = screen.getByText('Night patrol').closest('[role="button"]') as HTMLElement;
    await user.click(row);

    expect(screen.getByText('Noa Shapira')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Call Noa Shapira' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'WhatsApp Noa Shapira' })).not.toBeInTheDocument();
  });
});
