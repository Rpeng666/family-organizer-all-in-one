'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { addDays, format, getDate, getMonth } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import { DroppableDayCell } from '@/components/DroppableDayCell';
import CalendarWeekSpanOverlay, {
    getWeekSpanReservedHeightData,
    type CalendarWeekSpanSegmentLike,
} from '@/components/CalendarWeekSpanOverlay';
import { DraggableCalendarEvent, type CalendarItem } from '@/components/DraggableCalendarEvent';
import styles from '@/styles/Calendar.module.css';
import {
    formatCommonBsMonthCompactLabel,
    formatCommonBsMonthLabel,
    getBsSpanMeta,
    getGregorianSpanMeta,
    toDevanagariDigits,
} from '@/lib/calendar-display';
import {
    CALENDAR_YEAR_FONT_SCALE_MAX,
    CALENDAR_YEAR_FONT_SCALE_MIN,
    getCalendarYearEventSizing,
    type CalendarYearMonthBasis,
} from '@/lib/calendar-controls';
import {
    calculateYearMonthCardHeight,
    type YearCalendarMonthDescriptor,
    yearCalendarDateBelongsToMonth,
} from '@/lib/calendar-year-layout';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const YEAR_DAY_BASE_TOP_CHROME_PX = 12;
const YEAR_DAY_TRANSITION_MONTH_BONUS_PX = 8;
const YEAR_DAY_TRANSITION_YEAR_BONUS_PX = 6;
const YEAR_EVENT_ROW_GAP_PX = 1;
const YEAR_SHIFT_ANIMATION_MS = 230;
const YEAR_SHIFT_ANIMATION_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const YEAR_MONTH_ROW_GAP_PX = 12;

interface YearCalendarViewProps {
    months: YearCalendarMonthDescriptor[];
    leadingBufferMonth?: YearCalendarMonthDescriptor | null;
    monthBasis: CalendarYearMonthBasis;
    dayItemsByDate: Map<string, CalendarItem[]>;
    weekSpanLanesByWeek: Map<string, CalendarWeekSpanSegmentLike[][]>;
    columns: number;
    dayCellHeight: number;
    chipScale: number;
    fontScale: number;
    shiftAnimation?: { key: number; direction: 'left' | 'right' } | null;
    trailingBufferMonth?: YearCalendarMonthDescriptor | null;
    showGregorianCalendar: boolean;
    showBsCalendar: boolean;
    showInlineNonBasisMonthBreaks: boolean;
    scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
    onShiftAnimationComplete?: (shift: { key: number; direction: 'left' | 'right' }) => void;
    onDayClick: (day: Date) => void;
    onDayDoubleClick: (day: Date) => void;
    onEventClick: (event: React.MouseEvent, item: CalendarItem) => void;
    onEventDoubleClick: (event: React.MouseEvent, item: CalendarItem) => void;
    isEventSelected: (item: CalendarItem) => boolean;
}

type MonthRenderMode = 'interactive' | 'inert';

interface YearMonthRowModel {
    rowIndex: number;
    visibleMonths: Array<YearCalendarMonthDescriptor | null>;
    leftEdgeMonth: YearCalendarMonthDescriptor | null;
    rightEdgeMonth: YearCalendarMonthDescriptor | null;
    oldHeight: number;
    shiftLeftHeight: number;
    shiftRightHeight: number;
}

const getVisibleEventSlots = ({
    dayCellHeight,
    reservedHeight,
    totalItems,
    eventRowPx,
    eventGapPx,
    moreRowPx,
    showTransitionMonth,
    showTransitionYear,
}: {
    dayCellHeight: number;
    reservedHeight: number;
    totalItems: number;
    eventRowPx: number;
    eventGapPx: number;
    moreRowPx: number;
    showTransitionMonth: boolean;
    showTransitionYear: boolean;
}) => {
    const topChromePx =
        YEAR_DAY_BASE_TOP_CHROME_PX +
        (showTransitionMonth ? YEAR_DAY_TRANSITION_MONTH_BONUS_PX : 0) +
        (showTransitionYear ? YEAR_DAY_TRANSITION_YEAR_BONUS_PX : 0);
    const availableHeight = Math.max(0, dayCellHeight - topChromePx - reservedHeight);

    let slots = 0;
    let consumedHeight = 0;
    while (slots < totalItems) {
        const nextHeight = consumedHeight + (slots > 0 ? eventGapPx : 0) + eventRowPx;
        if (nextHeight > availableHeight) {
            break;
        }
        slots += 1;
        consumedHeight = nextHeight;
    }

    if (slots === 0 && totalItems > 0 && availableHeight >= eventRowPx) {
        slots = 1;
        consumedHeight = eventRowPx;
    }

    if (slots < totalItems && slots > 0 && consumedHeight + eventGapPx + moreRowPx > availableHeight) {
        slots -= 1;
    }

    return Math.max(0, slots);
};

