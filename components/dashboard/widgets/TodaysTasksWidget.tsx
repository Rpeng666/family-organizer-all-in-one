'use client';

import React, { useMemo } from 'react';
import { ListTodo } from 'lucide-react';
import { db } from '@/lib/db';
import { getAssignedMembersForChoreOnDate } from '@family-organizer/shared-core';
import { getTasksForDate, type Task } from '@/lib/task-scheduler';
import { hasScheduledChildren } from '@/lib/task-series-progress';
import { getTaskWorkflowState } from '@/lib/task-progress';
import { firstRef } from '@/lib/dashboard-utils';
import type { WidgetProps } from './types';
import { registerWidget } from './widget-store';
import WidgetShell from './WidgetShell';

type PersonalTaskGroup = {
    seriesId: string;
    seriesName: string;
    choreTitle: string;
    tasks: Array<{
        id: string;
        text: string;
        workflowState: string;
        isCompleted: boolean;
    }>;
};

const STATUS_TONE: Record<string, string> = {
    not_started: 'bg-slate-100 text-slate-700',
    in_progress: 'bg-amber-100 text-amber-800',
    blocked: 'bg-rose-100 text-rose-700',
    skipped: 'bg-zinc-100 text-zinc-600',
    needs_review: 'bg-violet-100 text-violet-700',
    done: 'bg-emerald-100 text-emerald-700',
};

function TodaysTasksWidget({ memberId, todayUtc }: WidgetProps) {
    const { data } = db.useQuery({
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            taskSeries: {
                tasks: { parentTask: {} },
                familyMember: {},
            },
        },
    });

    const taskGroups = useMemo(() => {
        const chores = (data?.chores || []) as any[];
        const groups: PersonalTaskGroup[] = [];

        chores.forEach((chore) => {
            const assignedMembers = getAssignedMembersForChoreOnDate(chore, todayUtc);
            if (!assignedMembers.some((m) => m.id === memberId)) return;

            const assignedIds = new Set(assignedMembers.map((m) => m.id));

            (chore.taskSeries || []).forEach((series: any) => {
                const allTasks = [...(series.tasks || [])].sort(
                    (a: Task, b: Task) => (a.order || 0) - (b.order || 0)
                );
                if (!allTasks.length) return;

                const owner = firstRef(series.familyMember);
                if (owner?.id && !assignedIds.has(owner.id)) return;
                if (owner?.id && owner.id !== memberId) return;

                const scheduledTasks = getTasksForDate(
                    allTasks,
                    chore.rrule || null,
                    chore.startDate,
                    todayUtc,
                    series.startDate || null,
                    chore.exdates || null
                );
                if (!scheduledTasks.length) return;

                const scheduledIds = new Set(scheduledTasks.map((t) => t.id));
                const actionableTasks = scheduledTasks.filter(
                    (t) => !hasScheduledChildren(t.id, scheduledIds, allTasks)
                );
                if (!actionableTasks.length) return;

                groups.push({
                    seriesId: series.id,
                    seriesName: series.name || 'Task series',
                    choreTitle: chore.title || 'Untitled chore',
                    tasks: actionableTasks.map((t) => ({
                        id: t.id,
                        text: t.text || '',
                        workflowState: getTaskWorkflowState(t as any),
                        isCompleted: !!t.isCompleted,
                    })),
                });
            });
        });

        return groups;
    }, [data?.chores, memberId, todayUtc]);

    if (taskGroups.length === 0) return null;

    return (
        <WidgetShell meta={TODAYS_TASKS_META}>
            <div className="max-h-[400px] space-y-3 overflow-y-auto">
                {taskGroups.map((group) => (
                    <div key={group.seriesId} className="rounded-lg border border-slate-200 p-3">
                        <p className="text-xs font-semibold text-slate-900">{group.seriesName}</p>
                        <p className="text-[10px] text-slate-500">{group.choreTitle}</p>

                        <ul className="mt-2 space-y-1">
                            {group.tasks.map((task) => (
                                <li
                                    key={task.id}
                                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                                        task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'
                                    }`}
                                >
                                    <span
                                        className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                                            STATUS_TONE[task.workflowState] || STATUS_TONE.not_started
                                        }`}
                                    >
                                        {task.workflowState.replace('_', ' ')}
                                    </span>
                                    <span className="truncate">{task.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </WidgetShell>
    );
}

const TODAYS_TASKS_META = {
    id: 'todays-tasks',
    label: "Today's Tasks",
    icon: ListTodo,
    defaultSize: { colSpan: 1 as const },
    defaultEnabled: true,
    defaultOrder: 2,
    description: 'Task series rolling queue for today',
};

registerWidget({ meta: TODAYS_TASKS_META, component: TodaysTasksWidget });
