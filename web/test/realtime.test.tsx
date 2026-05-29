/**
 * useRealtime tests.
 *
 * `useRealtime` (`web/src/lib/realtime.ts`) is the hook every dashboard
 * mounts so that a write from one device shows up on another without
 * a manual refresh. It subscribes to a single Postgres-changes channel
 * named `team:${teamId}` and fans each table's events out to the right
 * React Query keys. It is previously untested.
 *
 * Same precedent as #161 (AuthProvider), #160 (TeamProvider), and
 * #159 (PrefsProvider): pin a previously-untested hinge before it
 * gets touched — in this case before any RLS / multi-team scope work
 * shifts the subscription filters, or before the query keys get
 * renamed in a queries.ts refactor. The invalidation map is the
 * contract between the realtime feed and the cache; a typo or a
 * forgotten key here is silent — the UI just stops auto-refreshing
 * for that table.
 *
 * Strategy:
 *
 * - Mock `supabase` so `.channel().on().on()…subscribe()` records the
 *   channel name and every `(table, filter) -> callback` listener into
 *   capture maps the tests can read.
 * - Provide a real `QueryClient` and spy on `invalidateQueries` so the
 *   per-table mapping is verifiable by firing the captured callback
 *   and asserting which keys were invalidated.
 * - `renderHook({ initialProps })` + `rerender` to exercise the
 *   teamId-change cleanup path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

type Listener = (payload: unknown) => void;

interface CapturedListener {
  /** Topic the production hook passed to `.on()`, e.g. 'postgres_changes'. */
  topic: string;
  cb: Listener;
}

interface CapturedChannel {
  name: string;
  /** Listeners keyed by `${table}` or `${table}|${filter}` for filtered subs. */
  listeners: Map<string, CapturedListener>;
  subscribed: boolean;
}

let lastChannel: CapturedChannel | null = null;
const channelSpy = vi.fn<(name: string) => unknown>();
const subscribeSpy = vi.fn();
const removeChannelSpy = vi.fn();

function listenerKey(table: string, filter: string | undefined): string {
  return filter ? `${table}|${filter}` : table;
}

function makeChannel(name: string): unknown {
  const channel: CapturedChannel = {
    name,
    listeners: new Map(),
    subscribed: false,
  };
  lastChannel = channel;
  const builder = {
    on(
      topic: string,
      opts: { event: string; schema: string; table: string; filter?: string },
      cb: Listener,
    ) {
      const key = listenerKey(opts.table, opts.filter);
      // Throw on collision rather than silently overwriting. The real
      // Supabase builder accumulates every `.on()` call; if a future
      // refactor adds a second listener that happens to collide on
      // `${table}|${filter}`, a Map.set would drop the first one and
      // every test below would still pass against a silently broken
      // realtime subscription.
      if (channel.listeners.has(key)) {
        throw new Error(
          `duplicate listener key ${key} — the supabase mock would silently overwrite the previous .on() call`,
        );
      }
      channel.listeners.set(key, { topic, cb });
      return builder;
    },
    subscribe() {
      channel.subscribed = true;
      subscribeSpy();
      return channel;
    },
  };
  return builder;
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: (name: string) => {
      channelSpy(name);
      return makeChannel(name);
    },
    removeChannel: (ch: unknown) => {
      removeChannelSpy(ch);
    },
  },
}));

// Import after vi.mock so the production module captures the mocked
// supabase reference.
import { useRealtime } from '../src/lib/realtime';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Harness {
  qc: QueryClient;
  invalidateSpy: ReturnType<typeof vi.spyOn>;
  rerender: (props: { id: string | undefined }) => void;
  unmount: () => void;
}

function setup(initialId: string | undefined): Harness {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { rerender, unmount } = renderHook(
    ({ id }: { id: string | undefined }) => useRealtime(id),
    { wrapper, initialProps: { id: initialId } },
  );
  return { qc, invalidateSpy, rerender, unmount };
}

function fireListener(table: string, filter?: string) {
  if (!lastChannel) throw new Error('no channel captured');
  const captured = lastChannel.listeners.get(listenerKey(table, filter));
  if (!captured) {
    throw new Error(
      `no listener registered for ${table}${filter ? ` (filter=${filter})` : ''}`,
    );
  }
  captured.cb({});
}

