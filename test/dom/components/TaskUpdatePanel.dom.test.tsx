// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/button', async () => {
    const React = await import('react');
    const Button = React.forwardRef<HTMLButtonElement, any>(function MockButton({ children, asChild, ...props }, ref) {
        if (asChild && React.isValidElement(children)) {
            return React.cloneElement(children, { ...props, ref } as any);
        }
        return (
            <button ref={ref} type={props.type ?? 'button'} {...props}>
                {children}
            </button>
        );
    });
    return { Button };
});

vi.mock('@/components/attachments/AttachmentCollection', () => ({
    AttachmentCollection: () => <div data-testid="attachment-collection" />,
}));

vi.mock('@/components/responses/ResponseFieldInput', () => ({
    ResponseFieldInput: () => <div data-testid="response-field-input" />,
}));

import { TaskUpdatePanel } from '@/components/task-updates/TaskUpdatePanel';

function makeTask(workflowState: 'done' | 'in_progress') {
    return {
        id: 'task-1',
        workflowState,
        responseFields: [
            {
                id: 'field-1',
                type: 'rich_text',
                label: 'Response',
                weight: 1,
                required: true,
                order: 0,
            },
        ],
        updates: [
            {
                id: 'submission-1',
                createdAt: '2026-03-20T09:15:00Z',
                fromState: 'in_progress',
                toState: 'done',
                actor: [{ id: 'judah', name: 'Judah' }],
                responseFieldValues: [
                    {
                        id: 'value-1',
                        richTextContent: '<p>I finished it.</p>',
                        field: [{ id: 'field-1', label: 'Response' }],
                    },
                ],
                replies: [],
            },
        ],
    };
}

describe('TaskUpdatePanel parent review flow', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps completed submissions reviewable so a parent can add feedback without reopening the response', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();

        render(
            <TaskUpdatePanel
                task={makeTask('done')}
                variant="full"
                canEdit
                isParentReviewer
                ownerName="Judah"
                onSubmit={onSubmit}
            />
        );

        expect(screen.getByRole('button', { name: /feedback on a response/i })).toBeInTheDocument();
        expect(screen.getByText(/judah's response/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^Needs review$/i })).toBeInTheDocument();

        await user.type(screen.getByRole('textbox'), 'Nice work');
        await user.click(screen.getByRole('button', { name: /submit as done/i }));

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                nextState: 'done',
                note: 'Nice work',
                responseFieldValues: [],
                replyToUpdateId: 'submission-1',
            })
        );
    });

    it('lets a parent approve an existing submission after the task has moved back to in progress', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();

        render(
            <TaskUpdatePanel
                task={makeTask('in_progress')}
                variant="full"
                canEdit
                isParentReviewer
                ownerName="Judah"
                onSubmit={onSubmit}
            />
        );

        expect(screen.getByRole('button', { name: /submit response/i })).toBeInTheDocument();
        expect(screen.getByTestId('response-field-input')).toBeInTheDocument();
        expect(screen.queryByText(/judah's response/i)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /feedback on previous response/i }));
        expect(screen.getByText(/judah's response/i)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^Done$/i }));
        await user.click(screen.getByRole('button', { name: /submit as done/i }));

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                nextState: 'done',
                responseFieldValues: [],
                replyToUpdateId: 'submission-1',
            })
        );
    });

    it('does not block a parent from setting review status when required response fields are empty', async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();

        render(
            <TaskUpdatePanel
                task={makeTask('in_progress')}
                variant="full"
                canEdit
                isParentReviewer
                ownerName="Judah"
                onSubmit={onSubmit}
            />
        );

        await user.click(screen.getByRole('button', { name: /^Needs review$/i }));
        await user.click(screen.getByRole('button', { name: /submit as needs review/i }));

        expect(onSubmit).toHaveBeenCalledWith(
            expect.objectContaining({
                nextState: 'needs_review',
                responseFieldValues: [],
                replyToUpdateId: null,
            })
        );
    });
});
