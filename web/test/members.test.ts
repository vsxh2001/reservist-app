import { describe, expect, it } from 'vitest';
import { getActiveMembers } from '../src/lib/members';
import type { Member, Status } from '../src/lib/types';

function m(name: string, status: Status): Member {
  return {
    id: name.toLowerCase(),
    name,
    initials: name.slice(0, 2).toUpperCase(),
    tone: 0,
    status,
    status_note: null,
    status_until: null,
    skills: [],
    phone: null,
    phone_visible_to_team: false,
    role: null,
    is_commander: false,
    last_seen: '',
    teams: [],
    auth_user_id: null,
  } as unknown as Member;
}

describe('getActiveMembers', () => {
  it('filters out released and unavailable members', () => {
    const result = getActiveMembers([
      m('Avi', 'available'),
      m('Boaz', 'released'),
      m('Chen', 'standby'),
      m('Dani', 'unavailable'),
    ]);
    expect(result.map((x) => x.name)).toEqual(['Avi', 'Chen']);
  });

  it('sorts available before standby', () => {
    const result = getActiveMembers([
      m('Chen', 'standby'),
      m('Avi', 'available'),
    ]);
    expect(result.map((x) => x.status)).toEqual(['available', 'standby']);
  });

  it('within a status, sorts by name (locale-aware)', () => {
    const result = getActiveMembers([
      m('Boaz', 'available'),
      m('Avi', 'available'),
      m('Chen', 'available'),
    ]);
    expect(result.map((x) => x.name)).toEqual(['Avi', 'Boaz', 'Chen']);
  });

  it('combines status priority and name ordering', () => {
    const result = getActiveMembers([
      m('Zev', 'available'),
      m('Avi', 'standby'),
      m('Boaz', 'available'),
      m('Chen', 'standby'),
    ]);
    expect(result.map((x) => x.name)).toEqual(['Boaz', 'Zev', 'Avi', 'Chen']);
  });

  it('handles empty input', () => {
    expect(getActiveMembers([])).toEqual([]);
  });

  it('returns a new array — does not mutate input', () => {
    const input = [m('Chen', 'standby'), m('Avi', 'available')];
    const inputCopy = [...input];
    getActiveMembers(input);
    expect(input.map((x) => x.name)).toEqual(inputCopy.map((x) => x.name));
  });
});
