import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase BEFORE importing notify so the helper captures the mocked module.
// vi.mock is hoisted above imports; the factory must construct its own vi.fn().
vi.mock('../src/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from '../src/lib/supabase';
import {
  notifyUrgentCallUp,
  notifySlotAssigned,
  notifyPickDecided,
  notifySlotChanged,
  notifySlotCancelled,
  notifySlotUnassigned,
  notifyBulkCancelled,
  notifyDayAdded,
} from '../src/lib/notify';

const invoke = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

describe('notify helpers', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { sent: 1, removed: 0 }, error: null });
  });

  it('notifyUrgentCallUp invokes send-push with all team member ids and an urgent: tag', async () => {
    await notifyUrgentCallUp('team-1', ['m1', 'm2', 'm3'], 'Northern QRF');
    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe('send-push');
    expect(opts.body).toMatchObject({
      member_ids: ['m1', 'm2', 'm3'],
      team_id: 'team-1',
      title: 'Urgent: Northern QRF',
      tag: 'urgent:team-1',
    });
    expect(typeof opts.body.body).toBe('string');
  });

  it('notifySlotAssigned targets a single member, scoped to team', async () => {
    await notifySlotAssigned('team-1', 'm-target', 'Bravo gate watch');
    expect(invoke).toHaveBeenCalledTimes(1);
    const opts = invoke.mock.calls[0][1];
    expect(opts.body).toMatchObject({
      member_ids: ['m-target'],
      team_id: 'team-1',
      title: 'Assigned: Bravo gate watch',
      tag: 'assigned:m-target',
    });
  });

  it('notifyPickDecided uses approved/rejected copy and a per-decision tag', async () => {
    await notifyPickDecided('team-1', 'm-target', 'approved', 'June drill');
    let opts = invoke.mock.calls[0][1];
    expect(opts.body.title).toMatch(/Approved: June drill/);
    expect(opts.body.tag).toBe('pick:m-target:approved');

    invoke.mockClear();
    await notifyPickDecided('team-1', 'm-target', 'rejected', 'June drill');
    opts = invoke.mock.calls[0][1];
    expect(opts.body.title).toMatch(/Declined: June drill/);
    expect(opts.body.tag).toBe('pick:m-target:rejected');
  });

  it('notifySlotChanged targets the assignee with a slot-changed: tag', async () => {
    await notifySlotChanged('team-1', 'm-target', 'Bravo gate watch');
    expect(invoke).toHaveBeenCalledTimes(1);
    const opts = invoke.mock.calls[0][1];
    expect(opts.body).toMatchObject({
      member_ids: ['m-target'],
      team_id: 'team-1',
      title: 'Slot updated: Bravo gate watch',
      tag: 'slot-changed:m-target',
    });
  });

  it('notifySlotCancelled targets the assignee with a slot-cancelled: tag', async () => {
    await notifySlotCancelled('team-1', 'm-target', 'Bravo gate watch');
    expect(invoke).toHaveBeenCalledTimes(1);
    const opts = invoke.mock.calls[0][1];
    expect(opts.body).toMatchObject({
      member_ids: ['m-target'],
      team_id: 'team-1',
      title: 'Cancelled: Bravo gate watch',
      tag: 'slot-cancelled:m-target',
    });
  });

  it('notifySlotUnassigned targets the removed member with a slot-unassigned: tag', async () => {
    await notifySlotUnassigned('team-1', 'm-target', 'Bravo gate watch');
    expect(invoke).toHaveBeenCalledTimes(1);
    const opts = invoke.mock.calls[0][1];
    expect(opts.body).toMatchObject({
      member_ids: ['m-target'],
      team_id: 'team-1',
      title: 'Unassigned: Bravo gate watch',
      tag: 'slot-unassigned:m-target',
    });
  });

  it('notifyBulkCancelled fans out to every affected assignee in one call with a team-scoped tag', async () => {
    await notifyBulkCancelled('team-1', ['m1', 'm2', 'm3']);
    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe('send-push');
    expect(opts.body).toMatchObject({
      member_ids: ['m1', 'm2', 'm3'],
      team_id: 'team-1',
      title: 'Slots cancelled',
      tag: 'bulk-cancelled:team-1',
    });
    expect(typeof opts.body.body).toBe('string');
  });

  it('notifyDayAdded targets the window member with a day-added: tag', async () => {
    await notifyDayAdded('team-1', 'm-target', 'June drill · 2026-06-10');
    expect(invoke).toHaveBeenCalledTimes(1);
    const opts = invoke.mock.calls[0][1];
    expect(opts.body).toMatchObject({
      member_ids: ['m-target'],
      team_id: 'team-1',
      title: 'Deployment day added: June drill · 2026-06-10',
      tag: 'day-added:m-target',
    });
    expect(typeof opts.body.body).toBe('string');
  });

  it('swallows transport errors so callers never see a rejected promise', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(notifySlotAssigned('t', 'm', 'X')).resolves.toBeUndefined();
  });

  it('swallows thrown errors (e.g. network failure) the same way', async () => {
    invoke.mockRejectedValueOnce(new Error('network down'));
    await expect(notifySlotAssigned('t', 'm', 'X')).resolves.toBeUndefined();
  });
});
