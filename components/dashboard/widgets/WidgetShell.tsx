import React from 'react';
import type { WidgetMeta } from './types';

interface WidgetShellProps {
    meta: WidgetMeta;
    colSpan?: 1 | 2 | 3;
    children: React.ReactNode;
    className?: string;
    /** Custom border color class, e.g. 'border-indigo-200' */
    accentBorder?: string;
    /** Hide the default header (icon + label) */
    hideHeader?: boolean;
    /** Custom header content rendered after the label */
    headerRight?: React.ReactNode;
}

export default function WidgetShell({
    meta,
    colSpan = 1,
    children,
    className = '',
    accentBorder,
    hideHeader = false,
    headerRight,
}: WidgetShellProps) {
    const Icon = meta.icon;
    const borderClass = accentBorder || 'border-slate-200';

    return (
        <section
            className={`rounded-xl border ${borderClass} bg-white/95 p-3 shadow-sm ${className}`}
        >
            {!hideHeader && (
                <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                        <Icon className="h-4 w-4" />
                        {meta.label}
                    </div>
                    {headerRight}
                </div>
            )}
            {children}
        </section>
    );
}
