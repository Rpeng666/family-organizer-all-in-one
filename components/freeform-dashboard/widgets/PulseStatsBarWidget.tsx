'use client';

import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { db } from '@/lib/db';
import { registerFreeformWidget } from '@/lib/freeform-dashboard/freeform-widget-registry';
import type { FreeformWidgetProps } from '@/lib/freeform-dashboard/types';
import {
    formatDateKeyUTC,
    getAssignedMembersForChoreOnDate,
    getCompletedChoreCompletionsForDate,
} from '@family-organizer/shared-core';
import { addUtcDays } from '@/lib/dashboard-utils';
import { useWidgetScale } from '@/lib/freeform-dashboard/widget-scale';

function PulseStatsBarWidget({ width, height, todayUtc }: FreeformWidgetProps) {
    const { data } = db.useQuery({
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            completions: { completedBy: {} },
        },
        calendarItems: {},
        messageThreads: {},
    });

    const stats = useMemo(() => {
        const chores = (data?.chores ?? []) as any[];
        const calendarItems = (data?.calendarItems ?? []) as any[];
        const threads = (data?.messageThreads ?? []) as any[];

        const todayKey = formatDateKeyUTC(todayUtc);

        let totalChores = 0;
        let completedChores = 0;
        let tasksInProgress = 0;

        for (const chore of chores) {
            if (!chore.rrule || !chore.startDate) continue;
            const assigned = getAssignedMembersForChoreOnDate(chore as Parameters<typeof getAssignedMembersForChoreOnDate>[0], todayUtc);
            if (assigned.length > 0) {
                totalChores++;
                const completions = (getCompletedChoreCompletionsForDate as any)(
                    chore.completions ?? [],
                    todayKey
                );
                if (completions.length > 0) completedChores++;
            }
        }

        // Calendar events today
        const todayEnd = addUtcDays(todayUtc, 1);
        const eventsToday = calendarItems.filter((item) => {
            const start = new Date(item.startDate);
            return start >= todayUtc && start < todayEnd;
        }).length;

        // Unread messages (simplified: count threads with recent messages)
        const unreadThreads = threads.filter((t) => {
            const key = (t as Record<string, unknown>).threadKey;
            return key === 'family' && (t as Record<string, unknown>).latestMessageAt;
        }).length;

        return {
            totalChores,
            completedChores,
            tasksInProgress,
            eventsToday,
            unreadThreads,
        };
    }, [data, todayUtc]);

    const { s, sv } = useWidgetScale();

    return (
        <div className="flex h-full items-center" style={{ gap: s(16), paddingLeft: s(16), paddingRight: s(16), fontSize: sv(14), color: 'var(--fd-ink-muted)' }}>
            <span className="font-medium" style={{ color: 'var(--fd-ink)' }}>
                {stats.completedChores}/{stats.totalChores} chores done
            </span>
            <span style={{ color: 'var(--fd-line)' }}>·</span>
            <span>{stats.eventsToday} events today</span>
            {width > s(500) && (
                <>
                    <span style={{ color: 'var(--fd-line)' }}>·</span>
                    <span>{stats.unreadThreads > 0 ? `${stats.unreadThreads} unread` : 'No unread messages'}</span>
                </>
            )}
        </div>
    );
}

registerFreeformWidget({
    meta: {
        type: 'pulse-stats-bar',
        label: 'Pulse Stats',
        icon: Activity,
        description: 'Quick summary of today\'s activity across the family',
        minWidth: 400,
        minHeight: 48,
        defaultWidth: 800,
        defaultHeight: 48,
        allowMultiple: false,
    },
    component: PulseStatsBarWidget,
});

export default PulseStatsBarWidget;
