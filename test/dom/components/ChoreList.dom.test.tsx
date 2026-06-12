// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const choreListMocks = vi.hoisted(() => ({
    toast: vi.fn(),
    getAssignedMembersForChoreOnDate: vi.fn((chore: any) => chore.assignees || []),
    createRRuleWithStartDate: vi.fn(),
    getTasksForDate: vi.fn(() => []),
    isSeriesActiveForDate: vi.fn(() => false),
    getRecursiveTaskCompletionTransactions: vi.fn(() => []),
}));

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: choreListMocks.toast,
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

vi.mock('@/components/ui/scroll-area', () => ({
    ScrollArea: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

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
        DialogDescription: ({ children }: any) => <p>{children}</p>,
        DialogFooter: ({ children }: any) => <div>{children}</div>,
    };
});

vi.mock('lucide-react', () => ({
    Trash2: () => <span>Trash2</span>,
}));

vi.mock('@/components/ui/ToggleableAvatar', () => ({
    __esModule: true,
    default: ({ name, onToggle, isComplete, isDisabled }: any) => (
        <button type="button" onClick={onToggle} disabled={Boolean(isDisabled)}>
            Avatar {name} {isComplete ? 'done' : 'todo'}
        </button>
    ),
}));

vi.mock('@/components/DetailedChoreForm', () => ({
    __esModule: true,
    default: ({ initialChore }: any) => <div data-testid="detailed-chore-form">Editing {initialChore?.title}</div>,
}));

vi.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: any) => (
        <a href={typeof href === 'string' ? href : '#'} {...props}>
            {children}
        </a>
    ),
}));

vi.mock('@/components/TaskSeriesChecklist', () => ({
    TaskSeriesChecklist: () => <div data-testid="task-series-checklist" />,
}));

vi.mock('@/lib/task-scheduler', () => ({
    getTasksForDate: choreListMocks.getTasksForDate,
    getRecursiveTaskCompletionTransactions: choreListMocks.getRecursiveTaskCompletionTransactions,
    isSeriesActiveForDate: choreListMocks.isSeriesActiveForDate,
}));

vi.mock('@/lib/chore-utils', async () => {
    const actual = await vi.importActual<typeof import('@/lib/chore-utils')>('@/lib/chore-utils');
    return {
        ...actual,
        createRRuleWithStartDate: choreListMocks.createRRuleWithStartDate,
        getAssignedMembersForChoreOnDate: choreListMocks.getAssignedMembersForChoreOnDate,
    };
});

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
                            };
                        },
                    }
                );
            },
        }
    ),
}));

vi.mock('@instantdb/react', () => ({
    tx: instantMocks.tx,
}));

import ChoreList from '@/components/ChoreList';

const familyMembers = [
    { id: 'kid-a', name: 'Alex' },
    { id: 'kid-b', name: 'Blair' },
];

function makeChore(overrides: any = {}) {
    return {
        id: overrides.id ?? 'chore-1',
        title: overrides.title ?? 'Test Chore',
        description: overrides.description ?? '',
        startDate: overrides.startDate ?? '2026-04-02',
        rrule: overrides.rrule ?? null,
        assignees: overrides.assignees ?? [{ id: 'kid-a', name: 'Alex' }],
        rotationType: overrides.rotationType ?? 'none',
        completions: overrides.completions ?? [],
        taskSeries: overrides.taskSeries ?? [],
        weight: overrides.weight ?? 1,
        ...overrides,
    };
}

function renderChoreList(overrides: any = {}) {
    const props = {
        chores: [makeChore()],
        familyMembers,
        selectedMember: 'All',
        selectedDate: new Date('2026-04-02T00:00:00Z'),
        toggleChoreDone: vi.fn(),
        updateChore: vi.fn(),
        deleteChore: vi.fn(),
        db: { transact: vi.fn() },
        unitDefinitions: [],
        currencyOptions: [],
        onEditTaskSeries: vi.fn(),
        currentUser: { id: 'parent-1', role: 'parent' },
        canEditChores: true,
        showChoreDescriptions: false,
        showTaskDetails: false,
        ...overrides,
    };

    return { ...render(<ChoreList {...props} />), props };
}

