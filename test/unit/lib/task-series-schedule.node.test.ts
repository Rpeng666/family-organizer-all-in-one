import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    countTaskDayBlocks,
    countCompletedTaskDayBlocks,
    getCurrentTaskDayBlockIndex,
    getTaskDayBlocks,
    canPullForward,
    areTodayTasksFinished,
    computeScheduleDrift,
    type ChoreScheduleInfo,
} from '@/lib/task-series-schedule';
import type { Task } from '@/lib/task-scheduler';

// Helper to build minimal tasks for testing
function makeTask(overrides: Partial<Task> & { id: string }): Task {
    return {
        text: 'Test task',
        isCompleted: false,
        isDayBreak: false,
        order: 0,
        ...overrides,
    };
}

function makeDayBreak(id: string, order: number): Task {
    return makeTask({ id, isDayBreak: true, order, text: '---' });
}

describe('task-series-schedule', () => {
    describe('countTaskDayBlocks', () => {
        it('returns 1 for tasks with no day-breaks', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, text: 'A' }),
                makeTask({ id: '2', order: 1, text: 'B' }),
            ];
            expect(countTaskDayBlocks(tasks)).toBe(1);
        });

        it('returns correct count with day-breaks', () => {
            const tasks = [
                makeTask({ id: '1', order: 0 }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
                makeDayBreak('db2', 3),
                makeTask({ id: '3', order: 4 }),
            ];
            expect(countTaskDayBlocks(tasks)).toBe(3);
        });

        it('returns 0 for empty task list', () => {
            expect(countTaskDayBlocks([])).toBe(0);
        });

        it('returns 0 for only day-breaks', () => {
            const tasks = [makeDayBreak('db1', 0), makeDayBreak('db2', 1)];
            expect(countTaskDayBlocks(tasks)).toBe(0);
        });

        it('ignores parent tasks (tasks with children)', () => {
            const tasks = [
                makeTask({ id: 'parent', order: 0, text: 'Parent' }),
                makeTask({ id: 'child1', order: 1, text: 'Child 1', parentTask: [{ id: 'parent' }] }),
                makeTask({ id: 'child2', order: 2, text: 'Child 2', parentTask: [{ id: 'parent' }] }),
                makeDayBreak('db1', 3),
                makeTask({ id: '3', order: 4 }),
            ];
            // parent has children so is not actionable; child1, child2 are in block 0; task 3 is block 1
            expect(countTaskDayBlocks(tasks)).toBe(2);
        });
    });

    describe('countCompletedTaskDayBlocks', () => {
        it('returns 0 when no blocks are complete', () => {
            const tasks = [
                makeTask({ id: '1', order: 0 }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
            ];
            expect(countCompletedTaskDayBlocks(tasks)).toBe(0);
        });

        it('counts blocks where all tasks are done', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, workflowState: 'done', isCompleted: true }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
                makeDayBreak('db2', 3),
                makeTask({ id: '3', order: 4, workflowState: 'done', isCompleted: true }),
            ];
            expect(countCompletedTaskDayBlocks(tasks)).toBe(2); // blocks 0 and 2
        });

        it('does not count partially complete blocks', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, workflowState: 'done', isCompleted: true }),
                makeTask({ id: '2', order: 1 }), // not done, same block
            ];
            expect(countCompletedTaskDayBlocks(tasks)).toBe(0);
        });
    });

    describe('getCurrentTaskDayBlockIndex', () => {
        it('returns 0 when first block has incomplete tasks', () => {
            const tasks = [
                makeTask({ id: '1', order: 0 }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
            ];
            expect(getCurrentTaskDayBlockIndex(tasks)).toBe(0);
        });

        it('returns 1 when first block is complete', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, workflowState: 'done', isCompleted: true }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
            ];
            expect(getCurrentTaskDayBlockIndex(tasks)).toBe(1);
        });

        it('returns total blocks when all are done', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, workflowState: 'done', isCompleted: true }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2, workflowState: 'done', isCompleted: true }),
            ];
            expect(getCurrentTaskDayBlockIndex(tasks)).toBe(2);
        });
    });

    describe('canPullForward', () => {
        it('returns false when workAheadAllowed is false', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, workflowState: 'done', isCompleted: true }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
            ];
            expect(canPullForward(false, tasks, 0)).toBe(false);
        });

        it('returns false when workAheadAllowed is null', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, workflowState: 'done', isCompleted: true }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
            ];
            expect(canPullForward(null, tasks, 0)).toBe(false);
        });

        it('returns true when workAheadAllowed and there are future blocks', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, workflowState: 'done', isCompleted: true }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
                makeDayBreak('db2', 3),
                makeTask({ id: '3', order: 4 }),
            ];
            // current = block 1 (first incomplete), effective = 1 + 0 = 1, total = 3
            expect(canPullForward(true, tasks, 0)).toBe(true);
        });

        it('returns false when there are no more future blocks to pull', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, workflowState: 'done', isCompleted: true }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
            ];
            // current = block 1, effective = 1, total = 2; 1 is NOT < 2-1=1
            expect(canPullForward(true, tasks, 0)).toBe(false);
        });

        it('accounts for existing pullForwardCount', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, workflowState: 'done', isCompleted: true }),
                makeDayBreak('db1', 1),
                makeTask({ id: '2', order: 2 }),
                makeDayBreak('db2', 3),
                makeTask({ id: '3', order: 4 }),
            ];
            // current = block 1, effective = 1 + 1 = 2, total = 3; 2 is NOT < 3-1=2
            expect(canPullForward(true, tasks, 1)).toBe(false);
        });
    });

    describe('areTodayTasksFinished', () => {
        it('returns false for empty tasks', () => {
            expect(areTodayTasksFinished([])).toBe(false);
        });

        it('returns false if any task is not_started', () => {
            const tasks = [
                makeTask({ id: '1', workflowState: 'done' }),
                makeTask({ id: '2', workflowState: 'not_started' }),
            ];
            expect(areTodayTasksFinished(tasks)).toBe(false);
        });

        it('returns false if any task is in_progress', () => {
            const tasks = [
                makeTask({ id: '1', workflowState: 'done' }),
                makeTask({ id: '2', workflowState: 'in_progress' }),
            ];
            expect(areTodayTasksFinished(tasks)).toBe(false);
        });

        it('returns true when all tasks are in bucket states', () => {
            const tasks = [
                makeTask({ id: '1', workflowState: 'done' }),
                makeTask({ id: '2', workflowState: 'blocked' }),
                makeTask({ id: '3', workflowState: 'skipped' }),
                makeTask({ id: '4', workflowState: 'needs_review' }),
            ];
            expect(areTodayTasksFinished(tasks)).toBe(true);
        });
    });

    describe('computeScheduleDrift', () => {
        it('returns on_target when dates are equal', () => {
            const schedule: ChoreScheduleInfo = {
                startDate: '2026-01-01',
                rruleString: 'RRULE:FREQ=DAILY',
                seriesStartDate: null,
                exdates: [],
            };
            const result = computeScheduleDrift('2026-01-10', '2026-01-10', schedule);
            expect(result.status).toBe('on_target');
            expect(result.days).toBe(0);
        });

        it('returns on_target when plannedEndDate is null', () => {
            const schedule: ChoreScheduleInfo = {
                startDate: '2026-01-01',
                rruleString: 'RRULE:FREQ=DAILY',
                seriesStartDate: null,
                exdates: [],
            };
            const result = computeScheduleDrift(null, '2026-01-10', schedule);
            expect(result.status).toBe('on_target');
        });

        it('returns ahead when live end is before planned end', () => {
            const schedule: ChoreScheduleInfo = {
                startDate: '2026-01-01',
                rruleString: 'RRULE:FREQ=DAILY',
                seriesStartDate: null,
                exdates: [],
            };
            const result = computeScheduleDrift('2026-01-10', '2026-01-07', schedule);
            expect(result.status).toBe('ahead');
            expect(result.days).toBe(3);
        });

        it('returns behind when live end is after planned end', () => {
            const schedule: ChoreScheduleInfo = {
                startDate: '2026-01-01',
                rruleString: 'RRULE:FREQ=DAILY',
                seriesStartDate: null,
                exdates: [],
            };
            const result = computeScheduleDrift('2026-01-10', '2026-01-15', schedule);
            expect(result.status).toBe('behind');
            expect(result.days).toBe(5);
        });
    });

    describe('getTaskDayBlocks', () => {
        it('splits tasks correctly by day-breaks', () => {
            const tasks = [
                makeTask({ id: '1', order: 0, text: 'A' }),
                makeTask({ id: '2', order: 1, text: 'B' }),
                makeDayBreak('db1', 2),
                makeTask({ id: '3', order: 3, text: 'C' }),
            ];
            const blocks = getTaskDayBlocks(tasks);
            expect(blocks).toHaveLength(2);
            expect(blocks[0].tasks.map(t => t.id)).toEqual(['1', '2']);
            expect(blocks[1].tasks.map(t => t.id)).toEqual(['3']);
        });
    });
});
