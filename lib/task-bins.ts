// lib/task-bins.ts
// Filtering, sorting, and utility functions for the Task Bins review page.

import { getChoreOccurrencesInRange } from '@/lib/chore-schedule';
import { toUTCDate } from '@/lib/chore-utils';
import {
    getLatestTaskUpdate,
    getTaskWorkflowState,
    isTaskNoted,
    sortTaskUpdates,
    type TaskUpdateLike,
    type TaskWorkflowState,
} from '@/lib/task-progress';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaskBinScheduledActivity =
    | {
          startDate?: number | string | Date | null;
          rrule?: string | null;
          exdates?: string[] | null;
      }
    | null
    | undefined;

type TaskBinSeries =
    | {
          id: string;
          name?: string | null;
          startDate?: number | string | Date | null;
          familyMember?: Array<{ id: string }> | { id: string } | null;
          scheduledActivity?: Array<NonNullable<TaskBinScheduledActivity>> | TaskBinScheduledActivity;
      }
    | null
    | undefined;

export interface TaskBinTask {
    id: string;
    text: string;
    isDayBreak?: boolean | null;
    isCompleted?: boolean | null;
    completedOnDate?: string | null;
    order?: number | null;
    workflowState?: string | null;
    notedUntilDate?: string | null;
    isNotedIndefinitely?: boolean | null;
    updates?: TaskUpdateLike[];
    responseFields?: Array<{
        id: string;
        type: string;
        label: string;
        required: boolean;
        order: number;
    }>;
    taskSeries?: Array<NonNullable<TaskBinSeries>> | TaskBinSeries;
}

export interface TaskBinFilters {
    status?: TaskWorkflowState | 'all';
    familyMemberId?: string | 'all';
    taskSeriesId?: string | 'all';
    showNoted?: boolean;
}

export type TaskBinSort = 'newest' | 'oldest' | 'status';

export interface TaskLatenessInfo {
    kind: 'overdue' | 'submitted_late';
    days: number;
    label: string;
    scheduledDate: string;
    referenceDate: string;
}

export interface TaskBinEntry {
    task: TaskBinTask;
    latestUpdate: TaskUpdateLike | null;
    seriesName: string | null;
    isNoted: boolean;
    isOverdue: boolean;
    lateness: TaskLatenessInfo | null;
}

interface SeriesScheduleContext {
    startDate: string;
    anchorDate: string;
    rruleString: string | null;
    exdates: string[];
}

