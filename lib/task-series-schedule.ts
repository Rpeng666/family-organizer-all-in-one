// lib/task-series-schedule.ts
// Pure functions for task series schedule computation: planned vs live tracking,
// pull-forward eligibility, and schedule drift calculations.

import type { Task } from '@/lib/task-scheduler';
import { isActionableTask, isTaskDone, taskHasChildren } from '@/lib/task-progress';
import { getChoreOccurrencesInRange, getNextChoreOccurrence } from '@/lib/chore-schedule';
import { toUTCDate } from '@/lib/chore-utils';
import { id as createInstantId } from '@instantdb/react';
import { buildHistoryEventTransactions } from '@/lib/history-events';

// ---------------------------------------------------------------------------
// Block counting
// ---------------------------------------------------------------------------

export interface TaskDayBlock {
    index: number;
    tasks: Task[];
}

/**
 * Split sorted tasks into day-blocks (separated by isDayBreak markers).
 * Only includes blocks that contain at least one actionable task definition
 * (the block may be empty of *active* tasks if they're all done, but the
 * block itself existed in the series).
 */
export function getTaskDayBlocks(allTasks: Task[]): TaskDayBlock[] {
    const sorted = [...allTasks].sort((a, b) => (a.order || 0) - (b.order || 0));
    const blocks: TaskDayBlock[] = [];
    let current: Task[] = [];
    let blockHasActionable = false;

    for (const task of sorted) {
        if (task.isDayBreak) {
            if (current.length > 0 || blockHasActionable) {
                blocks.push({ index: blocks.length, tasks: current });
            }
            current = [];
            blockHasActionable = false;
            continue;
        }

        if (!isActionableTask(task, sorted)) continue;
        blockHasActionable = true;
        current.push(task);
    }

    if (current.length > 0 || blockHasActionable) {
        blocks.push({ index: blocks.length, tasks: current });
    }

    return blocks;
}

/** Count total task-day blocks. */
export function countTaskDayBlocks(allTasks: Task[]): number {
    return getTaskDayBlocks(allTasks).length;
}

/** Count how many task-day blocks are fully completed. */
export function countCompletedTaskDayBlocks(allTasks: Task[]): number {
    const blocks = getTaskDayBlocks(allTasks);
    return blocks.filter(
        (block) => block.tasks.length > 0 && block.tasks.every((task) => isTaskDone(task))
    ).length;
}

/** Find the index of the first incomplete block (or total blocks if all done). */
export function getCurrentTaskDayBlockIndex(allTasks: Task[]): number {
    const blocks = getTaskDayBlocks(allTasks);
    for (let i = 0; i < blocks.length; i++) {
        if (blocks[i].tasks.some((task) => !isTaskDone(task))) {
            return i;
        }
    }
    return blocks.length;
}

// ---------------------------------------------------------------------------
// Schedule projection
// ---------------------------------------------------------------------------

export interface ChoreScheduleInfo {
    startDate: string;
    rruleString: string | null;
    seriesStartDate: string | null;
    exdates: string[];
}

function getAnchorDate(seriesStartDate: string | null): Date {
    const today = toUTCDate(new Date());
    if (seriesStartDate) {
        const seriesStart = toUTCDate(new Date(seriesStartDate));
        if (seriesStart.getTime() > today.getTime()) return seriesStart;
    }
    return today;
}

/**
 * Get the Nth chore occurrence starting from the anchor date.
 * Returns null if rruleString is null or there aren't enough occurrences.
 */
function getNthOccurrence(schedule: ChoreScheduleInfo, n: number): Date | null {
    if (!schedule.rruleString || n < 0) return null;

    const anchor = getAnchorDate(schedule.seriesStartDate);

    // Search a wide window — 5 years should cover any reasonable series
    const farFuture = new Date(anchor.getTime());
    farFuture.setFullYear(farFuture.getFullYear() + 5);

    const choreSchedule = {
        startDate: schedule.startDate,
        rrule: schedule.rruleString,
        exdates: schedule.exdates,
    };

    const occurrences = getChoreOccurrencesInRange(choreSchedule, anchor, farFuture);
    return occurrences[n] ? toUTCDate(occurrences[n]) : null;
}

