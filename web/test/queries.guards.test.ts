import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Hook-level tests for the optimistic-concurrency guards in lib/queries.ts
// (#120/#166/#167/#168). The component tests mock these hooks and the
// integration tests hit PostgREST directly, so neither exercises the hook's
// own supabase chain — exactly the blind spot that let #168 ship broken. These
// pin, per hook: a matched row resolves, and a 0-row result (a lost race)
// throws the clean message AND skips the side effects. For useApproveJoinRequest
// the headline assertion is the claim-first ordering: a lost claim must throw
// BEFORE any member is provisioned (no duplicate orphan member).

// --- configurable chainable supabase mock -----------------------------------

let results: Record<string, { data: unknown; error: unknown }>;
let inserts: string[];

function reset() {
  results = {
    slots:              { data: [{ id: 's1' }], error: null },
    deployment_picks:   { data: [{ id: 'p1' }], error: null },
    deployment_windows: { data: [{ id: 'w1' }], error: null },
    join_requests:      { data: [{ id: 'jr1' }], error: null },
    members:            { data: [{ id: 'm-new' }], error: null },
    skills:             { data: [], error: null },
    team_members:       { data: null, error: null },
    member_skills:      { data: null, error: null },
    activity_log:       { data: null, error: null },
  };
  inserts = [];
}
reset();

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  b.update = chain;
  b.insert = () => { inserts.push(table); return b; };
  b.eq = chain; b.in = chain; b.neq = chain; b.not = chain; b.select = chain; b.order = chain;
  // members provisioning awaits `.insert(...).select('id').single()`.
  b.single = () =>
    Promise.resolve(table === 'members' ? { data: { id: 'm-new' }, error: null } : (results[table] ?? { data: null, error: null }));
  // every other terminal is awaited directly (e.g. `.select('id')`).
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(results[table] ?? { data: null, error: null }).then(resolve, reject);
  return b;
}

vi.mock('../src/lib/supabase', () => ({ supabase: { from: (t: string) => makeBuilder(t) } }));
vi.mock('../src/lib/notify', () => ({
  notifyUrgentCallUp: vi.fn(), notifySlotAssigned: vi.fn(), notifyPickDecided: vi.fn(),
  notifySlotChanged: vi.fn(), notifySlotCancelled: vi.fn(), notifySlotUnassigned: vi.fn(),
  notifyBulkCancelled: vi.fn(), notifyDayAdded: vi.fn(), notifyStatusChanged: vi.fn(),
}));

import {
  useUpdateSlotState, useWithdrawDayPick, useUpdateDeploymentWindow,
  useApproveJoinRequest, useRejectJoinRequest,
} from '../src/lib/queries';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}
const hook = <T,>(h: () => T) => renderHook(h, { wrapper }).result;

beforeEach(reset);

describe('useUpdateSlotState guard', () => {
  const vars = { slotId: 's1', state: 'published', currentState: 'draft', actorId: 'c1', teamId: 't1', actorName: 'C', slotTitle: 'Patrol' } as const;
  it('resolves and logs when the row still matches', async () => {
    await expect(hook(useUpdateSlotState).current.mutateAsync(vars)).resolves.toBeUndefined();
    expect(inserts).toContain('activity_log');
  });
  it('throws and skips the log when the slot already changed (0 rows)', async () => {
    results.slots = { data: [], error: null };
    await expect(hook(useUpdateSlotState).current.mutateAsync(vars)).rejects.toThrow(/already changed/i);
    expect(inserts).not.toContain('activity_log');
  });
});

describe('useWithdrawDayPick guard', () => {
  const vars = { pickId: 'p1', currentState: 'proposed', actorId: 'm1', teamId: 't1', date: '2026-06-03' } as const;
  it('resolves and logs when the pick still matches', async () => {
    await expect(hook(useWithdrawDayPick).current.mutateAsync(vars)).resolves.toBeUndefined();
    expect(inserts).toContain('activity_log');
  });
  it('throws when the pick already moved on (0 rows)', async () => {
    results.deployment_picks = { data: [], error: null };
    await expect(hook(useWithdrawDayPick).current.mutateAsync(vars)).rejects.toThrow(/already changed/i);
    expect(inserts).not.toContain('activity_log');
  });
});

describe('useRejectJoinRequest guard', () => {
  const vars = { requestId: 'jr1', teamId: 't1', actorId: 'c1', actorName: 'C', name: 'Dan' };
  it('resolves and logs when still pending', async () => {
    await expect(hook(useRejectJoinRequest).current.mutateAsync(vars)).resolves.toBeUndefined();
    expect(inserts).toContain('activity_log');
  });
  it('throws and skips the log when already resolved (0 rows)', async () => {
    results.join_requests = { data: [], error: null };
    await expect(hook(useRejectJoinRequest).current.mutateAsync(vars)).rejects.toThrow(/already resolved/i);
    expect(inserts).not.toContain('activity_log');
  });
});

describe('useUpdateDeploymentWindow guard', () => {
  const base = { windowId: 'w1', teamId: 't1', actorId: 'c1', actorName: 'C' };
  it('throws on a lost state transition (0 rows)', async () => {
    results.deployment_windows = { data: [], error: null };
    const vars = { ...base, patch: { state: 'closed' as const, currentState: 'open' as const } };
    await expect(hook(useUpdateDeploymentWindow).current.mutateAsync(vars)).rejects.toThrow(/already changed/i);
    expect(inserts).not.toContain('activity_log');
  });
  it('resolves on a matched state transition', async () => {
    const vars = { ...base, patch: { state: 'closed' as const, currentState: 'open' as const } };
    await expect(hook(useUpdateDeploymentWindow).current.mutateAsync(vars)).resolves.toBeUndefined();
    expect(inserts).toContain('activity_log');
  });
  it('does NOT guard metadata-only edits (no state) even with a 0-row result', async () => {
    results.deployment_windows = { data: [], error: null };
    const vars = { ...base, patch: { label: 'Renamed' } };
    await expect(hook(useUpdateDeploymentWindow).current.mutateAsync(vars)).resolves.toBeUndefined();
    expect(inserts).toContain('activity_log');
  });
});

describe('useApproveJoinRequest claim-first ordering', () => {
  const vars = {
    requestId: 'jr1', teamId: 't1', divisionId: 'd1', actorId: 'c1', actorName: 'C',
    name: 'Dan Levi', phone: '+972500000000', skillNames: [] as string[],
  };
  it('provisions the member only after a successful claim', async () => {
    await expect(hook(useApproveJoinRequest).current.mutateAsync(vars)).resolves.toBeUndefined();
    expect(inserts).toEqual(expect.arrayContaining(['members', 'team_members', 'activity_log']));
  });
  it('throws on a lost claim WITHOUT provisioning a member (no orphan)', async () => {
    results.join_requests = { data: [], error: null };
    await expect(hook(useApproveJoinRequest).current.mutateAsync(vars)).rejects.toThrow(/already resolved/i);
    // The whole point of claim-first: a lost race creates no member/team row.
    expect(inserts).not.toContain('members');
    expect(inserts).not.toContain('team_members');
    expect(inserts).not.toContain('activity_log');
  });
});
