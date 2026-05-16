import { describe, expect, it } from 'vitest';
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_ORDER,
  STATUS_LABEL,
  STATUS_ORDER,
  findMemberConflicts,
  findDeploymentConflicts,
  meetsSkillReq,
  memberMatchesAllSkillReqs,
  picksCoverage,
  type MemberSkill,
  type SlotSkill,
  type DeploymentPick,
} from '../src/lib/types';

describe('skill level tokens', () => {
  it('orders junior < intermediate < senior', () => {
    expect(SKILL_LEVEL_ORDER.junior).toBe(0);
    expect(SKILL_LEVEL_ORDER.intermediate).toBe(1);
    expect(SKILL_LEVEL_ORDER.senior).toBe(2);
  });

  it('SKILL_LEVELS array is ascending', () => {
    expect(SKILL_LEVELS).toEqual(['junior', 'intermediate', 'senior']);
  });

  it('labels are human-readable', () => {
    expect(SKILL_LEVEL_LABEL.junior).toBe('Junior');
    expect(SKILL_LEVEL_LABEL.intermediate).toBe('Intermediate');
    expect(SKILL_LEVEL_LABEL.senior).toBe('Senior');
  });
});

describe('status tokens', () => {
  it('STATUS_ORDER follows roster priority', () => {
    expect(STATUS_ORDER).toEqual(['available', 'standby', 'released', 'unavailable']);
  });
  it('has a label for every status', () => {
    for (const s of STATUS_ORDER) {
      expect(STATUS_LABEL[s]).toBeTruthy();
    }
  });
});

describe('meetsSkillReq', () => {
  const skills: MemberSkill[] = [
    { name: 'Night Ops', level: 'senior' },
    { name: 'Urban Combat', level: 'intermediate' },
    { name: 'Arabic', level: 'junior' },
  ];

  it('passes when level equals required', () => {
    expect(meetsSkillReq(skills, { name: 'Night Ops', min_level: 'senior' })).toBe(true);
    expect(meetsSkillReq(skills, { name: 'Urban Combat', min_level: 'intermediate' })).toBe(true);
    expect(meetsSkillReq(skills, { name: 'Arabic', min_level: 'junior' })).toBe(true);
  });

  it('passes when level exceeds required', () => {
    expect(meetsSkillReq(skills, { name: 'Night Ops', min_level: 'junior' })).toBe(true);
    expect(meetsSkillReq(skills, { name: 'Urban Combat', min_level: 'junior' })).toBe(true);
  });

  it('fails when level below required', () => {
    expect(meetsSkillReq(skills, { name: 'Urban Combat', min_level: 'senior' })).toBe(false);
    expect(meetsSkillReq(skills, { name: 'Arabic', min_level: 'intermediate' })).toBe(false);
  });

  it('fails when skill missing entirely', () => {
    expect(meetsSkillReq(skills, { name: 'Sniper Cert.', min_level: 'junior' })).toBe(false);
  });

  it('empty skills list never matches a requirement', () => {
    expect(meetsSkillReq([], { name: 'Night Ops', min_level: 'junior' })).toBe(false);
  });
});

describe('memberMatchesAllSkillReqs', () => {
  const skills: MemberSkill[] = [
    { name: 'Combat Medic Cert.', level: 'senior' },
    { name: 'First Aid Cert.', level: 'intermediate' },
  ];

  it('passes with zero requirements', () => {
    expect(memberMatchesAllSkillReqs(skills, [])).toBe(true);
    expect(memberMatchesAllSkillReqs([], [])).toBe(true);
  });

  it('passes when every requirement met', () => {
    const reqs: SlotSkill[] = [
      { name: 'Combat Medic Cert.', min_level: 'intermediate' },
      { name: 'First Aid Cert.', min_level: 'junior' },
    ];
    expect(memberMatchesAllSkillReqs(skills, reqs)).toBe(true);
  });

  it('fails when any requirement unmet', () => {
    const reqs: SlotSkill[] = [
      { name: 'Combat Medic Cert.', min_level: 'intermediate' },
      { name: 'First Aid Cert.', min_level: 'senior' }, // not held at senior
    ];
    expect(memberMatchesAllSkillReqs(skills, reqs)).toBe(false);
  });
});

