import { addDays, isSameDay, parseISO } from 'date-fns';
import { getHistoryActorKey, type HistoryEventLike } from '@/lib/history-events';

export interface CalendarHistorySnapshot {
    startDate: string;
    endDate: string;
    isAllDay: boolean;
    timeZone?: string | null;
}

export interface CalendarHistoryMetadata {
    title?: string | null;
    scope?: string | null;
    sourceAccountId?: string | null;
    sourceCalendarId?: string | null;
    previousStartDate?: string | null;
    previousEndDate?: string | null;
    nextStartDate?: string | null;
    nextEndDate?: string | null;
    timeZone?: string | null;
    previousTimeZone?: string | null;
    nextTimeZone?: string | null;
    calendarHistory?: {
        before?: CalendarHistorySnapshot | null;
        after?: CalendarHistorySnapshot | null;
    } | null;
    [key: string]: unknown;
}

export interface CalendarHistoryGroup {
    key: string;
    events: HistoryEventLike[];
}

const CALENDAR_HISTORY_COLLAPSIBLE_ACTIONS = new Set([
    'calendar_event_created',
    'calendar_event_updated',
    'calendar_event_moved',
    'calendar_event_resized',
]);

export const HISTORY_CALENDAR_COLLAPSE_GAP_MS = 5 * 60 * 1000;
export const HISTORY_CALENDAR_COLLAPSE_MAX_MS = 60 * 60 * 1000;
export const HISTORY_CALENDAR_INLINE_DETAILS_MAX = 3;

function buildFormatter(
    timeZone: string | null | undefined,
    options: Intl.DateTimeFormatOptions
) {
    try {
        return new Intl.DateTimeFormat(undefined, {
            ...options,
            ...(timeZone ? { timeZone } : {}),
        });
    } catch {
        return new Intl.DateTimeFormat(undefined, options);
    }
}

function getDatePart(
    parts: Intl.DateTimeFormatPart[],
    type: Intl.DateTimeFormatPartTypes
) {
    return Number(parts.find((part) => part.type === type)?.value || 0);
}

function getZonedParts(date: Date, timeZone: string | null | undefined) {
    const parts = buildFormatter(timeZone, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
    }).formatToParts(date);

    return {
        year: getDatePart(parts, 'year'),
        month: getDatePart(parts, 'month'),
        day: getDatePart(parts, 'day'),
        hour: getDatePart(parts, 'hour'),
        minute: getDatePart(parts, 'minute'),
        second: getDatePart(parts, 'second'),
    };
}

