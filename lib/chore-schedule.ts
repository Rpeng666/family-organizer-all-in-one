import { addDays, format, parseISO } from 'date-fns';
import { RRule, RRuleSet } from 'rrule';
import { capRruleBeforeOccurrence, normalizeDateOnlyList, normalizeRrule, parseExdateTokenToDateOnly } from '@/lib/recurrence';

export type ChorePauseIntent = 'paused' | 'ended';

export type ChoreScheduleEndCondition =
    | { type: 'none' }
    | { type: 'until'; value: string }
    | { type: 'count'; count: number };

export interface ChorePauseState {
    mode: 'bounded' | 'open-ended';
    intent: ChorePauseIntent;
    pauseStartDate: string;
    resumeOnDate: string | null;
    generatedExdates: string[];
    originalEndCondition: ChoreScheduleEndCondition;
    createdAt: string;
}

export interface ChoreScheduleLike {
    startDate: string;
    rrule?: string | null;
    exdates?: unknown;
    pauseState?: ChorePauseState | null;
}

export interface ChoreSchedulePatch {
    rrule: string | null;
    exdates: string[];
    pauseState: ChorePauseState | null;
}

export interface ChorePauseStatus {
    kind: 'none' | 'scheduled' | 'paused' | 'ended' | 'completed';
    pauseState: ChorePauseState | null;
}

interface ResolvedBaseSchedule {
    rrule: string;
    exdates: string[];
    pauseState: ChorePauseState | null;
    shouldClearCompletedPauseState: boolean;
}

