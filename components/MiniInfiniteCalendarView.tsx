'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, getDate, getMonth, parseISO } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import { DroppableDayCell } from '@/components/DroppableDayCell';
import CalendarWeekSpanOverlay, {
    getWeekSpanReservedHeightData,
    type CalendarWeekSpanSegmentLike,
} from '@/components/CalendarWeekSpanOverlay';
import { DraggableCalendarEvent, type CalendarItem } from '@/components/DraggableCalendarEvent';
import styles from '@/styles/Calendar.module.css';
import { NEPALI_MONTHS_COMMON_DEVANAGARI, NEPALI_MONTHS_COMMON_ROMAN, toDevanagariDigits } from '@/lib/calendar-display';
import {
    CALENDAR_YEAR_FONT_SCALE_MAX,
    CALENDAR_YEAR_FONT_SCALE_MIN,
    getCalendarYearEventSizing,
} from '@/lib/calendar-controls';

const HEADER_ANIMATION_MS = 260;
const MINI_EVENT_GAP_PX = 1;
const MINI_DAY_TOP_CHROME_PX = 12;
const MINI_MORE_ROW_PX = 9;

interface MiniInfiniteCalendarViewProps {
    weeks: Date[][];
    dayItemsByDate: Map<string, CalendarItem[]>;
    weekSpanLanesByWeek: Map<string, CalendarWeekSpanSegmentLike[][]>;
    scrollContainerRef: React.RefObject<HTMLDivElement | null>;
    dayCellHeight: number;
    eventFontScale: number;
    showGregorianDays: boolean;
    showBsDays: boolean;
    onDayClick: (day: Date) => void;
    onDayDoubleClick: (day: Date) => void;
    onEventClick: (event: React.MouseEvent, item: CalendarItem) => void;
    onEventDoubleClick: (event: React.MouseEvent, item: CalendarItem) => void;
    isEventSelected: (item: CalendarItem) => boolean;
}

interface MiniHeaderLabel {
    key: string;
    title: string;
    subtitle: string;
}

interface AnimatedHeaderState {
    active: MiniHeaderLabel;
    previous: MiniHeaderLabel | null;
    direction: 'up' | 'down';
    isTransitioning: boolean;
}

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getLaneCoverage = (lane: CalendarWeekSpanSegmentLike[]) =>
    lane.reduce((total, segment) => total + (segment.endCol - segment.startCol + 1), 0);

const getVisibleEventSlots = ({
    dayCellHeight,
    reservedHeight,
    totalItems,
    hiddenItemCount,
    eventRowPx,
    eventGapPx,
    moreRowPx,
}: {
    dayCellHeight: number;
    reservedHeight: number;
    totalItems: number;
    hiddenItemCount: number;
    eventRowPx: number;
    eventGapPx: number;
    moreRowPx: number;
}) => {
    const availableHeight = Math.max(0, dayCellHeight - MINI_DAY_TOP_CHROME_PX - reservedHeight);

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

    if ((slots < totalItems || hiddenItemCount > 0) && slots > 0 && consumedHeight + eventGapPx + moreRowPx > availableHeight) {
        slots -= 1;
    }

    return Math.max(0, slots);
};

const buildGregorianHeaderLabel = (date: Date): MiniHeaderLabel => ({
    key: format(date, 'yyyy-MM'),
    title: format(date, 'MMMM'),
    subtitle: format(date, 'yyyy'),
});

const buildBsHeaderLabel = (date: Date): MiniHeaderLabel => {
    const nepaliDate = new NepaliDate(date);
    const monthIndex = nepaliDate.getMonth();
    const year = nepaliDate.getYear();
    return {
        key: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
        title: `${NEPALI_MONTHS_COMMON_DEVANAGARI[monthIndex] || ''} ${NEPALI_MONTHS_COMMON_ROMAN[monthIndex] || ''}`.trim(),
        subtitle: toDevanagariDigits(year),
    };
};

