'use client';

import { useCallback, useRef, useState } from 'react';
import { computeSnappedResize, findAlignedEdges } from './snap-engine';
import type { AlignedEdge, ResizeHandle, SnapGuide, WidgetRect } from './types';

interface ResizeState {
    widgetId: string;
    handle: ResizeHandle;
    startRect: { x: number; y: number; w: number; h: number };
    startClientX: number;
    startClientY: number;
    initialAlignedEdges: AlignedEdge[];
}

interface UseFreeformResizeOptions {
    canvasWidth: number;
    allWidgets: WidgetRect[];
    minSizes: Map<string, { minWidth: number; minHeight: number }>; // widgetId -> min sizes
    onResizeEnd: (updates: { id: string; changes: Partial<Pick<WidgetRect, 'x' | 'y' | 'w' | 'h'>> }[]) => void;
}

/**
 * Hook for resize handles on freeform widgets.
 * Supports edge snapping and shift-key group resize of aligned edges.
 */
export function useFreeformResize({ canvasWidth, allWidgets, minSizes, onResizeEnd }: UseFreeformResizeOptions) {
    const resizeRef = useRef<ResizeState | null>(null);
    const [resizeRect, setResizeRect] = useState<{ widgetId: string; x: number; y: number; w: number; h: number } | null>(null);
    const [guides, setGuides] = useState<SnapGuide[]>([]);
    const [shiftHeld, setShiftHeld] = useState(false);
    const [hasAlignedEdges, setHasAlignedEdges] = useState(false);

    const onResizePointerDown = useCallback(
        (e: React.PointerEvent, widgetId: string, handle: ResizeHandle, widgetRect: WidgetRect) => {
            e.preventDefault();
            e.stopPropagation();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);

            // Find aligned edges for the edge being dragged
            const isLeft = handle.includes('left');
            const isRight = handle.includes('right');
            const isTop = handle.includes('top');
            const isBottom = handle.includes('bottom');

            let aligned: AlignedEdge[] = [];
            if (isLeft) {
                aligned = [...aligned, ...findAlignedEdges(widgetRect.x, 'vertical', allWidgets, widgetId)];
            }
            if (isRight) {
                aligned = [...aligned, ...findAlignedEdges(widgetRect.x + widgetRect.w, 'vertical', allWidgets, widgetId)];
            }
            if (isTop) {
                aligned = [...aligned, ...findAlignedEdges(widgetRect.y, 'horizontal', allWidgets, widgetId)];
            }
            if (isBottom) {
                aligned = [...aligned, ...findAlignedEdges(widgetRect.y + widgetRect.h, 'horizontal', allWidgets, widgetId)];
            }

            resizeRef.current = {
                widgetId,
                handle,
                startRect: { x: widgetRect.x, y: widgetRect.y, w: widgetRect.w, h: widgetRect.h },
                startClientX: e.clientX,
                startClientY: e.clientY,
                initialAlignedEdges: aligned,
            };

            setResizeRect({ widgetId, x: widgetRect.x, y: widgetRect.y, w: widgetRect.w, h: widgetRect.h });
            setHasAlignedEdges(aligned.length > 0);
        },
        [allWidgets]
    );

    const onResizePointerMove = useCallback(
        (e: React.PointerEvent) => {
            const resize = resizeRef.current;
            if (!resize) return;

            setShiftHeld(e.shiftKey);

            const dx = e.clientX - resize.startClientX;
            const dy = e.clientY - resize.startClientY;
            const { handle, startRect } = resize;
            const sizes = minSizes.get(resize.widgetId) ?? { minWidth: 100, minHeight: 80 };

            let { x, y, w, h } = startRect;

            if (handle.includes('right')) w = Math.max(sizes.minWidth, w + dx);
            if (handle.includes('left')) {
                const newW = Math.max(sizes.minWidth, w - dx);
                x = x + (w - newW);
                w = newW;
            }
            if (handle.includes('bottom')) h = Math.max(sizes.minHeight, h + dy);
            if (handle.includes('top')) {
                const newH = Math.max(sizes.minHeight, h - dy);
                y = y + (h - newH);
                h = newH;
            }

            // Apply snap
            const others = allWidgets.filter((wd) => wd.id !== resize.widgetId);
            const snapped = computeSnappedResize({ x, y, w, h }, handle, others, canvasWidth, sizes.minWidth, sizes.minHeight);

            setResizeRect({ widgetId: resize.widgetId, ...snapped.rect });
            setGuides(snapped.guides);
        },
        [allWidgets, canvasWidth, minSizes]
    );

    const onResizePointerUp = useCallback(
        (e: React.PointerEvent) => {
            const resize = resizeRef.current;
            if (!resize || !resizeRect) {
                resizeRef.current = null;
                return;
            }

            const updates: { id: string; changes: Partial<Pick<WidgetRect, 'x' | 'y' | 'w' | 'h'>> }[] = [
                { id: resize.widgetId, changes: { x: resizeRect.x, y: resizeRect.y, w: resizeRect.w, h: resizeRect.h } },
            ];

            // If shift was held, apply delta to aligned edges
            if (e.shiftKey && resize.initialAlignedEdges.length > 0) {
                const dx = resizeRect.x - resize.startRect.x;
                const dw = resizeRect.w - resize.startRect.w;
                const dy = resizeRect.y - resize.startRect.y;
                const dh = resizeRect.h - resize.startRect.h;

                for (const aligned of resize.initialAlignedEdges) {
                    const widget = allWidgets.find((w) => w.id === aligned.widgetId);
                    if (!widget) continue;

                    const changes: Partial<Pick<WidgetRect, 'x' | 'y' | 'w' | 'h'>> = {};

                    if (aligned.edge === 'left') {
                        // The aligned widget's left edge moves with the resized edge
                        if (resize.handle.includes('left')) {
                            changes.x = widget.x + dx;
                            changes.w = widget.w - dx;
                        } else if (resize.handle.includes('right')) {
                            changes.x = widget.x + dw;
                            changes.w = widget.w - dw;
                        }
                    } else if (aligned.edge === 'right') {
                        if (resize.handle.includes('right')) {
                            changes.w = widget.w + dw;
                        } else if (resize.handle.includes('left')) {
                            changes.w = widget.w + dx;
                        }
                    } else if (aligned.edge === 'top') {
                        if (resize.handle.includes('top')) {
                            changes.y = widget.y + dy;
                            changes.h = widget.h - dy;
                        } else if (resize.handle.includes('bottom')) {
                            changes.y = widget.y + dh;
                            changes.h = widget.h - dh;
                        }
                    } else if (aligned.edge === 'bottom') {
                        if (resize.handle.includes('bottom')) {
                            changes.h = widget.h + dh;
                        } else if (resize.handle.includes('top')) {
                            changes.h = widget.h + dy;
                        }
                    }

                    // Enforce minimums
                    const alignedSizes = minSizes.get(aligned.widgetId) ?? { minWidth: 100, minHeight: 80 };
                    if (changes.w !== undefined && changes.w < alignedSizes.minWidth) continue;
                    if (changes.h !== undefined && changes.h < alignedSizes.minHeight) continue;

                    if (Object.keys(changes).length > 0) {
                        updates.push({ id: aligned.widgetId, changes });
                    }
                }
            }

            onResizeEnd(updates);

            resizeRef.current = null;
            setResizeRect(null);
            setGuides([]);
            setShiftHeld(false);
            setHasAlignedEdges(false);
        },
        [resizeRect, allWidgets, minSizes, onResizeEnd]
    );

    return {
        resizeRect,
        guides,
        shiftHeld,
        hasAlignedEdges,
        onResizePointerDown,
        onResizePointerMove,
        onResizePointerUp,
    };
}
