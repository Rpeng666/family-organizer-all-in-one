import { describe, expect, it } from 'vitest';
import {
    formatGradeDisplay,
    getLetterGrade,
    renderStarDisplay,
    renderStarCount,
    getDefaultGradeType,
    normalizeGrade,
    US_LETTER_GRADE_STEPS,
} from '@/lib/grade-utils';
import type { GradeTypeLike } from '@/lib/task-response-types';

const percentageType: GradeTypeLike = {
    id: 'pct',
    name: 'Percentage',
    kind: 'number',
    highValue: 100,
    lowValue: 0,
    highLabel: '100',
    lowLabel: '0',
    isDefault: true,
    order: 0,
};

const letterType: GradeTypeLike = {
    id: 'letter',
    name: 'Letter Grade',
    kind: 'letter',
    highValue: 100,
    lowValue: 0,
    highLabel: 'A+',
    lowLabel: 'F',
    steps: US_LETTER_GRADE_STEPS,
    isDefault: false,
    order: 1,
};

const starType: GradeTypeLike = {
    id: 'star',
    name: '5-Star',
    kind: 'stars',
    highValue: 5,
    lowValue: 0,
    highLabel: '5',
    lowLabel: '0',
    isDefault: false,
    order: 2,
};

describe('formatGradeDisplay', () => {
    it('formats number grades', () => {
        expect(formatGradeDisplay(95.5, percentageType)).toBe('95.5');
        expect(formatGradeDisplay(100, percentageType)).toBe('100');
        expect(formatGradeDisplay(0, percentageType)).toBe('0');
    });

    it('formats letter grades', () => {
        expect(formatGradeDisplay(97, letterType)).toBe('A+');
        expect(formatGradeDisplay(85, letterType)).toBe('B');
        expect(formatGradeDisplay(72, letterType)).toBe('C-');
        expect(formatGradeDisplay(50, letterType)).toBe('F');
    });

    it('formats star grades', () => {
        expect(formatGradeDisplay(4, starType)).toBe('4/5');
        expect(formatGradeDisplay(5, starType)).toBe('5/5');
        expect(formatGradeDisplay(0, starType)).toBe('0/5');
    });
});

describe('getLetterGrade', () => {
    it('returns correct letter for boundary values', () => {
        expect(getLetterGrade(97, US_LETTER_GRADE_STEPS)).toBe('A+');
        expect(getLetterGrade(93, US_LETTER_GRADE_STEPS)).toBe('A');
        expect(getLetterGrade(90, US_LETTER_GRADE_STEPS)).toBe('A-');
    });

    it('returns F for very low scores', () => {
        expect(getLetterGrade(0, US_LETTER_GRADE_STEPS)).toBe('F');
        expect(getLetterGrade(10, US_LETTER_GRADE_STEPS)).toBe('F');
        expect(getLetterGrade(59, US_LETTER_GRADE_STEPS)).toBe('F');
    });

    it('returns numeric string when no steps', () => {
        expect(getLetterGrade(85, [])).toBe('85');
    });
});

describe('renderStarDisplay / renderStarCount', () => {
    it('clamps to range', () => {
        expect(renderStarDisplay(6, 5)).toBe('5/5');
        expect(renderStarDisplay(-1, 5)).toBe('0/5');
        expect(renderStarCount(3, 5)).toBe(3);
        expect(renderStarCount(5.4, 5)).toBe(5);
    });
});

describe('getDefaultGradeType', () => {
    it('returns the default', () => {
        expect(getDefaultGradeType([percentageType, letterType, starType])).toBe(percentageType);
    });

    it('returns first if no default', () => {
        const noDefault = [{ ...letterType, isDefault: false }, { ...starType, isDefault: false }];
        expect(getDefaultGradeType(noDefault)?.id).toBe('letter');
    });

    it('returns null for empty', () => {
        expect(getDefaultGradeType([])).toBeNull();
    });
});

describe('normalizeGrade', () => {
    it('normalizes to 0-1 scale', () => {
        expect(normalizeGrade(75, percentageType)).toBe(0.75);
        expect(normalizeGrade(0, percentageType)).toBe(0);
        expect(normalizeGrade(100, percentageType)).toBe(1);
    });

    it('handles star scale', () => {
        expect(normalizeGrade(3, starType)).toBe(0.6);
        expect(normalizeGrade(5, starType)).toBe(1);
    });
});