function toUtcDateOnly(value: Date | string): Date {
    const parsed = new Date(value);
    return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatDateOnly(value: Date | string): string {
    return format(toUtcDateOnly(value), 'yyyy-MM-dd');
}

function createOccurrenceSet(schedule: Pick<ChoreScheduleLike, 'rrule' | 'startDate' | 'exdates'>): RRuleSet | null {
    const normalizedRrule = normalizeRrule(String(schedule.rrule || ''));
    if (!normalizedRrule) return null;

    try {
        const dtstart = toUtcDateOnly(schedule.startDate);
        const ruleOptions = RRule.parseString(normalizedRrule.replace(/^RRULE:/i, ''));
        const set = new RRuleSet();
        // `rrule` ships multiple type entry points; the runtime object is compatible even though TS sees distinct classes here.
        set.rrule(
            new RRule({
                ...ruleOptions,
                dtstart,
            }) as any
        );

        for (const exdate of normalizeChoreExdates(schedule.exdates)) {
            set.exdate(parseISO(`${exdate}T00:00:00Z`));
        }

        return set;
    } catch {
        return null;
    }
}

function subtractDateOnlyValues(source: string[], valuesToRemove: string[]): string[] {
    if (valuesToRemove.length === 0) return source;
    const blocked = new Set(normalizeDateOnlyList(valuesToRemove));
    return normalizeDateOnlyList(source.filter((entry) => !blocked.has(entry)));
}

function mergeDateOnlyValues(...groups: string[][]): string[] {
    return normalizeDateOnlyList(groups.flat());
}

function removeRruleEndCondition(rruleValue: string): string {
    const normalized = normalizeRrule(rruleValue);
    if (!normalized) return '';
    const parts = normalized
        .replace(/^RRULE:/i, '')
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .filter((entry) => {
            const upper = entry.toUpperCase();
            return !upper.startsWith('COUNT=') && !upper.startsWith('UNTIL=');
        });
    return parts.length > 0 ? `RRULE:${parts.join(';')}` : '';
}

function applyRruleEndCondition(rruleValue: string, endCondition: ChoreScheduleEndCondition): string {
    const normalized = removeRruleEndCondition(rruleValue);
    if (!normalized) return '';
    if (endCondition.type === 'none') return normalized;

    const parts = normalized.replace(/^RRULE:/i, '').split(';').filter(Boolean);
    if (endCondition.type === 'until') {
        return `RRULE:${[...parts, `UNTIL=${endCondition.value}`].join(';')}`;
    }
    return `RRULE:${[...parts, `COUNT=${Math.max(1, Math.trunc(endCondition.count))}`].join(';')}`;
}

export function normalizeChoreExdates(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return normalizeDateOnlyList(
        value
            .map((entry) => parseExdateTokenToDateOnly(String(entry || '')))
            .filter(Boolean) as string[]
    );
}

export function getChoreScheduleEndCondition(rruleValue: string | null | undefined): ChoreScheduleEndCondition {
    const normalized = normalizeRrule(String(rruleValue || ''));
    if (!normalized) return { type: 'none' };

    const rawParts = normalized.replace(/^RRULE:/i, '').split(';').filter(Boolean);
    for (const part of rawParts) {
        const upper = part.toUpperCase();
        if (upper.startsWith('COUNT=')) {
            const count = Number(part.slice(part.indexOf('=') + 1));
            if (Number.isFinite(count) && count > 0) {
                return { type: 'count', count: Math.trunc(count) };
            }
        }
        if (upper.startsWith('UNTIL=')) {
            const value = part.slice(part.indexOf('=') + 1).trim();
            if (value) {
                return { type: 'until', value };
            }
        }
    }

    return { type: 'none' };
}

export function getChorePauseStatus(chore: ChoreScheduleLike, referenceDate = new Date()): ChorePauseStatus {
    const pauseState = chore.pauseState || null;
    if (!pauseState) return { kind: 'none', pauseState: null };

    const referenceKey = formatDateOnly(referenceDate);
    const pauseStart = pauseState.pauseStartDate || '';
    const resumeOn = pauseState.resumeOnDate || '';

    if (pauseState.mode === 'bounded') {
        if (!resumeOn) {
            return {
                kind: referenceKey < pauseStart ? 'scheduled' : 'paused',
                pauseState,
            };
        }
        if (referenceKey < pauseStart) {
            return { kind: 'scheduled', pauseState };
        }
        if (referenceKey < resumeOn) {
            return { kind: 'paused', pauseState };
        }
        return { kind: 'completed', pauseState };
    }

    if (referenceKey < pauseStart) {
        return { kind: 'scheduled', pauseState };
    }
    return {
        kind: pauseState.intent === 'ended' ? 'ended' : 'paused',
        pauseState,
    };
}

function hasActiveOrUpcomingPause(chore: ChoreScheduleLike, referenceDate = new Date()): boolean {
    const status = getChorePauseStatus(chore, referenceDate);
    return status.kind === 'scheduled' || status.kind === 'paused' || status.kind === 'ended';
}

function getResolvedBaseSchedule(chore: ChoreScheduleLike, referenceDate = new Date()): ResolvedBaseSchedule {
    const normalizedRrule = normalizeRrule(String(chore.rrule || ''));
    const normalizedExdates = normalizeChoreExdates(chore.exdates);
    const pauseState = chore.pauseState || null;
    if (!pauseState) {
        return {
            rrule: normalizedRrule,
            exdates: normalizedExdates,
            pauseState: null,
            shouldClearCompletedPauseState: false,
        };
    }

    const status = getChorePauseStatus(chore, referenceDate);
    if (status.kind === 'completed') {
        return {
            rrule: normalizedRrule,
            exdates: normalizedExdates,
            pauseState,
            shouldClearCompletedPauseState: true,
        };
    }

    if (status.kind !== 'scheduled' && status.kind !== 'paused' && status.kind !== 'ended') {
        return {
            rrule: normalizedRrule,
            exdates: normalizedExdates,
            pauseState,
            shouldClearCompletedPauseState: false,
        };
    }

    return {
        rrule: applyRruleEndCondition(normalizedRrule, pauseState.originalEndCondition),
        exdates: subtractDateOnlyValues(normalizedExdates, pauseState.generatedExdates || []),
        pauseState,
        shouldClearCompletedPauseState: false,
    };
}

export function getEditableBaseChoreSchedule(chore: ChoreScheduleLike, referenceDate = new Date()): ChoreSchedulePatch {
    const base = getResolvedBaseSchedule(chore, referenceDate);
    return {
        rrule: base.rrule || null,
        exdates: base.exdates,
        pauseState: base.shouldClearCompletedPauseState ? null : base.pauseState,
    };
}

export function getChoreOccurrencesInRange(chore: ChoreScheduleLike, start: Date, end: Date): Date[] {
    const utcStart = toUtcDateOnly(start);
    const utcEnd = toUtcDateOnly(end);
    const startTime = utcStart.getTime();
    const endTime = utcEnd.getTime();
    if (endTime < startTime) return [];

    const occurrenceSet = createOccurrenceSet(chore);
    if (!occurrenceSet) {
        if (normalizeRrule(String(chore.rrule || ''))) {
            return [];
        }
        const choreDate = toUtcDateOnly(chore.startDate);
        const time = choreDate.getTime();
        return time >= startTime && time <= endTime ? [choreDate] : [];
    }

    return occurrenceSet.between(utcStart, utcEnd, true).map((entry) => toUtcDateOnly(entry));
}

export function getChoreOccurrenceDateKeysInRange(chore: ChoreScheduleLike, startDate: string, endDate: string): string[] {
    if (!startDate || !endDate || endDate < startDate) return [];
    const occurrences = getChoreOccurrencesInRange(
        chore,
        parseISO(`${startDate}T00:00:00Z`),
        parseISO(`${endDate}T00:00:00Z`)
    );
    return normalizeDateOnlyList(occurrences.map((entry) => formatDateOnly(entry)));
}

export function choreOccursOnDate(chore: ChoreScheduleLike, date: Date): boolean {
    const dateKey = formatDateOnly(date);
    return getChoreOccurrenceDateKeysInRange(chore, dateKey, dateKey).length > 0;
}

export function getNextChoreOccurrence(chore: ChoreScheduleLike, afterDate: Date, inclusive = false): Date | null {
    const occurrenceSet = createOccurrenceSet(chore);
    if (!occurrenceSet) {
        if (normalizeRrule(String(chore.rrule || ''))) return null;
        const choreDate = toUtcDateOnly(chore.startDate);
        const comparison = toUtcDateOnly(afterDate);
        if (inclusive ? choreDate.getTime() >= comparison.getTime() : choreDate.getTime() > comparison.getTime()) {
            return choreDate;
        }
        return null;
    }

    const comparison = toUtcDateOnly(afterDate);
    return occurrenceSet.after(comparison, inclusive) ?? null;
}

function buildPauseState(params: {
    mode: 'bounded' | 'open-ended';
    intent: ChorePauseIntent;
    pauseStartDate: string;
    resumeOnDate: string | null;
    generatedExdates: string[];
    originalEndCondition: ChoreScheduleEndCondition;
    now?: Date;
}): ChorePauseState {
    return {
        mode: params.mode,
        intent: params.intent,
        pauseStartDate: params.pauseStartDate,
        resumeOnDate: params.resumeOnDate,
        generatedExdates: normalizeDateOnlyList(params.generatedExdates),
        originalEndCondition: params.originalEndCondition,
        createdAt: (params.now || new Date()).toISOString(),
    };
}

function adjustEndConditionForGeneratedExdates(endCondition: ChoreScheduleEndCondition, generatedExdates: string[]): ChoreScheduleEndCondition {
    if (endCondition.type !== 'count') return endCondition;
    return {
        type: 'count',
        count: endCondition.count + generatedExdates.length,
    };
}

function ensureBoundedPauseWindow(pauseStartDate: string, resumeOnDate: string | null): string[] {
    if (!resumeOnDate || resumeOnDate <= pauseStartDate) {
        return [];
    }
    const endDate = format(addDays(parseISO(`${resumeOnDate}T00:00:00Z`), -1), 'yyyy-MM-dd');
    return [pauseStartDate, endDate];
}

export function createChorePausePatch(
    chore: ChoreScheduleLike,
    params: {
        pauseStartDate: string;
        resumeOnDate?: string | null;
        intent?: ChorePauseIntent;
        referenceDate?: Date;
        now?: Date;
    }
): ChoreSchedulePatch {
    const base = getResolvedBaseSchedule(chore, params.referenceDate);
    const rrule = normalizeRrule(base.rrule);
    const exdates = base.exdates;
    if (!rrule) {
        return {
            rrule: null,
            exdates,
            pauseState: base.shouldClearCompletedPauseState ? null : base.pauseState,
        };
    }

    const pauseStartDate = params.pauseStartDate;
    const resumeOnDate = params.resumeOnDate || null;
    const intent = params.intent || 'paused';
    const originalEndCondition = getChoreScheduleEndCondition(rrule);

    if (resumeOnDate) {
        const [windowStart, windowEnd] = ensureBoundedPauseWindow(pauseStartDate, resumeOnDate);
        if (!windowStart || !windowEnd) {
            return {
                rrule,
                exdates,
                pauseState: null,
            };
        }

        const generatedExdates = getChoreOccurrenceDateKeysInRange(
            {
                startDate: chore.startDate,
                rrule,
                exdates,
            },
            windowStart,
            windowEnd
        );
        const adjustedEndCondition = adjustEndConditionForGeneratedExdates(originalEndCondition, generatedExdates);

        return {
            rrule: applyRruleEndCondition(rrule, adjustedEndCondition) || null,
            exdates: mergeDateOnlyValues(exdates, generatedExdates),
            pauseState: buildPauseState({
                mode: 'bounded',
                intent,
                pauseStartDate,
                resumeOnDate,
                generatedExdates,
                originalEndCondition,
                now: params.now,
            }),
        };
    }

    const firstSkippedOccurrence = getNextChoreOccurrence(
        {
            startDate: chore.startDate,
            rrule,
            exdates,
        },
        parseISO(`${pauseStartDate}T00:00:00Z`),
        true
    );

    if (!firstSkippedOccurrence) {
        return {
            rrule,
            exdates,
            pauseState: null,
        };
    }

    return {
        rrule: capRruleBeforeOccurrence(rrule, firstSkippedOccurrence, true) || null,
        exdates,
        pauseState: buildPauseState({
            mode: 'open-ended',
            intent,
            pauseStartDate,
            resumeOnDate: null,
            generatedExdates: [],
            originalEndCondition,
            now: params.now,
        }),
    };
}

export function cancelChorePausePatch(chore: ChoreScheduleLike, referenceDate = new Date()): ChoreSchedulePatch {
    const base = getResolvedBaseSchedule(chore, referenceDate);
    return {
        rrule: base.rrule || null,
        exdates: base.exdates,
        pauseState: null,
    };
}

export function resumeChorePatch(
    chore: ChoreScheduleLike,
    params: {
        resumeOnDate: string;
        referenceDate?: Date;
    }
): ChoreSchedulePatch {
    const currentPauseState = chore.pauseState || null;
    if (!currentPauseState) {
        return {
            rrule: normalizeRrule(String(chore.rrule || '')) || null,
            exdates: normalizeChoreExdates(chore.exdates),
            pauseState: null,
        };
    }

    if (currentPauseState.mode === 'bounded') {
        if (!params.resumeOnDate || params.resumeOnDate <= currentPauseState.pauseStartDate) {
            return cancelChorePausePatch(chore, params.referenceDate);
        }
        return createChorePausePatch(chore, {
            pauseStartDate: currentPauseState.pauseStartDate,
            resumeOnDate: params.resumeOnDate,
            intent: currentPauseState.intent,
            referenceDate: params.referenceDate,
        });
    }

    const base = getResolvedBaseSchedule(chore, params.referenceDate);
    const rrule = normalizeRrule(base.rrule);
    if (!rrule) {
        return {
            rrule: null,
            exdates: base.exdates,
            pauseState: null,
        };
    }

    const [windowStart, windowEnd] = ensureBoundedPauseWindow(currentPauseState.pauseStartDate, params.resumeOnDate);
    const generatedExdates =
        windowStart && windowEnd
            ? getChoreOccurrenceDateKeysInRange(
                  {
                      startDate: chore.startDate,
                      rrule,
                      exdates: base.exdates,
                  },
                  windowStart,
                  windowEnd
              )
            : [];
    const adjustedEndCondition = adjustEndConditionForGeneratedExdates(currentPauseState.originalEndCondition, generatedExdates);

    return {
        rrule: applyRruleEndCondition(rrule, adjustedEndCondition) || null,
        exdates: mergeDateOnlyValues(base.exdates, generatedExdates),
        pauseState: null,
    };
}

export function getChoreNextOccurrenceFromBaseSchedule(chore: ChoreScheduleLike, afterDate: Date, inclusive = false): Date | null {
    const base = getResolvedBaseSchedule(chore, afterDate);
    return getNextChoreOccurrence(
        {
            startDate: chore.startDate,
            rrule: base.rrule,
            exdates: base.exdates,
        },
        afterDate,
        inclusive
    );
}

export function hasChoreFutureOccurrences(chore: ChoreScheduleLike, afterDate = new Date()): boolean {
    return Boolean(getNextChoreOccurrence(chore, afterDate, true));
}

export function getChoreHasActivePause(chore: ChoreScheduleLike, referenceDate = new Date()): boolean {
    return hasActiveOrUpcomingPause(chore, referenceDate);
}
