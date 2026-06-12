'use client';

import { useCallback, useEffect, useState } from 'react';

export type DashboardViewMode = 'personal' | 'family';

export const DASHBOARD_VIEW_MODE_STORAGE_KEY = 'dashboard-view-mode';
export const DASHBOARD_VIEW_MODE_EVENT = 'dashboard:view-mode-change';

function normalizeDashboardViewMode(value: unknown): DashboardViewMode {
    return value === 'family' ? 'family' : 'personal';
}

export function getDashboardViewMode(): DashboardViewMode {
    if (typeof window === 'undefined') {
        return 'personal';
    }

    return normalizeDashboardViewMode(window.localStorage.getItem(DASHBOARD_VIEW_MODE_STORAGE_KEY));
}

export function setDashboardViewMode(nextMode: DashboardViewMode) {
    if (typeof window === 'undefined') {
        return;
    }

    window.localStorage.setItem(DASHBOARD_VIEW_MODE_STORAGE_KEY, nextMode);
    window.dispatchEvent(new CustomEvent<DashboardViewMode>(DASHBOARD_VIEW_MODE_EVENT, { detail: nextMode }));
}

export function useDashboardViewMode() {
    const [viewMode, setViewMode] = useState<DashboardViewMode>('personal');

    useEffect(() => {
        const sync = () => {
            setViewMode(getDashboardViewMode());
        };

        sync();

        const onStorage = (event: StorageEvent) => {
            if (event.key && event.key !== DASHBOARD_VIEW_MODE_STORAGE_KEY) return;
            sync();
        };
        const onCustom = () => sync();

        window.addEventListener('storage', onStorage);
        window.addEventListener(DASHBOARD_VIEW_MODE_EVENT, onCustom as EventListener);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(DASHBOARD_VIEW_MODE_EVENT, onCustom as EventListener);
        };
    }, []);

    const updateViewMode = useCallback((nextMode: DashboardViewMode) => {
        setDashboardViewMode(nextMode);
        setViewMode(nextMode);
    }, []);

    return [viewMode, updateViewMode] as const;
}
