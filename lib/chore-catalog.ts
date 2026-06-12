import { choreOccursOnDate, getChorePauseStatus, getNextChoreOccurrence } from '@/lib/chore-schedule';
import { parseRecurrenceUiStateFromRrule, recurrenceSummary } from '@/lib/recurrence';

export type ChoreCatalogFilter = 'active' | 'paused' | 'starts_later' | 'ended' | 'one_time' | 'all';
export type ChoreCatalogSort =
    | 'smart'
    | 'alpha_asc'
    | 'alpha_desc'
    | 'next_active_asc'
    | 'next_active_desc'
    | 'start_asc'
    | 'start_desc'
    | 'created_asc'
    | 'created_desc';

export type ChoreCatalogStatus = 'active' | 'paused' | 'starts_later' | 'ended';
export type OneTimeTiming = 'past' | 'today' | 'future' | null;

export interface ChoreCatalogLike {
    id: string;
    title?: string | null;
    startDate: string;
    createdAt?: string | null;
    rrule?: string | null;
    exdates?: unknown;
    pauseState?: any;
    isUpForGrabs?: boolean | null;
    isJoint?: boolean | null;
    rotationType?: string | null;
    assignees?: Array<{ id: string; name?: string | null }> | null;
    taskSeries?: Array<{ id: string }> | null;
}

export interface ChoreCatalogState {
    status: ChoreCatalogStatus;
    isOneTime: boolean;
    oneTimeTiming: OneTimeTiming;
    occursToday: boolean;
    nextActiveDate: Date | null;
    createdAtDate: Date | null;
    startDateToken: string;
    statusBadge: string;
    statusTone: ChoreCatalogStatus;
    auxiliaryBadge: string | null;
    auxiliaryTone: 'slate' | 'sky' | 'amber' | 'emerald';
}

export function getDateOnlyToken(value?: string | Date | null): string {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);

    const rawValue = String(value || '').trim();
    const hyphenMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
    if (hyphenMatch) return hyphenMatch[1];

    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

export function formatCatalogDateLabel(value?: string | Date | null): string {
    const token = getDateOnlyToken(value);
    if (!token) return 'Unknown';
    const parsed = new Date(`${token}T00:00:00`);
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getChoreRecurrenceSummary(chore: Pick<ChoreCatalogLike, 'rrule' | 'startDate'>): string {
    if (!String(chore.rrule || '').trim()) {
        return 'One-time';
    }

    try {
        return recurrenceSummary(parseRecurrenceUiStateFromRrule(String(chore.rrule || ''), getDateOnlyToken(chore.startDate)), getDateOnlyToken(chore.startDate));
    } catch {
        return 'Custom repeat rule';
    }
}

export function toComparableDate(value?: string | Date | null): Date | null {
    const token = getDateOnlyToken(value);
    if (!token) return null;
    const parsed = new Date(`${token}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getChoreCatalogState(chore: ChoreCatalogLike, referenceDate: Date): ChoreCatalogState {
    const referenceToken = getDateOnlyToken(referenceDate);
    const startDateToken = getDateOnlyToken(chore.startDate);
    const isOneTime = !String(chore.rrule || '').trim();
    const pauseStatus = getChorePauseStatus(chore, referenceDate);
    const nextActiveDate = getNextChoreOccurrence(chore, referenceDate, true);
    const createdAtDate = toComparableDate(chore.createdAt);

    let status: ChoreCatalogStatus = 'ended';
    let oneTimeTiming: OneTimeTiming = null;
    let statusBadge = 'Ended';
    let statusTone: ChoreCatalogStatus = 'ended';
    let auxiliaryBadge: string | null = null;
    let auxiliaryTone: 'slate' | 'sky' | 'amber' | 'emerald' = 'slate';

    if (isOneTime) {
        if (startDateToken === referenceToken) {
            status = 'active';
            oneTimeTiming = 'today';
            statusBadge = 'Active';
            statusTone = 'active';
        } else if (startDateToken > referenceToken) {
            status = 'starts_later';
            oneTimeTiming = 'future';
            statusBadge = 'Starts later';
            statusTone = 'starts_later';
        } else {
            status = 'ended';
            oneTimeTiming = 'past';
            statusBadge = 'Ended';
            statusTone = 'ended';
        }

        auxiliaryBadge = `One-time${oneTimeTiming ? ` • ${oneTimeTiming.charAt(0).toUpperCase()}${oneTimeTiming.slice(1)}` : ''}`;
        auxiliaryTone = 'sky';
    } else if (pauseStatus.kind === 'paused') {
        status = 'paused';
        statusBadge = pauseStatus.pauseState?.mode === 'bounded' && pauseStatus.pauseState.resumeOnDate ? `Paused until ${formatCatalogDateLabel(pauseStatus.pauseState.resumeOnDate)}` : 'Paused';
        statusTone = 'paused';
    } else if (pauseStatus.kind === 'ended') {
        status = 'ended';
        statusBadge = 'Ended';
        statusTone = 'ended';
    } else if (startDateToken > referenceToken) {
        status = 'starts_later';
        statusBadge = `Starts ${formatCatalogDateLabel(startDateToken)}`;
        statusTone = 'starts_later';
    } else if (nextActiveDate) {
        status = 'active';
        statusBadge = 'Active';
        statusTone = 'active';
        if (pauseStatus.kind === 'scheduled') {
            auxiliaryBadge = 'Pause scheduled';
            auxiliaryTone = 'amber';
        }
    } else {
        status = 'ended';
        statusBadge = 'Ended';
        statusTone = 'ended';
    }

    return {
        status,
        isOneTime,
        oneTimeTiming,
        occursToday: choreOccursOnDate(chore, referenceDate),
        nextActiveDate,
        createdAtDate,
        startDateToken,
        statusBadge,
        statusTone,
        auxiliaryBadge,
        auxiliaryTone,
    };
}

export function choreMatchesCatalogFilter(state: ChoreCatalogState, filter: ChoreCatalogFilter): boolean {
    if (filter === 'all') return true;
    if (filter === 'one_time') return state.isOneTime;
    return state.status === filter;
}
