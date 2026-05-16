export type Status = 'available' | 'standby' | 'released' | 'unavailable';

export const STATUS_LABEL: Record<Status, string> = {
  available: 'Available',
  standby: 'Standby',
  released: 'Released',
  unavailable: 'Unavailable',
};

export const STATUS_ORDER: Status[] = ['available', 'standby', 'released', 'unavailable'];

export type SkillLevel = 'junior' | 'intermediate' | 'senior';

export const SKILL_LEVEL_ORDER: Record<SkillLevel, number> = {
  junior: 0, intermediate: 1, senior: 2,
};

export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  junior: 'Junior',
  intermediate: 'Intermediate',
  senior: 'Senior',
};

export const SKILL_LEVELS: SkillLevel[] = ['junior', 'intermediate', 'senior'];

export function meetsSkillReq(memberSkills: { name: string; level: SkillLevel }[], req: { name: string; min_level: SkillLevel }): boolean {
  const ms = memberSkills.find((m) => m.name === req.name);
  if (!ms) return false;
  return SKILL_LEVEL_ORDER[ms.level] >= SKILL_LEVEL_ORDER[req.min_level];
}

export function memberMatchesAllSkillReqs(memberSkills: { name: string; level: SkillLevel }[], reqs: { name: string; min_level: SkillLevel }[]): boolean {
  return reqs.every((r) => meetsSkillReq(memberSkills, r));
}

/** Slot conflict detection: returns slots where memberId is already assigned and the window overlaps [startAt, endAt). */
export function findMemberConflicts(
  memberId: string,
  startAt: string,
  endAt: string | null,
  allSlots: { id: string; start_at: string; end_at: string | null; state: SlotState; assignee_ids: string[]; title: string }[],
  excludeSlotId?: string,
): { id: string; title: string; start_at: string; end_at: string | null }[] {
  const aStart = Date.parse(startAt);
  const aEnd = endAt ? Date.parse(endAt) : aStart + 3600_000; // assume 1h if open-ended
  return allSlots.filter((s) => {
    if (s.id === excludeSlotId) return false;
    if (s.state !== 'published') return false;
    if (!s.assignee_ids.includes(memberId)) return false;
    const bStart = Date.parse(s.start_at);
    const bEnd = s.end_at ? Date.parse(s.end_at) : bStart + 3600_000;
    return aStart < bEnd && bStart < aEnd;
  }).map(({ id, title, start_at, end_at }) => ({ id, title, start_at, end_at }));
}

export interface MemberSkill { name: string; level: SkillLevel }

export interface Member {
  id: string;
  unit_id: string;
  name: string;
  initials: string;
  tone: number;
  phone: string;
  is_commander: boolean;
  /** Military role field — deprecated, kept in schema only. UI ignores. */
  role: string | null;
  joined: string | null;
  last_seen: string | null;
  calls_this_year: number;
  status: Status;
  status_note: string | null;
  status_until: string | null;
  status_set_at: string;
  skills: MemberSkill[];
}

export interface Unit {
  id: string;
  name: string;
  short_name: string;
  crest: string;
  invite_code: string;
}

export interface SkillFilter { name: string; min_level: SkillLevel }

export interface Filters {
  status: Status[];
  /** Skill requirements; each filter row requires skill at min_level or higher. */
  skills: SkillFilter[];
  q: string;
}

export type SlotState = 'draft' | 'published' | 'completed' | 'cancelled';

export interface SlotSkill { name: string; min_level: SkillLevel }

export interface Slot {
  id: string;
  unit_id: string;
  title: string;
  urgent: boolean;
  state: SlotState;
  start_at: string;
  end_at: string | null;
  duration: string | null;
  location: string | null;
  needed: number;
  notes: string | null;
  /** Deprecated — kept in schema, no UI. */
  role: string | null;
  skills: SlotSkill[];
  assignee_ids: string[];
  filled: number;
}

export interface ActivityItem {
  id: string;
  unit_id: string;
  actor_id: string | null;
  actor_name: string;
  verb: string;
  what: string | null;
  tone: 'urgent' | 'accent' | null;
  created_at: string;
}

export type Screen = 'roster' | 'slots' | 'activity' | 'calendar' | 'day' | 'reviews' | 'settings' | 'requests';

export type JoinState = 'pending' | 'approved' | 'rejected';

export interface JoinRequest {
  id: string;
  unit_id: string;
  name: string;
  phone: string;
  /** Deprecated — kept on schema. UI ignores. */
  role_name: string | null;
  skill_names: string[];
  note: string | null;
  state: JoinState;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export type WindowState = 'open' | 'closed';
export type PickState   = 'proposed' | 'approved' | 'rejected' | 'withdrawn';

export interface DeploymentWindow {
  id: string;
  member_id: string;
  unit_id: string;
  label: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  state: WindowState;
  created_by: string | null;
  created_at: string;
  proposed_count: number;
  approved_count: number;
  rejected_count: number;
  withdrawn_count: number;
}

export interface DeploymentPick {
  id: string;
  window_id: string;
  date: string;
  state: PickState;
  reservist_note: string | null;
  commander_note: string | null;
  proposed_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface PicksCoverage {
  proposed: number;
  approved: number;
  rejected: number;
  withdrawn: number;
  total: number;
}

export function picksCoverage(picks: DeploymentPick[]): PicksCoverage {
  const c: PicksCoverage = { proposed: 0, approved: 0, rejected: 0, withdrawn: 0, total: picks.length };
  for (const p of picks) c[p.state] += 1;
  return c;
}
