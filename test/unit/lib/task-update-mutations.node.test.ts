import { beforeEach, describe, expect, it } from 'vitest';
import { freezeTime } from '@/test/utils/fake-clock';
import {
    buildTaskUpdateTransactions,
    validateUpdateSubmission,
    type TaskUpdateTaskLike,
} from '@/lib/task-update-mutations';

const tx = new Proxy(
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
);

let idCounter = 0;

function createId() {
    idCounter += 1;
    return `mock-id-${idCounter}`;
}

function makeTask(overrides: Partial<TaskUpdateTaskLike> & Pick<TaskUpdateTaskLike, 'id'>): TaskUpdateTaskLike {
    return {
        id: overrides.id,
        text: overrides.text ?? overrides.id,
        isCompleted: overrides.isCompleted ?? false,
        completedAt: overrides.completedAt ?? null,
        completedOnDate: overrides.completedOnDate ?? null,
        workflowState: overrides.workflowState ?? (overrides.isCompleted ? 'done' : 'not_started'),
        lastActiveState: overrides.lastActiveState ?? 'not_started',
        deferredUntilDate: overrides.deferredUntilDate ?? null,
        parentTask: overrides.parentTask ?? null,
        childTasksComplete: overrides.childTasksComplete ?? true,
    };
}

function getTaskUpdate(txs: any[], taskId: string) {
    return txs.find((entry) => entry.op === 'update' && entry.entity === 'tasks' && entry.id === taskId);
}

describe('task-update-mutations parent rollups', () => {
    beforeEach(() => {
        freezeTime(new Date('2026-03-10T09:15:00Z'));
        idCounter = 0;
    });

    it('rolls a parent to needs review when every child is done or needs review', () => {
        const allTasks = [
            makeTask({ id: 'parent' }),
            makeTask({ id: 'child-done', parentTask: [{ id: 'parent' }], workflowState: 'done', isCompleted: true, childTasksComplete: true }),
            makeTask({ id: 'child-review', parentTask: [{ id: 'parent' }] }),
        ];

        const { transactions } = buildTaskUpdateTransactions({
            tx,
            createId,
            taskId: 'child-review',
            allTasks,
            nextState: 'needs_review',
            selectedDateKey: '2026-03-10',
            actorFamilyMemberId: 'parent-user',
            affectedFamilyMemberId: 'child-user',
        });

        expect(getTaskUpdate(transactions, 'parent')).toEqual(
            expect.objectContaining({
                payload: expect.objectContaining({
                    workflowState: 'needs_review',
                    isCompleted: false,
                    childTasksComplete: false,
                }),
            })
        );
    });

    it('marks a parent as skipped when a child is skipped and none are blocked', () => {
        const allTasks = [
            makeTask({ id: 'parent' }),
            makeTask({ id: 'child-done', parentTask: [{ id: 'parent' }], workflowState: 'done', isCompleted: true, childTasksComplete: true }),
            makeTask({ id: 'child-skip', parentTask: [{ id: 'parent' }] }),
        ];

        const { transactions } = buildTaskUpdateTransactions({
            tx,
            createId,
            taskId: 'child-skip',
            allTasks,
            nextState: 'skipped',
            selectedDateKey: '2026-03-10',
            actorFamilyMemberId: 'parent-user',
            affectedFamilyMemberId: 'child-user',
        });

        expect(getTaskUpdate(transactions, 'parent')).toEqual(
            expect.objectContaining({
                payload: expect.objectContaining({
                    workflowState: 'skipped',
                    isCompleted: false,
                    childTasksComplete: false,
                }),
            })
        );
    });

    it('treats blocked as higher priority than skipped when multiple child states are mixed', () => {
        const allTasks = [
            makeTask({ id: 'parent' }),
            makeTask({ id: 'child-skip', parentTask: [{ id: 'parent' }], workflowState: 'skipped' }),
            makeTask({ id: 'child-block', parentTask: [{ id: 'parent' }] }),
        ];

        const { transactions } = buildTaskUpdateTransactions({
            tx,
            createId,
            taskId: 'child-block',
            allTasks,
            nextState: 'blocked',
            selectedDateKey: '2026-03-10',
            actorFamilyMemberId: 'parent-user',
            affectedFamilyMemberId: 'child-user',
        });

        expect(getTaskUpdate(transactions, 'parent')).toEqual(
            expect.objectContaining({
                payload: expect.objectContaining({
                    workflowState: 'blocked',
                    isCompleted: false,
                    childTasksComplete: false,
                }),
            })
        );
    });

    it('propagates aggregated parent state through higher ancestors in the same mutation', () => {
        const allTasks = [
            makeTask({ id: 'grandparent' }),
            makeTask({ id: 'parent', parentTask: [{ id: 'grandparent' }], childTasksComplete: false }),
            makeTask({ id: 'leaf', parentTask: [{ id: 'parent' }] }),
        ];

        const { transactions } = buildTaskUpdateTransactions({
            tx,
            createId,
            taskId: 'leaf',
            allTasks,
            nextState: 'skipped',
            selectedDateKey: '2026-03-10',
            actorFamilyMemberId: 'parent-user',
            affectedFamilyMemberId: 'child-user',
        });

        expect(getTaskUpdate(transactions, 'parent')).toEqual(
            expect.objectContaining({
                payload: expect.objectContaining({
                    workflowState: 'skipped',
                }),
            })
        );
        expect(getTaskUpdate(transactions, 'grandparent')).toEqual(
            expect.objectContaining({
                payload: expect.objectContaining({
                    workflowState: 'skipped',
                }),
            })
        );
    });

    it('reopens a done parent when one child moves back to in progress', () => {
        const allTasks = [
            makeTask({
                id: 'parent',
                workflowState: 'done',
                isCompleted: true,
                completedAt: '2026-03-10T09:00:00Z',
                completedOnDate: '2026-03-10',
                childTasksComplete: true,
            }),
            makeTask({
                id: 'child-1',
                parentTask: [{ id: 'parent' }],
                workflowState: 'done',
                isCompleted: true,
                childTasksComplete: true,
            }),
            makeTask({
                id: 'child-2',
                parentTask: [{ id: 'parent' }],
                workflowState: 'done',
                isCompleted: true,
                childTasksComplete: true,
            }),
            makeTask({
                id: 'child-3',
                parentTask: [{ id: 'parent' }],
                workflowState: 'done',
                isCompleted: true,
                childTasksComplete: true,
            }),
        ];

        const { transactions } = buildTaskUpdateTransactions({
            tx,
            createId,
            taskId: 'child-3',
            allTasks,
            nextState: 'in_progress',
            selectedDateKey: '2026-03-10',
            actorFamilyMemberId: 'parent-user',
            affectedFamilyMemberId: 'child-user',
        });

        expect(getTaskUpdate(transactions, 'parent')).toEqual(
            expect.objectContaining({
                payload: expect.objectContaining({
                    workflowState: 'in_progress',
                    lastActiveState: 'in_progress',
                    isCompleted: false,
                    completedAt: null,
                    completedOnDate: null,
                    childTasksComplete: false,
                }),
            })
        );
    });
});

describe('validateUpdateSubmission', () => {
    it('allows parents reviewing an existing submission to mark a task done without refilling required responses', () => {
        const result = validateUpdateSubmission({
            toState: 'done',
            requiredResponseFields: [{ id: 'field-1', required: true }],
            filledFieldIds: new Set<string>(),
            isParentReviewingExistingSubmission: true,
        });

        expect(result).toEqual({ valid: true });
    });
});
