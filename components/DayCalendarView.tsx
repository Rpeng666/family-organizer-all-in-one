'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import NepaliDate from 'nepali-date-converter';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { addDays, format, parseISO } from 'date-fns';
import styles from '@/styles/Calendar.module.css';
import { DraggableCalendarEvent, type CalendarItem } from '@/components/DraggableCalendarEvent';
import type { CalendarDraftSelection } from '@/components/AddEvent';
import { getCalendarDayViewSnapMinutes } from '@/lib/calendar-controls';
import { NEPALI_MONTHS_COMMON_DEVANAGARI, NEPALI_MONTHS_COMMON_ROMAN, toDevanagariDigits } from '@/lib/calendar-display';

const DAY_VIEW_BUFFER_DAYS = 21;
const DAY_VIEW_HOUR_LABEL_WIDTH_PX = 74;
const DAY_VIEW_HEADER_HEIGHT_PX = 68;
const DAY_VIEW_ALL_DAY_OVERFLOW_HEIGHT_PX = 18;
const DAY_VIEW_DEFAULT_START_HOUR = 7;
const DAY_VIEW_CREATION_DRAG_THRESHOLD_MINUTES = 10;

interface DayCalendarViewProps {
    anchorDate: Date;
    renderedDays: Date[];
    visibleDayCount: number;
    bufferDays?: number;
    rowCount: number;
    hourHeight: number;
    visibleHours?: number;
    fontScale: number;
    containerHeight: number | null;
    showGregorianCalendar: boolean;
    showBsCalendar: boolean;
    items: CalendarItem[];
    dragPreview?: {
        item: CalendarItem;
        startDate: string;
        endDate: string;
    } | null;
    verticalResetKey: number;
    scrollRequest?: {
        nonce: number;
        dateKey: string;
        minute: number | null;
    } | null;
    onAnchorDateChange: (date: Date) => void;
    onBackgroundClick: () => void;
    onCreateDraft: (draft: CalendarDraftSelection) => void;
    onEventClick: (event: React.MouseEvent, item: CalendarItem) => void;
    onEventDoubleClick: (event: React.MouseEvent, item: CalendarItem) => void;
    onTimedResize: (args: {
        item: CalendarItem;
        nextStartDate: string;
        nextEndDate: string;
        input?: { altKey?: boolean; shiftKey?: boolean } | null;
    }) => void;
    isEventSelected: (item: CalendarItem) => boolean;
}

interface AllDaySegment {
    key: string;
    item: CalendarItem;
    startCol: number;
    endCol: number;
    continuesBefore: boolean;
    continuesAfter: boolean;
    chipOnly?: boolean;
}

interface TimedSegment {
    key: string;
    item: CalendarItem;
    dayKey: string;
    dayIndex: number;
    startMinute: number;
    endMinute: number;
    columnIndex: number;
    columnCount: number;
    continuesBefore: boolean;
    continuesAfter: boolean;
    displayItem: CalendarItem;
}

interface ResizeState {
    segmentKey: string;
    edge: 'start' | 'end';
    item: CalendarItem;
    originalStartMs: number;
    originalEndMs: number;
    dayStartMs: number;
    dayEndMs: number;
    startClientY: number;
    snapMinutes: number;
}

interface DraftState {
    dayKey: string;
    startMinute: number;
    endMinute: number;
}

interface DayViewAllDayPreviewSegment {
    key: string;
    item: CalendarItem;
    startCol: number;
    endCol: number;
    continuesBefore: boolean;
    continuesAfter: boolean;
    timeLabel: string;
}

interface DayViewTimedPreviewSegment {
    key: string;
    item: CalendarItem;
    dayKey: string;
    dayIndex: number;
    startMinute: number;
    endMinute: number;
    timeLabel: string;
}

