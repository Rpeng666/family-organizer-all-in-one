export const CALENDAR_DAY_HEIGHT_MIN = 84;
export const CALENDAR_DAY_HEIGHT_MAX = 220;
export const CALENDAR_DAY_HEIGHT_DEFAULT = 120;
export const CALENDAR_VISIBLE_WEEKS_MIN = 3;
export const CALENDAR_VISIBLE_WEEKS_MAX = 10;
export const CALENDAR_DAY_VIEW_VISIBLE_DAYS_MIN = 1;
export const CALENDAR_DAY_VIEW_VISIBLE_DAYS_MAX = 14;
export const CALENDAR_DAY_VIEW_VISIBLE_DAYS_DEFAULT = 1;
export const CALENDAR_DAY_VIEW_ROW_COUNT_DEFAULT = 1;
export const CALENDAR_DAY_VIEW_HOUR_HEIGHT_MIN = 32;
export const CALENDAR_DAY_VIEW_HOUR_HEIGHT_MAX = 112;
export const CALENDAR_DAY_VIEW_HOUR_HEIGHT_DEFAULT = 44;
export const CALENDAR_DAY_VIEW_VISIBLE_HOURS_MIN = 2;
export const CALENDAR_DAY_VIEW_VISIBLE_HOURS_MAX = 24;
export const CALENDAR_DAY_VIEW_VISIBLE_HOURS_DEFAULT = 12;
export const CALENDAR_DAY_VIEW_FONT_SCALE_MIN = 0.35;
export const CALENDAR_DAY_VIEW_FONT_SCALE_MAX = 1;
export const CALENDAR_DAY_VIEW_FONT_SCALE_DEFAULT = 1;
export const CALENDAR_DAY_HEIGHT_STORAGE_KEY = 'calendar.dayCellHeightPx';
export const CALENDAR_SHOW_CHORES_STORAGE_KEY = 'calendar.showChores';
export const CALENDAR_VIEW_MODE_STORAGE_KEY = 'calendar.viewMode';
export const CALENDAR_DAY_VIEW_VISIBLE_DAYS_STORAGE_KEY = 'calendar.dayViewVisibleDays';
export const CALENDAR_DAY_VIEW_HOUR_HEIGHT_STORAGE_KEY = 'calendar.dayViewHourHeight';
export const CALENDAR_DAY_VIEW_VISIBLE_HOURS_STORAGE_KEY = 'calendar.dayViewVisibleHours';
export const CALENDAR_DAY_VIEW_ROW_COUNT_STORAGE_KEY = 'calendar.dayViewRowCount';
export const CALENDAR_DAY_VIEW_FONT_SCALE_STORAGE_KEY = 'calendar.dayViewFontScale';
export const CALENDAR_YEAR_MONTH_BASIS_STORAGE_KEY = 'calendar.yearMonthBasis';
export const CALENDAR_SHOW_GREGORIAN_CALENDAR_STORAGE_KEY = 'calendar.showGregorianCalendar';
export const CALENDAR_SHOW_BS_CALENDAR_STORAGE_KEY = 'calendar.showBsCalendar';
export const CALENDAR_SHOW_INLINE_NON_BASIS_MONTH_BREAKS_STORAGE_KEY = 'calendar.showInlineNonBasisMonthBreaks';
export const CALENDAR_AGENDA_FONT_SCALE_MIN = 0.82;
export const CALENDAR_AGENDA_FONT_SCALE_MAX = 1.35;
export const CALENDAR_AGENDA_FONT_SCALE_DEFAULT = 1;
export const CALENDAR_AGENDA_FONT_SCALE_STORAGE_KEY = 'calendar.agendaFontScale';
export const CALENDAR_AGENDA_SHOW_TAGS_STORAGE_KEY = 'calendar.agendaShowTags';
export const CALENDAR_AGENDA_SHOW_DESCRIPTION_STORAGE_KEY = 'calendar.agendaShowDescription';
export const CALENDAR_AGENDA_SHOW_LOCATION_STORAGE_KEY = 'calendar.agendaShowLocation';
export const CALENDAR_AGENDA_SHOW_METADATA_STORAGE_KEY = 'calendar.agendaShowMetadata';
export const CALENDAR_YEAR_FONT_SCALE_MIN = 0.08;
export const CALENDAR_YEAR_FONT_SCALE_MAX = 2;
export const CALENDAR_YEAR_FONT_SCALE_DEFAULT = 0.84;
export const CALENDAR_YEAR_FONT_SCALE_STORAGE_KEY = 'calendar.yearFontScale';
export const CALENDAR_PERSISTENT_FILTERS_STORAGE_KEY = 'calendar.persistentFilters';
export const clampCalendarYearFontScale = (value: number) =>
    Math.round(Math.min(CALENDAR_YEAR_FONT_SCALE_MAX, Math.max(CALENDAR_YEAR_FONT_SCALE_MIN, value)) * 100) / 100;
