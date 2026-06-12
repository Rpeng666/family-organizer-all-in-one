import { describe, expect, it } from 'vitest';
import {
    getTaskUpdateStateLabel,
    getTaskUpdateVisibleStates,
    TASK_UPDATE_ALL_STATES,
} from '@/lib/task-update-ui';

describe('task-update-ui helpers', () => {
    it('exposes all workflow states in canonical order', () => {
        expect(TASK_UPDATE_ALL_STATES).toEqual([
            'not_started',
            'in_progress',
            'blocked',
            'skipped',
            'needs_review',
            'done',
        ]);
    });

    it('returns a compact review-mode state set for needs-review tasks', () => {
        expect(getTaskUpdateVisibleStates('needs_review', { isReviewMode: true })).toEqual([
            'needs_review',
            'done',
            'in_progress',
        ]);
    });

    it('returns standard non-review transitions for in-progress tasks', () => {
        expect(getTaskUpdateVisibleStates('in_progress', { isReviewMode: false })).toEqual([
            'in_progress',
            'done',
            'needs_review',
            'blocked',
        ]);
    });

    it('uses friendlier labels for review actions on needs-review tasks', () => {
        expect(getTaskUpdateStateLabel('needs_review', 'done', { isReviewMode: true })).toBe('Approve');
        expect(getTaskUpdateStateLabel('needs_review', 'in_progress', { isReviewMode: true })).toBe('Request Changes');
        expect(getTaskUpdateStateLabel('needs_review', 'blocked', { isReviewMode: true })).toBe('Blocked');
    });
});