const parseDateAttribute = (value: string | null) => {
    if (!value) return null;
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const createAnimatedState = (label: MiniHeaderLabel): AnimatedHeaderState => ({
    active: label,
    previous: null,
    direction: 'down',
    isTransitioning: false,
});

const AnimatedHeaderTrack = ({
    label,
    side,
}: {
    label: AnimatedHeaderState;
    side: 'left' | 'right';
}) => {
    return (
        <div className={`${styles.miniStickyHeaderTrack} ${side === 'right' ? styles.miniStickyHeaderTrackRight : ''}`}>
            {label.previous ? (
                <div
                    className={`${styles.miniStickyHeaderLabel} ${styles.miniStickyHeaderLabelPrevious} ${
                        label.direction === 'up' ? styles.miniStickyLabelOutDown : styles.miniStickyLabelOutUp
                    }`}
                >
                    <div className={styles.miniStickyHeaderTitle}>{label.previous.title}</div>
                    <div className={styles.miniStickyHeaderSubtitle}>{label.previous.subtitle}</div>
                </div>
            ) : null}
            <div
                className={`${styles.miniStickyHeaderLabel} ${
                    label.isTransitioning
                        ? label.direction === 'up'
                            ? styles.miniStickyLabelInDown
                            : styles.miniStickyLabelInUp
                        : styles.monthStatic
                }`}
            >
                <div className={styles.miniStickyHeaderTitle}>{label.active.title}</div>
                <div className={styles.miniStickyHeaderSubtitle}>{label.active.subtitle}</div>
            </div>
        </div>
    );
};

export default function MiniInfiniteCalendarView({
    weeks,
    dayItemsByDate,
    weekSpanLanesByWeek,
    scrollContainerRef,
    dayCellHeight,
    eventFontScale,
    showGregorianDays,
    showBsDays,
    onDayClick,
    onDayDoubleClick,
    onEventClick,
    onEventDoubleClick,
    isEventSelected,
}: MiniInfiniteCalendarViewProps) {
    const initialDate = weeks[0]?.[0] ?? new Date();
    const [gregorianLabel, setGregorianLabel] = useState<AnimatedHeaderState>(() =>
        createAnimatedState(buildGregorianHeaderLabel(initialDate))
    );
    const [bsLabel, setBsLabel] = useState<AnimatedHeaderState>(() => createAnimatedState(buildBsHeaderLabel(initialDate)));
    const gregorianTimerRef = useRef<number | null>(null);
    const bsTimerRef = useRef<number | null>(null);
    const lastScrollTopRef = useRef<number | null>(null);
    const scrollFrameRef = useRef<number | null>(null);

    const effectiveEventScale = useMemo(() => {
        const compactScale = clampNumber(dayCellHeight / 42, 0.68, 1);
        return clampNumber(compactScale * eventFontScale, CALENDAR_YEAR_FONT_SCALE_MIN, CALENDAR_YEAR_FONT_SCALE_MAX);
    }, [dayCellHeight, eventFontScale]);
    const eventSizing = useMemo(() => getCalendarYearEventSizing(effectiveEventScale), [effectiveEventScale]);
    const eventRowPx = eventSizing.chipHeightPx;
    const spanLaneHeightPx = eventRowPx;
    const spanLaneGapPx = MINI_EVENT_GAP_PX;

    const transitionLabel = useCallback(
        (
            setter: React.Dispatch<React.SetStateAction<AnimatedHeaderState>>,
            timerRef: React.MutableRefObject<number | null>,
            nextLabel: MiniHeaderLabel,
            direction: 'up' | 'down'
        ) => {
            setter((current) => {
                if (current.active.key === nextLabel.key) {
                    return current;
                }

                if (timerRef.current !== null) {
                    window.clearTimeout(timerRef.current);
                }

                timerRef.current = window.setTimeout(() => {
                    setter((latest) => ({
                        ...latest,
                        previous: null,
                        isTransitioning: false,
                    }));
                    timerRef.current = null;
                }, HEADER_ANIMATION_MS);

                return {
                    active: nextLabel,
                    previous: current.active,
                    direction,
                    isTransitioning: true,
                };
            });
        },
        []
    );

    const syncHeaderLabels = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const scrollTop = container.scrollTop;
        const direction = lastScrollTopRef.current == null || scrollTop >= lastScrollTopRef.current ? 'down' : 'up';
        lastScrollTopRef.current = scrollTop;

        const threshold = scrollTop + 1;
        const weekMarkers = Array.from(container.querySelectorAll<HTMLElement>('[data-calendar-week-start-row]'));
        let fallbackDate = initialDate;
        for (const marker of weekMarkers) {
            const markerDate = parseDateAttribute(marker.getAttribute('data-calendar-week-start-row'));
            if (!markerDate) continue;
            if (marker.offsetTop <= threshold) {
                fallbackDate = markerDate;
            } else {
                break;
            }
        }

        const resolveBoundaryDate = (attributeName: 'data-calendar-gregorian-boundary' | 'data-calendar-bs-boundary') => {
            const markers = Array.from(container.querySelectorAll<HTMLElement>(`[${attributeName}]`));
            let activeDate = fallbackDate;
            for (const marker of markers) {
                const markerDate = parseDateAttribute(marker.getAttribute(attributeName));
                if (!markerDate) continue;
                if (marker.offsetTop <= threshold) {
                    activeDate = markerDate;
                } else {
                    break;
                }
            }
            return activeDate;
        };

        transitionLabel(setGregorianLabel, gregorianTimerRef, buildGregorianHeaderLabel(resolveBoundaryDate('data-calendar-gregorian-boundary')), direction);
        transitionLabel(setBsLabel, bsTimerRef, buildBsHeaderLabel(resolveBoundaryDate('data-calendar-bs-boundary')), direction);
    }, [initialDate, scrollContainerRef, transitionLabel]);

    useEffect(() => {
        syncHeaderLabels();
    }, [syncHeaderLabels, weeks.length]);

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const handleScroll = () => {
            if (scrollFrameRef.current !== null) return;
            scrollFrameRef.current = window.requestAnimationFrame(() => {
                scrollFrameRef.current = null;
                syncHeaderLabels();
            });
        };

        handleScroll();
        container.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            container.removeEventListener('scroll', handleScroll);
            if (scrollFrameRef.current !== null) {
                window.cancelAnimationFrame(scrollFrameRef.current);
                scrollFrameRef.current = null;
            }
        };
    }, [scrollContainerRef, syncHeaderLabels]);

    useEffect(() => {
        return () => {
            if (gregorianTimerRef.current !== null) {
                window.clearTimeout(gregorianTimerRef.current);
            }
            if (bsTimerRef.current !== null) {
                window.clearTimeout(bsTimerRef.current);
            }
            if (scrollFrameRef.current !== null) {
                window.cancelAnimationFrame(scrollFrameRef.current);
            }
        };
    }, []);

    return (
        <div className={styles.miniCalendarShellInner}>
            {(showGregorianDays || showBsDays) && (
                <div className={styles.miniStickyHeader}>
                    {showGregorianDays ? <AnimatedHeaderTrack label={gregorianLabel} side="left" /> : null}
                    {showBsDays ? <AnimatedHeaderTrack label={bsLabel} side="right" /> : null}
                </div>
            )}

            <div className={styles.miniWeekdayHeader} aria-hidden="true">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className={styles.miniWeekdayCell}>
                        {day}
                    </div>
                ))}
            </div>

            <div
                ref={scrollContainerRef}
                data-testid="mini-calendar-scroll-container"
                className={`${styles.calendarScrollContainer} ${styles.miniCalendarScrollContainer} ${styles.yearCalendarGrid}`}
                style={
                    {
                        '--calendar-day-cell-height': `${dayCellHeight}px`,
                        '--calendar-year-event-font-scale': String(effectiveEventScale),
                        '--calendar-year-single-event-height': `${eventRowPx}px`,
                        '--calendar-year-span-event-height': `${spanLaneHeightPx}px`,
                        '--calendar-year-event-inline-padding': `${eventSizing.inlinePaddingPx}px`,
                        '--calendar-year-event-radius': `${eventSizing.borderRadiusPx}px`,
                        '--calendar-year-event-border-width': `${eventSizing.borderWidthPx}px`,
                    } as React.CSSProperties
                }
            >
                <table className={`${styles.calendarTable} ${styles.miniCalendarTable}`}>
                    <tbody>
                        {weeks.map((week) => {
                            const weekKey = format(week[0], 'yyyy-MM-dd');
                            const weekSpanLanes = weekSpanLanesByWeek.get(weekKey) || [];
                            const maxCombinedEventRows = Math.max(
                                0,
                                Math.floor((Math.max(0, dayCellHeight - MINI_DAY_TOP_CHROME_PX) + MINI_EVENT_GAP_PX) / (eventRowPx + MINI_EVENT_GAP_PX))
                            );
                            const prioritizedWeekSpanLanes = [...weekSpanLanes]
                                .map((lane, laneIndex) => ({
                                    lane,
                                    laneIndex,
                                    coverage: getLaneCoverage(lane),
                                    longestSegment: lane.reduce(
                                        (longest, segment) => Math.max(longest, segment.endCol - segment.startCol + 1),
                                        0
                                    ),
                                }))
                                .sort((left, right) => {
                                    if (right.coverage !== left.coverage) return right.coverage - left.coverage;
                                    if (right.longestSegment !== left.longestSegment) return right.longestSegment - left.longestSegment;
                                    return left.laneIndex - right.laneIndex;
                                })
                                .map(({ lane }) => lane);
                            const visibleWeekSpanLaneCount =
                                prioritizedWeekSpanLanes.length > 0 ? Math.max(1, Math.min(prioritizedWeekSpanLanes.length, maxCombinedEventRows)) : 0;
                            const visibleWeekSpanLanes = prioritizedWeekSpanLanes.slice(0, visibleWeekSpanLaneCount);
                            const hiddenWeekSpanLanes = prioritizedWeekSpanLanes.slice(visibleWeekSpanLaneCount);
                            const hiddenWeekSpanCountsByCol = Array.from({ length: 7 }, () => 0);
                            for (const lane of hiddenWeekSpanLanes) {
                                for (const segment of lane) {
                                    for (let columnIndex = segment.startCol; columnIndex <= segment.endCol; columnIndex += 1) {
                                        hiddenWeekSpanCountsByCol[columnIndex] += 1;
                                    }
                                }
                            }
                            const { weekSpanReservedHeightsByCol } = getWeekSpanReservedHeightData(
                                visibleWeekSpanLanes,
                                {
                                    laneHeightPx: spanLaneHeightPx,
                                    laneGapPx: spanLaneGapPx,
                                }
                            );

                            return (
                                <tr key={weekKey}>
                                    {week.map((day, dayIndex) => {
                                        const nepaliDate = new NepaliDate(day);
                                        const dateStr = format(day, 'yyyy-MM-dd');
                                        const isFirstGregorianDay = getDate(day) === 1;
                                        const isFirstGregorianWeek = getDate(day) >= 2 && getDate(day) <= 7;
                                        const isFirstGregorianYear = getDate(day) === 1 && getMonth(day) === 0;
                                        const isFirstBsDay = nepaliDate.getDate() === 1;
                                        const isFirstBsWeek = nepaliDate.getDate() >= 2 && nepaliDate.getDate() <= 7;
                                        const isFirstBsYear = nepaliDate.getDate() === 1 && nepaliDate.getMonth() === 0;
                                        const dayReservedHeight = weekSpanReservedHeightsByCol[dayIndex] || 0;
                                        const hiddenSpanCount = hiddenWeekSpanCountsByCol[dayIndex] || 0;
                                        const dayItems = dayItemsByDate.get(dateStr) || [];
                                        const visibleSlots = getVisibleEventSlots({
                                            dayCellHeight,
                                            reservedHeight: dayReservedHeight > 0 ? dayReservedHeight + MINI_EVENT_GAP_PX : 0,
                                            totalItems: dayItems.length,
                                            hiddenItemCount: hiddenSpanCount,
                                            eventRowPx,
                                            eventGapPx: MINI_EVENT_GAP_PX,
                                            moreRowPx: MINI_MORE_ROW_PX,
                                        });
                                        const visibleItems = dayItems.slice(0, visibleSlots);
                                        const hiddenCount = Math.max(0, dayItems.length - visibleItems.length) + hiddenSpanCount;

                                        const primaryDayLabel = showGregorianDays
                                            ? String(getDate(day))
                                            : showBsDays
                                              ? toDevanagariDigits(nepaliDate.getDate())
                                              : String(getDate(day));
                                        const secondaryDayLabel =
                                            showGregorianDays && showBsDays
                                                ? toDevanagariDigits(nepaliDate.getDate())
                                                : '';

                                        return (
                                            <DroppableDayCell
                                                key={dateStr}
                                                day={day}
                                                dateStr={dateStr}
                                                onClick={onDayClick}
                                                onDoubleClick={onDayDoubleClick}
                                                dataAttributes={{
                                                    'data-calendar-gregorian-boundary': isFirstGregorianDay ? dateStr : undefined,
                                                    'data-calendar-bs-boundary': isFirstBsDay ? dateStr : undefined,
                                                    'data-calendar-week-start-row': dayIndex === 0 ? weekKey : undefined,
                                                }}
                                                className={`${styles.miniDayCell} ${isFirstGregorianYear ? styles.firstDayOfYear : ''} ${
                                                    isFirstGregorianDay ? styles.firstDayOfMonth : ''
                                                } ${isFirstGregorianWeek ? styles.firstWeekOfMonth : ''} ${
                                                    isFirstBsYear ? styles.firstDayOfNepaliYear : ''
                                                } ${isFirstBsDay ? styles.firstDayOfNepaliMonth : ''} ${
                                                    isFirstBsWeek ? styles.firstWeekOfNepaliMonth : ''
                                                }`}
                                            >
                                                {dayIndex === 0 && visibleWeekSpanLanes.length > 0 ? (
                                                    <CalendarWeekSpanOverlay
                                                        weekKey={weekKey}
                                                        weekSpanLanes={visibleWeekSpanLanes}
                                                        topOffsetPx={MINI_DAY_TOP_CHROME_PX}
                                                        laneHeightPx={spanLaneHeightPx}
                                                        laneGapPx={spanLaneGapPx}
                                                        eventScale={effectiveEventScale}
                                                        memberIndicatorStyle="dot"
                                                        isEventSelected={isEventSelected}
                                                        onEventClick={onEventClick}
                                                        onEventDoubleClick={onEventDoubleClick}
                                                    />
                                                ) : null}

                                                <div className={styles.miniDayNumberWrap}>
                                                    <span className={styles.miniDayPrimary}>{primaryDayLabel}</span>
                                                    {secondaryDayLabel ? (
                                                        <span className={styles.miniDaySecondary}>{secondaryDayLabel}</span>
                                                    ) : null}
                                                </div>

                                                {dayReservedHeight > 0 ? (
                                                    <div
                                                        className={styles.multiDayLaneSpacer}
                                                        style={{ height: `${dayReservedHeight}px` }}
                                                        aria-hidden="true"
                                                    />
                                                ) : null}

                                                {visibleItems.length > 0 ? (
                                                    <div
                                                        className={`${styles.miniDayEventStack}${
                                                            dayReservedHeight <= 0 ? ` ${styles.dayEventStackWithTopGap}` : ''
                                                        }`}
                                                    >
                                                        {visibleItems.map((item, index) => (
                                                            <DraggableCalendarEvent
                                                                key={`${item.id}-${String(item.__displayDate || item.startDate)}-${index}`}
                                                                item={item}
                                                                index={index}
                                                                layout="year"
                                                                memberIndicatorStyle="dot"
                                                                scale={effectiveEventScale}
                                                                selected={isEventSelected(item)}
                                                                draggableEnabled={item.calendarItemKind !== 'chore'}
                                                                onClick={
                                                                    item.calendarItemKind === 'chore'
                                                                        ? undefined
                                                                        : (event) => onEventClick(event, item)
                                                                }
                                                                onDoubleClick={
                                                                    item.calendarItemKind === 'chore'
                                                                        ? undefined
                                                                        : (event) => onEventDoubleClick(event, item)
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                ) : null}

                                                {hiddenCount > 0 ? <div className={styles.miniDayMore}>+{hiddenCount} more</div> : null}
                                            </DroppableDayCell>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
