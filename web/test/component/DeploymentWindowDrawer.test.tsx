/**
 * DeploymentWindowDrawer component tests.
 *
 * DeploymentWindowDrawer receives a DeploymentWindow + metadata via props and
 * fetches its own picks via useDeploymentPicks(windowId). It pulls auth from
 * useAuth() and writes via four mutation hooks.
 *
 * Mocked:
 *   - useAuth()                  → stable commander user
 *   - useDeploymentPicks         → controlled list of picks per window id
 *   - useResolvePick             → approve / reject a proposed pick
 *   - useDirectAddPick           → commander adds a day directly as approved
 *   - useWithdrawDayPick         → withdraw an approved pick
 *   - useUpdateDeploymentWindow  → save edit-mode patch / close window
 *
 * Notes / coverage skipped:
 *   - useProposeDayPick: NOT used by this component. The "empty day" tap path
 *     always opens the "Add as approved" affordance regardless of role, which
 *     routes to useDirectAddPick. Reservist-proposes-on-tap is not implemented
 *     here, so there is nothing to assert.
 *   - long-press / secondary-action "reject from grid": no such gesture in
 *     this component — rejection is via the Reject button in the day panel,
 *     which IS covered.
 *   - exact pixel colors per pick state: tested via the existing DayCell
 *     suite. We assert state-driven behaviour (disabled cells, day-panel
 *     content) rather than re-asserting style strings.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeploymentPick, DeploymentWindow } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks — must precede the component import.
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Commander Test' },
    authUser: null,
    status: 'linked',
  }),
}));

const mockResolve  = { mutateAsync: vi.fn(), isPending: false };
const mockDirect   = { mutateAsync: vi.fn(), isPending: false };
const mockWithdraw = { mutateAsync: vi.fn(), isPending: false };
const mockUpdate   = { mutateAsync: vi.fn(), isPending: false };

let pickRows: DeploymentPick[] = [];

vi.mock('../../src/lib/queries', () => ({
  useDeploymentPicks: () => ({ data: pickRows, isLoading: false, error: null }),
  useResolvePick:           () => mockResolve,
  useDirectAddPick:         () => mockDirect,
  useWithdrawDayPick:       () => mockWithdraw,
  useUpdateDeploymentWindow: () => mockUpdate,
}));

import { DeploymentWindowDrawer } from '../../src/components/DeploymentWindowDrawer';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWindow(overrides: Partial<DeploymentWindow> = {}): DeploymentWindow {
  return {
    id: 'w1',
    member_id: 'm1',
    team_id: 'team1',
    label: 'June drill',
    start_date: '2026-06-01',
    end_date: '2026-06-07',
    notes: null,
    state: 'open',
    created_by: 'u1',
    created_at: '2026-05-01T00:00:00.000Z',
    proposed_count: 0,
    approved_count: 0,
    rejected_count: 0,
    withdrawn_count: 0,
    ...overrides,
  };
}

function makePick(overrides: Partial<DeploymentPick> = {}): DeploymentPick {
  return {
    id: 'p1',
    window_id: 'w1',
    date: '2026-06-03',
    state: 'proposed',
    reservist_note: null,
    commander_note: null,
    proposed_at: '2026-05-15T00:00:00.000Z',
    resolved_at: null,
    resolved_by: null,
    ...overrides,
  };
}

interface RenderOpts {
  window?: Partial<DeploymentWindow>;
  memberName?: string;
  teamId?: string;
  picks?: DeploymentPick[];
}

function renderDrawer(opts: RenderOpts = {}) {
  pickRows = opts.picks ?? [];
  const w = makeWindow(opts.window);
  const onClose = vi.fn();
  const onToast = vi.fn();
  const utils = render(
    <DeploymentWindowDrawer
      window={w}
      memberName={opts.memberName ?? 'Alice Cohen'}
      teamId={opts.teamId ?? 'team1'}
      onClose={onClose}
      onToast={onToast}
    />,
  );
  return { ...utils, window: w, onClose, onToast };
}

/**
 * Find the in-window DayCell button for the given day-of-month within
 * the drawer dialog. Skips disabled padding cells and cells from other months.
 */