export const clampCalendarAgendaFontScale = (value: number) =>
    Math.round(Math.min(CALENDAR_AGENDA_FONT_SCALE_MAX, Math.max(CALENDAR_AGENDA_FONT_SCALE_MIN, value)) * 100) / 100;
export const clampCalendarDayVisibleDays = (value: number) =>
    Math.round(Math.min(CALENDAR_DAY_VIEW_VISIBLE_DAYS_MAX, Math.max(CALENDAR_DAY_VIEW_VISIBLE_DAYS_MIN, value)));
export const clampCalendarDayRowCount = (value: number) => (value >= 2 ? 2 : 1);
export const clampCalendarDayHourHeight = (value: number) =>
    Math.round(Math.min(CALENDAR_DAY_VIEW_HOUR_HEIGHT_MAX, Math.max(CALENDAR_DAY_VIEW_HOUR_HEIGHT_MIN, value)));
export const clampCalendarDayVisibleHours = (value: number) =>
    Math.round(Math.min(CALENDAR_DAY_VIEW_VISIBLE_HOURS_MAX, Math.max(CALENDAR_DAY_VIEW_VISIBLE_HOURS_MIN, value)));
export const clampCalendarDayFontScale = (value: number) =>
    Math.round(Math.min(CALENDAR_DAY_VIEW_FONT_SCALE_MAX, Math.max(CALENDAR_DAY_VIEW_FONT_SCALE_MIN, value)) * 100) / 100;
export const getCalendarDayViewSnapMinutes = (hourHeight: number) => {
    if (hourHeight >= 84) return 5;
    if (hourHeight >= 58) return 10;
    return 15;
};
export interface CalendarYearEventSizing {
    chipHeightPx: number;
    moreRowPx: number;
    inlinePaddingPx: number;
    borderRadiusPx: number;
    borderWidthPx: number;
}

export const getCalendarYearEventSizing = (value: number): CalendarYearEventSizing => {
    const scale = Math.min(CALENDAR_YEAR_FONT_SCALE_MAX, Math.max(CALENDAR_YEAR_FONT_SCALE_MIN, value));

    return {
        chipHeightPx: Math.max(4, Math.round(3 + scale * 11)),
        moreRowPx: Math.max(4, Math.round(3 + scale * 6)),
        inlinePaddingPx: Math.max(1, Math.round(0.5 + scale * 3.5)),
        borderRadiusPx: Math.max(2, Math.round(2 + scale * 4)),
        borderWidthPx: scale <= 0.35 ? 0.5 : 1,
    };
};
export const CALENDAR_MINI_VISIBLE_WEEKS = 5;

export const CALENDAR_COMMAND_EVENT = 'calendar:command';
export const CALENDAR_STATE_EVENT = 'calendar:state';

export type CalendarViewMode = 'monthly' | 'year' | 'day' | 'agenda';
export type CalendarYearMonthBasis = 'gregorian' | 'bs';
export type CalendarFilterDateRangeMode = 'any' | 'before' | 'after' | 'between';

export interface CalendarFilterDateRange {
    mode: CalendarFilterDateRangeMode;
    startDate: string;
    endDate: string;
}

export interface CalendarTagExpression {
    anyOf: string[][];
    exclude: string[];
}

export interface CalendarSavedSearchFilter {
    id: string;
    query: string;
    label?: string;
    createdAt?: string;
}

export interface CalendarAgendaDisplaySettings {
    fontScale: number;
    showTags: boolean;
    showDescription: boolean;
    showLocation: boolean;
    showMetadata: boolean;
}

export interface CalendarLiveSearchState {
    isOpen: boolean;
    query: string;
}

export interface CalendarPersistentFilters {
    textQuery: string;
    dateRange: CalendarFilterDateRange;
    tagExpression: CalendarTagExpression;
    savedSearches: CalendarSavedSearchFilter[];
    selectedSavedSearchIds: string[];
    excludedMemberIds: string[];
    excludedSavedSearchIds: string[];
}

