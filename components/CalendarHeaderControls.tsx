'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Filter, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import CalendarEventFontScaleControl from '@/components/calendar/CalendarEventFontScaleControl';
import { useCalendarFilterOptions } from '@/components/calendar/useCalendarFilterOptions';
import {
    CALENDAR_AGENDA_FONT_SCALE_DEFAULT,
    CALENDAR_AGENDA_FONT_SCALE_MAX,
    CALENDAR_AGENDA_FONT_SCALE_MIN,
    CALENDAR_AGENDA_FONT_SCALE_STORAGE_KEY,
    CALENDAR_AGENDA_SHOW_DESCRIPTION_STORAGE_KEY,
    CALENDAR_AGENDA_SHOW_LOCATION_STORAGE_KEY,
    CALENDAR_AGENDA_SHOW_METADATA_STORAGE_KEY,
    CALENDAR_AGENDA_SHOW_TAGS_STORAGE_KEY,
    CALENDAR_COMMAND_EVENT,
    CALENDAR_DAY_HEIGHT_DEFAULT,
    CALENDAR_DAY_HEIGHT_MAX,
    CALENDAR_DAY_HEIGHT_MIN,
    CALENDAR_DAY_HEIGHT_STORAGE_KEY,
    CALENDAR_DAY_VIEW_FONT_SCALE_DEFAULT,
    CALENDAR_DAY_VIEW_FONT_SCALE_MAX,
    CALENDAR_DAY_VIEW_FONT_SCALE_MIN,
    CALENDAR_DAY_VIEW_FONT_SCALE_STORAGE_KEY,
    CALENDAR_DAY_VIEW_HOUR_HEIGHT_DEFAULT,
    CALENDAR_DAY_VIEW_HOUR_HEIGHT_MAX,
    CALENDAR_DAY_VIEW_HOUR_HEIGHT_MIN,
    CALENDAR_DAY_VIEW_HOUR_HEIGHT_STORAGE_KEY,
    CALENDAR_DAY_VIEW_VISIBLE_HOURS_DEFAULT,
    CALENDAR_DAY_VIEW_VISIBLE_HOURS_MAX,
    CALENDAR_DAY_VIEW_VISIBLE_HOURS_MIN,
    CALENDAR_DAY_VIEW_VISIBLE_HOURS_STORAGE_KEY,
    CALENDAR_DAY_VIEW_ROW_COUNT_DEFAULT,
    CALENDAR_DAY_VIEW_ROW_COUNT_STORAGE_KEY,
    CALENDAR_DAY_VIEW_VISIBLE_DAYS_DEFAULT,
    CALENDAR_DAY_VIEW_VISIBLE_DAYS_MAX,
    CALENDAR_DAY_VIEW_VISIBLE_DAYS_MIN,
    CALENDAR_DAY_VIEW_VISIBLE_DAYS_STORAGE_KEY,
    CALENDAR_SHOW_BS_CALENDAR_STORAGE_KEY,
    CALENDAR_SHOW_CHORES_STORAGE_KEY,
    CALENDAR_SHOW_GREGORIAN_CALENDAR_STORAGE_KEY,
    CALENDAR_SHOW_INLINE_NON_BASIS_MONTH_BREAKS_STORAGE_KEY,
    CALENDAR_STATE_EVENT,
    CALENDAR_VIEW_MODE_STORAGE_KEY,
    CALENDAR_VISIBLE_WEEKS_MAX,
    CALENDAR_VISIBLE_WEEKS_MIN,
    CALENDAR_YEAR_FONT_SCALE_DEFAULT,
    CALENDAR_YEAR_FONT_SCALE_STORAGE_KEY,
    CALENDAR_YEAR_MONTH_BASIS_STORAGE_KEY,
    clampCalendarAgendaFontScale,
    clampCalendarDayFontScale,
    clampCalendarDayHourHeight,
    clampCalendarDayVisibleHours,
    clampCalendarDayRowCount,
    clampCalendarDayVisibleDays,
    clampCalendarYearFontScale,
    createDefaultCalendarAgendaDisplaySettings,
    createDefaultCalendarPersistentFilters,
    createEmptyCalendarTagExpression,
    type CalendarAgendaDisplaySettings,
    type CalendarCommandDetail,
    type CalendarCurrentPeriodLabel,
    type CalendarFilterDateRange,
    type CalendarLiveSearchState,
    type CalendarPersistentFilters,
    type CalendarSavedSearchFilter,
    type CalendarStateDetail,
    type CalendarTagExpression,
    type CalendarViewMode,
    type CalendarYearMonthBasis,
} from '@/lib/calendar-controls';
import {
    createFlatOrTagExpression,
    flattenCalendarTagExpressionIds,
    normalizeCalendarPersistentFilters,
    normalizeCalendarTagExpression,
} from '@/lib/calendar-search';

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeChecked = (value: boolean | 'indeterminate') => value === true;

const humanJoin = (items: string[]) => {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
};

const dispatchCalendarCommand = (detail: CalendarCommandDetail) => {
    window.dispatchEvent(new CustomEvent<CalendarCommandDetail>(CALENDAR_COMMAND_EVENT, { detail }));
};

const normalizeDateRange = (value?: CalendarFilterDateRange | null): CalendarFilterDateRange => ({
    mode: value?.mode || 'any',
    startDate: String(value?.startDate || ''),
    endDate: String(value?.endDate || ''),
});

const summarizeDateRange = (dateRange: CalendarFilterDateRange) => {
    if (dateRange.mode === 'before') {
        return dateRange.endDate ? `On or before ${dateRange.endDate}` : 'Any date';
    }
    if (dateRange.mode === 'after') {
        return dateRange.startDate ? `On or after ${dateRange.startDate}` : 'Any date';
    }
    if (dateRange.mode === 'between') {
        if (dateRange.startDate && dateRange.endDate) return `${dateRange.startDate} to ${dateRange.endDate}`;
        if (dateRange.startDate) return `From ${dateRange.startDate}`;
        if (dateRange.endDate) return `Until ${dateRange.endDate}`;
    }
    return 'Any date';
};

const summarizeTagExpression = (
    expression: CalendarTagExpression,
    tagNameById: Map<string, string>
) => {
    const normalized = normalizeCalendarTagExpression(expression);
    const includeSummary = normalized.anyOf
        .map((group) => group.map((tagId) => tagNameById.get(tagId) || tagId).join(' + '))
        .filter(Boolean);
    const excludeSummary = normalized.exclude.map((tagId) => tagNameById.get(tagId) || tagId).filter(Boolean);

    if (includeSummary.length === 0 && excludeSummary.length === 0) {
        return 'No tag filter';
    }

    const parts: string[] = [];
    if (includeSummary.length > 0) {
        parts.push(`match ${includeSummary.join(' or ')}`);
    }
    if (excludeSummary.length > 0) {
        parts.push(`exclude ${excludeSummary.join(', ')}`);
    }
    return parts.join(' • ');
};

const summarizeSavedSearchSelection = (
    filters: CalendarPersistentFilters,
    searchLabelById: Map<string, string>
) => {
    const selectedLabels = filters.selectedSavedSearchIds
        .map((searchId) => searchLabelById.get(searchId))
        .filter((label): label is string => Boolean(label));

    if (filters.savedSearches.length === 0) {
        return 'No saved searches yet';
    }
    if (selectedLabels.length === 0) {
        return 'No saved searches selected';
    }
    if (selectedLabels.length === filters.savedSearches.length) {
        return 'All saved searches selected';
    }
    return `Matching ${humanJoin(selectedLabels)}`;
};

