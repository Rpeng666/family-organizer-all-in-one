import type { WidgetRect } from './types';

/**
 * Proportionally scales a set of widget rects from one canvas size to another.
 * Preserves relative positions and sizes.
 */
export function scaleLayout(
    widgets: WidgetRect[],
    sourceWidth: number,
    targetWidth: number,
    sourceHeight: number,
    targetHeight: number
): Omit<WidgetRect, 'id'>[] {
    if (sourceWidth === 0 || sourceHeight === 0) return widgets;

    const xScale = targetWidth / sourceWidth;
    const yScale = targetHeight / sourceHeight;

    return widgets.map((w) => ({
        x: Math.round(w.x * xScale),
        y: Math.round(w.y * yScale),
        w: Math.round(w.w * xScale),
        h: Math.round(w.h * yScale),
        z: w.z,
    }));
}