function invalidatedKeys(
  spy: ReturnType<typeof vi.spyOn>,
): string[] {
  return spy.mock.calls
    .map((c) => {
      const arg = c[0] as { queryKey?: unknown[] } | undefined;
      const key = arg?.queryKey?.[0];
      return typeof key === 'string' ? key : null;
    })
    .filter((k): k is string => k !== null);
}

function resetCaptures() {
  channelSpy.mockReset();
  subscribeSpy.mockReset();
  removeChannelSpy.mockReset();
  lastChannel = null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useRealtime', () => {
  beforeEach(resetCaptures);
  afterEach(resetCaptures);

  it('is a no-op when teamId is undefined (no channel subscribed)', () => {
    // Both dashboards call `useRealtime(team?.id)`. While the active team
    // is loading, `team` is null and `team?.id` is undefined — the hook
    // must NOT open a subscription that it can't later filter, and must
    // NOT attempt removeChannel on a non-existent channel either.
    setup(undefined);
    expect(channelSpy).not.toHaveBeenCalled();
    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(removeChannelSpy).not.toHaveBeenCalled();
    expect(lastChannel).toBeNull();
  });

  it('subscribes to a channel named `team:${teamId}`', () => {
    setup('t-alpha');
    expect(channelSpy).toHaveBeenCalledTimes(1);
    expect(channelSpy).toHaveBeenCalledWith('team:t-alpha');
    expect(subscribeSpy).toHaveBeenCalledTimes(1);
    expect(lastChannel?.subscribed).toBe(true);
  });

  it('registers every `.on()` against the `postgres_changes` topic', () => {
    // The mock only captures table + filter for the per-listener
    // contract assertions, but the topic string is the bridge from the
    // hook to the Supabase realtime feed. A refactor that flipped it
    // to `broadcast` or `presence` (e.g. trying to share the channel
    // with an ad-hoc messaging feature) would still register all the
    // same callbacks and every other test in this file would pass
    // against a silently broken realtime subscription.
    setup('t-x');
    const topics = Array.from(lastChannel!.listeners.values()).map(
      (l) => l.topic,
    );
    expect(new Set(topics)).toEqual(new Set(['postgres_changes']));
  });

  it('registers a listener for every table the hook wires up', () => {
    // The dashboards depend on each of these tables flowing through the
    // realtime feed. If one ever gets dropped in a refactor, the UI
    // silently stops auto-refreshing — there is no other reminder.
    // Listed in the same order they appear in `realtime.ts`.
    setup('t-x');
    const keys = Array.from(lastChannel!.listeners.keys()).sort();
    expect(keys).toEqual(
      [
        'members',
        'team_members',
        `activity_log|team_id=eq.t-x`,
        `slots|team_id=eq.t-x`,
        `join_requests|team_id=eq.t-x`,
        `deployment_windows|team_id=eq.t-x`,
        'deployment_picks',
        'teams',
        'projects',
      ].sort(),
    );
  });

  it('removes the channel on unmount', () => {
    const { unmount } = setup('t-x');
    expect(removeChannelSpy).not.toHaveBeenCalled();
    unmount();
    expect(removeChannelSpy).toHaveBeenCalledTimes(1);
    expect(removeChannelSpy).toHaveBeenCalledWith(lastChannel);
  });

  it('re-subscribes (cleanup + new channel) when teamId changes', () => {
    // The user switches active team via the team picker. The previous
    // team:${old} subscription must be torn down — otherwise the cache
    // gets invalidated by writes against a team the user no longer
    // sees, and the new team:${new} feed isn't running yet.
    const { rerender } = setup('t-old');
    expect(channelSpy).toHaveBeenLastCalledWith('team:t-old');
    const oldChannel = lastChannel;

    rerender({ id: 't-new' });

    expect(removeChannelSpy).toHaveBeenCalledWith(oldChannel);
    expect(channelSpy).toHaveBeenLastCalledWith('team:t-new');
    expect(lastChannel).not.toBe(oldChannel);
    expect(lastChannel?.subscribed).toBe(true);
  });

  it('rebuilds every filtered subscription with the new teamId when teamId changes', () => {
    // Not just the channel name, but every per-table filter (e.g.
    // `slots|team_id=eq.${teamId}`) must re-bind. A bug that kept the
    // old filter on any of the four filtered tables would leak the
    // previous team's writes into the new team's cache for that table.
    // All four filtered tables (the unfiltered ones — `members`,
    // `team_members`, `deployment_picks`, `teams`, `projects` — do not
    // need re-binding because their key has no teamId in it).
    const filteredTables = [
      'activity_log',
      'slots',
      'join_requests',
      'deployment_windows',
    ];
    const { rerender } = setup('t-old');
    rerender({ id: 't-new' });
    for (const table of filteredTables) {
      expect(
        lastChannel!.listeners.has(`${table}|team_id=eq.t-new`),
      ).toBe(true);
      expect(
        lastChannel!.listeners.has(`${table}|team_id=eq.t-old`),
      ).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // Invalidation contract: one test per table. These pin the (table -> keys)
  // map that the realtime hook owns. A drift in any of these mappings is
  // silent in production — the UI just stops refreshing for that table — so
  // it has to fail loudly here.
  // -------------------------------------------------------------------------

  it('invalidates members + my-member + members-in-division on a `members` change', () => {
    const { invalidateSpy } = setup('t-x');
    fireListener('members');
    expect(invalidatedKeys(invalidateSpy).sort()).toEqual(
      ['members', 'members-in-division', 'my-member'].sort(),
    );
  });

  it('invalidates members + teams-for-member + team + teams-for-division on a `team_members` change', () => {
    const { invalidateSpy } = setup('t-x');
    fireListener('team_members');
    expect(invalidatedKeys(invalidateSpy).sort()).toEqual(
      ['members', 'team', 'teams-for-division', 'teams-for-member'].sort(),
    );
  });

  it('invalidates activity + my-activity on an `activity_log` change for this team', () => {
    const { invalidateSpy } = setup('t-x');
    fireListener('activity_log', 'team_id=eq.t-x');
    expect(invalidatedKeys(invalidateSpy).sort()).toEqual(
      ['activity', 'my-activity'].sort(),
    );
  });

  it('invalidates slots + my-slots + team-day on a `slots` change for this team', () => {
    const { invalidateSpy } = setup('t-x');
    fireListener('slots', 'team_id=eq.t-x');
    expect(invalidatedKeys(invalidateSpy).sort()).toEqual(
      ['my-slots', 'slots', 'team-day'].sort(),
    );
  });

  it('invalidates join-requests on a `join_requests` change for this team', () => {
    const { invalidateSpy } = setup('t-x');
    fireListener('join_requests', 'team_id=eq.t-x');
    expect(invalidatedKeys(invalidateSpy)).toEqual(['join-requests']);
  });

  it('invalidates deployment-windows + my-deployment-windows on a `deployment_windows` change for this team', () => {
    const { invalidateSpy } = setup('t-x');
    fireListener('deployment_windows', 'team_id=eq.t-x');
    expect(invalidatedKeys(invalidateSpy).sort()).toEqual(
      ['deployment-windows', 'my-deployment-windows'].sort(),
    );
  });

  it('invalidates the full pick fan-out on a `deployment_picks` change', () => {
    // deployment_picks has no team_id column, so the subscription is
    // unfiltered and the invalidation has to be broad — covering both
    // commander and reservist views, and the per-day commander aggregate.
    const { invalidateSpy } = setup('t-x');
    fireListener('deployment_picks');
    expect(invalidatedKeys(invalidateSpy).sort()).toEqual(
      [
        'approved-picks',
        'deployment-picks',
        'deployment-windows',
        'my-deployment-windows',
        'team-day',
      ].sort(),
    );
  });

  it('invalidates team + teams-for-division + teams-for-member on a `teams` change', () => {
    // teams write events: rename, crest change, show_unit_schedule toggle,
    // invite-code rotation. All three caches must refresh so cross-device
    // sessions see the new values without a manual reload.
    const { invalidateSpy } = setup('t-x');
    fireListener('teams');
    expect(invalidatedKeys(invalidateSpy).sort()).toEqual(
      ['team', 'teams-for-division', 'teams-for-member'].sort(),
    );
  });

  it('invalidates projects on a `projects` change', () => {
    const { invalidateSpy } = setup('t-x');
    fireListener('projects');
    expect(invalidatedKeys(invalidateSpy)).toEqual(['projects']);
  });
});
