'use client';

import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { db } from '@/lib/db';
import {
    formatDateKeyUTC,
    getAssignedMembersForChoreOnDate,
    getMemberCompletionForDate,
} from '@family-organizer/shared-core';
import { addUtcDays, buildDueLabel } from '@/lib/dashboard-utils';
import type { WidgetProps } from './types';
import { registerWidget } from './widget-store';

const UPCOMING_LOOKAHEAD_DAYS = 3;

type UpcomingChore = {
    key: string;
    title: string;
    dueDate: Date;
    dueLabel: string;
    isUpForGrabs: boolean;
};

function UpcomingChoresWidget({ memberId, todayUtc }: WidgetProps) {
    const [expanded, setExpanded] = useState(false);

    const { data } = db.useQuery({
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            completions: { completedBy: {} },
        },
    });

    const upcomingChores = useMemo(() => {
        const chores = (data?.chores || []) as any[];
        const items: UpcomingChore[] = [];

        for (let offset = 1; offset <= UPCOMING_LOOKAHEAD_DAYS; offset++) {
            const futureDate = addUtcDays(todayUtc, offset);
            const futureDateKey = formatDateKeyUTC(futureDate);

            chores.forEach((chore) => {
                const assignedMembers = getAssignedMembersForChoreOnDate(chore, futureDate);
                if (!assignedMembers.some((m) => m.id === memberId)) return;

                const memberCompletion = getMemberCompletionForDate(chore, memberId, futureDate);
                if (memberCompletion?.completed) return;

                items.push({
                    key: `${chore.id}:${futureDateKey}`,
                    title: chore.title || 'Untitled chore',
                    dueDate: futureDate,
                    dueLabel: buildDueLabel(futureDate, todayUtc),
                    isUpForGrabs: !!chore.isUpForGrabs,
                });
            });
        }

        return items.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    }, [data?.chores, memberId, todayUtc]);

    if (upcomingChores.length === 0) return null;

    return (
        <section className="rounded-xl border border-slate-200 bg-white/95 shadow-sm">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center justify-between px-3 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600 hover:bg-slate-50 transition-colors rounded-xl"
            >
                <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Upcoming Chores ({upcomingChores.length})
                </div>
                <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                />
            </button>

            <div
                className={`overflow-hidden transition-all duration-300 ${
                    expanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                }`}
            >
                <ul className="space-y-1.5 px-3 pb-3">
                    {upcomingChores.map((chore) => (
                        <li
                            key={chore.key}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                                chore.isUpForGrabs
                                    ? 'border-amber-200 bg-amber-50/50'
                                    : 'border-slate-200 bg-white'
                            }`}
                        >
                            <span className="truncate text-slate-900">{chore.title}</span>
                            <span className="ml-2 shrink-0 text-[10px] font-semibold text-slate-500">
                                {chore.dueLabel}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

const UPCOMING_CHORES_META = {
    id: 'upcoming-chores',
    label: 'Upcoming Chores',
    icon: CalendarDays,
    defaultSize: { colSpan: 1 as const },
    defaultEnabled: true,
    defaultOrder: 7,
    description: 'Chores due in the next few days (collapsible)',
};

registerWidget({ meta: UPCOMING_CHORES_META, component: UpcomingChoresWidget });