interface SeriesTaskContext {
    blockIndexByTaskId: Map<string, number>;
    dueDateByBlockIndex: Map<number, string>;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/** Normalize an InstantDB has-one link that may be a single object or a 1-element array. */
function resolveOne<T>(value: T[] | T | null | undefined): T | null {
    if (!value) return null;
    if (Array.isArray(value)) return value[0] ?? null;
    return value;
}

const STATUS_ORDER: Record<TaskWorkflowState, number> = {
    needs_review: 0,
    blocked: 1,
    in_progress: 2,
    not_started: 3,
    skipped: 4,
    done: 5,
};

const SUBMITTED_LATE_STATES = new Set<TaskWorkflowState>(['needs_review', 'done']);

/**
 * Determines if a task is late enough to appear in needs-attention.
 */
export function isTaskOverdue(task: TaskBinTask, allTasks: TaskBinTask[] = [task]): boolean {
    return getTaskLatenessInfo(task, allTasks) !== null;
}

/**
 * Converts a flat list of tasks into TaskBinEntries with metadata, applying filters.
 */
export function buildTaskBinEntries(
    tasks: TaskBinTask[],
    filters: TaskBinFilters = {},
    todayKey?: string
): TaskBinEntry[] {
    const today = todayKey || new Date().toISOString().slice(0, 10);
    const seriesContexts = buildSeriesTaskContexts(tasks);

    return tasks
        .map((task): TaskBinEntry | null => {
            const state = getTaskWorkflowState(task);
            const latestUpdate = getLatestTaskUpdate(task);
            const series = resolveOne(task.taskSeries);
            const seriesName = series?.name || null;
            const noted = isTaskNoted(task, today);
            const lateness = getTaskLatenessInfo(task, tasks, today, seriesContexts);
            const overdue = lateness !== null;

            // --- Filters ---
            if (filters.status && filters.status !== 'all' && state !== filters.status) {
                return null;
            }

            // Filter by family member: use the task series owner (familyMember link)
            if (filters.familyMemberId && filters.familyMemberId !== 'all') {
                const owner = series ? resolveOne(series.familyMember) : null;
                if (!owner || owner.id !== filters.familyMemberId) {
                    return null;
                }
            }

            // Filter by task series
            if (filters.taskSeriesId && filters.taskSeriesId !== 'all') {
                if (!series || series.id !== filters.taskSeriesId) {
                    return null;
                }
            }

            // Hide noted tasks unless explicitly showing them
            if (noted && !filters.showNoted) {
                return null;
            }

            return {
                task,
                latestUpdate,
                seriesName,
                isNoted: noted,
                isOverdue: overdue,
                lateness,
            };
        })
        .filter((entry): entry is TaskBinEntry => entry !== null);
}

/**
 * Sorts TaskBinEntries by the given sort mode.
 */
export function sortTaskBinEntries(entries: TaskBinEntry[], sort: TaskBinSort): TaskBinEntry[] {
    const sorted = [...entries];

    switch (sort) {
        case 'newest':
            sorted.sort((a, b) => {
                const aTime = getUpdateTime(a.latestUpdate);
                const bTime = getUpdateTime(b.latestUpdate);
                return bTime - aTime;
            });
            break;
        case 'oldest':
            sorted.sort((a, b) => {
                const aTime = getUpdateTime(a.latestUpdate);
                const bTime = getUpdateTime(b.latestUpdate);
                return aTime - bTime;
            });
            break;
        case 'status':
            sorted.sort((a, b) => {
                const aState = getTaskWorkflowState(a.task) as TaskWorkflowState;
                const bState = getTaskWorkflowState(b.task) as TaskWorkflowState;
                const orderDiff = (STATUS_ORDER[aState] ?? 99) - (STATUS_ORDER[bState] ?? 99);
                if (orderDiff !== 0) return orderDiff;
                // Secondary sort by newest
                return getUpdateTime(b.latestUpdate) - getUpdateTime(a.latestUpdate);
            });
            break;
    }

    return sorted;
}

/**
 * Groups entries into "needs attention" (late, not noted) and "all".
 */
export function groupByAttention(entries: TaskBinEntry[]) {
    const needsAttention = entries.filter((entry) => entry.isOverdue && !entry.isNoted);
    return { needsAttention, all: entries };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSeriesTaskContexts(tasks: TaskBinTask[]): Map<string, SeriesTaskContext> {
    const tasksBySeries = new Map<string, TaskBinTask[]>();

    for (const task of tasks) {
        const series = resolveOne(task.taskSeries);
        if (!series?.id) continue;

        const seriesTasks = tasksBySeries.get(series.id) || [];
        seriesTasks.push(task);
        tasksBySeries.set(series.id, seriesTasks);
    }

    const contexts = new Map<string, SeriesTaskContext>();

    tasksBySeries.forEach((seriesTasks, seriesId) => {
        const series = resolveOne(seriesTasks[0]?.taskSeries);
        const schedule = buildSeriesScheduleContext(series);
        const blockIndexByTaskId = buildBlockIndexByTaskId(seriesTasks);
        const dueDateByBlockIndex = new Map<number, string>();

        if (schedule && blockIndexByTaskId.size > 0) {
            const blockCount = Math.max(...Array.from(blockIndexByTaskId.values())) + 1;
            const dueDates = buildDueDatesForBlocks(schedule, blockCount);
            dueDates.forEach((dateKey, index) => {
                if (dateKey) {
                    dueDateByBlockIndex.set(index, dateKey);
                }
            });
        }

        contexts.set(seriesId, {
            blockIndexByTaskId,
            dueDateByBlockIndex,
        });
    });

    return contexts;
}

function buildBlockIndexByTaskId(tasks: TaskBinTask[]): Map<string, number> {
    const sortedTasks = [...tasks].sort((left, right) => (left.order || 0) - (right.order || 0));
    const blockIndexByTaskId = new Map<string, number>();
    let currentBlockIndex = 0;

    for (const task of sortedTasks) {
        if (task.isDayBreak) {
            currentBlockIndex += 1;
            continue;
        }

        blockIndexByTaskId.set(task.id, currentBlockIndex);
    }

    return blockIndexByTaskId;
}

function getTaskLatenessInfo(
    task: TaskBinTask,
    allTasks: TaskBinTask[],
    todayKey = new Date().toISOString().slice(0, 10),
    seriesContexts = buildSeriesTaskContexts(allTasks),
): TaskLatenessInfo | null {
    const series = resolveOne(task.taskSeries);
    if (!series?.id) return null;

    const currentState = getTaskWorkflowState(task);
    const seriesContext = seriesContexts.get(series.id);
    const blockIndex = seriesContext?.blockIndexByTaskId.get(task.id);
    if (blockIndex == null) return null;

    const scheduledDate = seriesContext?.dueDateByBlockIndex.get(blockIndex);
    if (!scheduledDate) return null;

    const referenceDate = SUBMITTED_LATE_STATES.has(currentState)
        ? getSubmittedReferenceDate(task, currentState)
        : todayKey;
    if (!referenceDate) return null;

    const schedule = buildSeriesScheduleContext(series);
    if (!schedule) return null;

    const daysLate = countLateScheduleDays(schedule, scheduledDate, referenceDate);
    if (daysLate <= 0) return null;

    if (SUBMITTED_LATE_STATES.has(currentState)) {
        return {
            kind: 'submitted_late',
            days: daysLate,
            label: `submitted ${daysLate} ${daysLate === 1 ? 'day' : 'days'} late`,
            scheduledDate,
            referenceDate,
        };
    }

    return {
        kind: 'overdue',
        days: daysLate,
        label: `${daysLate} ${daysLate === 1 ? 'day' : 'days'} overdue`,
        scheduledDate,
        referenceDate,
    };
}

function buildSeriesScheduleContext(series: NonNullable<TaskBinSeries> | null): SeriesScheduleContext | null {
    if (!series) return null;

    const scheduledActivity = resolveOne(series.scheduledActivity);
    const activityStartDate = toDateKey(scheduledActivity?.startDate);
    const seriesStartDate = toDateKey(series.startDate);
    const anchorDate = maxDateKey(seriesStartDate, activityStartDate);
    const startDate = activityStartDate || anchorDate;

    if (!startDate || !anchorDate) return null;

    return {
        startDate,
        anchorDate,
        rruleString: scheduledActivity?.rrule || null,
        exdates: Array.isArray(scheduledActivity?.exdates) ? scheduledActivity.exdates : [],
    };
}

function buildDueDatesForBlocks(schedule: SeriesScheduleContext, blockCount: number): Array<string | null> {
    if (blockCount <= 0) return [];

    if (!schedule.rruleString) {
        return Array.from({ length: blockCount }, (_, index) => addUtcDays(schedule.anchorDate, index));
    }

    const farFuture = new Date(`${schedule.anchorDate}T00:00:00Z`);
    farFuture.setUTCFullYear(farFuture.getUTCFullYear() + Math.max(5, Math.ceil(blockCount / 24) + 1));

    const occurrences = getChoreOccurrencesInRange(
        {
            startDate: schedule.startDate,
            rrule: schedule.rruleString,
            exdates: schedule.exdates,
        },
        new Date(`${schedule.anchorDate}T00:00:00Z`),
        farFuture,
    );

    return Array.from({ length: blockCount }, (_, index) => {
        const occurrence = occurrences[index];
        return occurrence ? toUTCDate(occurrence).toISOString().slice(0, 10) : null;
    });
}

function getSubmittedReferenceDate(task: TaskBinTask, currentState: TaskWorkflowState): string | null {
    const updates = sortTaskUpdates((task.updates || []).filter((update) => !update.isDraft));

    const submissionUpdate = updates.find((update) => {
        if (update.toState !== currentState) return false;
        if (hasResponseContent(update.responseFieldValues)) return true;
        return update.fromState !== currentState;
    });

    if (submissionUpdate?.scheduledForDate) return submissionUpdate.scheduledForDate;
    if (submissionUpdate?.createdAt) return toDateKey(submissionUpdate.createdAt);
    if (currentState === 'done' && task.completedOnDate) return task.completedOnDate;
    return null;
}

function hasResponseContent(
    responseFieldValues: TaskUpdateLike['responseFieldValues'] | null | undefined,
): boolean {
    if (!responseFieldValues || responseFieldValues.length === 0) return false;

    return responseFieldValues.some((value) => {
        const richText = value.richTextContent?.trim() || '';
        const hasRichText = richText.length > 0 && richText !== '<p></p>';
        const hasFile = !!(value.fileUrl && value.fileUrl.trim().length > 0);
        return hasRichText || hasFile;
    });
}

function countLateScheduleDays(
    schedule: SeriesScheduleContext,
    scheduledDate: string,
    referenceDate: string,
): number {
    if (referenceDate <= scheduledDate) return 0;

    if (!schedule.rruleString) {
        return differenceInCalendarDays(scheduledDate, referenceDate);
    }

    const dayAfterScheduledDate = addUtcDays(scheduledDate, 1);
    return getChoreOccurrencesInRange(
        {
            startDate: schedule.startDate,
            rrule: schedule.rruleString,
            exdates: schedule.exdates,
        },
        new Date(`${dayAfterScheduledDate}T00:00:00Z`),
        new Date(`${referenceDate}T00:00:00Z`),
    ).length;
}

function differenceInCalendarDays(startDateKey: string, endDateKey: string): number {
    const start = new Date(`${startDateKey}T00:00:00Z`).getTime();
    const end = new Date(`${endDateKey}T00:00:00Z`).getTime();
    return Math.max(0, Math.round((end - start) / 86400000));
}

function addUtcDays(dateKey: string, days: number): string {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function maxDateKey(...dateKeys: Array<string | null>): string | null {
    const valid = dateKeys.filter((value): value is string => !!value);
    if (valid.length === 0) return null;
    return valid.sort()[valid.length - 1];
}

function toDateKey(value: number | string | Date | null | undefined): string | null {
    if (!value) return null;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return toUTCDate(date).toISOString().slice(0, 10);
}

function getUpdateTime(update: TaskUpdateLike | null): number {
    if (!update?.createdAt) return 0;
    if (typeof update.createdAt === 'number') return update.createdAt;
    const parsed = new Date(update.createdAt).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}
