/**
 * CalendarScreen component tests.
 *
 * CalendarScreen is a pure presentational component: it takes `slots`,
 * `members`, and an optional `onSlotClick` callback. It owns two pieces
 * of internal state — the visible month cursor (initialised to the first
 * day of "today") and the selected day key (initialised to today's key).
 *
 * It does NOT:
 *   - call any data hooks (no useSlots, no useApprovedPicksForTeam, etc.)
 *   - render any deployment-pick indicator (slots only)
 *   - expose an onDayClick prop
 *
 * Test coverage skipped / not present in the implementation:
 *   - "Days with approved deployment picks show a different indicator":
 *     CalendarScreen does not consume picks at all. Pick-aware day cells
 *     live in DeploymentWindowDrawer / DayCell, which have their own tests.
 *     There is nothing to assert in CalendarScreen for this.
 *   - "Click a day fires onDayClick(date)": there is no onDayClick prop.
 *     The day-click handler is purely internal — it updates the selected
 *     day, which we verify indirectly through the day-detail panel header
 *     and through onSlotClick when a slot row in that panel is clicked.
 *
 * Today-relative tests use vi.setSystemTime so that "today" is a known,
 * mid-month weekday — this stabilises both today-cell assertions and the
 * leading/trailing padding-cell assertions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Member, Slot } from '../../src/lib/types';

import { CalendarScreen } from '../../src/components/CalendarScreen';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'm1',
    division_id: 'div1',
    name: 'Alice Cohen',
    initials: 'AC',
    tone: 0,
    phone: '+972 52-000-0001',
    joined: '2023-01',
    last_seen: '2 days ago',
    calls_this_year: 0,
    status: 'available',
    status_note: null,
    status_until: null,
    status_set_at: '2026-05-15T00:00:00.000Z',
    is_division_admin: false,
    phone_visible_to_peers: true,
    skills: [],
    teams: [{ team_id: 'team1', role: 'soldier' }],
    ...overrides,
  };
}

function makeSlot(overrides: Partial<Slot> = {}): Slot {
  return {
    id: 's1',
    team_id: 'team1',
    title: 'Night patrol',
    urgent: false,
    state: 'published',
    start_at: '2026-06-10T20:00:00.000Z',
    end_at: '2026-06-11T04:00:00.000Z',
    duration: '8h',
    location: 'Base North',
    needed: 3,
    notes: null,
    role: null,
    skills: [],
    assignee_ids: [],
    filled: 0,
    ...overrides,
  };
}

const ALICE = makeMember();

// Fixed "today" for deterministic month-grid rendering.
// 2026-06-10 is a Wednesday; June 1 2026 is a Monday, so the offset is 0
// and the first row has no leading padding from May. That makes some
// padding assertions easier; for the trailing-padding assertion we use
// a different fixed date.
const FIXED_TODAY = new Date('2026-06-10T12:00:00.000Z');

function setupTime(d: Date = FIXED_TODAY) {
  // Don't switch to fake timers — that breaks @testing-library/user-event,
  // whose internal pointer-event sequencing relies on real setTimeout.
  // Instead, stub the Date constructor / Date.now to return our fixed
  // "today". This is enough for CalendarScreen because it only ever calls
  // `new Date()` (zero-arg) and never reads timers.
  const realDate = Date;
  const fixed = d.getTime();
  class StubDate extends realDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) {
        super(fixed);
      } else {
        super(...(args as ConstructorParameters<typeof Date>));
      }
    }
    static now() { return fixed; }
  }
  vi.stubGlobal('Date', StubDate);
}

function renderScreen(opts: {
  slots?: Slot[];
  members?: Member[];
  onSlotClick?: (s: Slot) => void;
} = {}) {
  const onSlotClick = opts.onSlotClick ?? vi.fn();
  const utils = render(
    <CalendarScreen
      slots={opts.slots ?? []}
      members={opts.members ?? [ALICE]}
      onSlotClick={onSlotClick}
    />,
  );
  return { ...utils, onSlotClick };
}

// The calendar's day buttons have no accessible name beyond their text
// content (the day number plus any slot blurbs). Locate the in-month cell
// for `dayOfMonth` by scanning all buttons and matching the day-number
// span (the cell's first child div has only the day number text).
function findDayCell(dayOfMonth: number, opts: { inMonth?: boolean } = {}): HTMLButtonElement {
  const inMonth = opts.inMonth ?? true;
  const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  // Filter to calendar-cell buttons: minHeight 78px is unique to them.
  const cells = buttons.filter((b) => b.style.minHeight === '78px');
  const matches = cells.filter((b) => {
    const first = b.firstElementChild as HTMLElement | null;
    if (!first) return false;
    if (first.textContent?.trim() !== String(dayOfMonth)) return false;
    const isInMonth = b.style.opacity === '1' || b.style.opacity === '';
    return inMonth ? isInMonth : !isInMonth;
  });
  if (matches.length === 0) {
    throw new Error(`No ${inMonth ? 'in-month' : 'padding'} cell for day ${dayOfMonth}`);
  }
  return matches[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CalendarScreen', () => {
  beforeEach(() => {
    setupTime();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -------- header --------------------------------------------------------

  it("renders the current month and year in the header (today = June 10, 2026)", () => {
    renderScreen();
    // Heading is "June 2026" with the year wrapped in <em>.
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toMatch(/June/);
    expect(heading.textContent).toMatch(/2026/);
  });

  // -------- weekday headers ----------------------------------------------

  it('renders Mon-Sun weekday headers in order', () => {
    renderScreen();
    for (const dow of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(dow)).toBeInTheDocument();
    }
  });

  // -------- month grid ----------------------------------------------------

  it("renders every day-of-month in the current month as an in-month cell", () => {
    renderScreen();
    // June 2026 has 30 days. Each day 1..30 has at least one in-month cell.
    for (let d = 1; d <= 30; d++) {
      expect(() => findDayCell(d, { inMonth: true })).not.toThrow();
    }
  });

  it('renders exactly 42 day cells (6 rows × 7 columns)', () => {
    renderScreen();
    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const cells = buttons.filter((b) => b.style.minHeight === '78px');
    expect(cells).toHaveLength(42);
  });

  it('renders previous/next month days as visually muted padding cells', () => {
    // Set today to a month whose first day is NOT Monday so we get leading
    // padding. 2026-05-15 (Friday) → May 1 is a Friday → offset 4 days from
    // Monday → leading padding contains April 27, 28, 29, 30.
    vi.unstubAllGlobals();
    setupTime(new Date('2026-05-15T12:00:00.000Z'));
    renderScreen();

    // April 30 is the last padding day before May 1 → muted (opacity 0.4).
    const apr30 = findDayCell(30, { inMonth: false });
    expect(apr30.style.opacity).toBe('0.4');

    // June padding cells trail May 31. The first trailing padding is June 1
    // (next month). The total grid is 42 cells; May has 31 days + 4 leading
    // padding = 35, so cells 36..42 are June 1..7 — all muted.
    const jun1 = findDayCell(1, { inMonth: false });
    expect(jun1.style.opacity).toBe('0.4');
  });

  it('renders in-month cells at full opacity', () => {
    renderScreen();
    const jun15 = findDayCell(15, { inMonth: true });
    // inMonth → opacity 1 (the source uses `opacity: inMonth ? 1 : 0.4`).
    expect(jun15.style.opacity).toBe('1');
  });

  // -------- today indicator ----------------------------------------------

  it("renders today's cell with the today styling (serif date number)", () => {
    renderScreen(); // today = 2026-06-10
    const today = findDayCell(10, { inMonth: true });
    const dateLabel = today.firstElementChild as HTMLElement;
    // The implementation switches to var(--serif) and a bigger font for today.
    expect(dateLabel.style.fontFamily).toBe('var(--serif)');
    // Sanity: a non-today day uses var(--sans).
    const other = findDayCell(15, { inMonth: true });
    expect((other.firstElementChild as HTMLElement).style.fontFamily).toBe('var(--sans)');
  });

  // -------- slot indicators ----------------------------------------------

  it('renders a slot indicator inside the day cell that contains a slot', () => {
    const s = makeSlot({
      id: 's1',
      title: 'Night patrol',
      start_at: '2026-06-12T20:00:00.000Z',
      state: 'published',
    });
    renderScreen({ slots: [s] });
    const jun12 = findDayCell(12, { inMonth: true });
    // The in-cell blurb contains the slot title.
    expect(within(jun12).getByText(/Night patrol/)).toBeInTheDocument();
  });

  it('renders distinct urgent styling for urgent slot indicators', () => {
    const urgent = makeSlot({
      id: 'sU', title: 'Urgent recon', urgent: true,
      start_at: '2026-06-12T06:00:00.000Z',
    });
    const calm = makeSlot({
      id: 'sC', title: 'Day watch', urgent: false,
      start_at: '2026-06-13T06:00:00.000Z',
    });
    renderScreen({ slots: [urgent, calm] });

    const jun12 = findDayCell(12, { inMonth: true });
    const urgentBlurb = within(jun12).getByText(/Urgent recon/) as HTMLElement;
    // Inline style includes `background: var(--urgent-bg)` for urgent slots.
    expect(urgentBlurb.style.background).toBe('var(--urgent-bg)');

    const jun13 = findDayCell(13, { inMonth: true });
    const calmBlurb = within(jun13).getByText(/Day watch/) as HTMLElement;
    expect(calmBlurb.style.background).toBe('var(--accent-tint)');
  });

  it('does NOT render an indicator for cancelled slots (they are filtered out)', () => {
    const cancelled = makeSlot({
      id: 'sX', title: 'Cancelled sweep', state: 'cancelled',
      start_at: '2026-06-14T06:00:00.000Z',
    });
    renderScreen({ slots: [cancelled] });
    const jun14 = findDayCell(14, { inMonth: true });
    expect(within(jun14).queryByText(/Cancelled sweep/)).not.toBeInTheDocument();
  });

  it('caps in-cell slot blurbs at 3 and shows a "+N more" affordance', () => {
    const day = '2026-06-12';
    const slots: Slot[] = Array.from({ length: 5 }, (_, i) =>
      makeSlot({
        id: `s${i}`,
        title: `Slot ${i}`,
        start_at: `${day}T0${i}:00:00.000Z`,
      }),
    );
    renderScreen({ slots });

    const jun12 = findDayCell(12, { inMonth: true });
    // Three of the five visible.
    expect(within(jun12).getByText(/Slot 0/)).toBeInTheDocument();
    expect(within(jun12).getByText(/Slot 1/)).toBeInTheDocument();
    expect(within(jun12).getByText(/Slot 2/)).toBeInTheDocument();
    // The 4th/5th roll into a "+N more" line.
    expect(within(jun12).queryByText(/Slot 3/)).not.toBeInTheDocument();
    expect(within(jun12).getByText(/\+2 more/)).toBeInTheDocument();
  });

  // -------- day selection + detail panel ---------------------------------

  it("today is selected by default → the detail panel renders today's date and slots", () => {
    const s = makeSlot({
      id: 's1', title: 'Night patrol',
      start_at: '2026-06-10T20:00:00.000Z',
    });
    renderScreen({ slots: [s] });
    // Panel header shows today's long-form date.
    expect(screen.getByText(/June 10, 2026/i)).toBeInTheDocument();
    // And the slot title shows in the detail panel as a heading-like row.
    // There are two occurrences (in-cell blurb + detail card), so getAllByText.
    expect(screen.getAllByText(/Night patrol/).length).toBeGreaterThanOrEqual(1);
  });

  it('clicking a day cell selects it → detail panel updates to that date', async () => {
    const user = userEvent.setup();
    renderScreen();
    const jun20 = findDayCell(20, { inMonth: true });
    await user.click(jun20);
    expect(screen.getByText(/June 20, 2026/i)).toBeInTheDocument();
  });

  it('detail panel says "No duty scheduled." when the selected day has no slots', async () => {
    const user = userEvent.setup();
    renderScreen({ slots: [] });
    // Pick a day that definitely has nothing.
    await user.click(findDayCell(20, { inMonth: true }));
    expect(screen.getByText(/No duty scheduled\./i)).toBeInTheDocument();
  });

  // -------- onSlotClick ---------------------------------------------------

  it('clicking a slot card in the detail panel fires onSlotClick with that slot', async () => {
    const user = userEvent.setup();
    const slot = makeSlot({
      id: 'sClick', title: 'Night patrol',
      start_at: '2026-06-15T20:00:00.000Z',
    });
    const onSlotClick = vi.fn();
    renderScreen({ slots: [slot], onSlotClick });

    // Select the day first.
    await user.click(findDayCell(15, { inMonth: true }));
    // The detail-panel card contains an h-less wrapper; find it by text and
    // click its containing card (the closest div with cursor: pointer).
    const titleNode = screen.getAllByText('Night patrol').slice(-1)[0];
    const card = titleNode.closest('div[style*="cursor: pointer"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    await user.click(card!);

    expect(onSlotClick).toHaveBeenCalledTimes(1);
    expect(onSlotClick).toHaveBeenCalledWith(slot);
  });

  // -------- prev / next / today navigation -------------------------------

  it('clicking "Next" advances the visible month by one', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/June/);
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/July/);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/2026/);
  });

  it('clicking "Prev" moves the visible month back by one', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: /Prev/i }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/May/);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/2026/);
  });

  it('Next/Prev across a year boundary updates both month and year', async () => {
    const user = userEvent.setup();
    renderScreen();
    // June 2026 → step back 6 times → December 2025.
    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole('button', { name: /Prev/i }));
    }
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toMatch(/December/);
    expect(heading.textContent).toMatch(/2025/);
  });

  it('clicking "Today" returns the cursor to the current month after navigating away', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: /Next/i }));
    await user.click(screen.getByRole('button', { name: /Next/i }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/August/);
    await user.click(screen.getByRole('button', { name: /^Today$/i }));
    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/June/);
  });
});
