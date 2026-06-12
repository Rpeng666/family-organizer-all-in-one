import { describe, expect, it } from 'vitest';
import { getCalendarYearEventSizing } from '@/lib/calendar-controls';

describe('calendar year event sizing', () => {
    it('shrinks chip dimensions below the old year-view floor for tiny font scales', () => {
        const tiny = getCalendarYearEventSizing(0.08);

        expect(tiny.chipHeightPx).toBe(4);
        expect(tiny.inlinePaddingPx).toBe(1);
        expect(tiny.borderRadiusPx).toBe(2);
        expect(tiny.borderWidthPx).toBe(0.5);
    });

    it('preserves the current sizing at the previous top end and expands beyond it for larger scales', () => {
        const legacyMax = getCalendarYearEventSizing(1);
        const expanded = getCalendarYearEventSizing(2);

        expect(legacyMax.chipHeightPx).toBe(14);
        expect(legacyMax.inlinePaddingPx).toBe(4);
        expect(legacyMax.borderRadiusPx).toBe(6);

        expect(expanded.chipHeightPx).toBeGreaterThan(legacyMax.chipHeightPx);
        expect(expanded.inlinePaddingPx).toBeGreaterThan(legacyMax.inlinePaddingPx);
        expect(expanded.borderRadiusPx).toBeGreaterThan(legacyMax.borderRadiusPx);
    });
});