const getDayMeta = (
    day: Date,
    monthBasis: CalendarYearMonthBasis,
    showGregorianCalendar: boolean,
    showBsCalendar: boolean,
    showInlineNonBasisMonthBreaks: boolean
) => {
    const nepaliDate = new NepaliDate(day);
    const gregorianDate = getDate(day);
    const gregorianMonthIndex = getMonth(day);
    const gregorianYear = day.getFullYear();
    const bsDate = nepaliDate.getDate();
    const bsMonthIndex = nepaliDate.getMonth();
    const bsYear = nepaliDate.getYear();
    const showBothCalendars = showGregorianCalendar && showBsCalendar;
    const showNonBasisTransitions = showBothCalendars && showInlineNonBasisMonthBreaks;
    const showBsTransitions = showNonBasisTransitions && monthBasis === 'gregorian';
    const showGregorianTransitions = showNonBasisTransitions && monthBasis === 'bs';
    const isFirstBsTransitionDay = showBsTransitions && bsDate === 1;
    const isFirstBsTransitionWeekButNotDay = showBsTransitions && bsDate >= 2 && bsDate <= 7;
    const isFirstBsTransitionYear = showBsTransitions && bsDate === 1 && bsMonthIndex === 0;
    const isFirstGregorianTransitionDay = showGregorianTransitions && gregorianDate === 1;
    const isFirstGregorianTransitionWeekButNotDay = showGregorianTransitions && gregorianDate >= 2 && gregorianDate <= 7;
    const isFirstGregorianTransitionYear = showGregorianTransitions && gregorianDate === 1 && gregorianMonthIndex === 0;

    return {
        primaryLabel:
            showBothCalendars
                ? monthBasis === 'gregorian'
                    ? String(gregorianDate)
                    : toDevanagariDigits(bsDate)
                : showBsCalendar
                  ? toDevanagariDigits(bsDate)
                  : String(gregorianDate),
        secondaryLabel:
            showBothCalendars
                ? monthBasis === 'gregorian'
                    ? toDevanagariDigits(bsDate)
                    : String(gregorianDate)
                : '',
        transitionMonthClassName: showBsTransitions ? styles.nepaliMonthName : styles.monthName,
        transitionMonthLabel: showBsTransitions ? formatCommonBsMonthLabel(bsMonthIndex) : format(day, 'MMMM'),
        showTransitionMonth: showBsTransitions ? bsDate === 1 : showGregorianTransitions ? gregorianDate === 1 : false,
        transitionYearClassName: showBsTransitions ? styles.nepaliYearNumber : styles.yearNumber,
        transitionYearLabel: showBsTransitions ? toDevanagariDigits(bsYear) : String(gregorianYear),
        showTransitionYear: showBsTransitions
            ? bsDate === 1 && bsMonthIndex === 0
            : showGregorianTransitions
              ? gregorianDate === 1 && gregorianMonthIndex === 0
              : false,
        firstTransitionDayClassName: showBsTransitions ? styles.firstDayOfNepaliMonth : styles.firstDayOfMonth,
        firstTransitionWeekClassName: showBsTransitions ? styles.firstWeekOfNepaliMonth : styles.firstWeekOfMonth,
        firstTransitionYearClassName: showBsTransitions ? styles.firstDayOfNepaliYear : styles.firstDayOfYear,
        isFirstTransitionDay: showBsTransitions ? isFirstBsTransitionDay : isFirstGregorianTransitionDay,
        isFirstTransitionWeekButNotDay: showBsTransitions ? isFirstBsTransitionWeekButNotDay : isFirstGregorianTransitionWeekButNotDay,
        isFirstTransitionYear: showBsTransitions ? isFirstBsTransitionYear : isFirstGregorianTransitionYear,
    };
};

