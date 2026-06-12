'use client';

import React, { useMemo } from 'react';
import { Activity, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/db';
import { formatDateKeyUTC } from '@family-organizer/shared-core';
import { completionMemberId, formatTimeAgo, type DashboardChoreCompletion } from '@/lib/dashboard-utils';
import type { WidgetProps } from './types';
import { registerWidget } from './widget-store';
import WidgetShell from './WidgetShell';

type ActivityItem = {
    key: string;
    label: string;
    timestamp: string;
};

function RecentActivityWidget({ memberId, todayUtc }: WidgetProps) {
    const todayKey = useMemo(() => formatDateKeyUTC(todayUtc), [todayUtc]);

    const { data } = db.useQuery({
        chores: {
            completions: { completedBy: {} },
        },
    });

    const recentActivity = useMemo(() => {
        const chores = (data?.chores || []) as any[];
        const items: ActivityItem[] = [];

        chores.forEach((chore) => {
            ((chore.completions || []) as DashboardChoreCompletion[]).forEach((completion) => {
                if (!completion.completed) return;
                const cMemberId = completionMemberId(completion);
                if (cMemberId !== memberId) return;

                const dateDue = completion.dateDue || '';
                if (dateDue !== todayKey) return;

                items.push({
                    key: `completion:${completion.id}`,
                    label: `Completed "${chore.title || 'chore'}"`,
                    timestamp: completion.dateCompleted || dateDue,
                });
            });
        });

        return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6);
    }, [data?.chores, memberId, todayKey]);

    if (recentActivity.length === 0) return null;

    return (
        <WidgetShell meta={RECENT_ACTIVITY_META}>
            <ul className="space-y-1.5">
                {recentActivity.map((item) => (
                    <li key={item.key} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                        <div className="flex items-center gap-2 min-w-0">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            <span className="truncate">{item.label}</span>
                        </div>
                        <span className="shrink-0 text-[10px] text-slate-400">{formatTimeAgo(item.timestamp)}</span>
                    </li>
                ))}
            </ul>
        </WidgetShell>
    );
}

const RECENT_ACTIVITY_META = {
    id: 'recent-activity',
    label: 'Recent Activity',
    icon: Activity,
    defaultSize: { colSpan: 1 as const },
    defaultEnabled: true,
    defaultOrder: 8,
    description: "Today's chore completions",
};

registerWidget({ meta: RECENT_ACTIVITY_META, component: RecentActivityWidget });
