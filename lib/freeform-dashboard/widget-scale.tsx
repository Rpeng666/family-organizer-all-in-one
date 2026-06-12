'use client';

import React, { createContext, useContext, useMemo } from 'react';

/**
 * Widget scale context — provides a scale factor that widgets use
 * to size avatars, text, spacing, and SVG elements proportionally.
 *
 * The scale factor is derived solely from the user-defined `contentScale`
 * config value. Widget resize does NOT affect content scale — the two
 * are independently controllable.
 */

interface WidgetScaleContextValue {
    /** The computed scale factor (1 = default size). */
    scale: number;
    /** Convenience: returns `value * scale` rounded to nearest integer. */
    s: (px: number) => number;
    /** Returns a CSS value string e.g. `"14.4px"`. */
    sv: (px: number) => string;
}

const WidgetScaleContext = createContext<WidgetScaleContextValue>({
    scale: 1,
    s: (px) => px,
    sv: (px) => `${px}px`,
});

interface WidgetScaleProviderProps {
    /** Actual rendered width in px. */
    width: number;
    /** Actual rendered height in px. */
    height: number;
    /** Reference/default width from widget meta. */
    refWidth: number;
    /** Reference/default height from widget meta. */
    refHeight: number;
    /** Optional user-defined content scale multiplier (0.5–3). */
    contentScale?: number;
    children: React.ReactNode;
}

export function WidgetScaleProvider({
    width,
    height,
    refWidth,
    refHeight,
    contentScale,
    children,
}: WidgetScaleProviderProps) {
    // Content scale is now purely user-controlled (no automatic sizing from dimensions)
    const cs = contentScale !== undefined && contentScale > 0 ? contentScale : 1;

    const value = useMemo<WidgetScaleContextValue>(
        () => ({
            scale: cs,
            s: (px: number) => Math.round(px * cs),
            sv: (px: number) => `${px * cs}px`,
        }),
        [cs]
    );

    return (
        <WidgetScaleContext.Provider value={value}>
            <div
                className="h-full w-full overflow-hidden"
                style={{
                    '--widget-scale': cs,
                } as React.CSSProperties}
            >
                {children}
            </div>
        </WidgetScaleContext.Provider>
    );
}

/**
 * Returns the current widget scale factor and helpers.
 *
 * - `scale` — raw multiplier (1 = default size)
 * - `s(px)` — scale a pixel value, returns rounded integer
 * - `sv(px)` — scale a pixel value, returns CSS string e.g. `"14.4px"`
 */
export function useWidgetScale(): WidgetScaleContextValue {
    return useContext(WidgetScaleContext);
}
