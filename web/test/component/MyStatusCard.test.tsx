/**
 * MyStatusCard tests — view ↔ edit mode toggle, validation, save & quick-set,
 * pending-state disabled wiring, error humanization.
 *
 * Mocks `useSelfUpdateStatus` from lib/queries (same pattern as
 * DeploymentWindowDrawer.test.tsx / PersonDrawer.test.tsx).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockUpdate = { mutateAsync: vi.fn(), isPending: false };

vi.mock('../../src/lib/queries', () => ({
  useSelfUpdateStatus: () => mockUpdate,
}));

import { MyStatusCard } from '../../src/components/MyStatusCard';
import type { Member, Status } from '../../src/lib/types';

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'me',
    division_id: 'div1',
    name: 'Alon Cohen',
    initials: 'AC',
    tone: 0,
    phone: '0541234567',
    joined: null,
    last_seen: null,
    calls_this_year: 0,
    status: 'available' as Status,
    status_note: null,
    status_until: null,
    status_set_at: new Date().toISOString(),
    is_division_admin: false,
    phone_visible_to_peers: true,
    skills: [],
    teams: [],
    ...overrides,
  } as unknown as Member;
}

describe('MyStatusCard', () => {
  beforeEach(() => {
    mockUpdate.mutateAsync.mockReset();
    mockUpdate.mutateAsync.mockResolvedValue(undefined);
    mockUpdate.isPending = false;
  });

  it('renders the status pill and Change button in view mode', () => {
    render(<MyStatusCard member={makeMember({ status: 'standby' })} userName="Alon" teamId="t1" onToast={() => {}} />);
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
    // StatusPill renders the human label.
    expect(screen.getByText('Standby')).toBeInTheDocument();
  });

  it('shows "Set as available" only when current status is not available', () => {
    const { rerender } = render(
      <MyStatusCard member={makeMember({ status: 'available' })} userName="Alon" teamId="t1" onToast={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Set as available' })).not.toBeInTheDocument();

    rerender(<MyStatusCard member={makeMember({ status: 'released' })} userName="Alon" teamId="t1" onToast={() => {}} />);
    expect(screen.getByRole('button', { name: 'Set as available' })).toBeInTheDocument();
  });

  it('quick-set "Set as available" fires mutateAsync with available + null note/until', async () => {
    const onToast = vi.fn();
    render(<MyStatusCard member={makeMember({ status: 'unavailable' })} userName="Alon" teamId="t1" onToast={onToast} />);
    await userEvent.click(screen.getByRole('button', { name: 'Set as available' }));
    expect(mockUpdate.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mutateAsync.mock.calls[0][0]).toMatchObject({
      memberId: 'me',
      status: 'available',
      note: null,
      until: null,
      teamId: 't1',
      actorName: 'Alon',
    });
    expect(onToast).toHaveBeenCalledWith('Status set to Available');
  });

  it('entering edit mode replaces the Change button with the status picker and Save/Cancel', async () => {
    render(<MyStatusCard member={makeMember({ status: 'standby' })} userName="Alon" teamId="t1" onToast={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
  });

  it('refuses to save and toasts when "Until" is set to a past date', async () => {
    const onToast = vi.fn();
    const { container } = render(
      <MyStatusCard member={makeMember({ status: 'standby' })} userName="Alon" teamId="t1" onToast={onToast} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    // The native date input is the only `type="date"` field in this card.
    const untilInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(untilInput, { target: { value: '2000-01-01' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockUpdate.mutateAsync).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('"Until" date must be today or later');
  });

  it('Save with a valid form posts the mutation and toasts the new status', async () => {
    const onToast = vi.fn();
    render(<MyStatusCard member={makeMember({ status: 'available' })} userName="Alon" teamId="t1" onToast={onToast} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    // Pick "released" status.
    await userEvent.click(screen.getByRole('button', { name: /Released/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockUpdate.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mutateAsync.mock.calls[0][0]).toMatchObject({
      memberId: 'me',
      status: 'released',
      teamId: 't1',
      actorName: 'Alon',
    });
    expect(onToast).toHaveBeenCalledWith('Status set to Released');
  });

  it('humanizes mutateAsync errors into the toast', async () => {
    const onToast = vi.fn();
    mockUpdate.mutateAsync.mockRejectedValueOnce(new Error('PostgREST blew up'));
    render(<MyStatusCard member={makeMember({ status: 'available' })} userName="Alon" teamId="t1" onToast={onToast} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onToast).toHaveBeenCalledWith('Failed to update status: PostgREST blew up');
  });

  it('disables Save while the mutation is in flight', async () => {
    mockUpdate.isPending = true;
    render(<MyStatusCard member={makeMember({ status: 'standby' })} userName="Alon" teamId="t1" onToast={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('preset "1 week" sets the Until date to today+7', async () => {
    render(<MyStatusCard member={makeMember({ status: 'standby' })} userName="Alon" teamId="t1" onToast={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    await userEvent.click(screen.getByRole('button', { name: '1 week' }));
    const target = new Date();
    target.setDate(target.getDate() + 7);
    const expected = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    // Date input value should reflect the preset selection.
    const dateInputs = screen.getAllByDisplayValue(expected);
    expect(dateInputs.length).toBeGreaterThan(0);
  });
});
