import React, { useMemo, useState } from 'react';
import { Task } from '@/lib/task-scheduler';
import type { ResponseFieldValueInput } from '@/lib/task-update-mutations';
import type { GradeTypeLike } from '@/lib/task-response-types';
import {
    getBucketedTasks,
    getLatestTaskUpdate,
    isActionableTask,
    isTaskDone,
    type TaskBucketState,
    type TaskWorkflowState,
} from '@/lib/task-progress';
import { TaskActiveRow } from '@/components/task-series/TaskActiveRow';
import { TaskBucketRow } from '@/components/task-series/TaskBucketRow';
import { TaskDetailDialog } from '@/components/task-series/TaskDetailDialog';

export interface TaskChecklistUpdateInput {
    nextState: TaskWorkflowState;
    note?: string;
    files?: File[];
    restoreTiming?: import('@/lib/task-progress').TaskRestoreTiming | null;
    responseFieldValues?: ResponseFieldValueInput[];
    replyToUpdateId?: string | null;
}

interface Props {
    tasks: Task[];
    allTasks: Task[];
    onToggle: (taskId: string, currentStatus: boolean) => void;
    onTaskUpdate?: (taskId: string, input: TaskChecklistUpdateInput) => Promise<void> | void;
    canWriteTaskProgress?: boolean;
    onRequireTaskAuth?: () => void;
    familyMemberNamesById?: Record<string, string>;
    isReadOnly?: boolean;
    selectedMember: string | null | 'All';
    currentMemberId?: string | null;
    currentMemberName?: string;
    showDetails: boolean;
    isParentReviewer?: boolean;
    selectedDateKey?: string;
    gradeTypes?: GradeTypeLike[];
    detailContext?: {
        choreTitle?: string;
        seriesName?: string;
        ownerName?: string;
        selectedDateLabel?: string;
    };
}

const bucketOrder: TaskBucketState[] = ['blocked', 'needs_review', 'skipped', 'done'];

const getParentId = (task: Task): string | undefined => {
    if (!task.parentTask) return undefined;
    if (Array.isArray(task.parentTask)) return task.parentTask[0]?.id;
    return (task.parentTask as any).id;
};