function findDayButton(dayOfMonth: number): HTMLButtonElement {
  const dialog = screen.getByRole('dialog');
  const candidates = within(dialog).getAllByRole('button', { name: String(dayOfMonth) });
  // The in-window day cell is enabled; padding cells (outside window) are
  // disabled. Filter to the enabled one.
  const enabled = candidates.find((b) => !(b as HTMLButtonElement).disabled);
  if (enabled) return enabled as HTMLButtonElement;
  // If the test wants a disabled cell (closed window), there should be a
  // single matching day cell whose text is exactly the dayOfMonth.
  return candidates[0] as HTMLButtonElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeploymentWindowDrawer', () => {
  beforeEach(() => {
    mockResolve.mutateAsync.mockReset().mockResolvedValue(undefined);
    mockDirect.mutateAsync.mockReset().mockResolvedValue(undefined);
    mockWithdraw.mutateAsync.mockReset().mockResolvedValue(undefined);
    mockUpdate.mutateAsync.mockReset().mockResolvedValue(undefined);
    pickRows = [];
  });

  // -------- header / metadata -------------------------------------------

  it('renders the window header: label, date range, and open state badge', () => {
    renderDrawer({
      window: { label: 'June drill', start_date: '2026-06-01', end_date: '2026-06-07', state: 'open' },
    });
    const dialog = screen.getByRole('dialog', { name: 'June drill' });
    expect(within(dialog).getByRole('heading', { level: 3, name: 'June drill' })).toBeInTheDocument();
    expect(within(dialog).getByText('2026-06-01 → 2026-06-07')).toBeInTheDocument();
    expect(within(dialog).getByText('open')).toBeInTheDocument();
  });

  it('renders the closed state badge when window.state === "closed"', () => {
    renderDrawer({ window: { state: 'closed' } });
    expect(screen.getByText('closed')).toBeInTheDocument();
  });

  it('renders notes line when window.notes is set', () => {
    renderDrawer({ window: { notes: 'Annual reservist drill week.' } });
    expect(screen.getByText('Annual reservist drill week.')).toBeInTheDocument();
  });

  // -------- month grid + day-of-week headers ----------------------------

  it('renders the Mon-Sun day-of-week headers', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog');
    for (const dow of ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']) {
      expect(within(dialog).getByText(dow)).toBeInTheDocument();
    }
  });

  it('renders the month-of-year heading for the window range', () => {
    renderDrawer({
      window: { start_date: '2026-06-01', end_date: '2026-06-07' },
    });
    expect(screen.getByRole('heading', { level: 4, name: /June 2026/i })).toBeInTheDocument();
  });

  it('renders multiple month sections when the window spans months', () => {
    renderDrawer({
      window: { start_date: '2026-06-15', end_date: '2026-07-10' },
    });
    expect(screen.getByRole('heading', { level: 4, name: /June 2026/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: /July 2026/i })).toBeInTheDocument();
  });

  // -------- day cells reflect pick state --------------------------------

  it('in-window day cells are enabled buttons; out-of-window padding cells are disabled', () => {
    renderDrawer({
      window: { start_date: '2026-06-03', end_date: '2026-06-05' },
    });
    // Day 4 is inside the window → enabled.
    const inWin = findDayButton(4);
    expect(inWin).not.toBeDisabled();
    // Day 1 is in the month but outside the window → disabled.
    const outOfWin = findDayButton(1);
    expect(outOfWin).toBeDisabled();
  });

  it('day cell with no pick opens the empty day panel ("Add as approved" affordance)', async () => {
    const user = userEvent.setup();
    renderDrawer({
      window: { start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [],
    });
    await user.click(findDayButton(3));
    expect(screen.getByText(/Empty · 2026-06-03/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add as approved/i })).toBeInTheDocument();
  });

  it('day cell with a proposed pick exposes its title (commander_note / reservist_note)', () => {
    renderDrawer({
      window: { start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ date: '2026-06-03', state: 'proposed', reservist_note: 'wedding' })],
    });
    const cell = findDayButton(3);
    expect(cell.title).toBe('wedding');
  });

  // -------- empty day tap → direct add (commander) ----------------------

  it('clicking "Add as approved" on an empty day calls useDirectAddPick with the right payload', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      window: { id: 'w1', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [],
      memberName: 'Alice Cohen',
      teamId: 'team1',
    });
    await user.click(findDayButton(4));
    await user.click(screen.getByRole('button', { name: /Add as approved/i }));

    expect(mockDirect.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockDirect.mutateAsync.mock.calls[0][0];
    expect(arg.windowId).toBe('w1');
    expect(arg.date).toBe('2026-06-04');
    expect(arg.actorId).toBe('u1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.teamId).toBe('team1');
    expect(arg.memberName).toBe('Alice Cohen');
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Added 2026-06-04/));
  });

  // -------- proposed day → approve / reject -----------------------------

  it('clicking a proposed day surfaces approve + reject; Approve calls useResolvePick with nextState=approved', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      window: { id: 'w1', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ id: 'p1', date: '2026-06-03', state: 'proposed' })],
      memberName: 'Alice Cohen',
      teamId: 'team1',
    });

    await user.click(findDayButton(3));
    expect(screen.getByText(/PROPOSED · 2026-06-03/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Approve/i }));

    expect(mockResolve.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockResolve.mutateAsync.mock.calls[0][0];
    expect(arg.pickId).toBe('p1');
    expect(arg.nextState).toBe('approved');
    expect(arg.commanderNote).toBeNull();
    expect(arg.actorId).toBe('u1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.teamId).toBe('team1');
    expect(arg.memberId).toBe('m1');
    expect(arg.memberName).toBe('Alice Cohen');
    expect(arg.windowLabel).toBe('June drill');
    expect(arg.date).toBe('2026-06-03');
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Approved 2026-06-03/));
  });

  it('Reject on a proposed day calls useResolvePick with nextState=rejected and forwards the commander note', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      window: { id: 'w1', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ id: 'p1', date: '2026-06-03', state: 'proposed' })],
    });

    await user.click(findDayButton(3));
    const noteInput = screen.getByPlaceholderText(/Commander note/i);
    await user.type(noteInput, 'Need coverage');
    await user.click(screen.getByRole('button', { name: /Reject/i }));

    expect(mockResolve.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockResolve.mutateAsync.mock.calls[0][0];
    expect(arg.pickId).toBe('p1');
    expect(arg.nextState).toBe('rejected');
    expect(arg.commanderNote).toBe('Need coverage');
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Rejected 2026-06-03/));
  });

  it('proposed pick with reservist_note renders the quoted note in the day panel', async () => {
    const user = userEvent.setup();
    renderDrawer({
      window: { start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ date: '2026-06-03', state: 'proposed', reservist_note: 'family wedding' })],
    });
    await user.click(findDayButton(3));
    expect(screen.getByText(/family wedding/)).toBeInTheDocument();
  });

  // -------- approved day → withdraw -------------------------------------

  it('clicking an approved day shows a Withdraw button that calls useWithdrawDayPick', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      window: { start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ id: 'p7', date: '2026-06-03', state: 'approved' })],
    });
    await user.click(findDayButton(3));
    expect(screen.getByText(/APPROVED · 2026-06-03/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Withdraw/i }));

    expect(mockWithdraw.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockWithdraw.mutateAsync.mock.calls[0][0]).toEqual({ pickId: 'p7' });
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/Withdrew 2026-06-03/));
  });

  // -------- rejected day → shows note, no actions ----------------------

  it('rejected pick with a commander note renders the rejection note', async () => {
    const user = userEvent.setup();
    renderDrawer({
      window: { start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ date: '2026-06-03', state: 'rejected', commander_note: 'Too many out' })],
    });
    await user.click(findDayButton(3));
    expect(screen.getByText(/REJECTED · 2026-06-03/)).toBeInTheDocument();
    expect(screen.getByText(/Rejected with note: "Too many out"/)).toBeInTheDocument();
    // No approve/reject/withdraw on a rejected pick.
    expect(screen.queryByRole('button', { name: /Approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Withdraw/i })).not.toBeInTheDocument();
  });

  // -------- closed window: read-only ------------------------------------

  it('closed window disables every day cell so clicking does nothing', async () => {
    const user = userEvent.setup();
    renderDrawer({
      window: { state: 'closed', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ date: '2026-06-03', state: 'proposed' })],
    });

    const cell = findDayButton(3);
    expect(cell).toBeDisabled();
    // userEvent on a disabled button is a no-op; assert no day panel appears
    // and no mutation fires.
    await user.click(cell).catch(() => undefined);
    expect(screen.queryByText(/PROPOSED · 2026-06-03/)).not.toBeInTheDocument();
    expect(mockResolve.mutateAsync).not.toHaveBeenCalled();
    expect(mockDirect.mutateAsync).not.toHaveBeenCalled();
  });

  it('closed window hides the "Close window (archive)" action; open window shows it', () => {
    const { unmount } = renderDrawer({ window: { state: 'open' } });
    expect(screen.getByRole('button', { name: /Close window/i })).toBeInTheDocument();
    unmount();
    renderDrawer({ window: { state: 'closed' } });
    expect(screen.queryByRole('button', { name: /Close window/i })).not.toBeInTheDocument();
  });

  // -------- edit mode ---------------------------------------------------

  it('Edit toggles the form; Save calls useUpdateDeploymentWindow with the patched fields', async () => {
    const user = userEvent.setup();
    const { onToast } = renderDrawer({
      window: {
        id: 'w1', label: 'June drill',
        start_date: '2026-06-01', end_date: '2026-06-07', notes: null,
      },
      teamId: 'team1',
    });

    // Header is in display mode initially.
    expect(screen.getByRole('heading', { level: 3, name: 'June drill' })).toBeInTheDocument();

    await user.click(screen.getByText('Edit'));

    // Now in edit mode — heading replaced by an input bearing the label.
    const labelInput = screen.getByPlaceholderText('Label') as HTMLInputElement;
    expect(labelInput.value).toBe('June drill');
    await user.clear(labelInput);
    await user.type(labelInput, 'Summer drill');

    const notesInput = screen.getByPlaceholderText('Notes') as HTMLInputElement;
    await user.type(notesInput, 'Bring kit');

    await user.click(screen.getByRole('button', { name: /Save/i }));

    expect(mockUpdate.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockUpdate.mutateAsync.mock.calls[0][0];
    expect(arg.windowId).toBe('w1');
    expect(arg.teamId).toBe('team1');
    expect(arg.actorId).toBe('u1');
    expect(arg.actorName).toBe('Commander Test');
    expect(arg.patch).toMatchObject({
      label: 'Summer drill',
      startDate: '2026-06-01',
      endDate: '2026-06-07',
      notes: 'Bring kit',
    });
    expect(onToast).toHaveBeenCalledWith('Window updated');
  });

  it('Edit → Cancel reverts pending changes and returns to display mode', async () => {
    const user = userEvent.setup();
    renderDrawer({ window: { label: 'June drill' } });
    await user.click(screen.getByText('Edit'));
    const labelInput = screen.getByPlaceholderText('Label') as HTMLInputElement;
    await user.clear(labelInput);
    await user.type(labelInput, 'Changed');
    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    // Back to display mode with the original label.
    expect(screen.getByRole('heading', { level: 3, name: 'June drill' })).toBeInTheDocument();
    expect(mockUpdate.mutateAsync).not.toHaveBeenCalled();
  });

  // -------- close-window action -----------------------------------------

  it('Close window (archive) calls useUpdateDeploymentWindow with state:"closed" then onClose', async () => {
    const user = userEvent.setup();
    const { onClose, onToast } = renderDrawer({
      window: { id: 'w1', state: 'open' },
      teamId: 'team1',
    });
    await user.click(screen.getByRole('button', { name: /Close window/i }));

    expect(mockUpdate.mutateAsync).toHaveBeenCalledTimes(1);
    const arg = mockUpdate.mutateAsync.mock.calls[0][0];
    expect(arg.windowId).toBe('w1');
    expect(arg.teamId).toBe('team1');
    expect(arg.patch).toEqual({ state: 'closed' });
    expect(onToast).toHaveBeenCalledWith('Window closed');
    expect(onClose).toHaveBeenCalled();
  });

  // -------- close button ------------------------------------------------

  it('clicking the close (×) button invokes onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByRole('button', { name: /^Close$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the drawer overlay invokes onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    const overlay = document.querySelector('.drawer-overlay') as HTMLElement | null;
    expect(overlay).not.toBeNull();
    await user.click(overlay!);
    expect(onClose).toHaveBeenCalled();
  });
});
