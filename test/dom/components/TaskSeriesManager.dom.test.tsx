// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const taskSeriesManagerMocks = vi.hoisted(() => {
    const queryState = {
        data: null as any,
        isLoading: false,
        error: null as any,
    };
    return {
        queryState,
        dbUseQuery: vi.fn(() => ({ data: queryState.data, isLoading: queryState.isLoading, error: queryState.error })),
        dbTransact: vi.fn().mockResolvedValue(undefined),
        routerPush: vi.fn(),
        toast: vi.fn(),
        nextIdValues: [] as string[],
    };
});

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: taskSeriesManagerMocks.routerPush,
    }),
}));

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({ toast: taskSeriesManagerMocks.toast }),
}));

vi.mock('@/components/AuthProvider', () => ({
    useAuth: () => ({
        currentUser: { id: 'parent-1', name: 'Parent User', role: 'parent' },
    }),
}));

vi.mock('@/components/ui/button', async () => {
    const React = await import('react');
    const Button = React.forwardRef<HTMLButtonElement, any>(function MockButton({ children, ...props }, ref) {
        return (
            <button ref={ref} type={props.type ?? 'button'} {...props}>
                {children}
            </button>
        );
    });
    return { Button };
});

vi.mock('@/components/ui/badge', () => ({
    Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/progress', () => ({
    Progress: ({ value }: any) => <div data-testid="progress">{value}</div>,
}));

vi.mock('@/components/ui/checkbox', () => ({
    Checkbox: ({ checked, onCheckedChange, id, ...props }: any) => (
        <input
            id={id}
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            {...props}
        />
    ),
}));

vi.mock('@/components/ui/alert-dialog', async () => {
    const React = await import('react');
    const Ctx = React.createContext(false);

    return {
        AlertDialog: ({ open, children }: any) => <Ctx.Provider value={Boolean(open)}>{children}</Ctx.Provider>,
        AlertDialogContent: ({ children }: any) => {
            const open = React.useContext(Ctx);
            return open ? <div>{children}</div> : null;
        },
        AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
        AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
        AlertDialogDescription: ({ children }: any) => <div>{children}</div>,
        AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
        AlertDialogCancel: ({ children, onClick }: any) => (
            <button type="button" onClick={onClick}>
                {children}
            </button>
        ),
        AlertDialogAction: ({ children, onClick, ...props }: any) => (
            <button type="button" onClick={onClick} {...props}>
                {children}
            </button>
        ),
    };
});

vi.mock('lucide-react', () => ({
    Trash2: () => <span>Trash2</span>,
}));

