// lib/task-scheduler.ts
import { toUTCDate } from './chore-utils';
import { choreOccursOnDate, getChoreOccurrencesInRange } from './chore-schedule';
import { id as createId, tx } from '@instantdb/react';
import { buildTaskUpdateTransactions } from '@/lib/task-update-mutations';
import {
    getTaskWorkflowState,
    isActionableTask,
    isTaskDone,
    isTaskInActiveQueue,
    type TaskUpdateLike,
    type TaskWorkflowState,
} from '@/lib/task-progress';

export interface Task {
    id: string;
    text: string;
    isCompleted: boolean;
    completedAt?: string;
    completedOnDate?: string;
    childTasksComplete?: boolean;
    isDayBreak: boolean;
    order: number;
    indentationLevel?: number;
    notes?: string;
    weight?: number;
    attachments?: Array<{ id: string; name?: string; type?: string; url: string }>;
    parentTask?: { id: string }[];
    subTasks?: { id: string }[];
    specificTime?: string | null;
    overrideWorkAhead?: boolean | null;
    workflowState?: TaskWorkflowState;
    lastActiveState?: string;
    deferredUntilDate?: string;
    notedUntilDate?: string;
    isNotedIndefinitely?: boolean;
    updates?: TaskUpdateLike[];
    responseFields?: Array<{
        id: string;
        type: string;
        label: string;
        description?: string;
        weight: number;
        required: boolean;
        order: number;
    }>;
}

