/**
 * BulkCancelModal component tests.
 *
 * Strategy: vi.mock useAuth and useBulkCancelSlots so the modal can be mounted
 * stand-alone without an AuthProvider or QueryClient. We assert:
 *   - the modal renders only when `open` is true
 *   - the live match-count reflects state-in-(draft,published) AND in range
 *   - confirm triggers the mutation with the right ISO bounds
 *   - the confirm button is disabled when the range matches 0 slots
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Slot } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
  }),
}));

const mockBulkCancel = { mutateAsync: vi.fn(), isPending: false };
vi.mock('../../src/lib/queries', () => ({
  useBulkCancelSlots: () => mockBulkCancel,
}));

import { BulkCancelModal } from '../../src/components/BulkCancelModal';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSlot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: 's1',
    team_id: 'team1',
    title: 'Slot',
    urgent: false,
    state: 'published',
    start_at: '2026-06-10T09:00:00.000Z',
    end_at: '2026-06-10T17:00:00.000Z',
    duration: '8h',
    location: null,
    needed: 1,
    notes: null,
    role: null,
    skills: [],
    assignee_ids: [],
    filled: 0,
    ...overrides,
  };
}

// Three slots inside the default-ish range, one outside, one already cancelled.
const SLOTS: Slot[] = [
  makeSlot({ id: 'a', state: 'published', start_at: '2026-06-10T09:00:00.000Z' }),
  makeSlot({ id: 'b', state: 'draft',     start_at: '2026-06-11T09:00:00.000Z' }),
  makeSlot({ id: 'c', state: 'published', start_at: '2026-06-12T09:00:00.000Z' }),
  makeSlot({ id: 'd', state: 'cancelled', start_at: '2026-06-10T09:00:00.000Z' }),
  makeSlot({ id: 'e', state: 'completed', start_at: '2026-06-10T09:00:00.000Z' }),
  makeSlot({ id: 'f', state: 'published', start_at: '2026-07-01T09:00:00.000Z' }),
];

function renderModal(open = true, slots: Slot[] = SLOTS) {
  const onClose = vi.fn();
  const onToast = vi.fn();
  const utils = render(
    <BulkCancelModal
      open={open}
      teamId="team1"
      slots={slots}
      onClose={onClose}
      onToast={onToast}
    />,
  );
  return { ...utils, onClose, onToast };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BulkCancelModal', () => {
  beforeEach(() => {
    mockBulkCancel.mutateAsync.mockReset();
    mockBulkCancel.mutateAsync.mockResolvedValue(3);
  });

  it('renders nothing when open=false', () => {
    const { container } = renderModal(false);
    expect(container.firstChild).toBeNull();
  });

  it('renders date inputs and a match-count when open', () => {
    renderModal(true);
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-cancel-match-count')).toBeInTheDocument();
  });

  it('counts only draft + published slots whose start_at is in range', () => {
    renderModal(true);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to   = screen.getByLabelText('To')   as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-06-10' } });
    fireEvent.change(to,   { target: { value: '2026-06-12' } });
    // Three in-range, draft/published slots: a, b, c. d (cancelled), e (completed), f (out of range) excluded.
    expect(screen.getByTestId('bulk-cancel-match-count').textContent).toMatch(/3 slots/);
  });

  it('shows "No slots match" when range matches nothing and disables confirm', () => {
    renderModal(true);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to   = screen.getByLabelText('To')   as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2030-01-01' } });
    fireEvent.change(to,   { target: { value: '2030-01-02' } });
    expect(screen.getByTestId('bulk-cancel-match-count').textContent).toMatch(/No slots match/);
    const confirmBtn = screen.getByRole('button', { name: /Cancel\s+slot/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('flags an invalid range when From > To', () => {
    renderModal(true);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to   = screen.getByLabelText('To')   as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-06-12' } });
    fireEvent.change(to,   { target: { value: '2026-06-10' } });
    expect(screen.getByTestId('bulk-cancel-match-count').textContent).toMatch(/Invalid date range/);
  });

  it('calls the bulk-cancel mutation with the right team and ISO bounds', async () => {
    const user = userEvent.setup();
    const { onClose, onToast } = renderModal(true);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to   = screen.getByLabelText('To')   as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-06-10' } });
    fireEvent.change(to,   { target: { value: '2026-06-12' } });

    const confirmBtn = screen.getByRole('button', { name: /Cancel\s+3\s+slots/i });
    await user.click(confirmBtn);

    expect(mockBulkCancel.mutateAsync).toHaveBeenCalledTimes(1);
    const call = mockBulkCancel.mutateAsync.mock.calls[0][0];
    expect(call.teamId).toBe('team1');
    expect(call.actorId).toBe('u1');
    expect(call.actorName).toBe('Commander Test');
    // fromISO is start-of-day 2026-06-10 local; toISO is end-of-day 2026-06-12 local.
    expect(typeof call.fromISO).toBe('string');
    expect(typeof call.toISO).toBe('string');
    expect(Date.parse(call.fromISO)).toBeLessThan(Date.parse(call.toISO));
    expect(onClose).toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Cancelled 3 slots/));
  });

  it('does not fire the mutation when the date range is invalid', async () => {
    const user = userEvent.setup();
    renderModal(true);
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const to   = screen.getByLabelText('To')   as HTMLInputElement;
    fireEvent.change(from, { target: { value: '2026-06-12' } });
    fireEvent.change(to,   { target: { value: '2026-06-10' } });

    const confirmBtn = screen.getByRole('button', { name: /Cancel\s+slot/i });
    expect(confirmBtn).toBeDisabled();
    // Clicking a disabled button is a no-op, but assert nothing fired anyway.
    await user.click(confirmBtn);
    expect(mockBulkCancel.mutateAsync).not.toHaveBeenCalled();
  });
});