export const TaskSeriesChecklist: React.FC<Props> = ({
    tasks: scheduledTasks,
    allTasks,
    onToggle,
    onTaskUpdate,
    canWriteTaskProgress = true,
    onRequireTaskAuth,
    isReadOnly,
    selectedMember,
    currentMemberId,
    showDetails,
    isParentReviewer = false,
    gradeTypes = [],
    detailContext,
}) => {
    const effectiveMemberId = currentMemberId || (selectedMember !== 'All' ? selectedMember : null);

    const [localExpandedIds, setLocalExpandedIds] = useState<Set<string>>(new Set());
    const [expandedBuckets, setExpandedBuckets] = useState<Record<TaskBucketState, boolean>>({
        blocked: true,
        skipped: false,
        needs_review: true,
        done: false,
    });
    const [composerTaskId, setComposerTaskId] = useState<string | null>(null);

    const toggleLocalExpand = (taskId: string) => {
        setLocalExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) next.delete(taskId);
            else next.add(taskId);
            return next;
        });
    };

    const toggleBucketSection = (state: TaskBucketState) => {
        setExpandedBuckets((prev) => ({ ...prev, [state]: !prev[state] }));
    };

    const activeScheduledTasks = useMemo(() => scheduledTasks.filter((task) => !isTaskDone(task)), [scheduledTasks]);

    const visibleNodes: Task[] = useMemo(() => {
        if (!activeScheduledTasks.length) return [];

        const scheduledIds = new Set(activeScheduledTasks.map((t) => t.id));
        const visibleMap = new Map<string, Task>();

        activeScheduledTasks.forEach((t) => visibleMap.set(t.id, t));

        activeScheduledTasks.forEach((task) => {
            let current = task;
            let depth = 0;
            let parentId = getParentId(current);

            while (parentId && depth < 10) {
                if (visibleMap.has(parentId)) break;
                const parent = allTasks.find((t) => t.id === parentId);
                if (parent) {
                    visibleMap.set(parent.id, parent);
                    current = parent;
                    parentId = getParentId(current);
                } else {
                    break;
                }
                depth++;
            }
        });

        return Array.from(visibleMap.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
    }, [activeScheduledTasks, allTasks]);

    const bucketedTasks = useMemo(() => {
        const sorted = (state: TaskBucketState) =>
            getBucketedTasks(allTasks, state).sort((l, r) => {
                const lt = getLatestTaskUpdate(l)?.createdAt ? new Date(getLatestTaskUpdate(l)!.createdAt!).getTime() : 0;
                const rt = getLatestTaskUpdate(r)?.createdAt ? new Date(getLatestTaskUpdate(r)!.createdAt!).getTime() : 0;
                if (rt !== lt) return rt - lt;
                return (l.order || 0) - (r.order || 0);
            });
        return {
            blocked: sorted('blocked'),
            skipped: sorted('skipped'),
            needs_review: sorted('needs_review'),
            done: sorted('done'),
        };
    }, [allTasks]);

    const actionableCount = useMemo(() => allTasks.filter((task) => isActionableTask(task, allTasks)).length, [allTasks]);
    const hasAnyBucketedTasks = bucketOrder.some((state) => bucketedTasks[state].length > 0);
    const hasAnyVisibleContent = visibleNodes.length > 0 || hasAnyBucketedTasks;

    if (!hasAnyVisibleContent || actionableCount === 0) return null;

    const scheduledIds = new Set(activeScheduledTasks.map((t) => t.id));
    const composerTask = composerTaskId ? allTasks.find((t) => t.id === composerTaskId) ?? null : null;

    return (
        <div className="relative mb-2 mt-3 space-y-3">
            {visibleNodes.length > 0 ? (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Active Work</h4>
                        <span className="text-[11px] text-slate-500">
                            {activeScheduledTasks.length} active item{activeScheduledTasks.length === 1 ? '' : 's'}
                        </span>
                    </div>
                    {visibleNodes.map((task) => (
                        <TaskActiveRow
                            key={task.id}
                            task={task}
                            allTasks={allTasks}
                            scheduledIds={scheduledIds}
                            showDetails={showDetails}
                            localExpandedIds={localExpandedIds}
                            onToggleLocalExpand={toggleLocalExpand}
                            isReadOnly={isReadOnly}
                            canWriteTaskProgress={canWriteTaskProgress}
                            effectiveMemberId={effectiveMemberId}
                            onOpenComposer={(t) => setComposerTaskId(t.id)}
                            onToggle={onToggle}
                            onTaskUpdate={onTaskUpdate}
                            onRequireTaskAuth={onRequireTaskAuth}
                        />
                    ))}
                </div>
            ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    No active tasks are due right now. Check the bins below for blocked, skipped, review, or finished items.
                </div>
            )}

            {bucketOrder.map((state) => {
                const tasksForBucket = bucketedTasks[state];
                if (tasksForBucket.length === 0) return null;

                return (
                    <div key={state} className="rounded-xl border border-slate-200 bg-slate-50/80">
                        <button
                            type="button"
                            onClick={() => toggleBucketSection(state)}
                            className="flex w-full items-center justify-between px-4 py-3 text-left"
                        >
                            <div>
                                <div className="text-sm font-semibold text-slate-900">
                                    {state === 'blocked' ? 'Blocked' : state === 'needs_review' ? 'Needs Review' : state === 'skipped' ? 'Skipped' : 'Done'}
                                </div>
                                <div className="text-xs text-slate-500">{tasksForBucket.length} task{tasksForBucket.length === 1 ? '' : 's'}</div>
                            </div>
                            <span className="text-xs font-medium text-slate-500">{expandedBuckets[state] ? 'Hide' : 'Show'}</span>
                        </button>
                        {expandedBuckets[state] ? (
                            <div className="space-y-3 border-t border-slate-200 px-4 py-3">
                                {tasksForBucket.map((task) => (
                                    <TaskBucketRow
                                        key={task.id}
                                        task={task}
                                        state={state}
                                        isReadOnly={isReadOnly}
                                        canWriteTaskProgress={canWriteTaskProgress}
                                        effectiveMemberId={effectiveMemberId}
                                        isParentReviewer={isParentReviewer}
                                        onOpenComposer={(t) => setComposerTaskId(t.id)}
                                        onToggle={onToggle}
                                        onTaskUpdate={onTaskUpdate}
                                        onRequireTaskAuth={onRequireTaskAuth}
                                    />
                                ))}
                            </div>
                        ) : null}
                    </div>
                );
            })}

            <TaskDetailDialog
                composerTask={composerTask}
                allTasks={allTasks}
                isReadOnly={isReadOnly}
                canWriteTaskProgress={canWriteTaskProgress}
                isParentReviewer={isParentReviewer}
                effectiveMemberId={effectiveMemberId}
                detailContext={detailContext}
                gradeTypes={gradeTypes}
                onClose={() => setComposerTaskId(null)}
                onToggle={onToggle}
                onTaskUpdate={onTaskUpdate}
                onRequireTaskAuth={onRequireTaskAuth}
            />
        </div>
    );
};
