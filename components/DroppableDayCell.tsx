// components/DroppableDayCell.js
'use client';

import React, { useRef, useEffect, useState } from 'react';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
// REMOVED: Edge detection and DropIndicator imports
import { cn } from '../lib/utils'; // Import cn utility
import styles from '../styles/Calendar.module.css'; // Import styles

interface DroppableDayCellProps {
    day: Date;
    dateStr: string;
    className?: string;
    style?: React.CSSProperties;
    dataAttributes?: Record<string, string | undefined>;
    onClick?: (day: Date) => void;
    onDoubleClick?: (day: Date) => void;
    children?: React.ReactNode;
}

export const DroppableDayCell = ({ day, dateStr, className, style, dataAttributes, onClick, onDoubleClick, children }: DroppableDayCellProps) => {
    const cellRef = useRef<HTMLTableCellElement>(null);
    // NEW: State to track if the cell is being dragged over
    const [isBeingDraggedOver, setIsBeingDraggedOver] = useState(false);
    const resolvedDataAttributes = Object.fromEntries(
        Object.entries(dataAttributes || {}).filter(([, value]) => typeof value === 'string' && value.length > 0)
    );

    useEffect(() => {
        const cell = cellRef.current;
        if (!cell) return;

        const cleanupDropTarget = dropTargetForElements({
            element: cell,
            canDrop: ({ source }) => (source.data as { type?: string }).type === 'calendar-event',
            getIsSticky: () => true,
            getData: () => {
                // CHANGED: Simplified data, no edge detection needed
                return { type: 'calendar-day', dateStr: dateStr };
            },
            // NEW: Set state on drag enter
            onDragEnter: () => setIsBeingDraggedOver(true),
            // REMOVED: onDrag handler
            onDragLeave: () => {
                // CHANGED: Set state on drag leave
                setIsBeingDraggedOver(false);
            },
            onDrop: () => {
                // CHANGED: Set state on drop
                setIsBeingDraggedOver(false);
            },
        });

        return cleanupDropTarget;
    }, [dateStr]); // Re-run if the date string changes

    return (
        // CHANGED: Apply conditional class for drag-over state
        <td
            ref={cellRef}
            data-calendar-cell-date={dateStr}
            {...resolvedDataAttributes}
            className={cn(className, isBeingDraggedOver && styles.dragOverCell)}
            style={style}
            onClick={() => onClick?.(day)}
            onDoubleClick={() => onDoubleClick?.(day)}
        >
            {/* REMOVED: DropIndicator elements */}
            {/* Render the cell's content */}
            {children}
        </td>
    );
};
