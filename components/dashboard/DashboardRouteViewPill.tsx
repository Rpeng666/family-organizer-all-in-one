'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowRightLeft } from 'lucide-react';
import { useDashboardViewMode } from '@/lib/dashboard-view-mode';
import { useActiveDashboardTheme } from '@/lib/freeform-dashboard/DashboardThemeContext';

export default function DashboardRouteViewPill() {
    const pathname = usePathname();
    const [viewMode, setViewMode] = useDashboardViewMode();
    const { activeTheme } = useActiveDashboardTheme();
    const isDark = activeTheme === 'dark';

    const isDashboardRoute = pathname === '/';
    const label = useMemo(
        () => (viewMode === 'family' ? 'Personal View' : 'Family View'),
        [viewMode]
    );

    if (!isDashboardRoute) {
        return null;
    }

    return (
        <button
            type="button"
            onClick={() => setViewMode(viewMode === 'family' ? 'personal' : 'family')}
            className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-sm transition-colors ${
                isDark
                    ? 'border-[var(--fd-line)] bg-[var(--fd-panel-elevated)] text-[var(--fd-ink)] hover:bg-[var(--fd-surface-muted)]'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
        >
            <ArrowRightLeft className={`h-3.5 w-3.5 ${isDark ? 'text-[var(--fd-ink-muted)]' : 'text-slate-500'}`} />
            <span>{label}</span>
        </button>
    );
}