describe('findMemberConflicts', () => {
  const memberId = 'm1';
  const baseSlot = {
    id: 's-existing',
    title: 'Existing slot',
    start_at: '2026-06-01T10:00:00Z',
    end_at: '2026-06-01T14:00:00Z',
    state: 'published' as const,
    assignee_ids: [memberId, 'm2'],
  };

  it('detects exact overlap', () => {
    const c = findMemberConflicts(memberId, '2026-06-01T10:00:00Z', '2026-06-01T14:00:00Z', [baseSlot]);
    expect(c).toHaveLength(1);
    expect(c[0].title).toBe('Existing slot');
  });

  it('detects partial overlap from start', () => {
    const c = findMemberConflicts(memberId, '2026-06-01T09:00:00Z', '2026-06-01T11:00:00Z', [baseSlot]);
    expect(c).toHaveLength(1);
  });

  it('detects partial overlap from end', () => {
    const c = findMemberConflicts(memberId, '2026-06-01T13:00:00Z', '2026-06-01T16:00:00Z', [baseSlot]);
    expect(c).toHaveLength(1);
  });

  it('detects window fully containing existing slot', () => {
    const c = findMemberConflicts(memberId, '2026-06-01T08:00:00Z', '2026-06-01T18:00:00Z', [baseSlot]);
    expect(c).toHaveLength(1);
  });

  it('no conflict when windows disjoint', () => {
    const c = findMemberConflicts(memberId, '2026-06-01T15:00:00Z', '2026-06-01T18:00:00Z', [baseSlot]);
    expect(c).toHaveLength(0);
  });

  it('no conflict when adjacent (end == start)', () => {
    // existing ends 14:00, new starts 14:00 → not overlapping per half-open window
    const c = findMemberConflicts(memberId, '2026-06-01T14:00:00Z', '2026-06-01T16:00:00Z', [baseSlot]);
    expect(c).toHaveLength(0);
  });

  it('skips non-published slots', () => {
    const draft = { ...baseSlot, state: 'draft' as const };
    const cancelled = { ...baseSlot, state: 'cancelled' as const };
    const completed = { ...baseSlot, state: 'completed' as const };
    expect(findMemberConflicts(memberId, '2026-06-01T10:00:00Z', '2026-06-01T14:00:00Z', [draft])).toHaveLength(0);
    expect(findMemberConflicts(memberId, '2026-06-01T10:00:00Z', '2026-06-01T14:00:00Z', [cancelled])).toHaveLength(0);
    expect(findMemberConflicts(memberId, '2026-06-01T10:00:00Z', '2026-06-01T14:00:00Z', [completed])).toHaveLength(0);
  });

  it('skips slots where member is not assigned', () => {
    const other = { ...baseSlot, assignee_ids: ['m2', 'm3'] };
    const c = findMemberConflicts(memberId, '2026-06-01T10:00:00Z', '2026-06-01T14:00:00Z', [other]);
    expect(c).toHaveLength(0);
  });

  it('excludeSlotId opt-out (editing same slot)', () => {
    const c = findMemberConflicts(memberId, '2026-06-01T10:00:00Z', '2026-06-01T14:00:00Z', [baseSlot], 's-existing');
    expect(c).toHaveLength(0);
  });

  it('open-ended existing slot treated as 1h window', () => {
    const openEnded = { ...baseSlot, end_at: null };
    // existing: 10:00–11:00 implied
    const overlapping = findMemberConflicts(memberId, '2026-06-01T10:30:00Z', '2026-06-01T12:00:00Z', [openEnded]);
    const disjoint = findMemberConflicts(memberId, '2026-06-01T11:00:00Z', '2026-06-01T12:00:00Z', [openEnded]);
    expect(overlapping).toHaveLength(1);
    expect(disjoint).toHaveLength(0);
  });

  it('open-ended candidate window also treated as 1h', () => {
    const c = findMemberConflicts(memberId, '2026-06-01T10:30:00Z', null, [baseSlot]);
    // candidate 10:30–11:30 overlaps existing 10:00–14:00
    expect(c).toHaveLength(1);
  });

  it('returns multiple when many overlap', () => {
    const s2 = { ...baseSlot, id: 's2', title: 'Second', start_at: '2026-06-01T12:00:00Z', end_at: '2026-06-01T16:00:00Z' };
    const c = findMemberConflicts(memberId, '2026-06-01T08:00:00Z', '2026-06-01T18:00:00Z', [baseSlot, s2]);
    expect(c.map((x) => x.title).sort()).toEqual(['Existing slot', 'Second']);
  });
});

