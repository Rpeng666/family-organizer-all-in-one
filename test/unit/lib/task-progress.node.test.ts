import { describe, expect, it } from 'vitest';
import {
    getTaskHistoryEntries,
    getTaskChildProgressPercent,
    getLatestTaskResponseThread,
    getDerivedParentTaskWorkflowState,
    getLatestTaskFeedbackThread,
    getTaskResponseSubmissions,
    getTaskUpdateFeedbackReplies,
    taskUpdateHasMeaningfulFeedbackContent,
    taskUpdateHasStateTransition,
    type TaskUpdateLike,
} from '@/lib/task-progress';

function makeUpdate(id: string, createdAt: number, overrides: Partial<TaskUpdateLike> = {}): TaskUpdateLike {
    return {
        id,
        createdAt,
        isDraft: false,
        toState: 'in_progress',
        fromState: 'in_progress',
        ...overrides,
    };
}

describe('task-progress feedback threading helpers', () => {
    it('sorts response submissions with review-submitted entries before in-progress drafts', () => {
        const submissions = getTaskResponseSubmissions([
            makeUpdate('response-in-progress', 3_000, {
                toState: 'in_progress',
                responseFieldValues: [{ id: 'field-value-1', richTextContent: '<p>Working on it</p>' }],
            }),
            makeUpdate('response-review', 2_000, {
                toState: 'needs_review',
                responseFieldValues: [{ id: 'field-value-2', richTextContent: '<p>Ready for review</p>' }],
            }),
            makeUpdate('response-done', 1_000, {
                toState: 'done',
                responseFieldValues: [{ id: 'field-value-3', richTextContent: '<p>Completed</p>' }],
            }),
        ]);

        expect(submissions.map((entry) => entry.update.id)).toEqual([
            'response-review',
            'response-done',
            'response-in-progress',
        ]);
        expect(submissions.map((entry) => entry.isSubmittedForReview)).toEqual([
            true,
            true,
            false,
        ]);
    });

    it('surfaces the latest reviewed response even when newer no-op updates exist', () => {
        const submission = makeUpdate('submission-1', 1_000, {
            responseFieldValues: [{ id: 'field-value-1', richTextContent: '<p>Initial answer</p>' }],
            replies: [
                makeUpdate('feedback-1', 2_000, {
                    replyTo: [{ id: 'submission-1' }],
                    note: 'Please explain this more clearly.',
                }),
            ],
        });

        const noOpUpdate = makeUpdate('noop-1', 3_000, {
            note: '   ',
        });

        const thread = getLatestTaskFeedbackThread([submission, noOpUpdate]);

        expect(thread?.submission.id).toBe('submission-1');
        expect(thread?.feedbackReplies.map((reply) => reply.id)).toEqual(['feedback-1']);
    });

    it('does not surface older feedback once a newer response has been submitted', () => {
        const submission = makeUpdate('submission-1', 1_000, {
            responseFieldValues: [{ id: 'field-value-1', richTextContent: '<p>Initial answer</p>' }],
            replies: [
                makeUpdate('feedback-1', 2_000, {
                    replyTo: [{ id: 'submission-1' }],
                    note: 'Please revise this.',
                }),
            ],
        });

        const newerSubmission = makeUpdate('submission-2', 4_000, {
            responseFieldValues: [{ id: 'field-value-2', richTextContent: '<p>Revised answer</p>' }],
        });

        expect(getLatestTaskFeedbackThread([submission, newerSubmission])).toBeNull();
    });

    it('treats grade-only replies as meaningful feedback and keeps reply order chronological', () => {
        const replies = [
            makeUpdate('feedback-2', 3_000, {
                replyTo: [{ id: 'submission-1' }],
                gradeDisplayValue: 'A-',
                gradeNumericValue: 91,
            }),
            makeUpdate('feedback-1', 2_000, {
                replyTo: [{ id: 'submission-1' }],
                note: 'Nice improvement.',
            }),
        ];

        expect(taskUpdateHasMeaningfulFeedbackContent(replies[0])).toBe(true);
        expect(getTaskUpdateFeedbackReplies(replies).map((reply) => reply.id)).toEqual(['feedback-1', 'feedback-2']);
    });

    it('treats reply-only status changes as standalone history entries instead of threaded feedback', () => {
        const submission = makeUpdate('submission-1', 1_000, {
            toState: 'needs_review',
            responseFieldValues: [{ id: 'field-value-1', richTextContent: '<p>Initial answer</p>' }],
        });
        const statusOnlyReply = makeUpdate('feedback-1', 2_000, {
            replyTo: [{ id: 'submission-1' }],
            fromState: 'needs_review',
            toState: 'in_progress',
            note: null,
        });

        expect(taskUpdateHasStateTransition(statusOnlyReply)).toBe(true);
        expect(taskUpdateHasMeaningfulFeedbackContent(statusOnlyReply)).toBe(false);
        expect(getTaskUpdateFeedbackReplies([statusOnlyReply])).toEqual([]);
        expect(getTaskHistoryEntries([submission, statusOnlyReply]).map((entry) => entry.id)).toEqual(['feedback-1', 'submission-1']);
    });

    it('returns the latest response even when it has no feedback yet', () => {
        const olderSubmission = makeUpdate('submission-1', 1_000, {
            responseFieldValues: [{ id: 'field-value-1', richTextContent: '<p>Initial answer</p>' }],
            replies: [
                makeUpdate('feedback-1', 2_000, {
                    replyTo: [{ id: 'submission-1' }],
                    note: 'Please revise this.',
                }),
            ],
        });
        const newerSubmission = makeUpdate('submission-2', 4_000, {
            responseFieldValues: [{ id: 'field-value-2', richTextContent: '<p>Revised answer</p>' }],
        });

        const thread = getLatestTaskResponseThread([olderSubmission, newerSubmission]);

        expect(thread?.submission.id).toBe('submission-2');
        expect(thread?.feedbackReplies).toEqual([]);
        expect(getLatestTaskFeedbackThread([olderSubmission, newerSubmission])).toBeNull();
    });
});