const getYearMonthHeaderMeta = ({
    month,
    showGregorianCalendar,
    showBsCalendar,
    showInlineNonBasisMonthBreaks,
}: {
    month: YearCalendarMonthDescriptor;
    showGregorianCalendar: boolean;
    showBsCalendar: boolean;
    showInlineNonBasisMonthBreaks: boolean;
}) => {
    const bsStartDate = new NepaliDate(month.startDate);
    const endInclusive = addDays(month.endDateExclusive, -1);
    const gregorianSingle = {
        monthLabel: format(month.startDate, 'MMMM'),
        yearLabel: format(month.startDate, 'yyyy'),
    };
    const gregorianSpan = getGregorianSpanMeta(month.startDate, endInclusive);
    const bsSingle = {
        monthLabel: formatCommonBsMonthCompactLabel(bsStartDate.getMonth()),
        yearLabel: toDevanagariDigits(bsStartDate.getYear()),
    };
    const bsSpan = getBsSpanMeta(month.startDate, endInclusive);
    const showBothCalendars = showGregorianCalendar && showBsCalendar;
    const useGregorianPrimary = showBothCalendars ? month.basis === 'gregorian' : showGregorianCalendar || !showBsCalendar;
    const secondaryGregorian = showInlineNonBasisMonthBreaks ? gregorianSingle : gregorianSpan;
    const secondaryBs = showInlineNonBasisMonthBreaks ? bsSingle : bsSpan;

    return {
        titlePrimary: useGregorianPrimary ? gregorianSingle.monthLabel : bsSingle.monthLabel,
        titleSecondary: showBothCalendars ? (useGregorianPrimary ? secondaryBs.monthLabel : secondaryGregorian.monthLabel) : '',
        yearPrimary: useGregorianPrimary ? gregorianSingle.yearLabel : bsSingle.yearLabel,
        yearSecondary: showBothCalendars ? (useGregorianPrimary ? secondaryBs.yearLabel : secondaryGregorian.yearLabel) : '',
    };
};

const getRowHeight = (months: Array<YearCalendarMonthDescriptor | null>, dayCellHeight: number) =>
    months.reduce(
        (rowMax, month) =>
            Math.max(
                rowMax,
                month
                    ? calculateYearMonthCardHeight({
                          weekCount: month.weekCount,
                          dayCellHeight,
                      })
                    : 0
            ),
        0
    );

const buildYearMonthRows = ({
    months,
    leadingBufferMonth,
    columns,
    dayCellHeight,
    trailingBufferMonth,
}: {
    months: YearCalendarMonthDescriptor[];
    leadingBufferMonth?: YearCalendarMonthDescriptor | null;
    columns: number;
    dayCellHeight: number;
    trailingBufferMonth?: YearCalendarMonthDescriptor | null;
}) => {
    const rows: YearMonthRowModel[] = [];

    for (let startIndex = 0; startIndex < months.length; startIndex += columns) {
        const visibleMonths = Array.from({ length: columns }, (_, slotIndex) => months[startIndex + slotIndex] ?? null);
        const leftEdgeMonth = months[startIndex - 1] ?? (startIndex === 0 ? leadingBufferMonth ?? null : null);
        const rightEdgeMonth =
            months[startIndex + columns] ?? (startIndex + columns >= months.length ? trailingBufferMonth ?? null : null);

        rows.push({
            rowIndex: rows.length,
            visibleMonths,
            leftEdgeMonth,
            rightEdgeMonth,
            oldHeight: getRowHeight(visibleMonths, dayCellHeight),
            shiftRightHeight: getRowHeight([leftEdgeMonth, ...visibleMonths.slice(0, Math.max(0, columns - 1))], dayCellHeight),
            shiftLeftHeight: getRowHeight([...visibleMonths.slice(1), rightEdgeMonth], dayCellHeight),
        });
    }

    return rows;
};