/**
 * Compute the planned end date: the date of the last chore occurrence needed
 * to complete all task-day blocks, starting from the anchor date.
 */
export function computePlannedEndDate(schedule: ChoreScheduleInfo, totalTaskDays: number): string | null {
    if (totalTaskDays <= 0) return null;
    const lastOccurrence = getNthOccurrence(schedule, totalTaskDays - 1);
    return lastOccurrence ? lastOccurrence.toISOString().slice(0, 10) : null;
}

/**
 * Compute the live projected end date based on remaining work and pull-forward state.
 */
export function computeLiveProjectedEndDate(
    schedule: ChoreScheduleInfo,
    totalTaskDays: number,
    completedTaskDays: number,
    pullForwardCount: number
): string | null {
    const remaining = totalTaskDays - completedTaskDays;
    if (remaining <= 0) return null; // all done

    // The current block index (after pull-forward) determines where we are in the occurrence sequence
    // Remaining blocks map to remaining occurrences from the anchor
    const effectiveStartOccurrence = completedTaskDays + pullForwardCount;
    const endOccurrence = effectiveStartOccurrence + remaining - 1;

    const lastOccurrence = getNthOccurrence(schedule, endOccurrence);
    return lastOccurrence ? lastOccurrence.toISOString().slice(0, 10) : null;
}

// ---------------------------------------------------------------------------
// Schedule drift
// ---------------------------------------------------------------------------

export interface ScheduleDrift {
    status: 'on_target' | 'ahead' | 'behind';
    days: number; // in scheduled task-days
    label: string;
}

/**
 * Compute schedule drift between planned and live end dates.
 * "days" means scheduled task-days (chore occurrences), not calendar days.
 */
export function computeScheduleDrift(
    plannedEndDate: string | null,
    liveEndDate: string | null,
    schedule: ChoreScheduleInfo
): ScheduleDrift {
    if (!plannedEndDate || !liveEndDate) {
        return { status: 'on_target', days: 0, label: 'On target' };
    }

    if (plannedEndDate === liveEndDate) {
        return { status: 'on_target', days: 0, label: 'On target' };
    }

    // Count how many chore occurrences separate the two dates
    const choreSchedule = {
        startDate: schedule.startDate,
        rrule: schedule.rruleString,
        exdates: schedule.exdates,
    };

    if (!schedule.rruleString) {
        return { status: 'on_target', days: 0, label: 'On target' };
    }

    const [earlier, later] = plannedEndDate < liveEndDate
        ? [plannedEndDate, liveEndDate]
        : [liveEndDate, plannedEndDate];

    const start = toUTCDate(new Date(earlier));
    const end = toUTCDate(new Date(later));

    // Count occurrences between the two dates, excluding the start date
    // to get the number of scheduled task-days of difference.
    const startPlusOne = new Date(start.getTime());
    startPlusOne.setUTCDate(startPlusOne.getUTCDate() + 1);

    const occurrences = getChoreOccurrencesInRange(choreSchedule, startPlusOne, end);
    const diff = occurrences.length;

    if (liveEndDate < plannedEndDate) {
        return {
            status: 'ahead',
            days: diff,
            label: diff === 1 ? '1 day ahead' : `${diff} days ahead`,
        };
    }

    return {
        status: 'behind',
        days: diff,
        label: diff === 1 ? '1 day behind' : `${diff} days behind`,
    };
}

// ---------------------------------------------------------------------------
// Pull-forward eligibility
// ---------------------------------------------------------------------------

/**
 * Check if the series can pull forward the next task-day.
 * Requires workAheadAllowed AND at least one future block beyond the current one.
 */
export function canPullForward(
    workAheadAllowed: boolean | null | undefined,
    allTasks: Task[],
    pullForwardCount: number
): boolean {
    if (!workAheadAllowed) return false;

    const blocks = getTaskDayBlocks(allTasks);
    const currentIndex = getCurrentTaskDayBlockIndex(allTasks);
    const effectiveIndex = currentIndex + pullForwardCount;

    // There must be at least one block beyond the effective current
    return effectiveIndex < blocks.length - 1;
}

/**
 * Get the date that the next pullable block is originally scheduled for.
 */