describe('task-progress parent workflow aggregation', () => {
    function makeTaskState(state: string) {
        return {
            workflowState: state,
            isCompleted: state === 'done',
        } as const;
    }

    it('marks a parent as done only when every child is done', () => {
        expect(getDerivedParentTaskWorkflowState([makeTaskState('done'), makeTaskState('done')])).toBe('done');
    });

    it('marks a parent as needs review when all children are done or need review', () => {
        expect(getDerivedParentTaskWorkflowState([makeTaskState('done'), makeTaskState('needs_review')])).toBe('needs_review');
        expect(getDerivedParentTaskWorkflowState([makeTaskState('needs_review'), makeTaskState('needs_review')])).toBe('needs_review');
    });

    it('treats blocked as the highest-priority rolled up state', () => {
        expect(getDerivedParentTaskWorkflowState([makeTaskState('blocked'), makeTaskState('done')])).toBe('blocked');
        expect(getDerivedParentTaskWorkflowState([makeTaskState('blocked'), makeTaskState('skipped')])).toBe('blocked');
    });

    it('marks a parent as skipped when a child is skipped and none are blocked', () => {
        expect(getDerivedParentTaskWorkflowState([makeTaskState('skipped'), makeTaskState('done')])).toBe('skipped');
        expect(getDerivedParentTaskWorkflowState([makeTaskState('skipped'), makeTaskState('not_started')])).toBe('skipped');
    });

    it('marks partial mixed progress as in progress when work has started but review is not complete', () => {
        expect(getDerivedParentTaskWorkflowState([makeTaskState('done'), makeTaskState('not_started')])).toBe('in_progress');
        expect(getDerivedParentTaskWorkflowState([makeTaskState('in_progress'), makeTaskState('not_started')])).toBe('in_progress');
        expect(getDerivedParentTaskWorkflowState([makeTaskState('needs_review'), makeTaskState('not_started')])).toBe('in_progress');
    });

    it('stays not started when no child work has begun', () => {
        expect(getDerivedParentTaskWorkflowState([makeTaskState('not_started'), makeTaskState('not_started')])).toBe('not_started');
    });

    it('returns a rounded child completion percent based on done and needs-review children', () => {
        const tasks = [
            { id: 'parent' },
            { id: 'child-1', parentTask: [{ id: 'parent' }], workflowState: 'done', isCompleted: true },
            { id: 'child-2', parentTask: [{ id: 'parent' }], workflowState: 'needs_review', isCompleted: false },
            { id: 'child-3', parentTask: [{ id: 'parent' }], workflowState: 'in_progress', isCompleted: false },
        ] as any;

        expect(getTaskChildProgressPercent('parent', tasks)).toBe(67);
    });

    it('returns 0 percent when none of the children are review-complete yet', () => {
        const tasks = [
            { id: 'parent' },
            { id: 'child-1', parentTask: [{ id: 'parent' }], workflowState: 'not_started', isCompleted: false },
            { id: 'child-2', parentTask: [{ id: 'parent' }], workflowState: 'in_progress', isCompleted: false },
        ] as any;

        expect(getTaskChildProgressPercent('parent', tasks)).toBe(0);
    });
});
