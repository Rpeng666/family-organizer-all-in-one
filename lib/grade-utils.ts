// lib/grade-utils.ts
// Utilities for grade type formatting and display.

import type { GradeTypeLike, LetterGradeStep } from './task-response-types';

/**
 * Format a numeric grade value for display based on the grade type.
 */
export function formatGradeDisplay(numericValue: number, gradeType: GradeTypeLike): string {
    switch (gradeType.kind) {
        case 'letter':
            return getLetterGrade(numericValue, gradeType.steps || []);
        case 'stars':
            return renderStarDisplay(numericValue, gradeType.highValue);
        case 'number':
        default:
            return String(Math.round(numericValue * 10) / 10);
    }
}

/**
 * Find the matching letter grade for a numeric value.
 * Steps must be sorted descending by value. Returns the first step
 * whose value is <= the input, or the lowest step label as fallback.
 */
export function getLetterGrade(numericValue: number, steps: LetterGradeStep[]): string {
    if (!steps.length) return String(numericValue);
    const sorted = [...steps].sort((a, b) => b.value - a.value);
    for (const step of sorted) {
        if (numericValue >= step.value) return step.label;
    }
    return sorted[sorted.length - 1].label;
}

/**
 * Render a star display string (e.g., "3/5").
 */
export function renderStarDisplay(numericValue: number, highValue: number): string {
    const stars = Math.round(Math.max(0, Math.min(highValue, numericValue)));
    return `${stars}/${highValue}`;
}

/**
 * Count filled stars for a rating component.
 */
export function renderStarCount(numericValue: number, highValue: number): number {
    return Math.round(Math.max(0, Math.min(highValue, numericValue)));
}

/**
 * Get the default grade type from a list, or null if none.
 */
export function getDefaultGradeType(gradeTypes: GradeTypeLike[]): GradeTypeLike | null {
    return gradeTypes.find((gt) => gt.isDefault) || gradeTypes[0] || null;
}

/**
 * Normalize a numeric grade to 0-1 scale for cross-type comparisons.
 */
export function normalizeGrade(numericValue: number, gradeType: GradeTypeLike): number {
    const range = gradeType.highValue - gradeType.lowValue;
    if (range === 0) return 0;
    return (numericValue - gradeType.lowValue) / range;
}

/**
 * Standard letter grade steps for US grading (A+ through F).
 */
export const US_LETTER_GRADE_STEPS: LetterGradeStep[] = [
    { label: 'A+', value: 97 },
    { label: 'A', value: 93 },
    { label: 'A-', value: 90 },
    { label: 'B+', value: 87 },
    { label: 'B', value: 83 },
    { label: 'B-', value: 80 },
    { label: 'C+', value: 77 },
    { label: 'C', value: 73 },
    { label: 'C-', value: 70 },
    { label: 'D+', value: 67 },
    { label: 'D', value: 63 },
    { label: 'D-', value: 60 },
    { label: 'F', value: 0 },
];
