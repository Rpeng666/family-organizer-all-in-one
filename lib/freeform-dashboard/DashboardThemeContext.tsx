'use client';

import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import type { DashboardTheme } from './dashboard-theme';

interface DashboardThemeContextValue {
    /** The currently active dashboard theme, or null when not on the dashboard route */
    activeTheme: DashboardTheme | null;
    /** Called by FreeformDashboard to broadcast its theme to the layout shell */
    setActiveTheme: (theme: DashboardTheme | null) => void;
}

const Ctx = createContext<DashboardThemeContextValue>({
    activeTheme: null,
    setActiveTheme: () => {},
});

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
    const [activeTheme, setActiveThemeRaw] = useState<DashboardTheme | null>(null);

    const setActiveTheme = useCallback((t: DashboardTheme | null) => {
        setActiveThemeRaw(t);
    }, []);

    const value = useMemo(
        () => ({ activeTheme, setActiveTheme }),
        [activeTheme, setActiveTheme],
    );

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useActiveDashboardTheme() {
    return useContext(Ctx);
}
