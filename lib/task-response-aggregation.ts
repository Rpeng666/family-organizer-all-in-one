// lib/task-response-aggregation.ts
// Utilities for computing series-level grades from individual task updates.

import type { GradeTypeLike } from './task-response-types';
import type { TaskUpdateLike } from './task-progress';

interface TaskWithUpdates {
    id: string;
    weight?: number;
    responseFields?: Array<{ id: string; required: boolean }>;
    updates?: TaskUpdateLike[];
}

export interface SeriesGradeResult {
    /** Weighted (or simple) average of all graded tasks, in the grade type's native scale. */
    average: number;
    /** Number of tasks with at least one grade. */
    gradedCount: number;
    /** Number of tasks that could be graded (have response fields). */
    totalGradable: number;
    /** The grade type used (from the first graded task). */
    gradeType: GradeTypeLike | null;
}

/**
 * Compute a series-level grade from an array of tasks.
 *
 * In the unified update model, grades are inline on taskUpdates:
 * - `gradeNumericValue`, `gradeDisplayValue`, `gradeIsProvisional`
 * - `gradeType` linked relation
 *
 * Only non-draft, non-provisional grades are considered.
 * The latest (by createdAt) graded update per task is used.
 */
export function computeSeriesGrade(tasks: TaskWithUpdates[]): SeriesGradeResult | null {
    const gradable = tasks.filter((t) => t.responseFields && t.responseFields.length > 0);
    if (gradable.length === 0) return null;

    let gradedCount = 0;
    let weightedSum = 0;
    let weightTotal = 0;
    let detectedGradeType: GradeTypeLike | null = null;
    const allWeightsZero = gradable.every((t) => !t.weight || t.weight === 0);

    for (const task of gradable) {
        const updates = task.updates || [];
        // Find the latest non-draft, non-provisional graded update
        const gradedUpdate = updates
            .filter(
                (u) =>
                    !u.isDraft &&
                    !u.gradeIsProvisional &&
                    u.gradeNumericValue != null &&
                    u.gradeDisplayValue != null
            )
            .sort((a, b) => {
                const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
                const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
                return bTime - aTime;
            })[0];

        if (!gradedUpdate || gradedUpdate.gradeNumericValue == null) continue;

        gradedCount++;

        // Detect grade type from first found grade
        if (!detectedGradeType && gradedUpdate.gradeType?.[0]) {
            const gt = gradedUpdate.gradeType[0];
            detectedGradeType = {
                id: gt.id || '',
                name: gt.name || '',
                kind: gt.kind || 'number',
                highValue: 100,
                lowValue: 0,
                highLabel: '100',
                lowLabel: '0',
                isDefault: false,
                order: 0,
            };
        }

        const taskWeight = allWeightsZero ? 1 : (task.weight || 1);
        weightedSum += gradedUpdate.gradeNumericValue * taskWeight;
        weightTotal += taskWeight;
    }

    if (gradedCount === 0 || weightTotal === 0) {
        return {
            average: 0,
            gradedCount: 0,
            totalGradable: gradable.length,
            gradeType: detectedGradeType,
        };
    }

    return {
        average: weightedSum / weightTotal,
        gradedCount,
        totalGradable: gradable.length,
        gradeType: detectedGradeType,
    };
}

/**
 * Get tasks that are in "needs_review" workflow state.
 */
export function getNeedsReviewTasks(tasks: TaskWithUpdates[]): TaskWithUpdates[] {
    return tasks.filter((task) => {
        const updates = task.updates || [];
        const latestNonDraft = updates
            .filter((u) => !u.isDraft)
            .sort((a, b) => {
                const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
                const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
                return bTime - aTime;
            })[0];
        return latestNonDraft?.toState === 'needs_review';
    });
}

/**
 * Get tasks that have been recently graded (have non-provisional grades).
 */
export function getRecentlyGradedTasks(
    tasks: TaskWithUpdates[],
    limit = 5
): Array<{
    task: TaskWithUpdates;
    grade: { numericValue: number; displayValue: string };
    gradedAt: number;
}> {
    const result: Array<{
        task: TaskWithUpdates;
        grade: { numericValue: number; displayValue: string };
        gradedAt: number;
    }> = [];

    for (const task of tasks) {
        const updates = task.updates || [];
        const gradedUpdate = updates
            .filter(
                (u) =>
                    !u.isDraft &&
                    !u.gradeIsProvisional &&
                    u.gradeNumericValue != null &&
                    u.gradeDisplayValue != null
            )
            .sort((a, b) => {
                const aTime = typeof a.createdAt === 'number' ? a.createdAt : new Date(a.createdAt || 0).getTime();
                const bTime = typeof b.createdAt === 'number' ? b.createdAt : new Date(b.createdAt || 0).getTime();
                return bTime - aTime;
            })[0];

        if (!gradedUpdate || gradedUpdate.gradeNumericValue == null || gradedUpdate.gradeDisplayValue == null) continue;

        const gradedAt = typeof gradedUpdate.createdAt === 'number' ? gradedUpdate.createdAt : new Date(gradedUpdate.createdAt || 0).getTime();
        result.push({
            task,
            grade: { numericValue: gradedUpdate.gradeNumericValue, displayValue: gradedUpdate.gradeDisplayValue },
            gradedAt,
        });
    }

    return result
        .sort((a, b) => b.gradedAt - a.gradedAt)
        .slice(0, limit);
}