const instantMocks = vi.hoisted(() => ({
    tx: new Proxy(
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
                                delete() {
                                    return { op: 'delete', entity, id };
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
    ),
    id: vi.fn(() => {
        const next = taskSeriesManagerMocks.nextIdValues.shift();
        return next ?? 'generated-id';
    }),
}));

vi.mock('@instantdb/react', () => ({
    tx: instantMocks.tx,
    id: instantMocks.id,
    init: vi.fn(() => ({
        useAuth: vi.fn(),
        useQuery: vi.fn(),
        transact: vi.fn(),
        auth: {
            signOut: vi.fn(),
            signInWithToken: vi.fn(),
        },
    })),
}));

import TaskSeriesManager from '@/components/task-series/TaskSeriesManager';

function makeDb() {
    return {
        useQuery: taskSeriesManagerMocks.dbUseQuery,
        transact: taskSeriesManagerMocks.dbTransact,
    };
}

function makeSeries(overrides: any = {}) {
    return {
        id: overrides.id ?? 'series-1',
        name: overrides.name ?? 'Series 1',
        description: overrides.description ?? '',
        updatedAt: overrides.updatedAt ?? '2026-04-10T00:00:00Z',
        startDate: overrides.startDate ?? null,
        targetEndDate: overrides.targetEndDate ?? null,
        dependsOnSeriesId: overrides.dependsOnSeriesId ?? null,
        familyMember: overrides.familyMember ?? null,
        scheduledActivity: overrides.scheduledActivity ?? null,
        tasks: overrides.tasks ?? [],
        ...overrides,
    };
}

function renderManagerWithSeries(seriesList: any[]) {
    taskSeriesManagerMocks.queryState.isLoading = false;
    taskSeriesManagerMocks.queryState.error = null;
    taskSeriesManagerMocks.queryState.data = { taskSeries: seriesList };
    const db = makeDb();
    const utils = render(<TaskSeriesManager db={db} />);
    return { ...utils, db };
}

describe('TaskSeriesManager', () => {
    beforeEach(() => {
        taskSeriesManagerMocks.dbUseQuery.mockClear();
        taskSeriesManagerMocks.dbTransact.mockClear();
        taskSeriesManagerMocks.routerPush.mockClear();
        taskSeriesManagerMocks.toast.mockClear();
        taskSeriesManagerMocks.queryState.data = { taskSeries: [] };
        taskSeriesManagerMocks.queryState.isLoading = false;
        taskSeriesManagerMocks.queryState.error = null;
        taskSeriesManagerMocks.nextIdValues = [];
        instantMocks.id.mockClear();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('computes statuses and filters series by status', async () => {
        renderManagerWithSeries([
            makeSeries({
                id: 'draft',
                name: 'Draft Series',
                familyMember: null,
                scheduledActivity: null,
                tasks: [],
            }),
            makeSeries({
                id: 'pending',
                name: 'Pending Series',
                familyMember: { id: 'kid-a', name: 'Alex' },
                scheduledActivity: { id: 'chore-pending', title: 'Pending Chore', startDate: '2099-04-20T00:00:00Z' },
                tasks: [{ id: 't-pending', isDayBreak: false, isCompleted: false }],
            }),
            makeSeries({
                id: 'progress',
                name: 'In Progress Series',
                familyMember: { id: 'kid-b', name: 'Blair' },
                scheduledActivity: { id: 'chore-progress', title: 'Progress Chore', startDate: '2000-04-01T00:00:00Z' },
                tasks: [{ id: 't-progress', isDayBreak: false, isCompleted: false }],
            }),
            makeSeries({
                id: 'archived',
                name: 'Archived Series',
                familyMember: { id: 'kid-c', name: 'Casey' },
                scheduledActivity: { id: 'chore-archived', title: 'Archived Chore', startDate: '2000-04-01T00:00:00Z' },
                tasks: [{ id: 't-archived', isDayBreak: false, isCompleted: true }],
            }),
        ]);

        expect(screen.getByText('Draft Series')).toBeInTheDocument();
        expect(screen.getByText('Pending Series')).toBeInTheDocument();
        expect(screen.getByText('In Progress Series')).toBeInTheDocument();
        expect(screen.getByText('Archived Series')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Pending' }));
        expect(screen.getByText('Pending Series')).toBeInTheDocument();
        expect(screen.queryByText('Draft Series')).not.toBeInTheDocument();
        expect(screen.queryByText('In Progress Series')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'In Progress' }));
        expect(screen.getByText('In Progress Series')).toBeInTheDocument();
        expect(screen.queryByText('Pending Series')).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Archived' }));
        expect(screen.getByText('Archived Series')).toBeInTheDocument();
        expect(screen.queryByText('Draft Series')).not.toBeInTheDocument();
    });

    it('queries without server-side ordering and sorts by updated date client-side', () => {
        renderManagerWithSeries([
            makeSeries({ id: 'older', name: 'Older Series', updatedAt: '2026-04-01T00:00:00Z' }),
            makeSeries({ id: 'newer', name: 'Newer Series', updatedAt: '2026-04-20T00:00:00Z' }),
            makeSeries({ id: 'undated', name: 'Undated Series', updatedAt: null }),
        ]);

        expect(taskSeriesManagerMocks.dbUseQuery).toHaveBeenCalledWith({
            taskSeries: {
                tasks: {
                    responseFields: {},
                    updates: {
                        actor: {},
                        affectedPerson: {},
                        responseFieldValues: { field: {} },
                        gradeType: {},
                        attachments: {},
                    },
                },
                familyMember: {},
                scheduledActivity: {},
            },
        });

        const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent);
        expect(headings).toEqual(['Newer Series', 'Older Series', 'Undated Series']);
    });

    it('renders query errors instead of the empty state', () => {
        taskSeriesManagerMocks.queryState.data = null;
        taskSeriesManagerMocks.queryState.isLoading = false;
        taskSeriesManagerMocks.queryState.error = { message: 'Field updatedAt is not indexed' };

        render(<TaskSeriesManager db={makeDb()} />);

        expect(screen.getByText(/could not load task series/i)).toBeInTheDocument();
        expect(screen.getByText(/field updatedAt is not indexed/i)).toBeInTheDocument();
        expect(screen.queryByText(/no task series yet/i)).not.toBeInTheDocument();
    });

    it('supports shift-select and bulk deletes selected series with task cascade deletes', async () => {
        const user = userEvent.setup();
        const { db } = renderManagerWithSeries([
            makeSeries({
                id: 's1',
                name: 'Series One',
                familyMember: { id: 'kid-a', name: 'Alex' },
                scheduledActivity: { id: 'chore-1', title: 'C1', startDate: '2000-04-01T00:00:00Z' },
                tasks: [{ id: 't1a' }, { id: 't1b' }],
            }),
            makeSeries({
                id: 's2',
                name: 'Series Two',
                familyMember: { id: 'kid-a', name: 'Alex' },
                scheduledActivity: { id: 'chore-2', title: 'C2', startDate: '2000-04-01T00:00:00Z' },
                tasks: [{ id: 't2a' }],
            }),
            makeSeries({
                id: 's3',
                name: 'Series Three',
                familyMember: { id: 'kid-a', name: 'Alex' },
                scheduledActivity: { id: 'chore-3', title: 'C3', startDate: '2000-04-01T00:00:00Z' },
                tasks: [{ id: 't3a' }, { id: 't3b' }],
            }),
        ]);

        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes).toHaveLength(4); // select-all + 3 rows

        await user.click(checkboxes[1]);
        fireEvent.click(checkboxes[3], { shiftKey: true });

        expect(screen.getByText(/3 selected/i)).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /delete/i }));
        expect(screen.getByRole('heading', { name: /are you sure/i })).toBeInTheDocument();
        expect(screen.getByText(/permanently delete 3 task series/i)).toBeInTheDocument();

        const dialogDeleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
        await user.click(dialogDeleteButtons[dialogDeleteButtons.length - 1]);

        await waitFor(() => {
            expect(db.transact).toHaveBeenCalledTimes(1);
        });

        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs).toEqual([
            { op: 'delete', entity: 'taskSeries', id: 's1' },
            { op: 'delete', entity: 'tasks', id: 't1a' },
            { op: 'delete', entity: 'tasks', id: 't1b' },
            { op: 'delete', entity: 'taskSeries', id: 's2' },
            { op: 'delete', entity: 'tasks', id: 't2a' },
            { op: 'delete', entity: 'taskSeries', id: 's3' },
            { op: 'delete', entity: 'tasks', id: 't3a' },
            { op: 'delete', entity: 'tasks', id: 't3b' },
        ]);
        expect(taskSeriesManagerMocks.toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Deleted',
                description: expect.stringMatching(/3 task series/i),
            })
        );
    });

    it('duplicates a series with reset task completion and navigates to the new copy', async () => {
        const user = userEvent.setup();
        taskSeriesManagerMocks.nextIdValues = ['series-copy', 'task-copy-1', 'task-copy-2'];

        const { db } = renderManagerWithSeries([
            makeSeries({
                id: 'series-original',
                name: 'Morning Routine',
                description: 'Daily checklist',
                startDate: '2026-04-01T00:00:00Z',
                targetEndDate: '2026-04-20T00:00:00Z',
                familyMember: { id: 'kid-a', name: 'Alex' },
                scheduledActivity: { id: 'chore-1', title: 'Morning Chore', startDate: '2000-04-01T00:00:00Z' },
                tasks: [
                    {
                        id: 'task-a',
                        text: 'Brush teeth',
                        order: 1,
                        isDayBreak: false,
                        isCompleted: true,
                        completedAt: '2026-04-09T07:00:00Z',
                        notes: '2 minutes',
                        indentationLevel: 0,
                    },
                    {
                        id: 'task-b',
                        text: 'Pack lunch',
                        order: 2,
                        isDayBreak: false,
                        isCompleted: false,
                        indentationLevel: 1,
                    },
                ],
            }),
        ]);

        await user.click(screen.getByRole('button', { name: /duplicate/i }));

        await waitFor(() => {
            expect(db.transact).toHaveBeenCalledTimes(1);
        });

        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    op: 'update',
                    entity: 'taskSeries',
                    id: 'series-copy',
                    payload: expect.objectContaining({
                        name: 'Morning Routine (copy)',
                        description: 'Daily checklist',
                        dependsOnSeriesId: null,
                    }),
                }),
                expect.objectContaining({
                    op: 'update',
                    entity: 'tasks',
                    id: 'task-copy-1',
                    payload: expect.objectContaining({
                        text: 'Brush teeth',
                        order: 1,
                        isCompleted: false,
                        completedAt: null,
                        indentationLevel: 0,
                    }),
                }),
                expect.objectContaining({
                    op: 'update',
                    entity: 'tasks',
                    id: 'task-copy-2',
                    payload: expect.objectContaining({
                        text: 'Pack lunch',
                        order: 2,
                        isCompleted: false,
                        completedAt: null,
                        indentationLevel: 1,
                    }),
                }),
                { op: 'link', entity: 'taskSeries', id: 'series-copy', payload: { tasks: 'task-copy-1' } },
                { op: 'link', entity: 'taskSeries', id: 'series-copy', payload: { tasks: 'task-copy-2' } },
            ])
        );

        expect(taskSeriesManagerMocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Task series duplicated' }));
        expect(taskSeriesManagerMocks.routerPush).toHaveBeenCalledWith('/task-series/series-copy');
    });
});
