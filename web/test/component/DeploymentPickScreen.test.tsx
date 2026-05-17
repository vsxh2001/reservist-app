/**
 * DeploymentPickScreen component tests.
 *
 * DeploymentPickScreen is the reservist-side counterpart to
 * DeploymentWindowDrawer. It renders one DeploymentWindow and lets the
 * reservist propose / withdraw their own day picks within the window range.
 *
 * Mocked:
 *   - useDeploymentPicks    → controlled list of picks for this window
 *   - useProposeDayPick     → propose a day (empty / rejected / withdrawn cell)
 *   - useWithdrawDayPick    → withdraw an existing proposed / approved pick
 *
 * Notes / coverage skipped:
 *   - "Approved pick rendered with checkmark / styling; not interactive for
 *     reservist": the component DOES make approved cells interactive — tapping
 *     an approved cell calls useWithdrawDayPick. DayCell renders no checkmark
 *     glyph; approved styling is verified by the DayCell suite. We instead
 *     assert the actual behavior (tap-on-approved → withdraw).
 *   - "Rejected pick shows reason text": this screen renders the commander
 *     note only as the cell's `title` attribute (no inline reason banner /
 *     day panel here). We assert the title surface accordingly.
 *   - No long-press / secondary gesture exists.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeploymentPick, DeploymentWindow } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Mocks — must precede the component import.
// ---------------------------------------------------------------------------

const mockPropose  = { mutateAsync: vi.fn(), isPending: false };
const mockWithdraw = { mutateAsync: vi.fn(), isPending: false };
const mockSetNote  = { mutateAsync: vi.fn(), isPending: false };

let pickRows: DeploymentPick[] = [];

vi.mock('../../src/lib/queries', () => ({
  useDeploymentPicks:    () => ({ data: pickRows, isLoading: false, error: null }),
  useProposeDayPick:     () => mockPropose,
  useWithdrawDayPick:    () => mockWithdraw,
  useSetReservistNote:   () => mockSetNote,
}));

import { DeploymentPickScreen } from '../../src/components/DeploymentPickScreen';

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
  picks?: DeploymentPick[];
}

function renderScreen(opts: RenderOpts = {}) {
  pickRows = opts.picks ?? [];
  const w = makeWindow(opts.window);
  const onClose = vi.fn();
  const onToast = vi.fn();
  const utils = render(
    <DeploymentPickScreen window={w} onClose={onClose} onToast={onToast} />,
  );
  return { ...utils, window: w, onClose, onToast };
}

/**
 * Find the in-window DayCell button for a given day-of-month. Padding cells
 * (outside the current month or outside the window) render as disabled
 * buttons with the same digit label, so we prefer the enabled match.
 */
