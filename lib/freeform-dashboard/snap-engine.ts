import type { AlignedEdge, EdgeDirection, SnapGuide, SnapResult, ResizeSnapResult, WidgetRect } from './types';

const DEFAULT_SNAP_THRESHOLD = 8;
const ALIGNED_TOLERANCE = 1;

interface Edge {
    direction: EdgeDirection;
    value: number;
}

function collectEdges(rect: { x: number; y: number; w: number; h: number }): Edge[] {
    return [
        { direction: 'vertical', value: rect.x },           // left
        { direction: 'vertical', value: rect.x + rect.w },  // right
        { direction: 'horizontal', value: rect.y },          // top
        { direction: 'horizontal', value: rect.y + rect.h }, // bottom
    ];
}

function collectCanvasEdges(canvasWidth: number): Edge[] {
    return [
        { direction: 'vertical', value: 0 },
        { direction: 'vertical', value: canvasWidth },
        { direction: 'horizontal', value: 0 },
    ];
}

/**
 * Computes a snapped position for a widget being dragged.
 * Returns the snapped (x, y) and any guide lines to render.
 */
export function computeSnappedPosition(
    dragging: { x: number; y: number; w: number; h: number },
    others: WidgetRect[],
    canvasWidth: number,
    threshold = DEFAULT_SNAP_THRESHOLD
): SnapResult {
    const targetEdges = collectEdges(dragging);
    const referenceEdges: Edge[] = [
        ...collectCanvasEdges(canvasWidth),
        ...others.flatMap((r) => collectEdges(r)),
    ];

    let snapX: number | null = null;
    let snapY: number | null = null;
    let bestDx = threshold + 1;
    let bestDy = threshold + 1;
    const guides: SnapGuide[] = [];

    // Check vertical edges (left/right of dragged widget)
    const dragLeft = dragging.x;
    const dragRight = dragging.x + dragging.w;
    for (const ref of referenceEdges) {
        if (ref.direction !== 'vertical') continue;

        const dLeft = Math.abs(dragLeft - ref.value);
        const dRight = Math.abs(dragRight - ref.value);

        if (dLeft <= threshold && dLeft < bestDx) {
            bestDx = dLeft;
            snapX = ref.value;
        }
        if (dRight <= threshold && dRight < bestDx) {
            bestDx = dRight;
            snapX = ref.value - dragging.w;
        }
    }

    // Check horizontal edges (top/bottom of dragged widget)
    const dragTop = dragging.y;
    const dragBottom = dragging.y + dragging.h;
    for (const ref of referenceEdges) {
        if (ref.direction !== 'horizontal') continue;

        const dTop = Math.abs(dragTop - ref.value);
        const dBottom = Math.abs(dragBottom - ref.value);

        if (dTop <= threshold && dTop < bestDy) {
            bestDy = dTop;
            snapY = ref.value;
        }
        if (dBottom <= threshold && dBottom < bestDy) {
            bestDy = dBottom;
            snapY = ref.value - dragging.h;
        }
    }

    // Build guide lines for the snapped edges
    if (snapX !== null) {
        // Check which edge snapped (left or right)
        const snappedLeft = snapX;
        const snappedRight = snapX + dragging.w;
        for (const ref of referenceEdges) {
            if (ref.direction !== 'vertical') continue;
            if (Math.abs(snappedLeft - ref.value) <= ALIGNED_TOLERANCE) {
                guides.push({ direction: 'vertical', value: ref.value });
            }
            if (Math.abs(snappedRight - ref.value) <= ALIGNED_TOLERANCE) {
                guides.push({ direction: 'vertical', value: ref.value });
            }
        }
    }
    if (snapY !== null) {
        const snappedTop = snapY;
        const snappedBottom = snapY + dragging.h;
        for (const ref of referenceEdges) {
            if (ref.direction !== 'horizontal') continue;
            if (Math.abs(snappedTop - ref.value) <= ALIGNED_TOLERANCE) {
                guides.push({ direction: 'horizontal', value: ref.value });
            }
            if (Math.abs(snappedBottom - ref.value) <= ALIGNED_TOLERANCE) {
                guides.push({ direction: 'horizontal', value: ref.value });
            }
        }
    }

    // Deduplicate guides
    const uniqueGuides = guides.filter(
        (g, i, arr) => arr.findIndex((g2) => g2.direction === g.direction && g2.value === g.value) === i
    );

    return {
        x: snapX ?? dragging.x,
        y: snapY ?? dragging.y,
        guides: uniqueGuides,
    };
}

