import { describe, expect, it } from 'vitest';
import {
    computeSeriesGrade,
    getNeedsReviewTasks,
    getRecentlyGradedTasks,
} from '@/lib/task-response-aggregation';

const makeGradeType = (id = 'pct') => [
    { id, kind: 'number', name: 'Percentage' },
];

const makeTask = (
    id: string,
    overrides: {
        weight?: number;
        responseFields?: Array<{ id: string; required: boolean }>;
        updates?: any[];
    } = {}
) => ({
    id,
    weight: overrides.weight,
    responseFields: overrides.responseFields || [{ id: `field-${id}`, required: true }],
    updates: overrides.updates || [],
});

describe('computeSeriesGrade', () => {
    it('returns null when no tasks have response fields', () => {
        const tasks = [makeTask('t1', { responseFields: [] })];
        expect(computeSeriesGrade(tasks)).toBeNull();
    });

    it('returns 0 graded count when no updates have grades', () => {
        const tasks = [
            makeTask('t1', {
                updates: [{ id: 'u1', isDraft: false, toState: 'needs_review', createdAt: 1000 }],
            }),
        ];
        const result = computeSeriesGrade(tasks);
        expect(result).not.toBeNull();
        expect(result!.gradedCount).toBe(0);
        expect(result!.totalGradable).toBe(1);
    });

    it('computes simple average when all weights are 0', () => {
        const tasks = [
            makeTask('t1', {
                weight: 0,
                updates: [
                    {
                        id: 'u1',
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 80,
                        gradeDisplayValue: '80',
                        gradeType: makeGradeType(),
                        createdAt: 1000,
                    },
                ],
            }),
            makeTask('t2', {
                weight: 0,
                updates: [
                    {
                        id: 'u2',
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 90,
                        gradeDisplayValue: '90',
                        gradeType: makeGradeType(),
                        createdAt: 1000,
                    },
                ],
            }),
        ];
        const result = computeSeriesGrade(tasks);
        expect(result!.average).toBe(85);
        expect(result!.gradedCount).toBe(2);
        expect(result!.totalGradable).toBe(2);
    });

    it('computes weighted average when tasks have weights', () => {
        const tasks = [
            makeTask('t1', {
                weight: 2,
                updates: [
                    {
                        id: 'u1',
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 100,
                        gradeDisplayValue: '100',
                        gradeType: makeGradeType(),
                        createdAt: 1000,
                    },
                ],
            }),
            makeTask('t2', {
                weight: 1,
                updates: [
                    {
                        id: 'u2',
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 70,
                        gradeDisplayValue: '70',
                        gradeType: makeGradeType(),
                        createdAt: 1000,
                    },
                ],
            }),
        ];
        const result = computeSeriesGrade(tasks);
        // (100*2 + 70*1) / (2+1) = 270/3 = 90
        expect(result!.average).toBe(90);
    });

    it('uses latest graded update when multiple exist', () => {
        const tasks = [
            makeTask('t1', {
                updates: [
                    {
                        id: 'u1',
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 60,
                        gradeDisplayValue: '60',
                        gradeType: makeGradeType(),
                        createdAt: 1000,
                    },
                    {
                        id: 'u2',
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 95,
                        gradeDisplayValue: '95',
                        gradeType: makeGradeType(),
                        createdAt: 2000,
                    },
                ],
            }),
        ];
        const result = computeSeriesGrade(tasks);
        expect(result!.average).toBe(95);
    });

    it('skips ungraded tasks in average', () => {
        const tasks = [
            makeTask('t1', {
                updates: [
                    {
                        id: 'u1',
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 80,
                        gradeDisplayValue: '80',
                        gradeType: makeGradeType(),
                        createdAt: 1000,
                    },
                ],
            }),
            makeTask('t2', {
                updates: [{ id: 'u2', isDraft: false, toState: 'needs_review', createdAt: 1000 }],
            }),
        ];
        const result = computeSeriesGrade(tasks);
        expect(result!.average).toBe(80);
        expect(result!.gradedCount).toBe(1);
        expect(result!.totalGradable).toBe(2);
    });

    it('ignores provisional grades', () => {
        const tasks = [
            makeTask('t1', {
                updates: [
                    {
                        id: 'u1',
                        isDraft: false,
                        gradeIsProvisional: true,
                        gradeNumericValue: 60,
                        gradeDisplayValue: '60',
                        gradeType: makeGradeType(),
                        createdAt: 1000,
                    },
                ],
            }),
        ];
        const result = computeSeriesGrade(tasks);
        expect(result!.gradedCount).toBe(0);
    });

    it('ignores draft updates with grades', () => {
        const tasks = [
            makeTask('t1', {
                updates: [
                    {
                        id: 'u1',
                        isDraft: true,
                        gradeIsProvisional: false,
                        gradeNumericValue: 80,
                        gradeDisplayValue: '80',
                        gradeType: makeGradeType(),
                        createdAt: 1000,
                    },
                ],
            }),
        ];
        const result = computeSeriesGrade(tasks);
        expect(result!.gradedCount).toBe(0);
    });
});

describe('getNeedsReviewTasks', () => {
    it('returns tasks whose latest non-draft update is needs_review', () => {
        const tasks = [
            makeTask('t1', { updates: [{ id: 'u1', isDraft: false, toState: 'needs_review', createdAt: 1000 }] }),
            makeTask('t2', { updates: [{ id: 'u2', isDraft: false, toState: 'done', createdAt: 1000 }] }),
            makeTask('t3', { updates: [{ id: 'u3', isDraft: true, toState: 'needs_review', createdAt: 1000 }] }),
        ];
        const result = getNeedsReviewTasks(tasks);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('t1');
    });
});

describe('getRecentlyGradedTasks', () => {
    it('returns graded tasks sorted by most recent', () => {
        const tasks = [
            makeTask('t1', {
                updates: [
                    {
                        id: 'u1',
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 90,
                        gradeDisplayValue: '90',
                        createdAt: 1000,
                    },
                ],
            }),
            makeTask('t2', {
                updates: [
                    {
                        id: 'u2',
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 85,
                        gradeDisplayValue: '85',
                        createdAt: 2000,
                    },
                ],
            }),
        ];
        const result = getRecentlyGradedTasks(tasks);
        expect(result).toHaveLength(2);
        expect(result[0].task.id).toBe('t2');
        expect(result[1].task.id).toBe('t1');
    });

    it('respects limit', () => {
        const tasks = Array.from({ length: 10 }, (_, i) =>
            makeTask(`t${i}`, {
                updates: [
                    {
                        id: `u${i}`,
                        isDraft: false,
                        gradeIsProvisional: false,
                        gradeNumericValue: 80,
                        gradeDisplayValue: '80',
                        createdAt: i * 1000,
                    },
                ],
            })
        );
        const result = getRecentlyGradedTasks(tasks, 3);
        expect(result).toHaveLength(3);
    });
});
