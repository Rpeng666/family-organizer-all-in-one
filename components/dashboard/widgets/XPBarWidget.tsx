'use client';

import React, { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { db } from '@/lib/db';
import {
    calculateDailyXP,
    localDateToUTC,
} from '@family-organizer/shared-core';
import type { WidgetProps } from './types';
import { registerWidget } from './widget-store';
import WidgetShell from './WidgetShell';

function XPBarWidget({ memberId, todayUtc }: WidgetProps) {
    const { data } = db.useQuery({
        familyMembers: { $: { order: { order: 'asc' } } },
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            completions: { completedBy: {} },
        },
    });

    const xp = useMemo(() => {
        if (!data?.chores || !data?.familyMembers) return { current: 0, possible: 0 };
        const xpByMember = calculateDailyXP(data.chores as any, data.familyMembers as any, todayUtc);
        return xpByMember[memberId] || { current: 0, possible: 0 };
    }, [data?.chores, data?.familyMembers, memberId, todayUtc]);

    const xpPercent = xp.possible > 0 ? Math.round((xp.current / xp.possible) * 100) : 0;

    return (
        <WidgetShell
            meta={XP_BAR_META}
            headerRight={
                <span className="text-xs font-semibold text-slate-900">{xp.current}/{xp.possible}</span>
            }
        >
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                    style={{ width: `${xpPercent}%` }}
                />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">{xpPercent}% complete</p>
        </WidgetShell>
    );
}

const XP_BAR_META = {
    id: 'xp-bar',
    label: 'Daily XP',
    icon: Zap,
    defaultSize: { colSpan: 1 as const },
    defaultEnabled: false,
    defaultOrder: 0,
    description: 'Daily XP progress bar',
};

registerWidget({ meta: XP_BAR_META, component: XPBarWidget });
