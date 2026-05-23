import { MS_PER_HOUR } from './constants';

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
  allSlots: { id: string; start_at: string; end_at: string | null; state: SlotState; assignee_id: string | null; title: string }[],
  excludeSlotId?: string,
): { id: string; title: string; start_at: string; end_at: string | null }[] {
  const aStart = Date.parse(startAt);
  const aEnd = endAt ? Date.parse(endAt) : aStart + MS_PER_HOUR; // assume 1h if open-ended
  return allSlots.filter((s) => {
    if (s.id === excludeSlotId) return false;
    if (s.state !== 'published') return false;
    if (s.assignee_id !== memberId) return false;
    const bStart = Date.parse(s.start_at);
    const bEnd = s.end_at ? Date.parse(s.end_at) : bStart + MS_PER_HOUR;
    return aStart < bEnd && bStart < aEnd;
  }).map(({ id, title, start_at, end_at }) => ({ id, title, start_at, end_at }));
}

export interface MemberSkill { name: string; level: SkillLevel }

export type TeamRole = 'soldier' | 'commander';

export interface TeamMembership { team_id: string; role: TeamRole }

export interface Member {
  id: string;
  division_id: string;
  name: string;
  initials: string;
  tone: number;
  phone: string;
  joined: string | null;
  last_seen: string | null;
  calls_this_year: number;
  status: Status;
  status_note: string | null;
  status_until: string | null;
  status_set_at: string;
  is_division_admin: boolean;
  /** PRD §7.2 — when true, the member's phone is shown to peers in the same division. */
  phone_visible_to_peers: boolean;
  skills: MemberSkill[];
  teams: TeamMembership[];
}

export interface Division { id: string; name: string; created_at: string }

export interface Project { id: string; division_id: string; name: string; sort_idx: number }

export interface Team {
  id: string;
  project_id: string;
  division_id: string;
  name: string;
  crest: string;
  invite_code: string | null;
  /** ISO timestamp. `null` = no expiry (legacy / backfill safety). */
  invite_expires_at: string | null;
  established: string | null;
  member_count: number;
  commander_count: number;
  project_name: string;
  /** PRD §7.6 — when false, reservists only see slots they are assigned to (plus urgent slots). */
  show_unit_schedule: boolean;
}

/** True iff the team's invite is past its expiry. `null` expiry = never expires. */
export function isInviteExpired(team: Pick<Team, 'invite_expires_at'>, now: number = Date.now()): boolean {
  if (!team.invite_expires_at) return false;
  return Date.parse(team.invite_expires_at) <= now;
}

export interface SkillFilter { name: string; min_level: SkillLevel }

export interface Filters {
  status: Status[];
  /** Skill requirements; each filter row requires skill at min_level or higher. */
  skills: SkillFilter[];
  q: string;
}

export type SlotState = 'draft' | 'published' | 'completed' | 'cancelled';

/**
 * A slot represents one duty period for one person. Capacity is always 1 —
 * multiple people on the same duty = multiple slots. The commander picks an
 * assignee using their own judgment (member skills are advisory, not enforced).
 */
export interface Slot {
  id: string;
  team_id: string;
  title: string;
  urgent: boolean;
  state: SlotState;
  start_at: string;
  end_at: string | null;
  duration: string | null;
  location: string | null;
  notes: string | null;
  /** Null = unassigned. */
  assignee_id: string | null;
}

export interface ActivityItem {
  id: string;
  team_id: string;
  actor_id: string | null;
  actor_name: string;
  verb: string;
  what: string | null;
  tone: 'urgent' | 'accent' | null;
  created_at: string;
}

export type Screen = 'roster' | 'slots' | 'activity' | 'calendar' | 'day' | 'reviews' | 'settings' | 'requests' | 'admin';

export type JoinState = 'pending' | 'approved' | 'rejected';

export interface JoinRequest {
  id: string;
  team_id: string;
  name: string;
  phone: string;
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
  team_id: string;
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

/**
 * Deployment-pick conflict detection.
 *
 * Each approved pick is treated as a 24-hour block from local-midnight of `pick.date`
 * to local-midnight of the following day.  The check is half-open: [pickStart, pickEnd).
 *
 * The slot window is also half-open: [startAt, endAt OR startAt+1h).
 *
 * Returns the subset of `picks` whose block overlaps the slot window for `memberId`.
 */
export function findDeploymentConflicts(
  memberId: string,
  startAt: string,
  endAt: string | null,
  picks: { member_id: string; date: string }[],
): { date: string }[] {
  const aStart = Date.parse(startAt);
  const aEnd = endAt ? Date.parse(endAt) : aStart + MS_PER_HOUR; // treat null as +1 h

  return picks
    .filter((p) => {
      if (p.member_id !== memberId) return false;
      // Build a local-midnight block for pick.date.
      // Date.parse('YYYY-MM-DD') returns UTC midnight on most engines; to get LOCAL
      // midnight we construct via the Date constructor parts.
      const [yyyy, mm, dd] = p.date.split('-').map(Number);
      const pickStart = new Date(yyyy, mm - 1, dd).getTime();       // local midnight
      const pickEnd   = new Date(yyyy, mm - 1, dd + 1).getTime();   // next local midnight
      // Half-open overlap: [aStart, aEnd) ∩ [pickStart, pickEnd) is non-empty iff:
      return aStart < pickEnd && pickStart < aEnd;
    })
    .map(({ date }) => ({ date }));
}