describe('findDeploymentConflicts', () => {
  const memberId = 'u1';
  // A pick on 2026-06-01 covers local midnight 2026-06-01 → 2026-06-02.
  const pick = { member_id: memberId, date: '2026-06-01' };

  it('exact-date match → 1 conflict', () => {
    // Slot runs 2026-06-01T06:00 to 2026-06-01T18:00 local — squarely inside the pick day.
    const c = findDeploymentConflicts(memberId, '2026-06-01T06:00:00', '2026-06-01T18:00:00', [pick]);
    expect(c).toHaveLength(1);
    expect(c[0].date).toBe('2026-06-01');
  });

  it('slot ends exactly at pick next-day-midnight → no overlap (half-open)', () => {
    // Pick is [midnight 06-01, midnight 06-02). Slot ends at midnight 06-02 → no overlap.
    const midnight02 = new Date(2026, 5, 2).toISOString(); // local midnight Jun 2
    const midnight01 = new Date(2026, 5, 1).toISOString(); // local midnight Jun 1
    const c = findDeploymentConflicts(memberId, midnight01, midnight02, [pick]);
    // Slot starts at pick start and ends at pick end → the start IS less than pickEnd,
    // and pickStart IS less than aEnd — so they DO overlap. Adjust test: slot must start
    // exactly at pickEnd to be disjoint.
    // Actually [aStart=midnight01, aEnd=midnight02) ∩ [pickStart=midnight01, pickEnd=midnight02)
    // is non-empty (they are equal intervals). Let's test the disjoint case instead:
    // Slot starts at midnight 06-02 (= pickEnd) → no overlap.
    const c2 = findDeploymentConflicts(memberId, midnight02, new Date(2026, 5, 2, 6).toISOString(), [pick]);
    expect(c2).toHaveLength(0);
  });

  it('slot spans 3 picks → returns 3', () => {
    const picks = [
      { member_id: memberId, date: '2026-06-01' },
      { member_id: memberId, date: '2026-06-02' },
      { member_id: memberId, date: '2026-06-03' },
    ];
    // Slot covers all three days entirely.
    const c = findDeploymentConflicts(memberId, '2026-06-01T00:00:00', '2026-06-04T00:00:00', picks);
    expect(c).toHaveLength(3);
  });

  it('empty pick array → 0 conflicts', () => {
    const c = findDeploymentConflicts(memberId, '2026-06-01T06:00:00', '2026-06-01T18:00:00', []);
    expect(c).toHaveLength(0);
  });

  it('member with no picks → 0 conflicts', () => {
    const otherPicks = [
      { member_id: 'other', date: '2026-06-01' },
    ];
    const c = findDeploymentConflicts(memberId, '2026-06-01T06:00:00', '2026-06-01T18:00:00', otherPicks);
    expect(c).toHaveLength(0);
  });

  it('wrong memberId on the pick → filtered out', () => {
    const wrongPick = { member_id: 'not-u1', date: '2026-06-01' };
    const c = findDeploymentConflicts(memberId, '2026-06-01T06:00:00', '2026-06-01T18:00:00', [wrongPick]);
    expect(c).toHaveLength(0);
  });

  it('open-ended slot (end_at = null) treated as startAt + 1h', () => {
    // Slot at 2026-06-01T06:00 with no end → treated as ending at 07:00.
    // Pick for 2026-06-01 covers midnight→midnight+1d → overlaps.
    const c = findDeploymentConflicts(memberId, '2026-06-01T06:00:00', null, [pick]);
    expect(c).toHaveLength(1);
  });

  it('open-ended slot that falls after pick window → 0 conflicts', () => {
    // Pick is 2026-06-01 (local midnight to next midnight).
    // Slot starts at 2026-06-02T06:00 with no end → treated as 06:00–07:00 on Jun 2.
    const c = findDeploymentConflicts(memberId, '2026-06-02T06:00:00', null, [pick]);
    expect(c).toHaveLength(0);
  });

  it('returns correct date strings', () => {
    const picks2 = [
      { member_id: memberId, date: '2026-07-10' },
      { member_id: memberId, date: '2026-07-11' },
    ];
    const c = findDeploymentConflicts(memberId, '2026-07-10T12:00:00', '2026-07-11T06:00:00', picks2);
    expect(c.map((x) => x.date).sort()).toEqual(['2026-07-10', '2026-07-11']);
  });
});

describe('picksCoverage', () => {
  const make = (state: DeploymentPick['state']): DeploymentPick => ({
    id: state, window_id: 'w', date: '2026-05-10', state,
    reservist_note: null, commander_note: null,
    proposed_at: '2026-05-09T00:00:00Z',
    resolved_at: null, resolved_by: null,
  });

  it('counts all states', () => {
    const c = picksCoverage([
      make('proposed'), make('proposed'),
      make('approved'),
      make('rejected'),
      make('withdrawn'),
    ]);
    expect(c).toEqual({ proposed: 2, approved: 1, rejected: 1, withdrawn: 1, total: 5 });
  });

  it('returns zero counts for empty input', () => {
    expect(picksCoverage([])).toEqual({ proposed: 0, approved: 0, rejected: 0, withdrawn: 0, total: 0 });
  });
});
