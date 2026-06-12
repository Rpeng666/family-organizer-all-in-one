// lib/task-data-guard.ts
// Utilities for detecting tasks that have associated data (updates, attachments,
// response field values) that would be lost on deletion.

export interface TaskDataSummary {
    taskId: string;
    taskText: string;
    updateCount: number;
    attachmentCount: number;
    responseFieldCount: number;
    hasNotes: boolean;
}

export interface DeletionImpact {
    /** Tasks that have associated data and require confirmation. */
    tasksWithData: TaskDataSummary[];
    /** Tasks that have NO associated data (safe to delete silently). */
    safeTasks: string[];
    /** Human-readable summary string for the confirmation dialog. */
    message: string;
}

/**
 * Minimal shape of a persisted task for data-guard checks.
 * Matches the PersistedTask shape used in TaskSeriesEditor.
 */
export interface TaskLikeForGuard {
    id: string;
    text?: string | null;
    isDayBreak?: boolean | null;
    notes?: string | null;
    attachments?: Array<{ id: string }> | null;
    responseFields?: Array<{ id: string }> | null;
    updates?: Array<{
        id?: string;
        isDraft?: boolean | null;
        attachments?: Array<{ id: string }> | null;
        responseFieldValues?: Array<{ id: string }> | null;
    }> | null;
}

/**
 * Summarize the data associated with a single task.
 */
export function summarizeTaskData(task: TaskLikeForGuard): TaskDataSummary {
    const nonDraftUpdates = (task.updates || []).filter((u) => !u.isDraft);
    const updateAttachmentCount = nonDraftUpdates.reduce(
        (sum, u) => sum + (u.attachments?.length || 0),
        0
    );
    const responseValueCount = nonDraftUpdates.reduce(
        (sum, u) => sum + (u.responseFieldValues?.length || 0),
        0
    );

    return {
        taskId: task.id,
        taskText: task.text || 'Untitled task',
        updateCount: nonDraftUpdates.length,
        attachmentCount: (task.attachments?.length || 0) + updateAttachmentCount,
        responseFieldCount: (task.responseFields?.length || 0),
        hasNotes: Boolean(task.notes?.trim()),
    };
}

/**
 * Returns true if a task has any meaningful associated data.
 */
export function taskHasData(task: TaskLikeForGuard): boolean {
    if (task.isDayBreak) return false;
    const summary = summarizeTaskData(task);
    return (
        summary.updateCount > 0 ||
        summary.attachmentCount > 0 ||
        summary.responseFieldCount > 0 ||
        summary.hasNotes
    );
}

/**
 * Compute the deletion impact for a set of task IDs, given a lookup of
 * persisted task data.
 */
export function computeDeletionImpact(
    taskIds: string[],
    taskLookup: Map<string, TaskLikeForGuard>
): DeletionImpact {
    const tasksWithData: TaskDataSummary[] = [];
    const safeTasks: string[] = [];

    for (const id of taskIds) {
        const task = taskLookup.get(id);
        if (!task || task.isDayBreak) {
            safeTasks.push(id);
            continue;
        }
        if (taskHasData(task)) {
            tasksWithData.push(summarizeTaskData(task));
        } else {
            safeTasks.push(id);
        }
    }

    // Build a human-readable message
    let message = '';
    if (tasksWithData.length === 0) {
        message = '';
    } else if (tasksWithData.length === 1) {
        const t = tasksWithData[0];
        const parts: string[] = [];
        if (t.updateCount > 0) parts.push(`${t.updateCount} update${t.updateCount === 1 ? '' : 's'}`);
        if (t.attachmentCount > 0) parts.push(`${t.attachmentCount} file${t.attachmentCount === 1 ? '' : 's'}`);
        if (t.responseFieldCount > 0) parts.push(`${t.responseFieldCount} response field${t.responseFieldCount === 1 ? '' : 's'}`);
        if (t.hasNotes) parts.push('saved notes');
        message = `"${t.taskText}" has ${parts.join(', ')}. This data will be permanently deleted.`;
    } else {
        const totalUpdates = tasksWithData.reduce((s, t) => s + t.updateCount, 0);
        const totalFiles = tasksWithData.reduce((s, t) => s + t.attachmentCount, 0);
        const parts: string[] = [];
        if (totalUpdates > 0) parts.push(`${totalUpdates} update${totalUpdates === 1 ? '' : 's'}`);
        if (totalFiles > 0) parts.push(`${totalFiles} file${totalFiles === 1 ? '' : 's'}`);
        message = `${tasksWithData.length} tasks have associated data (${parts.join(', ')}). This data will be permanently deleted.`;
    }

    return { tasksWithData, safeTasks, message };
}