/**
 * Computes snapped position for a widget being resized.
 * Only the edges being dragged are snapped.
 */
export function computeSnappedResize(
    rect: { x: number; y: number; w: number; h: number },
    handle: string,
    others: WidgetRect[],
    canvasWidth: number,
    minWidth: number,
    minHeight: number,
    threshold = DEFAULT_SNAP_THRESHOLD
): ResizeSnapResult {
    const referenceEdges: Edge[] = [
        ...collectCanvasEdges(canvasWidth),
        ...others.flatMap((r) => collectEdges(r)),
    ];

    let { x, y, w, h } = rect;
    const guides: SnapGuide[] = [];

    const isLeft = handle.includes('left');
    const isRight = handle.includes('right');
    const isTop = handle.includes('top');
    const isBottom = handle.includes('bottom');

    // Snap the specific edge being resized
    if (isLeft) {
        const leftEdge = x;
        for (const ref of referenceEdges) {
            if (ref.direction !== 'vertical') continue;
            if (Math.abs(leftEdge - ref.value) <= threshold) {
                const newW = w + (x - ref.value);
                if (newW >= minWidth) {
                    x = ref.value;
                    w = newW;
                    guides.push({ direction: 'vertical', value: ref.value });
                }
                break;
            }
        }
    }
    if (isRight) {
        const rightEdge = x + w;
        for (const ref of referenceEdges) {
            if (ref.direction !== 'vertical') continue;
            if (Math.abs(rightEdge - ref.value) <= threshold) {
                const newW = ref.value - x;
                if (newW >= minWidth) {
                    w = newW;
                    guides.push({ direction: 'vertical', value: ref.value });
                }
                break;
            }
        }
    }
    if (isTop) {
        const topEdge = y;
        for (const ref of referenceEdges) {
            if (ref.direction !== 'horizontal') continue;
            if (Math.abs(topEdge - ref.value) <= threshold) {
                const newH = h + (y - ref.value);
                if (newH >= minHeight) {
                    y = ref.value;
                    h = newH;
                    guides.push({ direction: 'horizontal', value: ref.value });
                }
                break;
            }
        }
    }
    if (isBottom) {
        const bottomEdge = y + h;
        for (const ref of referenceEdges) {
            if (ref.direction !== 'horizontal') continue;
            if (Math.abs(bottomEdge - ref.value) <= threshold) {
                const newH = ref.value - y;
                if (newH >= minHeight) {
                    h = newH;
                    guides.push({ direction: 'horizontal', value: ref.value });
                }
                break;
            }
        }
    }

    // Enforce minimums
    if (w < minWidth) w = minWidth;
    if (h < minHeight) h = minHeight;

    const uniqueGuides = guides.filter(
        (g, i, arr) => arr.findIndex((g2) => g2.direction === g.direction && g2.value === g.value) === i
    );

    return { rect: { x, y, w, h }, guides: uniqueGuides };
}

/**
 * Find all widget edges aligned with a given coordinate value.
 * Used for shift-key group resize.
 */
export function findAlignedEdges(
    edgeValue: number,
    direction: EdgeDirection,
    allWidgets: WidgetRect[],
    excludeId: string,
    tolerance = ALIGNED_TOLERANCE
): AlignedEdge[] {
    const result: AlignedEdge[] = [];

    for (const widget of allWidgets) {
        if (widget.id === excludeId) continue;

        if (direction === 'vertical') {
            if (Math.abs(widget.x - edgeValue) <= tolerance) {
                result.push({ widgetId: widget.id, edge: 'left' });
            }
            if (Math.abs(widget.x + widget.w - edgeValue) <= tolerance) {
                result.push({ widgetId: widget.id, edge: 'right' });
            }
        } else {
            if (Math.abs(widget.y - edgeValue) <= tolerance) {
                result.push({ widgetId: widget.id, edge: 'top' });
            }
            if (Math.abs(widget.y + widget.h - edgeValue) <= tolerance) {
                result.push({ widgetId: widget.id, edge: 'bottom' });
            }
        }
    }

    return result;
}
