'use client';

import React, { useEffect } from 'react';
import { useActiveDashboardTheme } from '@/lib/freeform-dashboard/DashboardThemeContext';
import { DASHBOARD_THEMES } from '@/lib/freeform-dashboard/dashboard-theme';

function getCanvasColor(themeId: string): string {
    const def = DASHBOARD_THEMES.find((t) => t.id === themeId);
    return def?.previewColors[0] ?? '#f1f3f8';
}

function getPanelColor(themeId: string): string {
    const def = DASHBOARD_THEMES.find((t) => t.id === themeId);
    return def?.previewColors[1] ?? '#ffffff';
}

export function ThemedSidebar({ children }: { children: React.ReactNode }) {
    const { activeTheme } = useActiveDashboardTheme();
    const themeClass = activeTheme ? `fd-${activeTheme}` : '';

    return (
        <aside
            className={`flex h-screen w-60 shrink-0 flex-col border-r transition-colors duration-300 ${activeTheme ? themeClass : 'bg-secondary'}`}
            style={
                activeTheme
                    ? {
                          backgroundColor: 'var(--fd-panel)',
                          borderColor: 'var(--fd-line)',
                          color: 'var(--fd-ink)',
                      }
                    : { borderColor: 'hsl(var(--border) / 0.5)' }
            }
            data-dashboard-theme={activeTheme ?? undefined}
        >
            {children}
        </aside>
    );
}

export function ThemedMain({ children }: { children: React.ReactNode }) {
    const { activeTheme } = useActiveDashboardTheme();
    const themeClass = activeTheme ? `fd-${activeTheme}` : '';

    useEffect(() => {
        if (!activeTheme) return;

        const html = document.documentElement;
        const body = document.body;

        const prev = {
            htmlBg: html.style.backgroundColor,
            bodyBg: body.style.backgroundColor,
            bodyHeight: body.style.height,
            bodyOverflow: body.style.overflow,
        };

        html.style.backgroundColor = getPanelColor(activeTheme);
        body.style.backgroundColor = getCanvasColor(activeTheme);
        body.style.height = '100dvh';
        body.style.overflow = 'hidden';

        return () => {
            html.style.backgroundColor = prev.htmlBg;
            body.style.backgroundColor = prev.bodyBg;
            body.style.height = prev.bodyHeight;
            body.style.overflow = prev.bodyOverflow;
        };
    }, [activeTheme]);

    return (
        <main
            className={`flex-1 min-h-0 min-w-0 relative overflow-y-auto ${themeClass}`}
            style={activeTheme ? { backgroundColor: 'var(--fd-canvas)' } : undefined}
        >
            {children}
        </main>
    );
}
