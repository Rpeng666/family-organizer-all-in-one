// lib/task-update-mutations.ts
// Unified transaction builders for task updates (replaces task-progress-mutations.ts + task-response-mutations.ts).

import { getNextChoreOccurrence } from '@/lib/chore-schedule';
import { buildHistoryEventTransactions } from '@/lib/history-events';
import {
    getDerivedParentTaskWorkflowState,
    getTaskLastActiveState,
    getTaskParentId,
    getTaskWorkflowState,
    getTaskStatusLabel,
    isTaskDone,
    isTaskWorkflowState,
    type TaskActiveState,
    type TaskRestoreTiming,
    type TaskWorkflowState,
} from '@/lib/task-progress';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskUpdateTaskLike {
    id: string;
    text?: string | null;
    isCompleted?: boolean | null;
    completedAt?: Date | string | null;
    completedOnDate?: string | null;
    workflowState?: string | null;
    lastActiveState?: string | null;
    deferredUntilDate?: string | null;
    parentTask?: Array<{ id?: string | null }> | { id?: string | null } | null;
    childTasksComplete?: boolean | null;
}

export interface TaskUpdateAttachmentInput {
    id: string;
    name: string;
    type: string;
    url: string;
    kind?: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
    thumbnailUrl?: string | null;
    thumbnailWidth?: number | null;
    thumbnailHeight?: number | null;
    blurhash?: string | null;
    waveformPeaks?: number[] | null;
}

export interface ResponseFieldValueInput {
    fieldId: string;
    existingValueId?: string | null;
    richTextContent?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileType?: string | null;
    fileSizeBytes?: number | null;
    thumbnailUrl?: string | null;
}

export interface TaskUpdateGradeInput {
    numericValue: number;
    displayValue: string;
    gradeTypeId: string;
    isProvisional: boolean;
}

export interface BuildTaskUpdateTransactionsParams {
    tx: any;
    createId: () => string;
    taskId: string;
    allTasks: TaskUpdateTaskLike[];
    nextState: TaskWorkflowState;
    selectedDateKey: string;
    note?: string;
    actorFamilyMemberId: string;
    affectedFamilyMemberId: string;
    restoreTiming?: TaskRestoreTiming | null;
    schedule?: {
        startDate: string;
        rrule?: string | null;
        exdates?: string[] | null;
    } | null;
    referenceDate?: Date | null;
    attachments?: TaskUpdateAttachmentInput[];
    responseFieldValues?: ResponseFieldValueInput[];
    grade?: TaskUpdateGradeInput | null;
    isDraft?: boolean;
    taskSeriesId?: string | null;
    choreId?: string | null;
    /** Link this update as a reply to a specific prior update (for parent feedback on a child's submission). */
    replyToUpdateId?: string | null;
}

export interface TaskUpdateValidationResult {
    valid: boolean;
    routedState?: TaskWorkflowState;
    message?: string;
    suggestion?: TaskWorkflowState;
}

