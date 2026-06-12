import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeTime } from '@/test/utils/fake-clock';

const instantMocks = vi.hoisted(() => ({
    tx: new Proxy(
        {},
        {
            get(_root, entity: string) {
                return new Proxy(
                    {},
                    {
                        get(_entityObj, id: string) {
                            return {
                                update(payload: unknown) {
                                    return { op: 'update', entity, id, payload };
                                },
                                link(payload: unknown) {
                                    return { op: 'link', entity, id, payload };
                                },
                            };
                        },
                    }
                );
            },
        }
    ),
}));

let idCounter = 0;
vi.mock('@instantdb/react', () => ({
    tx: instantMocks.tx,
    id: () => `mock-id-${++idCounter}`,
}));

vi.mock('@/lib/db', () => ({
    db: {},
}));

import { getRecursiveTaskCompletionTransactions, getTasksForDate, isSeriesActiveForDate, type Task } from '@/lib/task-scheduler';

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'text' | 'order'>): Task {
    return {
        id: overrides.id,
        text: overrides.text,
        order: overrides.order,
        isCompleted: false,
        isDayBreak: false,
        ...overrides,
    };
}

describe('task-scheduler date logic', () => {
    beforeEach(() => {
        freezeTime(new Date(2026, 2, 10, 12, 0, 0));
    });

    it('returns only tasks completed on a historical date before the anchor', () => {
        const tasks: Task[] = [
            makeTask({ id: 't1', text: 'Completed on Mar 8', order: 1, isCompleted: true, completedOnDate: '2026-03-08' }),
            makeTask({ id: 't2', text: 'Completed today', order: 2, isCompleted: true, completedOnDate: '2026-03-10' }),
            makeTask({ id: 't3', text: 'Pending', order: 3 }),
        ];

        const result = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 8, 12, 0, 0));

        expect(result.map((task) => task.id)).toEqual(['t1']);
    });

    it('projects future blocks by day breaks on recurring schedules', () => {
        const tasks: Task[] = [
            makeTask({ id: 'a', text: 'Block A', order: 1 }),
            makeTask({ id: 'br1', text: 'Break', order: 2, isDayBreak: true }),
            makeTask({ id: 'b', text: 'Block B', order: 3 }),
            makeTask({ id: 'br2', text: 'Break', order: 4, isDayBreak: true }),
            makeTask({ id: 'c', text: 'Block C', order: 5 }),
        ];

        const onAnchor = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 10, 12, 0, 0));
        const nextDay = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 11, 12, 0, 0));
        const twoDaysLater = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 12, 12, 0, 0));

        expect(onAnchor.map((task) => task.id)).toEqual(['a']);
        expect(nextDay.map((task) => task.id)).toEqual(['b']);
        expect(twoDaysLater.map((task) => task.id)).toEqual(['c']);
    });

    it('treats only scheduled dates inside the projected task range as active', () => {
        freezeTime(new Date(2026, 2, 2, 12, 0, 0)); // Monday

        const tasks: Task[] = [
            makeTask({ id: 'a', text: 'Block A', order: 1 }),
            makeTask({ id: 'br1', text: 'Break', order: 2, isDayBreak: true }),
            makeTask({ id: 'b', text: 'Block B', order: 3 }),
        ];

        expect(isSeriesActiveForDate(tasks, 'FREQ=WEEKLY;BYDAY=MO,WE', '2026-03-02', new Date(2026, 2, 3, 12, 0, 0))).toBe(false); // Tue
        expect(isSeriesActiveForDate(tasks, 'FREQ=WEEKLY;BYDAY=MO,WE', '2026-03-02', new Date(2026, 2, 4, 12, 0, 0))).toBe(true); // Wed
        expect(isSeriesActiveForDate(tasks, 'FREQ=WEEKLY;BYDAY=MO,WE', '2026-03-02', new Date(2026, 2, 9, 12, 0, 0))).toBe(false); // next Mon, past range
    });

    it('returns no tasks for future dates that are not scheduled occurrences', () => {
        const tasks: Task[] = [makeTask({ id: 'a', text: 'Block A', order: 1 })];

        const result = getTasksForDate(tasks, 'FREQ=WEEKLY;BYDAY=MO', '2026-03-02', new Date(2026, 2, 11, 12, 0, 0)); // Wed

        expect(result).toEqual([]);
    });

    it('skips projected task blocks on exdate-suppressed chore dates', () => {
        const tasks: Task[] = [
            makeTask({ id: 'a', text: 'Block A', order: 1 }),
            makeTask({ id: 'break', text: 'Break', order: 2, isDayBreak: true }),
            makeTask({ id: 'b', text: 'Block B', order: 3 }),
        ];

        const pausedDay = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 11, 12, 0, 0), null, ['2026-03-11']);
        const resumedDay = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 12, 12, 0, 0), null, ['2026-03-11']);

        expect(pausedDay).toEqual([]);
        expect(resumedDay.map((task) => task.id)).toEqual(['b']);
    });

    it('keeps block 0 visible on an unscheduled anchor day and projects future scheduled occurrences from there', () => {
        freezeTime(new Date(2026, 2, 10, 12, 0, 0)); // Tue

        const tasks: Task[] = [
            makeTask({ id: 'a', text: 'Block A', order: 1 }),
            makeTask({ id: 'break', text: 'Break', order: 2, isDayBreak: true }),
            makeTask({ id: 'b', text: 'Block B', order: 3 }),
        ];

        const today = getTasksForDate(tasks, 'FREQ=WEEKLY;BYDAY=MO,TH', '2026-03-02', new Date(2026, 2, 10, 12, 0, 0)); // Tue (anchor, unscheduled)
        const thursday = getTasksForDate(tasks, 'FREQ=WEEKLY;BYDAY=MO,TH', '2026-03-02', new Date(2026, 2, 12, 12, 0, 0)); // Thu (next scheduled)
        const nextMonday = getTasksForDate(tasks, 'FREQ=WEEKLY;BYDAY=MO,TH', '2026-03-02', new Date(2026, 2, 16, 12, 0, 0)); // Mon

        expect(today.map((task) => task.id)).toEqual(['a']);
        expect(thursday.map((task) => task.id)).toEqual(['a']);
        expect(nextMonday.map((task) => task.id)).toEqual(['b']);
    });

    it('trims a leading ghost day-break after a previously completed task', () => {
        const tasks: Task[] = [
            makeTask({ id: 'done', text: 'Done', order: 1, isCompleted: true, completedOnDate: '2026-03-09' }),
            makeTask({ id: 'break', text: 'Break', order: 2, isDayBreak: true }),
            makeTask({ id: 'next', text: 'Next Block', order: 3 }),
        ];

        const result = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 10, 12, 0, 0));

        expect(result.map((task) => task.id)).toEqual(['next']);
    });

    it('trims trailing day-break markers so they do not create dangling empty future blocks', () => {
        const tasks: Task[] = [
            makeTask({ id: 'only', text: 'Only block', order: 1 }),
            makeTask({ id: 'tail-break', text: 'Tail break', order: 2, isDayBreak: true }),
        ];

        const anchor = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 10, 12, 0, 0));
        const nextDay = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 11, 12, 0, 0));

        expect(anchor.map((task) => task.id)).toEqual(['only']);
        expect(nextDay).toEqual([]);
    });

    it('keeps a task visible on the day it was completed even when viewing after the anchor date', () => {
        freezeTime(new Date(2026, 2, 10, 12, 0, 0)); // Tue anchor

        const tasks: Task[] = [
            makeTask({
                id: 'completed-on-thu',
                text: 'Thursday task',
                order: 1,
                isCompleted: true,
                completedOnDate: '2026-03-12',
            }),
            makeTask({ id: 'break', text: 'Break', order: 2, isDayBreak: true }),
            makeTask({ id: 'next', text: 'Next block', order: 3 }),
        ];

        const thursday = getTasksForDate(
            tasks,
            'FREQ=WEEKLY;BYDAY=MO,TH',
            '2026-03-02',
            new Date(2026, 2, 12, 12, 0, 0)
        );
        expect(thursday.map((task) => task.id)).toEqual(['completed-on-thu']);
    });

    it('marks a child complete and bubbles childTasksComplete to its parent when all children are done', () => {
        freezeTime(new Date('2026-03-10T09:15:00Z'));

        const tasks: Task[] = [
            makeTask({ id: 'parent', text: 'Parent', order: 1, childTasksComplete: false }),
            makeTask({
                id: 'child',
                text: 'Child',
                order: 2,
                childTasksComplete: true,
                parentTask: [{ id: 'parent' }],
            }),
        ];

        const txs = getRecursiveTaskCompletionTransactions('child', true, tasks, '2026-03-10') as any[];

        // Should contain: task state update, taskUpdates row, links, history event, parent sync
        expect(txs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'tasks',
                    id: 'child',
                    payload: expect.objectContaining({
                        isCompleted: true,
                        completedOnDate: '2026-03-10',
                    }),
                }),
                expect.objectContaining({
                    entity: 'taskUpdates',
                    payload: expect.objectContaining({
                        fromState: 'not_started',
                        toState: 'done',
                        scheduledForDate: '2026-03-10',
                    }),
                }),
                expect.objectContaining({
                    entity: 'tasks',
                    id: 'parent',
                    payload: expect.objectContaining({
                        childTasksComplete: true,
                        workflowState: 'done',
                        isCompleted: true,
                        completedOnDate: '2026-03-10',
                    }),
                }),
            ])
        );
        const taskUpdate = txs.find((t: any) => t.entity === 'tasks' && t.id === 'child');
        expect(taskUpdate.payload.completedAt).toBeInstanceOf(Date);
        expect(taskUpdate.payload.completedAt.toISOString()).toBe('2026-03-10T09:15:00.000Z');
    });

    it('marks the parent in progress when another sibling is still incomplete', () => {
        const tasks: Task[] = [
            makeTask({ id: 'parent', text: 'Parent', order: 1, childTasksComplete: false }),
            makeTask({
                id: 'child-1',
                text: 'Child 1',
                order: 2,
                childTasksComplete: true,
                parentTask: [{ id: 'parent' }],
            }),
            makeTask({
                id: 'child-2',
                text: 'Child 2',
                order: 3,
                childTasksComplete: true,
                isCompleted: false,
                parentTask: [{ id: 'parent' }],
            }),
        ];

        const txs = getRecursiveTaskCompletionTransactions('child-1', true, tasks, '2026-03-10') as any[];

        expect(txs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'tasks',
                    id: 'child-1',
                    payload: expect.objectContaining({ isCompleted: true }),
                }),
                expect.objectContaining({
                    entity: 'taskUpdates',
                    payload: expect.objectContaining({
                        toState: 'done',
                    }),
                }),
            ])
        );
        expect(txs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'tasks',
                    id: 'parent',
                    payload: expect.objectContaining({
                        childTasksComplete: false,
                        workflowState: 'in_progress',
                        isCompleted: false,
                    }),
                }),
            ])
        );
    });

    it('unchecking a child clears completion metadata and bubbles childTasksComplete=false to ancestors', () => {
        freezeTime(new Date('2026-03-10T09:15:00Z'));

        const tasks: Task[] = [
            makeTask({ id: 'parent', text: 'Parent', order: 1, childTasksComplete: true }),
            makeTask({
                id: 'child',
                text: 'Child',
                order: 2,
                isCompleted: true,
                childTasksComplete: true,
                completedAt: '2026-03-10T08:00:00Z',
                completedOnDate: '2026-03-10',
                parentTask: [{ id: 'parent' }],
            }),
        ];

        const txs = getRecursiveTaskCompletionTransactions('child', false, tasks, '2026-03-10') as any[];

        expect(txs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    entity: 'tasks',
                    id: 'child',
                    payload: expect.objectContaining({
                        isCompleted: false,
                        completedAt: null,
                        completedOnDate: null,
                    }),
                }),
                expect.objectContaining({
                    entity: 'taskUpdates',
                    payload: expect.objectContaining({
                        fromState: 'done',
                        toState: 'not_started',
                    }),
                }),
            ])
        );
        // Parent should be updated since its only child is being unchecked
        expect(txs).toEqual(expect.arrayContaining([
            expect.objectContaining({
                entity: 'tasks',
                id: 'parent',
                payload: expect.objectContaining({
                    childTasksComplete: false,
                    workflowState: 'not_started',
                    isCompleted: false,
                    completedAt: null,
                    completedOnDate: null,
                }),
            }),
        ]));
    });

    // --- pullForwardCount tests ---

    it('shifts blocks forward by pullForwardCount on anchor date', () => {
        const tasks: Task[] = [
            makeTask({ id: 'a', text: 'Block A', order: 1 }),
            makeTask({ id: 'br1', text: 'Break', order: 2, isDayBreak: true }),
            makeTask({ id: 'b', text: 'Block B', order: 3 }),
            makeTask({ id: 'br2', text: 'Break', order: 4, isDayBreak: true }),
            makeTask({ id: 'c', text: 'Block C', order: 5 }),
        ];

        // pullForwardCount=0 -> block A
        const normal = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 10, 12, 0, 0), null, null, 0);
        expect(normal.map((t) => t.id)).toEqual(['a']);

        // pullForwardCount=1 -> block B
        const pulled1 = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 10, 12, 0, 0), null, null, 1);
        expect(pulled1.map((t) => t.id)).toEqual(['b']);

        // pullForwardCount=2 -> block C
        const pulled2 = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 10, 12, 0, 0), null, null, 2);
        expect(pulled2.map((t) => t.id)).toEqual(['c']);
    });

    it('shifts blocks forward on future dates too', () => {
        const tasks: Task[] = [
            makeTask({ id: 'a', text: 'Block A', order: 1 }),
            makeTask({ id: 'br1', text: 'Break', order: 2, isDayBreak: true }),
            makeTask({ id: 'b', text: 'Block B', order: 3 }),
            makeTask({ id: 'br2', text: 'Break', order: 4, isDayBreak: true }),
            makeTask({ id: 'c', text: 'Block C', order: 5 }),
        ];

        // pullForwardCount=1: anchor date gets block B, next day gets block C
        const nextDay = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 11, 12, 0, 0), null, null, 1);
        expect(nextDay.map((t) => t.id)).toEqual(['c']);
    });

    it('returns empty when pullForwardCount exceeds available blocks', () => {
        const tasks: Task[] = [
            makeTask({ id: 'a', text: 'Block A', order: 1 }),
            makeTask({ id: 'br1', text: 'Break', order: 2, isDayBreak: true }),
            makeTask({ id: 'b', text: 'Block B', order: 3 }),
        ];

        const result = getTasksForDate(tasks, 'FREQ=DAILY', '2026-03-01', new Date(2026, 2, 10, 12, 0, 0), null, null, 5);
        expect(result).toEqual([]);
    });
});
