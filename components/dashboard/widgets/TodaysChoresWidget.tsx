'use client';

import React, { useMemo } from 'react';
import { CheckCircle2, Gift } from 'lucide-react';
import { db } from '@/lib/db';
import {
    getAssignedMembersForChoreOnDate,
    getCompletedChoreCompletionsForDate,
    getMemberCompletionForDate,
} from '@family-organizer/shared-core';
import { completionMemberId, type DashboardChoreCompletion } from '@/lib/dashboard-utils';
import type { WidgetProps } from './types';
import { registerWidget } from './widget-store';
import WidgetShell from './WidgetShell';

type PersonalChore = {
    id: string;
    title: string;
    weight: number;
    isCompleted: boolean;
    isUpForGrabs: boolean;
    claimedByOther: boolean;
};

function TodaysChoresWidget({ memberId, todayUtc }: WidgetProps) {
    const { data } = db.useQuery({
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            completions: { completedBy: {} },
        },
    });

    const { assignedChores, upForGrabsChores, completedCount, totalCount } = useMemo(() => {
        const chores = (data?.chores || []) as any[];
        const assigned: PersonalChore[] = [];
        const upForGrabs: PersonalChore[] = [];
        let completed = 0;

        chores.forEach((chore) => {
            const assignedMembers = getAssignedMembersForChoreOnDate(chore, todayUtc);
            if (!assignedMembers.some((m) => m.id === memberId)) return;

            const memberCompletion = getMemberCompletionForDate(chore, memberId, todayUtc);
            const isCompleted = !!memberCompletion?.completed;

            const completionsOnDate = getCompletedChoreCompletionsForDate(chore, todayUtc) as DashboardChoreCompletion[];
            const firstCompleterId = completionMemberId(completionsOnDate.find((c) => completionMemberId(c)));
            const claimedByOther = !!(chore.isUpForGrabs && firstCompleterId && firstCompleterId !== memberId);

            if (isCompleted) completed += 1;

            const entry: PersonalChore = {
                id: chore.id,
                title: chore.title || 'Untitled chore',
                weight: Number(chore.weight || 0),
                isCompleted,
                isUpForGrabs: !!chore.isUpForGrabs,
                claimedByOther,
            };

            if (chore.isUpForGrabs) {
                upForGrabs.push(entry);
            } else {
                assigned.push(entry);
            }
        });

        return {
            assignedChores: assigned.sort((a, b) => a.title.localeCompare(b.title)),
            upForGrabsChores: upForGrabs.sort((a, b) => a.title.localeCompare(b.title)),
            completedCount: completed,
            totalCount: assigned.length + upForGrabs.length,
        };
    }, [data?.chores, memberId, todayUtc]);

    return (
        <WidgetShell
            meta={TODAYS_CHORES_META}
            headerRight={
                <span className="text-[10px] font-normal normal-case text-slate-500">
                    {completedCount}/{totalCount} done
                </span>
            }
        >
            {assignedChores.length === 0 && upForGrabsChores.length === 0 ? (
                <p className="text-sm text-slate-500">No chores assigned for today.</p>
            ) : (
                <>
                    {assignedChores.length > 0 && (
                        <ul className="space-y-1.5">
                            {assignedChores.map((chore) => (
                                <li
                                    key={chore.id}
                                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                                        chore.isCompleted
                                            ? 'border-emerald-200 bg-emerald-50/50 text-slate-500 line-through'
                                            : 'border-slate-200 bg-white text-slate-900'
                                    }`}
                                >
                                    <span className="truncate">{chore.title}</span>
                                    {chore.weight > 0 && (
                                        <span className="ml-2 shrink-0 text-[10px] font-semibold text-slate-400">
                                            {chore.weight} XP
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    {upForGrabsChores.length > 0 && (
                        <div className={assignedChores.length > 0 ? 'mt-3' : ''}>
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                <Gift className="h-3.5 w-3.5" />
                                Available to Claim
                            </div>
                            <ul className="mt-1.5 space-y-1.5">
                                {upForGrabsChores.map((chore) => (
                                    <li
                                        key={chore.id}
                                        className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                                            chore.isCompleted
                                                ? 'border-emerald-200 bg-emerald-50/50 text-slate-500 line-through'
                                                : chore.claimedByOther
                                                    ? 'border-slate-200 bg-slate-50 text-slate-400'
                                                    : 'border-amber-200 bg-amber-50/50 text-slate-900'
                                        }`}
                                    >
                                        <span className="truncate">
                                            {chore.title}
                                            {chore.claimedByOther && (
                                                <span className="ml-1.5 text-[10px] text-slate-400">(claimed)</span>
                                            )}
                                        </span>
                                        {chore.weight > 0 && (
                                            <span className="ml-2 shrink-0 text-[10px] font-semibold text-amber-500">
                                                {chore.weight} XP
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </WidgetShell>
    );
}

const TODAYS_CHORES_META = {
    id: 'todays-chores',
    label: "Today's Chores",
    icon: CheckCircle2,
    defaultSize: { colSpan: 1 as const },
    defaultEnabled: true,
    defaultOrder: 1,
    description: 'Assigned and up-for-grabs chores for today',
};

registerWidget({ meta: TODAYS_CHORES_META, component: TodaysChoresWidget });
