/**
 * ActivityScreen component tests.
 *
 * ActivityScreen is purely presentational — it accepts `items` as a prop and
 * does no data fetching, so it can be mounted without any providers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ActivityScreen,
  buildActivityCSV,
  csvEscape,
} from '../../src/components/ActivityScreen';
import type { ActivityItem } from '../../src/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<ActivityItem> = {}): ActivityItem {
  return {
    id: 'a1',
    team_id: 't1',
    actor_id: 'u1',
    actor_name: 'Alice Cohen',
    verb: 'assigned',
    what: 'Night Patrol',
    tone: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Build a deterministic timeline for filtering tests.
const ALICE_ASSIGN = makeItem({
  id: 'a1',
  actor_name: 'Alice Cohen',
  verb: 'assigned',
  what: 'Night Patrol',
  created_at: '2025-01-10T10:00:00Z',
});
const BOB_UNASSIGN = makeItem({
  id: 'a2',
  actor_name: 'Bob Levi',
  verb: 'unassigned',
  what: 'Day Watch',
  created_at: '2025-01-12T12:00:00Z',
});
const ALICE_PUBLISH = makeItem({
  id: 'a3',
  actor_name: 'Alice Cohen',
  verb: 'published',
  what: 'Recon',
  created_at: '2025-01-14T09:00:00Z',
});
const CAROL_REQUEST = makeItem({
  id: 'a4',
  actor_name: 'Carol Paz',
  verb: 'requested',
  what: 'Time off',
  created_at: '2025-01-16T15:00:00Z',
});

const SAMPLE: ActivityItem[] = [ALICE_ASSIGN, BOB_UNASSIGN, ALICE_PUBLISH, CAROL_REQUEST];

// ---------------------------------------------------------------------------
// csvEscape / buildActivityCSV — pure helper tests
// ---------------------------------------------------------------------------

describe('csvEscape', () => {
  it('returns plain text unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('wraps strings containing commas in quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('escapes embedded double-quotes per RFC 4180', () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
  });

  it('quotes strings with newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('quotes strings with carriage returns', () => {
    expect(csvEscape('a\rb')).toBe('"a\rb"');
  });

  it('returns empty string for null / undefined', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });
});

describe('buildActivityCSV', () => {
  it('emits header row with the four required columns', () => {
    const csv = buildActivityCSV([]);
    expect(csv.split('\r\n')[0]).toBe('created_at,actor_name,verb,what');
  });

  it('serializes one row per item with the required columns', () => {
    const csv = buildActivityCSV([ALICE_ASSIGN]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('2025-01-10T10:00:00Z,Alice Cohen,assigned,Night Patrol');
  });

  it('handles null `what` as empty cell', () => {
    const csv = buildActivityCSV([makeItem({ what: null, created_at: '2025-01-01T00:00:00Z' })]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('2025-01-01T00:00:00Z,Alice Cohen,assigned,');
  });

  it('CSV-escapes commas, quotes, newlines in fields', () => {
    const csv = buildActivityCSV([
      makeItem({
        actor_name: 'O\'Brien, Jr.',
        verb: 'said "hi"',
        what: 'line1\nline2',
        created_at: '2025-01-01T00:00:00Z',
      }),
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(
      '2025-01-01T00:00:00Z,"O\'Brien, Jr.","said ""hi""","line1\nline2"',
    );
  });
});

// ---------------------------------------------------------------------------
// Rendering tests
// ---------------------------------------------------------------------------

describe('ActivityScreen', () => {
  it('renders all items when no filters are active', () => {
    render(<ActivityScreen items={SAMPLE} />);
    // Alice appears twice (two rows), Bob and Carol once each.
    expect(screen.getAllByText('Alice Cohen').length).toBe(2);
    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    expect(screen.getByText('Carol Paz')).toBeInTheDocument();
  });

  it('shows the visible/total counter', () => {
    render(<ActivityScreen items={SAMPLE} />);
    expect(screen.getByText('4 / 4')).toBeInTheDocument();
  });

  it('shows empty state when items array is empty', () => {
    render(<ActivityScreen items={[]} />);
    expect(screen.getByText(/Nothing matches/i)).toBeInTheDocument();
  });

  it('renders one verb chip per distinct verb in the data', () => {
    render(<ActivityScreen items={SAMPLE} />);
    const verbGroup = screen.getByRole('group', { name: /Filter by verb/i });
    expect(within(verbGroup).getByText('assigned')).toBeInTheDocument();
    expect(within(verbGroup).getByText('unassigned')).toBeInTheDocument();
    expect(within(verbGroup).getByText('published')).toBeInTheDocument();
    expect(within(verbGroup).getByText('requested')).toBeInTheDocument();
  });

  it('filters by actor (free-text contains, case-insensitive)', async () => {
    const user = userEvent.setup();
    render(<ActivityScreen items={SAMPLE} />);
    const input = screen.getByLabelText(/Filter by actor/i);
    await user.type(input, 'alice');

    // Both Alice rows show.
    expect(screen.getAllByText('Alice Cohen').length).toBe(2);
    // Bob and Carol are gone.
    expect(screen.queryByText('Bob Levi')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol Paz')).not.toBeInTheDocument();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('filters by verb chip (multi-select)', async () => {
    const user = userEvent.setup();
    render(<ActivityScreen items={SAMPLE} />);

    const verbGroup = screen.getByRole('group', { name: /Filter by verb/i });
    await user.click(within(verbGroup).getByText('assigned'));

    // Only Alice's "assigned" row.
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.queryByText('Bob Levi')).not.toBeInTheDocument();
    expect(screen.queryByText('Carol Paz')).not.toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();

    // Add another verb to the selection — multi-select.
    await user.click(within(verbGroup).getByText('requested'));
    expect(screen.getByText('Carol Paz')).toBeInTheDocument();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('filters by date range (inclusive of "to" day)', async () => {
    const user = userEvent.setup();
    render(<ActivityScreen items={SAMPLE} />);

    const from = screen.getByLabelText(/From date/i);
    const to = screen.getByLabelText(/To date/i);

    // 2025-01-12 .. 2025-01-14 inclusive → BOB_UNASSIGN + ALICE_PUBLISH.
    await user.type(from, '2025-01-12');
    await user.type(to, '2025-01-14');

    expect(screen.getByText('Bob Levi')).toBeInTheDocument();
    expect(screen.getByText('Alice Cohen')).toBeInTheDocument();
    expect(screen.queryByText('Carol Paz')).not.toBeInTheDocument();
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('shows "Clear" button only when filters are active, and it resets them', async () => {
    const user = userEvent.setup();
    render(<ActivityScreen items={SAMPLE} />);
    expect(screen.queryByText(/^Clear$/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/Filter by actor/i), 'bob');
    expect(screen.getByText('1 / 4')).toBeInTheDocument();

    const clearBtn = screen.getByText(/^Clear$/);
    await user.click(clearBtn);
    expect(screen.getByText('4 / 4')).toBeInTheDocument();
  });

  it('Download CSV button is disabled when filtered list is empty', async () => {
    const user = userEvent.setup();
    render(<ActivityScreen items={SAMPLE} />);

    // Filter to something that matches nothing.
    await user.type(screen.getByLabelText(/Filter by actor/i), 'zzz-no-such-user');
    const downloadBtn = screen.getByRole('button', { name: /Download CSV/i });
    expect(downloadBtn).toBeDisabled();
  });

  // ---- Download click triggers blob + anchor ------------------------------

  describe('Download CSV click', () => {
    let createUrl: ReturnType<typeof vi.spyOn>;
    let revokeUrl: ReturnType<typeof vi.spyOn>;
    let clickSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // happy-dom doesn't implement URL.createObjectURL — stub it.
      createUrl = vi
        .spyOn(URL, 'createObjectURL')
        .mockImplementation(() => 'blob:mock');
      revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
    });

    afterEach(() => {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
      clickSpy.mockRestore();
    });

    it('triggers a download with the team-slug filename', async () => {
      const user = userEvent.setup();
      render(<ActivityScreen items={SAMPLE} teamName="Alpha Squad" />);

      // Spy on anchor download attribute by intercepting click.
      let capturedDownload = '';
      clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
        capturedDownload = this.download;
      });

      await user.click(screen.getByRole('button', { name: /Download CSV/i }));

      expect(createUrl).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
      // Filename: activity-<slug>-YYYYMMDD.csv
      expect(capturedDownload).toMatch(/^activity-alpha-squad-\d{8}\.csv$/);
    });

    it('falls back to "team" slug when teamName is not provided', async () => {
      const user = userEvent.setup();
      render(<ActivityScreen items={SAMPLE} />);

      let capturedDownload = '';
      clickSpy.mockImplementation(function (this: HTMLAnchorElement) {
        capturedDownload = this.download;
      });

      await user.click(screen.getByRole('button', { name: /Download CSV/i }));
      expect(capturedDownload).toMatch(/^activity-team-\d{8}\.csv$/);
    });
  });
});
