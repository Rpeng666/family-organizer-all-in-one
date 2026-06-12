'use client';

import React, { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { getWidget } from './widgets/registry';

const GAP = 12;

function getColumnCount(width: number): number {
    if (width >= 1280) return 4;
    if (width >= 960) return 3;
    if (width >= 640) return 2;
    return 1;
}

interface WidgetGridProps {
    memberId: string;
    todayUtc: Date;
    enabledWidgetIds: string[];
    /** Rendered as the first item in the grid (e.g. dashboard header). */
    headerSlot?: React.ReactNode;
    /** Column span for the header slot. Defaults to 3. */
    headerSpan?: 1 | 2 | 3;
}

export default function WidgetGrid({
    memberId,
    todayUtc,
    enabledWidgetIds,
    headerSlot,
    headerSpan = 3,
}: WidgetGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerHeight, setContainerHeight] = useState(0);
    const [ready, setReady] = useState(false);

    const doLayout = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        const containerWidth = container.clientWidth;
        if (containerWidth === 0) return;

        const cols = getColumnCount(containerWidth);
        const colWidth = (containerWidth - GAP * (cols - 1)) / cols;
        const colHeights = new Array(cols).fill(0);

        const items = Array.from(container.children) as HTMLElement[];

        items.forEach((item) => {
            const requestedSpan = parseInt(item.dataset.span || '1', 10);
            const span = Math.min(requestedSpan, cols);

            // Set width so content flows to natural height
            const itemWidth = colWidth * span + GAP * (span - 1);
            item.style.position = 'absolute';
            item.style.width = `${itemWidth}px`;

            // Measure natural height from inner content wrapper
            const content = item.firstElementChild as HTMLElement | null;
            const height = content ? content.offsetHeight : item.offsetHeight;

            // Find the set of adjacent columns with the lowest max height
            let bestCol = 0;
            let bestMaxH = Infinity;
            for (let c = 0; c <= cols - span; c++) {
                const maxH = Math.max(...colHeights.slice(c, c + span));
                if (maxH < bestMaxH) {
                    bestMaxH = maxH;
                    bestCol = c;
                }
            }

            item.style.left = `${bestCol * (colWidth + GAP)}px`;
            item.style.top = `${bestMaxH}px`;

            for (let c = bestCol; c < bestCol + span; c++) {
                colHeights[c] = bestMaxH + height + GAP;
            }
        });

        const totalHeight = Math.max(0, ...colHeights);
        setContainerHeight(totalHeight);
        if (!ready) setReady(true);
    }, [ready]);

    // Run layout synchronously before paint on every render
    useLayoutEffect(() => {
        doLayout();
    });

    // Re-layout when container or content sizes change
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let rafId = 0;
        const scheduleLayout = () => {
            cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(doLayout);
        };

        const ro = new ResizeObserver(scheduleLayout);
        ro.observe(container);

        // Observe inner content wrappers for height changes (e.g. async data loads)
        container.querySelectorAll<HTMLElement>('[data-masonry-content]').forEach((el) => {
            ro.observe(el);
        });

        return () => {
            cancelAnimationFrame(rafId);
            ro.disconnect();
        };
    }, [doLayout, enabledWidgetIds, headerSlot]);

    // Build grid items
    const gridItems: { key: string; span: number; element: React.ReactNode }[] = [];

    if (headerSlot) {
        gridItems.push({ key: '__header__', span: headerSpan, element: headerSlot });
    }

    for (const widgetId of enabledWidgetIds) {
        const registration = getWidget(widgetId);
        if (!registration) continue;
        const Component = registration.component;
        gridItems.push({
            key: widgetId,
            span: registration.meta.defaultSize.colSpan,
            element: <Component memberId={memberId} todayUtc={todayUtc} />,
        });
    }

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                height: containerHeight || 'auto',
                opacity: ready ? 1 : 0,
                transition: 'opacity 100ms ease-in',
            }}
        >
            {gridItems.map((item) => (
                <div key={item.key} data-span={item.span}>
                    <div data-masonry-content="">
                        {item.element}
                    </div>
                </div>
            ))}
        </div>
    );
}
