import type { BreakpointDef, DashboardLayoutRecord } from './types';

export const DEFAULT_BREAKPOINTS: BreakpointDef[] = [
    { breakpointKey: 'phone-portrait', label: 'Phone', minWidth: 0, maxWidth: 480, order: 0, isDefault: true },
    { breakpointKey: 'tablet-portrait', label: 'Tablet Portrait', minWidth: 480, maxWidth: 768, order: 1, isDefault: true },
    { breakpointKey: 'tablet-landscape', label: 'Tablet Landscape', minWidth: 768, maxWidth: 1024, order: 2, isDefault: true },
    { breakpointKey: 'desktop-small', label: 'Small Desktop', minWidth: 1024, maxWidth: 1440, order: 3, isDefault: true },
    { breakpointKey: 'desktop-large', label: 'Large Desktop', minWidth: 1440, maxWidth: 99999, order: 4, isDefault: true },
];

/**
 * Find the layout whose [minWidth, maxWidth) range contains the viewport width.
 * Falls back to the layout with the smallest minWidth if nothing matches.
 */
export function matchBreakpoint(
    viewportWidth: number,
    layouts: Pick<DashboardLayoutRecord, 'id' | 'breakpointKey' | 'minWidth' | 'maxWidth'>[]
): typeof layouts[number] | undefined {
    // Sort by minWidth ascending so we can do a simple range check
    const sorted = [...layouts].sort((a, b) => a.minWidth - b.minWidth);

    for (const layout of sorted) {
        if (viewportWidth >= layout.minWidth && viewportWidth < layout.maxWidth) {
            return layout;
        }
    }

    // Fallback: return the largest breakpoint
    return sorted[sorted.length - 1];
}

/**
 * Returns the default breakpoint definition for a given key.
 */
export function getDefaultBreakpoint(key: string): BreakpointDef | undefined {
    return DEFAULT_BREAKPOINTS.find((bp) => bp.breakpointKey === key);
}
