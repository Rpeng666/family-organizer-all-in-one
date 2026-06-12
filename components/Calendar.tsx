'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styles from '../styles/Calendar.module.css';
import {
    addDays,
    addMilliseconds,
    addMonths,
    addWeeks,
    differenceInCalendarMonths,
    differenceInDays,
    endOfDay,
    endOfMonth,
    endOfWeek,
    format,
    parseISO,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import { id, tx } from '@instantdb/react';
import NepaliDate from 'nepali-date-converter';
import { RRule } from 'rrule';
import { type CalendarDraftSelection } from './AddEvent';
import CalendarAgendaView, { type CalendarAgendaFocusRequest } from './CalendarAgendaView';
import YearCalendarView from './YearCalendarView';
import MiniInfiniteCalendarView from './MiniInfiniteCalendarView';
import DayCalendarView, { DAY_VIEW_BUFFER_DAYS } from './DayCalendarView';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { type CalendarItem } from './DraggableCalendarEvent';
import { RecurrenceScopeDialog, type RecurrenceEditScope, type RecurrenceSeriesScopeMode } from './RecurrenceScopeDialog';
import { useOptionalAuth } from '@/components/AuthProvider';
import { buildCalendarHistoryMetadata, buildCalendarHistorySnapshot } from '@/lib/calendar-history';
import { db } from '@/lib/db';
import { useDashboardTheme } from '@/lib/freeform-dashboard/useDashboardTheme';
import { useActiveDashboardTheme } from '@/lib/freeform-dashboard/DashboardThemeContext';
import { getAssignedMembersForChoreOnDate, type Chore } from '@/lib/chore-utils';
import { cn } from '@/lib/utils';
import { buildHistoryEventTransactions } from '@/lib/history-events';
import {
    CALENDAR_COMMAND_EVENT,
    CALENDAR_AGENDA_FONT_SCALE_DEFAULT,
    CALENDAR_AGENDA_FONT_SCALE_STORAGE_KEY,
    CALENDAR_AGENDA_SHOW_DESCRIPTION_STORAGE_KEY,
    CALENDAR_AGENDA_SHOW_LOCATION_STORAGE_KEY,
    CALENDAR_AGENDA_SHOW_METADATA_STORAGE_KEY,
    CALENDAR_AGENDA_SHOW_TAGS_STORAGE_KEY,
    CALENDAR_DAY_HEIGHT_DEFAULT,
    CALENDAR_DAY_HEIGHT_MAX,
    CALENDAR_DAY_HEIGHT_MIN,
    CALENDAR_DAY_VIEW_FONT_SCALE_DEFAULT,
    CALENDAR_DAY_VIEW_FONT_SCALE_STORAGE_KEY,
    CALENDAR_DAY_VIEW_HOUR_HEIGHT_DEFAULT,
    CALENDAR_DAY_VIEW_HOUR_HEIGHT_STORAGE_KEY,
    CALENDAR_DAY_VIEW_VISIBLE_HOURS_DEFAULT,
    CALENDAR_DAY_VIEW_VISIBLE_HOURS_STORAGE_KEY,
    CALENDAR_DAY_VIEW_ROW_COUNT_DEFAULT,
    CALENDAR_DAY_VIEW_ROW_COUNT_STORAGE_KEY,
    CALENDAR_DAY_VIEW_VISIBLE_DAYS_DEFAULT,
    CALENDAR_DAY_VIEW_VISIBLE_DAYS_STORAGE_KEY,
    CALENDAR_DAY_HEIGHT_STORAGE_KEY,
    CALENDAR_PERSISTENT_FILTERS_STORAGE_KEY,
    CALENDAR_SHOW_BS_CALENDAR_STORAGE_KEY,
    CALENDAR_SHOW_GREGORIAN_CALENDAR_STORAGE_KEY,
    CALENDAR_SHOW_INLINE_NON_BASIS_MONTH_BREAKS_STORAGE_KEY,
    CALENDAR_MINI_VISIBLE_WEEKS,
    CALENDAR_SHOW_CHORES_STORAGE_KEY,
    CALENDAR_STATE_EVENT,
    CALENDAR_VISIBLE_WEEKS_MAX,
    CALENDAR_VISIBLE_WEEKS_MIN,
    CALENDAR_VIEW_MODE_STORAGE_KEY,
    CALENDAR_YEAR_FONT_SCALE_DEFAULT,
    CALENDAR_YEAR_FONT_SCALE_STORAGE_KEY,
    CALENDAR_YEAR_MONTH_BASIS_STORAGE_KEY,
    createDefaultCalendarAgendaDisplaySettings,
    createDefaultCalendarPersistentFilters,
    createEmptyCalendarDateRangeFilter,
    createEmptyCalendarTagExpression,
    type CalendarAgendaDisplaySettings,
    clampCalendarDayFontScale,
    clampCalendarDayHourHeight,
    clampCalendarDayVisibleHours,
    clampCalendarDayRowCount,
    clampCalendarDayVisibleDays,
    clampCalendarYearFontScale,
    type CalendarFilterDateRange,
    type CalendarLiveSearchState,
    type CalendarPersistentFilters,
    type CalendarViewMode,
    type CalendarYearMonthBasis,
    type CalendarCommandDetail,
    type CalendarTagExpression,
    type CalendarStateDetail,
} from '@/lib/calendar-controls';
import {
    buildCalendarAgendaSections,
    buildCalendarOccurrenceKey,
    calendarItemMatchesNonDatePersistentFilters,
    calendarItemMatchesPersistentFilters,
    calendarItemMatchesTextQuery,
    calendarItemOverlapsDateRange,
    createFlatOrTagExpression,
    flattenCalendarTagExpressionIds,
    getClosestCalendarHitMinute,
    getCalendarOccurrenceDateKey,
    isCalendarDateRangeFilterActive,
    normalizeCalendarPersistentFilters,
    normalizeCalendarSearchQuery,
    normalizeCalendarTagExpression,
} from '@/lib/calendar-search';
import {
    NEPALI_MONTHS_COMMON_DEVANAGARI,
    NEPALI_MONTHS_COMMON_ROMAN,
    toDevanagariDigits,
} from '@/lib/calendar-display';
import {
    buildYearCalendarMonthDescriptors,
    calculateYearCalendarLayout,
} from '@/lib/calendar-year-layout';
import { buildMemberColorMap } from '@/lib/family-member-colors';
import { buildRecurrenceLines, capRruleBeforeOccurrence, collectRecurrenceLineTokens, normalizeRecurrenceTokens, normalizeRruleString, normalizeStoredRecurrenceExceptionRows, partitionRecurrenceTokensByBoundary, shiftRecurrenceTokenByDays, shiftRecurrenceTokenByDuration, shiftRruleForSeriesMove, shiftStoredRecurrenceRowsByDays, splitDateTokens, splitRecurrenceRowsAtBoundary, parseRecurrenceDateToken, type StoredRecurrenceExceptionRow, type RecurrenceExceptionMode } from '@/lib/calendar-recurrence-utils';
import { applyResolvedMemberColorsToCalendarItems, getCalendarItemSelectionKey, mergeCalendarItemsWithOptimistic, optimisticItemSatisfiedByServer, resolveMemberColors, shouldHideImportedCalendarItem } from '@/lib/calendar-item-utils';
import { CalendarDialogs } from '@/components/calendar/CalendarDialogs';
import { CalendarMonthlyGrid } from '@/components/calendar/CalendarMonthlyGrid';

type CalendarVariant = 'default' | 'miniInfinite';

interface CalendarProps {
    currentDate?: Date;
    numWeeks?: number;
    displayBS?: boolean;
    variant?: CalendarVariant;
    className?: string;
    style?: React.CSSProperties;
    showGregorianDays?: boolean;
    showBsDays?: boolean;
    showChores?: boolean;
    everyoneSelected?: boolean;
    selectedMemberIds?: string[];
    selectedChoreIds?: string[];
    selectedTagIds?: string[];
    dayHeight?: number;
    eventFontScale?: number;
    commandBusEnabled?: boolean;
    viewMode?: CalendarViewMode;
    dayVisibleDays?: number;
    dayRowCount?: number;
    dayHourHeight?: number;
    dayFontScale?: number;
    dayBufferDays?: number;
}

interface MonthLabel {
    key: string;
    gregorianMonth: string;
    gregorianYear: string;
    nepaliMonth: string;
    nepaliYearDevanagari: string;
}

interface PendingScrollAdjust {
    prevScrollTop: number;
    prevScrollHeight: number;
    anchorSelector?: string | null;
    anchorOffset?: number | null;
}

type RecurrenceDragForcedScope = Exclude<RecurrenceEditScope, 'cancel'>;

interface DragRecurrenceIndicatorState {
    x: number;
    y: number;
    label: string;
    hotkeyLabel: string;
}

interface DayViewDragPreviewState {
    item: CalendarItem;
    startDate: string;
    endDate: string;
}

interface ActiveCalendarDragMetrics {
    pointerOffsetX: number;
    pointerOffsetY: number;
    width: number;
    height: number;
}

interface CalendarWeekSpanSegment {
    segmentKey: string;
    item: CalendarItem;
    startCol: number;
    endCol: number;
    continuesBefore: boolean;
    continuesAfter: boolean;
}

interface CalendarMemberWithColor {
    id?: string | null;
    name?: string | null;
    color?: string | null;
}

interface CalendarRangeWindow {
    start: Date;
    end: Date;
}

interface ClientRectLike {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

const WEEK_STARTS_ON = 0;
const WEEKS_PER_LOAD = 8;
const SUPPLEMENTAL_WINDOW_MONTHS = 4;
const MONTH_MEMORY_CAP = 240;
const MEMORY_CAP_WEEKS = Math.round((MONTH_MEMORY_CAP * 365.2425) / 12 / 7);
const EDGE_TRIGGER_PX = 220;
const EDGE_LOAD_COOLDOWN_MS = 220;

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const intersectClientRects = (source: ClientRectLike, clip: ClientRectLike): ClientRectLike | null => {
    const left = Math.max(source.left, clip.left);
    const right = Math.min(source.right, clip.right);
    const top = Math.max(source.top, clip.top);
    const bottom = Math.min(source.bottom, clip.bottom);
    const width = right - left;
    const height = bottom - top;

    if (width <= 0 || height <= 0) {
        return null;
    }

    return {
        left,
        right,
        top,
        bottom,
        width,
        height,
    };
};

const createRollingWindow = (anchorDate: Date, options?: { includePast?: boolean }) => ({
    start: startOfWeek(addMonths(anchorDate, options?.includePast === false ? 0 : -SUPPLEMENTAL_WINDOW_MONTHS), { weekStartsOn: WEEK_STARTS_ON }),
    end: endOfWeek(addMonths(anchorDate, SUPPLEMENTAL_WINDOW_MONTHS), { weekStartsOn: WEEK_STARTS_ON }),
});

const buildMonthConditionsForWindows = (windows: CalendarRangeWindow[]) => {
    const monthsByYear = new Map<number, number[]>();

    for (const windowRange of windows) {
        const bufferedStart = startOfMonth(addMonths(windowRange.start, -1));
        const bufferedEnd = endOfMonth(addMonths(windowRange.end, 1));
        let monthCursor = new Date(bufferedStart);

        while (monthCursor.getTime() <= bufferedEnd.getTime()) {
            const year = monthCursor.getFullYear();
            const month = monthCursor.getMonth() + 1;
            const existing = monthsByYear.get(year) || [];
            if (!existing.includes(month)) {
                existing.push(month);
                monthsByYear.set(year, existing);
            }
            monthCursor = addMonths(monthCursor, 1);
        }
    }

    return Array.from(monthsByYear.entries()).map(([year, months]) => ({
        year,
        month: { $in: months.sort((left, right) => left - right) },
    }));
};

const buildRecurrenceMonthConditionsForWindows = (windows: CalendarRangeWindow[]) => {
    const conditions: Array<{ recurrenceId: { $like: string } }> = [];
    const seenPatterns = new Set<string>();

    for (const windowRange of windows) {
        const bufferedStart = startOfMonth(addMonths(windowRange.start, -1));
        const bufferedEnd = endOfMonth(addMonths(windowRange.end, 1));
        let monthCursor = new Date(bufferedStart);

        while (monthCursor.getTime() <= bufferedEnd.getTime()) {
            const patterns = [`${format(monthCursor, 'yyyy-MM')}%`, `${format(monthCursor, 'yyyyMM')}%`];
            for (const pattern of patterns) {
                if (seenPatterns.has(pattern)) continue;
                seenPatterns.add(pattern);
                conditions.push({ recurrenceId: { $like: pattern } });
            }
            monthCursor = addMonths(monthCursor, 1);
        }
    }

    return conditions;
};

const getCalendarItemStartTime = (item: CalendarItem) => {
    const parsed = parseISO(item.startDate);
    return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
};

const getCalendarItemEndTime = (item: CalendarItem) => {
    const parsed = parseISO(item.endDate);
    return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
};

const getCalendarItemDisplayPriority = (item: CalendarItem) => {
    const isChore = item.calendarItemKind === 'chore';
    const isAllDay = item.isAllDay;

    if (!isChore && isAllDay) return 0;
    if (!isChore) return 1;
    if (isAllDay) return 2;
    return 3;
};

const compareCalendarItemsByStartTime = (left: CalendarItem, right: CalendarItem) => {
    const priorityDiff = getCalendarItemDisplayPriority(left) - getCalendarItemDisplayPriority(right);
    if (priorityDiff !== 0) return priorityDiff;

    const startDiff = getCalendarItemStartTime(left) - getCalendarItemStartTime(right);
    if (startDiff !== 0) return startDiff;

    const endDiff = getCalendarItemEndTime(left) - getCalendarItemEndTime(right);
    if (endDiff !== 0) return endDiff;

    return String(left.title || '').localeCompare(String(right.title || ''));
};

const getUtcDateFromDateKey = (dateKey: string) => {
    const parsed = new Date(`${dateKey}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDayDate = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const toDayStart = (value: Date) => parseISO(`${format(value, 'yyyy-MM-dd')}T00:00:00`);

const getInclusiveEndDayStart = (exclusiveEnd: Date) => {
    const inclusiveEnd = new Date(exclusiveEnd.getTime() - 1);
    return toDayStart(inclusiveEnd);
};

const assignWeekSpanLanes = (segments: CalendarWeekSpanSegment[]) => {
    const sortedSegments = [...segments].sort((left, right) => {
        const startDiff = left.startCol - right.startCol;
        if (startDiff !== 0) return startDiff;

        const widthDiff = right.endCol - left.endCol;
        if (widthDiff !== 0) return widthDiff;

        return compareCalendarItemsByStartTime(left.item, right.item);
    });

    const laneEndColumns: number[] = [];
    const lanes: CalendarWeekSpanSegment[][] = [];
    for (const segment of sortedSegments) {
        let laneIndex = 0;
        while (laneIndex < laneEndColumns.length && laneEndColumns[laneIndex] >= segment.startCol) {
            laneIndex += 1;
        }

        laneEndColumns[laneIndex] = segment.endCol;
        if (!lanes[laneIndex]) {
            lanes[laneIndex] = [];
        }
        lanes[laneIndex].push(segment);
    }

    return lanes;
};

const getRecurringSeriesLinkKeys = (masterEvent: CalendarItem | null | undefined) => {
    const keys: string[] = [];
    const pushKey = (value: unknown) => {
        const next = String(value || '').trim();
        if (!next || keys.includes(next)) return;
        keys.push(next);
    };

    pushKey(masterEvent?.id);
    pushKey((masterEvent as any)?.sourceExternalId);

    return keys;
};

const isRecurringChildOfMaster = (item: CalendarItem | null | undefined, masterEvent: CalendarItem | null | undefined) => {
    const parentId = String(item?.recurringEventId || '').trim();
    if (!parentId) return false;
    return getRecurringSeriesLinkKeys(masterEvent).includes(parentId);
};

const Calendar = ({
    currentDate = new Date(),
    numWeeks = 5,
    displayBS = true,
    variant = 'default',
    className,
    style,
    showGregorianDays,
    showBsDays,
    showChores: controlledShowChores,
    everyoneSelected: controlledEveryoneSelected,
    selectedMemberIds: controlledSelectedMemberIds,
    selectedChoreIds: controlledSelectedChoreIds,
    selectedTagIds: controlledSelectedTagIds,
    dayHeight: controlledDayHeight,
    eventFontScale: controlledEventFontScale,
    commandBusEnabled,
    viewMode: controlledViewMode,
    dayVisibleDays: controlledDayVisibleDays,
    dayRowCount: controlledDayRowCount,
    dayHourHeight: controlledDayHourHeight,
    dayFontScale: controlledDayFontScale,
    dayBufferDays: controlledDayBufferDays,
}: CalendarProps) => {
    // TODO: add displayInNepali = false, displayInRoman = true, can both be true and it will show them both
    // add displayOfficialNepaliMonthNames = false, when false will give the short month names everybody uses
    // and displayMonthNumber = false, to display the month number as well as the name.
    const currentUser = useOptionalAuth()?.currentUser || null;
    const { theme: dashboardTheme } = useDashboardTheme();
    const { setActiveTheme } = useActiveDashboardTheme();

    // Broadcast theme to layout shell (navbar) while calendar is mounted
    useEffect(() => {
        setActiveTheme(dashboardTheme);
        return () => setActiveTheme(null);
    }, [dashboardTheme, setActiveTheme]);

    const themeClass = `fd-${dashboardTheme}`;
    const isMiniInfinite = variant === 'miniInfinite';
    const commandsEnabled = commandBusEnabled ?? !isMiniInfinite;
    const effectiveCurrentDate = useMemo(
        () => new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()),
        [currentDate]
    );
    const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([]);
    const [optimisticItemsById, setOptimisticItemsById] = useState<Record<string, Partial<CalendarItem> & { id: string }>>({});
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CalendarItem | null>(null);
    const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [eventDetailOpen, setEventDetailOpen] = useState(false);
    const [choreDetailChoreId, setChoreDetailChoreId] = useState<string | null>(null);
    const [choreDetailDate, setChoreDetailDate] = useState<Date | null>(null);
    const [initialDraftSelection, setInitialDraftSelection] = useState<CalendarDraftSelection | null>(null);
    const [everyoneSelected, setEveryoneSelected] = useState(true);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [memberFilterConfigured, setMemberFilterConfigured] = useState(false);
    const [recurrenceScopeDialogOpen, setRecurrenceScopeDialogOpen] = useState(false);
    const [recurrenceScopeDialogAction, setRecurrenceScopeDialogAction] = useState<'edit' | 'drag' | 'delete'>('drag');
    const [recurrenceScopeDialogMode, setRecurrenceScopeDialogMode] = useState<RecurrenceSeriesScopeMode>('following');
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [dragRecurrenceIndicator, setDragRecurrenceIndicator] = useState<DragRecurrenceIndicatorState | null>(null);
    const [showChores, setShowChores] = useState<boolean>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return false;
        }

        return window.localStorage.getItem(CALENDAR_SHOW_CHORES_STORAGE_KEY) === 'true';
    });
    const [searchState, setSearchState] = useState<CalendarLiveSearchState>({ isOpen: false, query: '' });
    const [persistentFilters, setPersistentFilters] = useState<CalendarPersistentFilters>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return createDefaultCalendarPersistentFilters();
        }

        const stored = window.localStorage.getItem(CALENDAR_PERSISTENT_FILTERS_STORAGE_KEY);
        if (!stored) {
            return createDefaultCalendarPersistentFilters();
        }

        try {
            return normalizeCalendarPersistentFilters(JSON.parse(stored));
        } catch {
            return createDefaultCalendarPersistentFilters();
        }
    });
    const [viewMode, setViewMode] = useState<CalendarViewMode>(() => {
        if (controlledViewMode) {
            return controlledViewMode;
        }

        if (typeof window === 'undefined' || isMiniInfinite) {
            return 'monthly';
        }

        const stored = window.localStorage.getItem(CALENDAR_VIEW_MODE_STORAGE_KEY);
        return stored === 'year' || stored === 'day' || stored === 'agenda' ? stored : 'monthly';
    });

    const appendCalendarHistoryTransactions = useCallback(
        (
            txOps: any[],
            input: {
                occurredAt: string;
                actionType: string;
                summary: string;
                calendarItemId?: string | null;
                affectedMemberIds?: Iterable<string>;
                title?: string | null;
                beforeSnapshot?: ReturnType<typeof buildCalendarHistorySnapshot>;
                afterSnapshot?: ReturnType<typeof buildCalendarHistorySnapshot>;
                metadata?: Record<string, unknown>;
            }
        ) => {
            if (!currentUser?.id) return txOps;

            const affectedFamilyMemberIds = Array.from(new Set(Array.from(input.affectedMemberIds || []).filter(Boolean)));
            const historyEvent = buildHistoryEventTransactions({
                tx,
                createId: id,
                occurredAt: input.occurredAt,
                domain: 'calendar',
                actionType: input.actionType,
                summary: input.summary,
                source: 'manual',
                actorFamilyMemberId: currentUser.id,
                affectedFamilyMemberIds,
                calendarItemId: input.calendarItemId || null,
                metadata: buildCalendarHistoryMetadata({
                    title: input.title || null,
                    before: input.beforeSnapshot || null,
                    after: input.afterSnapshot || null,
                    extra: input.metadata || null,
                }),
            });

            return [...txOps, ...historyEvent.transactions];
        },
        [currentUser?.id]
    );
    const [dayVisibleDays, setDayVisibleDays] = useState<number>(() => {
        if (typeof controlledDayVisibleDays === 'number') {
            return clampCalendarDayVisibleDays(controlledDayVisibleDays);
        }

        if (typeof window === 'undefined' || !commandsEnabled) {
            return CALENDAR_DAY_VIEW_VISIBLE_DAYS_DEFAULT;
        }

        const stored = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_VISIBLE_DAYS_STORAGE_KEY));
        return Number.isFinite(stored) ? clampCalendarDayVisibleDays(stored) : CALENDAR_DAY_VIEW_VISIBLE_DAYS_DEFAULT;
    });
    const [dayRowCount, setDayRowCount] = useState<number>(() => {
        if (typeof controlledDayRowCount === 'number') {
            return clampCalendarDayRowCount(controlledDayRowCount);
        }

        if (typeof window === 'undefined' || !commandsEnabled) {
            return CALENDAR_DAY_VIEW_ROW_COUNT_DEFAULT;
        }

        const stored = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_ROW_COUNT_STORAGE_KEY));
        return Number.isFinite(stored) ? clampCalendarDayRowCount(stored) : CALENDAR_DAY_VIEW_ROW_COUNT_DEFAULT;
    });
    const [dayHourHeight, setDayHourHeight] = useState<number>(() => {
        if (typeof controlledDayHourHeight === 'number') {
            return clampCalendarDayHourHeight(controlledDayHourHeight);
        }

        if (typeof window === 'undefined' || !commandsEnabled) {
            return CALENDAR_DAY_VIEW_HOUR_HEIGHT_DEFAULT;
        }

        const stored = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_HOUR_HEIGHT_STORAGE_KEY));
        return Number.isFinite(stored) ? clampCalendarDayHourHeight(stored) : CALENDAR_DAY_VIEW_HOUR_HEIGHT_DEFAULT;
    });
    const [dayVisibleHours, setDayVisibleHours] = useState<number>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return CALENDAR_DAY_VIEW_VISIBLE_HOURS_DEFAULT;
        }

        const stored = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_VISIBLE_HOURS_STORAGE_KEY));
        return Number.isFinite(stored) ? clampCalendarDayVisibleHours(stored) : CALENDAR_DAY_VIEW_VISIBLE_HOURS_DEFAULT;
    });
    const useVisibleHoursMode = typeof controlledDayHourHeight !== 'number';
    const [dayFontScale, setDayFontScale] = useState<number>(() => {
        if (typeof controlledDayFontScale === 'number') {
            return clampCalendarDayFontScale(controlledDayFontScale);
        }

        if (typeof window === 'undefined' || !commandsEnabled) {
            return CALENDAR_DAY_VIEW_FONT_SCALE_DEFAULT;
        }

        const stored = Number(window.localStorage.getItem(CALENDAR_DAY_VIEW_FONT_SCALE_STORAGE_KEY));
        return Number.isFinite(stored) ? clampCalendarDayFontScale(stored) : CALENDAR_DAY_VIEW_FONT_SCALE_DEFAULT;
    });
    const [yearMonthBasis, setYearMonthBasis] = useState<CalendarYearMonthBasis>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return 'gregorian';
        }

        const stored = window.localStorage.getItem(CALENDAR_YEAR_MONTH_BASIS_STORAGE_KEY);
        return stored === 'bs' ? 'bs' : 'gregorian';
    });
    const [yearFontScale, setYearFontScale] = useState<number>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return CALENDAR_YEAR_FONT_SCALE_DEFAULT;
        }

        const stored = Number(window.localStorage.getItem(CALENDAR_YEAR_FONT_SCALE_STORAGE_KEY));
        return Number.isFinite(stored) ? clampCalendarYearFontScale(stored) : CALENDAR_YEAR_FONT_SCALE_DEFAULT;
    });
    const [agendaDisplay, setAgendaDisplay] = useState<CalendarAgendaDisplaySettings>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return createDefaultCalendarAgendaDisplaySettings();
        }

        const defaults = createDefaultCalendarAgendaDisplaySettings();
        const storedFontScale = Number(window.localStorage.getItem(CALENDAR_AGENDA_FONT_SCALE_STORAGE_KEY));
        return {
            fontScale: Number.isFinite(storedFontScale) ? storedFontScale : defaults.fontScale,
            showTags: window.localStorage.getItem(CALENDAR_AGENDA_SHOW_TAGS_STORAGE_KEY) !== 'false',
            showDescription: window.localStorage.getItem(CALENDAR_AGENDA_SHOW_DESCRIPTION_STORAGE_KEY) !== 'false',
            showLocation: window.localStorage.getItem(CALENDAR_AGENDA_SHOW_LOCATION_STORAGE_KEY) !== 'false',
            showMetadata: window.localStorage.getItem(CALENDAR_AGENDA_SHOW_METADATA_STORAGE_KEY) !== 'false',
        };
    });
    const [showGregorianCalendar, setShowGregorianCalendar] = useState<boolean>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return true;
        }

        const stored = window.localStorage.getItem(CALENDAR_SHOW_GREGORIAN_CALENDAR_STORAGE_KEY);
        if (stored === 'false') return false;
        if (stored === 'true') return true;
        return true;
    });
    const [showBsCalendar, setShowBsCalendar] = useState<boolean>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return Boolean(displayBS);
        }

        const stored = window.localStorage.getItem(CALENDAR_SHOW_BS_CALENDAR_STORAGE_KEY);
        if (stored === 'false') return false;
        if (stored === 'true') return true;
        return Boolean(displayBS);
    });
    const [showInlineNonBasisMonthBreaks, setShowInlineNonBasisMonthBreaks] = useState<boolean>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return true;
        }

        const stored = window.localStorage.getItem(CALENDAR_SHOW_INLINE_NON_BASIS_MONTH_BREAKS_STORAGE_KEY);
        if (stored === 'false') return false;
        if (stored === 'true') return true;
        return true;
    });
    const [selectedChoreIds, setSelectedChoreIds] = useState<string[]>([]);
    const [choreFilterConfigured, setChoreFilterConfigured] = useState(false);
    const [dayCellHeight, setDayCellHeight] = useState<number>(() => {
        if (typeof window === 'undefined' || !commandsEnabled) {
            return CALENDAR_DAY_HEIGHT_DEFAULT;
        }

        const stored = window.localStorage.getItem(CALENDAR_DAY_HEIGHT_STORAGE_KEY);
        if (!stored) {
            return CALENDAR_DAY_HEIGHT_DEFAULT;
        }

        const parsed = Number(stored);
        if (!Number.isFinite(parsed)) {
            return CALENDAR_DAY_HEIGHT_DEFAULT;
        }

        return clampNumber(Math.round(parsed), CALENDAR_DAY_HEIGHT_MIN, CALENDAR_DAY_HEIGHT_MAX);
    });
    const [dayAnchorDate, setDayAnchorDate] = useState<Date>(() => effectiveCurrentDate);
    const [dayViewVerticalResetKey, setDayViewVerticalResetKey] = useState(0);
    const [dayViewScrollRequest, setDayViewScrollRequest] = useState<{ nonce: number; dateKey: string; minute: number | null } | null>(null);

    useEffect(() => {
        if (!controlledViewMode) return;
        setViewMode(controlledViewMode);
    }, [controlledViewMode]);

    useEffect(() => {
        if (typeof controlledDayVisibleDays !== 'number') return;
        setDayVisibleDays(clampCalendarDayVisibleDays(controlledDayVisibleDays));
    }, [controlledDayVisibleDays]);

    useEffect(() => {
        if (typeof controlledDayRowCount !== 'number') return;
        setDayRowCount(clampCalendarDayRowCount(controlledDayRowCount));
    }, [controlledDayRowCount]);

    useEffect(() => {
        if (typeof controlledDayHourHeight !== 'number') return;
        setDayHourHeight(clampCalendarDayHourHeight(controlledDayHourHeight));
    }, [controlledDayHourHeight]);

    useEffect(() => {
        if (typeof controlledDayFontScale !== 'number') return;
        setDayFontScale(clampCalendarDayFontScale(controlledDayFontScale));
    }, [controlledDayFontScale]);
    const [dayViewDragPreview, setDayViewDragPreview] = useState<DayViewDragPreviewState | null>(null);
    const [agendaWindow, setAgendaWindow] = useState<CalendarRangeWindow>(() => {
        const today = new Date();
        return createRollingWindow(new Date(today.getFullYear(), today.getMonth(), today.getDate()), { includePast: false });
    });
    const [searchWindow, setSearchWindow] = useState<CalendarRangeWindow>(() => createRollingWindow(effectiveCurrentDate));
    const [agendaFocusRequest, setAgendaFocusRequest] = useState<CalendarAgendaFocusRequest | null>(null);
    const [searchRailSupported, setSearchRailSupported] = useState(true);

    const initialWeeksPerSide = Math.max(6, numWeeks);
    const [rangeStart, setRangeStart] = useState<Date>(() =>
        startOfWeek(addWeeks(effectiveCurrentDate, -initialWeeksPerSide), { weekStartsOn: WEEK_STARTS_ON })
    );
    const [rangeEnd, setRangeEnd] = useState<Date>(() =>
        endOfWeek(addWeeks(effectiveCurrentDate, initialWeeksPerSide), { weekStartsOn: WEEK_STARTS_ON })
    );
    const [yearViewportStartOffset, setYearViewportStartOffset] = useState(0);
    const [yearRangeStartOffset, setYearRangeStartOffset] = useState(-12);
    const [yearRangeEndOffset, setYearRangeEndOffset] = useState(23);
    const [scrollContainerHeight, setScrollContainerHeight] = useState<number | null>(null);
    const [scrollContainerWidth, setScrollContainerWidth] = useState<number | null>(null);
    const [yearShiftAnimation, setYearShiftAnimation] = useState<{ key: number; direction: 'left' | 'right' } | null>(null);
    const [dayNumberStickyTop, setDayNumberStickyTop] = useState(0);
    const [activeMonthLabel, setActiveMonthLabel] = useState<MonthLabel>(() => {
        // @ts-ignore - package has no strict Date typing
        const nepaliDate = new NepaliDate(effectiveCurrentDate);
        const nepaliMonth = nepaliDate.getMonth();
        const nepaliYear = String(nepaliDate.getYear());
        return {
            key: `${format(effectiveCurrentDate, 'yyyy-MM')}-${nepaliDate.getYear()}-${nepaliMonth}`,
            gregorianMonth: format(effectiveCurrentDate, 'MMMM'),
            gregorianYear: format(effectiveCurrentDate, 'yyyy'),
            nepaliMonth: `${NEPALI_MONTHS_COMMON_DEVANAGARI[nepaliMonth]} (${NEPALI_MONTHS_COMMON_ROMAN[nepaliMonth]})`,
            nepaliYearDevanagari: toDevanagariDigits(nepaliYear),
        };
    });

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLTableSectionElement>(null);
    const pendingTopScrollAdjustRef = useRef<PendingScrollAdjust | null>(null);
    const activeDragMetricsRef = useRef<ActiveCalendarDragMetrics | null>(null);
    const expandLockRef = useRef(false);
    const monthLabelRef = useRef<MonthLabel>(activeMonthLabel);
    const scrollRafRef = useRef<number | null>(null);
    const lastScrollTopRef = useRef<number | null>(null);
    const lastTopLoadAtRef = useRef(0);
    const lastBottomLoadAtRef = useRef(0);
    const yearShiftLockRef = useRef(false);
    const yearShiftAnimationKeyRef = useRef(0);
    // const lastTopTriggerScrollTopRef = useRef<number>(Number.POSITIVE_INFINITY);
    // const lastBottomTriggerScrollTopRef = useRef<number>(Number.NEGATIVE_INFINITY);
    const initialCurrentDateStrRef = useRef(
        format(effectiveCurrentDate, 'yyyy-MM-dd')
    );
    const pendingScrollToDateRef = useRef<string | null>(initialCurrentDateStrRef.current);
    const pendingScrollBehaviorRef = useRef<ScrollBehavior>('auto');
    const pendingYearScrollToMonthOffsetRef = useRef<number | null>(0);
    const recurrenceScopeResolverRef = useRef<((scope: RecurrenceEditScope) => void) | null>(null);

    const sanitizeControlledIds = useCallback(
        (value: string[] | undefined) =>
            Array.from(
                new Set(
                    (Array.isArray(value) ? value : [])
                        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
                        .map((entry) => entry.trim())
                )
            ),
        []
    );

    const showBsCalendarSetting = Boolean(showBsDays ?? showBsCalendar);
    const showGregorianCalendarSetting = typeof showGregorianDays === 'boolean' ? showGregorianDays : showGregorianCalendar;
    const effectiveShowBsCalendar = showBsCalendarSetting;
    const effectiveShowGregorianCalendar = Boolean(showGregorianCalendarSetting || !effectiveShowBsCalendar);
    const effectiveShowBothCalendars = effectiveShowGregorianCalendar && effectiveShowBsCalendar;
    const effectiveShowInlineNonBasisMonthBreaks = effectiveShowBothCalendars && showInlineNonBasisMonthBreaks;
    const effectiveYearMonthBasis = effectiveShowBothCalendars ? yearMonthBasis : effectiveShowBsCalendar ? 'bs' : 'gregorian';
    const showMonthlyBsInlineBreaks = effectiveShowBsCalendar;
    const effectiveYearFontScale =
        controlledEventFontScale == null ? yearFontScale : clampCalendarYearFontScale(controlledEventFontScale);
    const effectiveDayCellHeight = useMemo(() => {
        if (isMiniInfinite) {
            if (!scrollContainerHeight) {
                return 36;
            }

            const usableHeight = Math.max(1, scrollContainerHeight - 10);
            return Math.max(28, Math.floor(usableHeight / CALENDAR_MINI_VISIBLE_WEEKS));
        }

        return controlledDayHeight == null
            ? dayCellHeight
            : clampNumber(Math.round(controlledDayHeight), CALENDAR_DAY_HEIGHT_MIN, CALENDAR_DAY_HEIGHT_MAX);
    }, [controlledDayHeight, dayCellHeight, isMiniInfinite, scrollContainerHeight]);
    const memberFilterControlled = controlledEveryoneSelected !== undefined || controlledSelectedMemberIds !== undefined;
    const choreFilterControlled = controlledSelectedChoreIds !== undefined;
    const effectiveShowChores = typeof controlledShowChores === 'boolean' ? controlledShowChores : showChores;
    const effectiveEveryoneSelected =
        typeof controlledEveryoneSelected === 'boolean' ? controlledEveryoneSelected : everyoneSelected;
    const effectiveSelectedMemberIds = memberFilterControlled
        ? sanitizeControlledIds(controlledSelectedMemberIds)
        : selectedMemberIds;
    const effectiveSelectedChoreIds = choreFilterControlled ? sanitizeControlledIds(controlledSelectedChoreIds) : selectedChoreIds;
    const tagFilterControlled = controlledSelectedTagIds !== undefined;
    const effectiveTagExpression = tagFilterControlled
        ? createFlatOrTagExpression(sanitizeControlledIds(controlledSelectedTagIds))
        : normalizeCalendarTagExpression(persistentFilters.tagExpression);
    const effectivePersistentFilters = useMemo(
        () =>
            normalizeCalendarPersistentFilters({
                ...persistentFilters,
                dateRange: persistentFilters.dateRange || createEmptyCalendarDateRangeFilter(),
                tagExpression: effectiveTagExpression,
            }),
        [effectiveTagExpression, persistentFilters]
    );
    const normalizedLiveSearchQuery = useMemo(() => normalizeCalendarSearchQuery(searchState.query), [searchState.query]);
    const effectiveMemberFilterConfigured = memberFilterControlled ? true : memberFilterConfigured;
    const effectiveChoreFilterConfigured = choreFilterControlled ? true : choreFilterConfigured;

    const buildMonthLabel = useCallback((date: Date): MonthLabel => {
        // @ts-ignore - package has no strict Date typing
        const nepaliDate = new NepaliDate(date);
        const nepaliMonth = nepaliDate.getMonth();
        const nepaliYear = String(nepaliDate.getYear());
        return {
            key: `${format(date, 'yyyy-MM')}-${nepaliDate.getYear()}-${nepaliMonth}`,
            gregorianMonth: format(date, 'MMMM'),
            gregorianYear: format(date, 'yyyy'),
            nepaliMonth: `${NEPALI_MONTHS_COMMON_DEVANAGARI[nepaliMonth]} (${NEPALI_MONTHS_COMMON_ROMAN[nepaliMonth]})`,
            nepaliYearDevanagari: toDevanagariDigits(nepaliYear),
        };
    }, []);

    const buildGregorianRangeLabel = useCallback((start: Date, end: Date) => {
        const sameMonth = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
        if (sameMonth) {
            return `${start.toLocaleDateString(undefined, { month: 'long' })} ${start.getFullYear()}`;
        }

        const sameYear = start.getFullYear() === end.getFullYear();
        if (sameYear) {
            return `${start.toLocaleDateString(undefined, { month: 'long' })} - ${end.toLocaleDateString(undefined, { month: 'long' })} ${start.getFullYear()}`;
        }

        return `${start.toLocaleDateString(undefined, { month: 'short' })} ${start.getFullYear()} - ${end.toLocaleDateString(undefined, { month: 'short' })} ${end.getFullYear()}`;
    }, []);

    const buildBsRangeLabel = useCallback((start: Date, end: Date) => {
        try {
            const startBs = new NepaliDate(start);
            const endBs = new NepaliDate(end);
            const startMonth = `${NEPALI_MONTHS_COMMON_DEVANAGARI[startBs.getMonth()] || ''} (${NEPALI_MONTHS_COMMON_ROMAN[startBs.getMonth()] || ''})`.trim();
            const endMonth = `${NEPALI_MONTHS_COMMON_DEVANAGARI[endBs.getMonth()] || ''} (${NEPALI_MONTHS_COMMON_ROMAN[endBs.getMonth()] || ''})`.trim();
            const startYear = toDevanagariDigits(startBs.getYear());
            const endYear = toDevanagariDigits(endBs.getYear());
            const sameMonth = startBs.getYear() === endBs.getYear() && startBs.getMonth() === endBs.getMonth();
            if (sameMonth) {
                return `${startMonth} ${startYear}`.trim();
            }
            if (startBs.getYear() === endBs.getYear()) {
                return `${startMonth} - ${endMonth} ${startYear}`.trim();
            }
            return `${startMonth} ${startYear} - ${endMonth} ${endYear}`.trim();
        } catch {
            return '';
        }
    }, []);

    const buildGregorianYearRangeLabel = useCallback((start: Date, end: Date) => {
        const startYear = format(start, 'yyyy');
        const endYear = format(end, 'yyyy');
        return startYear === endYear ? startYear : `${startYear} - ${endYear}`;
    }, []);

    const buildBsYearRangeLabel = useCallback((start: Date, end: Date) => {
        try {
            const startYear = toDevanagariDigits(new NepaliDate(start).getYear());
            const endYear = toDevanagariDigits(new NepaliDate(end).getYear());
            return startYear === endYear ? startYear : `${startYear} - ${endYear}`;
        } catch {
            return '';
        }
    }, []);

    useEffect(() => {
        if (isMiniInfinite && viewMode !== 'monthly') {
            setViewMode('monthly');
        }
    }, [isMiniInfinite, viewMode]);

    const lastAppliedCurrentDateRef = useRef(initialCurrentDateStrRef.current);
    useEffect(() => {
        const nextDateStr = format(effectiveCurrentDate, 'yyyy-MM-dd');
        if (lastAppliedCurrentDateRef.current === nextDateStr) {
            return;
        }

        lastAppliedCurrentDateRef.current = nextDateStr;
        pendingTopScrollAdjustRef.current = null;
        pendingScrollBehaviorRef.current = 'auto';
        pendingScrollToDateRef.current = nextDateStr;
        setDayAnchorDate(effectiveCurrentDate);
        setDayViewVerticalResetKey((previous) => previous + 1);
        setActiveMonthLabel(buildMonthLabel(effectiveCurrentDate));
        monthLabelRef.current = buildMonthLabel(effectiveCurrentDate);
        setRangeStart(startOfWeek(addWeeks(effectiveCurrentDate, -initialWeeksPerSide), { weekStartsOn: WEEK_STARTS_ON }));
        setRangeEnd(endOfWeek(addWeeks(effectiveCurrentDate, initialWeeksPerSide), { weekStartsOn: WEEK_STARTS_ON }));
        setSearchWindow(createRollingWindow(effectiveCurrentDate));
        setAgendaWindow(createRollingWindow(effectiveCurrentDate, { includePast: false }));
    }, [buildMonthLabel, effectiveCurrentDate, initialWeeksPerSide]);

    const scrollToDateStr = useCallback((dateStr: string, behavior: ScrollBehavior = 'smooth') => {
        const container = scrollContainerRef.current;
        if (!container) return false;

        const targetCell = container.querySelector<HTMLElement>(`[data-calendar-cell-date="${dateStr}"]`);
        if (!targetCell) return false;

        const headerHeight = isMiniInfinite ? 0 : headerRef.current?.getBoundingClientRect().height ?? 0;
        const targetTop = Math.max(0, targetCell.offsetTop - headerHeight - (isMiniInfinite ? 2 : 8));
        if (typeof container.scrollTo === 'function') {
            container.scrollTo({ top: targetTop, behavior });
        } else {
            container.scrollTop = targetTop;
        }
        return true;
    }, [isMiniInfinite]);

    const scrollToMonthOffset = useCallback((monthOffset: number, behavior: ScrollBehavior = 'smooth') => {
        const container = scrollContainerRef.current;
        if (!container) return false;

        const targetMonth = container.querySelector<HTMLElement>(`[data-calendar-month-offset="${monthOffset}"]`);
        if (!targetMonth) return false;

        const targetTop = Math.max(0, targetMonth.offsetTop - 4);
        if (typeof container.scrollTo === 'function') {
            container.scrollTo({ top: targetTop, behavior });
        } else {
            container.scrollTop = targetTop;
        }
        return true;
    }, []);

    const yearMonths = useMemo(
        () =>
            buildYearCalendarMonthDescriptors({
                currentDate: effectiveCurrentDate,
                basis: effectiveYearMonthBasis,
                startOffset: yearRangeStartOffset,
                endOffset: yearRangeEndOffset,
            }),
        [effectiveCurrentDate, effectiveYearMonthBasis, yearRangeEndOffset, yearRangeStartOffset]
    );

    const yearLeadingBufferMonth = useMemo(
        () =>
            buildYearCalendarMonthDescriptors({
                currentDate: effectiveCurrentDate,
                basis: effectiveYearMonthBasis,
                startOffset: yearRangeStartOffset - 1,
                endOffset: yearRangeStartOffset - 1,
            })[0] ?? null,
        [effectiveCurrentDate, effectiveYearMonthBasis, yearRangeStartOffset]
    );

    const yearTrailingBufferMonth = useMemo(
        () =>
            buildYearCalendarMonthDescriptors({
                currentDate: effectiveCurrentDate,
                basis: effectiveYearMonthBasis,
                startOffset: yearRangeEndOffset + 1,
                endOffset: yearRangeEndOffset + 1,
            })[0] ?? null,
        [effectiveCurrentDate, effectiveYearMonthBasis, yearRangeEndOffset]
    );

    const yearLayoutReferenceMonths = useMemo(
        () =>
            buildYearCalendarMonthDescriptors({
                currentDate: effectiveCurrentDate,
                basis: effectiveYearMonthBasis,
                startOffset: 0,
                endOffset: 11,
            }),
        [effectiveCurrentDate, effectiveYearMonthBasis]
    );

    const yearLayout = useMemo(
        () =>
            calculateYearCalendarLayout({
                containerWidth: scrollContainerWidth ?? 0,
                containerHeight: scrollContainerHeight ?? 0,
                visibleMonths: yearLayoutReferenceMonths,
            }),
        [scrollContainerHeight, scrollContainerWidth, yearLayoutReferenceMonths]
    );
    const dayRenderedStartDate = useMemo(
        () => startOfDayDate(addDays(dayAnchorDate, -(controlledDayBufferDays ?? DAY_VIEW_BUFFER_DAYS))),
        [controlledDayBufferDays, dayAnchorDate]
    );
    const dayRenderedDays = useMemo(
        () =>
            Array.from({ length: dayVisibleDays * dayRowCount + (controlledDayBufferDays ?? DAY_VIEW_BUFFER_DAYS) * 2 }, (_unused, index) =>
                addDays(dayRenderedStartDate, index)
            ),
        [controlledDayBufferDays, dayRenderedStartDate, dayRowCount, dayVisibleDays]
    );
    const dayRenderedEndDate = dayRenderedDays[dayRenderedDays.length - 1] ?? dayRenderedStartDate;
    const currentPeriodLabel = useMemo(() => {
        let gregorianTitle = '';
        let bsTitle = '';

        if (viewMode === 'monthly') {
            gregorianTitle = `${activeMonthLabel.gregorianMonth} ${activeMonthLabel.gregorianYear}`;
            bsTitle = `${activeMonthLabel.nepaliMonth} ${activeMonthLabel.nepaliYearDevanagari}`;
        } else if (viewMode === 'year') {
            const visibleYearStart = yearMonths[0]?.startDate ?? startOfMonth(effectiveCurrentDate);
            const visibleYearEnd = addDays(
                yearMonths[yearMonths.length - 1]?.endDateExclusive ?? startOfMonth(addMonths(visibleYearStart, 1)),
                -1
            );
            gregorianTitle = buildGregorianYearRangeLabel(visibleYearStart, visibleYearEnd);
            bsTitle = buildBsYearRangeLabel(visibleYearStart, visibleYearEnd);
        } else if (viewMode === 'day') {
            const visibleDayEnd = addDays(dayAnchorDate, dayVisibleDays * dayRowCount - 1);
            gregorianTitle = buildGregorianRangeLabel(dayAnchorDate, visibleDayEnd);
            bsTitle = buildBsRangeLabel(dayAnchorDate, visibleDayEnd);
        } else if (viewMode === 'agenda') {
            gregorianTitle = buildGregorianRangeLabel(agendaWindow.start, agendaWindow.end);
            bsTitle = buildBsRangeLabel(agendaWindow.start, agendaWindow.end);
        }

        if (!effectiveShowGregorianCalendar && effectiveShowBsCalendar) {
            return {
                visible: bsTitle.length > 0,
                title: bsTitle,
                subtitle: '',
            };
        }

        return {
            visible: gregorianTitle.length > 0 || bsTitle.length > 0,
            title: gregorianTitle || bsTitle,
            subtitle: effectiveShowGregorianCalendar && effectiveShowBsCalendar ? bsTitle : '',
        };
    }, [
        activeMonthLabel,
        agendaWindow.end,
        agendaWindow.start,
        buildBsRangeLabel,
        buildBsYearRangeLabel,
        buildGregorianRangeLabel,
        buildGregorianYearRangeLabel,
        dayAnchorDate,
        dayRowCount,
        dayVisibleDays,
        effectiveCurrentDate,
        effectiveShowBsCalendar,
        effectiveShowGregorianCalendar,
        viewMode,
        yearMonths,
    ]);
    const explicitDateRangeWindow = useMemo(() => {
        const dateRange = effectivePersistentFilters.dateRange;
        if (!isCalendarDateRangeFilterActive(dateRange)) {
            return null;
        }

        if (dateRange.mode === 'before') {
            const boundary = String(dateRange.endDate || dateRange.startDate || '').trim();
            if (!boundary) return null;
            return {
                start: startOfWeek(addMonths(parseISO(`${boundary}T00:00:00`), -SUPPLEMENTAL_WINDOW_MONTHS), { weekStartsOn: WEEK_STARTS_ON }),
                end: endOfWeek(parseISO(`${boundary}T23:59:59`), { weekStartsOn: WEEK_STARTS_ON }),
            };
        }

        if (dateRange.mode === 'after') {
            const boundary = String(dateRange.startDate || dateRange.endDate || '').trim();
            if (!boundary) return null;
            return {
                start: startOfWeek(parseISO(`${boundary}T00:00:00`), { weekStartsOn: WEEK_STARTS_ON }),
                end: endOfWeek(addMonths(parseISO(`${boundary}T23:59:59`), SUPPLEMENTAL_WINDOW_MONTHS), { weekStartsOn: WEEK_STARTS_ON }),
            };
        }

        if (dateRange.mode === 'between') {
            const startValue = String(dateRange.startDate || '').trim();
            const endValue = String(dateRange.endDate || '').trim();
            if (!startValue && !endValue) return null;
            const startDate = parseISO(`${(startValue || endValue)}T00:00:00`);
            const endDate = parseISO(`${(endValue || startValue)}T23:59:59`);
            const effectiveStart = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
            const effectiveEnd = endDate.getTime() >= startDate.getTime() ? endDate : startDate;
            return {
                start: startOfWeek(effectiveStart, { weekStartsOn: WEEK_STARTS_ON }),
                end: endOfWeek(effectiveEnd, { weekStartsOn: WEEK_STARTS_ON }),
            };
        }

        return null;
    }, [effectivePersistentFilters.dateRange]);
    const previousViewModeRef = useRef<CalendarViewMode>(viewMode);

    useEffect(() => {
        const previous = previousViewModeRef.current;
        if (viewMode === 'day' && previous !== 'day') {
            const nextAnchor = selectedDate ? startOfDayDate(selectedDate) : effectiveCurrentDate;
            setDayAnchorDate(nextAnchor);
            setDayViewVerticalResetKey((value) => value + 1);
        }
        if (viewMode === 'agenda' && previous !== 'agenda') {
            setAgendaWindow(explicitDateRangeWindow || createRollingWindow(effectiveCurrentDate, { includePast: false }));
            setAgendaFocusRequest({
                nonce: Date.now(),
                dateKey: format(effectiveCurrentDate, 'yyyy-MM-dd'),
            });
        }
        previousViewModeRef.current = viewMode;
    }, [effectiveCurrentDate, explicitDateRangeWindow, selectedDate, viewMode]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (typeof window.matchMedia !== 'function') {
            setSearchRailSupported(true);
            return;
        }

        const mediaQuery = window.matchMedia('(min-width: 1180px)');
        const sync = () => setSearchRailSupported(mediaQuery.matches);
        sync();
        mediaQuery.addEventListener('change', sync);
        return () => mediaQuery.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        if (!explicitDateRangeWindow) return;
        setAgendaWindow(explicitDateRangeWindow);
        setSearchWindow(explicitDateRangeWindow);
    }, [explicitDateRangeWindow]);

    useEffect(() => {
        if (!searchState.isOpen || explicitDateRangeWindow) return;
        setSearchWindow((current) => {
            if (current.start.getTime() !== current.end.getTime()) {
                return current;
            }
            const anchor = selectedDate ? startOfDayDate(selectedDate) : effectiveCurrentDate;
            return createRollingWindow(anchor);
        });
    }, [effectiveCurrentDate, explicitDateRangeWindow, searchState.isOpen, selectedDate]);

    const activeRangeStart = useMemo(() => {
        if (viewMode === 'day') {
            return dayRenderedStartDate;
        }
        if (viewMode === 'agenda') {
            return agendaWindow.start;
        }
        if (viewMode === 'year') {
            return yearLeadingBufferMonth?.gridStart ?? yearMonths[0]?.gridStart ?? startOfMonth(effectiveCurrentDate);
        }
        return rangeStart;
    }, [agendaWindow.start, dayRenderedStartDate, effectiveCurrentDate, rangeStart, viewMode, yearLeadingBufferMonth, yearMonths]);

    const activeRangeEnd = useMemo(() => {
        if (viewMode === 'day') {
            return endOfDay(dayRenderedEndDate);
        }
        if (viewMode === 'agenda') {
            return agendaWindow.end;
        }
        if (viewMode === 'year') {
            return (
                yearTrailingBufferMonth?.gridEnd ??
                yearMonths[yearMonths.length - 1]?.gridEnd ??
                endOfWeek(effectiveCurrentDate, { weekStartsOn: WEEK_STARTS_ON })
            );
        }
        return rangeEnd;
    }, [agendaWindow.end, dayRenderedEndDate, effectiveCurrentDate, rangeEnd, viewMode, yearMonths, yearTrailingBufferMonth]);

    const days = useMemo(() => {
        const generatedDays: Date[] = [];
        let cursor = activeRangeStart;
        while (cursor.getTime() <= activeRangeEnd.getTime()) {
            generatedDays.push(cursor);
            cursor = addDays(cursor, 1);
        }
        return generatedDays;
    }, [activeRangeEnd, activeRangeStart]);

    const weeks = useMemo(() => {
        const generatedWeeks: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) {
            generatedWeeks.push(days.slice(i, i + 7));
        }
        return generatedWeeks;
    }, [days]);

    const queryWindows = useMemo(() => {
        const windows: CalendarRangeWindow[] = [{ start: activeRangeStart, end: activeRangeEnd }];
        if (searchState.isOpen) {
            windows.push(explicitDateRangeWindow || searchWindow);
        }
        if (viewMode === 'agenda') {
            windows.push(explicitDateRangeWindow || agendaWindow);
        }
        return windows;
    }, [activeRangeEnd, activeRangeStart, agendaWindow, explicitDateRangeWindow, searchState.isOpen, searchWindow, viewMode]);
    const monthConditions = useMemo(() => buildMonthConditionsForWindows(queryWindows), [queryWindows]);
    const recurrenceReferenceMonthConditions = useMemo(
        () => buildRecurrenceMonthConditionsForWindows(queryWindows),
        [queryWindows]
    );

    const capRangeByMemory = useCallback((start: Date, end: Date, direction: 'up' | 'down') => {
        let cappedStart = start;
        let cappedEnd = end;

        if (direction === 'down') {
            const minimumStart = startOfWeek(addWeeks(cappedEnd, -MEMORY_CAP_WEEKS), { weekStartsOn: WEEK_STARTS_ON });
            if (cappedStart.getTime() < minimumStart.getTime()) {
                cappedStart = minimumStart;
            }
        } else {
            const maximumEnd = endOfWeek(addWeeks(cappedStart, MEMORY_CAP_WEEKS), { weekStartsOn: WEEK_STARTS_ON });
            if (cappedEnd.getTime() > maximumEnd.getTime()) {
                cappedEnd = maximumEnd;
            }
        }

        return { cappedStart, cappedEnd };
    }, []);

    const captureTopScrollAnchor = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        let anchorSelector: string | null = null;
        let anchorOffset: number | null = null;

        const headerHeight = isMiniInfinite ? 0 : headerRef.current?.getBoundingClientRect().height ?? 0;
        const containerTop = container.getBoundingClientRect().top;
        const scanLine = containerTop + headerHeight;

        const dayMarkers = Array.from(container.querySelectorAll<HTMLElement>('[data-calendar-cell-date]'));
        for (const marker of dayMarkers) {
            const rect = marker.getBoundingClientRect();
            if (rect.bottom > scanLine) {
                const anchorDate = marker.dataset.calendarCellDate ?? null;
                anchorSelector = anchorDate ? `[data-calendar-cell-date="${anchorDate}"]` : null;
                anchorOffset = rect.top - containerTop;
                break;
            }
        }

        pendingTopScrollAdjustRef.current = {
            prevScrollTop: container.scrollTop,
            prevScrollHeight: container.scrollHeight,
            anchorSelector,
            anchorOffset,
        };
    }, [isMiniInfinite]);

    const expandRange = useCallback(
        (direction: 'up' | 'down') => {
            if (expandLockRef.current) {
                return;
            }

            expandLockRef.current = true;

            let nextStart = rangeStart;
            let nextEnd = rangeEnd;

            if (direction === 'up') {
                nextStart = startOfWeek(addWeeks(rangeStart, -WEEKS_PER_LOAD), { weekStartsOn: WEEK_STARTS_ON });
            } else {
                nextEnd = endOfWeek(addWeeks(rangeEnd, WEEKS_PER_LOAD), { weekStartsOn: WEEK_STARTS_ON });
            }

            const { cappedStart, cappedEnd } = capRangeByMemory(nextStart, nextEnd, direction);
            const topChanged = cappedStart.getTime() !== rangeStart.getTime();

            if (topChanged) {
                captureTopScrollAnchor();
            }

            setRangeStart(cappedStart);
            setRangeEnd(cappedEnd);

            window.requestAnimationFrame(() => {
                expandLockRef.current = false;
            });
        },
        [rangeStart, rangeEnd, capRangeByMemory, captureTopScrollAnchor]
    );

    const expandYearRange = useCallback(
        (direction: 'up' | 'down') => {
            if (expandLockRef.current) {
                return;
            }

            const container = scrollContainerRef.current;
            if (!container) {
                return;
            }

            expandLockRef.current = true;

            if (direction === 'up') {
                pendingTopScrollAdjustRef.current = {
                    prevScrollTop: container.scrollTop,
                    prevScrollHeight: container.scrollHeight,
                };
                setYearRangeStartOffset((previous) => previous - 12);
            } else {
                setYearRangeEndOffset((previous) => previous + 12);
            }

            window.requestAnimationFrame(() => {
                expandLockRef.current = false;
            });
        },
        []
    );

    const selectCalendarEvent = useCallback((calendarEvent: CalendarItem) => {
        const occurrenceDateKey = getCalendarOccurrenceDateKey(calendarEvent);
        setSelectedDate(parseISO(`${occurrenceDateKey}T00:00:00`));
        setSelectedEvent(calendarEvent);
        setSelectedEventKey(buildCalendarOccurrenceKey(calendarEvent));
        setInitialDraftSelection(null);
    }, []);

    const clearCalendarSelection = useCallback(() => {
        setSelectedEvent(null);
        setSelectedEventKey(null);
    }, []);

    const handleDayClick = () => {
        clearCalendarSelection();
        setInitialDraftSelection(null);
    };

    const handleDayDoubleClick = (day: Date) => {
        setSelectedDate(day);
        clearCalendarSelection();
        setInitialDraftSelection({
            start: startOfDayDate(day),
            end: addDays(startOfDayDate(day), 1),
            isAllDay: true,
        });
        setIsModalOpen(true);
    };

    const handleEventClick = (e: React.MouseEvent, calendarEvent: CalendarItem) => {
        e.stopPropagation();
        selectCalendarEvent(calendarEvent);
    };

    const handleEventDoubleClick = (e: React.MouseEvent, calendarEvent: CalendarItem) => {
        e.stopPropagation();
        selectCalendarEvent(calendarEvent);
        if (calendarEvent.calendarItemKind === 'chore') {
            const choreId = String((calendarEvent as any).sourceChoreId || '').trim();
            if (choreId) {
                const occurrenceDate = getCalendarOccurrenceDateKey(calendarEvent);
                setChoreDetailChoreId(choreId);
                setChoreDetailDate(parseISO(`${occurrenceDate}T00:00:00`));
            }
        } else {
            setEventDetailOpen(true);
        }
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedDate(null);
        setInitialDraftSelection(null);
        clearCalendarSelection();
    };

    const handleEventDetailEdit = () => {
        setEventDetailOpen(false);
        setIsModalOpen(true);
    };

    const handleEventDetailClose = () => {
        setEventDetailOpen(false);
        clearCalendarSelection();
    };

    const handleChoreDetailEdit = () => {
        // Close the chore detail and navigate to chore edit — for now just close,
        // since the calendar doesn't have a chore edit form inline.
        setChoreDetailChoreId(null);
        setChoreDetailDate(null);
    };

    const handleChoreDetailClose = (open: boolean) => {
        if (!open) {
            setChoreDetailChoreId(null);
            setChoreDetailDate(null);
            clearCalendarSelection();
        }
    };

    const requestRecurrenceScope = useCallback((action: 'edit' | 'drag' | 'delete', scopeMode: RecurrenceSeriesScopeMode = 'following') => {
        return new Promise<RecurrenceEditScope>((resolve) => {
            recurrenceScopeResolverRef.current = resolve;
            setRecurrenceScopeDialogAction(action);
            setRecurrenceScopeDialogMode(scopeMode);
            setRecurrenceScopeDialogOpen(true);
        });
    }, []);

    const resolveRecurrenceScope = useCallback((scope: RecurrenceEditScope) => {
        setRecurrenceScopeDialogOpen(false);
        const resolver = recurrenceScopeResolverRef.current;
        recurrenceScopeResolverRef.current = null;
        resolver?.(scope);
    }, []);

    const isOriginalSeriesOccurrence = useCallback((item: CalendarItem, masterEvent: CalendarItem) => {
        const occurrenceReferenceToken =
            typeof item.recurrenceId === 'string' && item.recurrenceId.trim() ? item.recurrenceId : item.startDate;
        const occurrenceReferenceDate =
            parseRecurrenceDateToken(String(occurrenceReferenceToken || '')) || parseRecurrenceDateToken(String(item.startDate || ''));
        const masterStartDate = parseRecurrenceDateToken(String(masterEvent.startDate || ''));
        if (!occurrenceReferenceDate || !masterStartDate) return false;

        if (item.isAllDay || masterEvent.isAllDay) {
            return format(occurrenceReferenceDate, 'yyyy-MM-dd') === format(masterStartDate, 'yyyy-MM-dd');
        }

        return occurrenceReferenceDate.getTime() === masterStartDate.getTime();
    }, []);

    const handleDeleteByScope = useCallback(
        async (scope: RecurrenceEditScope) => {
            if (!selectedEvent) return;

            const masterEvent = (((selectedEvent as any).__masterEvent as CalendarItem | undefined) || selectedEvent) as CalendarItem;
            const masterRrule = normalizeRruleString(String(masterEvent?.rrule || ''));
            const masterId = String(masterEvent?.id || selectedEvent.id);
            const masterLinkKeys = getRecurringSeriesLinkKeys(masterEvent);
            const hasRecurringContext = Boolean(masterRrule || String(selectedEvent.recurringEventId || '').trim());
            const selectedAffectedMemberIds = Array.from(
                new Set((Array.isArray(selectedEvent.pertainsTo) ? selectedEvent.pertainsTo : []).map((member) => member?.id).filter(Boolean))
            ) as string[];
            const selectedTitle = String(selectedEvent.title || masterEvent.title || 'Untitled event');

            if (!hasRecurringContext) {
                await db.transact(
                    appendCalendarHistoryTransactions([tx.calendarItems[selectedEvent.id].delete()], {
                        occurredAt: new Date().toISOString(),
                        actionType: 'calendar_event_deleted',
                        summary: `Deleted event "${selectedTitle}"`,
                        calendarItemId: selectedEvent.id,
                        affectedMemberIds: selectedAffectedMemberIds,
                        title: selectedTitle,
                        beforeSnapshot: buildCalendarHistorySnapshot(selectedEvent),
                        metadata: {
                            scope: 'single',
                        },
                    })
                );
                clearCalendarSelection();
                return;
            }

            const referenceTokenRaw = String((selectedEvent as any).recurrenceId || selectedEvent.startDate || '').trim();
            const referenceDate = parseRecurrenceDateToken(referenceTokenRaw) || parseRecurrenceDateToken(String(selectedEvent.startDate || ''));
            if (!referenceDate) {
                window.alert('Unable to identify the recurrence instance for deletion.');
                return;
            }
            const referenceToken = selectedEvent.isAllDay ? format(referenceDate, 'yyyy-MM-dd') : referenceDate.toISOString();
            const boundaryDateOnly = format(referenceDate, 'yyyy-MM-dd');

            if (!masterRrule) {
                if (scope !== 'single') {
                    window.alert('Unable to delete following events because the recurrence series was not found.');
                    return;
                }

                await db.transact(
                    appendCalendarHistoryTransactions([tx.calendarItems[selectedEvent.id].delete()], {
                        occurredAt: new Date().toISOString(),
                        actionType: 'calendar_event_deleted',
                        summary: `Deleted event "${selectedTitle}"`,
                        calendarItemId: selectedEvent.id,
                        affectedMemberIds: selectedAffectedMemberIds,
                        title: selectedTitle,
                        beforeSnapshot: buildCalendarHistorySnapshot(selectedEvent),
                        metadata: {
                            scope: 'single',
                        },
                    })
                );
                clearCalendarSelection();
                return;
            }

            const masterExdates = normalizeRecurrenceTokens([
                ...(Array.isArray(masterEvent.exdates) ? masterEvent.exdates.map((entry) => String(entry)) : []),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'EXDATE'),
            ]);
            const masterRdates = normalizeRecurrenceTokens([
                ...(Array.isArray(masterEvent.rdates) ? masterEvent.rdates.map((entry) => String(entry)) : []),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'RDATE'),
            ]);
            const masterSequence = typeof masterEvent.sequence === 'number' ? masterEvent.sequence : 0;
            const masterXProps =
                masterEvent.xProps && typeof masterEvent.xProps === 'object' && !Array.isArray(masterEvent.xProps)
                    ? { ...(masterEvent.xProps as Record<string, unknown>) }
                    : {};

            const txOps: any[] = [];
            const selectedIsOverride =
                selectedEvent.id !== masterId &&
                isRecurringChildOfMaster(selectedEvent, masterEvent) &&
                !normalizeRruleString(String(selectedEvent.rrule || ''));

            const collectRelatedOverrideIds = (boundaryTime?: number) => {
                const overrideIds = new Set<string>();
                for (const candidate of calendarItems) {
                    const parentId = String(candidate.recurringEventId || '').trim();
                    if (!parentId || !masterLinkKeys.includes(parentId)) continue;

                    if (boundaryTime == null) {
                        overrideIds.add(candidate.id);
                        continue;
                    }

                    const recurrenceRefToken =
                        typeof candidate.recurrenceId === 'string' && candidate.recurrenceId.trim()
                            ? candidate.recurrenceId
                            : candidate.startDate;
                    const recurrenceRefDate = parseRecurrenceDateToken(String(recurrenceRefToken || ''));
                    if (!recurrenceRefDate) continue;
                    const recurrenceTime = candidate.isAllDay
                        ? parseISO(`${format(recurrenceRefDate, 'yyyy-MM-dd')}T00:00:00`).getTime()
                        : recurrenceRefDate.getTime();
                    if (recurrenceTime >= boundaryTime) {
                        overrideIds.add(candidate.id);
                    }
                }

                if (selectedIsOverride) {
                    overrideIds.add(selectedEvent.id);
                }

                return overrideIds;
            };

            if (scope === 'single') {
                const nextExdates = normalizeRecurrenceTokens([...masterExdates, referenceToken]);
                const nextExceptionRows = normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceExceptionRows);
                if (
                    !nextExceptionRows.some((row) =>
                        row.mode === 'date'
                            ? row.date === boundaryDateOnly
                            : row.rangeStart.localeCompare(boundaryDateOnly) <= 0 && row.rangeEnd.localeCompare(boundaryDateOnly) >= 0
                    )
                ) {
                    nextExceptionRows.push({
                        mode: 'date',
                        date: boundaryDateOnly,
                        rangeStart: boundaryDateOnly,
                        rangeEnd: boundaryDateOnly,
                    });
                }

                txOps.push(
                    tx.calendarItems[masterId].update({
                        exdates: nextExdates,
                        recurrenceLines: buildRecurrenceLines(masterRrule, masterRdates, nextExdates),
                        updatedAt: new Date().toISOString(),
                        dtStamp: new Date().toISOString(),
                        lastModified: new Date().toISOString(),
                        sequence: masterSequence + 1,
                        xProps: {
                            ...masterXProps,
                            recurrenceExceptionRows: nextExceptionRows,
                        },
                    })
                );
                if (selectedIsOverride) {
                    txOps.push(tx.calendarItems[selectedEvent.id].delete());
                }
            } else if (scope === 'all') {
                txOps.push(tx.calendarItems[masterId].delete());
                for (const overrideId of Array.from(collectRelatedOverrideIds())) {
                    txOps.push(tx.calendarItems[overrideId].delete());
                }
            } else {
                const boundaryTime = selectedEvent.isAllDay
                    ? parseISO(`${boundaryDateOnly}T00:00:00`).getTime()
                    : referenceDate.getTime();
                const masterStartReferenceDate = parseRecurrenceDateToken(String(masterEvent.startDate || ''));
                const masterStartTime = masterStartReferenceDate
                    ? selectedEvent.isAllDay
                        ? parseISO(`${format(masterStartReferenceDate, 'yyyy-MM-dd')}T00:00:00`).getTime()
                        : masterStartReferenceDate.getTime()
                    : Number.NaN;
                const deletingFromFirstOccurrence = Number.isFinite(masterStartTime) && boundaryTime <= masterStartTime;

                if (deletingFromFirstOccurrence) {
                    txOps.push(tx.calendarItems[masterId].delete());
                } else {
                    const cappedMasterRrule = capRruleBeforeOccurrence(masterRrule, referenceDate, selectedEvent.isAllDay);
                    const splitExdates = partitionRecurrenceTokensByBoundary(masterExdates, referenceDate, selectedEvent.isAllDay);
                    const splitRdates = partitionRecurrenceTokensByBoundary(masterRdates, referenceDate, selectedEvent.isAllDay);
                    const splitExceptionRows = splitRecurrenceRowsAtBoundary(
                        normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceExceptionRows),
                        boundaryDateOnly
                    );
                    const splitRdateRows = splitRecurrenceRowsAtBoundary(
                        normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceRdateRows),
                        boundaryDateOnly
                    );
                    const patchedMasterXProps = { ...masterXProps };
                    if (splitExceptionRows.before.length > 0) {
                        patchedMasterXProps.recurrenceExceptionRows = splitExceptionRows.before;
                    } else {
                        delete patchedMasterXProps.recurrenceExceptionRows;
                    }
                    if (splitRdateRows.before.length > 0) {
                        patchedMasterXProps.recurrenceRdateRows = splitRdateRows.before;
                    } else {
                        delete patchedMasterXProps.recurrenceRdateRows;
                    }

                    txOps.push(
                        tx.calendarItems[masterId].update({
                            rrule: cappedMasterRrule,
                            rdates: splitRdates.before,
                            exdates: splitExdates.before,
                            recurrenceLines: buildRecurrenceLines(cappedMasterRrule, splitRdates.before, splitExdates.before),
                            updatedAt: new Date().toISOString(),
                            dtStamp: new Date().toISOString(),
                            lastModified: new Date().toISOString(),
                            sequence: masterSequence + 1,
                            xProps: patchedMasterXProps,
                        })
                    );
                }

                const overrideIds = deletingFromFirstOccurrence ? collectRelatedOverrideIds() : collectRelatedOverrideIds(boundaryTime);
                for (const overrideId of Array.from(overrideIds)) {
                    txOps.push(tx.calendarItems[overrideId].delete());
                }
            }

            try {
                await db.transact(
                    appendCalendarHistoryTransactions(txOps, {
                        occurredAt: new Date().toISOString(),
                        actionType: 'calendar_event_deleted',
                        summary:
                            scope === 'all'
                                ? `Deleted all events in "${selectedTitle}" series`
                                : scope === 'following'
                                  ? `Deleted following events in "${selectedTitle}" series`
                                  : `Deleted occurrence of "${selectedTitle}"`,
                        calendarItemId: scope === 'all' ? masterId : selectedEvent.id,
                        affectedMemberIds: selectedAffectedMemberIds,
                        title: selectedTitle,
                        beforeSnapshot: buildCalendarHistorySnapshot(selectedEvent),
                        metadata: {
                            scope,
                            recurring: true,
                        },
                    })
                );
                clearCalendarSelection();
            } catch (error) {
                console.error('Unable to delete recurring event:', error);
                window.alert('Unable to delete event. Please try again.');
            }
        },
        [appendCalendarHistoryTransactions, calendarItems, clearCalendarSelection, selectedEvent]
    );

    const handleDeleteSelectedEvent = useCallback(async () => {
        if (!selectedEvent) return;

        const masterEvent = (((selectedEvent as any).__masterEvent as CalendarItem | undefined) || selectedEvent) as CalendarItem;
        const masterRrule = normalizeRruleString(String(masterEvent?.rrule || ''));
        const isRecurringContext = Boolean(masterRrule || String(selectedEvent.recurringEventId || '').trim());

        if (!isRecurringContext) {
            setDeleteConfirmOpen(true);
            return;
        }

        const scope = await requestRecurrenceScope(
            'delete',
            selectedEvent && masterEvent && isOriginalSeriesOccurrence(selectedEvent, masterEvent) ? 'all' : 'following'
        );
        if (scope === 'cancel') return;
        await handleDeleteByScope(scope);
    }, [handleDeleteByScope, isOriginalSeriesOccurrence, requestRecurrenceScope, selectedEvent]);

    const isEventSelected = useCallback(
        (item: CalendarItem) => (selectedEventKey ? getCalendarItemSelectionKey(item) === selectedEventKey : false),
        [selectedEventKey]
    );

    useEffect(() => {
        if (!selectedEventKey || isModalOpen) return;

        const handleWindowKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Delete' && event.key !== 'Backspace') {
                return;
            }

            const target = event.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable)
            ) {
                return;
            }

            event.preventDefault();
            void handleDeleteSelectedEvent();
        };

        window.addEventListener('keydown', handleWindowKeyDown);
        return () => window.removeEventListener('keydown', handleWindowKeyDown);
    }, [handleDeleteSelectedEvent, isModalOpen, selectedEventKey]);

    const getForcedRecurrenceScopeFromInput = useCallback(
        (input: { altKey?: boolean; shiftKey?: boolean } | null | undefined, item: CalendarItem, masterEvent: CalendarItem): RecurrenceDragForcedScope | null => {
            if (input?.altKey) {
                return 'single';
            }
            if (input?.shiftKey) {
                return isOriginalSeriesOccurrence(item, masterEvent) ? 'all' : 'following';
            }
            return null;
        },
        [isOriginalSeriesOccurrence]
    );

    const syncDragRecurrenceIndicator = useCallback(
        (
            input: { altKey?: boolean; shiftKey?: boolean; clientX?: number; clientY?: number } | null | undefined,
            item: CalendarItem | null | undefined
        ) => {
            if (!item) {
                setDragRecurrenceIndicator(null);
                return null;
            }

            const masterEvent = (((item as any).__masterEvent as CalendarItem | undefined) || item) as CalendarItem;
            const masterRrule = normalizeRruleString(String(masterEvent.rrule || ''));
            const hasRecurringContext = Boolean(masterRrule || String(item.recurringEventId || '').trim());
            if (!hasRecurringContext) {
                setDragRecurrenceIndicator(null);
                return null;
            }

            const forcedScope = getForcedRecurrenceScopeFromInput(input, item, masterEvent);
            if (!forcedScope) {
                setDragRecurrenceIndicator(null);
                return null;
            }

            const indicatorLabel =
                forcedScope === 'single' ? 'Only this event' : forcedScope === 'all' ? 'All events' : 'This and following events';
            const hotkeyLabel = forcedScope === 'single' ? 'Alt' : 'Shift';
            setDragRecurrenceIndicator({
                x: Number(input?.clientX ?? 0),
                y: Number(input?.clientY ?? 0),
                label: indicatorLabel,
                hotkeyLabel,
            });
            return forcedScope;
        },
        [getForcedRecurrenceScopeFromInput]
    );

    useEffect(() => {
        return () => {
            if (recurrenceScopeResolverRef.current) {
                recurrenceScopeResolverRef.current('cancel');
                recurrenceScopeResolverRef.current = null;
            }
        };
    }, []);

    const applyOptimisticCalendarItem = useCallback(
        (item: CalendarItem) => {
            const previousItem = calendarItems.find((existing) => existing.id === item.id) || null;
            setOptimisticItemsById((prev) => ({ ...prev, [item.id]: item }));
            setCalendarItems((prev) => {
                const index = prev.findIndex((existing) => existing.id === item.id);
                if (index === -1) {
                    return [...prev, item];
                }

                const next = [...prev];
                next[index] = { ...next[index], ...item };
                return next;
            });

            return () => {
                setOptimisticItemsById((prev) => {
                    if (!prev[item.id]) return prev;
                    const next = { ...prev };
                    delete next[item.id];
                    return next;
                });
                setCalendarItems((prev) => {
                    const index = prev.findIndex((existing) => existing.id === item.id);
                    if (index === -1) {
                        return prev;
                    }

                    if (previousItem) {
                        const next = [...prev];
                        next[index] = previousItem;
                        return next;
                    }

                    return prev.filter((existing) => existing.id !== item.id);
                });
            };
        },
        [calendarItems]
    );

    const applyCalendarMoveUpdate = useCallback(
        async ({
            event,
            nextStartDate,
            nextEndDate,
            input,
        }: {
            event: CalendarItem;
            nextStartDate: string;
            nextEndDate: string;
            input?: { altKey?: boolean; shiftKey?: boolean } | null;
        }) => {
            const currentStart = parseISO(event.startDate);
            const currentEnd = parseISO(event.endDate);
            const nextStart = parseISO(nextStartDate);
            const nextEnd = parseISO(nextEndDate);
            if (
                Number.isNaN(currentStart.getTime()) ||
                Number.isNaN(currentEnd.getTime()) ||
                Number.isNaN(nextStart.getTime()) ||
                Number.isNaN(nextEnd.getTime())
            ) {
                return;
            }
            if (currentStart.getTime() === nextStart.getTime() && currentEnd.getTime() === nextEnd.getTime()) {
                return;
            }

            const masterEvent = (((event as any).__masterEvent as CalendarItem | undefined) || event) as CalendarItem;
            const masterRrule = normalizeRruleString(String(masterEvent.rrule || ''));
            const dayDelta = differenceInDays(startOfDayDate(nextStart), startOfDayDate(currentStart));
            const deltaMs = nextStart.getTime() - currentStart.getTime();
            const nowIso = new Date().toISOString();
            const eventTitle = String(event.title || masterEvent.title || 'Untitled event');
            const eventAffectedMemberIds = Array.from(
                new Set((Array.isArray(event.pertainsTo) ? event.pertainsTo : []).map((member) => member?.id).filter(Boolean))
            ) as string[];
            const masterAffectedMemberIds = Array.from(
                new Set((Array.isArray(masterEvent.pertainsTo) ? masterEvent.pertainsTo : []).map((member) => member?.id).filter(Boolean))
            ) as string[];
            const legacyPayload = {
                startDate: nextStartDate,
                endDate: nextEndDate,
                year: nextStart.getFullYear(),
                month: nextStart.getMonth() + 1,
                dayOfMonth: nextStart.getDate(),
            };

            const doSimpleMove = (targetEvent: CalendarItem) => {
                const nextSequence = typeof targetEvent.sequence === 'number' ? targetEvent.sequence + 1 : 1;
                const fullPayload = {
                    ...legacyPayload,
                    updatedAt: nowIso,
                    lastModified: nowIso,
                    dtStamp: nowIso,
                    sequence: nextSequence,
                };
                const rollbackOptimisticMove = applyOptimisticCalendarItem({
                    ...targetEvent,
                    ...fullPayload,
                    id: targetEvent.id,
                } as CalendarItem);

                void (async () => {
                    try {
                        await db.transact(
                            appendCalendarHistoryTransactions([tx.calendarItems[targetEvent.id].update(fullPayload)], {
                                occurredAt: nowIso,
                                actionType: 'calendar_event_moved',
                                summary: `Moved event "${String(targetEvent.title || eventTitle)}"`,
                                calendarItemId: targetEvent.id,
                                affectedMemberIds: Array.from(
                                    new Set((Array.isArray(targetEvent.pertainsTo) ? targetEvent.pertainsTo : []).map((member) => member?.id).filter(Boolean))
                                ),
                                title: String(targetEvent.title || eventTitle),
                                beforeSnapshot: buildCalendarHistorySnapshot(event),
                                afterSnapshot: buildCalendarHistorySnapshot({
                                    startDate: nextStartDate,
                                    endDate: nextEndDate,
                                    isAllDay: targetEvent.isAllDay,
                                    timeZone: targetEvent.timeZone || event.timeZone || null,
                                }),
                                metadata: {
                                    scope: 'single',
                                },
                            })
                        );
                    } catch (error) {
                        console.error('Calendar move failed:', error);
                        rollbackOptimisticMove();
                    }
                })();
            };

            if (!masterRrule) {
                doSimpleMove(event);
                return;
            }

            const forcedRecurrenceScope = getForcedRecurrenceScopeFromInput(input, event, masterEvent);
            const recurrenceScope =
                forcedRecurrenceScope ??
                (await requestRecurrenceScope('drag', isOriginalSeriesOccurrence(event, masterEvent) ? 'all' : 'following'));
            if (recurrenceScope === 'cancel') {
                return;
            }

            const sourceStartForRecurrence = parseISO(event.startDate);
            if (Number.isNaN(sourceStartForRecurrence.getTime())) {
                return;
            }
            const destinationStartForRecurrence = parseISO(String(nextStartDate));
            const recurrenceReferenceToken = event.isAllDay
                ? format(sourceStartForRecurrence, 'yyyy-MM-dd')
                : sourceStartForRecurrence.toISOString();
            const boundaryDateOnly = format(sourceStartForRecurrence, 'yyyy-MM-dd');

            const baseRdateTokens = normalizeRecurrenceTokens([
                ...splitDateTokens(masterEvent.rdates),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'RDATE'),
            ]);
            const baseExdateTokens = normalizeRecurrenceTokens([
                ...splitDateTokens(masterEvent.exdates),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'EXDATE'),
            ]);
            const masterSequence = typeof masterEvent.sequence === 'number' ? masterEvent.sequence : 0;

            const rollbackOptimisticHandlers: Array<() => void> = [];
            const registerRollback = (rollback: (() => void) | void) => {
                if (typeof rollback === 'function') {
                    rollbackOptimisticHandlers.push(rollback);
                }
            };
            const rollbackAll = () => {
                while (rollbackOptimisticHandlers.length > 0) {
                    const rollback = rollbackOptimisticHandlers.pop();
                    try {
                        rollback?.();
                    } catch (error) {
                        console.error('Unable to rollback optimistic calendar update:', error);
                    }
                }
            };

            if (recurrenceScope === 'single') {
                if (String(event.recurringEventId || '').trim()) {
                    const overridePatch: Record<string, any> = {
                        ...legacyPayload,
                        updatedAt: nowIso,
                        lastModified: nowIso,
                        dtStamp: nowIso,
                        sequence: typeof event.sequence === 'number' ? event.sequence + 1 : 1,
                    };

                    registerRollback(
                        applyOptimisticCalendarItem({
                            ...event,
                            ...overridePatch,
                            id: event.id,
                        } as CalendarItem)
                    );

                    void (async () => {
                        try {
                            await db.transact(
                                appendCalendarHistoryTransactions([tx.calendarItems[event.id].update(overridePatch)], {
                                    occurredAt: nowIso,
                                    actionType: 'calendar_event_moved',
                                    summary: `Moved occurrence of "${eventTitle}"`,
                                    calendarItemId: event.id,
                                    affectedMemberIds: eventAffectedMemberIds,
                                    title: eventTitle,
                                    beforeSnapshot: buildCalendarHistorySnapshot(event),
                                    afterSnapshot: buildCalendarHistorySnapshot({
                                        startDate: nextStartDate,
                                        endDate: nextEndDate,
                                        isAllDay: event.isAllDay,
                                        timeZone: event.timeZone || masterEvent.timeZone || null,
                                    }),
                                    metadata: {
                                        scope: 'single',
                                        recurring: true,
                                    },
                                })
                            );
                        } catch (error) {
                            console.error('Calendar recurring override move failed:', error);
                            rollbackAll();
                        }
                    })();
                    return;
                }

                const nextMasterExdates = normalizeRecurrenceTokens([...baseExdateTokens, recurrenceReferenceToken]);
                const nextMasterPatch: Record<string, any> = {
                    exdates: nextMasterExdates,
                    recurrenceLines: buildRecurrenceLines(masterRrule, baseRdateTokens, nextMasterExdates),
                    updatedAt: nowIso,
                    lastModified: nowIso,
                    dtStamp: nowIso,
                    sequence: masterSequence + 1,
                };

                const overrideId = id();
                const overrideMembers = Array.isArray(event.pertainsTo)
                    ? event.pertainsTo
                    : Array.isArray(masterEvent.pertainsTo)
                      ? masterEvent.pertainsTo
                      : [];
                const overridePayload: Record<string, any> = {
                    ...legacyPayload,
                    title: String(event.title || masterEvent.title || ''),
                    description: String(event.description || masterEvent.description || ''),
                    isAllDay: event.isAllDay,
                    startDate: nextStartDate,
                    endDate: nextEndDate,
                    uid: `${String(masterEvent.uid || masterEvent.id)}-${recurrenceReferenceToken}`,
                    sequence: 0,
                    status: String(event.status || masterEvent.status || 'confirmed'),
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    dtStamp: nowIso,
                    lastModified: nowIso,
                    location: String(event.location || masterEvent.location || ''),
                    timeZone: String(event.timeZone || masterEvent.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
                    rrule: '',
                    rdates: [],
                    exdates: [],
                    recurrenceLines: [],
                    recurrenceId: recurrenceReferenceToken,
                    recurringEventId: String(masterEvent.id),
                    recurrenceIdRange: '',
                    alarms: event.alarms || masterEvent.alarms || [],
                    eventType: String(event.eventType || masterEvent.eventType || 'default'),
                    visibility: String(event.visibility || masterEvent.visibility || 'default'),
                    transparency: String(event.transparency || masterEvent.transparency || (event.isAllDay ? 'transparent' : 'opaque')),
                    ...(typeof event.travelDurationBeforeMinutes === 'number'
                        ? { travelDurationBeforeMinutes: event.travelDurationBeforeMinutes }
                        : typeof masterEvent.travelDurationBeforeMinutes === 'number'
                          ? { travelDurationBeforeMinutes: masterEvent.travelDurationBeforeMinutes }
                          : {}),
                    ...(typeof event.travelDurationAfterMinutes === 'number'
                        ? { travelDurationAfterMinutes: event.travelDurationAfterMinutes }
                        : typeof masterEvent.travelDurationAfterMinutes === 'number'
                          ? { travelDurationAfterMinutes: masterEvent.travelDurationAfterMinutes }
                          : {}),
                };

                registerRollback(
                    applyOptimisticCalendarItem({
                        ...masterEvent,
                        ...nextMasterPatch,
                        id: masterEvent.id,
                    } as CalendarItem)
                );
                registerRollback(
                    applyOptimisticCalendarItem({
                        ...(event as any),
                        ...overridePayload,
                        id: overrideId,
                        pertainsTo: overrideMembers,
                    } as CalendarItem)
                );

                const txOps: any[] = [tx.calendarItems[masterEvent.id].update(nextMasterPatch), tx.calendarItems[overrideId].update(overridePayload)];
                for (const member of overrideMembers) {
                    if (member?.id) {
                        txOps.push(tx.calendarItems[overrideId].link({ pertainsTo: member.id }));
                    }
                }

                void (async () => {
                    try {
                        await db.transact(
                            appendCalendarHistoryTransactions(txOps, {
                                occurredAt: nowIso,
                                actionType: 'calendar_event_moved',
                                summary: `Moved occurrence of "${eventTitle}"`,
                                calendarItemId: overrideId,
                                affectedMemberIds: overrideMembers.map((member) => member?.id).filter(Boolean) as string[],
                                title: eventTitle,
                                beforeSnapshot: buildCalendarHistorySnapshot(event),
                                afterSnapshot: buildCalendarHistorySnapshot(overridePayload),
                                metadata: {
                                    scope: 'single',
                                    recurring: true,
                                },
                            })
                        );
                    } catch (error) {
                        console.error('Calendar recurring single move failed:', error);
                        rollbackAll();
                    }
                })();
                return;
            }

            if (recurrenceScope === 'all') {
                if (Number.isNaN(destinationStartForRecurrence.getTime())) {
                    doSimpleMove(masterEvent);
                    return;
                }

                const shiftedRrule = shiftRruleForSeriesMove(masterRrule, sourceStartForRecurrence, destinationStartForRecurrence);
                const shiftedRdates = normalizeRecurrenceTokens(
                    baseRdateTokens.map((token) =>
                        event.isAllDay
                            ? shiftRecurrenceTokenByDays(token, dayDelta, true)
                            : shiftRecurrenceTokenByDuration(token, deltaMs, false)
                    )
                );
                const shiftedExdates = normalizeRecurrenceTokens(
                    baseExdateTokens.map((token) =>
                        event.isAllDay
                            ? shiftRecurrenceTokenByDays(token, dayDelta, true)
                            : shiftRecurrenceTokenByDuration(token, deltaMs, false)
                    )
                );
                const masterXProps =
                    masterEvent.xProps && typeof masterEvent.xProps === 'object' && !Array.isArray(masterEvent.xProps)
                        ? { ...(masterEvent.xProps as Record<string, unknown>) }
                        : {};
                const shiftedExceptionRows = shiftStoredRecurrenceRowsByDays(
                    normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceExceptionRows),
                    dayDelta
                );
                const shiftedRdateRows = shiftStoredRecurrenceRowsByDays(
                    normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceRdateRows),
                    dayDelta
                );
                if (shiftedExceptionRows.length > 0) {
                    masterXProps.recurrenceExceptionRows = shiftedExceptionRows;
                } else {
                    delete masterXProps.recurrenceExceptionRows;
                }
                if (shiftedRdateRows.length > 0) {
                    masterXProps.recurrenceRdateRows = shiftedRdateRows;
                } else {
                    delete masterXProps.recurrenceRdateRows;
                }

                const masterStartParsed = parseISO(masterEvent.startDate);
                const masterEndParsed = parseISO(masterEvent.endDate);
                const masterShiftedStart = event.isAllDay
                    ? format(addDays(masterStartParsed, dayDelta), 'yyyy-MM-dd')
                    : addMilliseconds(masterStartParsed, deltaMs).toISOString();
                const masterShiftedEnd = event.isAllDay
                    ? format(addDays(masterEndParsed, dayDelta), 'yyyy-MM-dd')
                    : addMilliseconds(masterEndParsed, deltaMs).toISOString();
                const masterShiftedAnchor = event.isAllDay ? addDays(masterStartParsed, dayDelta) : addMilliseconds(masterStartParsed, deltaMs);

                const nextMasterPatch: Record<string, any> = {
                    startDate: masterShiftedStart,
                    endDate: masterShiftedEnd,
                    year: masterShiftedAnchor.getFullYear(),
                    month: masterShiftedAnchor.getMonth() + 1,
                    dayOfMonth: masterShiftedAnchor.getDate(),
                    rrule: shiftedRrule,
                    rdates: shiftedRdates,
                    exdates: shiftedExdates,
                    recurrenceLines: buildRecurrenceLines(shiftedRrule, shiftedRdates, shiftedExdates),
                    updatedAt: nowIso,
                    lastModified: nowIso,
                    dtStamp: nowIso,
                    sequence: masterSequence + 1,
                    xProps: masterXProps,
                };

                registerRollback(
                    applyOptimisticCalendarItem({
                        ...masterEvent,
                        ...nextMasterPatch,
                        id: masterEvent.id,
                    } as CalendarItem)
                );

                const txOps: any[] = [tx.calendarItems[masterEvent.id].update(nextMasterPatch)];
                const relatedOverrides = calendarItems.filter((candidate) => {
                    return isRecurringChildOfMaster(candidate, masterEvent) && !normalizeRruleString(String(candidate.rrule || ''));
                });
                for (const overrideItem of relatedOverrides) {
                    const overrideStartDate = parseISO(String(overrideItem.startDate));
                    const overrideEndDate = parseISO(String(overrideItem.endDate));
                    if (Number.isNaN(overrideStartDate.getTime()) || Number.isNaN(overrideEndDate.getTime())) {
                        continue;
                    }

                    const shiftedOverrideStart = overrideItem.isAllDay
                        ? format(addDays(overrideStartDate, dayDelta), 'yyyy-MM-dd')
                        : addMilliseconds(overrideStartDate, deltaMs).toISOString();
                    const shiftedOverrideEnd = overrideItem.isAllDay
                        ? format(addDays(overrideEndDate, dayDelta), 'yyyy-MM-dd')
                        : addMilliseconds(overrideEndDate, deltaMs).toISOString();
                    const overrideDayAnchor = parseISO(overrideItem.isAllDay ? `${shiftedOverrideStart}T00:00:00` : shiftedOverrideStart);
                    if (Number.isNaN(overrideDayAnchor.getTime())) {
                        continue;
                    }

                    const nextOverridePatch: Record<string, any> = {
                        startDate: shiftedOverrideStart,
                        endDate: shiftedOverrideEnd,
                        year: overrideDayAnchor.getFullYear(),
                        month: overrideDayAnchor.getMonth() + 1,
                        dayOfMonth: overrideDayAnchor.getDate(),
                        recurrenceId: overrideItem.isAllDay
                            ? shiftRecurrenceTokenByDays(String(overrideItem.recurrenceId || overrideItem.startDate || ''), dayDelta, true)
                            : shiftRecurrenceTokenByDuration(String(overrideItem.recurrenceId || overrideItem.startDate || ''), deltaMs, false),
                        updatedAt: nowIso,
                        lastModified: nowIso,
                        dtStamp: nowIso,
                        sequence: typeof overrideItem.sequence === 'number' ? overrideItem.sequence + 1 : 1,
                    };

                    registerRollback(
                        applyOptimisticCalendarItem({
                            ...overrideItem,
                            ...nextOverridePatch,
                            id: overrideItem.id,
                        } as CalendarItem)
                    );
                    txOps.push(tx.calendarItems[overrideItem.id].update(nextOverridePatch));
                }

                void (async () => {
                    try {
                        await db.transact(
                            appendCalendarHistoryTransactions(txOps, {
                                occurredAt: nowIso,
                                actionType: 'calendar_event_moved',
                                summary: `Moved all events in "${eventTitle}" series`,
                                calendarItemId: masterEvent.id,
                                affectedMemberIds: masterAffectedMemberIds,
                                title: eventTitle,
                                beforeSnapshot: buildCalendarHistorySnapshot(event),
                                afterSnapshot: buildCalendarHistorySnapshot({
                                    startDate: nextStartDate,
                                    endDate: nextEndDate,
                                    isAllDay: event.isAllDay,
                                    timeZone: event.timeZone || masterEvent.timeZone || null,
                                }),
                                metadata: {
                                    scope: 'all',
                                    recurring: true,
                                },
                            })
                        );
                    } catch (error) {
                        console.error('Calendar recurring series move failed:', error);
                        rollbackAll();
                    }
                })();
                return;
            }

            const masterStart = parseISO(masterEvent.startDate);
            const isFirstOccurrence = !Number.isNaN(masterStart.getTime()) && masterStart.getTime() === sourceStartForRecurrence.getTime();

            if (isFirstOccurrence) {
                doSimpleMove(masterEvent);
                return;
            }

            const cappedMasterRrule = capRruleBeforeOccurrence(masterRrule, sourceStartForRecurrence, event.isAllDay);
            const oldSeriesRdates = partitionRecurrenceTokensByBoundary(baseRdateTokens, sourceStartForRecurrence, event.isAllDay);
            const oldSeriesExdates = partitionRecurrenceTokensByBoundary(baseExdateTokens, sourceStartForRecurrence, event.isAllDay);
            const masterXProps =
                masterEvent.xProps && typeof masterEvent.xProps === 'object' && !Array.isArray(masterEvent.xProps)
                    ? { ...(masterEvent.xProps as Record<string, unknown>) }
                    : {};
            const oldExceptionRowsSplit = splitRecurrenceRowsAtBoundary(
                normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceExceptionRows),
                boundaryDateOnly
            );
            const oldRdateRowsSplit = splitRecurrenceRowsAtBoundary(
                normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceRdateRows),
                boundaryDateOnly
            );
            const oldSeriesXProps = { ...masterXProps };
            const newSeriesXProps = { ...masterXProps };
            if (oldExceptionRowsSplit.before.length > 0) {
                oldSeriesXProps.recurrenceExceptionRows = oldExceptionRowsSplit.before;
            } else {
                delete oldSeriesXProps.recurrenceExceptionRows;
            }
            if (oldExceptionRowsSplit.onOrAfter.length > 0) {
                newSeriesXProps.recurrenceExceptionRows = oldExceptionRowsSplit.onOrAfter;
            } else {
                delete newSeriesXProps.recurrenceExceptionRows;
            }
            if (oldRdateRowsSplit.before.length > 0) {
                oldSeriesXProps.recurrenceRdateRows = oldRdateRowsSplit.before;
            } else {
                delete oldSeriesXProps.recurrenceRdateRows;
            }
            if (oldRdateRowsSplit.onOrAfter.length > 0) {
                newSeriesXProps.recurrenceRdateRows = oldRdateRowsSplit.onOrAfter;
            } else {
                delete newSeriesXProps.recurrenceRdateRows;
            }

            const oldSeriesPatch: Record<string, any> = {
                rrule: cappedMasterRrule,
                rdates: oldSeriesRdates.before,
                exdates: oldSeriesExdates.before,
                recurrenceLines: buildRecurrenceLines(cappedMasterRrule, oldSeriesRdates.before, oldSeriesExdates.before),
                updatedAt: nowIso,
                lastModified: nowIso,
                dtStamp: nowIso,
                sequence: masterSequence + 1,
                xProps: oldSeriesXProps,
            };

            const newSeriesId = id();
            const newSeriesMembers = Array.isArray(masterEvent.pertainsTo) ? masterEvent.pertainsTo : [];
            const shiftedSplitRrule = shiftRruleForSeriesMove(masterRrule, sourceStartForRecurrence, destinationStartForRecurrence);
            const shiftedSplitRdates = normalizeRecurrenceTokens(
                oldSeriesRdates.onOrAfter.map((token) =>
                    event.isAllDay
                        ? shiftRecurrenceTokenByDays(token, dayDelta, true)
                        : shiftRecurrenceTokenByDuration(token, deltaMs, false)
                )
            );
            const shiftedSplitExdates = normalizeRecurrenceTokens(
                oldSeriesExdates.onOrAfter.map((token) =>
                    event.isAllDay
                        ? shiftRecurrenceTokenByDays(token, dayDelta, true)
                        : shiftRecurrenceTokenByDuration(token, deltaMs, false)
                )
            );
            const shiftedSplitExceptionRows = shiftStoredRecurrenceRowsByDays(oldExceptionRowsSplit.onOrAfter, dayDelta);
            const shiftedSplitRdateRows = shiftStoredRecurrenceRowsByDays(oldRdateRowsSplit.onOrAfter, dayDelta);
            if (shiftedSplitExceptionRows.length > 0) {
                newSeriesXProps.recurrenceExceptionRows = shiftedSplitExceptionRows;
            } else {
                delete newSeriesXProps.recurrenceExceptionRows;
            }
            if (shiftedSplitRdateRows.length > 0) {
                newSeriesXProps.recurrenceRdateRows = shiftedSplitRdateRows;
            } else {
                delete newSeriesXProps.recurrenceRdateRows;
            }
            const newSeriesPayload: Record<string, any> = {
                ...legacyPayload,
                title: String(event.title || masterEvent.title || ''),
                description: String(event.description || masterEvent.description || ''),
                isAllDay: event.isAllDay,
                startDate: nextStartDate,
                endDate: nextEndDate,
                uid: `${String(masterEvent.uid || masterEvent.id)}-split-${newSeriesId}`,
                sequence: 0,
                status: String(event.status || masterEvent.status || 'confirmed'),
                createdAt: nowIso,
                updatedAt: nowIso,
                dtStamp: nowIso,
                lastModified: nowIso,
                location: String(event.location || masterEvent.location || ''),
                timeZone: String(event.timeZone || masterEvent.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
                rrule: shiftedSplitRrule,
                rdates: shiftedSplitRdates,
                exdates: shiftedSplitExdates,
                recurrenceLines: buildRecurrenceLines(shiftedSplitRrule, shiftedSplitRdates, shiftedSplitExdates),
                recurrenceId: '',
                recurringEventId: '',
                recurrenceIdRange: '',
                alarms: event.alarms || masterEvent.alarms || [],
                eventType: String(event.eventType || masterEvent.eventType || 'default'),
                visibility: String(event.visibility || masterEvent.visibility || 'default'),
                transparency: String(event.transparency || masterEvent.transparency || (event.isAllDay ? 'transparent' : 'opaque')),
                xProps: newSeriesXProps,
                ...(typeof event.travelDurationBeforeMinutes === 'number'
                    ? { travelDurationBeforeMinutes: event.travelDurationBeforeMinutes }
                    : typeof masterEvent.travelDurationBeforeMinutes === 'number'
                      ? { travelDurationBeforeMinutes: masterEvent.travelDurationBeforeMinutes }
                      : {}),
                ...(typeof event.travelDurationAfterMinutes === 'number'
                    ? { travelDurationAfterMinutes: event.travelDurationAfterMinutes }
                    : typeof masterEvent.travelDurationAfterMinutes === 'number'
                      ? { travelDurationAfterMinutes: masterEvent.travelDurationAfterMinutes }
                      : {}),
            };

            const boundaryTime = event.isAllDay
                ? parseISO(`${boundaryDateOnly}T00:00:00`).getTime()
                : sourceStartForRecurrence.getTime();
            const overridesToMove = calendarItems.filter((candidate) => {
                if (!isRecurringChildOfMaster(candidate, masterEvent)) return false;
                const recurrenceRefToken =
                    typeof candidate.recurrenceId === 'string' && candidate.recurrenceId.trim()
                        ? candidate.recurrenceId
                        : candidate.startDate;
                const recurrenceRefDate = parseRecurrenceDateToken(String(recurrenceRefToken || ''));
                if (!recurrenceRefDate) return false;
                const recurrenceTime = candidate.isAllDay
                    ? parseISO(`${format(recurrenceRefDate, 'yyyy-MM-dd')}T00:00:00`).getTime()
                    : recurrenceRefDate.getTime();
                return recurrenceTime >= boundaryTime;
            });

            registerRollback(
                applyOptimisticCalendarItem({
                    ...masterEvent,
                    ...oldSeriesPatch,
                    id: masterEvent.id,
                } as CalendarItem)
            );
            registerRollback(
                applyOptimisticCalendarItem({
                    ...masterEvent,
                    ...newSeriesPayload,
                    id: newSeriesId,
                    pertainsTo: newSeriesMembers,
                } as CalendarItem)
            );

            const txOps: any[] = [tx.calendarItems[masterEvent.id].update(oldSeriesPatch), tx.calendarItems[newSeriesId].update(newSeriesPayload)];
            for (const member of newSeriesMembers) {
                if (member?.id) {
                    txOps.push(tx.calendarItems[newSeriesId].link({ pertainsTo: member.id }));
                }
            }
            for (const override of overridesToMove) {
                const overrideStartDate = parseISO(String(override.startDate));
                const overrideEndDate = parseISO(String(override.endDate));
                const shiftedOverrideStart =
                    !Number.isNaN(overrideStartDate.getTime()) && !Number.isNaN(overrideEndDate.getTime())
                        ? override.isAllDay
                            ? format(addDays(overrideStartDate, dayDelta), 'yyyy-MM-dd')
                            : addMilliseconds(overrideStartDate, deltaMs).toISOString()
                        : override.startDate;
                const shiftedOverrideEnd =
                    !Number.isNaN(overrideStartDate.getTime()) && !Number.isNaN(overrideEndDate.getTime())
                        ? override.isAllDay
                            ? format(addDays(overrideEndDate, dayDelta), 'yyyy-MM-dd')
                            : addMilliseconds(overrideEndDate, deltaMs).toISOString()
                        : override.endDate;
                const shiftedOverrideAnchor = parseISO(override.isAllDay ? `${shiftedOverrideStart}T00:00:00` : shiftedOverrideStart);
                const overridePatch = {
                    startDate: shiftedOverrideStart,
                    endDate: shiftedOverrideEnd,
                    year: Number.isNaN(shiftedOverrideAnchor.getTime()) ? override.year : shiftedOverrideAnchor.getFullYear(),
                    month: Number.isNaN(shiftedOverrideAnchor.getTime()) ? override.month : shiftedOverrideAnchor.getMonth() + 1,
                    dayOfMonth: Number.isNaN(shiftedOverrideAnchor.getTime()) ? override.dayOfMonth : shiftedOverrideAnchor.getDate(),
                    recurrenceId: override.isAllDay
                        ? shiftRecurrenceTokenByDays(String(override.recurrenceId || override.startDate || ''), dayDelta, true)
                        : shiftRecurrenceTokenByDuration(String(override.recurrenceId || override.startDate || ''), deltaMs, false),
                    recurringEventId: newSeriesId,
                    updatedAt: nowIso,
                    lastModified: nowIso,
                    dtStamp: nowIso,
                    sequence: typeof override.sequence === 'number' ? override.sequence + 1 : 1,
                };
                registerRollback(
                    applyOptimisticCalendarItem({
                        ...override,
                        ...overridePatch,
                        id: override.id,
                    } as CalendarItem)
                );
                txOps.push(tx.calendarItems[override.id].update(overridePatch));
            }

            void (async () => {
                try {
                    await db.transact(
                        appendCalendarHistoryTransactions(txOps, {
                            occurredAt: nowIso,
                            actionType: 'calendar_event_moved',
                            summary: `Moved following events in "${eventTitle}" series`,
                            calendarItemId: newSeriesId,
                            affectedMemberIds: newSeriesMembers.map((member) => member?.id).filter(Boolean) as string[],
                            title: eventTitle,
                            beforeSnapshot: buildCalendarHistorySnapshot(event),
                            afterSnapshot: buildCalendarHistorySnapshot(newSeriesPayload),
                            metadata: {
                                scope: 'following',
                                recurring: true,
                            },
                        })
                    );
                } catch (error) {
                    console.error('Calendar recurring split move failed:', error);
                    rollbackAll();
                }
            })();
        },
        [
            applyOptimisticCalendarItem,
            appendCalendarHistoryTransactions,
            calendarItems,
            getForcedRecurrenceScopeFromInput,
            isOriginalSeriesOccurrence,
            requestRecurrenceScope,
        ]
    );

    const applyCalendarTimedResizeUpdate = useCallback(
        async ({
            item,
            nextStartDate,
            nextEndDate,
            input,
        }: {
            item: CalendarItem;
            nextStartDate: string;
            nextEndDate: string;
            input?: { altKey?: boolean; shiftKey?: boolean } | null;
        }) => {
            const currentStart = parseISO(item.startDate);
            const currentEnd = parseISO(item.endDate);
            const nextStart = parseISO(nextStartDate);
            const nextEnd = parseISO(nextEndDate);
            if (
                Number.isNaN(currentStart.getTime()) ||
                Number.isNaN(currentEnd.getTime()) ||
                Number.isNaN(nextStart.getTime()) ||
                Number.isNaN(nextEnd.getTime()) ||
                nextEnd.getTime() <= nextStart.getTime()
            ) {
                return;
            }
            if (currentStart.getTime() === nextStart.getTime() && currentEnd.getTime() === nextEnd.getTime()) {
                return;
            }

            const startDeltaMs = nextStart.getTime() - currentStart.getTime();
            const endDeltaMs = nextEnd.getTime() - currentEnd.getTime();
            const dayDelta = differenceInDays(startOfDayDate(nextStart), startOfDayDate(currentStart));
            const nowIso = new Date().toISOString();
            const itemTitle = String(item.title || 'Untitled event');
            const itemAffectedMemberIds = Array.from(
                new Set((Array.isArray(item.pertainsTo) ? item.pertainsTo : []).map((member) => member?.id).filter(Boolean))
            ) as string[];
            const legacyPayload = {
                startDate: nextStartDate,
                endDate: nextEndDate,
                year: nextStart.getFullYear(),
                month: nextStart.getMonth() + 1,
                dayOfMonth: nextStart.getDate(),
            };

            const doSimpleResize = (targetEvent: CalendarItem) => {
                const nextSequence = typeof targetEvent.sequence === 'number' ? targetEvent.sequence + 1 : 1;
                const fullPayload = {
                    ...legacyPayload,
                    updatedAt: nowIso,
                    lastModified: nowIso,
                    dtStamp: nowIso,
                    sequence: nextSequence,
                };
                const rollbackOptimisticMove = applyOptimisticCalendarItem({
                    ...targetEvent,
                    ...fullPayload,
                    id: targetEvent.id,
                } as CalendarItem);

                void (async () => {
                    try {
                        await db.transact(
                            appendCalendarHistoryTransactions([tx.calendarItems[targetEvent.id].update(fullPayload)], {
                                occurredAt: nowIso,
                                actionType: 'calendar_event_resized',
                                summary: `Resized event "${String(targetEvent.title || itemTitle)}"`,
                                calendarItemId: targetEvent.id,
                                affectedMemberIds: Array.from(
                                    new Set((Array.isArray(targetEvent.pertainsTo) ? targetEvent.pertainsTo : []).map((member) => member?.id).filter(Boolean))
                                ),
                                title: String(targetEvent.title || itemTitle),
                                beforeSnapshot: buildCalendarHistorySnapshot(item),
                                afterSnapshot: buildCalendarHistorySnapshot({
                                    startDate: nextStartDate,
                                    endDate: nextEndDate,
                                    isAllDay: targetEvent.isAllDay,
                                    timeZone: targetEvent.timeZone || item.timeZone || null,
                                }),
                                metadata: {
                                    scope: 'single',
                                },
                            })
                        );
                    } catch (error) {
                        console.error('Calendar resize failed:', error);
                        rollbackOptimisticMove();
                    }
                })();
            };

            const masterEvent = (((item as any).__masterEvent as CalendarItem | undefined) || item) as CalendarItem;
            const masterRrule = normalizeRruleString(String(masterEvent.rrule || ''));
            if (!masterRrule) {
                doSimpleResize(item);
                return;
            }

            const forcedRecurrenceScope = getForcedRecurrenceScopeFromInput(input, item, masterEvent);
            const recurrenceScope =
                forcedRecurrenceScope ??
                (await requestRecurrenceScope('drag', isOriginalSeriesOccurrence(item, masterEvent) ? 'all' : 'following'));
            if (recurrenceScope === 'cancel') {
                return;
            }

            const sourceStartForRecurrence = parseISO(item.startDate);
            if (Number.isNaN(sourceStartForRecurrence.getTime())) {
                return;
            }
            const recurrenceReferenceToken = sourceStartForRecurrence.toISOString();
            const boundaryDateOnly = format(sourceStartForRecurrence, 'yyyy-MM-dd');
            const baseRdateTokens = normalizeRecurrenceTokens([
                ...splitDateTokens(masterEvent.rdates),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'RDATE'),
            ]);
            const baseExdateTokens = normalizeRecurrenceTokens([
                ...splitDateTokens(masterEvent.exdates),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'EXDATE'),
            ]);
            const masterSequence = typeof masterEvent.sequence === 'number' ? masterEvent.sequence : 0;

            const rollbackOptimisticHandlers: Array<() => void> = [];
            const registerRollback = (rollback: (() => void) | void) => {
                if (typeof rollback === 'function') {
                    rollbackOptimisticHandlers.push(rollback);
                }
            };
            const rollbackAll = () => {
                while (rollbackOptimisticHandlers.length > 0) {
                    const rollback = rollbackOptimisticHandlers.pop();
                    try {
                        rollback?.();
                    } catch (error) {
                        console.error('Unable to rollback optimistic calendar resize:', error);
                    }
                }
            };

            if (recurrenceScope === 'single') {
                if (String(item.recurringEventId || '').trim()) {
                    const overridePatch: Record<string, any> = {
                        ...legacyPayload,
                        updatedAt: nowIso,
                        lastModified: nowIso,
                        dtStamp: nowIso,
                        sequence: typeof item.sequence === 'number' ? item.sequence + 1 : 1,
                    };

                    registerRollback(
                        applyOptimisticCalendarItem({
                            ...item,
                            ...overridePatch,
                            id: item.id,
                        } as CalendarItem)
                    );

                    void (async () => {
                        try {
                            await db.transact(
                                appendCalendarHistoryTransactions([tx.calendarItems[item.id].update(overridePatch)], {
                                    occurredAt: nowIso,
                                    actionType: 'calendar_event_resized',
                                    summary: `Resized occurrence of "${itemTitle}"`,
                                    calendarItemId: item.id,
                                    affectedMemberIds: itemAffectedMemberIds,
                                    title: itemTitle,
                                    beforeSnapshot: buildCalendarHistorySnapshot(item),
                                    afterSnapshot: buildCalendarHistorySnapshot({
                                        startDate: nextStartDate,
                                        endDate: nextEndDate,
                                        isAllDay: item.isAllDay,
                                        timeZone: item.timeZone || masterEvent.timeZone || null,
                                    }),
                                    metadata: {
                                        scope: 'single',
                                        recurring: true,
                                    },
                                })
                            );
                        } catch (error) {
                            console.error('Calendar recurring override resize failed:', error);
                            rollbackAll();
                        }
                    })();
                    return;
                }

                const nextMasterExdates = normalizeRecurrenceTokens([...baseExdateTokens, recurrenceReferenceToken]);
                const nextMasterPatch: Record<string, any> = {
                    exdates: nextMasterExdates,
                    recurrenceLines: buildRecurrenceLines(masterRrule, baseRdateTokens, nextMasterExdates),
                    updatedAt: nowIso,
                    lastModified: nowIso,
                    dtStamp: nowIso,
                    sequence: masterSequence + 1,
                };
                const overrideId = id();
                const overrideMembers = Array.isArray(item.pertainsTo)
                    ? item.pertainsTo
                    : Array.isArray(masterEvent.pertainsTo)
                      ? masterEvent.pertainsTo
                      : [];
                const overridePayload: Record<string, any> = {
                    ...legacyPayload,
                    title: String(item.title || masterEvent.title || ''),
                    description: String(item.description || masterEvent.description || ''),
                    isAllDay: false,
                    startDate: nextStartDate,
                    endDate: nextEndDate,
                    uid: `${String(masterEvent.uid || masterEvent.id)}-${recurrenceReferenceToken}`,
                    sequence: 0,
                    status: String(item.status || masterEvent.status || 'confirmed'),
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    dtStamp: nowIso,
                    lastModified: nowIso,
                    location: String(item.location || masterEvent.location || ''),
                    timeZone: String(item.timeZone || masterEvent.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
                    rrule: '',
                    rdates: [],
                    exdates: [],
                    recurrenceLines: [],
                    recurrenceId: recurrenceReferenceToken,
                    recurringEventId: String(masterEvent.id),
                    recurrenceIdRange: '',
                    alarms: item.alarms || masterEvent.alarms || [],
                    eventType: String(item.eventType || masterEvent.eventType || 'default'),
                    visibility: String(item.visibility || masterEvent.visibility || 'default'),
                    transparency: String(item.transparency || masterEvent.transparency || 'opaque'),
                };

                registerRollback(applyOptimisticCalendarItem({ ...masterEvent, ...nextMasterPatch, id: masterEvent.id } as CalendarItem));
                registerRollback(
                    applyOptimisticCalendarItem({
                        ...item,
                        ...overridePayload,
                        id: overrideId,
                        pertainsTo: overrideMembers,
                    } as CalendarItem)
                );

                const txOps: any[] = [tx.calendarItems[masterEvent.id].update(nextMasterPatch), tx.calendarItems[overrideId].update(overridePayload)];
                for (const member of overrideMembers) {
                    if (member?.id) {
                        txOps.push(tx.calendarItems[overrideId].link({ pertainsTo: member.id }));
                    }
                }

                void (async () => {
                    try {
                        await db.transact(
                            appendCalendarHistoryTransactions(txOps, {
                                occurredAt: nowIso,
                                actionType: 'calendar_event_resized',
                                summary: `Resized occurrence of "${itemTitle}"`,
                                calendarItemId: overrideId,
                                affectedMemberIds: overrideMembers.map((member) => member?.id).filter(Boolean) as string[],
                                title: itemTitle,
                                beforeSnapshot: buildCalendarHistorySnapshot(item),
                                afterSnapshot: buildCalendarHistorySnapshot(overridePayload),
                                metadata: {
                                    scope: 'single',
                                    recurring: true,
                                },
                            })
                        );
                    } catch (error) {
                        console.error('Calendar recurring single resize failed:', error);
                        rollbackAll();
                    }
                })();
                return;
            }

            if (recurrenceScope === 'all') {
                const shiftedRdates = normalizeRecurrenceTokens(
                    baseRdateTokens.map((token) => shiftRecurrenceTokenByDuration(token, startDeltaMs, false))
                );
                const shiftedExdates = normalizeRecurrenceTokens(
                    baseExdateTokens.map((token) => shiftRecurrenceTokenByDuration(token, startDeltaMs, false))
                );
                const masterXProps =
                    masterEvent.xProps && typeof masterEvent.xProps === 'object' && !Array.isArray(masterEvent.xProps)
                        ? { ...(masterEvent.xProps as Record<string, unknown>) }
                        : {};
                const shiftedExceptionRows = shiftStoredRecurrenceRowsByDays(
                    normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceExceptionRows),
                    dayDelta
                );
                const shiftedRdateRows = shiftStoredRecurrenceRowsByDays(
                    normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceRdateRows),
                    dayDelta
                );
                if (shiftedExceptionRows.length > 0) {
                    masterXProps.recurrenceExceptionRows = shiftedExceptionRows;
                } else {
                    delete masterXProps.recurrenceExceptionRows;
                }
                if (shiftedRdateRows.length > 0) {
                    masterXProps.recurrenceRdateRows = shiftedRdateRows;
                } else {
                    delete masterXProps.recurrenceRdateRows;
                }

                const masterStartParsed = parseISO(masterEvent.startDate);
                const masterEndParsed = parseISO(masterEvent.endDate);
                const masterShiftedStart = addMilliseconds(masterStartParsed, startDeltaMs).toISOString();
                const masterShiftedEnd = addMilliseconds(masterEndParsed, endDeltaMs).toISOString();
                const masterShiftedAnchor = addMilliseconds(masterStartParsed, startDeltaMs);
                const nextMasterPatch: Record<string, any> = {
                    startDate: masterShiftedStart,
                    endDate: masterShiftedEnd,
                    year: masterShiftedAnchor.getFullYear(),
                    month: masterShiftedAnchor.getMonth() + 1,
                    dayOfMonth: masterShiftedAnchor.getDate(),
                    rdates: shiftedRdates,
                    exdates: shiftedExdates,
                    recurrenceLines: buildRecurrenceLines(masterRrule, shiftedRdates, shiftedExdates),
                    updatedAt: nowIso,
                    lastModified: nowIso,
                    dtStamp: nowIso,
                    sequence: masterSequence + 1,
                    xProps: masterXProps,
                };

                registerRollback(applyOptimisticCalendarItem({ ...masterEvent, ...nextMasterPatch, id: masterEvent.id } as CalendarItem));

                const txOps: any[] = [tx.calendarItems[masterEvent.id].update(nextMasterPatch)];
                const relatedOverrides = calendarItems.filter((candidate) => {
                    return isRecurringChildOfMaster(candidate, masterEvent) && !normalizeRruleString(String(candidate.rrule || ''));
                });
                for (const overrideItem of relatedOverrides) {
                    const overrideStartDate = parseISO(String(overrideItem.startDate));
                    const overrideEndDate = parseISO(String(overrideItem.endDate));
                    if (Number.isNaN(overrideStartDate.getTime()) || Number.isNaN(overrideEndDate.getTime())) {
                        continue;
                    }

                    const shiftedOverrideStart = addMilliseconds(overrideStartDate, startDeltaMs).toISOString();
                    const shiftedOverrideEnd = addMilliseconds(overrideEndDate, endDeltaMs).toISOString();
                    const overrideAnchor = parseISO(shiftedOverrideStart);
                    const nextOverridePatch: Record<string, any> = {
                        startDate: shiftedOverrideStart,
                        endDate: shiftedOverrideEnd,
                        year: overrideAnchor.getFullYear(),
                        month: overrideAnchor.getMonth() + 1,
                        dayOfMonth: overrideAnchor.getDate(),
                        recurrenceId: shiftRecurrenceTokenByDuration(
                            String(overrideItem.recurrenceId || overrideItem.startDate || ''),
                            startDeltaMs,
                            false
                        ),
                        updatedAt: nowIso,
                        lastModified: nowIso,
                        dtStamp: nowIso,
                        sequence: typeof overrideItem.sequence === 'number' ? overrideItem.sequence + 1 : 1,
                    };
                    registerRollback(
                        applyOptimisticCalendarItem({
                            ...overrideItem,
                            ...nextOverridePatch,
                            id: overrideItem.id,
                        } as CalendarItem)
                    );
                    txOps.push(tx.calendarItems[overrideItem.id].update(nextOverridePatch));
                }

                void (async () => {
                    try {
                        await db.transact(
                            appendCalendarHistoryTransactions(txOps, {
                                occurredAt: nowIso,
                                actionType: 'calendar_event_resized',
                                summary: `Resized all events in "${itemTitle}" series`,
                                calendarItemId: masterEvent.id,
                                affectedMemberIds: Array.from(
                                    new Set((Array.isArray(masterEvent.pertainsTo) ? masterEvent.pertainsTo : []).map((member) => member?.id).filter(Boolean))
                                ),
                                title: itemTitle,
                                beforeSnapshot: buildCalendarHistorySnapshot(item),
                                afterSnapshot: buildCalendarHistorySnapshot({
                                    startDate: nextStartDate,
                                    endDate: nextEndDate,
                                    isAllDay: item.isAllDay,
                                    timeZone: item.timeZone || masterEvent.timeZone || null,
                                }),
                                metadata: {
                                    scope: 'all',
                                    recurring: true,
                                },
                            })
                        );
                    } catch (error) {
                        console.error('Calendar recurring series resize failed:', error);
                        rollbackAll();
                    }
                })();
                return;
            }

            const masterStart = parseISO(masterEvent.startDate);
            const isFirstOccurrence = !Number.isNaN(masterStart.getTime()) && masterStart.getTime() === sourceStartForRecurrence.getTime();
            if (isFirstOccurrence) {
                doSimpleResize(masterEvent);
                return;
            }

            const cappedMasterRrule = capRruleBeforeOccurrence(masterRrule, sourceStartForRecurrence, false);
            const oldSeriesRdates = partitionRecurrenceTokensByBoundary(baseRdateTokens, sourceStartForRecurrence, false);
            const oldSeriesExdates = partitionRecurrenceTokensByBoundary(baseExdateTokens, sourceStartForRecurrence, false);
            const masterXProps =
                masterEvent.xProps && typeof masterEvent.xProps === 'object' && !Array.isArray(masterEvent.xProps)
                    ? { ...(masterEvent.xProps as Record<string, unknown>) }
                    : {};
            const oldExceptionRowsSplit = splitRecurrenceRowsAtBoundary(
                normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceExceptionRows),
                boundaryDateOnly
            );
            const oldRdateRowsSplit = splitRecurrenceRowsAtBoundary(
                normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceRdateRows),
                boundaryDateOnly
            );
            const oldSeriesXProps = { ...masterXProps };
            const newSeriesXProps = { ...masterXProps };
            if (oldExceptionRowsSplit.before.length > 0) {
                oldSeriesXProps.recurrenceExceptionRows = oldExceptionRowsSplit.before;
            } else {
                delete oldSeriesXProps.recurrenceExceptionRows;
            }
            if (oldExceptionRowsSplit.onOrAfter.length > 0) {
                newSeriesXProps.recurrenceExceptionRows = oldExceptionRowsSplit.onOrAfter;
            } else {
                delete newSeriesXProps.recurrenceExceptionRows;
            }
            if (oldRdateRowsSplit.before.length > 0) {
                oldSeriesXProps.recurrenceRdateRows = oldRdateRowsSplit.before;
            } else {
                delete oldSeriesXProps.recurrenceRdateRows;
            }
            if (oldRdateRowsSplit.onOrAfter.length > 0) {
                newSeriesXProps.recurrenceRdateRows = oldRdateRowsSplit.onOrAfter;
            } else {
                delete newSeriesXProps.recurrenceRdateRows;
            }

            const oldSeriesPatch: Record<string, any> = {
                rrule: cappedMasterRrule,
                rdates: oldSeriesRdates.before,
                exdates: oldSeriesExdates.before,
                recurrenceLines: buildRecurrenceLines(cappedMasterRrule, oldSeriesRdates.before, oldSeriesExdates.before),
                updatedAt: nowIso,
                lastModified: nowIso,
                dtStamp: nowIso,
                sequence: masterSequence + 1,
                xProps: oldSeriesXProps,
            };

            const newSeriesId = id();
            const newSeriesMembers = Array.isArray(masterEvent.pertainsTo) ? masterEvent.pertainsTo : [];
            const shiftedSplitRdates = normalizeRecurrenceTokens(
                oldSeriesRdates.onOrAfter.map((token) => shiftRecurrenceTokenByDuration(token, startDeltaMs, false))
            );
            const shiftedSplitExdates = normalizeRecurrenceTokens(
                oldSeriesExdates.onOrAfter.map((token) => shiftRecurrenceTokenByDuration(token, startDeltaMs, false))
            );
            const shiftedSplitExceptionRows = shiftStoredRecurrenceRowsByDays(oldExceptionRowsSplit.onOrAfter, dayDelta);
            const shiftedSplitRdateRows = shiftStoredRecurrenceRowsByDays(oldRdateRowsSplit.onOrAfter, dayDelta);
            if (shiftedSplitExceptionRows.length > 0) {
                newSeriesXProps.recurrenceExceptionRows = shiftedSplitExceptionRows;
            } else {
                delete newSeriesXProps.recurrenceExceptionRows;
            }
            if (shiftedSplitRdateRows.length > 0) {
                newSeriesXProps.recurrenceRdateRows = shiftedSplitRdateRows;
            } else {
                delete newSeriesXProps.recurrenceRdateRows;
            }
            const newSeriesPayload: Record<string, any> = {
                ...legacyPayload,
                title: String(item.title || masterEvent.title || ''),
                description: String(item.description || masterEvent.description || ''),
                isAllDay: false,
                startDate: nextStartDate,
                endDate: nextEndDate,
                uid: `${String(masterEvent.uid || masterEvent.id)}-split-${newSeriesId}`,
                sequence: 0,
                status: String(item.status || masterEvent.status || 'confirmed'),
                createdAt: nowIso,
                updatedAt: nowIso,
                dtStamp: nowIso,
                lastModified: nowIso,
                location: String(item.location || masterEvent.location || ''),
                timeZone: String(item.timeZone || masterEvent.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
                rrule: masterRrule,
                rdates: shiftedSplitRdates,
                exdates: shiftedSplitExdates,
                recurrenceLines: buildRecurrenceLines(masterRrule, shiftedSplitRdates, shiftedSplitExdates),
                recurrenceId: '',
                recurringEventId: '',
                recurrenceIdRange: '',
                alarms: item.alarms || masterEvent.alarms || [],
                eventType: String(item.eventType || masterEvent.eventType || 'default'),
                visibility: String(item.visibility || masterEvent.visibility || 'default'),
                transparency: String(item.transparency || masterEvent.transparency || 'opaque'),
                xProps: newSeriesXProps,
            };

            const boundaryTime = sourceStartForRecurrence.getTime();
            const overridesToMove = calendarItems.filter((candidate) => {
                if (!isRecurringChildOfMaster(candidate, masterEvent)) return false;
                const recurrenceRefToken =
                    typeof candidate.recurrenceId === 'string' && candidate.recurrenceId.trim()
                        ? candidate.recurrenceId
                        : candidate.startDate;
                const recurrenceRefDate = parseRecurrenceDateToken(String(recurrenceRefToken || ''));
                return Boolean(recurrenceRefDate && recurrenceRefDate.getTime() >= boundaryTime);
            });

            registerRollback(applyOptimisticCalendarItem({ ...masterEvent, ...oldSeriesPatch, id: masterEvent.id } as CalendarItem));
            registerRollback(
                applyOptimisticCalendarItem({
                    ...masterEvent,
                    ...newSeriesPayload,
                    id: newSeriesId,
                    pertainsTo: newSeriesMembers,
                } as CalendarItem)
            );

            const txOps: any[] = [tx.calendarItems[masterEvent.id].update(oldSeriesPatch), tx.calendarItems[newSeriesId].update(newSeriesPayload)];
            for (const member of newSeriesMembers) {
                if (member?.id) {
                    txOps.push(tx.calendarItems[newSeriesId].link({ pertainsTo: member.id }));
                }
            }
            for (const override of overridesToMove) {
                const overrideStartDate = parseISO(String(override.startDate));
                const overrideEndDate = parseISO(String(override.endDate));
                if (Number.isNaN(overrideStartDate.getTime()) || Number.isNaN(overrideEndDate.getTime())) {
                    continue;
                }

                const shiftedOverrideStart = addMilliseconds(overrideStartDate, startDeltaMs).toISOString();
                const shiftedOverrideEnd = addMilliseconds(overrideEndDate, endDeltaMs).toISOString();
                const shiftedOverrideAnchor = parseISO(shiftedOverrideStart);
                const overridePatch = {
                    startDate: shiftedOverrideStart,
                    endDate: shiftedOverrideEnd,
                    year: shiftedOverrideAnchor.getFullYear(),
                    month: shiftedOverrideAnchor.getMonth() + 1,
                    dayOfMonth: shiftedOverrideAnchor.getDate(),
                    recurrenceId: shiftRecurrenceTokenByDuration(
                        String(override.recurrenceId || override.startDate || ''),
                        startDeltaMs,
                        false
                    ),
                    recurringEventId: newSeriesId,
                    updatedAt: nowIso,
                    lastModified: nowIso,
                    dtStamp: nowIso,
                    sequence: typeof override.sequence === 'number' ? override.sequence + 1 : 1,
                };
                registerRollback(
                    applyOptimisticCalendarItem({
                        ...override,
                        ...overridePatch,
                        id: override.id,
                    } as CalendarItem)
                );
                txOps.push(tx.calendarItems[override.id].update(overridePatch));
            }

                void (async () => {
                    try {
                        await db.transact(
                            appendCalendarHistoryTransactions(txOps, {
                                occurredAt: nowIso,
                                actionType: 'calendar_event_resized',
                                summary: `Resized following events in "${itemTitle}" series`,
                                calendarItemId: newSeriesId,
                                affectedMemberIds: newSeriesMembers.map((member) => member?.id).filter(Boolean) as string[],
                                title: itemTitle,
                                beforeSnapshot: buildCalendarHistorySnapshot(item),
                                afterSnapshot: buildCalendarHistorySnapshot(newSeriesPayload),
                                metadata: {
                                    scope: 'following',
                                    recurring: true,
                                },
                            })
                        );
                    } catch (error) {
                        console.error('Calendar recurring split resize failed:', error);
                        rollbackAll();
                }
            })();
        },
        [
            applyOptimisticCalendarItem,
            appendCalendarHistoryTransactions,
            calendarItems,
            getForcedRecurrenceScopeFromInput,
            isOriginalSeriesOccurrence,
            requestRecurrenceScope,
        ]
    );

    const setDayHeight = useCallback((nextHeight: number) => {
        const clampedHeight = clampNumber(Math.round(nextHeight), CALENDAR_DAY_HEIGHT_MIN, CALENDAR_DAY_HEIGHT_MAX);
        setDayCellHeight(clampedHeight);
    }, []);

    const visibleWeeksEstimate = useMemo(() => {
        if (isMiniInfinite) {
            return CALENDAR_MINI_VISIBLE_WEEKS;
        }
        if (!scrollContainerHeight) {
            return 6;
        }
        const headerHeight = isMiniInfinite ? 0 : Math.max(0, dayNumberStickyTop - 2);
        const usableHeight = Math.max(1, scrollContainerHeight - headerHeight);
        return clampNumber(Math.round(usableHeight / effectiveDayCellHeight), CALENDAR_VISIBLE_WEEKS_MIN, CALENDAR_VISIBLE_WEEKS_MAX);
    }, [effectiveDayCellHeight, isMiniInfinite, scrollContainerHeight, dayNumberStickyTop]);

    const applyVisibleWeeks = useCallback(
        (nextVisibleWeeks: number) => {
            if (isMiniInfinite) {
                return;
            }
            const requestedWeeks = clampNumber(
                Math.round(nextVisibleWeeks),
                CALENDAR_VISIBLE_WEEKS_MIN,
                CALENDAR_VISIBLE_WEEKS_MAX
            );
            const container = scrollContainerRef.current;
            const headerHeight = isMiniInfinite
                ? 0
                : headerRef.current?.getBoundingClientRect().height ?? Math.max(0, dayNumberStickyTop - 2);
            const viewportHeight = container?.clientHeight ?? scrollContainerHeight ?? 0;
            const usableHeight = Math.max(1, viewportHeight - headerHeight);
            setDayHeight(usableHeight / requestedWeeks);
        },
        [dayNumberStickyTop, isMiniInfinite, scrollContainerHeight, setDayHeight]
    );

    const handleTodayClick = useCallback(() => {
        const today = new Date();
        const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const todayStr = format(normalizedToday, 'yyyy-MM-dd');

        if (viewMode === 'day') {
            setDayAnchorDate(normalizedToday);
            setDayViewVerticalResetKey((value) => value + 1);
            return;
        }

        if (viewMode === 'agenda') {
            setAgendaFocusRequest({
                nonce: Date.now(),
                dateKey: todayStr,
            });
            setAgendaWindow((current) =>
                explicitDateRangeWindow || createRollingWindow(normalizedToday, { includePast: false }) || current
            );
            return;
        }

        if (viewMode === 'year') {
            yearShiftLockRef.current = false;
            yearShiftAnimationKeyRef.current = 0;
            setYearShiftAnimation(null);
            setYearViewportStartOffset(0);
            if (scrollToMonthOffset(0, 'smooth')) {
                return;
            }

            pendingTopScrollAdjustRef.current = null;
            pendingScrollBehaviorRef.current = 'smooth';
            pendingYearScrollToMonthOffsetRef.current = 0;
            setYearRangeStartOffset(-12);
            setYearRangeEndOffset(23);
            return;
        }

        if (scrollToDateStr(todayStr, 'smooth')) {
            return;
        }

        pendingTopScrollAdjustRef.current = null;
        pendingScrollBehaviorRef.current = 'smooth';
        pendingScrollToDateRef.current = todayStr;
        setRangeStart(startOfWeek(addWeeks(normalizedToday, -initialWeeksPerSide), { weekStartsOn: WEEK_STARTS_ON }));
        setRangeEnd(endOfWeek(addWeeks(normalizedToday, initialWeeksPerSide), { weekStartsOn: WEEK_STARTS_ON }));
    }, [explicitDateRangeWindow, initialWeeksPerSide, scrollToDateStr, scrollToMonthOffset, viewMode]);

    const shiftYearViewport = useCallback(
        (direction: 'left' | 'right') => {
            if (yearShiftLockRef.current) {
                return;
            }

            yearShiftLockRef.current = true;
            pendingTopScrollAdjustRef.current = null;
            yearShiftAnimationKeyRef.current += 1;
            setYearShiftAnimation({
                key: yearShiftAnimationKeyRef.current,
                direction,
            });
        },
        []
    );

    const handleYearShiftAnimationComplete = useCallback(
        (shift: { key: number; direction: 'left' | 'right' }) => {
            const delta = shift.direction === 'left' ? 1 : -1;

            pendingTopScrollAdjustRef.current = null;
            setYearViewportStartOffset((previous) => previous + delta);
            setYearRangeStartOffset((previous) => previous + delta);
            setYearRangeEndOffset((previous) => previous + delta);
            setYearShiftAnimation((current) => (current?.key === shift.key ? null : current));
            yearShiftLockRef.current = false;
        },
        []
    );

    const handleQuickAddClick = useCallback(() => {
        const today = new Date();
        const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        setSelectedDate(normalizedToday);
        setSelectedEvent(null);
        setInitialDraftSelection(null);
        setIsModalOpen(true);
    }, []);

    const handleDayViewCreateDraft = useCallback((draft: CalendarDraftSelection) => {
        setSelectedDate(draft.start);
        clearCalendarSelection();
        setInitialDraftSelection(draft);
        setIsModalOpen(true);
    }, [clearCalendarSelection]);

    const handleDayViewAnchorChange = useCallback((date: Date) => {
        setDayAnchorDate(startOfDayDate(date));
    }, []);

    const navigateCalendarToDateKey = useCallback(
        (dateKey: string, options?: { itemKey?: string | null; minute?: number | null }) => {
            const targetDate = parseISO(`${dateKey}T00:00:00`);
            if (Number.isNaN(targetDate.getTime())) return;

            if (viewMode === 'day') {
                const visibleEnd = addDays(dayAnchorDate, dayVisibleDays * dayRowCount - 1);
                const isVisible = targetDate.getTime() >= dayAnchorDate.getTime() && targetDate.getTime() <= visibleEnd.getTime();
                if (!isVisible) {
                    setDayAnchorDate(startOfDayDate(targetDate));
                }
                if (options?.minute != null || isVisible) {
                    setDayViewScrollRequest({
                        nonce: Date.now(),
                        dateKey,
                        minute: options?.minute ?? 0,
                    });
                }
                return;
            }

            if (viewMode === 'agenda') {
                setAgendaFocusRequest({
                    nonce: Date.now(),
                    dateKey,
                    itemKey: options?.itemKey || null,
                });
                return;
            }

            if (viewMode === 'year') {
                const monthOffset = differenceInCalendarMonths(targetDate, effectiveCurrentDate);
                yearShiftLockRef.current = false;
                yearShiftAnimationKeyRef.current = 0;
                setYearShiftAnimation(null);
                if (scrollToMonthOffset(monthOffset, 'smooth')) {
                    return;
                }
                pendingTopScrollAdjustRef.current = null;
                pendingScrollBehaviorRef.current = 'smooth';
                pendingYearScrollToMonthOffsetRef.current = monthOffset;
                setYearRangeStartOffset(monthOffset - 12);
                setYearRangeEndOffset(monthOffset + 23);
                return;
            }

            if (scrollToDateStr(dateKey, 'smooth')) {
                return;
            }
            pendingTopScrollAdjustRef.current = null;
            pendingScrollBehaviorRef.current = 'smooth';
            pendingScrollToDateRef.current = dateKey;
            setRangeStart(startOfWeek(addWeeks(targetDate, -initialWeeksPerSide), { weekStartsOn: WEEK_STARTS_ON }));
            setRangeEnd(endOfWeek(addWeeks(targetDate, initialWeeksPerSide), { weekStartsOn: WEEK_STARTS_ON }));
        },
        [dayAnchorDate, dayRowCount, dayVisibleDays, effectiveCurrentDate, initialWeeksPerSide, scrollToDateStr, scrollToMonthOffset, viewMode]
    );

    const handleCalendarResultDateClick = useCallback(
        (dateKey: string) => {
            navigateCalendarToDateKey(dateKey);
        },
        [navigateCalendarToDateKey]
    );

    const handleCalendarResultClick = useCallback(
        (event: React.MouseEvent<HTMLButtonElement>, item: CalendarItem) => {
            event.stopPropagation();
            const occurrenceDateKey = getCalendarOccurrenceDateKey(item);
            const occurrenceKey = buildCalendarOccurrenceKey(item);
            const targetMinute = getClosestCalendarHitMinute(item, occurrenceDateKey);
            selectCalendarEvent(item);
            navigateCalendarToDateKey(occurrenceDateKey, {
                itemKey: occurrenceKey,
                minute: targetMinute,
            });
            if (viewMode === 'agenda') {
                setAgendaFocusRequest({
                    nonce: Date.now(),
                    dateKey: occurrenceDateKey,
                    itemKey: occurrenceKey,
                });
            }
            if (event.shiftKey) {
                if (item.calendarItemKind === 'chore') {
                    const choreId = String((item as any).sourceChoreId || '').trim();
                    if (choreId) {
                        setChoreDetailChoreId(choreId);
                        setChoreDetailDate(parseISO(`${occurrenceDateKey}T00:00:00`));
                    }
                } else {
                    setEventDetailOpen(true);
                }
            }
        },
        [navigateCalendarToDateKey, selectCalendarEvent, viewMode]
    );

    const expandSupplementalWindow = useCallback((windowRange: CalendarRangeWindow, direction: 'up' | 'down') => {
        if (direction === 'up') {
            return {
                start: startOfWeek(addMonths(windowRange.start, -SUPPLEMENTAL_WINDOW_MONTHS), { weekStartsOn: WEEK_STARTS_ON }),
                end: windowRange.end,
            };
        }

        return {
            start: windowRange.start,
            end: endOfWeek(addMonths(windowRange.end, SUPPLEMENTAL_WINDOW_MONTHS), { weekStartsOn: WEEK_STARTS_ON }),
        };
    }, []);

    const handleAgendaReachStart = useCallback(() => {
        if (explicitDateRangeWindow) return;
        setAgendaWindow((current) => expandSupplementalWindow(current, 'up'));
    }, [expandSupplementalWindow, explicitDateRangeWindow]);

    const handleAgendaReachEnd = useCallback(() => {
        if (explicitDateRangeWindow) return;
        setAgendaWindow((current) => expandSupplementalWindow(current, 'down'));
    }, [expandSupplementalWindow, explicitDateRangeWindow]);

    const handleSearchReachStart = useCallback(() => {
        if (explicitDateRangeWindow) return;
        setSearchWindow((current) => expandSupplementalWindow(current, 'up'));
    }, [expandSupplementalWindow, explicitDateRangeWindow]);

    const handleSearchReachEnd = useCallback(() => {
        if (explicitDateRangeWindow) return;
        setSearchWindow((current) => expandSupplementalWindow(current, 'down'));
    }, [expandSupplementalWindow, explicitDateRangeWindow]);

    const getBestDayViewTimedColumnFromFootprint = useCallback(
        (input: { clientX?: number; clientY?: number } | null | undefined) => {
            const dragMetrics = activeDragMetricsRef.current;
            const clientX = Number(input?.clientX);
            const clientY = Number(input?.clientY);
            if (
                !dragMetrics ||
                !Number.isFinite(clientX) ||
                !Number.isFinite(clientY) ||
                dragMetrics.width <= 0 ||
                dragMetrics.height <= 0
            ) {
                return null;
            }

            const dragLeft = clientX - dragMetrics.pointerOffsetX;
            const dragTop = clientY - dragMetrics.pointerOffsetY;
            const dragRight = dragLeft + dragMetrics.width;
            const dragBottom = dragTop + dragMetrics.height;
            const requiredOverlapWidth = dragMetrics.width / 2;

            const timedColumns = Array.from(
                document.querySelectorAll<HTMLElement>('[data-calendar-drop-surface="timed"][data-calendar-day-key]')
            );
            let bestTarget: {
                dayKey: string;
                minuteOfDay: number;
                overlapWidth: number;
                overlapHeight: number;
                overlapArea: number;
            } | null = null;

            for (const column of timedColumns) {
                const rect = column.getBoundingClientRect();
                let visibleRect: ClientRectLike = rect;
                const horizontalViewport = column.closest<HTMLElement>('[data-calendar-day-horizontal-viewport="timed"]');
                if (horizontalViewport) {
                    const viewportRect = horizontalViewport.getBoundingClientRect();
                    if (viewportRect.width > 0 && viewportRect.height > 0) {
                        const clippedRect = intersectClientRects(visibleRect, viewportRect);
                        if (!clippedRect) {
                            continue;
                        }
                        visibleRect = clippedRect;
                    }
                }

                const verticalViewport = column.closest<HTMLElement>('[data-calendar-day-vertical-viewport="timed"]');
                if (verticalViewport) {
                    const viewportRect = verticalViewport.getBoundingClientRect();
                    if (viewportRect.width > 0 && viewportRect.height > 0) {
                        const clippedRect = intersectClientRects(visibleRect, viewportRect);
                        if (!clippedRect) {
                            continue;
                        }
                        visibleRect = clippedRect;
                    }
                }

                const overlapWidth = Math.min(dragRight, visibleRect.right) - Math.max(dragLeft, visibleRect.left);
                if (overlapWidth <= requiredOverlapWidth) {
                    continue;
                }

                const dayKey = String(column.dataset.calendarDayKey || '').trim();
                if (!dayKey) continue;

                const snapMinutes = Math.max(1, Number(column.dataset.calendarSnapMinutes || 15));
                const overlapHeight = Math.max(0, Math.min(dragBottom, visibleRect.bottom) - Math.max(dragTop, visibleRect.top));
                const overlapArea = overlapWidth * overlapHeight;
                const rawMinute = ((dragTop - rect.top) / Math.max(1, rect.height)) * 24 * 60;
                const minuteOfDay = clampNumber(Math.round(rawMinute / snapMinutes) * snapMinutes, 0, 24 * 60);

                const candidateHasVerticalOverlap = overlapHeight > 0;
                const bestHasVerticalOverlap = (bestTarget?.overlapHeight ?? 0) > 0;

                if (
                    !bestTarget ||
                    (candidateHasVerticalOverlap && !bestHasVerticalOverlap) ||
                    (candidateHasVerticalOverlap === bestHasVerticalOverlap &&
                        (overlapArea > bestTarget.overlapArea ||
                            (overlapArea === bestTarget.overlapArea &&
                                (overlapWidth > bestTarget.overlapWidth ||
                                    (overlapWidth === bestTarget.overlapWidth && overlapHeight > bestTarget.overlapHeight)))))
                ) {
                    bestTarget = {
                        dayKey,
                        minuteOfDay,
                        overlapWidth,
                        overlapHeight,
                        overlapArea,
                    };
                }
            }

            return bestTarget;
        },
        []
    );

    const getDayViewTimedDropFromPointer = useCallback(
        (input: { clientX?: number; clientY?: number } | null | undefined) => {
            const bestTarget = getBestDayViewTimedColumnFromFootprint(input);
            if (!bestTarget) {
                return null;
            }

            return {
                type: 'calendar-time-slot' as const,
                dateStr: bestTarget.dayKey,
                minuteOfDay: bestTarget.minuteOfDay,
            };
        },
        [getBestDayViewTimedColumnFromFootprint]
    );

    const getDayViewDominantDayKeyFromPointer = useCallback(
        (input: { clientX?: number; clientY?: number } | null | undefined) =>
            getBestDayViewTimedColumnFromFootprint(input)?.dayKey || null,
        [getBestDayViewTimedColumnFromFootprint]
    );

    const buildCalendarMoveTargetFromDrop = useCallback((
        event: CalendarItem,
        destData: any,
        input?: { clientX?: number; clientY?: number } | null
    ) => {
        const actualStart = parseISO(event.startDate);
        const actualEnd = parseISO(event.endDate);
        if (Number.isNaN(actualStart.getTime()) || Number.isNaN(actualEnd.getTime())) {
            return null;
        }

        if (destData?.type === 'calendar-day' || destData?.type === 'calendar-all-day') {
            const dominantDayKey = getDayViewDominantDayKeyFromPointer(input);
            const destinationDateStr = String(dominantDayKey || destData.dateStr || '');
            const destinationDate = parseISO(destinationDateStr);
            if (Number.isNaN(destinationDate.getTime())) {
                return null;
            }

            if (destData?.type === 'calendar-all-day' && !event.isAllDay) {
                return null;
            }

            const sourceDisplayDate =
                typeof (event as any).__displayDate === 'string' && (event as any).__displayDate.trim().length > 0
                    ? (event as any).__displayDate
                    : typeof (event as any).__dragAnchorStartDate === 'string' &&
                        (event as any).__dragAnchorStartDate.trim().length > 0 &&
                        parseRecurrenceDateToken(String((event as any).__dragAnchorStartDate))
                      ? format(parseRecurrenceDateToken(String((event as any).__dragAnchorStartDate)) as Date, 'yyyy-MM-dd')
                      : event.isAllDay
                        ? event.startDate
                        : format(parseISO(event.startDate), 'yyyy-MM-dd');
            const sourceDate = parseISO(sourceDisplayDate);
            if (Number.isNaN(sourceDate.getTime())) {
                return null;
            }

            const daysDifference = differenceInDays(destinationDate, sourceDate);
            if (daysDifference === 0) {
                return null;
            }

            const nextStartDate = event.isAllDay
                ? format(addDays(actualStart, daysDifference), 'yyyy-MM-dd')
                : addDays(actualStart, daysDifference).toISOString();
            const nextEndDate = event.isAllDay
                ? format(addDays(actualEnd, daysDifference), 'yyyy-MM-dd')
                : addDays(actualEnd, daysDifference).toISOString();

            return {
                nextStartDate,
                nextEndDate,
                preview:
                    destData?.type === 'calendar-all-day'
                        ? {
                              item: event,
                              startDate: nextStartDate,
                              endDate: nextEndDate,
                          }
                        : null,
            };
        }

        const effectiveTimedDestData =
            destData?.type === 'calendar-time-slot' ? getDayViewTimedDropFromPointer(input) || destData : destData;

        if (effectiveTimedDestData?.type !== 'calendar-time-slot' || event.isAllDay) {
            return null;
        }

        const destinationDate = parseISO(`${String(effectiveTimedDestData.dateStr)}T00:00:00`);
        if (Number.isNaN(destinationDate.getTime())) {
            return null;
        }

        const sourceAnchorDate =
            typeof (event as any).__dragAnchorStartDate === 'string' && (event as any).__dragAnchorStartDate.trim().length > 0
                ? parseISO((event as any).__dragAnchorStartDate)
                : actualStart;
        if (Number.isNaN(sourceAnchorDate.getTime())) {
            return null;
        }

        const minuteOfDay = clampNumber(Number(effectiveTimedDestData.minuteOfDay ?? 0), 0, 24 * 60);
        const destinationAnchorDate = new Date(destinationDate.getTime() + minuteOfDay * 60 * 1000);
        const deltaMs = destinationAnchorDate.getTime() - sourceAnchorDate.getTime();
        if (deltaMs === 0) {
            return null;
        }

        const nextStartDate = addMilliseconds(actualStart, deltaMs).toISOString();
        const nextEndDate = addMilliseconds(actualEnd, deltaMs).toISOString();
        return {
            nextStartDate,
            nextEndDate,
            preview: {
                item: event,
                startDate: nextStartDate,
                endDate: nextEndDate,
            },
        };
    }, [getDayViewDominantDayKeyFromPointer, getDayViewTimedDropFromPointer]);

    useEffect(() => {
        const cleanup = monitorForElements({
            onDragStart: ({ source, location }) => {
                if (source.data.type !== 'calendar-event') {
                    activeDragMetricsRef.current = null;
                    setDragRecurrenceIndicator(null);
                    setDayViewDragPreview(null);
                    return;
                }

                const sourceElement = source.element instanceof HTMLElement ? source.element : null;
                const sourceRect = sourceElement?.getBoundingClientRect();
                const clientX = Number(location.current.input?.clientX);
                const clientY = Number(location.current.input?.clientY);
                activeDragMetricsRef.current =
                    sourceRect &&
                    Number.isFinite(clientX) &&
                    Number.isFinite(clientY) &&
                    sourceRect.width > 0 &&
                    sourceRect.height > 0
                        ? {
                              pointerOffsetX: clientX - sourceRect.left,
                              pointerOffsetY: clientY - sourceRect.top,
                              width: sourceRect.width,
                              height: sourceRect.height,
                          }
                        : null;
                syncDragRecurrenceIndicator(location.current.input, source.data.event as CalendarItem);
            },
            onDrag: ({ source, location }) => {
                if (source.data.type !== 'calendar-event') {
                    activeDragMetricsRef.current = null;
                    setDragRecurrenceIndicator(null);
                    setDayViewDragPreview(null);
                    return;
                }

                const destination = location.current.dropTargets?.[0];
                const moveTarget = destination
                    ? buildCalendarMoveTargetFromDrop(source.data.event as CalendarItem, destination.data, location.current.input)
                    : buildCalendarMoveTargetFromDrop(source.data.event as CalendarItem, { type: 'calendar-time-slot' }, location.current.input);
                setDayViewDragPreview(moveTarget?.preview ?? null);
                syncDragRecurrenceIndicator(location.current.input, source.data.event as CalendarItem);
            },
            onDrop: (args) => {
                void (async () => {
                    try {
                        setDragRecurrenceIndicator(null);
                        setDayViewDragPreview(null);
                        const { source, location } = args;
                        const destination = location.current.dropTargets?.[0];
                        const sourceData = source.data;
                        const destData = destination?.data;

                        if (!destination || sourceData.type !== 'calendar-event') {
                            return;
                        }

                        const event = sourceData.event as CalendarItem;
                        const moveTarget = buildCalendarMoveTargetFromDrop(event, destData, location.current.input);
                        if (!moveTarget) {
                            return;
                        }

                        await applyCalendarMoveUpdate({
                            event,
                            nextStartDate: moveTarget.nextStartDate,
                            nextEndDate: moveTarget.nextEndDate,
                            input: location.current.input,
                        });
                    } finally {
                        activeDragMetricsRef.current = null;
                    }
                })();
            },
        });

        return cleanup;
    }, [applyCalendarMoveUpdate, buildCalendarMoveTargetFromDrop, syncDragRecurrenceIndicator]);

    useLayoutEffect(() => {
        const pendingAdjust = pendingTopScrollAdjustRef.current;
        const container = scrollContainerRef.current;
        if (!pendingAdjust || !container) return;

        let adjusted = false;

        // 1. Try to anchor to the exact physical element we tracked
        if (pendingAdjust.anchorSelector) {
            const anchorElement = container.querySelector<HTMLElement>(pendingAdjust.anchorSelector);
            if (anchorElement) {
                const containerTop = container.getBoundingClientRect().top;
                const currentOffset = anchorElement.getBoundingClientRect().top - containerTop;
                const shift = currentOffset - pendingAdjust.anchorOffset;

                if (shift !== 0) {
                    container.scrollTop += shift;
                    adjusted = true;
                }
            }
        }

        // 2. Fallback to the old logic if the anchor element vanished (unlikely)
        if (!adjusted && pendingAdjust.prevScrollHeight) {
            const deltaHeight = container.scrollHeight - pendingAdjust.prevScrollHeight;
            container.scrollTop = Math.max(0, pendingAdjust.prevScrollTop + deltaHeight);
        }

        pendingTopScrollAdjustRef.current = null;
    }, [rangeStart, rangeEnd, yearRangeStartOffset, yearRangeEndOffset]);

    useLayoutEffect(() => {
        const syncContainerHeight = () => {
            const container = scrollContainerRef.current;
            if (!container) return;

            if (isMiniInfinite) {
                setScrollContainerHeight(Math.max(0, Math.floor(container.clientHeight)));
                setScrollContainerWidth(Math.max(0, Math.floor(container.clientWidth)));
                setDayNumberStickyTop(0);
                return;
            }

            const rect = container.getBoundingClientRect();
            const remaining = window.innerHeight - rect.top - 8;
            setScrollContainerHeight(Math.max(360, Math.floor(remaining)));
            setScrollContainerWidth(Math.max(0, Math.floor(rect.width)));
            const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
            setDayNumberStickyTop(Math.max(0, Math.ceil(headerHeight) + 2));
        };

        syncContainerHeight();
        if (isMiniInfinite && typeof ResizeObserver !== 'undefined') {
            const container = scrollContainerRef.current;
            if (!container) return;
            const observer = new ResizeObserver(() => {
                syncContainerHeight();
            });
            observer.observe(container);
            return () => observer.disconnect();
        }

        window.addEventListener('resize', syncContainerHeight);
        return () => window.removeEventListener('resize', syncContainerHeight);
    }, [isMiniInfinite, viewMode]);

    useEffect(() => {
        if (isMiniInfinite || viewMode !== 'year') return;
        yearShiftLockRef.current = false;
        yearShiftAnimationKeyRef.current = 0;
        setYearViewportStartOffset(0);
        setYearRangeStartOffset(-12);
        setYearRangeEndOffset(23);
        setYearShiftAnimation(null);
        pendingYearScrollToMonthOffsetRef.current = 0;
    }, [effectiveYearMonthBasis, isMiniInfinite, viewMode]);

    const transitionToMonth = useCallback((nextMonth: MonthLabel) => {
        const current = monthLabelRef.current;
        if (current.key === nextMonth.key) {
            return;
        }

        setActiveMonthLabel(nextMonth);
        monthLabelRef.current = nextMonth;
    }, []);

    const updateVisibleMonthFromScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
        const containerTop = container.getBoundingClientRect().top;
        const scanLine = containerTop + headerHeight + 8;
        const dayMarkers = Array.from(container.querySelectorAll<HTMLElement>('[data-calendar-cell-date]'));

        if (dayMarkers.length === 0) return;

        let activeMarker: HTMLElement | null = null;
        for (const marker of dayMarkers) {
            const rect = marker.getBoundingClientRect();
            if (rect.bottom >= scanLine) {
                activeMarker = marker;
                break;
            }
        }

        if (!activeMarker) {
            activeMarker = dayMarkers[dayMarkers.length - 1];
        }

        const dateStr = activeMarker.dataset.calendarCellDate;
        if (!dateStr) return;

        const visibleDate = parseISO(dateStr);
        if (Number.isNaN(visibleDate.getTime())) return;

        transitionToMonth(buildMonthLabel(visibleDate));
    }, [buildMonthLabel, transitionToMonth]);

    const expandRangeRef = useRef(expandRange);
    useEffect(() => {
        expandRangeRef.current = expandRange;
    }, [expandRange]);

    const expandYearRangeRef = useRef(expandYearRange);
    useEffect(() => {
        expandYearRangeRef.current = expandYearRange;
    }, [expandYearRange]);

    const updateVisibleMonthFromScrollRef = useRef(updateVisibleMonthFromScroll);
    useEffect(() => {
        updateVisibleMonthFromScrollRef.current = updateVisibleMonthFromScroll;
    }, [updateVisibleMonthFromScroll]);

    useEffect(() => {
        if (viewMode !== 'monthly') return;

        const container = scrollContainerRef.current;
        if (!container) return;

        const onScroll = () => {
            if (scrollRafRef.current !== null) return;
            scrollRafRef.current = window.requestAnimationFrame(() => {
                scrollRafRef.current = null;

                if (!isMiniInfinite) {
                    updateVisibleMonthFromScrollRef.current();
                }

                const activeContainer = scrollContainerRef.current;
                if (!activeContainer) return;

                const now = Date.now();
                const scrollTop = activeContainer.scrollTop;
                const previousScrollTop = lastScrollTopRef.current;
                const scrollDelta = previousScrollTop === null ? 0 : scrollTop - previousScrollTop;
                lastScrollTopRef.current = scrollTop;

                const nearTop = activeContainer.scrollTop <= EDGE_TRIGGER_PX;
                const nearBottom =
                    activeContainer.scrollHeight - activeContainer.clientHeight - activeContainer.scrollTop <= EDGE_TRIGGER_PX;

                if (nearTop && scrollDelta < 0) {
                    const cooldownElapsed = now - lastTopLoadAtRef.current >= EDGE_LOAD_COOLDOWN_MS;
                    if (cooldownElapsed) {
                        lastTopLoadAtRef.current = now;
                        expandRangeRef.current('up');
                    }
                }

                if (nearBottom && scrollDelta > 0) {
                    const cooldownElapsed = now - lastBottomLoadAtRef.current >= EDGE_LOAD_COOLDOWN_MS;
                    if (cooldownElapsed) {
                        lastBottomLoadAtRef.current = now;
                        expandRangeRef.current('down');
                    }
                }
            });
        };

        const onWheel = (event: WheelEvent) => {
            const activeContainer = scrollContainerRef.current;
            if (!activeContainer) return;

            const now = Date.now();
            const nearTop = activeContainer.scrollTop <= EDGE_TRIGGER_PX;
            const nearBottom = activeContainer.scrollHeight - activeContainer.clientHeight - activeContainer.scrollTop <= EDGE_TRIGGER_PX;

            if (event.deltaY < 0 && nearTop) {
                const cooldownElapsed = now - lastTopLoadAtRef.current >= EDGE_LOAD_COOLDOWN_MS;
                if (cooldownElapsed) {
                    lastTopLoadAtRef.current = now;
                    expandRangeRef.current('up');
                }
            }

            if (event.deltaY > 0 && nearBottom) {
                const cooldownElapsed = now - lastBottomLoadAtRef.current >= EDGE_LOAD_COOLDOWN_MS;
                if (cooldownElapsed) {
                    lastBottomLoadAtRef.current = now;
                    expandRangeRef.current('down');
                }
            }
        };

        if (!isMiniInfinite) {
            updateVisibleMonthFromScrollRef.current();
        }
        lastScrollTopRef.current = container.scrollTop;
        container.addEventListener('scroll', onScroll, { passive: true });
        container.addEventListener('wheel', onWheel, { passive: true });

        return () => {
            container.removeEventListener('scroll', onScroll);
            container.removeEventListener('wheel', onWheel);
            if (scrollRafRef.current !== null) {
                window.cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = null;
            }
        };
    }, [isMiniInfinite, viewMode]);

    useEffect(() => {
        if (viewMode !== 'year') return;

        const container = scrollContainerRef.current;
        if (!container) return;

        const onScroll = () => {
            if (scrollRafRef.current !== null) return;
            scrollRafRef.current = window.requestAnimationFrame(() => {
                scrollRafRef.current = null;

                const activeContainer = scrollContainerRef.current;
                if (!activeContainer) return;

                const now = Date.now();
                const scrollTop = activeContainer.scrollTop;
                const previousScrollTop = lastScrollTopRef.current;
                const scrollDelta = previousScrollTop === null ? 0 : scrollTop - previousScrollTop;
                lastScrollTopRef.current = scrollTop;

                const nearTop = activeContainer.scrollTop <= EDGE_TRIGGER_PX;
                const nearBottom =
                    activeContainer.scrollHeight - activeContainer.clientHeight - activeContainer.scrollTop <= EDGE_TRIGGER_PX;

                if (nearTop && scrollDelta < 0) {
                    const cooldownElapsed = now - lastTopLoadAtRef.current >= EDGE_LOAD_COOLDOWN_MS;
                    if (cooldownElapsed) {
                        lastTopLoadAtRef.current = now;
                        expandYearRangeRef.current('up');
                    }
                }

                if (nearBottom && scrollDelta > 0) {
                    const cooldownElapsed = now - lastBottomLoadAtRef.current >= EDGE_LOAD_COOLDOWN_MS;
                    if (cooldownElapsed) {
                        lastBottomLoadAtRef.current = now;
                        expandYearRangeRef.current('down');
                    }
                }
            });
        };

        const onWheel = (event: WheelEvent) => {
            const activeContainer = scrollContainerRef.current;
            if (!activeContainer) return;

            const now = Date.now();
            const nearTop = activeContainer.scrollTop <= EDGE_TRIGGER_PX;
            const nearBottom = activeContainer.scrollHeight - activeContainer.clientHeight - activeContainer.scrollTop <= EDGE_TRIGGER_PX;

            if (event.deltaY < 0 && nearTop) {
                const cooldownElapsed = now - lastTopLoadAtRef.current >= EDGE_LOAD_COOLDOWN_MS;
                if (cooldownElapsed) {
                    lastTopLoadAtRef.current = now;
                    expandYearRangeRef.current('up');
                }
            }

            if (event.deltaY > 0 && nearBottom) {
                const cooldownElapsed = now - lastBottomLoadAtRef.current >= EDGE_LOAD_COOLDOWN_MS;
                if (cooldownElapsed) {
                    lastBottomLoadAtRef.current = now;
                    expandYearRangeRef.current('down');
                }
            }
        };

        lastScrollTopRef.current = container.scrollTop;
        container.addEventListener('scroll', onScroll, { passive: true });
        container.addEventListener('wheel', onWheel, { passive: true });

        return () => {
            container.removeEventListener('scroll', onScroll);
            container.removeEventListener('wheel', onWheel);
            if (scrollRafRef.current !== null) {
                window.cancelAnimationFrame(scrollRafRef.current);
                scrollRafRef.current = null;
            }
        };
    }, [viewMode]);

    useEffect(() => {
        if (isMiniInfinite || viewMode !== 'monthly') return;
        updateVisibleMonthFromScroll();
    }, [isMiniInfinite, viewMode, weeks.length, updateVisibleMonthFromScroll]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_DAY_HEIGHT_STORAGE_KEY, String(dayCellHeight));
    }, [commandsEnabled, dayCellHeight]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_SHOW_CHORES_STORAGE_KEY, effectiveShowChores ? 'true' : 'false');
    }, [commandsEnabled, effectiveShowChores]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_VIEW_MODE_STORAGE_KEY, viewMode);
    }, [commandsEnabled, viewMode]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_DAY_VIEW_VISIBLE_DAYS_STORAGE_KEY, String(dayVisibleDays));
    }, [commandsEnabled, dayVisibleDays]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_DAY_VIEW_ROW_COUNT_STORAGE_KEY, String(dayRowCount));
    }, [commandsEnabled, dayRowCount]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_DAY_VIEW_HOUR_HEIGHT_STORAGE_KEY, String(dayHourHeight));
    }, [commandsEnabled, dayHourHeight]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_DAY_VIEW_VISIBLE_HOURS_STORAGE_KEY, String(dayVisibleHours));
    }, [commandsEnabled, dayVisibleHours]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_DAY_VIEW_FONT_SCALE_STORAGE_KEY, String(dayFontScale));
    }, [commandsEnabled, dayFontScale]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_YEAR_MONTH_BASIS_STORAGE_KEY, yearMonthBasis);
    }, [commandsEnabled, yearMonthBasis]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_YEAR_FONT_SCALE_STORAGE_KEY, String(yearFontScale));
    }, [commandsEnabled, yearFontScale]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_AGENDA_FONT_SCALE_STORAGE_KEY, String(agendaDisplay.fontScale));
        window.localStorage.setItem(CALENDAR_AGENDA_SHOW_TAGS_STORAGE_KEY, agendaDisplay.showTags ? 'true' : 'false');
        window.localStorage.setItem(
            CALENDAR_AGENDA_SHOW_DESCRIPTION_STORAGE_KEY,
            agendaDisplay.showDescription ? 'true' : 'false'
        );
        window.localStorage.setItem(CALENDAR_AGENDA_SHOW_LOCATION_STORAGE_KEY, agendaDisplay.showLocation ? 'true' : 'false');
        window.localStorage.setItem(CALENDAR_AGENDA_SHOW_METADATA_STORAGE_KEY, agendaDisplay.showMetadata ? 'true' : 'false');
    }, [agendaDisplay, commandsEnabled]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_PERSISTENT_FILTERS_STORAGE_KEY, JSON.stringify(effectivePersistentFilters));
    }, [commandsEnabled, effectivePersistentFilters]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_SHOW_GREGORIAN_CALENDAR_STORAGE_KEY, showGregorianCalendar ? 'true' : 'false');
    }, [commandsEnabled, showGregorianCalendar]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(CALENDAR_SHOW_BS_CALENDAR_STORAGE_KEY, showBsCalendar ? 'true' : 'false');
    }, [commandsEnabled, showBsCalendar]);

    useEffect(() => {
        if (typeof window === 'undefined' || !commandsEnabled) return;
        window.localStorage.setItem(
            CALENDAR_SHOW_INLINE_NON_BASIS_MONTH_BREAKS_STORAGE_KEY,
            showInlineNonBasisMonthBreaks ? 'true' : 'false'
        );
    }, [commandsEnabled, showInlineNonBasisMonthBreaks]);

    useEffect(() => {
        if (!commandsEnabled) return;
        const detail: CalendarStateDetail = {
            dayHeight: effectiveDayCellHeight,
            visibleWeeks: visibleWeeksEstimate,
            showChores: effectiveShowChores,
            viewMode,
            currentPeriodLabel,
            search: searchState,
            filters: effectivePersistentFilters,
            agendaDisplay,
            dayVisibleDays,
            dayRowCount,
            dayHourHeight,
            dayVisibleHours,
            dayFontScale,
            yearMonthBasis: effectiveYearMonthBasis,
            showGregorianCalendar: showGregorianCalendarSetting,
            showBsCalendar: showBsCalendarSetting,
            showInlineNonBasisMonthBreaks,
            yearFontScale: effectiveYearFontScale,
            choreFilter: {
                configured: effectiveChoreFilterConfigured,
                selectedChoreIds: effectiveSelectedChoreIds,
            },
            tagFilter: {
                selectedTagIds: flattenCalendarTagExpressionIds(effectiveTagExpression),
                tagExpression: effectiveTagExpression,
            },
            memberFilter: {
                everyoneSelected: effectiveEveryoneSelected,
                selectedMemberIds: effectiveSelectedMemberIds,
            },
        };
        window.dispatchEvent(new CustomEvent<CalendarStateDetail>(CALENDAR_STATE_EVENT, { detail }));
    }, [
        commandsEnabled,
        effectiveChoreFilterConfigured,
        effectiveDayCellHeight,
        effectiveEveryoneSelected,
        effectiveSelectedChoreIds,
        effectiveSelectedMemberIds,
        effectiveShowChores,
        effectivePersistentFilters,
        effectiveTagExpression,
        currentPeriodLabel,
        dayFontScale,
        dayHourHeight,
        dayVisibleHours,
        dayRowCount,
        dayVisibleDays,
        agendaDisplay,
        effectiveYearMonthBasis,
        showBsCalendarSetting,
        showGregorianCalendarSetting,
        showInlineNonBasisMonthBreaks,
        searchState,
        viewMode,
        visibleWeeksEstimate,
        effectiveYearFontScale,
    ]);

    useEffect(() => {
        if (!commandsEnabled) return;
        const onCalendarCommand = (event: Event) => {
            const detail = (event as CustomEvent<CalendarCommandDetail>).detail;
            if (!detail) return;

            if (detail.type === 'setDayHeight') {
                setDayHeight(detail.dayHeight);
                return;
            }

            if (detail.type === 'setVisibleWeeks') {
                applyVisibleWeeks(detail.visibleWeeks);
                return;
            }

            if (detail.type === 'setShowChores') {
                setShowChores(Boolean(detail.showChores));
                return;
            }

            if (detail.type === 'setViewMode') {
                setViewMode(
                    detail.viewMode === 'year'
                        ? 'year'
                        : detail.viewMode === 'day'
                        ? 'day'
                        : detail.viewMode === 'agenda'
                        ? 'agenda'
                        : 'monthly'
                );
                return;
            }

            if (detail.type === 'setSearchOpen') {
                setSearchState((current) => ({ ...current, isOpen: Boolean(detail.isOpen) }));
                return;
            }

            if (detail.type === 'setSearchQuery') {
                setSearchState((current) => ({ ...current, query: detail.query }));
                return;
            }

            if (detail.type === 'setPersistentFilters') {
                setPersistentFilters(normalizeCalendarPersistentFilters(detail.filters));
                return;
            }

            if (detail.type === 'setPersistentTextFilter') {
                setPersistentFilters((current) => normalizeCalendarPersistentFilters({ ...current, textQuery: detail.textQuery }));
                return;
            }

            if (detail.type === 'setPersistentDateRange') {
                setPersistentFilters((current) => normalizeCalendarPersistentFilters({ ...current, dateRange: detail.dateRange }));
                return;
            }

            if (detail.type === 'setTagExpressionFilter') {
                setPersistentFilters((current) =>
                    normalizeCalendarPersistentFilters({
                        ...current,
                        tagExpression: normalizeCalendarTagExpression(detail.tagExpression),
                    })
                );
                return;
            }

            if (detail.type === 'setTagFilter') {
                setPersistentFilters((current) =>
                    normalizeCalendarPersistentFilters({
                        ...current,
                        tagExpression: createFlatOrTagExpression(detail.selectedTagIds),
                    })
                );
                return;
            }

            if (detail.type === 'setAgendaDisplay') {
                setAgendaDisplay((current) => ({
                    ...current,
                    ...detail.agendaDisplay,
                }));
                return;
            }

            if (detail.type === 'setDayVisibleDays') {
                setDayVisibleDays(clampCalendarDayVisibleDays(detail.dayVisibleDays));
                return;
            }

            if (detail.type === 'setDayRowCount') {
                setDayRowCount(clampCalendarDayRowCount(detail.dayRowCount));
                setDayViewVerticalResetKey((value) => value + 1);
                return;
            }

            if (detail.type === 'setDayHourHeight') {
                setDayHourHeight(clampCalendarDayHourHeight(detail.dayHourHeight));
                return;
            }

            if (detail.type === 'setDayVisibleHours') {
                setDayVisibleHours(clampCalendarDayVisibleHours(detail.dayVisibleHours));
                return;
            }

            if (detail.type === 'setDayFontScale') {
                setDayFontScale(clampCalendarDayFontScale(detail.dayFontScale));
                return;
            }

            if (detail.type === 'setYearMonthBasis') {
                setYearMonthBasis(detail.yearMonthBasis === 'bs' ? 'bs' : 'gregorian');
                return;
            }

            if (detail.type === 'setShowGregorianCalendar') {
                setShowGregorianCalendar(Boolean(detail.showGregorianCalendar));
                return;
            }

            if (detail.type === 'setShowBsCalendar') {
                setShowBsCalendar(Boolean(detail.showBsCalendar));
                return;
            }

            if (detail.type === 'setShowInlineNonBasisMonthBreaks') {
                setShowInlineNonBasisMonthBreaks(Boolean(detail.showInlineNonBasisMonthBreaks));
                return;
            }

            if (detail.type === 'setYearFontScale') {
                setYearFontScale(clampCalendarYearFontScale(detail.yearFontScale));
                return;
            }

            if (detail.type === 'shiftYearView') {
                shiftYearViewport(detail.direction === 'right' ? 'right' : 'left');
                return;
            }

            if (detail.type === 'setChoreFilter') {
                const sanitizedChoreIds = Array.from(
                    new Set(
                        (Array.isArray(detail.selectedChoreIds) ? detail.selectedChoreIds : [])
                            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                            .map((value) => value.trim())
                    )
                );
                setSelectedChoreIds(sanitizedChoreIds);
                setChoreFilterConfigured(true);
                return;
            }

            if (detail.type === 'setMemberFilter') {
                const sanitizedMemberIds = Array.from(
                    new Set(
                        (Array.isArray(detail.selectedMemberIds) ? detail.selectedMemberIds : [])
                            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                            .map((value) => value.trim())
                    )
                );
                setEveryoneSelected(Boolean(detail.everyoneSelected));
                setSelectedMemberIds(sanitizedMemberIds);
                setMemberFilterConfigured(true);
                return;
            }

            if (detail.type === 'scrollToday') {
                handleTodayClick();
                return;
            }

            if (detail.type === 'quickAdd') {
                handleQuickAddClick();
                return;
            }

            if (detail.type === 'requestState') {
                const stateDetail: CalendarStateDetail = {
                    dayHeight: effectiveDayCellHeight,
                    visibleWeeks: visibleWeeksEstimate,
                    showChores: effectiveShowChores,
                    viewMode,
                    currentPeriodLabel,
                    search: searchState,
                    filters: effectivePersistentFilters,
                    agendaDisplay,
                    dayVisibleDays,
                    dayRowCount,
                    dayHourHeight,
                    dayVisibleHours,
                    dayFontScale,
                    yearMonthBasis: effectiveYearMonthBasis,
                    showGregorianCalendar: showGregorianCalendarSetting,
                    showBsCalendar: showBsCalendarSetting,
                    showInlineNonBasisMonthBreaks,
                    yearFontScale: effectiveYearFontScale,
                    choreFilter: {
                        configured: effectiveChoreFilterConfigured,
                        selectedChoreIds: effectiveSelectedChoreIds,
                    },
                    tagFilter: {
                        selectedTagIds: flattenCalendarTagExpressionIds(effectiveTagExpression),
                        tagExpression: effectiveTagExpression,
                    },
                    memberFilter: {
                        everyoneSelected: effectiveEveryoneSelected,
                        selectedMemberIds: effectiveSelectedMemberIds,
                    },
                };
                window.dispatchEvent(new CustomEvent<CalendarStateDetail>(CALENDAR_STATE_EVENT, { detail: stateDetail }));
            }
        };

        window.addEventListener(CALENDAR_COMMAND_EVENT, onCalendarCommand);
        return () => {
            window.removeEventListener(CALENDAR_COMMAND_EVENT, onCalendarCommand);
        };
    }, [
        applyVisibleWeeks,
        commandsEnabled,
        effectiveChoreFilterConfigured,
        effectiveDayCellHeight,
        effectiveEveryoneSelected,
        effectiveSelectedChoreIds,
        effectiveSelectedMemberIds,
        effectiveShowChores,
        handleQuickAddClick,
        handleTodayClick,
        effectivePersistentFilters,
        effectiveTagExpression,
        currentPeriodLabel,
        dayFontScale,
        dayHourHeight,
        dayVisibleHours,
        dayRowCount,
        dayVisibleDays,
        agendaDisplay,
        effectiveYearMonthBasis,
        showBsCalendarSetting,
        showGregorianCalendarSetting,
        showInlineNonBasisMonthBreaks,
        searchState,
        setDayHeight,
        shiftYearViewport,
        visibleWeeksEstimate,
        viewMode,
        effectiveYearFontScale,
    ]);

    useEffect(() => {
        if (viewMode !== 'monthly') return;
        const pendingDate = pendingScrollToDateRef.current;
        if (!pendingDate || scrollContainerHeight === null) return;

        if (scrollToDateStr(pendingDate, pendingScrollBehaviorRef.current)) {
            pendingScrollToDateRef.current = null;
            pendingScrollBehaviorRef.current = 'smooth';
        }
    }, [scrollContainerHeight, viewMode, weeks.length, scrollToDateStr]);

    useEffect(() => {
        if (viewMode !== 'year') return;
        const pendingMonthOffset = pendingYearScrollToMonthOffsetRef.current;
        if (pendingMonthOffset == null || scrollContainerHeight === null || scrollContainerWidth === null) return;

        if (scrollToMonthOffset(pendingMonthOffset, pendingScrollBehaviorRef.current)) {
            pendingYearScrollToMonthOffsetRef.current = null;
            pendingScrollBehaviorRef.current = 'smooth';
        }
    }, [
        scrollContainerHeight,
        scrollContainerWidth,
        scrollToMonthOffset,
        viewMode,
        yearLayout.columns,
        yearRangeEndOffset,
        yearRangeStartOffset,
        yearViewportStartOffset,
    ]);

    useEffect(() => {
        monthLabelRef.current = activeMonthLabel;
    }, [activeMonthLabel]);

    const query = useMemo(
            () => ({
                calendarItems: {
                    pertainsTo: {},
                    tags: {},
                    $: {
                        where: {
                            or: [...monthConditions, { rrule: { $isNull: false } }, ...recurrenceReferenceMonthConditions],
                        },
                },
            },
            chores: {
                assignees: {},
                assignments: {
                    familyMember: {},
                },
            },
            familyMembers: {},
        }),
        [monthConditions, recurrenceReferenceMonthConditions]
    );

    const queryResult = (db as any).useQuery(query) as any;
    const { isLoading, error, data } = queryResult;
    const chores = useMemo(() => ((data?.chores as Chore[]) || []), [data?.chores]);
    const familyMembers = useMemo(
        () =>
            (((data?.familyMembers as CalendarMemberWithColor[]) || []).filter(
                (member) => typeof member?.id === 'string' && member.id.trim().length > 0
            )),
        [data?.familyMembers]
    );
    const memberColorsById = useMemo(() => buildMemberColorMap(familyMembers), [familyMembers]);

    useEffect(() => {
        if (!isLoading && !error && data) {
            setCalendarItems(
                applyResolvedMemberColorsToCalendarItems(
                    mergeCalendarItemsWithOptimistic(data.calendarItems as CalendarItem[], optimisticItemsById)
                        .filter((item) => !shouldHideImportedCalendarItem(item)),
                    memberColorsById
                )
            );
        }
    }, [isLoading, data, error, optimisticItemsById, memberColorsById]);

    useEffect(() => {
        if (!data || isLoading || error) return;

        const serverItems = (data.calendarItems || []) as CalendarItem[];
        setOptimisticItemsById((prev) => {
            let changed = false;
            const next = { ...prev };

            for (const [id, optimisticItem] of Object.entries(prev)) {
                const serverItem = serverItems.find((item) => item.id === id);
                if (optimisticItemSatisfiedByServer(serverItem, optimisticItem)) {
                    delete next[id];
                    changed = true;
                }
            }

            return changed ? next : prev;
        });
    }, [data, isLoading, error]);

    const decorateLiveSearchItem = useCallback(
        (item: CalendarItem) => {
            if (!searchState.isOpen || !normalizedLiveSearchQuery) {
                return item;
            }

            return {
                ...item,
                __liveSearchState: calendarItemMatchesTextQuery(item, normalizedLiveSearchQuery) ? 'match' : 'dim',
            };
        },
        [normalizedLiveSearchQuery, searchState.isOpen]
    );

    const { dayItemsByDate, denseDayItemsByDate, weekSpanLanesByWeek, dayViewItems } = useMemo(() => {
        const byDate = new Map<string, CalendarItem[]>();
        const denseByDate = new Map<string, CalendarItem[]>();
        const weekSpanSegmentsByWeek = new Map<string, CalendarWeekSpanSegment[]>();
        const itemsForDayView: CalendarItem[] = [];
        const dayViewItemKeys = new Set<string>();
        const rangeStartTime = activeRangeStart.getTime();
        const rangeEndTime = activeRangeEnd.getTime();
        const rangeStartDay = toDayStart(activeRangeStart);
        const rangeEndDay = toDayStart(activeRangeEnd);
        const recurrenceOverrideDayKeysByMasterId = new Map<string, Set<string>>();
        const selectedMemberIdSet = new Set(effectiveSelectedMemberIds);
        const selectedChoreIdSet = new Set(effectiveSelectedChoreIds);

        const matchesMemberFilter = (item: CalendarItem) => {
            const pertainsToIds = (Array.isArray(item.pertainsTo) ? item.pertainsTo : [])
                .map((member) => member?.id)
                .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                .map((id) => id.trim());
            const isEveryoneEvent = pertainsToIds.length === 0;

            if (!effectiveMemberFilterConfigured && effectiveEveryoneSelected && selectedMemberIdSet.size === 0) {
                return true;
            }

            if (effectiveEveryoneSelected) {
                if (selectedMemberIdSet.size === 0) {
                    return isEveryoneEvent;
                }
                if (isEveryoneEvent) {
                    return true;
                }
                return pertainsToIds.some((id) => selectedMemberIdSet.has(id));
            }

            if (selectedMemberIdSet.size === 0) return false;
            if (isEveryoneEvent) return false;
            return pertainsToIds.some((id) => selectedMemberIdSet.has(id));
        };

        const matchesChoreMemberFilter = (assignedMembers: Array<{ id: string; name?: string; color?: string | null }>) => {
            const assignedIds = assignedMembers
                .map((member) => member?.id)
                .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                .map((id) => id.trim());

            if (assignedIds.length === 0) {
                return false;
            }

            if (!effectiveMemberFilterConfigured && effectiveEveryoneSelected && selectedMemberIdSet.size === 0) {
                return true;
            }

            if (selectedMemberIdSet.size === 0) {
                return false;
            }

            return assignedIds.some((id) => selectedMemberIdSet.has(id));
        };

        const matchesEventFilters = (item: CalendarItem) => calendarItemMatchesNonDatePersistentFilters(item, effectivePersistentFilters);

        const matchesChoreIdFilter = (choreId: string) => {
            const normalizedId = String(choreId || '').trim();
            if (!normalizedId) {
                return false;
            }

            if (!effectiveChoreFilterConfigured && selectedChoreIdSet.size === 0) {
                return true;
            }

            if (selectedChoreIdSet.size === 0) {
                return false;
            }

            return selectedChoreIdSet.has(normalizedId);
        };

        const calendarItemsForView = calendarItems.filter((item) => matchesMemberFilter(item) && matchesEventFilters(item));
        const calendarItemsById = new Map(calendarItems.map((item) => [item.id, item] as const));
        const calendarItemsBySourceExternalId = new Map(
            calendarItems
                .filter((item) => typeof item.sourceExternalId === 'string' && item.sourceExternalId.trim())
                .map((item) => [String(item.sourceExternalId).trim(), item] as const)
        );
        if (!effectiveEveryoneSelected && selectedMemberIdSet.size === 0) {
            return {
                dayItemsByDate: byDate,
                denseDayItemsByDate: denseByDate,
                weekSpanLanesByWeek: new Map<string, CalendarWeekSpanSegment[][]>(),
                dayViewItems: [],
            };
        }

        const pushByDate = (dateKey: string, item: CalendarItem) => {
            const existing = byDate.get(dateKey);
            if (existing) {
                existing.push(item);
            } else {
                byDate.set(dateKey, [item]);
            }
        };

        const pushDenseByDate = (dateKey: string, item: CalendarItem) => {
            const existing = denseByDate.get(dateKey);
            if (existing) {
                existing.push(item);
            } else {
                denseByDate.set(dateKey, [item]);
            }
        };

        const pushWeekSpanSegment = (weekKey: string, segment: CalendarWeekSpanSegment) => {
            const existing = weekSpanSegmentsByWeek.get(weekKey);
            if (existing) {
                existing.push(segment);
            } else {
                weekSpanSegmentsByWeek.set(weekKey, [segment]);
            }
        };
        const pushDayViewItem = (item: CalendarItem) => {
            const key = [
                item.id,
                item.startDate,
                item.endDate,
                String(item.recurrenceId || ''),
                String((item as any).__displayDate || ''),
                String(item.calendarItemKind || 'event'),
            ].join('::');
            if (dayViewItemKeys.has(key)) {
                return;
            }
            dayViewItemKeys.add(key);
            itemsForDayView.push(item);
        };

        for (const item of calendarItemsForView) {
            const masterId = typeof item.recurringEventId === 'string' ? item.recurringEventId.trim() : '';
            if (!masterId) continue;
            if (normalizeRruleString(String(item.rrule || ''))) continue;

            const recurrenceReference = typeof item.recurrenceId === 'string' ? item.recurrenceId.trim() : '';
            if (!recurrenceReference) continue;
            const referenceDate = parseRecurrenceDateToken(recurrenceReference);
            if (!referenceDate || Number.isNaN(referenceDate.getTime())) continue;

            const dayKey = format(referenceDate, 'yyyy-MM-dd');
            const existing = recurrenceOverrideDayKeysByMasterId.get(masterId);
            if (existing) {
                existing.add(dayKey);
            } else {
                recurrenceOverrideDayKeysByMasterId.set(masterId, new Set([dayKey]));
            }
        }

        const expandRecurringItemForRange = (item: CalendarItem): CalendarItem[] => {
            if (!item.rrule) {
                return [item];
            }

            const start = parseISO(item.startDate);
            const exclusiveEnd = parseISO(item.endDate);
            if (Number.isNaN(start.getTime()) || Number.isNaN(exclusiveEnd.getTime()) || exclusiveEnd.getTime() <= start.getTime()) {
                return [item];
            }

            const normalizedRule = normalizeRruleString(item.rrule);
            if (!normalizedRule) {
                return [item];
            }

            try {
                const ruleOptions = RRule.parseString(normalizedRule);
                const recurrenceDtStart = item.isAllDay
                    ? new Date(
                          Date.UTC(
                              start.getFullYear(),
                              start.getMonth(),
                              start.getDate(),
                              start.getHours(),
                              start.getMinutes(),
                              start.getSeconds(),
                              start.getMilliseconds()
                          )
                      )
                    : start;
                const recurrenceRule = new RRule({
                    ...ruleOptions,
                    dtstart: recurrenceDtStart,
                });

                const durationMs = Math.max(0, exclusiveEnd.getTime() - start.getTime());
                const allDaySpanDays = item.isAllDay ? Math.max(1, differenceInDays(exclusiveEnd, start)) : 1;
                const searchStart =
                    item.isAllDay && allDaySpanDays > 1 ? addDays(activeRangeStart, -(allDaySpanDays - 1)) : activeRangeStart;

                const generatedStarts = recurrenceRule.between(searchStart, activeRangeEnd, true);
                const rdateTokens = [...splitDateTokens(item.rdates), ...collectRecurrenceLineTokens(item.recurrenceLines, 'RDATE')];
                const rdateStarts = rdateTokens.map((token) => parseRecurrenceDateToken(token)).filter(Boolean) as Date[];

                const exdateTokens = [...splitDateTokens(item.exdates), ...collectRecurrenceLineTokens(item.recurrenceLines, 'EXDATE')];
                const excludedDayKeys = new Set<string>();
                const excludedExactTimes = new Set<number>();
                for (const token of exdateTokens) {
                    const parsed = parseRecurrenceDateToken(token);
                    if (!parsed) continue;
                    excludedDayKeys.add(format(parsed, 'yyyy-MM-dd'));
                    excludedExactTimes.add(parsed.getTime());
                }

                const sourceExternalId = typeof item.sourceExternalId === 'string' ? item.sourceExternalId.trim() : '';
                const overrideDayKeys = recurrenceOverrideDayKeysByMasterId.get(item.id) || (sourceExternalId ? recurrenceOverrideDayKeysByMasterId.get(sourceExternalId) : undefined);
                const seenOccurrenceKeys = new Set<string>();
                const uniqueStartsByKey = new Map<string, Date>();
                for (const rawStart of [start, ...generatedStarts, ...rdateStarts]) {
                    if (Number.isNaN(rawStart.getTime())) continue;
                    const normalizedStart = item.isAllDay ? parseISO(format(rawStart, 'yyyy-MM-dd')) : rawStart;
                    if (Number.isNaN(normalizedStart.getTime())) continue;
                    const startKey = item.isAllDay ? format(normalizedStart, 'yyyy-MM-dd') : normalizedStart.toISOString();
                    if (!uniqueStartsByKey.has(startKey)) {
                        uniqueStartsByKey.set(startKey, normalizedStart);
                    }
                }
                const starts = Array.from(uniqueStartsByKey.values()).sort((left, right) => left.getTime() - right.getTime());

                const occurrenceItems: CalendarItem[] = [];
                for (const occurrenceStart of starts) {
                    const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
                    const dayKey = format(occurrenceStart, 'yyyy-MM-dd');
                    const dedupeKey = item.isAllDay ? dayKey : occurrenceStart.toISOString();
                    if (seenOccurrenceKeys.has(dedupeKey)) continue;
                    seenOccurrenceKeys.add(dedupeKey);

                    if (item.isAllDay) {
                        const overlapsRange = occurrenceEnd.getTime() > rangeStartTime && occurrenceStart.getTime() <= rangeEndTime;
                        if (!overlapsRange) continue;
                        if (excludedDayKeys.has(dayKey)) continue;
                    } else {
                        const startsInRange = occurrenceStart.getTime() >= rangeStartTime && occurrenceStart.getTime() <= rangeEndTime;
                        if (!startsInRange) continue;
                        if (excludedExactTimes.has(occurrenceStart.getTime()) || excludedDayKeys.has(dayKey)) continue;
                    }

                    if (overrideDayKeys?.has(dayKey)) continue;

                    occurrenceItems.push({
                        ...item,
                        startDate: item.isAllDay ? format(occurrenceStart, 'yyyy-MM-dd') : occurrenceStart.toISOString(),
                        endDate: item.isAllDay ? format(occurrenceEnd, 'yyyy-MM-dd') : occurrenceEnd.toISOString(),
                        __masterEvent: item,
                        __isRecurrenceInstance: occurrenceStart.getTime() !== start.getTime(),
                    });
                }

                return occurrenceItems;
            } catch (error) {
                return [item];
            }
        };

        for (const baseItem of calendarItemsForView) {
            const masterId = typeof baseItem.recurringEventId === 'string' ? baseItem.recurringEventId.trim() : '';
            const masterForOverride = masterId ? (calendarItemsById.get(masterId) || calendarItemsBySourceExternalId.get(masterId)) : undefined;
            const sourceItem = masterForOverride ? ({ ...baseItem, __masterEvent: masterForOverride } as CalendarItem) : baseItem;
            const itemsToRender = expandRecurringItemForRange(sourceItem);
            for (const item of itemsToRender) {
                if (!calendarItemOverlapsDateRange(item, effectivePersistentFilters.dateRange)) {
                    continue;
                }

                const decoratedItem = decorateLiveSearchItem(item);
                const start = parseISO(item.startDate);
                const exclusiveEnd = parseISO(item.endDate);
                if (Number.isNaN(start.getTime()) || Number.isNaN(exclusiveEnd.getTime())) {
                    continue;
                }

                const startDay = toDayStart(start);
                const endDay = getInclusiveEndDayStart(exclusiveEnd);
                const isMultiDay = endDay.getTime() > startDay.getTime();
                if (exclusiveEnd.getTime() > rangeStartTime && start.getTime() <= rangeEndTime) {
                    pushDayViewItem(decoratedItem);
                }

                if (isMultiDay) {
                    const visibleStartDay = startDay.getTime() < rangeStartDay.getTime() ? rangeStartDay : startDay;
                    const visibleEndDay = endDay.getTime() > rangeEndDay.getTime() ? rangeEndDay : endDay;
                    if (visibleEndDay.getTime() < visibleStartDay.getTime()) {
                        continue;
                    }

                    for (let denseDay = visibleStartDay; denseDay.getTime() <= visibleEndDay.getTime(); denseDay = addDays(denseDay, 1)) {
                        const displayDate = format(denseDay, 'yyyy-MM-dd');
                        pushDenseByDate(displayDate, {
                            ...decoratedItem,
                            __displayDate: displayDate,
                        });
                    }

                    let segmentStartDay = visibleStartDay;
                    while (segmentStartDay.getTime() <= visibleEndDay.getTime()) {
                        const weekStart = startOfWeek(segmentStartDay, { weekStartsOn: WEEK_STARTS_ON });
                        const weekEnd = addDays(weekStart, 6);
                        const segmentEndDay = visibleEndDay.getTime() < weekEnd.getTime() ? visibleEndDay : weekEnd;
                        const weekKey = format(weekStart, 'yyyy-MM-dd');
                        pushWeekSpanSegment(weekKey, {
                            segmentKey: `${decoratedItem.id}-${format(segmentStartDay, 'yyyy-MM-dd')}-${format(segmentEndDay, 'yyyy-MM-dd')}`,
                            item: decoratedItem,
                            startCol: differenceInDays(segmentStartDay, weekStart),
                            endCol: differenceInDays(segmentEndDay, weekStart),
                            continuesBefore: segmentStartDay.getTime() > startDay.getTime(),
                            continuesAfter: segmentEndDay.getTime() < endDay.getTime(),
                        });
                        segmentStartDay = addDays(segmentEndDay, 1);
                    }
                    continue;
                }

                const time = start.getTime();
                if (time >= rangeStartTime && time <= rangeEndTime) {
                    const displayDate = format(start, 'yyyy-MM-dd');
                    pushByDate(displayDate, decoratedItem);
                    pushDenseByDate(displayDate, {
                        ...decoratedItem,
                        __displayDate: displayDate,
                    });
                }
            }
        }

        if (effectiveShowChores) {
            for (const day of days) {
                const dateKey = format(day, 'yyyy-MM-dd');
                const utcDay = getUtcDateFromDateKey(dateKey);
                if (!utcDay) continue;

                for (const chore of chores) {
                    if (!chore?.id || !chore?.title || !chore?.startDate) continue;
                    if (!matchesChoreIdFilter(chore.id)) continue;

                    const assignedMembers = resolveMemberColors(getAssignedMembersForChoreOnDate(chore, utcDay), memberColorsById);
                    if (!matchesChoreMemberFilter(assignedMembers)) continue;

                    const choreItem = {
                        id: `chore-${chore.id}-${dateKey}`,
                        title: chore.title,
                        description: chore.description || '',
                        startDate: dateKey,
                        endDate: format(addDays(day, 1), 'yyyy-MM-dd'),
                        isAllDay: true,
                        pertainsTo: assignedMembers,
                        calendarItemKind: 'chore',
                        sourceChoreId: chore.id,
                        isJoint: chore.isJoint ?? false,
                        isUpForGrabs: chore.isUpForGrabs ?? false,
                    } as CalendarItem;
                    if (!calendarItemMatchesPersistentFilters(choreItem, effectivePersistentFilters)) {
                        continue;
                    }
                    const decoratedChoreItem = decorateLiveSearchItem(choreItem);
                    pushByDate(dateKey, decoratedChoreItem);
                    pushDenseByDate(dateKey, decoratedChoreItem);
                    pushDayViewItem(decoratedChoreItem);
                }
            }
        }

        byDate.forEach((dayItems, dateKey) => {
            byDate.set(dateKey, [...dayItems].sort(compareCalendarItemsByStartTime));
        });
        denseByDate.forEach((dayItems, dateKey) => {
            denseByDate.set(dateKey, [...dayItems].sort(compareCalendarItemsByStartTime));
        });

        const spanLanesByWeek = new Map<string, CalendarWeekSpanSegment[][]>();
        for (const [weekKey, segments] of Array.from(weekSpanSegmentsByWeek.entries())) {
            spanLanesByWeek.set(weekKey, assignWeekSpanLanes(segments));
        }
        itemsForDayView.sort(compareCalendarItemsByStartTime);

        return {
            dayItemsByDate: byDate,
            denseDayItemsByDate: denseByDate,
            weekSpanLanesByWeek: spanLanesByWeek,
            dayViewItems: itemsForDayView,
        };
    }, [
        activeRangeEnd,
        activeRangeStart,
        calendarItems,
        effectiveChoreFilterConfigured,
        effectiveEveryoneSelected,
        effectiveMemberFilterConfigured,
        effectiveSelectedChoreIds,
        effectiveSelectedMemberIds,
        effectiveShowChores,
        effectivePersistentFilters,
        chores,
        days,
        decorateLiveSearchItem,
        memberColorsById,
    ]);

    const buildAgendaLikeCollections = useCallback(
        (rangeWindow: CalendarRangeWindow) => {
            const denseByDate = new Map<string, CalendarItem[]>();
            const rangeStart = rangeWindow.start;
            const rangeEnd = rangeWindow.end;
            const rangeStartTime = rangeStart.getTime();
            const rangeEndTime = rangeEnd.getTime();
            const rangeStartDay = toDayStart(rangeStart);
            const rangeEndDay = toDayStart(rangeEnd);
            const selectedMemberIdSet = new Set(effectiveSelectedMemberIds);
            const selectedChoreIdSet = new Set(effectiveSelectedChoreIds);
            const recurrenceOverrideDayKeysByMasterId = new Map<string, Set<string>>();
            const rangeDays: Date[] = [];
            let dayCursor = rangeStartDay;
            while (dayCursor.getTime() <= rangeEndDay.getTime()) {
                rangeDays.push(dayCursor);
                dayCursor = addDays(dayCursor, 1);
            }

            const matchesMemberFilter = (item: CalendarItem) => {
                const pertainsToIds = (Array.isArray(item.pertainsTo) ? item.pertainsTo : [])
                    .map((member) => member?.id)
                    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                    .map((id) => id.trim());
                const isEveryoneEvent = pertainsToIds.length === 0;

                if (!effectiveMemberFilterConfigured && effectiveEveryoneSelected && selectedMemberIdSet.size === 0) {
                    return true;
                }

                if (effectiveEveryoneSelected) {
                    if (selectedMemberIdSet.size === 0) return isEveryoneEvent;
                    if (isEveryoneEvent) return true;
                    return pertainsToIds.some((id) => selectedMemberIdSet.has(id));
                }

                if (selectedMemberIdSet.size === 0 || isEveryoneEvent) return false;
                return pertainsToIds.some((id) => selectedMemberIdSet.has(id));
            };

            const matchesChoreMemberFilter = (assignedMembers: Array<{ id: string; name?: string; color?: string | null }>) => {
                const assignedIds = assignedMembers
                    .map((member) => member?.id)
                    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
                    .map((id) => id.trim());

                if (assignedIds.length === 0) return false;
                if (!effectiveMemberFilterConfigured && effectiveEveryoneSelected && selectedMemberIdSet.size === 0) return true;
                if (selectedMemberIdSet.size === 0) return false;
                return assignedIds.some((id) => selectedMemberIdSet.has(id));
            };

            const matchesEventFilters = (item: CalendarItem) => calendarItemMatchesNonDatePersistentFilters(item, effectivePersistentFilters);

            const matchesChoreIdFilter = (choreId: string) => {
                const normalizedId = String(choreId || '').trim();
                if (!normalizedId) return false;
                if (!effectiveChoreFilterConfigured && selectedChoreIdSet.size === 0) return true;
                if (selectedChoreIdSet.size === 0) return false;
                return selectedChoreIdSet.has(normalizedId);
            };

            const pushDenseByDate = (dateKey: string, item: CalendarItem) => {
                const existing = denseByDate.get(dateKey);
                if (existing) {
                    existing.push(item);
                } else {
                    denseByDate.set(dateKey, [item]);
                }
            };

            const calendarItemsForView = calendarItems.filter((item) => matchesMemberFilter(item) && matchesEventFilters(item));
            const calendarItemsById = new Map(calendarItems.map((item) => [item.id, item] as const));
            const calendarItemsBySourceExternalId = new Map(
                calendarItems
                    .filter((item) => typeof item.sourceExternalId === 'string' && item.sourceExternalId.trim())
                    .map((item) => [String(item.sourceExternalId).trim(), item] as const)
            );

            for (const item of calendarItemsForView) {
                const masterId = typeof item.recurringEventId === 'string' ? item.recurringEventId.trim() : '';
                if (!masterId) continue;
                if (normalizeRruleString(String(item.rrule || ''))) continue;

                const recurrenceReference = typeof item.recurrenceId === 'string' ? item.recurrenceId.trim() : '';
                if (!recurrenceReference) continue;
                const referenceDate = parseRecurrenceDateToken(recurrenceReference);
                if (!referenceDate || Number.isNaN(referenceDate.getTime())) continue;

                const dayKey = format(referenceDate, 'yyyy-MM-dd');
                const existing = recurrenceOverrideDayKeysByMasterId.get(masterId);
                if (existing) {
                    existing.add(dayKey);
                } else {
                    recurrenceOverrideDayKeysByMasterId.set(masterId, new Set([dayKey]));
                }
            }

            const expandRecurringItemForRange = (item: CalendarItem): CalendarItem[] => {
                if (!item.rrule) return [item];

                const start = parseISO(item.startDate);
                const exclusiveEnd = parseISO(item.endDate);
                if (Number.isNaN(start.getTime()) || Number.isNaN(exclusiveEnd.getTime()) || exclusiveEnd.getTime() <= start.getTime()) {
                    return [item];
                }

                const normalizedRule = normalizeRruleString(item.rrule);
                if (!normalizedRule) return [item];

                try {
                    const ruleOptions = RRule.parseString(normalizedRule);
                    const recurrenceDtStart = item.isAllDay
                        ? new Date(
                              Date.UTC(
                                  start.getFullYear(),
                                  start.getMonth(),
                                  start.getDate(),
                                  start.getHours(),
                                  start.getMinutes(),
                                  start.getSeconds(),
                                  start.getMilliseconds()
                              )
                          )
                        : start;
                    const recurrenceRule = new RRule({
                        ...ruleOptions,
                        dtstart: recurrenceDtStart,
                    });

                    const durationMs = Math.max(0, exclusiveEnd.getTime() - start.getTime());
                    const allDaySpanDays = item.isAllDay ? Math.max(1, differenceInDays(exclusiveEnd, start)) : 1;
                    const searchStart =
                        item.isAllDay && allDaySpanDays > 1 ? addDays(rangeStart, -(allDaySpanDays - 1)) : rangeStart;
                    const generatedStarts = recurrenceRule.between(searchStart, rangeEnd, true);
                    const rdateTokens = [...splitDateTokens(item.rdates), ...collectRecurrenceLineTokens(item.recurrenceLines, 'RDATE')];
                    const rdateStarts = rdateTokens.map((token) => parseRecurrenceDateToken(token)).filter(Boolean) as Date[];
                    const exdateTokens = [...splitDateTokens(item.exdates), ...collectRecurrenceLineTokens(item.recurrenceLines, 'EXDATE')];
                    const excludedDayKeys = new Set<string>();
                    const excludedExactTimes = new Set<number>();
                    for (const token of exdateTokens) {
                        const parsed = parseRecurrenceDateToken(token);
                        if (!parsed) continue;
                        excludedDayKeys.add(format(parsed, 'yyyy-MM-dd'));
                        excludedExactTimes.add(parsed.getTime());
                    }

                    const sourceExternalId = typeof item.sourceExternalId === 'string' ? item.sourceExternalId.trim() : '';
                    const overrideDayKeys =
                        recurrenceOverrideDayKeysByMasterId.get(item.id) ||
                        (sourceExternalId ? recurrenceOverrideDayKeysByMasterId.get(sourceExternalId) : undefined);
                    const seenOccurrenceKeys = new Set<string>();
                    const uniqueStartsByKey = new Map<string, Date>();
                    for (const rawStart of [start, ...generatedStarts, ...rdateStarts]) {
                        if (Number.isNaN(rawStart.getTime())) continue;
                        const normalizedStart = item.isAllDay ? parseISO(format(rawStart, 'yyyy-MM-dd')) : rawStart;
                        if (Number.isNaN(normalizedStart.getTime())) continue;
                        const startKey = item.isAllDay ? format(normalizedStart, 'yyyy-MM-dd') : normalizedStart.toISOString();
                        if (!uniqueStartsByKey.has(startKey)) {
                            uniqueStartsByKey.set(startKey, normalizedStart);
                        }
                    }

                    return Array.from(uniqueStartsByKey.values())
                        .sort((left, right) => left.getTime() - right.getTime())
                        .reduce<CalendarItem[]>((occurrenceItems, occurrenceStart) => {
                            const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
                            const dayKey = format(occurrenceStart, 'yyyy-MM-dd');
                            const dedupeKey = item.isAllDay ? dayKey : occurrenceStart.toISOString();
                            if (seenOccurrenceKeys.has(dedupeKey)) return occurrenceItems;
                            seenOccurrenceKeys.add(dedupeKey);

                            if (item.isAllDay) {
                                const overlapsRange = occurrenceEnd.getTime() > rangeStartTime && occurrenceStart.getTime() <= rangeEndTime;
                                if (!overlapsRange || excludedDayKeys.has(dayKey)) return occurrenceItems;
                            } else {
                                const startsInRange = occurrenceStart.getTime() >= rangeStartTime && occurrenceStart.getTime() <= rangeEndTime;
                                if (!startsInRange || excludedExactTimes.has(occurrenceStart.getTime()) || excludedDayKeys.has(dayKey)) {
                                    return occurrenceItems;
                                }
                            }

                            if (overrideDayKeys?.has(dayKey)) return occurrenceItems;
                            occurrenceItems.push({
                                ...item,
                                startDate: item.isAllDay ? format(occurrenceStart, 'yyyy-MM-dd') : occurrenceStart.toISOString(),
                                endDate: item.isAllDay ? format(occurrenceEnd, 'yyyy-MM-dd') : occurrenceEnd.toISOString(),
                                __masterEvent: item,
                                __isRecurrenceInstance: occurrenceStart.getTime() !== start.getTime(),
                            });
                            return occurrenceItems;
                        }, []);
                } catch (_error) {
                    return [item];
                }
            };

            for (const baseItem of calendarItemsForView) {
                const masterId = typeof baseItem.recurringEventId === 'string' ? baseItem.recurringEventId.trim() : '';
                const masterForOverride = masterId ? (calendarItemsById.get(masterId) || calendarItemsBySourceExternalId.get(masterId)) : undefined;
                const sourceItem = masterForOverride ? ({ ...baseItem, __masterEvent: masterForOverride } as CalendarItem) : baseItem;
                const itemsToRender = expandRecurringItemForRange(sourceItem);

                for (const occurrenceItem of itemsToRender) {
                    if (!calendarItemOverlapsDateRange(occurrenceItem, effectivePersistentFilters.dateRange)) {
                        continue;
                    }

                    const decoratedItem = decorateLiveSearchItem(occurrenceItem);
                    const start = parseISO(occurrenceItem.startDate);
                    const exclusiveEnd = parseISO(occurrenceItem.endDate);
                    if (Number.isNaN(start.getTime()) || Number.isNaN(exclusiveEnd.getTime())) {
                        continue;
                    }

                    const startDay = toDayStart(start);
                    const endDay = getInclusiveEndDayStart(exclusiveEnd);
                    const visibleStartDay = startDay.getTime() < rangeStartDay.getTime() ? rangeStartDay : startDay;
                    const visibleEndDay = endDay.getTime() > rangeEndDay.getTime() ? rangeEndDay : endDay;
                    if (visibleEndDay.getTime() < visibleStartDay.getTime()) {
                        continue;
                    }

                    for (let denseDay = visibleStartDay; denseDay.getTime() <= visibleEndDay.getTime(); denseDay = addDays(denseDay, 1)) {
                        const displayDate = format(denseDay, 'yyyy-MM-dd');
                        pushDenseByDate(displayDate, {
                            ...decoratedItem,
                            __displayDate: displayDate,
                        });
                    }
                }
            }

            if (effectiveShowChores) {
                for (const day of rangeDays) {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const utcDay = getUtcDateFromDateKey(dateKey);
                    if (!utcDay) continue;

                    for (const chore of chores) {
                        if (!chore?.id || !chore?.title || !chore?.startDate) continue;
                        if (!matchesChoreIdFilter(chore.id)) continue;

                        const assignedMembers = resolveMemberColors(getAssignedMembersForChoreOnDate(chore, utcDay), memberColorsById);
                        if (!matchesChoreMemberFilter(assignedMembers)) continue;

                        const choreItem = {
                            id: `chore-${chore.id}-${dateKey}`,
                            title: chore.title,
                            description: chore.description || '',
                            startDate: dateKey,
                            endDate: format(addDays(day, 1), 'yyyy-MM-dd'),
                            isAllDay: true,
                            pertainsTo: assignedMembers,
                            calendarItemKind: 'chore',
                            sourceChoreId: chore.id,
                            isJoint: chore.isJoint ?? false,
                            isUpForGrabs: chore.isUpForGrabs ?? false,
                        } as CalendarItem;

                        if (!calendarItemMatchesPersistentFilters(choreItem, effectivePersistentFilters)) {
                            continue;
                        }

                        const decoratedChoreItem = decorateLiveSearchItem(choreItem);
                        pushDenseByDate(dateKey, decoratedChoreItem);
                    }
                }
            }

            denseByDate.forEach((items, dateKey) => {
                denseByDate.set(dateKey, [...items].sort(compareCalendarItemsByStartTime));
            });

            return {
                denseDayItemsByDate: denseByDate,
            };
        },
        [
            calendarItems,
            chores,
            decorateLiveSearchItem,
            effectiveChoreFilterConfigured,
            effectiveEveryoneSelected,
            effectiveMemberFilterConfigured,
            effectivePersistentFilters,
            effectiveSelectedChoreIds,
            effectiveSelectedMemberIds,
            effectiveShowChores,
            memberColorsById,
        ]
    );

    const agendaCollections = useMemo(
        () => buildAgendaLikeCollections(explicitDateRangeWindow || agendaWindow),
        [agendaWindow, buildAgendaLikeCollections, explicitDateRangeWindow]
    );
    const searchCollections = useMemo(
        () => buildAgendaLikeCollections(explicitDateRangeWindow || searchWindow),
        [buildAgendaLikeCollections, explicitDateRangeWindow, searchWindow]
    );
    const agendaSections = useMemo(
        () => buildCalendarAgendaSections(agendaCollections.denseDayItemsByDate),
        [agendaCollections.denseDayItemsByDate]
    );
    const searchResultSections = useMemo(
        () =>
            normalizedLiveSearchQuery
                ? buildCalendarAgendaSections(searchCollections.denseDayItemsByDate, { textQuery: searchState.query })
                : [],
        [normalizedLiveSearchQuery, searchCollections.denseDayItemsByDate, searchState.query]
    );

    const showYearView = !isMiniInfinite && viewMode === 'year';
    const showDayView = !isMiniInfinite && viewMode === 'day';
    const showAgendaView = !isMiniInfinite && viewMode === 'agenda';
    const showSearchResultsSurface = !isMiniInfinite && searchState.isOpen;
    const showSearchResultsRail = showSearchResultsSurface && searchRailSupported;
    const showSearchResultsDrawer = showSearchResultsSurface && !searchRailSupported;

    return (
        <div className={cn(themeClass, isMiniInfinite && styles.miniCalendarShell, className)} style={style}>
            <RecurrenceScopeDialog
                open={recurrenceScopeDialogOpen}
                action={recurrenceScopeDialogAction}
                scopeMode={recurrenceScopeDialogMode}
                onSelect={resolveRecurrenceScope}
            />
            {dragRecurrenceIndicator ? (
                <div
                    className={styles.dragRecurrenceIndicator}
                    style={{
                        left: `${dragRecurrenceIndicator.x}px`,
                        top: `${dragRecurrenceIndicator.y}px`,
                    }}
                    data-testid="drag-recurrence-indicator"
                >
                    <span className={styles.dragRecurrenceIndicatorLabel}>{dragRecurrenceIndicator.label}</span>
                    <span className={styles.dragRecurrenceIndicatorKey}>{dragRecurrenceIndicator.hotkeyLabel}</span>
                </div>
            ) : null}
            {isMiniInfinite ? (
                <MiniInfiniteCalendarView
                    weeks={weeks}
                    dayItemsByDate={dayItemsByDate}
                    weekSpanLanesByWeek={weekSpanLanesByWeek}
                    scrollContainerRef={scrollContainerRef}
                    dayCellHeight={effectiveDayCellHeight}
                    eventFontScale={effectiveYearFontScale}
                    showGregorianDays={effectiveShowGregorianCalendar}
                    showBsDays={effectiveShowBsCalendar}
                    onDayClick={handleDayClick}
                    onDayDoubleClick={handleDayDoubleClick}
                    onEventClick={handleEventClick}
                    onEventDoubleClick={handleEventDoubleClick}
                    isEventSelected={isEventSelected}
                />
            ) : (
                <div
                    className="flex h-full min-h-0 gap-4 overflow-hidden"
                    style={scrollContainerHeight ? { height: `${scrollContainerHeight}px` } : undefined}
                >
                    <div className="min-w-0 flex-1 h-full">
                        {showAgendaView ? (
                            <CalendarAgendaView
                                sections={agendaSections}
                                display={agendaDisplay}
                                selectedItemKey={selectedEventKey}
                                onDateClick={handleCalendarResultDateClick}
                                onItemClick={handleCalendarResultClick}
                                onReachStart={handleAgendaReachStart}
                                onReachEnd={handleAgendaReachEnd}
                                focusRequest={agendaFocusRequest}
                                title="Agenda"
                                emptyState="No events match the current filters."
                                testId="calendar-agenda-main"
                                className="h-full min-h-0"
                            />
                        ) : (
                            <div
                                ref={scrollContainerRef}
                                data-testid="calendar-scroll-container"
                                className={cn(styles.calendarScrollContainer, showDayView && styles.dayViewScrollContainer)}
                                style={
                                    scrollContainerHeight
                                        ? ({
                                              height: `${scrollContainerHeight}px`,
                                              '--calendar-day-number-top': `${dayNumberStickyTop}px`,
                                              '--calendar-day-cell-height': `${effectiveDayCellHeight}px`,
                                          } as React.CSSProperties)
                                        : undefined
                                }
                            >
                                {showDayView ? (
                                    <DayCalendarView
                                        anchorDate={dayAnchorDate}
                                        renderedDays={dayRenderedDays}
                                        visibleDayCount={dayVisibleDays}
                                        bufferDays={controlledDayBufferDays ?? DAY_VIEW_BUFFER_DAYS}
                                        rowCount={dayRowCount}
                                        hourHeight={dayHourHeight}
                                        visibleHours={useVisibleHoursMode ? dayVisibleHours : undefined}
                                        fontScale={dayFontScale}
                                        containerHeight={scrollContainerHeight}
                                        showGregorianCalendar={effectiveShowGregorianCalendar}
                                        showBsCalendar={effectiveShowBsCalendar}
                                        items={dayViewItems}
                                        dragPreview={dayViewDragPreview}
                                        verticalResetKey={dayViewVerticalResetKey}
                                        scrollRequest={dayViewScrollRequest}
                                        onAnchorDateChange={handleDayViewAnchorChange}
                                        onBackgroundClick={handleDayClick}
                                        onCreateDraft={handleDayViewCreateDraft}
                                        onEventClick={handleEventClick}
                                        onEventDoubleClick={handleEventDoubleClick}
                                        onTimedResize={({ item, nextStartDate, nextEndDate, input }) => {
                                            void applyCalendarTimedResizeUpdate({
                                                item,
                                                nextStartDate,
                                                nextEndDate,
                                                input,
                                            });
                                        }}
                                        isEventSelected={isEventSelected}
                                    />
                                ) : showYearView ? (
                                    <YearCalendarView
                                        months={yearMonths}
                                        leadingBufferMonth={yearLeadingBufferMonth}
                                        monthBasis={effectiveYearMonthBasis}
                                        dayItemsByDate={dayItemsByDate}
                                        weekSpanLanesByWeek={weekSpanLanesByWeek}
                                        columns={yearLayout.columns}
                                        dayCellHeight={yearLayout.dayCellHeight}
                                        chipScale={yearLayout.chipScale}
                                        fontScale={effectiveYearFontScale}
                                        shiftAnimation={yearShiftAnimation}
                                        trailingBufferMonth={yearTrailingBufferMonth}
                                        showGregorianCalendar={effectiveShowGregorianCalendar}
                                        showBsCalendar={effectiveShowBsCalendar}
                                        showInlineNonBasisMonthBreaks={effectiveShowInlineNonBasisMonthBreaks}
                                        scrollContainerRef={scrollContainerRef}
                                        onShiftAnimationComplete={handleYearShiftAnimationComplete}
                                        onDayClick={handleDayClick}
                                        onDayDoubleClick={handleDayDoubleClick}
                                        onEventClick={handleEventClick}
                                        onEventDoubleClick={handleEventDoubleClick}
                                        isEventSelected={isEventSelected}
                                    />
                                ) : (
                                    <CalendarMonthlyGrid
                                        headerRef={headerRef}
                                        weeks={weeks}
                                        weekSpanLanesByWeek={weekSpanLanesByWeek}
                                        effectiveShowGregorianCalendar={effectiveShowGregorianCalendar}
                                        effectiveShowBsCalendar={effectiveShowBsCalendar}
                                        showMonthlyBsInlineBreaks={showMonthlyBsInlineBreaks}
                                        dayItemsByDate={dayItemsByDate}
                                        onDayClick={handleDayClick}
                                        onDayDoubleClick={handleDayDoubleClick}
                                        onEventClick={handleEventClick}
                                        onEventDoubleClick={handleEventDoubleClick}
                                        isEventSelected={isEventSelected}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                    {showSearchResultsRail ? (
                        <aside className="h-full min-h-0 w-[clamp(19rem,24vw,27rem)] shrink-0 overflow-hidden">
                            <CalendarAgendaView
                                sections={searchResultSections}
                                display={agendaDisplay}
                                compact
                                selectedItemKey={selectedEventKey}
                                onDateClick={handleCalendarResultDateClick}
                                onItemClick={handleCalendarResultClick}
                                onReachStart={handleSearchReachStart}
                                onReachEnd={handleSearchReachEnd}
                                title="Search results"
                                emptyState={normalizedLiveSearchQuery ? 'No search hits match the current filters.' : 'Type in search to see matching results.'}
                                testId="calendar-search-results"
                                className="h-full min-h-0"
                            />
                        </aside>
                    ) : null}
                </div>
            )}

            <CalendarDialogs
                showSearchResultsDrawer={showSearchResultsDrawer}
                searchState={searchState}
                setSearchState={setSearchState}
                searchResultSections={searchResultSections}
                agendaDisplay={agendaDisplay}
                selectedEventKey={selectedEventKey}
                normalizedLiveSearchQuery={normalizedLiveSearchQuery}
                handleCalendarResultDateClick={handleCalendarResultDateClick}
                handleCalendarResultClick={handleCalendarResultClick}
                handleSearchReachStart={handleSearchReachStart}
                handleSearchReachEnd={handleSearchReachEnd}
                selectedEvent={selectedEvent}
                eventDetailOpen={eventDetailOpen}
                handleEventDetailClose={handleEventDetailClose}
                handleEventDetailEdit={handleEventDetailEdit}
                chores={chores}
                familyMembers={familyMembers as { id: string; name?: string | null }[]}
                choreDetailChoreId={choreDetailChoreId}
                choreDetailDate={choreDetailDate}
                handleChoreDetailClose={handleChoreDetailClose}
                handleChoreDetailEdit={handleChoreDetailEdit}
                isModalOpen={isModalOpen}
                handleCloseModal={handleCloseModal}
                selectedDate={selectedDate}
                initialDraftSelection={initialDraftSelection}
                calendarItems={calendarItems}
                applyOptimisticCalendarItem={applyOptimisticCalendarItem}
                deleteConfirmOpen={deleteConfirmOpen}
                setDeleteConfirmOpen={setDeleteConfirmOpen}
                handleDeleteByScope={handleDeleteByScope}
            />
        </div>
    );
};

export default Calendar;
