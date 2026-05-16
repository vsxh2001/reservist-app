import { describe, expect, it } from 'vitest';
import {
  SKILL_LEVELS,
  SKILL_LEVEL_LABEL,
  SKILL_LEVEL_ORDER,
  STATUS_LABEL,
  STATUS_ORDER,
  findMemberConflicts,
  meetsSkillReq,
  memberMatchesAllSkillReqs,
  type MemberSkill,
  type SlotSkill,
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
