// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/checkbox', () => ({
    Checkbox: ({ checked, disabled, onCheckedChange, id, ...props }: any) => (
        <input
            id={id}
            type="checkbox"
            checked={Boolean(checked)}
            disabled={Boolean(disabled)}
            onChange={() => onCheckedChange?.(!checked)}
            {...props}
        />
    ),
}));

vi.mock('@/components/ui/popover', () => ({
    Popover: ({ children }: any) => <div>{children}</div>,
    PopoverTrigger: ({ asChild, children }: any) => (asChild ? children : <button type="button">{children}</button>),
    PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

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

vi.mock('@/components/ui/dialog', async () => {
    const React = await import('react');
    const DialogCtx = React.createContext(false);

    return {
        Dialog: ({ open, children }: any) => <DialogCtx.Provider value={Boolean(open)}>{children}</DialogCtx.Provider>,
        DialogContent: ({ children, ...props }: any) => {
            const open = React.useContext(DialogCtx);
            return open ? <div {...props}>{children}</div> : null;
        },
        DialogHeader: ({ children }: any) => <div>{children}</div>,
        DialogTitle: ({ children }: any) => <h2>{children}</h2>,
        DialogClose: ({ children, ...props }: any) => <button type="button" {...props}>{children}</button>,
    };
});

vi.mock('@/components/PDFPreview', () => ({
    PDFPreview: () => <div data-testid="pdf-preview" />,
}));

vi.mock('@/components/ui/fireworks', () => ({
    Fireworks: () => null,
}));

vi.mock('lucide-react', async (importOriginal) => {
    const actual = await importOriginal<typeof import('lucide-react')>();
    return {
        ...actual,
    };
});

import { TaskSeriesChecklist } from '@/components/TaskSeriesChecklist';

function task(overrides: any) {
    return {
        id: overrides.id,
        text: overrides.text,
        order: overrides.order,
        isCompleted: overrides.isCompleted ?? false,
        isDayBreak: overrides.isDayBreak ?? false,
        parentTask: overrides.parentTask,
        indentationLevel: overrides.indentationLevel ?? 0,
        ...overrides,
    };
}

describe('TaskSeriesChecklist', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('shows header/context rows without auto-completing them in interactive mode', () => {
        const onToggle = vi.fn();
        const allTasks = [
            task({ id: 'parent', text: 'Kitchen Cleanup', order: 1, isCompleted: false }),
            task({ id: 'child', text: 'Wipe counters', order: 2, parentTask: [{ id: 'parent' }], isCompleted: false }),
        ];

        render(
            <TaskSeriesChecklist
                tasks={[allTasks[1]]}
                allTasks={allTasks as any}
                onToggle={onToggle}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={false}
            />
        );

        expect(onToggle).not.toHaveBeenCalled();
        expect(screen.getAllByText(/kitchen cleanup/i)).toHaveLength(2);
    });

    it('does not auto-complete headers in read-only mode and disables task checkboxes', () => {
        const onToggle = vi.fn();
        const allTasks = [
            task({ id: 'parent', text: 'Kitchen Cleanup', order: 1, isCompleted: false }),
            task({ id: 'child', text: 'Wipe counters', order: 2, parentTask: [{ id: 'parent' }], isCompleted: false }),
        ];

        render(
            <TaskSeriesChecklist
                tasks={[allTasks[1]]}
                allTasks={allTasks as any}
                onToggle={onToggle}
                isReadOnly={true}
                selectedMember="kid-a"
                showDetails={false}
            />
        );

        expect(onToggle).not.toHaveBeenCalled();
        expect(screen.getByRole('checkbox')).toBeDisabled();
    });

    it('shows a rounded percent-complete marker next to parent header rows', () => {
        const onToggle = vi.fn();
        const allTasks = [
            task({ id: 'parent', text: 'Kitchen Cleanup', order: 1, isCompleted: false }),
            task({ id: 'child-done', text: 'Wipe counters', order: 2, parentTask: [{ id: 'parent' }], workflowState: 'done', isCompleted: true }),
            task({ id: 'child-review', text: 'Sweep floor', order: 3, parentTask: [{ id: 'parent' }], workflowState: 'needs_review', isCompleted: false }),
            task({ id: 'child-active', text: 'Take out trash', order: 4, parentTask: [{ id: 'parent' }], workflowState: 'in_progress', isCompleted: false }),
        ];

        render(
            <TaskSeriesChecklist
                tasks={[allTasks[3]] as any}
                allTasks={allTasks as any}
                onToggle={onToggle}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={false}
            />
        );

        expect(screen.getByText('67% complete')).toBeInTheDocument();
    });

    it('toggles notes metadata visibility with the local "view details" link when global details are off', async () => {
        const user = userEvent.setup();
        const onToggle = vi.fn();
        const noteTask = task({
            id: 'task-1',
            text: 'Pack soccer bag',
            order: 1,
            notes: 'Pack gloves and shin guards',
        });

        const { container } = render(
            <TaskSeriesChecklist
                tasks={[noteTask] as any}
                allTasks={[noteTask] as any}
                onToggle={onToggle}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={false}
            />
        );

        // Notes appear in the always-rendered popover, but the metadata details section should be hidden
        const metadataSection = () => container.querySelector('.text-gray-700.whitespace-pre-wrap');
        expect(metadataSection()).not.toBeInTheDocument();
        expect(screen.getByText(/view task details/i)).toBeInTheDocument();

        await user.click(screen.getByText(/view task details/i));
        expect(metadataSection()).toBeInTheDocument();
        expect(screen.getByText(/hide task details/i)).toBeInTheDocument();
    });

    it('shows metadata details immediately when global showDetails is enabled', () => {
        const onToggle = vi.fn();
        const noteTask = task({
            id: 'task-1',
            text: 'Pack soccer bag',
            order: 1,
            notes: 'Pack gloves and shin guards',
        });

        const { container } = render(
            <TaskSeriesChecklist
                tasks={[noteTask] as any}
                allTasks={[noteTask] as any}
                onToggle={onToggle}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={true}
            />
        );

        // Metadata details section should be visible immediately
        const metadataSection = container.querySelector('.text-gray-700.whitespace-pre-wrap');
        expect(metadataSection).toBeInTheDocument();
        expect(metadataSection?.textContent).toMatch(/pack gloves and shin guards/i);
        expect(screen.queryByText(/view details/i)).not.toBeInTheDocument();
    });

    it('opens the shared task detail modal when clicking a task title', async () => {
        const user = userEvent.setup();
        const activeTask = task({
            id: 'task-detail',
            text: 'Practice piano',
            order: 1,
            notes: 'Warm up with scales first',
        });

        render(
            <TaskSeriesChecklist
                tasks={[activeTask] as any}
                allTasks={[activeTask] as any}
                onToggle={vi.fn()}
                onTaskUpdate={vi.fn()}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={false}
            />
        );

        await user.click(screen.getByRole('button', { name: /practice piano/i }));

        expect(screen.getByRole('heading', { name: /practice piano/i })).toBeInTheDocument();
        expect(screen.getByText(/warm up with scales first/i)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /^update$/i })).toBeInTheDocument();
    });

    it('opens the shared task detail modal from update and lets auth-gated users request login inside it', async () => {
        const user = userEvent.setup();
        const onRequireTaskAuth = vi.fn();
        const onToggle = vi.fn();
        const activeTask = task({
            id: 'task-auth',
            text: 'Practice piano',
            order: 1,
        });

        render(
            <TaskSeriesChecklist
                tasks={[activeTask] as any}
                allTasks={[activeTask] as any}
                onToggle={onToggle}
                onTaskUpdate={vi.fn()}
                canWriteTaskProgress={false}
                onRequireTaskAuth={onRequireTaskAuth}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={false}
            />
        );

        await user.click(screen.getByRole('button', { name: /^details$/i }));

        expect(onRequireTaskAuth).not.toHaveBeenCalled();
        expect(screen.getByText(/task details/i)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /practice piano/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /log in to update/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /log in to update/i }));
        expect(onRequireTaskAuth).toHaveBeenCalledTimes(1);
    });

    it('opens a text attachment preview modal and loads full text content', async () => {
        const user = userEvent.setup();
        const onToggle = vi.fn();
        const fetchMock = vi.fn().mockResolvedValue({
            text: vi.fn().mockResolvedValue('Full attachment contents for checklist preview'),
        });
        vi.stubGlobal('fetch', fetchMock);

        const taskWithAttachment = task({
            id: 'task-attach',
            text: 'Check washing machine',
            order: 1,
            attachments: [{ id: 'file-1', name: 'notes.txt', url: 'folder/notes.txt' }],
        });

        render(
            <TaskSeriesChecklist
                tasks={[taskWithAttachment] as any}
                allTasks={[taskWithAttachment] as any}
                onToggle={onToggle}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={true}
            />
        );

        await user.click(screen.getByTitle('notes.txt'));

        expect(screen.getByRole('heading', { name: 'notes.txt' })).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getAllByText(/full attachment contents for checklist preview/i)).toHaveLength(2);
        });

        expect(fetchMock).toHaveBeenCalledWith('/files/folder/notes.txt');
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('opens image attachment previews in the modal viewer', async () => {
        const user = userEvent.setup();
        const onToggle = vi.fn();
        const imageTask = task({
            id: 'task-image',
            text: 'Check photos',
            order: 1,
            attachments: [{ id: 'img-1', name: 'photo.png', url: 'photos/photo.png' }],
        });

        render(
            <TaskSeriesChecklist
                tasks={[imageTask] as any}
                allTasks={[imageTask] as any}
                onToggle={onToggle}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={true}
            />
        );

        await user.click(screen.getByTitle('photo.png'));

        expect(screen.getByRole('heading', { name: 'photo.png' })).toBeInTheDocument();
        const images = screen.getAllByAltText('photo.png');
        expect(images).toHaveLength(2);
        expect(images[1]).toHaveAttribute('src', '/files/photos/photo.png');
    });

    it('opens PDF attachment previews with the PDF preview component', async () => {
        const user = userEvent.setup();
        const onToggle = vi.fn();
        const pdfTask = task({
            id: 'task-pdf',
            text: 'Read instructions',
            order: 1,
            attachments: [{ id: 'pdf-1', name: 'manual.pdf', url: 'docs/manual.pdf' }],
        });

        render(
            <TaskSeriesChecklist
                tasks={[pdfTask] as any}
                allTasks={[pdfTask] as any}
                onToggle={onToggle}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={true}
            />
        );

        await user.click(screen.getByTitle('manual.pdf'));

        expect(screen.getByRole('heading', { name: 'manual.pdf' })).toBeInTheDocument();
        expect(screen.getByTestId('pdf-preview')).toBeInTheDocument();
    });

    it('shows a fallback download prompt for unsupported attachment types', async () => {
        const user = userEvent.setup();
        const onToggle = vi.fn();
        const binaryTask = task({
            id: 'task-bin',
            text: 'Check archive',
            order: 1,
            attachments: [{ id: 'bin-1', name: 'archive.bin', url: 'files/archive.bin' }],
        });

        render(
            <TaskSeriesChecklist
                tasks={[binaryTask] as any}
                allTasks={[binaryTask] as any}
                onToggle={onToggle}
                isReadOnly={false}
                selectedMember="kid-a"
                showDetails={true}
            />
        );

        await user.click(screen.getByTitle('archive.bin'));

        expect(screen.getByRole('heading', { name: 'archive.bin' })).toBeInTheDocument();
        expect(screen.getByText(/preview not available for this file type/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /download file/i })).toHaveAttribute('href', '/files/files/archive.bin');
    });

    it('shows the latest reviewed response thread even when a newer no-op update exists', () => {
        const activeTask = task({
            id: 'task-feedback-thread',
            text: 'Explain what a model is',
            order: 1,
            workflowState: 'in_progress',
            responseFields: [
                {
                    id: 'field-1',
                    type: 'rich_text',
                    label: 'Required',
                    order: 0,
                    required: true,
                    weight: 1,
                },
            ],
            updates: [
                {
                    id: 'latest-noop',
                    isDraft: false,
                    createdAt: new Date('2026-03-20T09:05:36-04:00').valueOf(),
                    fromState: 'in_progress',
                    toState: 'in_progress',
                    note: '   ',
                    actor: [{ id: 'judah', name: 'Judah' }],
                },
                {
                    id: 'submission-1',
                    isDraft: false,
                    createdAt: new Date('2026-03-19T21:21:39-04:00').valueOf(),
                    fromState: 'not_started',
                    toState: 'needs_review',
                    actor: [{ id: 'judah', name: 'Judah' }],
                    responseFieldValues: [
                        {
                            id: 'value-1',
                            richTextContent: '<p>A model is a simplified version of something.</p>',
                            field: [{ id: 'field-1', label: 'Required' }],
                        },
                    ],
                    replies: [
                        {
                            id: 'feedback-1',
                            isDraft: false,
                            createdAt: new Date('2026-03-20T08:30:21-04:00').valueOf(),
                            note: 'This is a great start, but explain what makes a model simplified.',
                            actor: [{ id: 'david', name: 'David' }],
                            replyTo: [{ id: 'submission-1' }],
                        },
                    ],
                },
            ],
        });

        render(
            <TaskSeriesChecklist
                tasks={[activeTask] as any}
                allTasks={[activeTask] as any}
                onToggle={vi.fn()}
                onTaskUpdate={vi.fn()}
                isReadOnly={false}
                selectedMember="judah"
                currentMemberId="judah"
                showDetails={false}
            />
        );

        expect(screen.getByText(/latest reviewed response/i)).toBeInTheDocument();
        expect(screen.getByText(/a model is a simplified version of something/i)).toBeInTheDocument();
        expect(screen.getByText(/this is a great start, but explain what makes a model simplified/i)).toBeInTheDocument();
    });
});
