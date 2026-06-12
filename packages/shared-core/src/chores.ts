import { RRule, RRuleSet } from 'rrule';
import { toUTCDate } from './date';

export interface SharedChoreAssignee {
  id: string;
  name?: string;
}

export interface SharedChoreAssignment {
  order: number;
  familyMember:
    | SharedChoreAssignee
    | SharedChoreAssignee[]
    | null
    | undefined;
}

export interface SharedChoreCompletion {
  id: string;
  completed?: boolean;
  dateDue?: string | null;
  dateCompleted?: string | null;
  completedBy?: { id?: string | null } | { id?: string | null }[] | null;
}

export interface SharedChoreLike {
  id: string;
  title?: string | null;
  description?: string | null;
  startDate: string | Date;
  rrule?: string | null;
  exdates?: string[] | null;
  sortOrder?: number | null;
  timeBucket?: string | null;
  timingMode?: string | null;
  timingConfig?: unknown;
  weight?: number | null;
  rewardType?: 'fixed' | 'weight' | string | null;
  rotationType?: 'none' | 'daily' | 'weekly' | 'monthly' | string | null;
  isJoint?: boolean | null;
  isUpForGrabs?: boolean | null;
  assignees?: SharedChoreAssignee[] | null;
  assignments?: SharedChoreAssignment[] | null;
  completions?: SharedChoreCompletion[] | null;
}

export interface SharedXpStats {
  current: number;
  possible: number;
}

export interface SharedFamilyMemberLike {
  id: string;
  name?: string | null;
}

function isSameUtcDay(date1: Date, date2: Date): boolean {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}

function normalizeDateOnlyList(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  ).sort();
}

function parseExdateTokenToDateOnly(value: string): string | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

function normalizeChoreExdates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return normalizeDateOnlyList(
    value
      .map((entry) => parseExdateTokenToDateOnly(String(entry || '')))
      .filter(Boolean) as string[]
  );
}

function createOccurrenceSet(chore: Pick<SharedChoreLike, 'rrule' | 'startDate' | 'exdates'>): RRuleSet | null {
  const normalizedRrule = String(chore.rrule || '').replace(/^RRULE:/i, '').trim();
  if (!normalizedRrule) return null;

  try {
    const dtstart = toUTCDate(chore.startDate);
    const ruleOptions = RRule.parseString(normalizedRrule);
    const set = new RRuleSet();
    set.rrule(
      new RRule({
        ...ruleOptions,
        dtstart,
      }) as any
    );

    for (const exdate of normalizeChoreExdates(chore.exdates)) {
      set.exdate(new Date(`${exdate}T00:00:00Z`));
    }

    return set;
  } catch {
    return null;
  }
}

function getChoreOccurrencesInRange(chore: SharedChoreLike, start: Date, end: Date): Date[] {
  const utcStart = toUTCDate(start);
  const utcEnd = toUTCDate(end);
  if (utcEnd.getTime() < utcStart.getTime()) return [];

  const occurrenceSet = createOccurrenceSet(chore);
  if (!occurrenceSet) {
    if (String(chore.rrule || '').trim()) return [];
    const choreDate = toUTCDate(chore.startDate);
    const time = choreDate.getTime();
    return time >= utcStart.getTime() && time <= utcEnd.getTime() ? [choreDate] : [];
  }

  return occurrenceSet.between(utcStart, utcEnd, true).map((entry) => toUTCDate(entry));
}

function getRotationIndex(
  chore: SharedChoreLike,
  occurrenceDate: Date,
  rotationType: string | null | undefined
): number {
  if (!rotationType || rotationType === 'none') return 0;

  const utcStartDate = toUTCDate(chore.startDate);
  const utcOccurrenceDate = toUTCDate(occurrenceDate);
  const actualOccurrences = getChoreOccurrencesInRange(chore, utcStartDate, utcOccurrenceDate);

  if (actualOccurrences.length === 0) {
    return 0;
  }

  switch (rotationType) {
    case 'daily': {
      return Math.max(0, actualOccurrences.length - 1);
    }
    case 'weekly': {
      const weekBuckets = new Set(
        actualOccurrences.map((entry) => {
          const diffDays = Math.floor((entry.getTime() - utcStartDate.getTime()) / 86400000);
          return Math.floor(diffDays / 7);
        })
      );
      return Math.max(0, weekBuckets.size - 1);
    }
    case 'monthly': {
      const monthBuckets = new Set(
        actualOccurrences.map(
          (entry) =>
            (entry.getUTCFullYear() - utcStartDate.getUTCFullYear()) * 12 +
            (entry.getUTCMonth() - utcStartDate.getUTCMonth())
        )
      );
      return Math.max(0, monthBuckets.size - 1);
    }
    default: {
      return 0;
    }
  }
}