const createSavedSearchFilterId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `calendar-search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const normalizeAgendaDisplay = (value?: Partial<CalendarAgendaDisplaySettings> | null): CalendarAgendaDisplaySettings => {
    const defaults = createDefaultCalendarAgendaDisplaySettings();
    return {
        fontScale: clampCalendarAgendaFontScale(
            typeof value?.fontScale === 'number' ? value.fontScale : defaults.fontScale
        ),
        showTags: typeof value?.showTags === 'boolean' ? value.showTags : defaults.showTags,
        showDescription: typeof value?.showDescription === 'boolean' ? value.showDescription : defaults.showDescription,
        showLocation: typeof value?.showLocation === 'boolean' ? value.showLocation : defaults.showLocation,
        showMetadata: typeof value?.showMetadata === 'boolean' ? value.showMetadata : defaults.showMetadata,
    };
};

const normalizeSearchState = (value?: Partial<CalendarLiveSearchState> | null): CalendarLiveSearchState => ({
    isOpen: Boolean(value?.isOpen),
    query: String(value?.query || ''),
});

export default function CalendarHeaderControls() {
    const pathname = usePathname();
    const isCalendarRoute = useMemo(() => pathname?.startsWith('/calendar') ?? false, [pathname]);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const hasInitializedMemberFilterRef = useRef(false);

    const [dayHeight, setDayHeight] = useState(CALENDAR_DAY_HEIGHT_DEFAULT);
    const [visibleWeeks, setVisibleWeeks] = useState(6);
    const [showChores, setShowChores] = useState(false);
    const [viewMode, setViewMode] = useState<CalendarViewMode>('monthly');
    const [dayVisibleDays, setDayVisibleDays] = useState(CALENDAR_DAY_VIEW_VISIBLE_DAYS_DEFAULT);
    const [dayRowCount, setDayRowCount] = useState(CALENDAR_DAY_VIEW_ROW_COUNT_DEFAULT);
    const [dayHourHeight, setDayHourHeight] = useState(CALENDAR_DAY_VIEW_HOUR_HEIGHT_DEFAULT);
    const [dayVisibleHours, setDayVisibleHours] = useState(CALENDAR_DAY_VIEW_VISIBLE_HOURS_DEFAULT);
    const [dayFontScale, setDayFontScale] = useState(CALENDAR_DAY_VIEW_FONT_SCALE_DEFAULT);
    const [yearMonthBasis, setYearMonthBasis] = useState<CalendarYearMonthBasis>('gregorian');
    const [showGregorianCalendar, setShowGregorianCalendar] = useState(true);
    const [showBsCalendar, setShowBsCalendar] = useState(true);
    const [showInlineNonBasisMonthBreaks, setShowInlineNonBasisMonthBreaks] = useState(true);
    const [yearFontScale, setYearFontScale] = useState(CALENDAR_YEAR_FONT_SCALE_DEFAULT);
    const [agendaDisplay, setAgendaDisplay] = useState<CalendarAgendaDisplaySettings>(
        createDefaultCalendarAgendaDisplaySettings()
    );
    const [currentPeriodLabel, setCurrentPeriodLabel] = useState<CalendarCurrentPeriodLabel | null>(null);
    const [searchState, setSearchState] = useState<CalendarLiveSearchState>({ isOpen: false, query: '' });
    const [filters, setFilters] = useState<CalendarPersistentFilters>(createDefaultCalendarPersistentFilters);
    const [selectedChoreIds, setSelectedChoreIds] = useState<string[]>([]);
    const [choreFilterConfigured, setChoreFilterConfigured] = useState(false);
    const [everyoneSelected, setEveryoneSelected] = useState(true);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [isChoreFilterExpanded, setIsChoreFilterExpanded] = useState(false);
    const [isAdvancedFilterLogicOpen, setIsAdvancedFilterLogicOpen] = useState(false);
    const [draftTagGroupCount, setDraftTagGroupCount] = useState(1);

    const filterOptionsQuery = useCalendarFilterOptions();
    const { familyMembers, familyMemberIds, chores, choreIds, tags, tagIds } = filterOptionsQuery;
    const normalizedTagExpression = useMemo(() => normalizeCalendarTagExpression(filters.tagExpression), [filters.tagExpression]);
    const renderedTagGroupCount = useMemo(
        () => Math.max(draftTagGroupCount, normalizedTagExpression.anyOf.length || 1),
        [draftTagGroupCount, normalizedTagExpression.anyOf.length]
    );
    const tagNameById = useMemo(
        () => new Map(tags.map((tag) => [tag.id, String(tag.name || '').trim() || 'Untitled tag'])),
        [tags]
    );
    const searchLabelById = useMemo(
        () =>
            new Map(
                filters.savedSearches.map((search) => [
                    search.id,
                    String(search.label || search.query || '').trim() || String(search.query || '').trim() || 'Untitled search',
                ])
            ),
        [filters.savedSearches]
    );
    const effectiveSelectedChoreIds = useMemo(
        () => (choreFilterConfigured ? selectedChoreIds : choreIds),
        [choreFilterConfigured, choreIds, selectedChoreIds]
    );

    useEffect(() => {
        if (!isCalendarRoute) return;

        setShowChores(window.localStorage.getItem(CALENDAR_SHOW_CHORES_STORAGE_KEY) === 'true');
        const storedViewMode = window.localStorage.getItem(CALENDAR_VIEW_MODE_STORAGE_KEY);
        if (storedViewMode === 'monthly' || storedViewMode === 'year' || storedViewMode === 'day' || storedViewMode === 'agenda') {
            setViewMode(storedViewMode);
        }

        const storedDayVisibleDays = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_VISIBLE_DAYS_STORAGE_KEY));
        if (Number.isFinite(storedDayVisibleDays)) {
            setDayVisibleDays(clampCalendarDayVisibleDays(storedDayVisibleDays));
        }
        const storedDayRowCount = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_ROW_COUNT_STORAGE_KEY));
        if (Number.isFinite(storedDayRowCount)) {
            setDayRowCount(clampCalendarDayRowCount(storedDayRowCount));
        }
        const storedDayHourHeight = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_HOUR_HEIGHT_STORAGE_KEY));
        if (Number.isFinite(storedDayHourHeight)) {
            setDayHourHeight(clampCalendarDayHourHeight(storedDayHourHeight));
        }
        const storedDayVisibleHours = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_VISIBLE_HOURS_STORAGE_KEY));
        if (Number.isFinite(storedDayVisibleHours)) {
            setDayVisibleHours(clampCalendarDayVisibleHours(storedDayVisibleHours));
        }
        const storedDayFontScale = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_FONT_SCALE_STORAGE_KEY));
        if (Number.isFinite(storedDayFontScale)) {
            setDayFontScale(clampCalendarDayFontScale(storedDayFontScale));
        }

        const storedYearMonthBasis = window.localStorage.getItem(CALENDAR_YEAR_MONTH_BASIS_STORAGE_KEY);
        if (storedYearMonthBasis === 'gregorian' || storedYearMonthBasis === 'bs') {
            setYearMonthBasis(storedYearMonthBasis);
        }
        const storedShowGregorianCalendar = window.localStorage.getItem(CALENDAR_SHOW_GREGORIAN_CALENDAR_STORAGE_KEY);
        if (storedShowGregorianCalendar === 'true' || storedShowGregorianCalendar === 'false') {
            setShowGregorianCalendar(storedShowGregorianCalendar === 'true');
        }
        const storedShowBsCalendar = window.localStorage.getItem(CALENDAR_SHOW_BS_CALENDAR_STORAGE_KEY);
        if (storedShowBsCalendar === 'true' || storedShowBsCalendar === 'false') {
            setShowBsCalendar(storedShowBsCalendar === 'true');
        }
        const storedShowInlineNonBasisMonthBreaks = window.localStorage.getItem(CALENDAR_SHOW_INLINE_NON_BASIS_MONTH_BREAKS_STORAGE_KEY);
        if (storedShowInlineNonBasisMonthBreaks === 'true' || storedShowInlineNonBasisMonthBreaks === 'false') {
            setShowInlineNonBasisMonthBreaks(storedShowInlineNonBasisMonthBreaks === 'true');
        }
        const storedYearFontScale = Number(window.localStorage.getItem(CALENDAR_YEAR_FONT_SCALE_STORAGE_KEY));
        if (Number.isFinite(storedYearFontScale)) {
            setYearFontScale(clampCalendarYearFontScale(storedYearFontScale));
        }

        const storedAgendaFontScale = Number(window.localStorage.getItem(CALENDAR_AGENDA_FONT_SCALE_STORAGE_KEY));
        const storedAgendaDisplay = normalizeAgendaDisplay({
            fontScale: Number.isFinite(storedAgendaFontScale) ? storedAgendaFontScale : undefined,
            showTags: window.localStorage.getItem(CALENDAR_AGENDA_SHOW_TAGS_STORAGE_KEY) !== 'false',
            showDescription: window.localStorage.getItem(CALENDAR_AGENDA_SHOW_DESCRIPTION_STORAGE_KEY) !== 'false',
            showLocation: window.localStorage.getItem(CALENDAR_AGENDA_SHOW_LOCATION_STORAGE_KEY) !== 'false',
            showMetadata: window.localStorage.getItem(CALENDAR_AGENDA_SHOW_METADATA_STORAGE_KEY) !== 'false',
        });
        setAgendaDisplay(storedAgendaDisplay);

        const storedDayHeight = window.localStorage.getItem(CALENDAR_DAY_HEIGHT_STORAGE_KEY);
        if (storedDayHeight) {
            const parsed = Number(storedDayHeight);
            if (Number.isFinite(parsed)) {
                setDayHeight(clampNumber(Math.round(parsed), CALENDAR_DAY_HEIGHT_MIN, CALENDAR_DAY_HEIGHT_MAX));
            }
        }
    }, [isCalendarRoute]);

    useEffect(() => {
        if (!isCalendarRoute) return;

        const onCalendarState = (event: Event) => {
            const detail = (event as CustomEvent<CalendarStateDetail>).detail;
            if (!detail) return;

            setDayHeight(clampNumber(Math.round(detail.dayHeight), CALENDAR_DAY_HEIGHT_MIN, CALENDAR_DAY_HEIGHT_MAX));
            setVisibleWeeks(clampNumber(Math.round(detail.visibleWeeks), CALENDAR_VISIBLE_WEEKS_MIN, CALENDAR_VISIBLE_WEEKS_MAX));
            setShowChores(Boolean(detail.showChores));
            setViewMode(detail.viewMode);
            setCurrentPeriodLabel(detail.currentPeriodLabel || null);
            setSearchState(normalizeSearchState(detail.search));
            setFilters(
                normalizeCalendarPersistentFilters({
                    ...(detail.filters || createDefaultCalendarPersistentFilters()),
                    dateRange: normalizeDateRange(detail.filters?.dateRange),
                    tagExpression:
                        detail.filters?.tagExpression ||
                        detail.tagFilter?.tagExpression ||
                        createFlatOrTagExpression(detail.tagFilter?.selectedTagIds || []),
                })
            );
            setAgendaDisplay(normalizeAgendaDisplay(detail.agendaDisplay));
            setDayVisibleDays(clampCalendarDayVisibleDays(detail.dayVisibleDays));
            setDayRowCount(clampCalendarDayRowCount(detail.dayRowCount));
            setDayHourHeight(clampCalendarDayHourHeight(detail.dayHourHeight));
            setDayVisibleHours(clampCalendarDayVisibleHours(detail.dayVisibleHours));
            setDayFontScale(clampCalendarDayFontScale(detail.dayFontScale));
            setYearMonthBasis(detail.yearMonthBasis);
            setShowGregorianCalendar(Boolean(detail.showGregorianCalendar));
            setShowBsCalendar(Boolean(detail.showBsCalendar));
            setShowInlineNonBasisMonthBreaks(Boolean(detail.showInlineNonBasisMonthBreaks));
            setYearFontScale(clampCalendarYearFontScale(detail.yearFontScale));

            if (detail.choreFilter) {
                setChoreFilterConfigured(Boolean(detail.choreFilter.configured));
                setSelectedChoreIds(
                    Array.from(
                        new Set(
                            (Array.isArray(detail.choreFilter.selectedChoreIds) ? detail.choreFilter.selectedChoreIds : [])
                                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                                .map((value) => value.trim())
                        )
                    )
                );
            }

            if (detail.memberFilter) {
                setEveryoneSelected(Boolean(detail.memberFilter.everyoneSelected));
                setSelectedMemberIds(
                    Array.from(
                        new Set(
                            (Array.isArray(detail.memberFilter.selectedMemberIds) ? detail.memberFilter.selectedMemberIds : [])
                                .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                                .map((value) => value.trim())
                        )
                    )
                );
            }
        };

        window.addEventListener(CALENDAR_STATE_EVENT, onCalendarState);
        dispatchCalendarCommand({ type: 'requestState' });
        return () => window.removeEventListener(CALENDAR_STATE_EVENT, onCalendarState);
    }, [isCalendarRoute]);

    useEffect(() => {
        if (!searchState.isOpen) return;
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
    }, [searchState.isOpen]);

    useEffect(() => {
        if (!isCalendarRoute) return;
        if (familyMemberIds.length === 0) return;

        const selectedSet = new Set(selectedMemberIds);
        const normalizedSelectedIds = familyMemberIds.filter((id) => selectedSet.has(id));
        const normalizedMatchesState =
            normalizedSelectedIds.length === selectedMemberIds.length &&
            normalizedSelectedIds.every((id, index) => id === selectedMemberIds[index]);

        if (!hasInitializedMemberFilterRef.current && everyoneSelected && normalizedSelectedIds.length === 0) {
            hasInitializedMemberFilterRef.current = true;
            setSelectedMemberIds(familyMemberIds);
            dispatchCalendarCommand({
                type: 'setMemberFilter',
                everyoneSelected: true,
                selectedMemberIds: familyMemberIds,
            });
            return;
        }

        hasInitializedMemberFilterRef.current = true;

        if (!normalizedMatchesState) {
            setSelectedMemberIds(normalizedSelectedIds);
            dispatchCalendarCommand({
                type: 'setMemberFilter',
                everyoneSelected,
                selectedMemberIds: normalizedSelectedIds,
            });
        }
    }, [everyoneSelected, familyMemberIds, isCalendarRoute, selectedMemberIds]);

    useEffect(() => {
        if (!showChores) {
            setIsChoreFilterExpanded(false);
        }
    }, [showChores]);

    useEffect(() => {
        if (!isCalendarRoute) return;
        if (filterOptionsQuery.isLoading) return;

        const allowedIds = new Set(tagIds);
        const allowedMemberIds = new Set(familyMemberIds);
        const sanitizedFilters = normalizeCalendarPersistentFilters({
            ...filters,
            tagExpression: normalizeCalendarTagExpression({
                anyOf: normalizedTagExpression.anyOf.map((group) => group.filter((tagId) => allowedIds.has(tagId))),
                exclude: normalizedTagExpression.exclude.filter((tagId) => allowedIds.has(tagId)),
            }),
            excludedMemberIds: filters.excludedMemberIds.filter((memberId) => allowedMemberIds.has(memberId)),
        });

        const currentSerialized = JSON.stringify(normalizeCalendarPersistentFilters(filters));
        const nextSerialized = JSON.stringify(sanitizedFilters);
        if (currentSerialized !== nextSerialized) {
            setFilters(sanitizedFilters);
            dispatchCalendarCommand({ type: 'setPersistentFilters', filters: sanitizedFilters });
        }
    }, [familyMemberIds, filterOptionsQuery.isLoading, filters, isCalendarRoute, normalizedTagExpression, tagIds]);

    useEffect(() => {
        if (!isCalendarRoute) return;
        if (!showChores) return;
        if (choreIds.length === 0) return;

        const selectedSet = new Set(selectedChoreIds);
        const normalizedSelectedIds = choreIds.filter((id) => selectedSet.has(id));
        const normalizedMatchesState =
            normalizedSelectedIds.length === selectedChoreIds.length &&
            normalizedSelectedIds.every((id, index) => id === selectedChoreIds[index]);

        if (!choreFilterConfigured && normalizedSelectedIds.length === 0) {
            setChoreFilterConfigured(true);
            setSelectedChoreIds(choreIds);
            dispatchCalendarCommand({
                type: 'setChoreFilter',
                selectedChoreIds: choreIds,
            });
            return;
        }

        if (choreFilterConfigured && !normalizedMatchesState) {
            setSelectedChoreIds(normalizedSelectedIds);
            dispatchCalendarCommand({
                type: 'setChoreFilter',
                selectedChoreIds: normalizedSelectedIds,
            });
        }
    }, [choreFilterConfigured, choreIds, isCalendarRoute, selectedChoreIds, showChores]);

    const applyMemberFilter = (nextEveryoneSelected: boolean, nextMemberIds: string[]) => {
        hasInitializedMemberFilterRef.current = true;
        const allowedIds = new Set(familyMemberIds);
        const dedupedMemberIds = Array.from(
            new Set(nextMemberIds.map((id) => String(id || '').trim()).filter((id) => id.length > 0 && allowedIds.has(id)))
        );
        setEveryoneSelected(nextEveryoneSelected);
        setSelectedMemberIds(dedupedMemberIds);
        dispatchCalendarCommand({
            type: 'setMemberFilter',
            everyoneSelected: nextEveryoneSelected,
            selectedMemberIds: dedupedMemberIds,
        });
    };

    const applyChoreFilter = (nextChoreIds: string[]) => {
        const allowedIds = new Set(choreIds);
        const dedupedChoreIds = Array.from(
            new Set(nextChoreIds.map((id) => String(id || '').trim()).filter((id) => id.length > 0 && allowedIds.has(id)))
        );
        setChoreFilterConfigured(true);
        setSelectedChoreIds(dedupedChoreIds);
        dispatchCalendarCommand({
            type: 'setChoreFilter',
            selectedChoreIds: dedupedChoreIds,
        });
    };

    const applySearchOpen = (isOpen: boolean) => {
        setSearchState((current) => ({ ...current, isOpen }));
        dispatchCalendarCommand({ type: 'setSearchOpen', isOpen });
    };

    const applySearchQuery = (query: string) => {
        setSearchState((current) => ({ ...current, query }));
        dispatchCalendarCommand({ type: 'setSearchQuery', query });
    };

    const updateFilters = (
        updater:
            | CalendarPersistentFilters
            | Partial<CalendarPersistentFilters>
            | ((current: CalendarPersistentFilters) => CalendarPersistentFilters | Partial<CalendarPersistentFilters>)
    ) => {
        const nextFilters = normalizeCalendarPersistentFilters(
            typeof updater === 'function' ? updater(filters) : { ...filters, ...updater }
        );
        setFilters(nextFilters);
        dispatchCalendarCommand({ type: 'setPersistentFilters', filters: nextFilters });
        return nextFilters;
    };

    const applyPersistentTextFilter = (textQuery: string) => {
        updateFilters((current) => ({ ...current, textQuery }));
    };

    const applyDateRange = (dateRange: CalendarFilterDateRange) => {
        const normalized = normalizeDateRange(dateRange);
        updateFilters((current) => ({ ...current, dateRange: normalized }));
    };

    const applyTagExpression = (tagExpression: CalendarTagExpression) => {
        const normalized = normalizeCalendarTagExpression(tagExpression);
        updateFilters((current) => ({ ...current, tagExpression: normalized }));
    };

    const applySavedSearchSelection = (nextSelectedIds: string[]) => {
        updateFilters((current) => ({ ...current, selectedSavedSearchIds: nextSelectedIds }));
    };

    const applyExcludedMemberIds = (nextExcludedMemberIds: string[]) => {
        updateFilters((current) => ({ ...current, excludedMemberIds: nextExcludedMemberIds }));
    };

    const applyExcludedSavedSearchIds = (nextExcludedSavedSearchIds: string[]) => {
        updateFilters((current) => ({ ...current, excludedSavedSearchIds: nextExcludedSavedSearchIds }));
    };

    const saveLiveSearchToFilters = (query: string) => {
        const trimmedQuery = query.trim();
        if (!trimmedQuery) return;

        updateFilters((current) => {
            const existing = current.savedSearches.find(
                (search) => String(search.query || '').trim().toLowerCase() === trimmedQuery.toLowerCase()
            );
            const savedSearchId = existing?.id || createSavedSearchFilterId();
            const nextSavedSearches = existing
                ? current.savedSearches
                : [
                      ...current.savedSearches,
                      {
                          id: savedSearchId,
                          query: trimmedQuery,
                          label: trimmedQuery,
                          createdAt: new Date().toISOString(),
                      } satisfies CalendarSavedSearchFilter,
                  ];

            return {
                ...current,
                savedSearches: nextSavedSearches,
                selectedSavedSearchIds: Array.from(new Set([...current.selectedSavedSearchIds, savedSearchId])),
            };
        });
    };

    const deleteSavedSearch = (searchId: string) => {
        updateFilters((current) => ({
            ...current,
            savedSearches: current.savedSearches.filter((search) => search.id !== searchId),
            selectedSavedSearchIds: current.selectedSavedSearchIds.filter((id) => id !== searchId),
            excludedSavedSearchIds: current.excludedSavedSearchIds.filter((id) => id !== searchId),
        }));
    };

    const clearAllFilters = () => {
        updateFilters(createDefaultCalendarPersistentFilters());
        setDraftTagGroupCount(1);
        setIsAdvancedFilterLogicOpen(false);
        applyMemberFilter(true, familyMemberIds);
        if (showChores) {
            applyChoreFilter(choreIds);
        }
    };

    const applyAgendaDisplay = (nextValue: Partial<CalendarAgendaDisplaySettings>) => {
        const merged = normalizeAgendaDisplay({ ...agendaDisplay, ...nextValue });
        setAgendaDisplay(merged);
        dispatchCalendarCommand({ type: 'setAgendaDisplay', agendaDisplay: merged });
    };

    const memberFilterSummary = useMemo(() => {
        const selectedIdSet = new Set(selectedMemberIds);
        const selectedNames = familyMembers
            .filter((member) => selectedIdSet.has(member.id))
            .map((member) => String(member.name || '').trim() || 'Unnamed member');
        const allMembersSelected =
            familyMemberIds.length === 0 || familyMemberIds.every((memberId) => selectedIdSet.has(memberId));

        if (everyoneSelected && allMembersSelected) {
            return 'Show all events';
        }
        if (!everyoneSelected) {
            if (selectedNames.length === 0) return 'Show no events';
            return `Show events pertaining to ${humanJoin(selectedNames)}`;
        }
        if (selectedNames.length === 0) {
            return "Show only events that don't pertain to any individual family members";
        }
        return `Show events that apply to everyone and pertain to ${humanJoin(selectedNames)}`;
    }, [everyoneSelected, familyMemberIds, familyMembers, selectedMemberIds]);

    const choreFilterSummary = useMemo(() => {
        if (chores.length === 0) return 'No chores available yet';
        if (!choreFilterConfigured) return 'All chores selected';
        if (selectedChoreIds.length === 0) return 'No chores selected';
        if (effectiveSelectedChoreIds.length === choreIds.length) return 'All chores selected';
        return `Showing ${effectiveSelectedChoreIds.length} of ${choreIds.length} chores`;
    }, [choreFilterConfigured, choreIds.length, chores.length, effectiveSelectedChoreIds.length, selectedChoreIds.length]);

    const tagFilterSummary = useMemo(
        () => summarizeTagExpression(normalizedTagExpression, tagNameById),
        [normalizedTagExpression, tagNameById]
    );
    const savedSearchSummary = useMemo(
        () => summarizeSavedSearchSelection(filters, searchLabelById),
        [filters, searchLabelById]
    );
    const advancedLogicSummary = useMemo(() => {
        const memberNameById = new Map(
            familyMembers.map((member) => [member.id, String(member.name || '').trim() || 'Unnamed member'])
        );
        const excludedMembers = filters.excludedMemberIds
            .map((memberId) => memberNameById.get(memberId))
            .filter((name): name is string => Boolean(name));
        const excludedSearches = filters.excludedSavedSearchIds
            .map((searchId) => searchLabelById.get(searchId))
            .filter((label): label is string => Boolean(label));
        const parts = [
            excludedMembers.length > 0 ? `Exclude ${humanJoin(excludedMembers)}` : '',
            excludedSearches.length > 0 ? `Exclude searches ${humanJoin(excludedSearches)}` : '',
            flattenCalendarTagExpressionIds(filters.tagExpression).length > 0 ? tagFilterSummary : '',
        ].filter(Boolean);
        return parts.length > 0 ? parts.join(' • ') : 'No advanced logic';
    }, [familyMembers, filters.excludedMemberIds, filters.excludedSavedSearchIds, filters.tagExpression, searchLabelById, tagFilterSummary]);

    const agendaDisplaySummary = useMemo(() => {
        const enabled = [
            agendaDisplay.showDescription ? 'description' : '',
            agendaDisplay.showLocation ? 'location' : '',
            agendaDisplay.showTags ? 'tags' : '',
            agendaDisplay.showMetadata ? 'metadata' : '',
        ].filter(Boolean);
        return enabled.length > 0 ? `Showing ${enabled.join(', ')}` : 'Minimal rows';
    }, [agendaDisplay]);

    const updateTagGroup = (groupIndex: number, tagId: string, checked: boolean | 'indeterminate') => {
        const normalized = normalizedTagExpression;
        const nextAnyOf = normalized.anyOf.map((group) => [...group]);
        if (!nextAnyOf[groupIndex]) {
            nextAnyOf[groupIndex] = [];
        }
        const withoutTarget = nextAnyOf[groupIndex].filter((value) => value !== tagId);
        nextAnyOf[groupIndex] = normalizeChecked(checked) ? [...withoutTarget, tagId] : withoutTarget;
        applyTagExpression({ ...normalized, anyOf: nextAnyOf.filter((group) => group.length > 0) });
    };

    const updateExcludeTag = (tagId: string, checked: boolean | 'indeterminate') => {
        const normalized = normalizedTagExpression;
        const withoutTarget = normalized.exclude.filter((value) => value !== tagId);
        applyTagExpression({
            ...normalized,
            exclude: normalizeChecked(checked) ? [...withoutTarget, tagId] : withoutTarget,
        });
    };

    if (!isCalendarRoute) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            {currentPeriodLabel?.visible ? (
                <div className="min-w-0 max-w-[min(44vw,18rem)] rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-right shadow-sm">
                    <div className="truncate text-sm font-semibold text-slate-900">{currentPeriodLabel.title}</div>
                    {currentPeriodLabel.subtitle ? (
                        <div className="truncate text-[11px] font-medium text-slate-500">{currentPeriodLabel.subtitle}</div>
                    ) : null}
                </div>
            ) : null}
            <Popover open={searchState.isOpen} onOpenChange={applySearchOpen}>
                <PopoverTrigger asChild>
                    <Button variant={searchState.isOpen ? 'default' : 'outline'} size="icon" aria-label="Search calendar">
                        <Search className="h-4 w-4" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[26rem]">
                    <div className="grid gap-4">
                        <div className="space-y-1">
                            <h4 className="text-sm font-semibold leading-none">Live search</h4>
                            <p className="text-xs text-muted-foreground">
                                Search titles, descriptions, locations, and tags. Results appear in the calendar rail or drawer.
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="calendar-search-query-input">Search query</Label>
                            <Input
                                id="calendar-search-query-input"
                                ref={searchInputRef}
                                value={searchState.query}
                                placeholder="Birthday, dentist, school pickup"
                                onChange={(event) => applySearchQuery(event.target.value)}
                            />
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => saveLiveSearchToFilters(searchState.query)}
                                    disabled={searchState.query.trim().length === 0}
                                >
                                    Add to filters
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => applySearchQuery('')}
                                    disabled={searchState.query.length === 0}
                                >
                                    Clear live query
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Adding a live query saves it as a reusable filter in the main filter panel.
                            </p>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <SlidersHorizontal className="h-4 w-4" />
                        Settings
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                    <div className="grid gap-4">
                        <div className="space-y-1">
                            <h4 className="text-sm font-semibold leading-none">Calendar settings</h4>
                            <p className="text-xs text-muted-foreground">Switch views and tune the display for the active calendar mode.</p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="calendar-view-mode-header">View</Label>
                            <select
                                id="calendar-view-mode-header"
                                value={viewMode}
                                onChange={(event) => {
                                    const rawValue = event.target.value;
                                    const next: CalendarViewMode =
                                        rawValue === 'year' ? 'year' : rawValue === 'day' ? 'day' : rawValue === 'agenda' ? 'agenda' : 'monthly';
                                    setViewMode(next);
                                    dispatchCalendarCommand({ type: 'setViewMode', viewMode: next });
                                }}
                                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                            >
                                <option value="monthly">Monthly</option>
                                <option value="day">Daily / Weekly</option>
                                <option value="agenda">Agenda</option>
                                <option value="year">Full year</option>
                            </select>
                        </div>

                        {viewMode === 'year' ? (
                            <div className="grid gap-4">
                                {showGregorianCalendar && showBsCalendar ? (
                                    <div className="grid gap-2">
                                        <Label htmlFor="calendar-year-month-basis-header">Year View Month Basis</Label>
                                        <select
                                            id="calendar-year-month-basis-header"
                                            value={yearMonthBasis}
                                            onChange={(event) => {
                                                const next = event.target.value === 'bs' ? 'bs' : 'gregorian';
                                                setYearMonthBasis(next);
                                                dispatchCalendarCommand({ type: 'setYearMonthBasis', yearMonthBasis: next });
                                            }}
                                            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                                        >
                                            <option value="gregorian">Gregorian months</option>
                                            <option value="bs">BS months</option>
                                        </select>
                                    </div>
                                ) : null}

                                <CalendarEventFontScaleControl
                                    id="calendar-year-font-scale-header"
                                    value={yearFontScale}
                                    onChange={(nextValue) => {
                                        const next = clampCalendarYearFontScale(nextValue);
                                        setYearFontScale(next);
                                        dispatchCalendarCommand({ type: 'setYearFontScale', yearFontScale: next });
                                    }}
                                    description="Year view auto-sizes the months to fit the display and uses this slider for event density."
                                />

                                <div className="grid gap-2">
                                    <span className="text-sm font-medium leading-none">Shift visible months</span>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 flex-1"
                                            onClick={() => dispatchCalendarCommand({ type: 'shiftYearView', direction: 'left' })}
                                        >
                                            Shift left
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 flex-1"
                                            onClick={() => dispatchCalendarCommand({ type: 'shiftYearView', direction: 'right' })}
                                        >
                                            Shift right
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : viewMode === 'day' ? (
                            <div className="grid gap-4">
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label htmlFor="calendar-day-visible-days-header">Visible Days</Label>
                                        <span className="text-xs text-muted-foreground">{dayVisibleDays}</span>
                                    </div>
                                    <input
                                        id="calendar-day-visible-days-header"
                                        type="range"
                                        min={CALENDAR_DAY_VIEW_VISIBLE_DAYS_MIN}
                                        max={CALENDAR_DAY_VIEW_VISIBLE_DAYS_MAX}
                                        step={1}
                                        value={dayVisibleDays}
                                        onChange={(event) => {
                                            const next = clampCalendarDayVisibleDays(Number(event.target.value));
                                            setDayVisibleDays(next);
                                            dispatchCalendarCommand({ type: 'setDayVisibleDays', dayVisibleDays: next });
                                        }}
                                    />
                                </div>

                                <label
                                    htmlFor="calendar-day-row-count-header"
                                    className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                                >
                                    <Checkbox
                                        id="calendar-day-row-count-header"
                                        checked={dayRowCount === 2}
                                        onCheckedChange={(checked) => {
                                            const next = normalizeChecked(checked) ? 2 : 1;
                                            setDayRowCount(next);
                                            dispatchCalendarCommand({ type: 'setDayRowCount', dayRowCount: next });
                                        }}
                                    />
                                    <div className="space-y-1">
                                        <span className="block text-sm font-medium">Second row of days</span>
                                        <span className="block text-xs text-muted-foreground">
                                            Show twice as many days by stacking a second row below the first.
                                        </span>
                                    </div>
                                </label>

                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label htmlFor="calendar-day-visible-hours-header">Hour Zoom</Label>
                                        <span className="text-xs text-muted-foreground">{dayVisibleHours}h visible</span>
                                    </div>
                                    <input
                                        id="calendar-day-visible-hours-header"
                                        type="range"
                                        min={CALENDAR_DAY_VIEW_VISIBLE_HOURS_MIN}
                                        max={CALENDAR_DAY_VIEW_VISIBLE_HOURS_MAX}
                                        step={1}
                                        value={CALENDAR_DAY_VIEW_VISIBLE_HOURS_MAX + CALENDAR_DAY_VIEW_VISIBLE_HOURS_MIN - dayVisibleHours}
                                        onChange={(event) => {
                                            const inverted = CALENDAR_DAY_VIEW_VISIBLE_HOURS_MAX + CALENDAR_DAY_VIEW_VISIBLE_HOURS_MIN - Number(event.target.value);
                                            const next = clampCalendarDayVisibleHours(inverted);
                                            setDayVisibleHours(next);
                                            dispatchCalendarCommand({ type: 'setDayVisibleHours', dayVisibleHours: next });
                                        }}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label htmlFor="calendar-day-font-scale-header">Event Font Size</Label>
                                        <span className="text-xs text-muted-foreground">{dayFontScale.toFixed(2)}x</span>
                                    </div>
                                    <input
                                        id="calendar-day-font-scale-header"
                                        type="range"
                                        min={CALENDAR_DAY_VIEW_FONT_SCALE_MIN}
                                        max={CALENDAR_DAY_VIEW_FONT_SCALE_MAX}
                                        step={0.01}
                                        value={dayFontScale}
                                        onChange={(event) => {
                                            const next = clampCalendarDayFontScale(Number(event.target.value));
                                            setDayFontScale(next);
                                            dispatchCalendarCommand({ type: 'setDayFontScale', dayFontScale: next });
                                        }}
                                    />
                                </div>
                            </div>
                        ) : viewMode === 'agenda' ? (
                            <div className="grid gap-4">
                                <div className="space-y-1">
                                    <h4 className="text-sm font-semibold leading-none">Agenda details</h4>
                                    <p className="text-xs text-muted-foreground">{agendaDisplaySummary}</p>
                                </div>

                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label htmlFor="calendar-agenda-font-scale-header">Text size</Label>
                                        <span className="text-xs text-muted-foreground">{agendaDisplay.fontScale.toFixed(2)}x</span>
                                    </div>
                                    <input
                                        id="calendar-agenda-font-scale-header"
                                        type="range"
                                        min={CALENDAR_AGENDA_FONT_SCALE_MIN}
                                        max={CALENDAR_AGENDA_FONT_SCALE_MAX}
                                        step={0.01}
                                        value={agendaDisplay.fontScale}
                                        onChange={(event) => applyAgendaDisplay({ fontScale: Number(event.target.value) })}
                                    />
                                </div>

                                {[
                                    {
                                        id: 'calendar-agenda-show-description-header',
                                        label: 'Show descriptions',
                                        checked: agendaDisplay.showDescription,
                                        field: 'showDescription' as const,
                                    },
                                    {
                                        id: 'calendar-agenda-show-location-header',
                                        label: 'Show locations',
                                        checked: agendaDisplay.showLocation,
                                        field: 'showLocation' as const,
                                    },
                                    {
                                        id: 'calendar-agenda-show-tags-header',
                                        label: 'Show tags',
                                        checked: agendaDisplay.showTags,
                                        field: 'showTags' as const,
                                    },
                                    {
                                        id: 'calendar-agenda-show-metadata-header',
                                        label: 'Show extra metadata',
                                        checked: agendaDisplay.showMetadata,
                                        field: 'showMetadata' as const,
                                    },
                                ].map(({ id, label, checked, field }) => (
                                    <label
                                        key={id}
                                        htmlFor={id}
                                        className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                                    >
                                        <Checkbox
                                            id={id}
                                            checked={checked}
                                            onCheckedChange={(nextChecked) =>
                                                applyAgendaDisplay({ [field]: normalizeChecked(nextChecked) } as Partial<CalendarAgendaDisplaySettings>)
                                            }
                                        />
                                        <span className="text-sm font-medium">{label}</span>
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <>
                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label htmlFor="calendar-day-height-header">Day height</Label>
                                        <span className="text-xs text-muted-foreground">{dayHeight}px</span>
                                    </div>
                                    <input
                                        id="calendar-day-height-header"
                                        type="range"
                                        min={CALENDAR_DAY_HEIGHT_MIN}
                                        max={CALENDAR_DAY_HEIGHT_MAX}
                                        step={2}
                                        value={dayHeight}
                                        onChange={(event) => {
                                            const next = clampNumber(Number(event.target.value), CALENDAR_DAY_HEIGHT_MIN, CALENDAR_DAY_HEIGHT_MAX);
                                            setDayHeight(next);
                                            dispatchCalendarCommand({ type: 'setDayHeight', dayHeight: next });
                                        }}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <Label htmlFor="calendar-weeks-visible-header">Weeks visible</Label>
                                        <span className="text-xs text-muted-foreground">{visibleWeeks}</span>
                                    </div>
                                    <input
                                        id="calendar-weeks-visible-header"
                                        type="range"
                                        min={CALENDAR_VISIBLE_WEEKS_MIN}
                                        max={CALENDAR_VISIBLE_WEEKS_MAX}
                                        step={1}
                                        value={visibleWeeks}
                                        onChange={(event) => {
                                            const next = clampNumber(Number(event.target.value), CALENDAR_VISIBLE_WEEKS_MIN, CALENDAR_VISIBLE_WEEKS_MAX);
                                            setVisibleWeeks(next);
                                            dispatchCalendarCommand({ type: 'setVisibleWeeks', visibleWeeks: next });
                                        }}
                                    />
                                </div>
                            </>
                        )}

                        <label
                            htmlFor="calendar-show-chores-header"
                            className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                        >
                            <Checkbox
                                id="calendar-show-chores-header"
                                checked={showChores}
                                onCheckedChange={(checked) => {
                                    const next = normalizeChecked(checked);
                                    setShowChores(next);
                                    dispatchCalendarCommand({ type: 'setShowChores', showChores: next });
                                }}
                            />
                            <div className="space-y-1">
                                <span className="block text-sm font-medium">Show chores on calendar</span>
                                <span className="block text-xs text-muted-foreground">
                                    Overlay due chores in a separate color and include them in agenda/search when visible.
                                </span>
                            </div>
                        </label>

                        <div className="grid gap-2 border-t border-slate-200 pt-3">
                            <span className="text-sm font-medium leading-none">Calendar labels</span>

                            <label
                                htmlFor="calendar-show-gregorian-header"
                                className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                            >
                                <Checkbox
                                    id="calendar-show-gregorian-header"
                                    checked={showGregorianCalendar}
                                    onCheckedChange={(checked) => {
                                        const next = normalizeChecked(checked);
                                        setShowGregorianCalendar(next);
                                        dispatchCalendarCommand({ type: 'setShowGregorianCalendar', showGregorianCalendar: next });
                                    }}
                                />
                                <span className="text-sm font-medium">Show Gregorian calendar</span>
                            </label>

                            <label
                                htmlFor="calendar-show-bs-header"
                                className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                            >
                                <Checkbox
                                    id="calendar-show-bs-header"
                                    checked={showBsCalendar}
                                    onCheckedChange={(checked) => {
                                        const next = normalizeChecked(checked);
                                        setShowBsCalendar(next);
                                        dispatchCalendarCommand({ type: 'setShowBsCalendar', showBsCalendar: next });
                                    }}
                                />
                                <span className="text-sm font-medium">Show BS calendar</span>
                            </label>

                            {showGregorianCalendar && showBsCalendar ? (
                                <label
                                    htmlFor="calendar-show-inline-non-basis-breaks-header"
                                    className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                                >
                                    <Checkbox
                                        id="calendar-show-inline-non-basis-breaks-header"
                                        checked={showInlineNonBasisMonthBreaks}
                                        onCheckedChange={(checked) => {
                                            const next = normalizeChecked(checked);
                                            setShowInlineNonBasisMonthBreaks(next);
                                            dispatchCalendarCommand({
                                                type: 'setShowInlineNonBasisMonthBreaks',
                                                showInlineNonBasisMonthBreaks: next,
                                            });
                                        }}
                                    />
                                    <div className="space-y-1">
                                        <span className="block text-sm font-medium">Show secondary month breaks inline</span>
                                        <span className="block text-xs text-muted-foreground">
                                            Keep the non-basis calendar transitions visible when both date systems are active.
                                        </span>
                                    </div>
                                </label>
                            ) : null}
                        </div>
                    </div>
                </PopoverContent>
            </Popover>

            <Popover>
                <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                        <Filter className="h-4 w-4" />
                        Filter
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[30rem] max-h-[80vh] overflow-hidden">
                    <div className="grid max-h-[calc(80vh-2rem)] gap-5 overflow-y-auto pr-1">
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <h4 className="text-sm font-semibold leading-none">Calendar filters</h4>
                                <p className="text-xs text-muted-foreground">Combine quick filters with saved searches and optional advanced logic.</p>
                            </div>
                            <Button type="button" variant="ghost" size="sm" onClick={clearAllFilters}>
                                Clear filters
                            </Button>
                        </div>

                        <div className="grid gap-2">
                            <div className="space-y-1">
                                <h4 className="text-sm font-semibold leading-none">Text filter</h4>
                                <p className="text-xs text-muted-foreground">
                                    Persistent text filtering hides non-matches in every calendar view.
                                </p>
                            </div>
                            <Input
                                aria-label="Persistent search filter"
                                value={filters.textQuery}
                                placeholder="Filter calendar by text"
                                onChange={(event) => applyPersistentTextFilter(event.target.value)}
                            />
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => applyPersistentTextFilter(searchState.query)}
                                    disabled={searchState.query.trim().length === 0}
                                >
                                    Use live search
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => applyPersistentTextFilter('')}
                                    disabled={filters.textQuery.length === 0}
                                >
                                    Clear
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-4 border-t border-slate-200 pt-4">
                            <div className="space-y-1">
                                <h4 className="text-sm font-semibold leading-none">Saved searches</h4>
                                <p className="text-xs text-muted-foreground">{savedSearchSummary}</p>
                            </div>

                            {filters.savedSearches.length === 0 ? (
                                <p className="text-xs text-muted-foreground">Save a live search to reuse it here as a filter.</p>
                            ) : (
                                <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
                                    {filters.savedSearches.map((search) => {
                                        const label = searchLabelById.get(search.id) || search.query || 'Untitled search';
                                        return (
                                            <div
                                                key={search.id}
                                                className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                                            >
                                                <label
                                                    htmlFor={`calendar-saved-search-${search.id}`}
                                                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                                                >
                                                    <Checkbox
                                                        id={`calendar-saved-search-${search.id}`}
                                                        checked={filters.selectedSavedSearchIds.includes(search.id)}
                                                        onCheckedChange={(checked) => {
                                                            const next = normalizeChecked(checked)
                                                                ? [...filters.selectedSavedSearchIds, search.id]
                                                                : filters.selectedSavedSearchIds.filter((id) => id !== search.id);
                                                            applySavedSearchSelection(next);
                                                        }}
                                                    />
                                                    <span className="truncate text-sm">{label}</span>
                                                </label>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 px-2"
                                                    aria-label={`Delete saved search ${label}`}
                                                    onClick={() => deleteSavedSearch(search.id)}
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="grid gap-2 border-t border-slate-200 pt-4">
                            <div className="space-y-1">
                                <h4 className="text-sm font-semibold leading-none">Date range</h4>
                                <p className="text-xs text-muted-foreground">{summarizeDateRange(filters.dateRange)}</p>
                            </div>
                            <select
                                aria-label="Date range mode"
                                value={filters.dateRange.mode}
                                onChange={(event) =>
                                    applyDateRange({
                                        ...filters.dateRange,
                                        mode: event.target.value as CalendarFilterDateRange['mode'],
                                    })
                                }
                                className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                            >
                                <option value="any">Any date</option>
                                <option value="before">Before or on</option>
                                <option value="after">After or on</option>
                                <option value="between">Between</option>
                            </select>

                            {(filters.dateRange.mode === 'after' || filters.dateRange.mode === 'between') ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="calendar-filter-date-start">Start date</Label>
                                    <Input
                                        id="calendar-filter-date-start"
                                        type="date"
                                        value={filters.dateRange.startDate}
                                        onChange={(event) =>
                                            applyDateRange({
                                                ...filters.dateRange,
                                                startDate: event.target.value,
                                            })
                                        }
                                    />
                                </div>
                            ) : null}

                            {(filters.dateRange.mode === 'before' || filters.dateRange.mode === 'between') ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="calendar-filter-date-end">End date</Label>
                                    <Input
                                        id="calendar-filter-date-end"
                                        type="date"
                                        value={filters.dateRange.endDate}
                                        onChange={(event) =>
                                            applyDateRange({
                                                ...filters.dateRange,
                                                endDate: event.target.value,
                                            })
                                        }
                                    />
                                </div>
                            ) : null}
                        </div>

                        <div className="space-y-4 border-t border-slate-200 pt-4">
                            <div className="space-y-1">
                                <h4 className="text-sm font-semibold leading-none">Member filter</h4>
                                <p className="text-xs text-muted-foreground">{memberFilterSummary}</p>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => applyMemberFilter(true, familyMemberIds)}>
                                    Select all
                                </Button>
                                <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => applyMemberFilter(false, [])}>
                                    Select none
                                </Button>
                            </div>

                            <label
                                htmlFor="calendar-filter-everyone"
                                className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                            >
                                <Checkbox
                                    id="calendar-filter-everyone"
                                    checked={everyoneSelected}
                                    onCheckedChange={(checked) => applyMemberFilter(normalizeChecked(checked), selectedMemberIds)}
                                />
                                <span className="text-sm font-medium">Everyone</span>
                            </label>

                            {filterOptionsQuery.isLoading ? (
                                <p className="text-xs text-muted-foreground">Loading family members...</p>
                            ) : filterOptionsQuery.error ? (
                                <p className="text-xs text-destructive">Could not load family members.</p>
                            ) : familyMembers.length === 0 ? (
                                <p className="text-xs text-muted-foreground">No family members available yet.</p>
                            ) : (
                                <div className="grid max-h-52 gap-2 overflow-y-auto pr-1">
                                    {familyMembers.map((member) => (
                                        <label
                                            key={member.id}
                                            htmlFor={`calendar-filter-member-${member.id}`}
                                            className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                                        >
                                            <Checkbox
                                                id={`calendar-filter-member-${member.id}`}
                                                checked={selectedMemberIds.includes(member.id)}
                                                onCheckedChange={(checked) => {
                                                    const next = normalizeChecked(checked)
                                                        ? [...selectedMemberIds, member.id]
                                                        : selectedMemberIds.filter((id) => id !== member.id);
                                                    applyMemberFilter(everyoneSelected, next);
                                                }}
                                            />
                                            <span className="text-sm">{member.name || 'Unnamed member'}</span>
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 border-t border-slate-200 pt-4">
                            <button
                                type="button"
                                className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left"
                                aria-expanded={isAdvancedFilterLogicOpen}
                                onClick={() => setIsAdvancedFilterLogicOpen((current) => !current)}
                            >
                                <div className="space-y-1">
                                    <span className="block text-sm font-medium">Advanced logic</span>
                                    <span className="block text-xs text-muted-foreground">{advancedLogicSummary}</span>
                                </div>
                                <span className="text-xs font-medium text-slate-600">{isAdvancedFilterLogicOpen ? 'Hide' : 'Show'}</span>
                            </button>

                            {isAdvancedFilterLogicOpen ? (
                                <div className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                                    <div className="grid gap-2">
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium text-slate-900">Exclude members</div>
                                            <div className="text-xs text-muted-foreground">Events linked to any checked member are filtered out.</div>
                                        </div>
                                        {familyMembers.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">No family members available yet.</p>
                                        ) : (
                                            <div className="grid max-h-40 gap-2 overflow-y-auto pr-1">
                                                {familyMembers.map((member) => (
                                                    <label
                                                        key={`calendar-filter-member-exclude-${member.id}`}
                                                        htmlFor={`calendar-filter-member-exclude-${member.id}`}
                                                        className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                                                    >
                                                        <Checkbox
                                                            id={`calendar-filter-member-exclude-${member.id}`}
                                                            checked={filters.excludedMemberIds.includes(member.id)}
                                                            onCheckedChange={(checked) => {
                                                                const next = normalizeChecked(checked)
                                                                    ? [...filters.excludedMemberIds, member.id]
                                                                    : filters.excludedMemberIds.filter((id) => id !== member.id);
                                                                applyExcludedMemberIds(next);
                                                            }}
                                                        />
                                                        <span className="text-sm">{member.name || 'Unnamed member'}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="grid gap-2 border-t border-slate-200 pt-4">
                                        <div className="space-y-1">
                                            <div className="text-sm font-medium text-slate-900">Exclude saved searches</div>
                                            <div className="text-xs text-muted-foreground">Hide anything that matches these saved search queries.</div>
                                        </div>
                                        {filters.savedSearches.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">No saved searches to exclude yet.</p>
                                        ) : (
                                            <div className="grid max-h-40 gap-2 overflow-y-auto pr-1">
                                                {filters.savedSearches.map((search) => {
                                                    const label = searchLabelById.get(search.id) || search.query || 'Untitled search';
                                                    return (
                                                        <label
                                                            key={`calendar-filter-search-exclude-${search.id}`}
                                                            htmlFor={`calendar-filter-search-exclude-${search.id}`}
                                                            className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                                                        >
                                                            <Checkbox
                                                                id={`calendar-filter-search-exclude-${search.id}`}
                                                                checked={filters.excludedSavedSearchIds.includes(search.id)}
                                                                onCheckedChange={(checked) => {
                                                                    const next = normalizeChecked(checked)
                                                                        ? [...filters.excludedSavedSearchIds, search.id]
                                                                        : filters.excludedSavedSearchIds.filter((id) => id !== search.id);
                                                                    applyExcludedSavedSearchIds(next);
                                                                }}
                                                            />
                                                            <span className="text-sm">{label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-4 border-t border-slate-200 pt-4">
                                        <div className="space-y-1">
                                            <h4 className="text-sm font-semibold leading-none">Tag logic</h4>
                                            <p className="text-xs text-muted-foreground">{tagFilterSummary}</p>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setDraftTagGroupCount((current) => current + 1)}
                                                disabled={tags.length === 0}
                                            >
                                                Add OR group
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => applyTagExpression(createEmptyCalendarTagExpression())}
                                                disabled={flattenCalendarTagExpressionIds(filters.tagExpression).length === 0}
                                            >
                                                Clear tag logic
                                            </Button>
                                        </div>

                                        {tags.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">No calendar tags have been created yet.</p>
                                        ) : (
                                            <>
                                                {Array.from({ length: renderedTagGroupCount }, (_unused, groupIndex) => normalizedTagExpression.anyOf[groupIndex] || []).map(
                                                    (group, groupIndex) => (
                                                        <div
                                                            key={`calendar-tag-group-${groupIndex}`}
                                                            data-testid={`calendar-tag-group-${groupIndex}`}
                                                            className="grid gap-2 rounded-md border border-slate-200 bg-white px-3 py-3"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div>
                                                                    <div className="text-sm font-medium text-slate-900">Match all tags in group {groupIndex + 1}</div>
                                                                    <div className="text-xs text-muted-foreground">Groups are ORed together.</div>
                                                                </div>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => {
                                                                        if (group.length > 0) {
                                                                            applyTagExpression({
                                                                                ...normalizedTagExpression,
                                                                                anyOf: normalizedTagExpression.anyOf.filter(
                                                                                    (_unused, index) => index !== groupIndex
                                                                                ),
                                                                            });
                                                                        }
                                                                        setDraftTagGroupCount((current) => Math.max(1, current - 1));
                                                                    }}
                                                                >
                                                                    Remove
                                                                </Button>
                                                            </div>
                                                            <div className="grid max-h-44 gap-2 overflow-y-auto pr-1">
                                                                {tags.map((tag) => (
                                                                    <label
                                                                        key={`${groupIndex}-${tag.id}`}
                                                                        htmlFor={`calendar-tag-group-${groupIndex}-${tag.id}`}
                                                                        className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                                                                    >
                                                                        <Checkbox
                                                                            id={`calendar-tag-group-${groupIndex}-${tag.id}`}
                                                                            checked={group.includes(tag.id)}
                                                                            onCheckedChange={(checked) => updateTagGroup(groupIndex, tag.id, checked)}
                                                                        />
                                                                        <span className="text-sm">{tag.name || 'Untitled tag'}</span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )
                                                )}

                                                <div className="grid gap-2 rounded-md border border-slate-200 bg-white px-3 py-3">
                                                    <div className="text-sm font-medium text-slate-900">Exclude tags</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        Excluded tags always remove an event even if an OR group matches.
                                                    </div>
                                                    <div className="grid max-h-44 gap-2 overflow-y-auto pr-1">
                                                        {tags.map((tag) => (
                                                            <label
                                                                key={`calendar-tag-exclude-${tag.id}`}
                                                                htmlFor={`calendar-tag-exclude-${tag.id}`}
                                                                className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                                                            >
                                                                <Checkbox
                                                                    id={`calendar-tag-exclude-${tag.id}`}
                                                                    checked={normalizedTagExpression.exclude.includes(tag.id)}
                                                                    onCheckedChange={(checked) => updateExcludeTag(tag.id, checked)}
                                                                />
                                                                <span className="text-sm">{tag.name || 'Untitled tag'}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {showChores ? (
                            <div className="grid gap-2 border-t border-slate-200 pt-4">
                                <button
                                    type="button"
                                    className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left"
                                    aria-expanded={isChoreFilterExpanded}
                                    onClick={() => setIsChoreFilterExpanded((previous) => !previous)}
                                >
                                    <div className="space-y-1">
                                        <span className="block text-sm font-medium">Specific chores</span>
                                        <span className="block text-xs text-muted-foreground">{choreFilterSummary}</span>
                                    </div>
                                    <span className="text-xs font-medium text-slate-600">{isChoreFilterExpanded ? 'Hide' : 'Show'}</span>
                                </button>

                                {isChoreFilterExpanded ? (
                                    <div data-testid="calendar-chore-filter-options" className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8"
                                                onClick={() => applyChoreFilter(choreIds)}
                                                disabled={choreIds.length === 0}
                                            >
                                                Select all
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-8"
                                                onClick={() => applyChoreFilter([])}
                                                disabled={choreIds.length === 0}
                                            >
                                                Select none
                                            </Button>
                                        </div>

                                        {filterOptionsQuery.isLoading ? (
                                            <p className="text-xs text-muted-foreground">Loading chores...</p>
                                        ) : filterOptionsQuery.error ? (
                                            <p className="text-xs text-destructive">Could not load chores.</p>
                                        ) : chores.length === 0 ? (
                                            <p className="text-xs text-muted-foreground">No chores available yet.</p>
                                        ) : (
                                            <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                                                {chores.map((chore) => (
                                                    <label
                                                        key={chore.id}
                                                        htmlFor={`calendar-filter-chore-${chore.id}`}
                                                        className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                                                    >
                                                        <Checkbox
                                                            id={`calendar-filter-chore-${chore.id}`}
                                                            checked={effectiveSelectedChoreIds.includes(chore.id)}
                                                            onCheckedChange={(checked) => {
                                                                const currentSelection = effectiveSelectedChoreIds;
                                                                const next = normalizeChecked(checked)
                                                                    ? [...currentSelection, chore.id]
                                                                    : currentSelection.filter((id) => id !== chore.id);
                                                                applyChoreFilter(next);
                                                            }}
                                                        />
                                                        <span className="text-sm">{chore.title || 'Untitled chore'}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </PopoverContent>
            </Popover>

            <Button variant="outline" size="sm" onClick={() => dispatchCalendarCommand({ type: 'scrollToday' })}>
                Today
            </Button>

            <Button variant="default" size="icon" aria-label="Add event" onClick={() => dispatchCalendarCommand({ type: 'quickAdd' })}>
                <Plus className="h-4 w-4" />
            </Button>
        </div>
    );
}
