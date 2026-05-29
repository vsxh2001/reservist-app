import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// useResolvePick guards the commander approve/reject of a deployment pick on
// the pick's CURRENT state. Picks are created 'proposed' (pick_state_enum
// default) and the state-machine only allows proposed -> approved/rejected,
// so the guard must filter on 'proposed'. A regression once shipped that
// guarded on 'pending' (a join_requests state, not a pick state), which made
// the UPDATE match 0 rows and broke every approve/reject. These tests pin the
// guard so it can't silently re-break — the component tests mock the hook and
// the integration tests hit PostgREST directly, so neither covers this layer.

// --- supabase mock: chainable builder that records the .eq() filters --------

let pickSelectResult: { data: { id: string }[] | null; error: unknown } = {
  data: [{ id: 'pick-1' }],
  error: null,
};
let eqCalls: Array<[string, unknown]> = [];

function makePickBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.update = chain;
  builder.eq = (col: string, val: unknown) => {
    eqCalls.push([col, val]);
    return builder;
  };
  // `.select('id')` is the awaited terminal — make the builder thenable.
  builder.select = chain;
  builder.then = (resolve: (v: typeof pickSelectResult) => unknown) =>
    Promise.resolve(pickSelectResult).then(resolve);
  return builder;
}

function makeActivityBuilder() {
  const builder: Record<string, unknown> = {};
  // `await supabase.from('activity_log').insert({...})`
  builder.insert = () => Promise.resolve({ data: null, error: null });
  return builder;
}

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'deployment_picks') return makePickBuilder();
      if (table === 'activity_log') return makeActivityBuilder();
      throw new Error(`Unexpected table in resolvePick test: ${table}`);
    },
  },
}));

const notifyPickDecided = vi.fn();
vi.mock('../src/lib/notify', () => ({
  notifyUrgentCallUp: vi.fn(), notifySlotAssigned: vi.fn(),
  notifyPickDecided: (...args: unknown[]) => notifyPickDecided(...args),
  notifySlotChanged: vi.fn(), notifySlotCancelled: vi.fn(),
  notifySlotUnassigned: vi.fn(), notifyBulkCancelled: vi.fn(),
  notifyDayAdded: vi.fn(), notifyStatusChanged: vi.fn(),
}));

import { useResolvePick } from '../src/lib/queries';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const VARS = {
  pickId: 'pick-1', nextState: 'approved' as const, commanderNote: null,
  actorId: 'cmd-1', actorName: 'Commander', teamId: 'team-1',
  memberId: 'mem-1', memberName: 'Reservist', windowLabel: 'June', date: '2026-06-03',
};

describe('useResolvePick concurrency guard', () => {
  beforeEach(() => {
    pickSelectResult = { data: [{ id: 'pick-1' }], error: null };
    eqCalls = [];
    notifyPickDecided.mockClear();
  });

  it("guards the UPDATE on state 'proposed', not 'pending'", async () => {
    const { result } = renderHook(() => useResolvePick(), { wrapper });
    await result.current.mutateAsync(VARS);

    expect(eqCalls).toContainEqual(['state', 'proposed']);
    expect(eqCalls).not.toContainEqual(['state', 'pending']);
    expect(eqCalls).toContainEqual(['id', 'pick-1']);
  });

  it('resolves and fires the push when a row matched', async () => {
    const { result } = renderHook(() => useResolvePick(), { wrapper });
    await expect(result.current.mutateAsync(VARS)).resolves.toBeUndefined();
    expect(notifyPickDecided).toHaveBeenCalledOnce();
  });

  it('throws "already resolved" and skips the push when 0 rows matched', async () => {
    pickSelectResult = { data: [], error: null };
    const { result } = renderHook(() => useResolvePick(), { wrapper });

    await waitFor(() => expect(result.current).toBeTruthy());
    await expect(result.current.mutateAsync(VARS)).rejects.toThrow(/already resolved/i);
    expect(notifyPickDecided).not.toHaveBeenCalled();
  });
});
