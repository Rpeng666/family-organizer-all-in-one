'use client';

import React from 'react';
import styles from '@/styles/Calendar.module.css';
import { DraggableCalendarEvent, type CalendarItem } from '@/components/DraggableCalendarEvent';

export interface CalendarWeekSpanSegmentLike {
    segmentKey: string;
    item: CalendarItem;
    startCol: number;
    endCol: number;
    continuesBefore: boolean;
    continuesAfter: boolean;
    className?: string;
}

export const WEEK_SPAN_TOP_OFFSET_PX = 23;
export const WEEK_SPAN_LANE_HEIGHT_PX = 16;
export const WEEK_SPAN_LANE_GAP_PX = 2;

export const getWeekSpanReservedHeightData = (
    weekSpanLanes: CalendarWeekSpanSegmentLike[][],
    options?: {
        laneHeightPx?: number;
        laneGapPx?: number;
    }
) => {
    const laneHeightPx = options?.laneHeightPx ?? WEEK_SPAN_LANE_HEIGHT_PX;
    const laneGapPx = options?.laneGapPx ?? WEEK_SPAN_LANE_GAP_PX;
    const weekSpanLaneDepthByCol = Array.from({ length: 7 }, () => 0);
    for (let laneIndex = 0; laneIndex < weekSpanLanes.length; laneIndex += 1) {
        const lane = weekSpanLanes[laneIndex];
        for (const segment of lane) {
            for (let col = segment.startCol; col <= segment.endCol; col += 1) {
                weekSpanLaneDepthByCol[col] = Math.max(weekSpanLaneDepthByCol[col], laneIndex + 1);
            }
        }
    }

    const weekSpanReservedHeightsByCol = weekSpanLaneDepthByCol.map((laneDepth) =>
        laneDepth > 0 ? laneDepth * laneHeightPx + (laneDepth - 1) * laneGapPx : 0
    );

    return {
        weekSpanReservedHeightsByCol,
        weekSpanReservedHeight: Math.max(0, ...weekSpanReservedHeightsByCol),
    };
};

interface CalendarWeekSpanOverlayProps {
    weekKey: string;
    weekSpanLanes: CalendarWeekSpanSegmentLike[][];
    onEventClick?: (event: React.MouseEvent, item: CalendarItem) => void;
    onEventDoubleClick?: (event: React.MouseEvent, item: CalendarItem) => void;
    topOffsetPx?: number;
    laneHeightPx?: number;
    laneGapPx?: number;
    eventScale?: number;
    memberIndicatorStyle?: 'badge' | 'dot';
    interactive?: boolean;
    eventTestIds?: boolean;
    isEventSelected?: (item: CalendarItem) => boolean;
}

export default function CalendarWeekSpanOverlay({
    weekKey,
    weekSpanLanes,
    onEventClick,
    onEventDoubleClick,
    topOffsetPx = WEEK_SPAN_TOP_OFFSET_PX,
    laneHeightPx = WEEK_SPAN_LANE_HEIGHT_PX,
    laneGapPx = WEEK_SPAN_LANE_GAP_PX,
    eventScale,
    memberIndicatorStyle = 'badge',
    interactive = true,
    eventTestIds = true,
    isEventSelected,
}: CalendarWeekSpanOverlayProps) {
    const { weekSpanReservedHeight } = getWeekSpanReservedHeightData(weekSpanLanes, {
        laneHeightPx,
        laneGapPx,
    });

    if (weekSpanLanes.length === 0 || weekSpanReservedHeight <= 0) {
        return null;
    }

    return (
        <div
            className={styles.weekSpanOverlay}
            style={{
                top: `${topOffsetPx}px`,
                minHeight: `${weekSpanReservedHeight}px`,
                gap: `${laneGapPx}px`,
            }}
        >
            {weekSpanLanes.map((lane, laneIndex) => (
                <div key={`${weekKey}-overlay-lane-${laneIndex}`} className={styles.weekSpanOverlayLane}>
                    {lane.map((segment) => (
                        <div
                            key={segment.segmentKey}
                            className={styles.weekSpanOverlaySegment}
                            style={{
                                gridColumn: `${segment.startCol + 1} / ${segment.endCol + 2}`,
                            }}
                        >
                            <DraggableCalendarEvent
                                item={segment.item}
                                index={laneIndex}
                                layout="span"
                                memberIndicatorStyle={memberIndicatorStyle}
                                scale={eventScale}
                                selected={isEventSelected?.(segment.item) ?? false}
                                className={segment.className}
                                continuesBefore={segment.continuesBefore}
                                continuesAfter={segment.continuesAfter}
                                draggableEnabled={interactive}
                                testId={eventTestIds ? undefined : null}
                                onClick={interactive && onEventClick ? (event) => onEventClick(event, segment.item) : undefined}
                                onDoubleClick={
                                    interactive && onEventDoubleClick ? (event) => onEventDoubleClick(event, segment.item) : undefined
                                }
                            />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