export default function YearCalendarView({
    months,
    leadingBufferMonth,
    monthBasis,
    dayItemsByDate,
    weekSpanLanesByWeek,
    columns,
    dayCellHeight,
    chipScale,
    fontScale,
    shiftAnimation,
    trailingBufferMonth,
    showGregorianCalendar,
    showBsCalendar,
    showInlineNonBasisMonthBreaks,
    scrollContainerRef,
    onShiftAnimationComplete,
    onDayClick,
    onDayDoubleClick,
    onEventClick,
    onEventDoubleClick,
    isEventSelected,
}: YearCalendarViewProps) {
    const effectiveEventFontScale = Math.max(
        CALENDAR_YEAR_FONT_SCALE_MIN,
        Math.min(CALENDAR_YEAR_FONT_SCALE_MAX, chipScale * fontScale)
    );
    const eventSizing = useMemo(() => getCalendarYearEventSizing(effectiveEventFontScale), [effectiveEventFontScale]);
    const eventGapPx = YEAR_EVENT_ROW_GAP_PX;
    const singleDayChipHeightPx = eventSizing.chipHeightPx;
    const spanLaneHeightPx = singleDayChipHeightPx;
    const spanLaneGapPx = eventGapPx;
    const moreRowPx = eventSizing.moreRowPx;
    const spanTopOffsetPx = YEAR_DAY_BASE_TOP_CHROME_PX;
    const stageRef = useRef<HTMLDivElement>(null);
    const animationPrepFrameRef = useRef<number | null>(null);
    const animationPlayFrameRef = useRef<number | null>(null);
    const animationCleanupTimerRef = useRef<number | null>(null);
    const scrollUnlockRef = useRef<(() => void) | null>(null);
    const lastAnimatedShiftKeyRef = useRef<number | null>(null);

    const slotWidthCss = useMemo(
        () => `calc((100% - (${YEAR_MONTH_ROW_GAP_PX}px * ${Math.max(0, columns - 1)})) / ${Math.max(1, columns)})`,
        [columns]
    );

    const stageStyle = useMemo(
        () =>
            ({
                '--calendar-year-columns': String(columns),
                '--calendar-year-day-cell-height': `${dayCellHeight}px`,
                '--calendar-year-event-gap': `${eventGapPx}px`,
                '--calendar-year-event-font-scale': effectiveEventFontScale.toString(),
                '--calendar-year-single-event-height': `${singleDayChipHeightPx}px`,
                '--calendar-year-span-event-height': `${spanLaneHeightPx}px`,
                '--calendar-year-event-inline-padding': `${eventSizing.inlinePaddingPx}px`,
                '--calendar-year-event-radius': `${eventSizing.borderRadiusPx}px`,
                '--calendar-year-event-border-width': `${eventSizing.borderWidthPx}px`,
                '--calendar-year-row-gap': `${YEAR_MONTH_ROW_GAP_PX}px`,
                '--calendar-year-slot-width': slotWidthCss,
                '--calendar-year-step': `calc(var(--calendar-year-slot-width) + ${YEAR_MONTH_ROW_GAP_PX}px)`,
            } as React.CSSProperties),
        [columns, dayCellHeight, effectiveEventFontScale, eventGapPx, eventSizing, singleDayChipHeightPx, slotWidthCss, spanLaneHeightPx]
    );

    const yearRows = useMemo(
        () =>
            buildYearMonthRows({
                months,
                leadingBufferMonth,
                columns,
                dayCellHeight,
                trailingBufferMonth,
            }),
        [columns, dayCellHeight, leadingBufferMonth, months, trailingBufferMonth]
    );

    const splitWeekSpanLanesForMonth = (
        month: YearCalendarMonthDescriptor,
        week: Date[],
        lanes: CalendarWeekSpanSegmentLike[][]
    ) => {
        const inMonthByCol = week.map((day) => yearCalendarDateBelongsToMonth(day, month));
        return lanes.map((lane) =>
            lane.flatMap((segment) => {
                const pieces: CalendarWeekSpanSegmentLike[] = [];
                let pieceStart = segment.startCol;
                let pieceInMonth = inMonthByCol[segment.startCol] ?? false;

                for (let col = segment.startCol + 1; col <= segment.endCol + 1; col += 1) {
                    const nextInMonth = col <= segment.endCol ? inMonthByCol[col] ?? false : pieceInMonth;
                    const shouldSplit = col > segment.endCol || nextInMonth !== pieceInMonth;
                    if (!shouldSplit) continue;

                    const pieceEnd = col - 1;
                    pieces.push({
                        ...segment,
                        segmentKey: `${segment.segmentKey}-${pieceStart}-${pieceEnd}`,
                        startCol: pieceStart,
                        endCol: pieceEnd,
                        continuesBefore: segment.continuesBefore || pieceStart > segment.startCol,
                        continuesAfter: segment.continuesAfter || pieceEnd < segment.endCol,
                        className: pieceInMonth ? undefined : styles.calendarItemCarryover,
                    });

                    pieceStart = col;
                    pieceInMonth = nextInMonth;
                }

                return pieces;
            })
        );
    };

    useLayoutEffect(() => {
        const stage = stageRef.current;
        if (!stage) {
            return;
        }

        const rowNodes = Array.from(stage.querySelectorAll<HTMLElement>('[data-year-row-index]'));
        const resetRowStyles = () => {
            for (const rowNode of rowNodes) {
                const trackNode = rowNode.querySelector<HTMLElement>('[data-year-row-track]');
                rowNode.style.height = '';
                rowNode.style.transition = '';
                if (trackNode) {
                    trackNode.style.transition = '';
                    trackNode.classList.remove(styles.yearMonthRowTrackShiftLeft, styles.yearMonthRowTrackShiftRight);
                }
            }
        };

        const clearActiveShift = () => {
            if (animationPrepFrameRef.current !== null) {
                window.cancelAnimationFrame(animationPrepFrameRef.current);
                animationPrepFrameRef.current = null;
            }
            if (animationPlayFrameRef.current !== null) {
                window.cancelAnimationFrame(animationPlayFrameRef.current);
                animationPlayFrameRef.current = null;
            }
            if (animationCleanupTimerRef.current !== null) {
                window.clearTimeout(animationCleanupTimerRef.current);
                animationCleanupTimerRef.current = null;
            }
            scrollUnlockRef.current?.();
            scrollUnlockRef.current = null;
        };

        if (!shiftAnimation || lastAnimatedShiftKeyRef.current === shiftAnimation.key || yearRows.length === 0) {
            if (!shiftAnimation) {
                lastAnimatedShiftKeyRef.current = null;
            }
            resetRowStyles();
            return () => {
                clearActiveShift();
            };
        }

        lastAnimatedShiftKeyRef.current = shiftAnimation.key;
        clearActiveShift();
        if (rowNodes.length === 0) {
            onShiftAnimationComplete?.(shiftAnimation);
            return () => {
                clearActiveShift();
            };
        }

        for (const rowNode of rowNodes) {
            const rowIndex = Number(rowNode.dataset.yearRowIndex);
            const row = yearRows[rowIndex];
            const trackNode = rowNode.querySelector<HTMLElement>('[data-year-row-track]');
            if (!row || !trackNode) {
                continue;
            }

            rowNode.style.height = `${row.oldHeight}px`;
            rowNode.style.transition = 'none';
            trackNode.style.transition = 'none';
            trackNode.classList.remove(styles.yearMonthRowTrackShiftLeft, styles.yearMonthRowTrackShiftRight);
        }

        const scrollViewport = scrollContainerRef?.current ?? null;
        if (scrollViewport) {
            const lockedScrollTop = scrollViewport.scrollTop;
            const restoreScrollPosition = () => {
                if (scrollViewport.scrollTop !== lockedScrollTop) {
                    scrollViewport.scrollTop = lockedScrollTop;
                }
            };

            const handleWheel = (event: WheelEvent) => {
                event.preventDefault();
                restoreScrollPosition();
            };

            const handleTouchMove = (event: TouchEvent) => {
                event.preventDefault();
                restoreScrollPosition();
            };

            const handleScroll = () => {
                restoreScrollPosition();
            };

            scrollViewport.addEventListener('wheel', handleWheel, { passive: false });
            scrollViewport.addEventListener('touchmove', handleTouchMove, { passive: false });
            scrollViewport.addEventListener('scroll', handleScroll, { passive: true });
            scrollUnlockRef.current = () => {
                scrollViewport.removeEventListener('wheel', handleWheel);
                scrollViewport.removeEventListener('touchmove', handleTouchMove);
                scrollViewport.removeEventListener('scroll', handleScroll);
            };
        }

        stage.getBoundingClientRect();

        animationPrepFrameRef.current = window.requestAnimationFrame(() => {
            animationPrepFrameRef.current = null;
            animationPlayFrameRef.current = window.requestAnimationFrame(() => {
                animationPlayFrameRef.current = null;

                for (const rowNode of rowNodes) {
                    const rowIndex = Number(rowNode.dataset.yearRowIndex);
                    const row = yearRows[rowIndex];
                    const trackNode = rowNode.querySelector<HTMLElement>('[data-year-row-track]');
                    if (!row || !trackNode) {
                        continue;
                    }

                    rowNode.style.transition = `height ${YEAR_SHIFT_ANIMATION_MS}ms ${YEAR_SHIFT_ANIMATION_EASING}`;
                    rowNode.style.height = `${
                        shiftAnimation.direction === 'right' ? row.shiftRightHeight : row.shiftLeftHeight
                    }px`;
                    trackNode.style.transition = `transform ${YEAR_SHIFT_ANIMATION_MS}ms ${YEAR_SHIFT_ANIMATION_EASING}`;
                    trackNode.classList.add(
                        shiftAnimation.direction === 'right' ? styles.yearMonthRowTrackShiftRight : styles.yearMonthRowTrackShiftLeft
                    );
                }

                animationCleanupTimerRef.current = window.setTimeout(() => {
                    clearActiveShift();
                    onShiftAnimationComplete?.(shiftAnimation);
                }, YEAR_SHIFT_ANIMATION_MS + 48);
            });
        });

        return () => {
            clearActiveShift();
        };
    }, [onShiftAnimationComplete, scrollContainerRef, shiftAnimation, yearRows]);

    useLayoutEffect(() => {
        return () => {
            if (animationPrepFrameRef.current !== null) {
                window.cancelAnimationFrame(animationPrepFrameRef.current);
            }
            if (animationPlayFrameRef.current !== null) {
                window.cancelAnimationFrame(animationPlayFrameRef.current);
            }
            if (animationCleanupTimerRef.current !== null) {
                window.clearTimeout(animationCleanupTimerRef.current);
            }
            scrollUnlockRef.current?.();
            scrollUnlockRef.current = null;
        };
    }, []);

    const renderMonthCard = (
        month: YearCalendarMonthDescriptor | null,
        options: {
            mode: MonthRenderMode;
            slotKey: string;
        }
    ) => {
        const { mode, slotKey } = options;
        const interactive = mode === 'interactive';

        if (!month) {
            return <div key={slotKey} className={styles.yearMonthSlotPlaceholder} aria-hidden="true" />;
        }

        const headerMeta = getYearMonthHeaderMeta({
            month,
            showGregorianCalendar,
            showBsCalendar,
            showInlineNonBasisMonthBreaks,
        });

        return (
            <div
                key={slotKey}
                data-testid={interactive ? `year-month-${month.key}` : undefined}
                data-calendar-month-offset={interactive ? month.offset : undefined}
                data-calendar-month-key={interactive ? month.key : undefined}
                className={`${styles.yearMonthCard}${interactive ? '' : ` ${styles.yearMonthCardInert}`}`}
                aria-hidden={interactive ? undefined : true}
            >
                <div className={styles.yearMonthHeader}>
                    {month.showYearLabel ? (
                        <div className={styles.yearMonthYear}>
                            <span>{headerMeta.yearPrimary}</span>
                            {headerMeta.yearSecondary ? <span className={styles.yearMonthYearSecondary}>{headerMeta.yearSecondary}</span> : null}
                        </div>
                    ) : null}
                    <div className={styles.yearMonthTitle}>
                        <span>{headerMeta.titlePrimary}</span>
                        {headerMeta.titleSecondary ? <span className={styles.yearMonthTitleSecondary}>{headerMeta.titleSecondary}</span> : null}
                    </div>
                </div>

                <table className={styles.yearMonthTable}>
                    <thead>
                        <tr>
                            {WEEKDAY_LABELS.map((label) => (
                                <th key={`${slotKey}-${label}`} className={styles.yearMonthWeekdayCell}>
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {month.weeks.map((week, weekIndex) => {
                            const weekKey = format(week[0], 'yyyy-MM-dd');
                            const weekSpanLanes = splitWeekSpanLanesForMonth(month, week, weekSpanLanesByWeek.get(weekKey) || []);
                            const { weekSpanReservedHeightsByCol } = getWeekSpanReservedHeightData(weekSpanLanes, {
                                laneHeightPx: spanLaneHeightPx,
                                laneGapPx: spanLaneGapPx,
                            });

                            return (
                                <tr key={`${slotKey}-week-${weekIndex}`} className={styles.yearWeekRow}>
                                    {week.map((day, dayIndex) => {
                                        const dayKey = format(day, 'yyyy-MM-dd');
                                        const inMonth = yearCalendarDateBelongsToMonth(day, month);
                                        const dayMeta = getDayMeta(
                                            day,
                                            monthBasis,
                                            showGregorianCalendar,
                                            showBsCalendar,
                                            showInlineNonBasisMonthBreaks
                                        );
                                        const dayItems = dayItemsByDate.get(dayKey) || [];
                                        const rawReservedHeight = weekSpanReservedHeightsByCol[dayIndex] || 0;
                                        const reservedHeight = rawReservedHeight > 0 ? rawReservedHeight + eventGapPx : 0;
                                        const visibleSlots = getVisibleEventSlots({
                                            dayCellHeight,
                                            reservedHeight,
                                            totalItems: dayItems.length,
                                            eventRowPx: singleDayChipHeightPx,
                                            eventGapPx,
                                            moreRowPx,
                                            showTransitionMonth: dayMeta.showTransitionMonth,
                                            showTransitionYear: dayMeta.showTransitionYear,
                                        });
                                        const visibleItems = dayItems.slice(0, visibleSlots);
                                        const hiddenCount = Math.max(0, dayItems.length - visibleItems.length);
                                        const cellClassName = [
                                            styles.yearDayCell,
                                            !inMonth ? styles.yearDayCellOutsideMonth : '',
                                            dayMeta.isFirstTransitionYear ? dayMeta.firstTransitionYearClassName : '',
                                            dayMeta.isFirstTransitionDay ? dayMeta.firstTransitionDayClassName : '',
                                            dayMeta.isFirstTransitionWeekButNotDay ? dayMeta.firstTransitionWeekClassName : '',
                                        ]
                                            .filter(Boolean)
                                            .join(' ');

                                        const cellChildren = (
                                            <>
                                                {dayIndex === 0 && weekSpanLanes.length > 0 ? (
                                                    <CalendarWeekSpanOverlay
                                                        weekKey={`${slotKey}-${weekKey}`}
                                                        weekSpanLanes={weekSpanLanes}
                                                        topOffsetPx={spanTopOffsetPx}
                                                        laneHeightPx={spanLaneHeightPx}
                                                        laneGapPx={spanLaneGapPx}
                                                        eventScale={effectiveEventFontScale}
                                                        memberIndicatorStyle="dot"
                                                        interactive={interactive}
                                                        eventTestIds={interactive}
                                                        isEventSelected={isEventSelected}
                                                        onEventClick={interactive ? onEventClick : undefined}
                                                        onEventDoubleClick={interactive ? onEventDoubleClick : undefined}
                                                    />
                                                ) : null}

                                                {dayMeta.showTransitionYear ? (
                                                    <div className={dayMeta.transitionYearClassName}>{dayMeta.transitionYearLabel}</div>
                                                ) : null}
                                                {dayMeta.showTransitionMonth ? (
                                                    <div className={dayMeta.transitionMonthClassName}>{dayMeta.transitionMonthLabel}</div>
                                                ) : null}

                                                <div className={styles.yearDayNumberWrap}>
                                                    <span className={`${styles.yearDayPrimary} ${!inMonth ? styles.yearDayMuted : ''}`}>
                                                        {dayMeta.primaryLabel}
                                                    </span>
                                                    {dayMeta.secondaryLabel ? (
                                                        <span className={`${styles.yearDaySecondary} ${!inMonth ? styles.yearDayMuted : ''}`}>
                                                            {dayMeta.secondaryLabel}
                                                        </span>
                                                    ) : null}
                                                </div>

                                                {reservedHeight > 0 ? (
                                                    <div
                                                        className={styles.multiDayLaneSpacer}
                                                        style={{ height: `${reservedHeight}px` }}
                                                        aria-hidden="true"
                                                    />
                                                ) : null}

                                                {visibleItems.length > 0 ? (
                                                    <div
                                                        className={`${styles.yearDayEventStack}${
                                                            reservedHeight <= 0 ? ` ${styles.dayEventStackWithTopGap}` : ''
                                                        }`}
                                                    >
                                                        {visibleItems.map((item, index) => (
                                                            <DraggableCalendarEvent
                                                                key={`${item.id}-${String(item.__displayDate || item.startDate)}-${index}`}
                                                                item={item}
                                                                index={index}
                                                                layout="year"
                                                                memberIndicatorStyle="dot"
                                                                scale={effectiveEventFontScale}
                                                                selected={isEventSelected(item)}
                                                                testId={interactive ? undefined : null}
                                                                className={!inMonth ? styles.calendarItemCarryover : undefined}
                                                                draggableEnabled={interactive && item.calendarItemKind !== 'chore'}
                                                                onClick={
                                                                    interactive && item.calendarItemKind !== 'chore'
                                                                        ? (event) => onEventClick(event, item)
                                                                        : undefined
                                                                }
                                                                onDoubleClick={
                                                                    interactive && item.calendarItemKind !== 'chore'
                                                                        ? (event) => onEventDoubleClick(event, item)
                                                                        : undefined
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                ) : null}

                                                {hiddenCount > 0 ? <div className={styles.yearDayMore}>+{hiddenCount} more</div> : null}
                                            </>
                                        );

                                        if (interactive) {
                                            return (
                                                <DroppableDayCell
                                                    key={`${slotKey}-${dayKey}`}
                                                    day={day}
                                                    dateStr={dayKey}
                                                    onClick={onDayClick}
                                                    onDoubleClick={onDayDoubleClick}
                                                    className={cellClassName}
                                                >
                                                    {cellChildren}
                                                </DroppableDayCell>
                                            );
                                        }

                                        return (
                                            <td key={`${slotKey}-${dayKey}`} className={cellClassName}>
                                                {cellChildren}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div ref={stageRef} className={`${styles.yearCalendarStage} ${styles.yearCalendarGrid}`} style={stageStyle}>
            <div className={styles.yearCalendarRows}>
                {yearRows.map((row) => {
                    const isShifting = Boolean(shiftAnimation);
                    const trackMonths = isShifting
                        ? [row.leftEdgeMonth, ...row.visibleMonths, row.rightEdgeMonth]
                        : row.visibleMonths;

                    return (
                        <div
                            key={`year-row-${row.rowIndex}`}
                            data-year-row-index={row.rowIndex}
                            className={styles.yearMonthRow}
                            style={isShifting ? { height: `${row.oldHeight}px` } : undefined}
                        >
                            <div className={styles.yearMonthRowViewport}>
                                <div
                                    data-year-row-track="true"
                                    className={`${styles.yearMonthRowTrack}${isShifting ? ` ${styles.yearMonthRowTrackWithEdges}` : ''}`}
                                >
                                    {trackMonths.map((month, slotIndex) => {
                                        const isHiddenEdge = isShifting && (slotIndex === 0 || slotIndex === trackMonths.length - 1);
                                        return (
                                            <div
                                                key={`row-${row.rowIndex}-slot-${slotIndex}-${month?.key ?? 'empty'}`}
                                                className={`${styles.yearMonthSlot}${isHiddenEdge ? ` ${styles.yearMonthSlotHiddenEdge}` : ''}`}
                                                aria-hidden={isHiddenEdge || undefined}
                                            >
                                                {renderMonthCard(month, {
                                                    mode: isHiddenEdge ? 'inert' : 'interactive',
                                                    slotKey: `row-${row.rowIndex}-slot-${slotIndex}-${month?.key ?? 'empty'}`,
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