export interface TaskResponseFieldLikeForValidation {
    id: string;
    required: boolean;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates whether a task update submission is allowed given the target state
 * and the response fields present on the task.
 */
export function validateUpdateSubmission({
    toState,
    requiredResponseFields,
    filledFieldIds,
    isParentReviewingExistingSubmission,
}: {
    toState: TaskWorkflowState;
    requiredResponseFields: TaskResponseFieldLikeForValidation[];
    filledFieldIds: Set<string>;
    /** When true, a parent reviewer is allowed to change status without filling
     *  required response fields in the current composer. */
    isParentReviewingExistingSubmission?: boolean;
}): TaskUpdateValidationResult {
    // Parent reviewers can always set status without filling required response
    // fields in the current composer.
    if (isParentReviewingExistingSubmission) {
        return { valid: true };
    }

    const unfilledRequired = requiredResponseFields.filter((f) => !filledFieldIds.has(f.id));

    if (toState === 'done' && requiredResponseFields.length > 0) {
        if (unfilledRequired.length > 0) {
            return {
                valid: false,
                suggestion: 'in_progress',
                message:
                    'Required response fields are not filled. Consider submitting as "In progress" instead, or fill in the required responses to submit for review.',
            };
        }
        // All required fields are filled but done with required responses → route to needs_review
        return {
            valid: true,
            routedState: 'needs_review',
            message:
                'This update includes a required response and will be submitted with "Needs review" status instead of "Done" status.',
        };
    }

    if (toState === 'needs_review' && unfilledRequired.length > 0) {
        return {
            valid: false,
            suggestion: 'in_progress',
            message:
                'Required response fields are not filled. Consider submitting as "In progress" instead, or fill in the required responses to submit for review.',
        };
    }

    return { valid: true };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toDateKey(value: Date | string): string {
    return new Date(value).toISOString().slice(0, 10);
}

function getDeferredUntilDate(params: {
    nextState: TaskWorkflowState;
    restoreTiming?: TaskRestoreTiming | null;
    schedule?: BuildTaskUpdateTransactionsParams['schedule'];
    referenceDate?: Date | null;
}): string | null {
    if (params.nextState !== 'not_started' && params.nextState !== 'in_progress') return null;
    if (params.restoreTiming !== 'next_scheduled' || !params.schedule?.startDate) return null;

    const anchorDate = params.referenceDate || new Date();
    const nextOccurrence = getNextChoreOccurrence(
        {
            startDate: params.schedule.startDate,
            rrule: params.schedule.rrule || null,
            exdates: params.schedule.exdates || [],
        },
        anchorDate,
        false
    );

    return nextOccurrence ? toDateKey(nextOccurrence) : null;
}

function syncAncestorChildCompletionState(params: {
    tx: any;
    taskMap: Map<string, TaskUpdateTaskLike>;
    transactions: any[];
    startingTaskId: string;
    now: Date;
    selectedDateKey: string;
}) {
    let currentTask = params.taskMap.get(params.startingTaskId);
    let parentId = currentTask ? getTaskParentId(currentTask) : undefined;
    let depth = 0;

    while (parentId && depth < 50) {
        const parent = params.taskMap.get(parentId);
        if (!parent) break;

        const children = Array.from(params.taskMap.values()).filter((task) => getTaskParentId(task) === parentId);
        const allChildrenFinished = children.length > 0 && children.every((child) => isTaskDone(child) && child.childTasksComplete !== false);
        const nextParentState = getDerivedParentTaskWorkflowState(children);
        const currentParentState = getTaskWorkflowState(parent);
        const previousActiveState = getTaskLastActiveState(parent);
        const nextLastActiveState =
            nextParentState === 'not_started' || nextParentState === 'in_progress' ? nextParentState : previousActiveState;
        const nextIsCompleted = nextParentState === 'done';
        const nextCompletedAt = nextIsCompleted
            ? currentParentState === 'done'
                ? parent.completedAt || null
                : params.now
            : null;
        const nextCompletedOnDate = nextIsCompleted
            ? currentParentState === 'done'
                ? parent.completedOnDate || null
                : params.selectedDateKey
            : null;

        const shouldUpdateParent =
            parent.childTasksComplete !== allChildrenFinished ||
            getTaskWorkflowState(parent) !== nextParentState ||
            Boolean(parent.isCompleted) !== nextIsCompleted ||
            getTaskLastActiveState(parent) !== nextLastActiveState ||
            (parent.deferredUntilDate || null) !== null ||
            (parent.completedOnDate || null) !== nextCompletedOnDate ||
            (!nextIsCompleted && parent.completedAt != null) ||
            (nextIsCompleted && currentParentState !== 'done');

        parent.childTasksComplete = allChildrenFinished;
        parent.workflowState = nextParentState;
        parent.lastActiveState = nextLastActiveState;
        parent.deferredUntilDate = null;
        parent.isCompleted = nextIsCompleted;
        parent.completedAt = nextCompletedAt;
        parent.completedOnDate = nextCompletedOnDate;

        if (shouldUpdateParent) {
            params.transactions.push(
                params.tx.tasks[parent.id].update({
                    childTasksComplete: allChildrenFinished,
                    workflowState: nextParentState,
                    lastActiveState: nextLastActiveState,
                    deferredUntilDate: null,
                    isCompleted: nextIsCompleted,
                    completedAt: nextCompletedAt,
                    completedOnDate: nextCompletedOnDate,
                })
            );
        }

        currentTask = parent;
        parentId = currentTask ? getTaskParentId(currentTask) : undefined;
        depth += 1;
    }
}

// ---------------------------------------------------------------------------
// Core builder
// ---------------------------------------------------------------------------

/**
 * Builds all InstantDB transactions for a unified task update.
 *
 * This handles:
 * - Task state transition (workflowState, lastActiveState, completion fields)
 * - Creating the taskUpdates row with actor/affected links
 * - Creating taskUpdateAttachments and linking
 * - Creating/updating taskResponseFieldValues and linking to the update
 * - Grade data (inline on the update row + gradeType link)
 * - History event creation
 * - Ancestor child-completion state sync
 *
 * When `isDraft` is true, only the update row and response field values are
 * saved. The task's workflowState is NOT changed and no history event is created.
 */
export function buildTaskUpdateTransactions(params: BuildTaskUpdateTransactionsParams) {
    if (!isTaskWorkflowState(params.nextState)) {
        return { transactions: [], updateId: '' };
    }

    const taskMap = new Map<string, TaskUpdateTaskLike>();
    params.allTasks.forEach((task) => {
        taskMap.set(task.id, { ...task });
    });

    const targetTask = taskMap.get(params.taskId);
    if (!targetTask) return { transactions: [], updateId: '' };

    const now = new Date();
    const nowMs = now.getTime();
    const currentState = getTaskWorkflowState(targetTask);
    const previousActiveState = getTaskLastActiveState(targetTask);
    const nextActiveState: TaskActiveState =
        params.nextState === 'not_started' || params.nextState === 'in_progress' ? params.nextState : previousActiveState;
    const deferredUntilDate = getDeferredUntilDate({
        nextState: params.nextState,
        restoreTiming: params.restoreTiming,
        schedule: params.schedule,
        referenceDate: params.referenceDate,
    });

    const transactions: any[] = [];
    const updateId = params.createId();
    const trimmedNote = params.note?.trim() || null;

    // ---- Create the taskUpdates row ----
    const updateData: Record<string, any> = {
        createdAt: nowMs,
        fromState: currentState,
        isDraft: params.isDraft || false,
        note: trimmedNote,
        restoreTiming: params.restoreTiming || null,
        scheduledForDate: params.selectedDateKey,
        toState: params.nextState,
        updatedAt: nowMs,
    };

    // Grade fields (optional, typically parent-only)
    if (params.grade) {
        updateData.gradeNumericValue = params.grade.numericValue;
        updateData.gradeDisplayValue = params.grade.displayValue;
        updateData.gradeIsProvisional = params.grade.isProvisional;
    }

    transactions.push(params.tx.taskUpdates[updateId].update(updateData));

    // Link update → task
    transactions.push(params.tx.taskUpdates[updateId].link({ task: params.taskId }));

    // Link update → actor (familyMember)
    if (params.actorFamilyMemberId) {
        transactions.push(params.tx.taskUpdates[updateId].link({ actor: params.actorFamilyMemberId }));
    }

    // Link update → affectedPerson (familyMember)
    if (params.affectedFamilyMemberId) {
        transactions.push(params.tx.taskUpdates[updateId].link({ affectedPerson: params.affectedFamilyMemberId }));
    }

    // Link update → gradeType
    if (params.grade?.gradeTypeId) {
        transactions.push(params.tx.taskUpdates[updateId].link({ gradeType: params.grade.gradeTypeId }));
    }

    // Link update → replyTo (parent feedback on a specific prior submission)
    if (params.replyToUpdateId) {
        transactions.push(params.tx.taskUpdates[updateId].link({ replyTo: params.replyToUpdateId }));
    }

    // ---- Attachments ----
    for (const attachment of params.attachments || []) {
        transactions.push(
            params.tx.taskUpdateAttachments[attachment.id].update({
                blurhash: attachment.blurhash || null,
                createdAt: now.toISOString(),
                durationSec: attachment.durationSec ?? null,
                height: attachment.height ?? null,
                kind: attachment.kind || null,
                name: attachment.name,
                sizeBytes: attachment.sizeBytes ?? null,
                thumbnailHeight: attachment.thumbnailHeight ?? null,
                thumbnailUrl: attachment.thumbnailUrl || null,
                thumbnailWidth: attachment.thumbnailWidth ?? null,
                type: attachment.type,
                updatedAt: now.toISOString(),
                url: attachment.url,
                waveformPeaks: attachment.waveformPeaks || null,
                width: attachment.width ?? null,
            }),
            params.tx.taskUpdates[updateId].link({ attachments: attachment.id })
        );
    }

    // ---- Response field values ----
    for (const fieldValue of params.responseFieldValues || []) {
        const valueId = fieldValue.existingValueId || params.createId();
        transactions.push(
            params.tx.taskResponseFieldValues[valueId].update({
                richTextContent: fieldValue.richTextContent ?? null,
                fileUrl: fieldValue.fileUrl ?? null,
                fileName: fieldValue.fileName ?? null,
                fileType: fieldValue.fileType ?? null,
                fileSizeBytes: fieldValue.fileSizeBytes ?? null,
                thumbnailUrl: fieldValue.thumbnailUrl ?? null,
                createdAt: nowMs,
                updatedAt: nowMs,
            })
        );

        // Link to update
        transactions.push(params.tx.taskResponseFieldValues[valueId].link({ update: updateId }));

        // Link to field (only on first creation)
        if (!fieldValue.existingValueId) {
            transactions.push(params.tx.taskResponseFieldValues[valueId].link({ field: fieldValue.fieldId }));
        }
    }

    // ---- If draft, stop here (no task state change, no history) ----
    if (params.isDraft) {
        return { transactions, updateId };
    }

    // ---- Update task state ----
    targetTask.workflowState = params.nextState;
    targetTask.lastActiveState = nextActiveState;
    targetTask.deferredUntilDate = deferredUntilDate;
    targetTask.isCompleted = params.nextState === 'done';

    if (params.nextState === 'done') {
        transactions.push(
            params.tx.tasks[params.taskId].update({
                workflowState: params.nextState,
                lastActiveState: previousActiveState,
                deferredUntilDate: null,
                isCompleted: true,
                completedAt: currentState === 'done' ? targetTask.completedAt || null : now,
                completedOnDate: currentState === 'done' ? targetTask.completedOnDate || null : params.selectedDateKey,
            })
        );
    } else {
        transactions.push(
            params.tx.tasks[params.taskId].update({
                workflowState: params.nextState,
                lastActiveState: nextActiveState,
                deferredUntilDate: deferredUntilDate,
                isCompleted: false,
                completedAt: null,
                completedOnDate: null,
            })
        );
    }

    // ---- History event ----
    const taskLabel = String(targetTask.text || '').trim() || 'Task';
    const summary =
        params.restoreTiming && (params.nextState === 'not_started' || params.nextState === 'in_progress')
            ? `Restored "${taskLabel}" to ${getTaskStatusLabel(params.nextState)}`
            : params.nextState === 'done'
              ? `Marked "${taskLabel}" done`
              : currentState === params.nextState
                ? `Updated "${taskLabel}"`
                : `Moved "${taskLabel}" to ${getTaskStatusLabel(params.nextState)}`;

    const historyEvent = buildHistoryEventTransactions({
        tx: params.tx,
        createId: params.createId,
        occurredAt: now.toISOString(),
        domain: 'tasks',
        actionType: params.restoreTiming ? 'task_restored' : 'task_progress_updated',
        summary,
        source: 'manual',
        actorFamilyMemberId: params.actorFamilyMemberId || null,
        affectedFamilyMemberIds: params.affectedFamilyMemberId ? [params.affectedFamilyMemberId] : [],
        taskSeriesId: params.taskSeriesId || null,
        taskId: params.taskId,
        choreId: params.choreId || null,
        scheduledForDate: params.selectedDateKey,
        restoreTiming: params.restoreTiming || null,
        metadata: {
            taskUpdateId: updateId,
            replyToUpdateId: params.replyToUpdateId || null,
            fromState: currentState,
            toState: params.nextState,
            note: trimmedNote,
            taskText: taskLabel,
            ...(params.grade
                ? {
                      gradeDisplayValue: params.grade.displayValue,
                      gradeIsProvisional: params.grade.isProvisional,
                  }
                : {}),
        },
        attachments: params.attachments || [],
    });
    transactions.push(...historyEvent.transactions);

    // ---- Sync ancestor child completion state ----
    syncAncestorChildCompletionState({
        tx: params.tx,
        taskMap,
        transactions,
        startingTaskId: params.taskId,
        now,
        selectedDateKey: params.selectedDateKey,
    });

    return { transactions, updateId };
}

// ---------------------------------------------------------------------------
// Noted helpers
// ---------------------------------------------------------------------------

/**
 * Builds transactions to mark a task as "noted" (hides from overdue section
 * of the needs-attention view until the given date or indefinitely).
 */
export function buildNotedTransactions(params: {
    tx: any;
    taskId: string;
    notedUntilDate?: string | null;
    indefinitely?: boolean;
}) {
    return [
        params.tx.tasks[params.taskId].update({
            notedUntilDate: params.indefinitely ? null : (params.notedUntilDate || null),
            isNotedIndefinitely: params.indefinitely || false,
        }),
    ];
}

/**
 * Clears the "noted" status from a task.
 */
export function buildClearNotedTransactions(params: { tx: any; taskId: string }) {
    return [
        params.tx.tasks[params.taskId].update({
            notedUntilDate: null,
            isNotedIndefinitely: false,
        }),
    ];
}

// ---------------------------------------------------------------------------
// Draft field value builder (for auto-save)
// ---------------------------------------------------------------------------

export interface DraftFieldValueParams {
    responseFieldValues: ResponseFieldValueInput[];
    updateId: string;
}

/**
 * Builds transactions to save response field values as part of a draft update.
 * Used for auto-save of in-progress response editing.
 */
export function buildDraftFieldValueTransactions(params: {
    tx: any;
    createId: () => string;
    updateId: string;
    responseFieldValues: ResponseFieldValueInput[];
}) {
    const nowMs = Date.now();
    const transactions: any[] = [];

    for (const fieldValue of params.responseFieldValues) {
        const valueId = fieldValue.existingValueId || params.createId();
        transactions.push(
            params.tx.taskResponseFieldValues[valueId].update({
                richTextContent: fieldValue.richTextContent ?? null,
                fileUrl: fieldValue.fileUrl ?? null,
                fileName: fieldValue.fileName ?? null,
                fileType: fieldValue.fileType ?? null,
                fileSizeBytes: fieldValue.fileSizeBytes ?? null,
                thumbnailUrl: fieldValue.thumbnailUrl ?? null,
                createdAt: nowMs,
                updatedAt: nowMs,
            })
        );

        transactions.push(params.tx.taskResponseFieldValues[valueId].link({ update: params.updateId }));

        if (!fieldValue.existingValueId) {
            transactions.push(params.tx.taskResponseFieldValues[valueId].link({ field: fieldValue.fieldId }));
        }
    }

    return transactions;
}
