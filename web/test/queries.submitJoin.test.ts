import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Regression guard for the anon join-request submit bug. join_requests has an
// anon INSERT policy but NO anon SELECT policy (only commander/admin can read).
// The hook used to chain `.insert(...).select('id').single()`, which asks
// PostgREST for the row back (Prefer: return=representation); the RLS-filtered
// read-back returns 0 rows, so `.single()` threw on an insert that actually
// succeeded — every anonymous joiner saw a failure toast for a request that
// went through. The fix is a minimal insert (no .select()/.single()). These
// tests pin that the chain never reads the row back and still surfaces real
// insert errors. Hook-level because component tests mock this hook and the
// integration suite deliberately uses return=minimal — neither exercises it.

let insertedPayload: Record<string, unknown> | null;
let selectCalled: boolean;
let singleCalled: boolean;
let insertError: unknown;

function reset() {
  insertedPayload = null;
  selectCalled = false;
  singleCalled = false;
  insertError = null;
}
reset();

function makeBuilder() {
  const b: Record<string, unknown> = {};
  b.insert = (payload: Record<string, unknown>) => {
    insertedPayload = payload;
    return b;
  };
  b.select = () => { selectCalled = true; return b; };
  b.single = () => { singleCalled = true; return Promise.resolve({ data: null, error: insertError }); };
  // A minimal insert (no .select()) is awaited directly. return=minimal yields
  // { data: null, error: null } on success.
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: insertError }).then(resolve, reject);
  return b;
}
vi.mock('../src/lib/supabase', () => ({ supabase: { from: () => makeBuilder() } }));

import { useSubmitJoinRequest } from '../src/lib/queries';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { spy, wrapper };
}

const vars = {
  teamId: 't1', name: 'Dana Cohen', phone: '+972500000000',
  skillNames: ['Driving'], note: 'Available weekends',
};

beforeEach(reset);

describe('useSubmitJoinRequest', () => {
  it('inserts the request WITHOUT reading the row back (no RLS-blocked select/single)', async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useSubmitJoinRequest(), { wrapper });
    await expect(result.current.mutateAsync(vars)).resolves.toBeUndefined();
    // The bug was chaining .select('id').single(); the fix must not read back.
    expect(selectCalled).toBe(false);
    expect(singleCalled).toBe(false);
    expect(insertedPayload).toMatchObject({
      team_id: 't1', name: 'Dana Cohen', phone: '+972500000000',
      skill_names: ['Driving'], note: 'Available weekends',
    });
  });

  it('invalidates the join-requests list on success', async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useSubmitJoinRequest(), { wrapper });
    await result.current.mutateAsync(vars);
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] }).queryKey?.[0]);
    expect(keys).toContain('join-requests');
  });

  it('throws when the insert itself errors', async () => {
    insertError = new Error('insert failed');
    const { wrapper } = setup();
    const { result } = renderHook(() => useSubmitJoinRequest(), { wrapper });
    await expect(result.current.mutateAsync(vars)).rejects.toThrow(/insert failed/);
  });
});