describe('ChoreList', () => {
    beforeEach(() => {
        choreListMocks.toast.mockReset();
        choreListMocks.getAssignedMembersForChoreOnDate.mockClear();
        choreListMocks.createRRuleWithStartDate.mockReset();
        choreListMocks.getTasksForDate.mockReset();
        choreListMocks.isSeriesActiveForDate.mockReset();
        choreListMocks.getRecursiveTaskCompletionTransactions.mockReset();
        choreListMocks.getTasksForDate.mockReturnValue([]);
        choreListMocks.isSeriesActiveForDate.mockReturnValue(false);
        choreListMocks.getRecursiveTaskCompletionTransactions.mockReturnValue([]);
    });

    it('filters chores by selected member and selected date', () => {
        renderChoreList({
            selectedMember: 'kid-a',
            showChoreDescriptions: false,
            chores: [
                makeChore({ id: 'a', title: 'Alex Today', description: 'Visible only when descriptions enabled', assignees: [{ id: 'kid-a', name: 'Alex' }] }),
                makeChore({ id: 'b', title: 'Blair Today', assignees: [{ id: 'kid-b', name: 'Blair' }] }),
                makeChore({ id: 'c', title: 'Alex Tomorrow', startDate: '2026-04-03', assignees: [{ id: 'kid-a', name: 'Alex' }] }),
            ],
        });

        expect(screen.getAllByText('Alex Today').length).toBeGreaterThan(0);
        expect(screen.queryByText('Blair Today')).not.toBeInTheDocument();
        expect(screen.queryByText('Alex Tomorrow')).not.toBeInTheDocument();
        expect(screen.queryByText('Visible only when descriptions enabled')).not.toBeInTheDocument();
    });

    it('shows chore descriptions only when the global description setting is enabled', () => {
        renderChoreList({
            selectedMember: 'kid-a',
            showChoreDescriptions: true,
            chores: [makeChore({ id: 'a', title: 'Alex Today', description: 'Visible description', assignees: [{ id: 'kid-a', name: 'Alex' }] })],
        });

        expect(screen.getAllByText('Visible description').length).toBeGreaterThan(0);
    });

    it('hides routine marker controls for non-parent viewers', () => {
        renderChoreList({
            canEditChores: false,
            currentUser: { id: 'kid-a', role: 'child' },
            scheduleSettings: {
                dayBoundaryTime: '03:00',
                timeBuckets: [],
                routineMarkers: [{ key: 'breakfast', label: 'Breakfast', defaultTime: '08:00' }],
            },
        });

        expect(screen.queryByText(/routine markers/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();
    });

    it('opens the detail modal from the chore title and blocks edit/delete actions for non-parent users', async () => {
        const user = userEvent.setup();
        const { props } = renderChoreList({
            canEditChores: false,
            currentUser: { id: 'kid-a', role: 'child' },
        });

        await user.click(screen.getAllByRole('button', { name: /test chore/i })[0]);
        expect(screen.getByRole('heading', { name: /test chore/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /edit chore/i }));
        await user.click(screen.getAllByRole('button', { name: /trash2/i })[0]);

        expect(choreListMocks.toast).toHaveBeenCalledTimes(2);
        expect(choreListMocks.toast).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                title: 'Access Denied',
                description: expect.stringMatching(/only parents can edit chores/i),
                variant: 'destructive',
            })
        );
        expect(choreListMocks.toast).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                title: 'Access Denied',
                description: expect.stringMatching(/only parents can delete chores/i),
                variant: 'destructive',
            })
        );
        expect(props.updateChore).not.toHaveBeenCalled();
        expect(props.deleteChore).not.toHaveBeenCalled();
        expect(screen.queryByRole('heading', { name: /edit chore/i })).not.toBeInTheDocument();
    });

    it('opens detail metadata, then edit and delete flows for parents', async () => {
        const user = userEvent.setup();
        const { props } = renderChoreList({
            chores: [makeChore({ id: 'chore-parent', title: 'Parent Editable Chore' })],
            canEditChores: true,
        });

        await user.click(screen.getAllByRole('button', { name: /parent editable chore/i })[0]);
        expect(screen.getByRole('heading', { name: /parent editable chore/i })).toBeInTheDocument();
        expect(screen.getByText(/selected date/i)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /schedule/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /edit chore/i }));
        expect(screen.getByRole('heading', { name: /edit chore/i })).toBeInTheDocument();
        expect(screen.getByTestId('detailed-chore-form')).toHaveTextContent('Editing Parent Editable Chore');

        await user.click(screen.getAllByRole('button', { name: /trash2/i })[0]);
        expect(screen.getByRole('heading', { name: /delete chore/i })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /^delete$/i }));
        expect(props.deleteChore).toHaveBeenCalledWith('chore-parent');
    });

    it('shows a simplified task preview in chores mode and links into the tasks page', () => {
        choreListMocks.getTasksForDate.mockReturnValue([
            { id: 'task-1', text: 'Read chapter 1', order: 1, isDayBreak: false, isCompleted: false },
            { id: 'task-2', text: 'Answer questions', order: 2, isDayBreak: false, isCompleted: false, notes: 'Should stay hidden in preview' },
            { id: 'task-3', text: 'Write summary', order: 3, isDayBreak: false, isCompleted: false },
        ]);

        renderChoreList({
            pageMode: 'chores',
            chores: [
                makeChore({
                    id: 'chore-1',
                    title: 'Language Arts',
                    taskSeries: [
                        {
                            id: 'series-1',
                            name: 'ELA',
                            tasks: [
                                { id: 'task-1', text: 'Read chapter 1', order: 1, isDayBreak: false, isCompleted: false },
                                { id: 'task-2', text: 'Answer questions', order: 2, isDayBreak: false, isCompleted: false, notes: 'Should stay hidden in preview' },
                                { id: 'task-3', text: 'Write summary', order: 3, isDayBreak: false, isCompleted: false },
                            ],
                        },
                    ],
                }),
            ],
        });

        expect(screen.getByText('Read chapter 1')).toBeInTheDocument();
        expect(screen.getByText('Answer questions')).toBeInTheDocument();
        expect(screen.queryByText('Write summary')).not.toBeInTheDocument();
        expect(screen.queryByText(/should stay hidden in preview/i)).not.toBeInTheDocument();

        const openTasksLink = screen.getByRole('link', { name: /open tasks/i });
        expect(openTasksLink).toHaveAttribute('href', '/tasks?date=2026-04-02&member=All&choreId=chore-1#chore-chore-1');
        expect(screen.getByRole('link', { name: /1\+ more/i })).toHaveAttribute(
            'href',
            '/tasks?date=2026-04-02&member=All&choreId=chore-1#chore-chore-1'
        );
    });
});
