'use client';

import { useState, useEffect } from 'react';
import { matchBreakpoint } from './breakpoint-utils';
import type { DashboardLayoutRecord } from './types';

/**
 * Returns the active breakpoint based on current viewport width.
 * Re-evaluates on window resize.
 */
export function useActiveBreakpoint(
    layouts: Pick<DashboardLayoutRecord, 'id' | 'breakpointKey' | 'minWidth' | 'maxWidth'>[]
) {
    const [viewportWidth, setViewportWidth] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth : 1440
    );

    useEffect(() => {
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const matched = layouts.length > 0 ? matchBreakpoint(viewportWidth, layouts) : undefined;

    return { activeBreakpoint: matched, viewportWidth };
}