// FIX: Helper to convert any timestamp (string or date) into a Date object representing
// Midnight of that day in the LOCAL timezone, but stored as a UTC object.
// This ensures comparisons align with "Today" relative to the user, not strict UTC.
// Example: Nov 29 11:00 PM CST -> Nov 29 00:00 UTC (Stored)
function toLocalMidnight(dateInput: Date | string): Date {
    const d = new Date(dateInput);
    // Explicitly use Local components to construct UTC 00:00
    // This effectively "shifts" Local Midnight to UTC Midnight
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

function wasCompletedOnDate(task: Task, dateString: string, utcDate: Date): boolean {
    if (!isTaskDone(task)) return false;

    if (task.completedOnDate) {
        return task.completedOnDate === dateString;
    }

    if (task.completedAt) {
        return toLocalMidnight(task.completedAt).getTime() === utcDate.getTime();
    }

    return false;
}

/**
 * Determines which tasks from a series should be displayed for a specific date
 * based on the "Rolling Queue" logic + Future Simulation.
 * * Returns:
 * - Task[]: The list of tasks for the date.
 * - []: An empty array if the series is active but today is a break day.
 * - null: If the series is NOT active for this date (before start, finished, or not scheduled).
 */
export function getTasksForDate(
    allTasks: Task[],
    rruleString: string | null,
    startDateString: string,
    viewDate: Date,
    seriesStartDateString?: string | null,
    exdates?: string[] | null,
    pullForwardCount?: number
): Task[] {
    const blockOffset = pullForwardCount || 0;
    // 1. Normalize dates
    const utcViewDate = toUTCDate(viewDate);
    const viewDateString = utcViewDate.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const today = toLocalMidnight(new Date());
    const todayString = toUTCDate(today).toISOString().slice(0, 10);

    // 1. Sort tasks by order
    const sortedTasks = [...allTasks].sort((a, b) => (a.order || 0) - (b.order || 0));
    const actionableTaskIds = new Set(sortedTasks.filter((task) => isActionableTask(task, sortedTasks)).map((task) => task.id));

    // --- DETERMINE ANCHOR DATE ---
    // The "queue" starts rolling from Today OR the Series Start Date, whichever is later.
    let anchorDate = today;
    if (seriesStartDateString) {
        const seriesStart = toUTCDate(new Date(seriesStartDateString));
        // If series starts in the future relative to today, the anchor is the start date
        if (seriesStart.getTime() > today.getTime()) {
            anchorDate = seriesStart;
        }
    }
    const anchorDateString = toUTCDate(anchorDate).toISOString().slice(0, 10);

    if (utcViewDate.getTime() < anchorDate.getTime()) {
        return sortedTasks.filter((task) => actionableTaskIds.has(task.id) && wasCompletedOnDate(task, viewDateString, utcViewDate));
    }

    const blocks: Task[][] = [];
    let currentBlock: Task[] = [];
    let currentBlockHadActionableTasks = false;

    for (const task of sortedTasks) {
        if (task.isDayBreak) {
            if (currentBlock.length > 0 || !currentBlockHadActionableTasks) {
                blocks.push(currentBlock);
            }
            currentBlock = [];
            currentBlockHadActionableTasks = false;
            continue;
        }

        if (!actionableTaskIds.has(task.id)) {
            continue;
        }

        currentBlockHadActionableTasks = true;
        if (
            isTaskInActiveQueue(task, viewDateString) ||
            wasCompletedOnDate(task, anchorDateString, anchorDate) ||
            wasCompletedOnDate(task, viewDateString, utcViewDate)
        ) {
            currentBlock.push(task);
        }
    }

    if (currentBlock.length > 0 || currentBlockHadActionableTasks) {
        blocks.push(currentBlock);
    }

    const normalizedBlocks = blocks.filter((block, index) => {
        if (block.length > 0) return true;
        const previousBlock = blocks[index - 1];
        const nextBlock = blocks[index + 1];
        return previousBlock?.length !== 0 && nextBlock?.length !== 0;
    });

    if (normalizedBlocks.length === 0) return [];

    // 6. "Current Block" Logic (Viewing Anchor Date)
    if (utcViewDate.getTime() === anchorDate.getTime()) {
        return normalizedBlocks[blockOffset] || [];
    }

    // 9. Handle Future Dates Logic
    if (utcViewDate.getTime() > anchorDate.getTime()) {
        if (!rruleString) return [];
        const schedule = {
            startDate: startDateString,
            rrule: rruleString,
            exdates: exdates || [],
        };

        // Find occurrences starting from Anchor Date
        const relevantOccurrences = getChoreOccurrencesInRange(schedule, anchorDate, utcViewDate);

        // Find the index of the viewDate in the sequence
        const occurrenceIndex = relevantOccurrences.findIndex((d) => toUTCDate(d).getTime() === utcViewDate.getTime());

        // --- FIX: Logic shift based on whether Anchor Date is ITSELF a scheduled day ---
        // Block 0 is ALWAYS shown on the *next available scheduled day* starting from Anchor Date.
        // If Anchor Date IS scheduled, Block 0 belongs to Anchor Date.
        // If Anchor Date IS NOT scheduled (e.g. today is Wed, schedule is Mon/Thu),
        // Block 0 belongs to the *first occurrence* after today (Thu).

        // We need to know if relevantOccurrences[0] represents the Anchor Date or a future date.
        // But regardless, relevantOccurrences[0] corresponds to Block 0.
        // So if viewDate is found at index `k`, it corresponds to Block `k`.

        if (occurrenceIndex === -1) return []; // The chore isn't scheduled for this future date

        // However, we must ensure we don't show "Past/Current" blocks for future dates if the queue hasn't advanced.
        // The blocks[] array represents "Remaining Work".
        // Block 0 is "Work to be done next".

        // If Anchor Date is Today, and Today is scheduled:
        // - Today shows Block 0.
        // - Next occurrence shows Block 1.

        // If Anchor Date is Today, and Today is NOT scheduled:
        // - Next occurrence (e.g. Thu) shows Block 0.

        // This simple indexing works! occurrenceIndex 0 -> Block 0.

        return normalizedBlocks[blockOffset + occurrenceIndex] || [];
    }

    return [];
}

/**
 * Checks if the given viewDate falls within the "Active Range" of a task series.
 * The Active Range is defined as:
 * - Start: Date of the FIRST non-break task (completed or projected).
 * - End: Date of the LAST non-break task (completed or projected).
 * * Returns TRUE if:
 * 1. viewDate is between Start and End (inclusive).
 * 2. viewDate is a valid scheduled occurrence for the Chore.
 */
export function isSeriesActiveForDate(
    allTasks: Task[],
    rruleString: string | null,
    choreStartDateString: string,
    viewDate: Date,
    seriesStartDateString?: string | null,
    exdates?: string[] | null,
    pullForwardCount?: number
): boolean {
    if (!allTasks || allTasks.length === 0) return false;

    const utcViewDate = toUTCDate(viewDate);
    const schedule = {
        startDate: choreStartDateString,
        rrule: rruleString,
        exdates: exdates || [],
    };

    // 1. Basic Schedule Check
    if (!rruleString && toUTCDate(new Date(choreStartDateString)).getTime() !== utcViewDate.getTime()) {
        return false;
    }
    if (rruleString) {
        const isScheduled = choreOccursOnDate(schedule, utcViewDate);
        if (!isScheduled) return false;
    }

    const visibleTasks = getTasksForDate(allTasks, rruleString, choreStartDateString, viewDate, seriesStartDateString, exdates, pullForwardCount);
    if (visibleTasks.length > 0) {
        return true;
    }

    return allTasks.some((task) => isActionableTask(task, allTasks) && ['blocked', 'skipped', 'needs_review'].includes(getTaskWorkflowState(task)));
}

export function getRecursiveTaskCompletionTransactions(taskId: string, isCompleted: boolean, allTasks: Task[], completedOnDateStr: string, actorFamilyMemberId?: string, affectedFamilyMemberId?: string): any[] {
    const targetTask = allTasks.find((task) => task.id === taskId);
    const nextState = isCompleted ? 'done' : targetTask?.lastActiveState === 'in_progress' ? 'in_progress' : 'not_started';

    return buildTaskUpdateTransactions({
        tx,
        taskId,
        allTasks,
        nextState,
        selectedDateKey: completedOnDateStr,
        createId,
        actorFamilyMemberId: actorFamilyMemberId || '',
        affectedFamilyMemberId: affectedFamilyMemberId || '',
    }).transactions;
}