export function getNextPullableDate(
    schedule: ChoreScheduleInfo,
    allTasks: Task[],
    pullForwardCount: number
): string | null {
    const blocks = getTaskDayBlocks(allTasks);
    const currentIndex = getCurrentTaskDayBlockIndex(allTasks);
    const nextBlockOccurrenceIndex = currentIndex + pullForwardCount + 1;

    if (nextBlockOccurrenceIndex >= blocks.length) return null;

    const occurrence = getNthOccurrence(schedule, nextBlockOccurrenceIndex);
    return occurrence ? occurrence.toISOString().slice(0, 10) : null;
}

// ---------------------------------------------------------------------------
// Today's tasks finished check
// ---------------------------------------------------------------------------

/**
 * Check if all of today's tasks for a series are in a "finished" state
 * (not not_started or in_progress).
 */
export function areTodayTasksFinished(todayTasks: Task[]): boolean {
    if (todayTasks.length === 0) return false;
    return todayTasks.every((task) => {
        const state = task.workflowState || (task.isCompleted ? 'done' : 'not_started');
        return state !== 'not_started' && state !== 'in_progress';
    });
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface BuildPullForwardParams {
    tx: any;
    seriesId: string;
    currentPullForwardCount: number;
    actorFamilyMemberId?: string | null;
    choreId?: string | null;
    originalScheduledDate: string;
}

export function buildPullForwardTransactions(params: BuildPullForwardParams) {
    const newCount = (params.currentPullForwardCount || 0) + 1;
    const transactions: any[] = [
        params.tx.taskSeries[params.seriesId].update({
            pullForwardCount: newCount,
            updatedAt: new Date(),
        }),
    ];

    const createId = createInstantId;
    const historyResult = buildHistoryEventTransactions({
        tx: params.tx,
        createId,
        domain: 'tasks',
        actionType: 'task_series_pull_forward',
        summary: `Pulled forward tasks from ${params.originalScheduledDate}`,
        actorFamilyMemberId: params.actorFamilyMemberId || null,
        taskSeriesId: params.seriesId,
        choreId: params.choreId || null,
        metadata: {
            originalScheduledDate: params.originalScheduledDate,
            pullForwardCount: newCount,
        },
    });

    return {
        transactions: [...transactions, ...historyResult.transactions],
        historyEventId: historyResult.eventId,
    };
}

export interface BuildUndoPullForwardParams {
    tx: any;
    seriesId: string;
    currentPullForwardCount: number;
    historyEventId?: string | null;
}

export function buildUndoPullForwardTransactions(params: BuildUndoPullForwardParams) {
    const newCount = Math.max(0, (params.currentPullForwardCount || 0) - 1);
    const transactions: any[] = [
        params.tx.taskSeries[params.seriesId].update({
            pullForwardCount: newCount,
            updatedAt: new Date(),
        }),
    ];

    if (params.historyEventId) {
        transactions.push(params.tx.historyEvents[params.historyEventId].delete());
    }

    return transactions;
}

export interface BuildCatchUpParams {
    tx: any;
    seriesId: string;
    newPlannedEndDate: string;
    currentDayBreakCount: number;
    actorFamilyMemberId?: string | null;
    choreId?: string | null;
}

export function buildCatchUpTransactions(params: BuildCatchUpParams) {
    const transactions: any[] = [
        params.tx.taskSeries[params.seriesId].update({
            plannedEndDate: new Date(params.newPlannedEndDate + 'T00:00:00Z').valueOf(),
            baselineDayBreakCount: params.currentDayBreakCount,
            updatedAt: new Date(),
        }),
    ];

    const createId = createInstantId;
    const historyResult = buildHistoryEventTransactions({
        tx: params.tx,
        createId,
        domain: 'tasks',
        actionType: 'task_series_catch_up',
        summary: 'Schedule caught up to current progress',
        actorFamilyMemberId: params.actorFamilyMemberId || null,
        taskSeriesId: params.seriesId,
        choreId: params.choreId || null,
        metadata: {
            newPlannedEndDate: params.newPlannedEndDate,
        },
    });

    return [...transactions, ...historyResult.transactions];
}
