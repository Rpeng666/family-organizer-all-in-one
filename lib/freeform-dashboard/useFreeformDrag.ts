'use client';

import { useCallback, useRef, useState } from 'react';
import { computeSnappedPosition } from './snap-engine';
import type { SnapGuide, WidgetRect } from './types';

interface DragState {
    widgetId: string;
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
}

interface UseFreeformDragOptions {
    canvasWidth: number;
    allWidgets: WidgetRect[];
    onDragEnd: (widgetId: string, x: number, y: number) => void;
}

/**
 * Hook for drag-to-move widgets on the freeform canvas.
 * Returns pointer event handlers and the current drag position/guides.
 */
export function useFreeformDrag({ canvasWidth, allWidgets, onDragEnd }: UseFreeformDragOptions) {
    const dragRef = useRef<DragState | null>(null);
    const [dragPosition, setDragPosition] = useState<{ widgetId: string; x: number; y: number } | null>(null);
    const [guides, setGuides] = useState<SnapGuide[]>([]);

    const onPointerDown = useCallback(
        (e: React.PointerEvent, widgetId: string, widgetRect: WidgetRect) => {
            e.preventDefault();
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);

            dragRef.current = {
                widgetId,
                startX: widgetRect.x,
                startY: widgetRect.y,
                offsetX: e.clientX - widgetRect.x,
                offsetY: e.clientY - widgetRect.y,
            };
            setDragPosition({ widgetId, x: widgetRect.x, y: widgetRect.y });
        },
        []
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;

            const rawX = e.clientX - drag.offsetX;
            const rawY = Math.max(0, e.clientY - drag.offsetY);

            const draggedWidget = allWidgets.find((w) => w.id === drag.widgetId);
            if (!draggedWidget) return;

            const others = allWidgets.filter((w) => w.id !== drag.widgetId);
            const result = computeSnappedPosition(
                { x: rawX, y: rawY, w: draggedWidget.w, h: draggedWidget.h },
                others,
                canvasWidth
            );

            setDragPosition({ widgetId: drag.widgetId, x: result.x, y: result.y });
            setGuides(result.guides);
        },
        [allWidgets, canvasWidth]
    );

    const onPointerUp = useCallback(
        (_e: React.PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;

            if (dragPosition) {
                onDragEnd(drag.widgetId, dragPosition.x, dragPosition.y);
            }

            dragRef.current = null;
            setDragPosition(null);
            setGuides([]);
        },
        [dragPosition, onDragEnd]
    );

    return {
        dragPosition,
        guides,
        isDragging: dragRef.current !== null,
        onPointerDown,
        onPointerMove,
        onPointerUp,
    };
}