export interface CalendarCurrentPeriodLabel {
    visible: boolean;
    title: string;
    subtitle: string;
}

export const createEmptyCalendarDateRangeFilter = (): CalendarFilterDateRange => ({
    mode: 'any',
    startDate: '',
    endDate: '',
});

export const createEmptyCalendarTagExpression = (): CalendarTagExpression => ({
    anyOf: [],
    exclude: [],
});

export const createDefaultCalendarAgendaDisplaySettings = (): CalendarAgendaDisplaySettings => ({
    fontScale: CALENDAR_AGENDA_FONT_SCALE_DEFAULT,
    showTags: true,
    showDescription: true,
    showLocation: true,
    showMetadata: true,
});

export const createDefaultCalendarPersistentFilters = (): CalendarPersistentFilters => ({
    textQuery: '',
    dateRange: createEmptyCalendarDateRangeFilter(),
    tagExpression: createEmptyCalendarTagExpression(),
    savedSearches: [],
    selectedSavedSearchIds: [],
    excludedMemberIds: [],
    excludedSavedSearchIds: [],
});

export type CalendarCommandDetail =
    | { type: 'setDayHeight'; dayHeight: number }
    | { type: 'setVisibleWeeks'; visibleWeeks: number }
    | { type: 'setShowChores'; showChores: boolean }
    | { type: 'setViewMode'; viewMode: CalendarViewMode }
    | { type: 'setSearchOpen'; isOpen: boolean }
    | { type: 'setSearchQuery'; query: string }
    | { type: 'setPersistentFilters'; filters: CalendarPersistentFilters }
    | { type: 'setPersistentTextFilter'; textQuery: string }
    | { type: 'setPersistentDateRange'; dateRange: CalendarFilterDateRange }
    | { type: 'setTagExpressionFilter'; tagExpression: CalendarTagExpression }
    | { type: 'setTagFilter'; selectedTagIds: string[] }
    | { type: 'setAgendaDisplay'; agendaDisplay: Partial<CalendarAgendaDisplaySettings> }
    | { type: 'setDayVisibleDays'; dayVisibleDays: number }
    | { type: 'setDayRowCount'; dayRowCount: number }
    | { type: 'setDayHourHeight'; dayHourHeight: number }
    | { type: 'setDayVisibleHours'; dayVisibleHours: number }
    | { type: 'setDayFontScale'; dayFontScale: number }
    | { type: 'setYearMonthBasis'; yearMonthBasis: CalendarYearMonthBasis }
    | { type: 'setShowGregorianCalendar'; showGregorianCalendar: boolean }
    | { type: 'setShowBsCalendar'; showBsCalendar: boolean }
    | { type: 'setShowInlineNonBasisMonthBreaks'; showInlineNonBasisMonthBreaks: boolean }
    | { type: 'setYearFontScale'; yearFontScale: number }
    | { type: 'shiftYearView'; direction: 'left' | 'right' }
    | { type: 'setChoreFilter'; selectedChoreIds: string[] }
    | { type: 'setTagFilter'; selectedTagIds: string[] }
    | { type: 'setMemberFilter'; everyoneSelected: boolean; selectedMemberIds: string[] }
    | { type: 'scrollToday' }
    | { type: 'quickAdd' }
    | { type: 'requestState' };

export interface CalendarStateDetail {
    dayHeight: number;
    visibleWeeks: number;
    showChores: boolean;
    viewMode: CalendarViewMode;
    currentPeriodLabel?: CalendarCurrentPeriodLabel | null;
    search: CalendarLiveSearchState;
    filters: CalendarPersistentFilters;
    agendaDisplay: CalendarAgendaDisplaySettings;
    dayVisibleDays: number;
    dayRowCount: number;
    dayHourHeight: number;
    dayVisibleHours: number;
    dayFontScale: number;
    yearMonthBasis: CalendarYearMonthBasis;
    showGregorianCalendar: boolean;
    showBsCalendar: boolean;
    showInlineNonBasisMonthBreaks: boolean;
    yearFontScale: number;
    choreFilter?: {
        configured: boolean;
        selectedChoreIds: string[];
    };
    tagFilter?: {
        selectedTagIds: string[];
        tagExpression: CalendarTagExpression;
    };
    memberFilter?: {
        everyoneSelected: boolean;
        selectedMemberIds: string[];
    };
}
