import NepaliDate from 'nepali-date-converter';
import { addDays, addMonths, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import { formatCommonBsMonthLabel, toDevanagariDigits } from '@/lib/calendar-display';
import { type CalendarYearMonthBasis } from '@/lib/calendar-controls';

const WEEK_STARTS_ON = 0;
const YEAR_VIEW_GRID_GAP_PX = 12;
const YEAR_VIEW_CARD_HEADER_PX = 38;
const YEAR_VIEW_WEEKDAY_ROW_PX = 18;
const YEAR_VIEW_CARD_CHROME_PX = 8;
const YEAR_VIEW_MAX_COLUMNS = 6;

const startOfDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

export interface YearCalendarMonthDescriptor {
    offset: number;
    key: string;
    basis: CalendarYearMonthBasis;
    basisYear: number;
    basisMonthIndex: number;
    startDate: Date;
    endDateExclusive: Date;
    gridStart: Date;
    gridEnd: Date;
    weeks: Date[][];
    weekCount: number;
    title: string;
    yearLabel: string;
    showYearLabel: boolean;
}

export interface YearCalendarLayout {
    columns: number;
    dayCellHeight: number;
    chipScale: number;
}

export const calculateYearMonthCardHeight = ({
    weekCount,
    dayCellHeight,
}: {
    weekCount: number;
    dayCellHeight: number;
}) => {
    if (weekCount <= 0 || dayCellHeight <= 0) {
        return YEAR_VIEW_CARD_HEADER_PX + YEAR_VIEW_WEEKDAY_ROW_PX + YEAR_VIEW_CARD_CHROME_PX;
    }

    return YEAR_VIEW_CARD_HEADER_PX + YEAR_VIEW_WEEKDAY_ROW_PX + YEAR_VIEW_CARD_CHROME_PX + weekCount * dayCellHeight;
};

const buildWeeks = (startDate: Date, endDateExclusive: Date) => {
    const monthEndInclusive = addDays(endDateExclusive, -1);
    const gridStart = startOfWeek(startDate, { weekStartsOn: WEEK_STARTS_ON });
    const gridEnd = endOfWeek(monthEndInclusive, { weekStartsOn: WEEK_STARTS_ON });
    const days: Date[] = [];
    for (let cursor = gridStart; cursor.getTime() <= gridEnd.getTime(); cursor = addDays(cursor, 1)) {
        days.push(cursor);
    }

    const weeks: Date[][] = [];
    for (let index = 0; index < days.length; index += 7) {
        weeks.push(days.slice(index, index + 7));
    }

    return {
        gridStart,
        gridEnd,
        weeks,
        weekCount: weeks.length,
    };
};

const buildGregorianMonthDescriptor = (anchorDate: Date, offset: number, showYearLabel: boolean): YearCalendarMonthDescriptor => {
    const startDate = startOfMonth(addMonths(anchorDate, offset));
    const endDateExclusive = startOfMonth(addMonths(startDate, 1));
    const { gridStart, gridEnd, weeks, weekCount } = buildWeeks(startDate, endDateExclusive);

    return {
        offset,
        key: `gregorian-${format(startDate, 'yyyy-MM')}`,
        basis: 'gregorian',
        basisYear: startDate.getFullYear(),
        basisMonthIndex: startDate.getMonth(),
        startDate,
        endDateExclusive,
        gridStart,
        gridEnd,
        weeks,
        weekCount,
        title: format(startDate, 'MMMM'),
        yearLabel: format(startDate, 'yyyy'),
        showYearLabel,
    };
};

const buildBsMonthDescriptor = (
    anchorBsYear: number,
    anchorBsMonthIndex: number,
    offset: number,
    showYearLabel: boolean
): YearCalendarMonthDescriptor => {
    const monthStart = new NepaliDate(anchorBsYear, anchorBsMonthIndex, 1);
    monthStart.setMonth(anchorBsMonthIndex + offset);
    monthStart.setDate(1);

    const monthEnd = new NepaliDate(monthStart.getYear(), monthStart.getMonth(), 1);
    monthEnd.setMonth(monthStart.getMonth() + 1);
    monthEnd.setDate(1);

    const startDate = startOfDay(monthStart.toJsDate());
    const endDateExclusive = startOfDay(monthEnd.toJsDate());
    const { gridStart, gridEnd, weeks, weekCount } = buildWeeks(startDate, endDateExclusive);
    const basisYear = monthStart.getYear();
    const basisMonthIndex = monthStart.getMonth();

    return {
        offset,
        key: `bs-${basisYear}-${String(basisMonthIndex + 1).padStart(2, '0')}`,
        basis: 'bs',
        basisYear,
        basisMonthIndex,
        startDate,
        endDateExclusive,
        gridStart,
        gridEnd,
        weeks,
        weekCount,
        title: formatCommonBsMonthLabel(basisMonthIndex),
        yearLabel: toDevanagariDigits(basisYear),
        showYearLabel,
    };
};

export const buildYearCalendarMonthDescriptors = ({
    currentDate,
    basis,
    startOffset,
    endOffset,
}: {
    currentDate: Date;
    basis: CalendarYearMonthBasis;
    startOffset: number;
    endOffset: number;
}) => {
    const descriptors: YearCalendarMonthDescriptor[] = [];
    const normalizedDate = startOfDay(currentDate);
    const anchorGregorianMonth = startOfMonth(normalizedDate);
    const anchorBsDate = new NepaliDate(normalizedDate);
    const anchorBsYear = anchorBsDate.getYear();
    const anchorBsMonthIndex = anchorBsDate.getMonth();

    let previousYear: number | null = null;

    for (let offset = startOffset; offset <= endOffset; offset += 1) {
        const descriptor =
            basis === 'gregorian'
                ? buildGregorianMonthDescriptor(anchorGregorianMonth, offset, false)
                : buildBsMonthDescriptor(anchorBsYear, anchorBsMonthIndex, offset, false);
        const showYearLabel = previousYear == null || previousYear !== descriptor.basisYear;
        previousYear = descriptor.basisYear;
        descriptors.push({
            ...descriptor,
            showYearLabel,
        });
    }

    return descriptors;
};

export const yearCalendarDateBelongsToMonth = (date: Date, month: YearCalendarMonthDescriptor) => {
    if (month.basis === 'gregorian') {
        return date.getFullYear() === month.basisYear && date.getMonth() === month.basisMonthIndex;
    }

    const nepaliDate = new NepaliDate(date);
    return nepaliDate.getYear() === month.basisYear && nepaliDate.getMonth() === month.basisMonthIndex;
};

export const calculateYearCalendarLayout = ({
    containerWidth,
    containerHeight,
    visibleMonths,
}: {
    containerWidth: number;
    containerHeight: number;
    visibleMonths: YearCalendarMonthDescriptor[];
}): YearCalendarLayout => {
    if (containerWidth <= 0 || containerHeight <= 0 || visibleMonths.length === 0) {
        return {
            columns: 4,
            dayCellHeight: 42,
            chipScale: 0.88,
        };
    }

    let best: YearCalendarLayout & { score: number } | null = null;
    const maxColumns = Math.min(YEAR_VIEW_MAX_COLUMNS, visibleMonths.length);

    for (let columns = 1; columns <= maxColumns; columns += 1) {
        const rowGroups: YearCalendarMonthDescriptor[][] = [];
        for (let index = 0; index < visibleMonths.length; index += columns) {
            rowGroups.push(visibleMonths.slice(index, index + columns));
        }

        const totalWeekRows = rowGroups.reduce((sum, group) => {
            const maxWeeks = group.reduce((groupMax, month) => Math.max(groupMax, month.weekCount), 0);
            return sum + maxWeeks;
        }, 0);

        const availableWidth = containerWidth - YEAR_VIEW_GRID_GAP_PX * (columns - 1);
        if (availableWidth <= 0) continue;

        const monthWidth = availableWidth / columns;
        const dayWidth = Math.floor((monthWidth - YEAR_VIEW_CARD_CHROME_PX) / 7);
        if (dayWidth <= 8) continue;

        const availableHeight =
            containerHeight -
            YEAR_VIEW_GRID_GAP_PX * (rowGroups.length - 1) -
            rowGroups.length * (YEAR_VIEW_CARD_HEADER_PX + YEAR_VIEW_WEEKDAY_ROW_PX + YEAR_VIEW_CARD_CHROME_PX);
        if (availableHeight <= 0 || totalWeekRows <= 0) continue;

        const dayHeightByHeight = Math.floor(availableHeight / totalWeekRows);
        if (dayHeightByHeight <= 8) continue;

        const dayCellHeight = Math.max(22, Math.min(dayHeightByHeight, Math.round(dayWidth * 1.18)));
        const score = Math.min(dayWidth, dayCellHeight);

        if (!best || score > best.score) {
            best = {
                columns,
                dayCellHeight,
                chipScale: Math.max(0.68, Math.min(1, dayCellHeight / 42)),
                score,
            };
        }
    }

    if (!best) {
        return {
            columns: 3,
            dayCellHeight: 34,
            chipScale: 0.78,
        };
    }

    return {
        columns: best.columns,
        dayCellHeight: best.dayCellHeight,
        chipScale: best.chipScale,
    };
};
