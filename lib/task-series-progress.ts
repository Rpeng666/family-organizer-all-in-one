import type { Task } from '@/lib/task-scheduler';
import { isActionableTask, isTaskDone, taskHasChildren } from '@/lib/task-progress';

/** Check if a task functions as a header (has visible children in the scheduled set) */
export const hasScheduledChildren = (parentId: string, scheduledIds: Set<string>, allTasks: Task[]) => {
    return allTasks.some((t) => !t.isDayBreak && ((t as any).parentTask?.[0]?.id === parentId || (t as any).parentTask?.id === parentId) && scheduledIds.has(t.id));
};

/** Calculate the completion ratio for a set of scheduled tasks (0-1), or null if no actionable tasks */
export const getTaskSeriesProgress = (scheduledTasks: Task[], allTasks: Task[]) => {
    if (!scheduledTasks.length) return null;

    const scheduledIds = new Set(scheduledTasks.map((task) => task.id));
    const actionableTasks = scheduledTasks.filter((task) => isActionableTask(task, allTasks) && !taskHasChildren(task.id, allTasks) && !hasScheduledChildren(task.id, scheduledIds, allTasks));

    if (actionableTasks.length === 0) return null;

    const completedTasks = actionableTasks.filter((task) => isTaskDone(task)).length;
    return completedTasks / actionableTasks.length;
};
