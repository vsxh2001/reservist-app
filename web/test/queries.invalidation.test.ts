import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Pins the cache-invalidation contract for mutations whose writes feed a query
// key they previously forgot to invalidate (stale-UI bugs). Hook-level because
// component tests mock these hooks and integration tests hit PostgREST
// directly — neither sees the onSuccess invalidations.

// --- generic chainable supabase mock (success path for every chain) ---------

let inserts: string[];
function reset() { inserts = []; }
reset();

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  b.update = chain; b.upsert = chain; b.delete = chain;
  b.insert = () => { inserts.push(table); return b; };
  b.eq = chain; b.in = chain; b.select = chain; b.order = chain; b.match = chain;
  b.single = () => Promise.resolve(table === 'members' ? { data: { id: 'm-new' }, error: null } : { data: null, error: null });
  b.maybeSingle = () => Promise.resolve(table === 'skills' ? { data: { id: 'sk1' }, error: null } : { data: null, error: null });
  // Non-empty rows so guarded updates (e.g. the approve claim's .select('id'))
  // see a matched row and proceed down the success path.
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'row' }], error: null }).then(resolve);
  return b;
}
vi.mock('../src/lib/supabase', () => ({ supabase: { from: (t: string) => makeBuilder(t) } }));
vi.mock('../src/lib/notify', () => ({
  notifyUrgentCallUp: vi.fn(), notifySlotAssigned: vi.fn(), notifyPickDecided: vi.fn(),
  notifySlotChanged: vi.fn(), notifySlotCancelled: vi.fn(), notifySlotUnassigned: vi.fn(),
  notifyBulkCancelled: vi.fn(), notifyDayAdded: vi.fn(), notifyStatusChanged: vi.fn(),
}));

import {
  useUpdateStatus, useSetMemberSkill, useRemoveMemberSkill, useApproveJoinRequest,
} from '../src/lib/queries';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const spy = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { spy, wrapper };
}
// First element of every invalidated queryKey.
const keysFrom = (spy: ReturnType<typeof vi.fn>) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey?: unknown[] } | undefined)?.queryKey?.[0]);

beforeEach(reset);

describe('mutation cache invalidation', () => {
  it('useUpdateStatus invalidates team-day + members-in-division (status is denormalized into both)', async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useUpdateStatus(), { wrapper });
    await result.current.mutateAsync({
      memberId: 'm1', status: 'available', note: null, until: null,
      setBy: 'c1', actorName: 'C', memberName: 'Alice', teamId: 't1', statusLabel: 'Available',
    });
    const keys = keysFrom(spy);
    expect(keys).toContain('team-day');
    expect(keys).toContain('members-in-division');
  });

  it('useSetMemberSkill invalidates members-in-division (roster surfaces skills)', async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useSetMemberSkill(), { wrapper });
    await result.current.mutateAsync({
      memberId: 'm1', divisionId: 'd1', skillName: 'Driving', level: 'intermediate',
      actorId: 'c1', actorName: 'C',
    });
    expect(keysFrom(spy)).toContain('members-in-division');
  });

  it('useRemoveMemberSkill invalidates members-in-division', async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useRemoveMemberSkill(), { wrapper });
    await result.current.mutateAsync({
      memberId: 'm1', divisionId: 'd1', skillName: 'Driving',
      actorId: 'c1', actorName: 'C',
    });
    expect(keysFrom(spy)).toContain('members-in-division');
  });

  it('useApproveJoinRequest invalidates teams-for-member (it adds a team_members row)', async () => {
    const { spy, wrapper } = setup();
    const { result } = renderHook(() => useApproveJoinRequest(), { wrapper });
    await result.current.mutateAsync({
      requestId: 'jr1', teamId: 't1', divisionId: 'd1', actorId: 'c1', actorName: 'C',
      name: 'Dan', phone: '+972500000000', skillNames: [],
    });
    const keys = keysFrom(spy);
    expect(keys).toContain('teams-for-member');
    // The approval also inserts a new member → division roster must refresh.
    expect(keys).toContain('members-in-division');
  });
});