function normalizeFamilyMember(
  value: SharedChoreAssignee | SharedChoreAssignee[] | null | undefined
): SharedChoreAssignee | null {
  if (!value) return null;
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate?.id) return null;
  return { id: candidate.id, name: candidate.name };
}

export function getAssignedMembersForChoreOnDate(chore: SharedChoreLike, date: Date): SharedChoreAssignee[] {
  const utcDate = toUTCDate(date);
  const choreStartDate = toUTCDate(chore.startDate);

  if (!String(chore.rrule || '').trim()) {
    return isSameUtcDay(choreStartDate, utcDate) ? [...(chore.assignees || [])] : [];
  }

  const occurrencesOnDate = getChoreOccurrencesInRange(chore, utcDate, utcDate);
  if (occurrencesOnDate.length === 0) return [];

  const usesRotation =
    chore.rotationType &&
    chore.rotationType !== 'none' &&
    !chore.isUpForGrabs &&
    Array.isArray(chore.assignments) &&
    chore.assignments.length > 0;

  if (!usesRotation) {
    return (chore.assignees || []).map((a) => ({ id: a.id, name: a.name }));
  }

  const sortedAssignments = [...(chore.assignments || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  if (sortedAssignments.length === 0) return [];

  const rotationIndex = getRotationIndex(chore, utcDate, chore.rotationType);
  const assignmentIndex = rotationIndex % sortedAssignments.length;
  const assigned = normalizeFamilyMember(sortedAssignments[assignmentIndex]?.familyMember);
  return assigned ? [assigned] : [];
}

export function formatDateKeyUTC(date: Date): string {
  const utc = toUTCDate(date);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utc.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCompletedChoreCompletionsForDate(chore: SharedChoreLike, date: Date): SharedChoreCompletion[] {
  const dateKey = formatDateKeyUTC(date);
  return (chore.completions || []).filter((completion) => completion?.completed && completion?.dateDue === dateKey);
}

export function getMemberCompletionForDate(
  chore: SharedChoreLike,
  familyMemberId: string,
  date: Date
): SharedChoreCompletion | null {
  const dateKey = formatDateKeyUTC(date);
  return (
    (chore.completions || []).find((completion) => {
      if (completion?.dateDue !== dateKey) return false;
      const completedBy = Array.isArray(completion?.completedBy) ? completion.completedBy[0] : completion?.completedBy;
      return completedBy?.id === familyMemberId;
    }) || null
  );
}

export function isChoreDueOnDate(chore: SharedChoreLike, date: Date): boolean {
  return getAssignedMembersForChoreOnDate(chore, date).length > 0;
}

function getCompletionMemberId(completion: SharedChoreCompletion | null | undefined): string | null {
  if (!completion) return null;
  const completedBy = Array.isArray(completion.completedBy) ? completion.completedBy[0] : completion.completedBy;
  return completedBy?.id || null;
}

/**
 * Calculates per-member XP for a single date using the same chore assignment/completion semantics
 * as the web app (weight-based chores only; fixed rewards do not contribute to XP).
 */
export function calculateDailyXP(
  chores: SharedChoreLike[],
  familyMembers: SharedFamilyMemberLike[],
  date: Date
): Record<string, SharedXpStats> {
  const xpMap: Record<string, SharedXpStats> = {};
  for (const member of familyMembers) {
    if (!member?.id) continue;
    xpMap[member.id] = { current: 0, possible: 0 };
  }

  for (const chore of chores || []) {
    if (!chore?.id) continue;
    if (chore.rewardType === 'fixed') continue;

    const weight = Number(chore.weight || 0);
    if (!Number.isFinite(weight) || weight === 0) continue;

    const assignedMembers = getAssignedMembersForChoreOnDate(chore, date);
    if (assignedMembers.length === 0) continue;

    const completionsForDate = getCompletedChoreCompletionsForDate(chore, date);

    if (chore.isUpForGrabs) {
      if (completionsForDate.length > 0) {
        for (const completion of completionsForDate) {
          const completerId = getCompletionMemberId(completion);
          if (!completerId || !xpMap[completerId]) continue;
          if (weight > 0) xpMap[completerId].possible += weight;
          xpMap[completerId].current += weight;
        }
      } else {
        for (const assignee of assignedMembers) {
          if (!xpMap[assignee.id]) continue;
          if (weight > 0) xpMap[assignee.id].possible += weight;
        }
      }
      continue;
    }

    for (const assignee of assignedMembers) {
      if (!xpMap[assignee.id]) continue;
      if (weight > 0) xpMap[assignee.id].possible += weight;
      const hasCompleted = completionsForDate.some((completion) => getCompletionMemberId(completion) === assignee.id);
      if (hasCompleted) {
        xpMap[assignee.id].current += weight;
      }
    }
  }

  return xpMap;
}
