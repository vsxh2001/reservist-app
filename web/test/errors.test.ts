import { describe, it, expect } from 'vitest';
import { humanizeError } from '../src/lib/errors';

describe('humanizeError', () => {
  it('returns the fallback when err is null / undefined / empty string', () => {
    expect(humanizeError(null, 'Fallback')).toBe('Fallback');
    expect(humanizeError(undefined, 'Fallback')).toBe('Fallback');
    expect(humanizeError('', 'Fallback')).toBe('Fallback');
  });

  it('appends the message to the fallback when no heuristic matches', () => {
    const err = new Error('something specific went wrong');
    expect(humanizeError(err, 'Failed to save')).toBe('Failed to save: something specific went wrong');
  });

  it('translates slots unique-constraint violations to a friendly slot-conflict message', () => {
    const err = new Error(
      'duplicate key value violates unique constraint "slots_team_title_start_uniq"',
    );
    expect(humanizeError(err, 'Failed to create slot')).toBe(
      'A slot with this title already exists at this start time.',
    );
  });

  it('translates push_subscriptions unique-constraint violations to a re-subscribe message', () => {
    const err = new Error(
      'duplicate key value violates unique constraint "push_subscriptions_member_id_endpoint_key"',
    );
    expect(humanizeError(err, 'Failed to subscribe')).toBe(
      'This device is already subscribed to push notifications.',
    );
  });

  it('translates members_auth_user_idx duplicate to a profile-already-linked message', () => {
    const err = new Error(
      'duplicate key value violates unique constraint "members_auth_user_idx"',
    );
    expect(humanizeError(err, 'Failed to claim profile')).toBe(
      'This account is already linked to a member profile.',
    );
  });

  it('falls back to the generic duplicate-key copy when the constraint name is not recognized', () => {
    const err = new Error('duplicate key value violates unique constraint "some_other_idx"');
    expect(humanizeError(err, 'Failed')).toBe('That already exists — refresh and try again.');
  });

  it('translates RLS WITH CHECK rejections to a friendly permission message', () => {
    const err = new Error('new row violates row-level security policy for table "members"');
    expect(humanizeError(err, 'Failed to approve')).toBe(
      "You don't have permission to do that — it may require commander or admin rights.",
    );
  });

  it('translates fetch / network errors', () => {
    const err = new TypeError('Failed to fetch');
    expect(humanizeError(err, 'Failed')).toBe('Network error — check your connection and try again.');
  });

  it('also accepts a raw string error', () => {
    expect(humanizeError('duplicate key value violates unique constraint "slots_team_title_start_uniq"', 'X'))
      .toBe('A slot with this title already exists at this start time.');
  });

  it('never throws for unexpected types', () => {
    expect(humanizeError(42, 'Fallback')).toBe('Fallback');
    expect(humanizeError({ message: 'not an Error' }, 'Fallback')).toBe('Fallback');
  });
});
