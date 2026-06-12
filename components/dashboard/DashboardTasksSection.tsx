'use client';

import React from 'react';
import Link from 'next/link';
import { ListTodo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardSectionHeader } from '@/components/dashboard/DashboardSectionHeader';
import { formatCountLabel, type TaskGroup, type TaskSectionPlan, type TaskRow } from '@/lib/dashboard-layout-planner';
import type { TaskWorkflowState } from '@/lib/task-progress';

const TASK_STATUS_TONE: Record<TaskWorkflowState, string> = {
    not_started: 'border-border/50 text-muted-foreground/60',
    in_progress: 'border-warning/30 text-warning/80',
    blocked: 'border-destructive/30 text-destructive/70',
    skipped: 'border-border/40 text-muted-foreground/40',
    needs_review: 'border-ring/30 text-ring/80',
    done: 'border-success/30 text-success/70',
};

interface DashboardTasksSectionProps {
    totalCount: number;
    plan: TaskSectionPlan;
    activeMemberId: string | null;
    height: number | null;
}

function TaskCard({ task }: { task: TaskRow }) {
    return (
        <div
            className="rounded-2xl border border-border/50 bg-background/60 px-4 py-3"
            style={task.depth > 0 ? { marginLeft: `${Math.min(task.depth * 12, 32)}px` } : undefined}
        >
            <div className="flex items-start gap-3">
                <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide', TASK_STATUS_TONE[task.workflowState])}>
                    {task.workflowState.replace('_', ' ')}
                </span>
                <div className="min-w-0 flex-1">
                    {task.parentLabel && (
                        <p className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground/40">{task.parentLabel}</p>
                    )}
                    <p className="truncate text-sm text-foreground" style={{ fontFamily: 'var(--font-garamond, Georgia, serif)' }}>
                        {task.text}
                    </p>
                    {task.notePreview && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground/60">{task.notePreview}</p>
                    )}
                </div>
            </div>
        </div>
    );
}

export function DashboardTasksSection({ totalCount, plan, activeMemberId, height }: DashboardTasksSectionProps) {
    const tasksHref = activeMemberId ? `/my-tasks?member=${encodeURIComponent(activeMemberId)}` : '/my-tasks';

    return (
        <div
            className="overflow-hidden rounded-3xl border border-border/60 bg-card px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
            style={height != null ? { height: `${height}px` } : undefined}
        >
            <DashboardSectionHeader
                icon={ListTodo}
                title="Tasks"
                href={tasksHref}
                countLabel={formatCountLabel(totalCount, 'task', 'tasks')}
            />

            <div className="mt-3 space-y-2">
                {plan.visibleGroups.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/50 px-4 py-3 text-xs text-muted-foreground/60">
                        No scheduled tasks for this day.
                    </div>
                ) : (
                    <>
                        {plan.visibleGroups.map((group) => (
                            <div key={group.seriesId} className="space-y-1.5">
                                <p
                                    className="px-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/50"
                                    style={{ fontFamily: 'var(--font-garamond, Georgia, serif)' }}
                                >
                                    {group.seriesName}
                                </p>
                                {group.tasks.map((task) => <TaskCard key={task.id} task={task} />)}
                            </div>
                        ))}

                        {plan.hiddenCount > 0 && (
                            <Link href={tasksHref} className="block pt-1 text-xs text-muted-foreground/60 underline-offset-4 hover:text-foreground hover:underline">
                                {plan.hiddenCount} more
                            </Link>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