function parseSnapshotStart(snapshot: CalendarHistorySnapshot | null | undefined) {
    if (!snapshot?.startDate) return null;
    const parsed = parseISO(snapshot.isAllDay ? `${snapshot.startDate}T00:00:00` : snapshot.startDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseSnapshotEnd(snapshot: CalendarHistorySnapshot | null | undefined) {
    if (!snapshot?.endDate) return null;
    const parsed = parseISO(snapshot.isAllDay ? `${snapshot.endDate}T00:00:00` : snapshot.endDate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getSnapshotEndInclusive(snapshot: CalendarHistorySnapshot | null | undefined) {
    const parsedEnd = parseSnapshotEnd(snapshot);
    if (!parsedEnd) return null;
    return snapshot?.isAllDay ? addDays(parsedEnd, -1) : parsedEnd;
}

function getPreferredTimeZone(
    before: CalendarHistorySnapshot | null | undefined,
    after: CalendarHistorySnapshot | null | undefined
) {
    return String(after?.timeZone || before?.timeZone || '').trim() || undefined;
}

function shouldIncludeYear(dates: Array<Date | null>) {
    const currentYear = new Date().getFullYear();
    const years = dates
        .filter((value): value is Date => Boolean(value))
        .map((value) => value.getFullYear());

    if (years.length === 0) return false;
    return years.some((year) => year !== currentYear) || new Set(years).size > 1;
}

function formatTimeLabel(date: Date, timeZone: string | null | undefined) {
    const zonedMinute = getZonedParts(date, timeZone).minute;
    return buildFormatter(timeZone, {
        hour: 'numeric',
        ...(zonedMinute === 0 ? {} : { minute: '2-digit' }),
    })
        .format(date)
        .replace(/\s?(AM|PM)$/i, (match) => match.toLowerCase());
}

function formatDateLabel(
    date: Date,
    timeZone: string | null | undefined,
    options?: {
        includeWeekday?: boolean;
        includeYear?: boolean;
    }
) {
    const { includeWeekday = false, includeYear = false } = options || {};
    return buildFormatter(timeZone, {
        ...(includeWeekday ? { weekday: 'long' } : {}),
        month: 'long',
        day: 'numeric',
        ...(includeYear ? { year: 'numeric' } : {}),
    }).format(date);
}

function formatDateTimeLabel(
    date: Date,
    timeZone: string | null | undefined,
    options?: {
        includeYear?: boolean;
    }
) {
    const includeYear = options?.includeYear || false;
    return `${formatDateLabel(date, timeZone, { includeYear })} at ${formatTimeLabel(date, timeZone)}`;
}

function areSameLocalDate(
    left: Date,
    right: Date,
    timeZone: string | null | undefined
) {
    const leftParts = getZonedParts(left, timeZone);
    const rightParts = getZonedParts(right, timeZone);
    return leftParts.year === rightParts.year && leftParts.month === rightParts.month && leftParts.day === rightParts.day;
}

function areSameLocalTime(
    left: Date,
    right: Date,
    timeZone: string | null | undefined
) {
    const leftParts = getZonedParts(left, timeZone);
    const rightParts = getZonedParts(right, timeZone);
    return leftParts.hour === rightParts.hour && leftParts.minute === rightParts.minute;
}

function formatCompactSchedule(snapshot: CalendarHistorySnapshot) {
    const start = parseSnapshotStart(snapshot);
    const endInclusive = getSnapshotEndInclusive(snapshot);
    const timeZone = snapshot.timeZone;
    const includeYear = shouldIncludeYear([start, endInclusive]);

    if (!start || !endInclusive) return null;

    if (snapshot.isAllDay) {
        if (isSameDay(start, endInclusive)) {
            return formatDateLabel(start, undefined, { includeWeekday: true, includeYear });
        }
        return `${formatDateLabel(start, undefined, { includeWeekday: true, includeYear })} to ${formatDateLabel(endInclusive, undefined, {
            includeWeekday: true,
            includeYear,
        })}`;
    }

    if (areSameLocalDate(start, endInclusive, timeZone)) {
        return `${formatDateLabel(start, timeZone, { includeWeekday: true, includeYear })}, ${formatTimeLabel(start, timeZone)}-${formatTimeLabel(
            endInclusive,
            timeZone
        )}`;
    }

    return `${formatDateTimeLabel(start, timeZone, { includeYear })} to ${formatDateTimeLabel(endInclusive, timeZone, { includeYear })}`;
}

function formatScheduledRange(snapshot: CalendarHistorySnapshot) {
    const start = parseSnapshotStart(snapshot);
    const endInclusive = getSnapshotEndInclusive(snapshot);
    const timeZone = snapshot.timeZone;
    const includeYear = shouldIncludeYear([start, endInclusive]);

    if (!start || !endInclusive) return null;

    if (snapshot.isAllDay) {
        if (isSameDay(start, endInclusive)) {
            return `Scheduled for ${formatDateLabel(start, undefined, { includeWeekday: true, includeYear })}`;
        }
        return `Scheduled for ${formatDateLabel(start, undefined, { includeWeekday: true, includeYear })} to ${formatDateLabel(
            endInclusive,
            undefined,
            {
                includeWeekday: true,
                includeYear,
            }
        )}`;
    }

    if (areSameLocalDate(start, endInclusive, timeZone)) {
        return `Scheduled for ${formatDateLabel(start, timeZone, { includeWeekday: true, includeYear })} from ${formatTimeLabel(
            start,
            timeZone
        )} to ${formatTimeLabel(endInclusive, timeZone)}`;
    }

    return `Scheduled for ${formatDateTimeLabel(start, timeZone, { includeYear })} to ${formatDateTimeLabel(endInclusive, timeZone, {
        includeYear,
    })}`;
}

function describePointShift(input: {
    beforeDate: Date;
    afterDate: Date;
    beforeTimeZone?: string | null;
    afterTimeZone?: string | null;
    forceDateOnly?: boolean;
}) {
    const compareTimeZone = input.afterTimeZone || input.beforeTimeZone || undefined;
    const includeYear = shouldIncludeYear([input.beforeDate, input.afterDate]);
    const sameLocalDate = areSameLocalDate(input.beforeDate, input.afterDate, compareTimeZone);
    const sameLocalTime = areSameLocalTime(input.beforeDate, input.afterDate, compareTimeZone);

    if (input.forceDateOnly || sameLocalTime) {
        return `From ${formatDateLabel(input.beforeDate, compareTimeZone, {
            includeWeekday: true,
            includeYear,
        })} to ${formatDateLabel(input.afterDate, compareTimeZone, {
            includeWeekday: true,
            includeYear,
        })}`;
    }

    if (sameLocalDate) {
        return `From ${formatTimeLabel(input.beforeDate, compareTimeZone)} to ${formatTimeLabel(input.afterDate, compareTimeZone)}`;
    }

    return `From ${formatDateTimeLabel(input.beforeDate, compareTimeZone, { includeYear })} to ${formatDateTimeLabel(
        input.afterDate,
        compareTimeZone,
        { includeYear }
    )}`;
}

function describeEndShift(input: {
    beforeDate: Date;
    afterDate: Date;
    beforeTimeZone?: string | null;
    afterTimeZone?: string | null;
}) {
    const compareTimeZone = input.afterTimeZone || input.beforeTimeZone || undefined;
    const includeYear = shouldIncludeYear([input.beforeDate, input.afterDate]);
    const sameLocalDate = areSameLocalDate(input.beforeDate, input.afterDate, compareTimeZone);
    const sameLocalTime = areSameLocalTime(input.beforeDate, input.afterDate, compareTimeZone);

    if (sameLocalDate) {
        return `End time changed from ${formatTimeLabel(input.beforeDate, compareTimeZone)} to ${formatTimeLabel(
            input.afterDate,
            compareTimeZone
        )}`;
    }

    if (sameLocalTime) {
        return `End date changed from ${formatDateLabel(input.beforeDate, compareTimeZone, {
            includeWeekday: true,
            includeYear,
        })} to ${formatDateLabel(input.afterDate, compareTimeZone, {
            includeWeekday: true,
            includeYear,
        })}`;
    }

    return `End changed from ${formatDateTimeLabel(input.beforeDate, compareTimeZone, { includeYear })} to ${formatDateTimeLabel(
        input.afterDate,
        compareTimeZone,
        { includeYear }
    )}`;
}

function describeScheduleChange(
    before: CalendarHistorySnapshot | null | undefined,
    after: CalendarHistorySnapshot | null | undefined
) {
    if (!before && !after) return null;
    if (!before && after) return formatScheduledRange(after);
    if (before && !after) {
        const description = formatCompactSchedule(before);
        return description ? `Was scheduled for ${description}` : null;
    }
    if (!before || !after) return null;

    const beforeStart = parseSnapshotStart(before);
    const afterStart = parseSnapshotStart(after);
    const beforeEnd = parseSnapshotEnd(before);
    const afterEnd = parseSnapshotEnd(after);

    if (!beforeStart || !afterStart || !beforeEnd || !afterEnd) return null;

    const startChanged = beforeStart.getTime() !== afterStart.getTime();
    const endChanged = beforeEnd.getTime() !== afterEnd.getTime();
    const durationBefore = beforeEnd.getTime() - beforeStart.getTime();
    const durationAfter = afterEnd.getTime() - afterStart.getTime();
    const sameDelta = afterStart.getTime() - beforeStart.getTime() === afterEnd.getTime() - beforeEnd.getTime();
    const sameDuration = durationBefore === durationAfter;

    if (!startChanged && !endChanged) return null;

    if (startChanged && !endChanged) {
        return describePointShift({
            beforeDate: beforeStart,
            afterDate: afterStart,
            beforeTimeZone: before.timeZone,
            afterTimeZone: after.timeZone,
        });
    }

    if (!startChanged && endChanged) {
        return describeEndShift({
            beforeDate: getSnapshotEndInclusive(before) || beforeEnd,
            afterDate: getSnapshotEndInclusive(after) || afterEnd,
            beforeTimeZone: before.timeZone,
            afterTimeZone: after.timeZone,
        });
    }

    if (sameDelta && sameDuration) {
        return describePointShift({
            beforeDate: beforeStart,
            afterDate: afterStart,
            beforeTimeZone: before.timeZone,
            afterTimeZone: after.timeZone,
            forceDateOnly:
                !before.isAllDay &&
                !after.isAllDay &&
                areSameLocalTime(beforeStart, afterStart, getPreferredTimeZone(before, after)),
        });
    }

    const beforeDescription = formatCompactSchedule(before);
    const afterDescription = formatCompactSchedule(after);
    if (!beforeDescription || !afterDescription) return null;

    return `Changed schedule from ${beforeDescription}; now ${afterDescription}`;
}

function normalizeCalendarHistoryMetadata(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as CalendarHistoryMetadata;
}

function isDateOnlyToken(value: string | null | undefined) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function buildLegacySnapshot(input: {
    startDate?: string | null;
    endDate?: string | null;
    timeZone?: string | null;
}) {
    const startDate = String(input.startDate || '').trim();
    const endDate = String(input.endDate || '').trim();
    if (!startDate || !endDate) return null;

    const isAllDay = isDateOnlyToken(startDate) && isDateOnlyToken(endDate);
    return buildCalendarHistorySnapshot({
        startDate,
        endDate,
        isAllDay,
        timeZone: input.timeZone || null,
    });
}

function getCalendarHistoryDataFromEvent(event: HistoryEventLike | null | undefined) {
    const metadata = normalizeCalendarHistoryMetadata(event?.metadata);
    const calendarHistory =
        metadata?.calendarHistory && typeof metadata.calendarHistory === 'object' && !Array.isArray(metadata.calendarHistory)
            ? metadata.calendarHistory
            : null;
    const before =
        calendarHistory?.before ||
        buildLegacySnapshot({
            startDate: metadata?.previousStartDate || null,
            endDate: metadata?.previousEndDate || null,
            timeZone: metadata?.previousTimeZone || metadata?.timeZone || null,
        });
    const after =
        calendarHistory?.after ||
        buildLegacySnapshot({
            startDate: metadata?.nextStartDate || null,
            endDate: metadata?.nextEndDate || null,
            timeZone: metadata?.nextTimeZone || metadata?.timeZone || null,
        });

    return {
        metadata,
        title: getCalendarHistoryTitle(event),
        before,
        after,
    };
}

function sortChronologically(events: HistoryEventLike[]) {
    return events
        .slice()
        .sort((left, right) => new Date(String(left.occurredAt || '')).getTime() - new Date(String(right.occurredAt || '')).getTime());
}

function getEventOccurredAtMs(event: HistoryEventLike) {
    const parsed = new Date(String(event.occurredAt || ''));
    const time = parsed.getTime();
    return Number.isNaN(time) ? null : time;
}

function isCollapsibleCalendarHistoryEvent(event: HistoryEventLike) {
    return (
        event.domain === 'calendar' &&
        Boolean(String(event.calendarItemId || '').trim()) &&
        CALENDAR_HISTORY_COLLAPSIBLE_ACTIONS.has(String(event.actionType || ''))
    );
}

export function buildCalendarHistorySnapshot(input: {
    startDate?: string | null;
    endDate?: string | null;
    isAllDay?: boolean | null;
    timeZone?: string | null;
} | null | undefined) {
    if (!input || !input.startDate || !input.endDate || typeof input.isAllDay !== 'boolean') {
        return null;
    }

    return {
        startDate: String(input.startDate),
        endDate: String(input.endDate),
        isAllDay: Boolean(input.isAllDay),
        timeZone: String(input.timeZone || '').trim() || null,
    } satisfies CalendarHistorySnapshot;
}

export function buildCalendarHistoryMetadata(input: {
    title?: string | null;
    before?: CalendarHistorySnapshot | null;
    after?: CalendarHistorySnapshot | null;
    extra?: Record<string, unknown> | null;
}) {
    return {
        ...(input.extra || {}),
        title: input.title || null,
        calendarHistory: {
            before: input.before || null,
            after: input.after || null,
        },
    } satisfies CalendarHistoryMetadata;
}

export function getCalendarHistoryTitle(event: HistoryEventLike | null | undefined) {
    const metadata = normalizeCalendarHistoryMetadata(event?.metadata);
    const metadataTitle = typeof metadata?.title === 'string' ? metadata.title.trim() : '';
    if (metadataTitle) return metadataTitle;

    const summary = String(event?.summary || '');
    const match = summary.match(/"([^"]+)"/);
    if (match?.[1]) return match[1];
    return '';
}

export function getCalendarHistoryHeadline(events: HistoryEventLike[]) {
    if (events.length === 0) return '';
    if (events.length === 1) {
        return String(events[0].summary || '');
    }

    const chronological = sortChronologically(events);
    const first = chronological[0];
    const last = chronological[chronological.length - 1];
    const title = getCalendarHistoryTitle(last) || getCalendarHistoryTitle(first) || 'Untitled event';

    if (String(last.actionType || '') === 'calendar_event_deleted') {
        return `Deleted event "${title}"`;
    }
    if (String(first.actionType || '') === 'calendar_event_created') {
        return String(first.source || '') === 'apple_sync' ? `Imported event "${title}"` : `Created event "${title}"`;
    }
    if (chronological.every((event) => String(event.actionType || '') === 'calendar_event_moved')) {
        return `Moved event "${title}"`;
    }
    if (chronological.every((event) => String(event.actionType || '') === 'calendar_event_resized')) {
        return `Resized event "${title}"`;
    }
    if (String(last.source || '') === 'apple_sync') {
        return `Updated imported event "${title}"`;
    }
    return `Updated event "${title}"`;
}

export function getCalendarHistoryDetail(events: HistoryEventLike[] | HistoryEventLike | null | undefined) {
    const normalizedEvents = Array.isArray(events) ? events : events ? [events] : [];
    if (normalizedEvents.length === 0) return null;

    const chronological = sortChronologically(normalizedEvents);
    const first = chronological[0];
    const last = chronological[chronological.length - 1];
    const firstData = getCalendarHistoryDataFromEvent(first);
    const lastData = getCalendarHistoryDataFromEvent(last);
    const netBefore = normalizedEvents.length > 1 ? firstData.before || firstData.after : firstData.before;
    const netAfter = normalizedEvents.length > 1 ? lastData.after || lastData.before : lastData.after || firstData.after;

    if (normalizedEvents.length > 1) {
        return describeScheduleChange(netBefore, netAfter);
    }

    return describeScheduleChange(firstData.before, netAfter);
}

export function collapseCalendarHistoryEvents(events: HistoryEventLike[]) {
    const groups: CalendarHistoryGroup[] = [];

    for (const event of events) {
        const previousGroup = groups[groups.length - 1];

        if (!previousGroup || previousGroup.events.length === 0) {
            groups.push({
                key: event.id,
                events: [event],
            });
            continue;
        }

        const anchorEvent = previousGroup.events[0];
        const previousEvent = previousGroup.events[previousGroup.events.length - 1];
        const anchorTime = getEventOccurredAtMs(anchorEvent);
        const previousTime = getEventOccurredAtMs(previousEvent);
        const candidateTime = getEventOccurredAtMs(event);

        const sameActor = getHistoryActorKey(anchorEvent) === getHistoryActorKey(event);
        const sameSource = String(anchorEvent.source || '') === String(event.source || '');
        const sameCalendarItemId = String(anchorEvent.calendarItemId || '') === String(event.calendarItemId || '');
        const canCollapse =
            isCollapsibleCalendarHistoryEvent(anchorEvent) &&
            isCollapsibleCalendarHistoryEvent(event) &&
            sameActor &&
            sameSource &&
            sameCalendarItemId &&
            anchorTime != null &&
            previousTime != null &&
            candidateTime != null &&
            Math.abs(previousTime - candidateTime) <= HISTORY_CALENDAR_COLLAPSE_GAP_MS &&
            Math.abs(anchorTime - candidateTime) <= HISTORY_CALENDAR_COLLAPSE_MAX_MS;

        if (canCollapse) {
            previousGroup.events.push(event);
            previousGroup.key = `${anchorEvent.id}:${event.id}`;
            continue;
        }

        groups.push({
            key: event.id,
            events: [event],
        });
    }

    return groups;
}
