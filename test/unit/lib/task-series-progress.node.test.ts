import { describe, expect, it } from 'vitest';
import { getTaskSeriesProgress, hasScheduledChildren } from '@/lib/task-series-progress';

function makeTask(overrides: Record<string, unknown> = {}) {
    return {
        id: 'task-' + Math.random().toString(36).slice(2, 8),
        text: 'Test Task',
        isCompleted: false,
        isDayBreak: false,
        order: 0,
        ...overrides,
    } as any;
}

describe('task-series-progress helpers', () => {
    describe('hasScheduledChildren', () => {
        it('returns true when a child of the parent is in the scheduled set', () => {
            const parent = makeTask({ id: 'parent' });
            const child = makeTask({ id: 'child', parentTask: [{ id: 'parent' }] });
            const scheduledIds = new Set(['parent', 'child']);

            expect(hasScheduledChildren('parent', scheduledIds, [parent, child])).toBe(true);
        });

        it('returns false when no children are in the scheduled set', () => {
            const parent = makeTask({ id: 'parent' });
            const child = makeTask({ id: 'child', parentTask: [{ id: 'parent' }] });
            const scheduledIds = new Set(['parent']); // child not scheduled

            expect(hasScheduledChildren('parent', scheduledIds, [parent, child])).toBe(false);
        });

        it('returns false for leaf tasks with no children', () => {
            const leaf = makeTask({ id: 'leaf' });
            const scheduledIds = new Set(['leaf']);

            expect(hasScheduledChildren('leaf', scheduledIds, [leaf])).toBe(false);
        });
    });

    describe('getTaskSeriesProgress', () => {
        it('returns completion ratio for actionable tasks', () => {
            const tasks = [
                makeTask({ id: 't1', isCompleted: true }),
                makeTask({ id: 't2', isCompleted: false }),
                makeTask({ id: 't3', isCompleted: true }),
            ];

            expect(getTaskSeriesProgress(tasks, tasks)).toBeCloseTo(2 / 3);
        });

        it('excludes parent tasks with scheduled children from the ratio', () => {
            const parent = makeTask({ id: 'parent', isCompleted: false });
            const child1 = makeTask({ id: 'child1', isCompleted: true, parentTask: [{ id: 'parent' }] });
            const child2 = makeTask({ id: 'child2', isCompleted: false, parentTask: [{ id: 'parent' }] });
            const standalone = makeTask({ id: 'standalone', isCompleted: true });

            const scheduled = [parent, child1, child2, standalone];

            // parent excluded (has children in scheduled), actionable = [child1, child2, standalone]
            expect(getTaskSeriesProgress(scheduled, scheduled)).toBeCloseTo(2 / 3);
        });

        it('returns null for empty scheduled tasks', () => {
            expect(getTaskSeriesProgress([], [])).toBeNull();
        });

        it('returns 1.0 when all leaf tasks are complete', () => {
            const parent = makeTask({ id: 'p', isCompleted: false });
            const child = makeTask({ id: 'c', isCompleted: true, parentTask: [{ id: 'p' }] });

            // parent excluded, actionable = [child], 1/1 completed
            expect(getTaskSeriesProgress([parent, child], [parent, child])).toBe(1.0);
        });

        it('returns 0 when no actionable tasks are completed', () => {
            const tasks = [
                makeTask({ id: 't1', isCompleted: false }),
                makeTask({ id: 't2', isCompleted: false }),
            ];

            expect(getTaskSeriesProgress(tasks, tasks)).toBe(0);
        });
    });
});
