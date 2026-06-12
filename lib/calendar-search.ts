import { format, parseISO } from 'date-fns';
import {
    type CalendarFilterDateRange,
    type CalendarPersistentFilters,
    type CalendarSavedSearchFilter,
    type CalendarTagExpression,
    createDefaultCalendarPersistentFilters,
    createEmptyCalendarTagExpression,
} from '@/lib/calendar-controls';

export interface SearchableCalendarTagLike {
    id?: string | null;
    name?: string | null;
}

export interface SearchableCalendarItemLike {
    id?: string | null;
    title?: string | null;
    description?: string | null;
    location?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isAllDay?: boolean | null;
    pertainsTo?: Array<{ id?: string | null }> | null;
    tags?: SearchableCalendarTagLike[] | null;
    recurrenceId?: string | null;
    __displayDate?: string | null;
    [key: string]: unknown;
}

export interface CalendarAgendaSection<T extends SearchableCalendarItemLike = SearchableCalendarItemLike> {
    dateKey: string;
    items: T[];
}

const normalizeToken = (value: unknown) => String(value || '').trim();

const SEARCH_COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;
const SEARCH_APOSTROPHE_REGEX = /[\u2018\u2019\u201B\u2032\u2035\u02BC\uFF07`´]/g;
const SEARCH_QUOTE_REGEX = /[\u201C\u201D\u201E\u2033\u2036\u00AB\u00BB]/g;
const SEARCH_DASH_REGEX = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g;

const foldSearchPunctuation = (value: string) =>
    value
        .normalize('NFKD')
        .replace(SEARCH_COMBINING_MARKS_REGEX, '')
        .replace(SEARCH_APOSTROPHE_REGEX, "'")
        .replace(SEARCH_QUOTE_REGEX, '"')
        .replace(SEARCH_DASH_REGEX, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00A0/g, ' ');

const normalizeLowerText = (value: unknown) =>
    foldSearchPunctuation(normalizeToken(value))
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

const parseCalendarDateValue = (value: string | null | undefined) => {
    const normalized = normalizeToken(value);
    if (!normalized) return null;
    const parsed = parseISO(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toDayKey = (value: Date) => format(value, 'yyyy-MM-dd');

export const buildCalendarOccurrenceKey = (
    item: Pick<SearchableCalendarItemLike, 'id' | 'startDate' | 'recurrenceId' | '__displayDate'>
) => {
    const occurrenceToken =
        normalizeToken(item.recurrenceId) || normalizeToken(item.__displayDate) || normalizeToken(item.startDate);
    return `${normalizeToken(item.id)}::${occurrenceToken}`;
};

export const getCalendarOccurrenceDateKey = (item: Pick<SearchableCalendarItemLike, 'startDate' | '__displayDate'>) => {
    const displayKey = normalizeToken(item.__displayDate);
    if (displayKey) return displayKey;
    const start = parseCalendarDateValue(item.startDate);
    return start ? toDayKey(start) : normalizeToken(item.startDate);
};

export const buildCalendarSearchableText = (item: SearchableCalendarItemLike) => {
    const tagNames = Array.isArray(item.tags) ? item.tags.map((tag) => normalizeToken(tag?.name)).filter(Boolean) : [];
    return normalizeLowerText([item.title, item.description, item.location, tagNames.join(' ')].filter(Boolean).join(' '));
};

export const normalizeCalendarSearchQuery = (value: string) => normalizeLowerText(value);

export const calendarItemMatchesTextQuery = (item: SearchableCalendarItemLike, query: string) => {
    const normalizedQuery = normalizeCalendarSearchQuery(query);
    if (!normalizedQuery) return true;
    return buildCalendarSearchableText(item).includes(normalizedQuery);
};

export const getCalendarItemTagIds = (item: SearchableCalendarItemLike) =>
    Array.from(
        new Set(
            (Array.isArray(item.tags) ? item.tags : [])
                .map((tag) => normalizeToken(tag?.id))
                .filter(Boolean)
        )
    );

export const getCalendarItemMemberIds = (item: SearchableCalendarItemLike) =>
    Array.from(
        new Set(
            (Array.isArray(item.pertainsTo) ? item.pertainsTo : [])
                .map((member) => normalizeToken(member?.id))
                .filter(Boolean)
        )
    );

export const normalizeCalendarSavedSearchFilters = (
    searches?: Array<Partial<CalendarSavedSearchFilter> | null> | null
): CalendarSavedSearchFilter[] => {
    const seenIds = new Set<string>();
    const normalized: CalendarSavedSearchFilter[] = [];

    for (const candidate of Array.isArray(searches) ? searches : []) {
        const id = normalizeToken(candidate?.id);
        const query = String(candidate?.query || '').trim();
        if (!id || !query || seenIds.has(id)) {
            continue;
        }

        seenIds.add(id);
        normalized.push({
            id,
            query,
            label: normalizeToken(candidate?.label) || query,
            createdAt: normalizeToken(candidate?.createdAt) || undefined,
        });
    }

    return normalized;
};

const normalizeIdList = (value?: string[] | null) =>
    Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => normalizeToken(entry)).filter(Boolean)));

export const normalizeCalendarTagExpression = (
    expression?: Partial<CalendarTagExpression> | null
): CalendarTagExpression => {
    const fallback = createEmptyCalendarTagExpression();
    const anyOf = Array.isArray(expression?.anyOf)
        ? expression.anyOf
              .map((group) =>
                  Array.from(
                      new Set((Array.isArray(group) ? group : []).map((value) => normalizeToken(value)).filter(Boolean))
                  )
              )
              .filter((group) => group.length > 0)
        : fallback.anyOf;
    const exclude = Array.from(
        new Set((Array.isArray(expression?.exclude) ? expression?.exclude : []).map((value) => normalizeToken(value)).filter(Boolean))
    );

    return {
        anyOf,
        exclude,
    };
};

export const createFlatOrTagExpression = (tagIds: string[]): CalendarTagExpression => ({
    anyOf: Array.from(
        new Set(tagIds.map((value) => normalizeToken(value)).filter(Boolean))
    ).map((value) => [value]),
    exclude: [],
});

export const flattenCalendarTagExpressionIds = (expression?: CalendarTagExpression | null) => {
    const normalized = normalizeCalendarTagExpression(expression);
    return Array.from(new Set([...normalized.exclude, ...normalized.anyOf.flat()]));
};

export const normalizeCalendarPersistentFilters = (
    filters?: Partial<CalendarPersistentFilters> | null
): CalendarPersistentFilters => {
    const defaults = createDefaultCalendarPersistentFilters();
    const savedSearches = normalizeCalendarSavedSearchFilters(filters?.savedSearches || defaults.savedSearches);
    const savedSearchIds = new Set(savedSearches.map((search) => search.id));

    return {
        textQuery: String(filters?.textQuery || defaults.textQuery),
        dateRange: {
            mode: filters?.dateRange?.mode || defaults.dateRange.mode,
            startDate: String(filters?.dateRange?.startDate || defaults.dateRange.startDate),
            endDate: String(filters?.dateRange?.endDate || defaults.dateRange.endDate),
        },
        tagExpression: normalizeCalendarTagExpression(filters?.tagExpression || defaults.tagExpression),
        savedSearches,
        selectedSavedSearchIds: normalizeIdList(filters?.selectedSavedSearchIds).filter((id) => savedSearchIds.has(id)),
        excludedMemberIds: normalizeIdList(filters?.excludedMemberIds),
        excludedSavedSearchIds: normalizeIdList(filters?.excludedSavedSearchIds).filter((id) => savedSearchIds.has(id)),
    };
};

export const calendarItemMatchesTagExpression = (
    item: SearchableCalendarItemLike,
    expression?: CalendarTagExpression | null
) => {
    const normalizedExpression = normalizeCalendarTagExpression(expression);
    const itemTagIds = new Set(getCalendarItemTagIds(item));

    if (normalizedExpression.exclude.some((tagId) => itemTagIds.has(tagId))) {
        return false;
    }

    if (normalizedExpression.anyOf.length === 0) {
        return true;
    }

    return normalizedExpression.anyOf.some((group) => group.every((tagId) => itemTagIds.has(tagId)));
};

export const isCalendarDateRangeFilterActive = (dateRange?: CalendarFilterDateRange | null) => {
    const mode = dateRange?.mode || 'any';
    if (mode === 'any') return false;
    if (mode === 'before') return normalizeToken(dateRange?.endDate || dateRange?.startDate).length > 0;
    if (mode === 'after') return normalizeToken(dateRange?.startDate || dateRange?.endDate).length > 0;
    return normalizeToken(dateRange?.startDate).length > 0 || normalizeToken(dateRange?.endDate).length > 0;
};

export const getCalendarItemInclusiveDaySpan = (
    item: Pick<SearchableCalendarItemLike, 'startDate' | 'endDate' | 'isAllDay'>
) => {
    const start = parseCalendarDateValue(item.startDate);
    const end = parseCalendarDateValue(item.endDate);
    if (!start || !end) return null;

    const startDay = toDayKey(start);
    if (item.isAllDay) {
        const inclusiveEnd = new Date(end.getTime() - 1);
        return {
            startDay,
            endDay: toDayKey(inclusiveEnd),
        };
    }

    return {
        startDay,
        endDay: toDayKey(end),
    };
};

export const calendarItemOverlapsDateRange = (
    item: Pick<SearchableCalendarItemLike, 'startDate' | 'endDate' | 'isAllDay'>,
    dateRange?: CalendarFilterDateRange | null
) => {
    if (!isCalendarDateRangeFilterActive(dateRange)) {
        return true;
    }

    const span = getCalendarItemInclusiveDaySpan(item);
    if (!span) return false;

    const mode = dateRange?.mode || 'any';
    if (mode === 'before') {
        const boundary = normalizeToken(dateRange?.endDate || dateRange?.startDate);
        return !boundary || span.startDay <= boundary;
    }

    if (mode === 'after') {
        const boundary = normalizeToken(dateRange?.startDate || dateRange?.endDate);
        return !boundary || span.endDay >= boundary;
    }

    const startBoundary = normalizeToken(dateRange?.startDate);
    const endBoundary = normalizeToken(dateRange?.endDate);
    const effectiveStart = startBoundary || endBoundary;
    const effectiveEnd = endBoundary || startBoundary;
    if (!effectiveStart && !effectiveEnd) return true;
    return span.startDay <= effectiveEnd && span.endDay >= effectiveStart;
};

export const calendarItemMatchesNonDatePersistentFilters = (
    item: SearchableCalendarItemLike,
    filters: CalendarPersistentFilters
) => {
    const normalizedFilters = normalizeCalendarPersistentFilters(filters);
    const memberIds = new Set(getCalendarItemMemberIds(item));

    if (normalizedFilters.excludedMemberIds.some((memberId) => memberIds.has(memberId))) {
        return false;
    }

    const savedSearchById = new Map(normalizedFilters.savedSearches.map((search) => [search.id, search] as const));
    const selectedSavedSearches = normalizedFilters.selectedSavedSearchIds
        .map((searchId) => savedSearchById.get(searchId))
        .filter(Boolean) as CalendarSavedSearchFilter[];
    const excludedSavedSearches = normalizedFilters.excludedSavedSearchIds
        .map((searchId) => savedSearchById.get(searchId))
        .filter(Boolean) as CalendarSavedSearchFilter[];

    if (selectedSavedSearches.length > 0 && !selectedSavedSearches.some((search) => calendarItemMatchesTextQuery(item, search.query))) {
        return false;
    }

    if (excludedSavedSearches.some((search) => calendarItemMatchesTextQuery(item, search.query))) {
        return false;
    }

    return calendarItemMatchesTextQuery(item, normalizedFilters.textQuery) && calendarItemMatchesTagExpression(item, normalizedFilters.tagExpression);
};

export const calendarItemMatchesPersistentFilters = (
    item: SearchableCalendarItemLike,
    filters: CalendarPersistentFilters
) =>
    calendarItemMatchesNonDatePersistentFilters(item, filters) &&
    calendarItemOverlapsDateRange(item, normalizeCalendarPersistentFilters(filters).dateRange);

export const buildCalendarAgendaSections = <T extends SearchableCalendarItemLike>(
    itemsByDate: Map<string, T[]>,
    options?: {
        textQuery?: string;
    }
): CalendarAgendaSection<T>[] => {
    const normalizedQuery = normalizeCalendarSearchQuery(options?.textQuery || '');
    return Array.from(itemsByDate.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([dateKey, items]) => ({
            dateKey,
            items: normalizedQuery ? items.filter((item) => calendarItemMatchesTextQuery(item, normalizedQuery)) : items,
        }))
        .filter((section) => section.items.length > 0);
};

export const getClosestCalendarHitMinute = (
    item: Pick<SearchableCalendarItemLike, 'startDate' | 'endDate' | 'isAllDay'>,
    dayKey: string
) => {
    if (item.isAllDay) return null;
    const start = parseCalendarDateValue(item.startDate);
    const end = parseCalendarDateValue(item.endDate);
    if (!start || !end) return null;

    const dayStart = parseCalendarDateValue(`${dayKey}T00:00:00`);
    if (!dayStart) return null;

    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
    const segmentStartMs = Math.max(start.getTime(), dayStartMs);
    const segmentEndMs = Math.min(end.getTime(), dayEndMs);
    if (segmentEndMs <= segmentStartMs) return null;

    return Math.max(0, Math.floor((segmentStartMs - dayStartMs) / 60000));
};