function findDayButton(dayOfMonth: number): HTMLButtonElement {
  const candidates = screen.getAllByRole('button', { name: String(dayOfMonth) });
  const enabled = candidates.find((b) => !(b as HTMLButtonElement).disabled);
  if (enabled) return enabled as HTMLButtonElement;
  return candidates[0] as HTMLButtonElement;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeploymentPickScreen', () => {
  beforeEach(() => {
    mockPropose.mutateAsync.mockReset().mockResolvedValue(undefined);
    mockWithdraw.mutateAsync.mockReset().mockResolvedValue(undefined);
    mockSetNote.mutateAsync.mockReset().mockResolvedValue(undefined);
    pickRows = [];
  });

  // -------- header / metadata ------------------------------------------

  it('renders the window header: label and date range', () => {
    renderScreen({
      window: { label: 'June drill', start_date: '2026-06-01', end_date: '2026-06-07' },
    });
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('June drill');
    expect(heading).toHaveTextContent('2026-06-01 → 2026-06-07');
  });

  it('renders pick-count legend reflecting the window counts', () => {
    renderScreen({
      window: {
        start_date: '2026-06-01', end_date: '2026-06-07',
        approved_count: 2, proposed_count: 1, rejected_count: 3,
      },
    });
    expect(screen.getByText('2 approved')).toBeInTheDocument();
    expect(screen.getByText('1 proposed')).toBeInTheDocument();
    expect(screen.getByText('3 rejected')).toBeInTheDocument();
  });

  it('renders a Closed badge in the legend when window.state === "closed"', () => {
    renderScreen({ window: { state: 'closed' } });
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('does not render the Closed badge when window.state === "open"', () => {
    renderScreen({ window: { state: 'open' } });
    expect(screen.queryByText('Closed')).not.toBeInTheDocument();
  });

  // -------- month grid -------------------------------------------------

  it('renders Mon-Sun day-of-week headers', () => {
    renderScreen();
    for (const dow of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(dow)).toBeInTheDocument();
    }
  });

  it('renders a month heading for the window range', () => {
    renderScreen({ window: { start_date: '2026-06-01', end_date: '2026-06-07' } });
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent(/June/);
    expect(heading).toHaveTextContent(/2026/);
  });

  it('renders multiple month sections when the window spans months', () => {
    renderScreen({ window: { start_date: '2026-06-25', end_date: '2026-07-05' } });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.some((t) => /June/.test(t ?? ''))).toBe(true);
    expect(headings.some((t) => /July/.test(t ?? ''))).toBe(true);
  });

  it('in-window day cells are enabled; out-of-window/out-of-month cells are disabled', () => {
    renderScreen({ window: { start_date: '2026-06-03', end_date: '2026-06-05' } });
    expect(findDayButton(4)).not.toBeDisabled();
    // Day 1 is in June 2026 but outside the window → disabled.
    const candidates = screen.getAllByRole('button', { name: '1' });
    expect(candidates.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  // -------- empty day → propose ---------------------------------------

  it('tapping an empty in-window day calls useProposeDayPick with the right payload', async () => {
    const user = userEvent.setup();
    const { onToast } = renderScreen({
      window: { id: 'w1', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [],
    });

    await user.click(findDayButton(4));

    expect(mockPropose.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockPropose.mutateAsync.mock.calls[0][0]).toEqual({
      windowId: 'w1',
      date: '2026-06-04',
      reservistNote: null,
    });
    expect(mockWithdraw.mutateAsync).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('Marked 2026-06-04');
  });

  it('tapping a rejected day re-proposes (calls useProposeDayPick again)', async () => {
    const user = userEvent.setup();
    renderScreen({
      window: { id: 'w1', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ date: '2026-06-03', state: 'rejected', commander_note: 'No' })],
    });

    await user.click(findDayButton(3));

    expect(mockPropose.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockPropose.mutateAsync.mock.calls[0][0]).toMatchObject({
      windowId: 'w1', date: '2026-06-03',
    });
    expect(mockWithdraw.mutateAsync).not.toHaveBeenCalled();
  });

  it('tapping a withdrawn day re-proposes (calls useProposeDayPick again)', async () => {
    const user = userEvent.setup();
    renderScreen({
      window: { id: 'w1', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ date: '2026-06-03', state: 'withdrawn' })],
    });

    await user.click(findDayButton(3));

    expect(mockPropose.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockWithdraw.mutateAsync).not.toHaveBeenCalled();
  });

  // -------- proposed day → withdraw -----------------------------------

  it('tapping a day with the reservist\'s own proposed pick calls useWithdrawDayPick', async () => {
    const user = userEvent.setup();
    const { onToast } = renderScreen({
      window: { id: 'w1', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ id: 'p42', date: '2026-06-03', state: 'proposed' })],
    });

    await user.click(findDayButton(3));

    expect(mockWithdraw.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockWithdraw.mutateAsync.mock.calls[0][0]).toEqual({ pickId: 'p42' });
    expect(mockPropose.mutateAsync).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith('Withdrew 2026-06-03');
  });

  // -------- approved day ----------------------------------------------

  // Implementation note: an approved pick IS interactive for the reservist —
  // tapping it withdraws. The task brief mentioned a "checkmark / not
  // interactive" affordance that the source does NOT implement, so we assert
  // the actual behavior here.
  it('tapping an approved pick calls useWithdrawDayPick', async () => {
    const user = userEvent.setup();
    const { onToast } = renderScreen({
      window: { id: 'w1', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ id: 'p7', date: '2026-06-03', state: 'approved' })],
    });

    await user.click(findDayButton(3));

    expect(mockWithdraw.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockWithdraw.mutateAsync.mock.calls[0][0]).toEqual({ pickId: 'p7' });
    expect(onToast).toHaveBeenCalledWith('Withdrew 2026-06-03');
  });

  // -------- rejected day → exposes reason via title ------------------

  it('rejected pick exposes the commander note via the cell title (tooltip)', () => {
    renderScreen({
      window: { start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ date: '2026-06-03', state: 'rejected', commander_note: 'Too many out' })],
    });
    const cell = findDayButton(3);
    expect(cell.title).toBe('Too many out');
  });

  it('proposed pick with a reservist_note exposes it via the cell title', () => {
    renderScreen({
      window: { start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ date: '2026-06-03', state: 'proposed', reservist_note: 'family wedding' })],
    });
    const cell = findDayButton(3);
    expect(cell.title).toBe('family wedding');
  });

  // -------- closed window → read-only --------------------------------

  it('closed window: tapping a day does not propose or withdraw', async () => {
    const user = userEvent.setup();
    const { onToast } = renderScreen({
      window: { id: 'w1', state: 'closed', start_date: '2026-06-01', end_date: '2026-06-07' },
      picks: [makePick({ date: '2026-06-03', state: 'proposed' })],
    });

    // The button itself is not `disabled` (busyDay gate), so userEvent.click
    // delivers the event; the component's tap handler early-returns on closed.
    await user.click(findDayButton(3)).catch(() => undefined);
    await user.click(findDayButton(4)).catch(() => undefined);

    expect(mockPropose.mutateAsync).not.toHaveBeenCalled();
    expect(mockWithdraw.mutateAsync).not.toHaveBeenCalled();
    expect(onToast).not.toHaveBeenCalled();
  });

  // -------- back button ----------------------------------------------

  it('clicking the Back button invokes onClose', async () => {
    const user = userEvent.setup();
    const { onClose } = renderScreen();
    const backBtn = document.querySelector('button[data-tip="Back"]') as HTMLButtonElement | null;
    expect(backBtn).not.toBeNull();
    await user.click(backBtn!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // -------- commander notes section ----------------------------------

  it('Commander notes section is hidden when no picks have a commander_note', () => {
    renderScreen({
      picks: [makePick({ id: 'p-a', date: '2026-06-02', state: 'proposed', commander_note: null })],
    });
    expect(screen.queryByTestId('commander-decisions')).not.toBeInTheDocument();
  });

  it('Commander notes section lists picks with a note, most recent resolved_at first', () => {
    renderScreen({
      picks: [
        makePick({
          id: 'p-rej', date: '2026-06-03', state: 'rejected',
          commander_note: 'No coverage that week',
          resolved_at: '2026-05-15T10:00:00.000Z',
        }),
        makePick({
          id: 'p-app', date: '2026-06-05', state: 'approved',
          commander_note: 'OK — paired with Alice',
          resolved_at: '2026-05-16T09:00:00.000Z',
        }),
        makePick({
          id: 'p-other', date: '2026-06-06', state: 'proposed',
          commander_note: null,
          resolved_at: null,
        }),
      ],
    });
    const card = screen.getByTestId('commander-decisions');
    expect(card).toBeInTheDocument();
    expect(card.textContent).toMatch(/No coverage that week/);
    expect(card.textContent).toMatch(/OK — paired with Alice/);
    // Ordered by resolved_at desc → approved (2026-05-16) precedes rejected (2026-05-15).
    const approvedIdx = card.textContent!.indexOf('OK — paired with Alice');
    const rejectedIdx = card.textContent!.indexOf('No coverage that week');
    expect(approvedIdx).toBeLessThan(rejectedIdx);
  });

  // -------- my notes section -----------------------------------------

  it('My notes section is hidden when reservist has no active picks', () => {
    renderScreen({ picks: [] });
    expect(screen.queryByTestId('my-notes')).not.toBeInTheDocument();
  });

  it('My notes section is hidden when only picks are withdrawn', () => {
    renderScreen({
      picks: [makePick({ id: 'p-w', date: '2026-06-03', state: 'withdrawn' })],
    });
    expect(screen.queryByTestId('my-notes')).not.toBeInTheDocument();
  });

  it('My notes lists active picks in ascending date order', () => {
    renderScreen({
      picks: [
        makePick({ id: 'p-c', date: '2026-06-06', state: 'approved' }),
        makePick({ id: 'p-a', date: '2026-06-02', state: 'proposed' }),
        makePick({ id: 'p-b', date: '2026-06-04', state: 'rejected' }),
        makePick({ id: 'p-w', date: '2026-06-05', state: 'withdrawn' }),
      ],
    });
    const card = screen.getByTestId('my-notes');
    expect(within(card).queryByTestId('my-note-row-2026-06-05')).not.toBeInTheDocument();
    const text = card.textContent ?? '';
    const iA = text.indexOf('2026-06-02');
    const iB = text.indexOf('2026-06-04');
    const iC = text.indexOf('2026-06-06');
    expect(iA).toBeGreaterThan(-1);
    expect(iB).toBeGreaterThan(iA);
    expect(iC).toBeGreaterThan(iB);
  });

  it('My notes: a row with a reservist_note shows the note text and an Edit button', () => {
    renderScreen({
      picks: [makePick({ id: 'p1', date: '2026-06-03', state: 'proposed', reservist_note: 'family wedding' })],
    });
    const row = screen.getByTestId('my-note-row-2026-06-03');
    expect(within(row).getByText('family wedding')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('My notes: a row without a reservist_note shows an "Add note" button', () => {
    renderScreen({
      picks: [makePick({ id: 'p1', date: '2026-06-03', state: 'proposed', reservist_note: null })],
    });
    const row = screen.getByTestId('my-note-row-2026-06-03');
    expect(within(row).getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  });

  it('My notes: clicking Add note → typing → Save calls useSetReservistNote with trimmed text', async () => {
    const user = userEvent.setup();
    const { onToast } = renderScreen({
      picks: [makePick({ id: 'p1', date: '2026-06-03', state: 'proposed', reservist_note: null })],
    });
    const row = screen.getByTestId('my-note-row-2026-06-03');
    await user.click(within(row).getByRole('button', { name: 'Add note' }));
    const textarea = within(row).getByRole('textbox');
    await user.type(textarea, '  graduation  ');
    await user.click(within(row).getByRole('button', { name: 'Save' }));
    expect(mockSetNote.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockSetNote.mutateAsync.mock.calls[0][0]).toEqual({ pickId: 'p1', note: 'graduation' });
    expect(onToast).toHaveBeenCalledWith('Note saved');
  });

  it('My notes: clearing the textarea and saving sends null (and toasts "Note cleared")', async () => {
    const user = userEvent.setup();
    const { onToast } = renderScreen({
      picks: [makePick({ id: 'p1', date: '2026-06-03', state: 'proposed', reservist_note: 'old text' })],
    });
    const row = screen.getByTestId('my-note-row-2026-06-03');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const textarea = within(row).getByRole('textbox');
    await user.clear(textarea);
    await user.click(within(row).getByRole('button', { name: 'Save' }));
    expect(mockSetNote.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockSetNote.mutateAsync.mock.calls[0][0]).toEqual({ pickId: 'p1', note: null });
    expect(onToast).toHaveBeenCalledWith('Note cleared');
  });

  it('My notes: Cancel reverts the edit without calling the mutation', async () => {
    const user = userEvent.setup();
    renderScreen({
      picks: [makePick({ id: 'p1', date: '2026-06-03', state: 'proposed', reservist_note: 'first draft' })],
    });
    const row = screen.getByTestId('my-note-row-2026-06-03');
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    const textarea = within(row).getByRole('textbox');
    await user.clear(textarea);
    await user.type(textarea, 'rewrite');
    await user.click(within(row).getByRole('button', { name: 'Cancel' }));
    expect(mockSetNote.mutateAsync).not.toHaveBeenCalled();
    // Original note still visible
    expect(within(row).getByText('first draft')).toBeInTheDocument();
  });

  it('My notes: closed window hides Edit/Add note controls', () => {
    renderScreen({
      window: { state: 'closed' },
      picks: [makePick({ id: 'p1', date: '2026-06-03', state: 'approved', reservist_note: 'note' })],
    });
    const row = screen.getByTestId('my-note-row-2026-06-03');
    expect(within(row).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
  });

  it('Commander notes section renders the state pill (approved/rejected)', () => {
    renderScreen({
      picks: [
        makePick({
          id: 'p-rej', date: '2026-06-03', state: 'rejected',
          commander_note: 'Conflicts with brigade ex',
          resolved_at: '2026-05-15T10:00:00.000Z',
        }),
      ],
    });
    const card = screen.getByTestId('commander-decisions');
    expect(within(card).getByText('rejected')).toBeInTheDocument();
  });
});