function startOfDayDate(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDayKey(date: Date) {
    return format(date, 'yyyy-MM-dd');
}

function parseEventStart(item: CalendarItem) {
    const parsed = parseISO(String(item.startDate || ''));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseEventEnd(item: CalendarItem) {
    const parsed = parseISO(String(item.endDate || ''));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatHourLabel(hour: number) {
    const normalized = ((hour % 24) + 24) % 24;
    const meridiem = normalized >= 12 ? 'PM' : 'AM';
    const twelveHour = normalized % 12 === 0 ? 12 : normalized % 12;
    return `${twelveHour} ${meridiem}`;
}

function formatMinuteTimeLabel(minuteOfDay: number, includeMeridiem: boolean) {
    const normalizedMinutes = clampNumber(minuteOfDay, 0, 24 * 60);
    const totalHours = Math.floor(normalizedMinutes / 60);
    const minutes = normalizedMinutes % 60;
    const normalizedHour = totalHours % 24;
    const meridiem = normalizedHour >= 12 ? 'pm' : 'am';
    const twelveHour = normalizedHour % 12 === 0 ? 12 : normalizedHour % 12;
    const timeLabel = minutes === 0 ? `${twelveHour}` : `${twelveHour}:${String(minutes).padStart(2, '0')}`;
    return includeMeridiem ? `${timeLabel} ${meridiem}` : timeLabel;
}

function formatSegmentTimeRange(startMinute: number, endMinute: number) {
    const startMeridiem = startMinute >= 12 * 60 ? 'pm' : 'am';
    const endMeridiem = endMinute >= 12 * 60 ? 'pm' : 'am';
    const sameMeridiem = startMeridiem === endMeridiem;
    return `${formatMinuteTimeLabel(startMinute, !sameMeridiem)}-${formatMinuteTimeLabel(endMinute, true)}`;
}

function formatClockTimeLabel(value: Date) {
    return format(value, value.getMinutes() === 0 ? 'h a' : 'h:mm a').toLowerCase();
}

function getBsYear(value: Date) {
    try {
        return new NepaliDate(value).getYear();
    } catch {
        return null;
    }
}

function formatBsDateLabel(value: Date, includeYear: boolean) {
    try {
        const nepaliDate = new NepaliDate(value);
        const monthLabel = `${NEPALI_MONTHS_COMMON_DEVANAGARI[nepaliDate.getMonth()] || ''} ${
            NEPALI_MONTHS_COMMON_ROMAN[nepaliDate.getMonth()] || ''
        }`.trim();
        const dayLabel = toDevanagariDigits(nepaliDate.getDate());
        const yearLabel = includeYear ? ` ${toDevanagariDigits(nepaliDate.getYear())}` : '';
        return `${monthLabel} ${dayLabel}${yearLabel}`.trim();
    } catch {
        return '';
    }
}

function formatDayViewEndpointDateLabel(
    value: Date,
    {
        showGregorianCalendar,
        showBsCalendar,
        includeGregorianYear,
        includeBsYear,
    }: {
        showGregorianCalendar: boolean;
        showBsCalendar: boolean;
        includeGregorianYear: boolean;
        includeBsYear: boolean;
    }
) {
    const parts: string[] = [];

    if (showGregorianCalendar) {
        parts.push(format(value, includeGregorianYear ? 'MMMM d, yyyy' : 'MMMM d'));
    }
    if (showBsCalendar) {
        const bsLabel = formatBsDateLabel(value, includeBsYear);
        if (bsLabel) {
            parts.push(bsLabel);
        }
    }

    if (parts.length === 0) {
        parts.push(format(value, includeGregorianYear ? 'MMMM d, yyyy' : 'MMMM d'));
    }

    return parts.join(' ');
}

function formatTimedEventMetaLabel({
    start,
    end,
    segmentDay,
    showGregorianCalendar,
    showBsCalendar,
}: {
    start: Date;
    end: Date;
    segmentDay: Date;
    showGregorianCalendar: boolean;
    showBsCalendar: boolean;
}) {
    const firstVisibleDay = startOfDayDate(start);
    const lastVisibleDay = startOfDayDate(new Date(end.getTime() - 1));
    const segmentDayStart = startOfDayDate(segmentDay);

    if (firstVisibleDay.getTime() === lastVisibleDay.getTime()) {
        const startMinute = start.getHours() * 60 + start.getMinutes();
        const endMinute = end.getHours() * 60 + end.getMinutes();
        return formatSegmentTimeRange(startMinute, endMinute);
    }

    const includeGregorianYear = start.getFullYear() !== end.getFullYear();
    const startBsYear = getBsYear(start);
    const endBsYear = getBsYear(end);
    const includeBsYear = startBsYear != null && endBsYear != null && startBsYear !== endBsYear;
    const startDateLabel = formatDayViewEndpointDateLabel(start, {
        showGregorianCalendar,
        showBsCalendar,
        includeGregorianYear,
        includeBsYear,
    });
    const endDateLabel = formatDayViewEndpointDateLabel(end, {
        showGregorianCalendar,
        showBsCalendar,
        includeGregorianYear,
        includeBsYear,
    });
    const startTimeLabel = formatClockTimeLabel(start);
    const endTimeLabel = formatClockTimeLabel(end);

    if (segmentDayStart.getTime() === firstVisibleDay.getTime()) {
        return `${startTimeLabel} - ${endDateLabel} at ${endTimeLabel}`;
    }

    if (segmentDayStart.getTime() === lastVisibleDay.getTime()) {
        return `${startDateLabel} at ${startTimeLabel} - ${endTimeLabel} today`;
    }

    return `${startDateLabel} at ${startTimeLabel} - ${endDateLabel} at ${endTimeLabel}`;
}

function clampNumber(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function snapMinute(minute: number, step: number) {
    return clampNumber(Math.round(minute / step) * step, 0, 24 * 60);
}

function dateAtMinute(day: Date, minute: number) {
    return new Date(startOfDayDate(day).getTime() + minute * 60 * 1000);
}

function determineAllDayLaneCap(containerHeight: number | null) {
    if (!containerHeight || containerHeight < 680) return 2;
    if (containerHeight < 940) return 3;
    return 4;
}

function assignSpanLanes<T extends { startCol: number; endCol: number }>(segments: T[]) {
    const sorted = [...segments].sort((left, right) => {
        const startDiff = left.startCol - right.startCol;
        if (startDiff !== 0) return startDiff;

        const widthDiff = right.endCol - left.endCol;
        if (widthDiff !== 0) return widthDiff;

        return 0;
    });

    const laneEndColumns: number[] = [];
    const lanes: T[][] = [];

    for (const segment of sorted) {
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
}

function layoutTimedSegmentsByDay(segments: Array<Omit<TimedSegment, 'columnIndex' | 'columnCount'>>) {
    const byDay = new Map<string, Array<Omit<TimedSegment, 'columnIndex' | 'columnCount'>>>();
    for (const segment of segments) {
        const existing = byDay.get(segment.dayKey);
        if (existing) {
            existing.push(segment);
        } else {
            byDay.set(segment.dayKey, [segment]);
        }
    }

    const positioned: TimedSegment[] = [];

    for (const daySegments of Array.from(byDay.values())) {
        const sorted = [...daySegments].sort((left, right) => {
            const startDiff = left.startMinute - right.startMinute;
            if (startDiff !== 0) return startDiff;

            const endDiff = left.endMinute - right.endMinute;
            if (endDiff !== 0) return endDiff;

            return String(left.item.title || '').localeCompare(String(right.item.title || ''));
        });

        let cluster: typeof sorted = [];
        let clusterEndMinute = -1;

        const flushCluster = () => {
            if (cluster.length === 0) return;

            const columnEnds: number[] = [];
            let maxColumnCount = 0;
            const working = cluster.map((segment) => {
                let columnIndex = 0;
                while (columnIndex < columnEnds.length && columnEnds[columnIndex] > segment.startMinute) {
                    columnIndex += 1;
                }
                columnEnds[columnIndex] = segment.endMinute;
                maxColumnCount = Math.max(maxColumnCount, columnIndex + 1);
                return { ...segment, columnIndex };
            });

            for (const segment of working) {
                positioned.push({
                    ...segment,
                    columnCount: Math.max(1, maxColumnCount),
                });
            }

            cluster = [];
            clusterEndMinute = -1;
        };

        for (const segment of sorted) {
            if (cluster.length === 0 || segment.startMinute < clusterEndMinute) {
                cluster.push(segment);
                clusterEndMinute = Math.max(clusterEndMinute, segment.endMinute);
            } else {
                flushCluster();
                cluster.push(segment);
                clusterEndMinute = segment.endMinute;
            }
        }

        flushCluster();
    }

    return positioned;
}

function DayViewDropAllDayCell({
    dateStr,
    day,
    children,
    onClick,
    onDoubleClick,
}: {
    dateStr: string;
    day: Date;
    children: React.ReactNode;
    onClick: () => void;
    onDoubleClick: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        return dropTargetForElements({
            element,
            canDrop: ({ source }) => {
                const item = (source.data as { event?: CalendarItem }).event;
                return (source.data as { type?: string }).type === 'calendar-event' && Boolean(item?.isAllDay);
            },
            getData: () => ({
                type: 'calendar-all-day',
                surfaceKind: 'allDay',
                dateStr,
            }),
            getIsSticky: () => true,
        });
    }, [dateStr]);

    return (
        <div
            ref={ref}
            data-testid={`day-view-all-day-${dateStr}`}
            className={styles.dayViewAllDayCell}
            onClick={onClick}
            onDoubleClick={onDoubleClick}
            data-calendar-day-key={dateStr}
            data-calendar-day={formatDayKey(day)}
        >
            {children}
        </div>
    );
}

function DayViewTimedColumn({
    date,
    dayIndex,
    dayWidth,
    hourHeight,
    snapMinutes,
    children,
    onBackgroundClick,
    onCreateDraft,
    onDraftStart,
    onDraftMove,
    onDraftEnd,
}: {
    date: Date;
    dayIndex: number;
    dayWidth: number;
    hourHeight: number;
    snapMinutes: number;
    children: React.ReactNode;
    onBackgroundClick: () => void;
    onCreateDraft: (draft: CalendarDraftSelection) => void;
    onDraftStart: (dayKey: string, minute: number) => void;
    onDraftMove: (minute: number) => void;
    onDraftEnd: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const pointerStateRef = useRef<{ pointerId: number; startMinute: number; moved: boolean } | null>(null);
    const dateStr = formatDayKey(date);

    const minuteFromClientY = (clientY: number) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return 0;
        const rawMinute = ((clientY - rect.top) / hourHeight) * 60;
        return snapMinute(rawMinute, snapMinutes);
    };

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        return dropTargetForElements({
            element,
            canDrop: ({ source }) => {
                const item = (source.data as { event?: CalendarItem }).event;
                return (source.data as { type?: string }).type === 'calendar-event' && Boolean(item && !item.isAllDay);
            },
            getData: ({ input }) => ({
                type: 'calendar-time-slot',
                surfaceKind: 'timed',
                dateStr,
                dayIndex,
                minuteOfDay: minuteFromClientY(input.clientY),
            }),
            getIsSticky: () => true,
        });
    }, [dateStr, dayIndex, hourHeight, minuteFromClientY, snapMinutes]);

    return (
        <div
            ref={ref}
            data-testid={`day-view-timed-column-${dateStr}`}
            data-calendar-drop-surface="timed"
            data-calendar-day-key={dateStr}
            data-calendar-snap-minutes={snapMinutes}
            className={styles.dayViewTimedColumn}
            style={{ width: `${dayWidth}px` }}
            onClick={onBackgroundClick}
            onDoubleClick={(event) => {
                const minute = minuteFromClientY(event.clientY);
                const start = dateAtMinute(date, minute);
                const end = dateAtMinute(date, clampNumber(minute + 60, snapMinutes, 24 * 60));
                onCreateDraft({
                    start,
                    end,
                    isAllDay: false,
                });
            }}
            onPointerDown={(event) => {
                const target = event.target as HTMLElement | null;
                if (!target || target.closest('[data-calendar-event-wrapper="true"]')) {
                    return;
                }
                if (event.button !== 0) {
                    return;
                }

                const minute = minuteFromClientY(event.clientY);
                pointerStateRef.current = {
                    pointerId: event.pointerId,
                    startMinute: minute,
                    moved: false,
                };
                onDraftStart(dateStr, minute);
                (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
                const state = pointerStateRef.current;
                if (!state || state.pointerId !== event.pointerId) {
                    return;
                }
                const minute = minuteFromClientY(event.clientY);
                state.moved =
                    state.moved || Math.abs(minute - state.startMinute) >= Math.max(snapMinutes, DAY_VIEW_CREATION_DRAG_THRESHOLD_MINUTES);
                onDraftMove(minute);
            }}
            onPointerUp={(event) => {
                const state = pointerStateRef.current;
                if (!state || state.pointerId !== event.pointerId) {
                    return;
                }
                (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
                pointerStateRef.current = null;
                onDraftEnd();
            }}
            onPointerCancel={(event) => {
                const state = pointerStateRef.current;
                if (!state || state.pointerId !== event.pointerId) {
                    return;
                }
                (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
                pointerStateRef.current = null;
                onDraftEnd();
            }}
        >
            {children}
        </div>
    );
}

export default function DayCalendarView({
    anchorDate,
    renderedDays,
    visibleDayCount,
    bufferDays = DAY_VIEW_BUFFER_DAYS,
    rowCount,
    hourHeight,
    visibleHours,
    fontScale,
    containerHeight,
    showGregorianCalendar,
    showBsCalendar,
    items,
    dragPreview = null,
    verticalResetKey,
    scrollRequest,
    onAnchorDateChange,
    onBackgroundClick,
    onCreateDraft,
    onEventClick,
    onEventDoubleClick,
    onTimedResize,
    isEventSelected,
}: DayCalendarViewProps) {
    const topViewportRefs = useRef<Array<HTMLDivElement | null>>([]);
    const bodyHorizontalViewportRefs = useRef<Array<HTMLDivElement | null>>([]);
    const bodyVerticalScrollRefs = useRef<Array<HTMLDivElement | null>>([]);
    const timeGutterInnerRefs = useRef<Array<HTMLDivElement | null>>([]);
    const horizontalAnchorTimerRef = useRef<number | null>(null);
    const suppressAnchorSyncRef = useRef(false);
    const horizontalSyncLockRef = useRef(false);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [draftState, setDraftState] = useState<DraftState | null>(null);
    const [resizePreview, setResizePreview] = useState<{ segmentKey: string; startMs: number; endMs: number } | null>(null);
    const resizeStateRef = useRef<ResizeState | null>(null);
    const [now, setNow] = useState(() => new Date());

    const rowContainerHeight = useMemo(() => Math.max(260, (containerHeight ?? 680) / rowCount), [containerHeight, rowCount]);
    const effectiveHourHeight = useMemo(() => {
        if (visibleHours != null) {
            const availableHeight = Math.max(160, rowContainerHeight - DAY_VIEW_HEADER_HEIGHT_PX);
            return Math.max(18, availableHeight / visibleHours);
        }
        return Math.max(18, hourHeight / rowCount);
    }, [hourHeight, rowCount, rowContainerHeight, visibleHours]);
    const snapMinutes = useMemo(() => getCalendarDayViewSnapMinutes(effectiveHourHeight), [effectiveHourHeight]);
    const allDayLaneCap = useMemo(() => determineAllDayLaneCap(rowContainerHeight), [rowContainerHeight]);
    const allDayLaneHeightPx = useMemo(() => Math.max(18, Math.round(16 + fontScale * 14)), [fontScale]);
    const allDayLaneGapPx = useMemo(() => Math.max(2, Math.round(2 + fontScale * 2)), [fontScale]);
    const dayWidth = useMemo(() => (viewportWidth > 0 ? viewportWidth / Math.max(1, visibleDayCount) : 280), [viewportWidth, visibleDayCount]);
    const totalTrackWidth = useMemo(() => renderedDays.length * dayWidth, [dayWidth, renderedDays.length]);
    const gridHeight = useMemo(() => 24 * effectiveHourHeight, [effectiveHourHeight]);
    const renderedDayMap = useMemo(
        () => new Map(renderedDays.map((day, index) => [formatDayKey(day), index] as const)),
        [renderedDays]
    );
    const effectiveShowBsCalendar = Boolean(showBsCalendar);
    const effectiveShowGregorianCalendar = Boolean(showGregorianCalendar || !effectiveShowBsCalendar);
    const visibleStartKey = formatDayKey(anchorDate);
    const visibleEndKey = formatDayKey(addDays(anchorDate, visibleDayCount * rowCount - 1));
    const rowDescriptors = useMemo(
        () =>
            Array.from({ length: rowCount }, (_unused, rowIndex) => ({
                rowIndex,
                rowOffset: rowIndex * visibleDayCount,
                rowDays: renderedDays.slice(rowIndex * visibleDayCount),
            })),
        [renderedDays, rowCount, visibleDayCount]
    );

    function syncTimeGutterOffset(rowIndex: number, scrollTop: number) {
        const gutterInner = timeGutterInnerRefs.current[rowIndex];
        if (!gutterInner) return;

        const nextTransform = `translate3d(0, ${-scrollTop}px, 0)`;
        if (gutterInner.style.transform !== nextTransform) {
            gutterInner.style.transform = nextTransform;
        }
    }

    useEffect(() => {
        const interval = window.setInterval(() => setNow(new Date()), 60 * 1000);
        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        const element = bodyHorizontalViewportRefs.current[0];
        if (!element || typeof ResizeObserver === 'undefined') {
            setViewportWidth(element?.clientWidth ?? 0);
            return;
        }

        const updateSize = () => {
            setViewportWidth(element.clientWidth);
        };

        updateSize();
        const observer = new ResizeObserver(updateSize);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    useLayoutEffect(() => {
        const viewports = bodyHorizontalViewportRefs.current.filter(Boolean) as HTMLDivElement[];
        if (viewports.length === 0 || dayWidth <= 0) return;

        suppressAnchorSyncRef.current = true;
        const nextScrollLeft = bufferDays * dayWidth;
        viewports.forEach((viewport) => {
            viewport.scrollLeft = nextScrollLeft;
        });
        topViewportRefs.current.forEach((viewport) => {
            if (viewport) {
                viewport.scrollLeft = nextScrollLeft;
            }
        });

        window.requestAnimationFrame(() => {
            suppressAnchorSyncRef.current = false;
        });
    }, [anchorDate, bufferDays, dayWidth, rowCount]);

    useLayoutEffect(() => {
        const nextTop = DAY_VIEW_DEFAULT_START_HOUR * effectiveHourHeight;
        bodyVerticalScrollRefs.current.forEach((verticalScroller, rowIndex) => {
            if (verticalScroller) {
                verticalScroller.scrollTop = nextTop;
            }
            syncTimeGutterOffset(rowIndex, nextTop);
        });
    }, [effectiveHourHeight, rowCount, verticalResetKey]);

    useEffect(() => {
        if (!scrollRequest || dayWidth <= 0) return;

        const dayIndex = renderedDayMap.get(scrollRequest.dateKey);
        if (dayIndex == null) return;

        const anchorIndex = renderedDayMap.get(visibleStartKey) ?? 0;
        const relativeVisibleIndex = Math.max(0, dayIndex - anchorIndex);
        const rowIndex = Math.min(rowCount - 1, Math.floor(relativeVisibleIndex / visibleDayCount));
        const rowOffset = rowIndex * visibleDayCount;
        const targetLeft = Math.max(0, (dayIndex - rowOffset) * dayWidth);
        const bodyViewport = bodyHorizontalViewportRefs.current[rowIndex];
        const topViewport = topViewportRefs.current[rowIndex];
        if (bodyViewport) {
            bodyViewport.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }
        if (topViewport) {
            topViewport.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }

        const minute = scrollRequest.minute == null ? 0 : scrollRequest.minute;
        const nextTop = Math.max(
            0,
            (minute / 60) * effectiveHourHeight -
                Math.max(160, rowContainerHeight - DAY_VIEW_HEADER_HEIGHT_PX - allDayLaneHeightPx) * 0.28
        );
        const verticalScroller = bodyVerticalScrollRefs.current[rowIndex];
        if (verticalScroller) {
            verticalScroller.scrollTo({ top: nextTop, behavior: 'smooth' });
        }
    }, [allDayLaneHeightPx, dayWidth, effectiveHourHeight, renderedDayMap, rowContainerHeight, rowCount, scrollRequest, visibleDayCount, visibleStartKey]);

    useEffect(() => {
        return () => {
            if (horizontalAnchorTimerRef.current != null) {
                window.clearTimeout(horizontalAnchorTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const handleWindowPointerMove = (event: PointerEvent) => {
            const resizeState = resizeStateRef.current;
            if (!resizeState) return;

            const deltaMinutes = Math.round(((event.clientY - resizeState.startClientY) / effectiveHourHeight) * (60 / resizeState.snapMinutes)) * resizeState.snapMinutes;
            if (resizeState.edge === 'start') {
                const nextStartMs = clampNumber(
                    resizeState.originalStartMs + deltaMinutes * 60 * 1000,
                    resizeState.dayStartMs,
                    resizeState.originalEndMs - resizeState.snapMinutes * 60 * 1000
                );
                setResizePreview({
                    segmentKey: resizeState.segmentKey,
                    startMs: nextStartMs,
                    endMs: resizeState.originalEndMs,
                });
                return;
            }

            const nextEndMs = clampNumber(
                resizeState.originalEndMs + deltaMinutes * 60 * 1000,
                resizeState.originalStartMs + resizeState.snapMinutes * 60 * 1000,
                resizeState.dayEndMs
            );
            setResizePreview({
                segmentKey: resizeState.segmentKey,
                startMs: resizeState.originalStartMs,
                endMs: nextEndMs,
            });
        };

        const handleWindowPointerUp = (event: PointerEvent) => {
            const resizeState = resizeStateRef.current;
            if (!resizeState) return;

            const preview = resizePreview;
            resizeStateRef.current = null;
            if (!preview) {
                setResizePreview(null);
                return;
            }

            const startChanged = preview.startMs !== resizeState.originalStartMs;
            const endChanged = preview.endMs !== resizeState.originalEndMs;
            if (startChanged || endChanged) {
                onTimedResize({
                    item: resizeState.item,
                    nextStartDate: new Date(preview.startMs).toISOString(),
                    nextEndDate: new Date(preview.endMs).toISOString(),
                    input: {
                        altKey: event.altKey,
                        shiftKey: event.shiftKey,
                    },
                });
            }

            setResizePreview(null);
        };

        window.addEventListener('pointermove', handleWindowPointerMove);
        window.addEventListener('pointerup', handleWindowPointerUp);
        window.addEventListener('pointercancel', handleWindowPointerUp);
        return () => {
            window.removeEventListener('pointermove', handleWindowPointerMove);
            window.removeEventListener('pointerup', handleWindowPointerUp);
            window.removeEventListener('pointercancel', handleWindowPointerUp);
        };
    }, [effectiveHourHeight, onTimedResize, resizePreview]);

    const { allDayVisibleLanes, allDayOverflowByColumn, timedSegments } = useMemo(() => {
        const renderedStart = renderedDays[0] ? startOfDayDate(renderedDays[0]) : startOfDayDate(anchorDate);
        const renderedEnd = renderedDays[renderedDays.length - 1] ? startOfDayDate(renderedDays[renderedDays.length - 1]) : renderedStart;
        const allDaySegments: AllDaySegment[] = [];
        const timedBaseSegments: Array<Omit<TimedSegment, 'columnIndex' | 'columnCount'>> = [];

        for (const item of items) {
            const start = parseEventStart(item);
            const end = parseEventEnd(item);
            if (!start || !end || end.getTime() <= start.getTime()) {
                continue;
            }

            if (item.isAllDay) {
                const startDay = startOfDayDate(start);
                const endInclusive = startOfDayDate(new Date(end.getTime() - 1));
                const overlapsRendered = startDay.getTime() <= renderedEnd.getTime() && endInclusive.getTime() >= renderedStart.getTime();
                if (!overlapsRendered) continue;

                const firstVisibleDay = startDay.getTime() < renderedStart.getTime() ? renderedStart : startDay;
                const lastVisibleDay = endInclusive.getTime() > renderedEnd.getTime() ? renderedEnd : endInclusive;

                if (item.calendarItemKind === 'chore' || firstVisibleDay.getTime() === lastVisibleDay.getTime()) {
                    for (
                        let dayCursor = firstVisibleDay;
                        dayCursor.getTime() <= lastVisibleDay.getTime();
                        dayCursor = addDays(dayCursor, 1)
                    ) {
                        const dayKey = formatDayKey(dayCursor);
                        const dayIndex = renderedDayMap.get(dayKey);
                        if (dayIndex == null) continue;
                        allDaySegments.push({
                            key: `${item.id}-${dayKey}-chip`,
                            item: {
                                ...item,
                                __displayDate: dayKey,
                                __dragAnchorStartDate: dayKey,
                                __calendarAppearance: 'day',
                            },
                            startCol: dayIndex,
                            endCol: dayIndex,
                            continuesBefore: dayCursor.getTime() > startDay.getTime(),
                            continuesAfter: dayCursor.getTime() < endInclusive.getTime(),
                            chipOnly: true,
                        });
                    }
                    continue;
                }

                const startCol = renderedDayMap.get(formatDayKey(startDay));
                const endCol = renderedDayMap.get(formatDayKey(endInclusive));
                if (startCol == null || endCol == null) {
                    continue;
                }
                allDaySegments.push({
                    key: `${item.id}-${formatDayKey(startDay)}-${formatDayKey(endInclusive)}-span`,
                    item: {
                        ...item,
                        __calendarAppearance: 'day',
                    },
                    startCol,
                    endCol,
                    continuesBefore: false,
                    continuesAfter: false,
                });
                continue;
            }

            const firstDay = startOfDayDate(start);
            const lastDay = startOfDayDate(new Date(end.getTime() - 1));
            for (let dayCursor = firstDay; dayCursor.getTime() <= lastDay.getTime(); dayCursor = addDays(dayCursor, 1)) {
                const dayKey = formatDayKey(dayCursor);
                const dayIndex = renderedDayMap.get(dayKey);
                if (dayIndex == null) continue;

                const dayStartMs = dayCursor.getTime();
                const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
                const segmentStartMs = Math.max(start.getTime(), dayStartMs);
                const segmentEndMs = Math.min(end.getTime(), dayEndMs);
                if (segmentEndMs <= segmentStartMs) continue;

                const startMinute = clampNumber(Math.floor((segmentStartMs - dayStartMs) / 60000), 0, 24 * 60);
                const endMinute = clampNumber(Math.ceil((segmentEndMs - dayStartMs) / 60000), startMinute + 1, 24 * 60);

                timedBaseSegments.push({
                    key: `${item.id}-${dayKey}-${segmentStartMs}-${segmentEndMs}`,
                    item,
                    dayKey,
                    dayIndex,
                    startMinute,
                    endMinute,
                    continuesBefore: start.getTime() < dayStartMs,
                    continuesAfter: end.getTime() > dayEndMs,
                    displayItem: {
                        ...item,
                        __displayDate: dayKey,
                        __dragAnchorStartDate: new Date(segmentStartMs).toISOString(),
                        __calendarAppearance: 'day',
                        __calendarMetaLabel: formatTimedEventMetaLabel({
                            start,
                            end,
                            segmentDay: dayCursor,
                            showGregorianCalendar: effectiveShowGregorianCalendar,
                            showBsCalendar: effectiveShowBsCalendar,
                        }),
                    },
                });
            }
        }

        const allDayLanes = assignSpanLanes(allDaySegments);
        const overflowByColumn = Array.from({ length: renderedDays.length }, () => 0);
        for (let laneIndex = allDayLaneCap; laneIndex < allDayLanes.length; laneIndex += 1) {
            for (const segment of allDayLanes[laneIndex]) {
                for (let column = segment.startCol; column <= segment.endCol; column += 1) {
                    overflowByColumn[column] += 1;
                }
            }
        }

        return {
            allDayVisibleLanes: allDayLanes.slice(0, allDayLaneCap),
            allDayOverflowByColumn: overflowByColumn,
            timedSegments: layoutTimedSegmentsByDay(timedBaseSegments),
        };
    }, [
        allDayLaneCap,
        anchorDate,
        effectiveShowBsCalendar,
        effectiveShowGregorianCalendar,
        items,
        renderedDayMap,
        renderedDays,
        visibleEndKey,
        visibleStartKey,
    ]);

    const dragPreviewSegments = useMemo(() => {
        if (!dragPreview) {
            return {
                allDay: [] as DayViewAllDayPreviewSegment[],
                timed: [] as DayViewTimedPreviewSegment[],
            };
        }

        const parsedStart = parseISO(String(dragPreview.startDate || ''));
        const parsedEnd = parseISO(String(dragPreview.endDate || ''));
        if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime()) || parsedEnd.getTime() <= parsedStart.getTime()) {
            return {
                allDay: [] as DayViewAllDayPreviewSegment[],
                timed: [] as DayViewTimedPreviewSegment[],
            };
        }

        if (dragPreview.item.isAllDay) {
            const startDay = startOfDayDate(parsedStart);
            const endInclusive = startOfDayDate(new Date(parsedEnd.getTime() - 1));
            const startCol = renderedDayMap.get(formatDayKey(startDay));
            const endCol = renderedDayMap.get(formatDayKey(endInclusive));
            if (startCol == null || endCol == null) {
                return {
                    allDay: [] as DayViewAllDayPreviewSegment[],
                    timed: [] as DayViewTimedPreviewSegment[],
                };
            }

            return {
                allDay: [
                    {
                        key: `drag-preview-all-day-${dragPreview.item.id}`,
                        item: dragPreview.item,
                        startCol,
                        endCol,
                        continuesBefore: false,
                        continuesAfter: false,
                        timeLabel: 'All day',
                    },
                ],
                timed: [] as DayViewTimedPreviewSegment[],
            };
        }

        const timed: DayViewTimedPreviewSegment[] = [];
        const firstDay = startOfDayDate(parsedStart);
        const lastDay = startOfDayDate(new Date(parsedEnd.getTime() - 1));
        for (let dayCursor = firstDay; dayCursor.getTime() <= lastDay.getTime(); dayCursor = addDays(dayCursor, 1)) {
            const dayKey = formatDayKey(dayCursor);
            const dayIndex = renderedDayMap.get(dayKey);
            if (dayIndex == null) continue;

            const dayStartMs = dayCursor.getTime();
            const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;
            const segmentStartMs = Math.max(parsedStart.getTime(), dayStartMs);
            const segmentEndMs = Math.min(parsedEnd.getTime(), dayEndMs);
            if (segmentEndMs <= segmentStartMs) continue;

            const startMinute = clampNumber(Math.floor((segmentStartMs - dayStartMs) / 60000), 0, 24 * 60);
            const endMinute = clampNumber(Math.ceil((segmentEndMs - dayStartMs) / 60000), startMinute + 1, 24 * 60);
            timed.push({
                key: `drag-preview-${dragPreview.item.id}-${dayKey}-${segmentStartMs}`,
                item: dragPreview.item,
                dayKey,
                dayIndex,
                startMinute,
                endMinute,
                timeLabel: formatSegmentTimeRange(startMinute, endMinute),
            });
        }

        return {
            allDay: [] as DayViewAllDayPreviewSegment[],
            timed,
        };
    }, [dragPreview, renderedDayMap]);

    const currentTimeIndicator = useMemo(() => {
        const todayKey = formatDayKey(now);
        const dayIndex = renderedDayMap.get(todayKey);
        if (dayIndex == null) return null;
        return {
            dayIndex,
            top: ((now.getHours() * 60 + now.getMinutes()) / 60) * effectiveHourHeight,
        };
    }, [effectiveHourHeight, now, renderedDayMap]);
    const handleHorizontalScroll = (sourceIndex: number) => {
        const viewport = bodyHorizontalViewportRefs.current[sourceIndex];
        if (!viewport) return;

        if (horizontalSyncLockRef.current) {
            return;
        }

        horizontalSyncLockRef.current = true;
        bodyHorizontalViewportRefs.current.forEach((candidate, candidateIndex) => {
            if (candidate && candidateIndex !== sourceIndex) {
                candidate.scrollLeft = viewport.scrollLeft;
            }
        });
        topViewportRefs.current.forEach((candidate) => {
            if (candidate) {
                candidate.scrollLeft = viewport.scrollLeft;
            }
        });
        window.requestAnimationFrame(() => {
            horizontalSyncLockRef.current = false;
        });

        if (suppressAnchorSyncRef.current) {
            return;
        }

        if (horizontalAnchorTimerRef.current != null) {
            window.clearTimeout(horizontalAnchorTimerRef.current);
        }

        horizontalAnchorTimerRef.current = window.setTimeout(() => {
            const activeViewport = bodyHorizontalViewportRefs.current[sourceIndex];
            if (!activeViewport || dayWidth <= 0) return;
            const maxAnchorIndex = Math.max(0, renderedDays.length - visibleDayCount * rowCount);

            const snappedIndex = clampNumber(
                Math.round(activeViewport.scrollLeft / dayWidth),
                0,
                maxAnchorIndex
            );
            const snappedLeft = snappedIndex * dayWidth;
            if (Math.abs(activeViewport.scrollLeft - snappedLeft) > 1) {
                activeViewport.scrollTo({ left: snappedLeft, behavior: 'smooth' });
            }

            const nextAnchor = renderedDays[snappedIndex];
            if (nextAnchor && formatDayKey(nextAnchor) !== formatDayKey(anchorDate)) {
                onAnchorDateChange(startOfDayDate(nextAnchor));
            }
        }, 120);
    };

    const hourLabels = useMemo(() => Array.from({ length: 25 }, (_unused, hour) => hour), []);
    const timedHourLineBackground = useMemo(
        () => ({
            backgroundSize: `100% ${effectiveHourHeight}px`,
        }),
        [effectiveHourHeight]
    );
    const timedSubhourLineBackground = useMemo(() => {
        if (snapMinutes >= 15) return null;
        return {
            backgroundSize: `100% ${(effectiveHourHeight * snapMinutes) / 60}px`,
        };
    }, [effectiveHourHeight, snapMinutes]);

    return (
        <div className={styles.dayViewShell}>
            {rowDescriptors.map(({ rowIndex, rowOffset, rowDays }) => {
                const rowTrackWidth = rowDays.length * dayWidth;
                const visibleRowEndCol = rowOffset + rowDays.length - 1;
                const rowVisibleLaneCount = allDayVisibleLanes.reduce((count, lane) => {
                    const hasSegmentInRow = lane.some((segment) => !(segment.endCol < rowOffset || segment.startCol > visibleRowEndCol));
                    return hasSegmentInRow ? count + 1 : count;
                }, 0);
                const rowHasOverflow = rowDays.some((_day, localIndex) => allDayOverflowByColumn[rowOffset + localIndex] > 0);
                const rowRenderedLaneCount = Math.max(1, rowVisibleLaneCount);
                const rowAllDayHeight =
                    rowRenderedLaneCount * allDayLaneHeightPx +
                    Math.max(0, rowRenderedLaneCount - 1) * allDayLaneGapPx +
                    (rowHasOverflow ? DAY_VIEW_ALL_DAY_OVERFLOW_HEIGHT_PX : 0);
                const rowTimedViewportHeight = Math.max(160, rowContainerHeight - DAY_VIEW_HEADER_HEIGHT_PX - rowAllDayHeight);
                const rowCurrentTimeIndicator =
                    currentTimeIndicator &&
                    currentTimeIndicator.dayIndex >= rowOffset &&
                    currentTimeIndicator.dayIndex <= visibleRowEndCol
                        ? {
                              left: `${(currentTimeIndicator.dayIndex - rowOffset) * dayWidth}px`,
                              top: `${currentTimeIndicator.top}px`,
                          }
                        : null;

                return (
                    <div key={`day-view-row-${rowIndex}`} className={styles.dayViewRowSection}>
                        <div className={styles.dayViewTopRow}>
                            <div className={styles.dayViewTimeHeaderSpacer} style={{ width: `${DAY_VIEW_HOUR_LABEL_WIDTH_PX}px` }}>
                                <div className={styles.dayViewTimeHeaderLabel} />
                            </div>
                            <div
                                ref={(node) => {
                                    topViewportRefs.current[rowIndex] = node;
                                }}
                                className={styles.dayViewHorizontalViewport}
                            >
                                <div className={styles.dayViewTrack} style={{ width: `${rowTrackWidth}px` }}>
                                    <div className={styles.dayViewHeaderRow} style={{ height: `${DAY_VIEW_HEADER_HEIGHT_PX}px` }}>
                                        {rowDays.map((day) => {
                                            const dateKey = formatDayKey(day);
                                            const weekday = day.toLocaleDateString(undefined, {
                                                weekday: dayWidth < 220 ? 'short' : 'long',
                                            });
                                            const gregorianDay = day.toLocaleDateString(undefined, {
                                                day: 'numeric',
                                            });
                                            let bsDay = '';
                                            if (effectiveShowBsCalendar) {
                                                try {
                                                    const nepaliDate = new NepaliDate(day);
                                                    bsDay = toDevanagariDigits(nepaliDate.getDate());
                                                } catch {
                                                    bsDay = '';
                                                }
                                            }

                                            return (
                                                <div
                                                    key={`day-header-${dateKey}-row-${rowIndex}`}
                                                    data-testid={`day-view-header-${dateKey}`}
                                                    className={styles.dayViewHeaderCell}
                                                    style={{ width: `${dayWidth}px` }}
                                                >
                                                    <div className={styles.dayViewHeaderWeekday}>{weekday}</div>
                                                    <div className={styles.dayViewHeaderGregorian}>
                                                        {effectiveShowGregorianCalendar && effectiveShowBsCalendar
                                                            ? `${gregorianDay}   ${bsDay}`
                                                            : effectiveShowBsCalendar
                                                            ? bsDay
                                                            : rowCount > 1
                                                            ? gregorianDay
                                                            : day.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                                                    </div>
                                                    {effectiveShowBsCalendar && !effectiveShowGregorianCalendar && rowCount === 1 ? (
                                                        <div className={styles.dayViewHeaderBs}>{bsDay}</div>
                                                    ) : null}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className={styles.dayViewAllDayTrack} style={{ height: `${rowAllDayHeight}px` }}>
                                        {rowDays.map((day, localIndex) => {
                                            const dateKey = formatDayKey(day);
                                            const globalIndex = rowOffset + localIndex;
                                            return (
                                                <div
                                                    key={`all-day-cell-wrap-${dateKey}-row-${rowIndex}`}
                                                    className={styles.dayViewAllDayCellWrap}
                                                    style={{ width: `${dayWidth}px` }}
                                                >
                                                    <DayViewDropAllDayCell
                                                        dateStr={dateKey}
                                                        day={day}
                                                        onClick={onBackgroundClick}
                                                        onDoubleClick={() =>
                                                            onCreateDraft({
                                                                start: startOfDayDate(day),
                                                                end: addDays(startOfDayDate(day), 1),
                                                                isAllDay: true,
                                                            })
                                                        }
                                                    >
                                                        {allDayOverflowByColumn[globalIndex] > 0 ? (
                                                            <div className={styles.dayViewAllDayOverflow}>+{allDayOverflowByColumn[globalIndex]} more</div>
                                                        ) : null}
                                                    </DayViewDropAllDayCell>
                                                </div>
                                            );
                                        })}

                                        <div className={styles.dayViewAllDayOverlay}>
                                            {allDayVisibleLanes.map((lane, laneIndex) => (
                                                <div
                                                    key={`all-day-lane-${laneIndex}-row-${rowIndex}`}
                                                    className={styles.dayViewAllDayLane}
                                                    style={{
                                                        top: `${laneIndex * (allDayLaneHeightPx + allDayLaneGapPx)}px`,
                                                        height: `${allDayLaneHeightPx}px`,
                                                    }}
                                                >
                                                    {lane
                                                        .filter((segment) => !(segment.endCol < rowOffset || segment.startCol > visibleRowEndCol))
                                                        .map((segment) => {
                                                            const localStart = Math.max(segment.startCol - rowOffset, 0);
                                                            const localEnd = Math.min(segment.endCol - rowOffset, rowDays.length - 1);
                                                            return (
                                                                <div
                                                                    key={`${segment.key}-row-${rowIndex}`}
                                                                    className={styles.dayViewAllDaySegment}
                                                                    style={{
                                                                        left: `${localStart * dayWidth}px`,
                                                                        width: `${(localEnd - localStart + 1) * dayWidth}px`,
                                                                    }}
                                                                >
                                                                    <DraggableCalendarEvent
                                                                        item={segment.item}
                                                                        index={laneIndex}
                                                                        layout="span"
                                                                        className={styles.dayViewAllDayEventCard}
                                                                        scale={fontScale}
                                                                        selected={isEventSelected(segment.item)}
                                                                        continuesBefore={segment.continuesBefore || segment.startCol < rowOffset}
                                                                        continuesAfter={segment.continuesAfter || segment.endCol > visibleRowEndCol}
                                                                        draggableEnabled={segment.item.calendarItemKind !== 'chore'}
                                                                        onClick={(event) => onEventClick(event, segment.item)}
                                                                        onDoubleClick={(event) => onEventDoubleClick(event, segment.item)}
                                                                    />
                                                                </div>
                                                            );
                                                        })}
                                                </div>
                                            ))}

                                            {dragPreviewSegments.allDay
                                                .filter((segment) => !(segment.endCol < rowOffset || segment.startCol > visibleRowEndCol))
                                                .map((segment) => {
                                                    const localStart = Math.max(segment.startCol - rowOffset, 0);
                                                    const localEnd = Math.min(segment.endCol - rowOffset, rowDays.length - 1);
                                                    return (
                                                        <div
                                                            key={`${segment.key}-row-${rowIndex}`}
                                                            className={styles.dayViewAllDayPreviewSegment}
                                                            style={{
                                                                left: `${localStart * dayWidth + 4}px`,
                                                                width: `${Math.max(48, (localEnd - localStart + 1) * dayWidth - 8)}px`,
                                                            }}
                                                        >
                                                            <div className={styles.dayViewDropPreviewTitle}>{segment.item.title || 'Untitled event'}</div>
                                                            <div className={styles.dayViewDropPreviewTime}>{segment.timeLabel}</div>
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                            <div className={styles.dayViewBodyRow}>
                            <div className={styles.dayViewTimeGutter} style={{ width: `${DAY_VIEW_HOUR_LABEL_WIDTH_PX}px`, height: `${rowTimedViewportHeight}px` }}>
                                <div
                                    ref={(node) => {
                                        timeGutterInnerRefs.current[rowIndex] = node;
                                        if (node) {
                                            const nextScrollTop = bodyVerticalScrollRefs.current[rowIndex]?.scrollTop ?? DAY_VIEW_DEFAULT_START_HOUR * effectiveHourHeight;
                                            node.style.transform = `translate3d(0, ${-nextScrollTop}px, 0)`;
                                        }
                                    }}
                                    data-testid={`day-view-time-gutter-inner-${rowIndex}`}
                                    className={styles.dayViewTimeGutterInner}
                                    style={{
                                        height: `${gridHeight}px`,
                                    }}
                                >
                                    {hourLabels.map((hour) => (
                                        <div
                                            key={`time-label-${hour}-row-${rowIndex}`}
                                            className={styles.dayViewTimeLabel}
                                            style={{ top: `${hour * effectiveHourHeight}px` }}
                                        >
                                            {formatHourLabel(hour)}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div
                                ref={(node) => {
                                    bodyHorizontalViewportRefs.current[rowIndex] = node;
                                }}
                                data-calendar-day-horizontal-viewport="timed"
                                data-calendar-day-row-index={rowIndex}
                                className={styles.dayViewHorizontalViewport}
                                onScroll={() => handleHorizontalScroll(rowIndex)}
                            >
                                <div className={styles.dayViewTrack} style={{ width: `${rowTrackWidth}px` }}>
                                    <div
                                        ref={(node) => {
                                            bodyVerticalScrollRefs.current[rowIndex] = node;
                                        }}
                                        data-testid={`day-view-vertical-scroller-${rowIndex}`}
                                        data-calendar-day-vertical-viewport="timed"
                                        data-calendar-day-row-index={rowIndex}
                                        className={styles.dayViewVerticalScroller}
                                        style={{ height: `${rowTimedViewportHeight}px` }}
                                        onScroll={(event) => {
                                            const nextScrollTop = event.currentTarget.scrollTop;
                                            syncTimeGutterOffset(rowIndex, nextScrollTop);
                                        }}
                                    >
                                        <div className={styles.dayViewTimedGrid} style={{ width: `${rowTrackWidth}px`, height: `${gridHeight}px` }}>
                                            <div className={styles.dayViewHourLines} style={timedHourLineBackground} />
                                            {timedSubhourLineBackground ? (
                                                <div className={styles.dayViewSubhourLines} style={timedSubhourLineBackground} />
                                            ) : null}

                                            <div className={styles.dayViewColumnsRow}>
                                                {rowDays.map((day, localIndex) => (
                                                    <DayViewTimedColumn
                                                        key={`timed-column-${formatDayKey(day)}-row-${rowIndex}`}
                                                        date={day}
                                                        dayIndex={rowOffset + localIndex}
                                                        dayWidth={dayWidth}
                                                        hourHeight={effectiveHourHeight}
                                                        snapMinutes={snapMinutes}
                                                        onBackgroundClick={onBackgroundClick}
                                                        onCreateDraft={onCreateDraft}
                                                        onDraftStart={(dayKey, minute) => {
                                                            setDraftState({ dayKey, startMinute: minute, endMinute: minute });
                                                        }}
                                                        onDraftMove={(minute) => {
                                                            setDraftState((current) => (current ? { ...current, endMinute: minute } : current));
                                                        }}
                                                        onDraftEnd={() => {
                                                            setDraftState((current) => {
                                                                if (!current) return null;
                                                                const startMinute = Math.min(current.startMinute, current.endMinute);
                                                                const endMinute = Math.max(current.startMinute, current.endMinute);
                                                                const draggedMinutes = endMinute - startMinute;
                                                                if (draggedMinutes >= Math.max(snapMinutes, DAY_VIEW_CREATION_DRAG_THRESHOLD_MINUTES)) {
                                                                    const day = renderedDays[renderedDayMap.get(current.dayKey) || 0];
                                                                    onCreateDraft({
                                                                        start: dateAtMinute(day, startMinute),
                                                                        end: dateAtMinute(day, Math.max(startMinute + snapMinutes, endMinute)),
                                                                        isAllDay: false,
                                                                    });
                                                                }
                                                                return null;
                                                            });
                                                        }}
                                                    >
                                                        {draftState && draftState.dayKey === formatDayKey(day) ? (
                                                            <div
                                                                className={styles.dayViewDraftBlock}
                                                                style={{
                                                                    top: `${(Math.min(draftState.startMinute, draftState.endMinute) / 60) * effectiveHourHeight}px`,
                                                                    height: `${(Math.max(snapMinutes, Math.abs(draftState.endMinute - draftState.startMinute)) / 60) * effectiveHourHeight}px`,
                                                                }}
                                                            />
                                                        ) : null}
                                                    </DayViewTimedColumn>
                                                ))}
                                            </div>

                                            {rowCurrentTimeIndicator ? (
                                                <div
                                                    className={styles.dayViewCurrentTimeLine}
                                                    style={{
                                                        left: rowCurrentTimeIndicator.left,
                                                        top: rowCurrentTimeIndicator.top,
                                                        width: `${dayWidth}px`,
                                                    }}
                                                />
                                            ) : null}

                                            {dragPreviewSegments.timed
                                                .filter((segment) => segment.dayIndex >= rowOffset && segment.dayIndex <= visibleRowEndCol)
                                                .map((segment) => {
                                                    const localDayIndex = segment.dayIndex - rowOffset;
                                                    return (
                                                        <div
                                                            key={`${segment.key}-row-${rowIndex}`}
                                                            className={styles.dayViewTimedPreview}
                                                            style={{
                                                                left: `${localDayIndex * dayWidth + 6}px`,
                                                                top: `${(segment.startMinute / 60) * effectiveHourHeight}px`,
                                                                width: `${Math.max(44, dayWidth - 12)}px`,
                                                                height: `${Math.max(22, ((segment.endMinute - segment.startMinute) / 60) * effectiveHourHeight)}px`,
                                                            }}
                                                        >
                                                            <div className={styles.dayViewDropPreviewTitle}>{segment.item.title || 'Untitled event'}</div>
                                                            <div className={styles.dayViewDropPreviewTime}>{segment.timeLabel}</div>
                                                        </div>
                                                    );
                                                })}

                                            {timedSegments
                                                .filter((segment) => segment.dayIndex >= rowOffset && segment.dayIndex <= visibleRowEndCol)
                                                .map((segment) => {
                                                    const preview =
                                                        resizePreview && resizePreview.segmentKey === segment.key && !segment.continuesBefore && !segment.continuesAfter
                                                            ? resizePreview
                                                            : null;
                                                    const displayStartMinute = preview
                                                        ? clampNumber((preview.startMs - startOfDayDate(parseISO(`${segment.dayKey}T00:00:00`)).getTime()) / 60000, 0, 24 * 60)
                                                        : segment.startMinute;
                                                    const displayEndMinute = preview
                                                        ? clampNumber((preview.endMs - startOfDayDate(parseISO(`${segment.dayKey}T00:00:00`)).getTime()) / 60000, 1, 24 * 60)
                                                        : segment.endMinute;
                                                    const localDayIndex = segment.dayIndex - rowOffset;

                                                    return (
                                                        <div
                                                            key={`${segment.key}-row-${rowIndex}`}
                                                            data-calendar-event-wrapper="true"
                                                            className={styles.dayViewTimedEventWrapper}
                                                            style={{
                                                                left: `${localDayIndex * dayWidth + (segment.columnIndex / segment.columnCount) * dayWidth}px`,
                                                                top: `${(displayStartMinute / 60) * effectiveHourHeight}px`,
                                                                width: `${dayWidth / segment.columnCount}px`,
                                                                height: `${Math.max(18, ((displayEndMinute - displayStartMinute) / 60) * effectiveHourHeight)}px`,
                                                            }}
                                                        >
                                                            {!segment.continuesBefore && !segment.continuesAfter && segment.item.calendarItemKind !== 'chore' ? (
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Resize ${segment.item.title || 'event'} earlier`}
                                                                    className={styles.dayViewResizeHandle}
                                                                    onPointerDown={(event) => {
                                                                        event.stopPropagation();
                                                                        const start = parseEventStart(segment.item);
                                                                        const end = parseEventEnd(segment.item);
                                                                        if (!start || !end) return;
                                                                        const dayStart = startOfDayDate(start).getTime();
                                                                        resizeStateRef.current = {
                                                                            edge: 'start',
                                                                            segmentKey: segment.key,
                                                                            item: segment.item,
                                                                            originalStartMs: start.getTime(),
                                                                            originalEndMs: end.getTime(),
                                                                            dayStartMs: dayStart,
                                                                            dayEndMs: dayStart + 24 * 60 * 60 * 1000,
                                                                            startClientY: event.clientY,
                                                                            snapMinutes,
                                                                        };
                                                                        setResizePreview({
                                                                            segmentKey: segment.key,
                                                                            startMs: start.getTime(),
                                                                            endMs: end.getTime(),
                                                                        });
                                                                    }}
                                                                />
                                                            ) : null}

                                                            <DraggableCalendarEvent
                                                                item={segment.displayItem}
                                                                index={segment.columnIndex}
                                                                scale={fontScale}
                                                                selected={isEventSelected(segment.item)}
                                                                draggableEnabled={segment.item.calendarItemKind !== 'chore'}
                                                                className={styles.dayViewTimedEventCard}
                                                                onClick={(event) => onEventClick(event, segment.item)}
                                                                onDoubleClick={(event) => onEventDoubleClick(event, segment.item)}
                                                            />

                                                            {!segment.continuesBefore && !segment.continuesAfter && segment.item.calendarItemKind !== 'chore' ? (
                                                                <button
                                                                    type="button"
                                                                    aria-label={`Resize ${segment.item.title || 'event'} later`}
                                                                    className={`${styles.dayViewResizeHandle} ${styles.dayViewResizeHandleBottom}`}
                                                                    onPointerDown={(event) => {
                                                                        event.stopPropagation();
                                                                        const start = parseEventStart(segment.item);
                                                                        const end = parseEventEnd(segment.item);
                                                                        if (!start || !end) return;
                                                                        const dayStart = startOfDayDate(start).getTime();
                                                                        resizeStateRef.current = {
                                                                            edge: 'end',
                                                                            segmentKey: segment.key,
                                                                            item: segment.item,
                                                                            originalStartMs: start.getTime(),
                                                                            originalEndMs: end.getTime(),
                                                                            dayStartMs: dayStart,
                                                                            dayEndMs: dayStart + 24 * 60 * 60 * 1000,
                                                                            startClientY: event.clientY,
                                                                            snapMinutes,
                                                                        };
                                                                        setResizePreview({
                                                                            segmentKey: segment.key,
                                                                            startMs: start.getTime(),
                                                                            endMs: end.getTime(),
                                                                        });
                                                                    }}
                                                                />
                                                            ) : null}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export { DAY_VIEW_BUFFER_DAYS };
