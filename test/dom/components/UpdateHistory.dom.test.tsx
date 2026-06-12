// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/attachments/AttachmentThumbnail', () => ({
    AttachmentThumbnailRow: () => <div data-testid="attachment-row" />,
}));

vi.mock('@/components/task-updates/TaskUpdateThread', () => ({
    TaskResponseFieldValuesList: () => null,
    TaskFeedbackReplies: ({ replies }: { replies?: Array<{ id?: string }> }) => (
        <div data-testid="threaded-feedback">{(replies || []).map((reply) => reply.id).join(',')}</div>
    ),
}));

import { UpdateHistory } from '@/components/task-updates/UpdateHistory';

describe('UpdateHistory', () => {
    it('includes reply updates that only changed status so request-changes events are visible', () => {
        render(
            <UpdateHistory
                updates={[
                    {
                        id: 'submission-1',
                        createdAt: '2026-03-20T06:23:12.011Z',
                        fromState: 'in_progress',
                        toState: 'needs_review',
                        actor: [{ id: 'judah', name: 'Judah' }],
                        responseFieldValues: [
                            {
                                id: 'value-1',
                                richTextContent: '<p>Revised answer</p>',
                                field: [{ id: 'field-1', label: 'Rich Text' }],
                            },
                        ],
                    },
                    {
                        id: 'feedback-1',
                        createdAt: '2026-03-20T06:24:28.608Z',
                        fromState: 'needs_review',
                        toState: 'in_progress',
                        actor: [{ id: 'david', name: 'David' }],
                        affectedPerson: [{ id: 'judah', name: 'Judah' }],
                        replyTo: [{ id: 'submission-1' }],
                    },
                ]}
            />
        );

        expect(screen.getByText(/from Needs review/i)).toBeInTheDocument();
        expect(screen.queryByText(/^Feedback$/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/on Judah's response/i)).not.toBeInTheDocument();
    });

    it('keeps note feedback threaded under the response it belongs to', () => {
        render(
            <UpdateHistory
                updates={[
                    {
                        id: 'submission-1',
                        createdAt: '2026-03-20T06:23:12.011Z',
                        fromState: 'in_progress',
                        toState: 'needs_review',
                        actor: [{ id: 'judah', name: 'Judah' }],
                        responseFieldValues: [
                            {
                                id: 'value-1',
                                richTextContent: '<p>Revised answer</p>',
                                field: [{ id: 'field-1', label: 'Rich Text' }],
                            },
                        ],
                        replies: [
                            {
                                id: 'feedback-1',
                                createdAt: '2026-03-20T06:24:28.608Z',
                                replyTo: [{ id: 'submission-1' }],
                                note: 'Nice revision.',
                            },
                        ],
                    },
                ]}
            />
        );

        expect(screen.getByTestId('threaded-feedback')).toHaveTextContent('feedback-1');
    });
});
