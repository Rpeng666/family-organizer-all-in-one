// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const choreTrackerMocks = vi.hoisted(() => {
    const dbState = {
        data: null as any,
        isLoading: false,
        error: null as any,
    };

    return {
        dbState,
        dbUseQuery: vi.fn(() => ({
            isLoading: dbState.isLoading,
            error: dbState.error,
            data: dbState.data,
        })),
        dbTransact: vi.fn().mockResolvedValue(undefined),
        toast: vi.fn(),
        currentUser: { id: 'kid-a', role: 'child' } as any,
        isParentMode: false,
        getAssignedMembersForChoreOnDate: vi.fn(),
        computeAllApplicableCurrencyCodes: vi.fn(() => []),
        calculateDailyXP: vi.fn(() => ({})),
        lastChoreListProps: null as any,
    };
});

vi.mock('@/lib/db', () => ({
    db: {
        useQuery: (...args: any[]) => (choreTrackerMocks.dbUseQuery as any)(...args),
        transact: (...args: any[]) => (choreTrackerMocks.dbTransact as any)(...args),
    },
}));

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({ toast: choreTrackerMocks.toast }),
}));

vi.mock('@/components/AuthProvider', () => ({
    useAuth: () => ({ currentUser: choreTrackerMocks.currentUser }),
}));

vi.mock('@/components/auth/useParentMode', () => ({
    useParentMode: () => ({ isParentMode: choreTrackerMocks.isParentMode }),
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

vi.mock('@/components/ui/dialog', async () => {
    const React = await import('react');
    const DialogCtx = React.createContext(false);
    return {
        Dialog: ({ open, children }: any) => <DialogCtx.Provider value={Boolean(open)}>{children}</DialogCtx.Provider>,
        DialogTrigger: ({ asChild, children }: any) => (asChild ? children : <button type="button">{children}</button>),
        DialogContent: ({ children, ...props }: any) => {
            const open = React.useContext(DialogCtx);
            return open ? <div {...props}>{children}</div> : null;
        },
        DialogHeader: ({ children }: any) => <div>{children}</div>,
        DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    };
});

vi.mock('@/components/ui/popover', () => ({
    Popover: ({ children }: any) => <div>{children}</div>,
    PopoverTrigger: ({ asChild, children }: any) => (asChild ? children : <button type="button">{children}</button>),
    PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ asChild, children }: any) => (asChild ? children : <button type="button">{children}</button>),
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/label', () => ({
    Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}));

vi.mock('@/components/ui/switch', () => ({
    Switch: ({ checked, onCheckedChange, ...props }: any) => (
        <input
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            {...props}
        />
    ),
}));

vi.mock('lucide-react', () => {
    const Icon = ({ name }: { name: string }) => <span>{name}</span>;
    return {
        PlusCircle: () => <Icon name="PlusCircle" />,
        SlidersHorizontal: () => <Icon name="SlidersHorizontal" />,
        Menu: () => <Icon name="Menu" />,
        Calendar: () => <Icon name="Calendar" />,
        MoreHorizontal: () => <Icon name="MoreHorizontal" />,
        CheckSquare: () => <Icon name="CheckSquare" />,
        ListTodo: () => <Icon name="ListTodo" />,
        CreditCard: () => <Icon name="CreditCard" />,
        Settings: () => <Icon name="Settings" />,
        Users: () => <Icon name="Users" />,
    };
});

vi.mock('next/link', () => ({
    __esModule: true,
    default: ({ href, children, ...props }: any) => (
        <a href={typeof href === 'string' ? href : '#'} {...props}>
            {children}
        </a>
    ),
}));

vi.mock('@/components/ui/DateCarousel', () => ({
    __esModule: true,
    default: ({ onDateSelect, initialDate }: any) => (
        <div>
            <div data-testid="date-carousel-initial">{new Date(initialDate).toISOString()}</div>
            <button type="button" onClick={() => onDateSelect(new Date('2026-04-03T15:30:00Z'))}>
                Pick 2026-04-03
            </button>
        </div>
    ),
}));

vi.mock('@/components/FamilyMembersList', () => ({
    __esModule: true,
    default: ({ familyMembers, setSelectedMember }: any) => (
        <div>
            <button type="button" onClick={() => setSelectedMember('All')}>
                Select All Members
            </button>
            {familyMembers.map((member: any) => (
                <button key={member.id} type="button" onClick={() => setSelectedMember(member.id)}>
                    Select {member.name}
                </button>
            ))}
        </div>
    ),
}));

vi.mock('@/components/ChoreList', () => ({
    __esModule: true,
    default: (props: any) => {
        choreTrackerMocks.lastChoreListProps = props;
        return (
            <div data-testid="mock-chore-list">
                <div data-testid="chore-list-date">{props.selectedDate?.toISOString?.() ?? ''}</div>
                <div data-testid="chore-list-chores">{(props.chores || []).map((c: any) => c.title).join('|')}</div>
                <div data-testid="chore-list-show-desc">{String(props.showChoreDescriptions)}</div>
                <div data-testid="chore-list-show-details">{String(props.showTaskDetails)}</div>
            </div>
        );
    },
}));

vi.mock('@/components/DetailedChoreForm', () => ({
    __esModule: true,
    default: () => <div data-testid="detailed-chore-form" />,
}));

vi.mock('@/components/task-series/TaskSeriesEditor', () => ({
    __esModule: true,
    default: () => <div data-testid="task-series-editor" />,
}));

vi.mock('@/components/ui/RestrictedButton', () => ({
    RestrictedButton: ({ children, isRestricted, restrictionMessage, ...props }: any) => (
        <button type="button" data-restricted={String(isRestricted)} data-restriction-message={restrictionMessage} {...props}>
            {children}
        </button>
    ),
}));

vi.mock('@/lib/currency-utils', () => ({
    computeAllApplicableCurrencyCodes: (...args: any[]) => (choreTrackerMocks.computeAllApplicableCurrencyCodes as any)(...args),
}));

vi.mock('@/lib/chore-utils', async () => {
    const actual = await vi.importActual<typeof import('@/lib/chore-utils')>('@/lib/chore-utils');
    return {
        ...actual,
        getAssignedMembersForChoreOnDate: (...args: any[]) => (choreTrackerMocks.getAssignedMembersForChoreOnDate as any)(...args),
        calculateDailyXP: (...args: any[]) => (choreTrackerMocks.calculateDailyXP as any)(...args),
    };
});

const instantMocks = vi.hoisted(() => ({
    id: vi.fn(() => 'generated-id'),
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
}));

vi.mock('@instantdb/react', () => ({
    tx: instantMocks.tx,
    id: instantMocks.id,
}));

import ChoresTracker from '@/components/ChoresTracker';

function makeData(overrides: Partial<any> = {}) {
    const familyMembers = overrides.familyMembers ?? [
        { id: 'kid-a', name: 'Alex', role: 'child', viewShowChoreDescriptions: null, viewShowTaskDetails: null, allowanceEnvelopes: [] },
        { id: 'kid-b', name: 'Blair', role: 'child', viewShowChoreDescriptions: null, viewShowTaskDetails: null, allowanceEnvelopes: [] },
    ];

    const chores = overrides.chores ?? [
        {
            id: 'chore-a',
            title: 'Alex Chore',
            startDate: '2026-04-03',
            done: false,
            rrule: null,
            assignees: [{ id: 'kid-a', name: 'Alex' }],
            rotationType: 'none',
            completions: [],
            taskSeries: [],
        },
        {
            id: 'chore-b',
            title: 'Blair Chore',
            startDate: '2026-04-03',
            done: false,
            rrule: null,
            assignees: [{ id: 'kid-b', name: 'Blair' }],
            rotationType: 'none',
            completions: [],
            taskSeries: [],
        },
        {
            id: 'chore-c',
            title: 'Alex Other Day',
            startDate: '2026-04-04',
            done: false,
            rrule: null,
            assignees: [{ id: 'kid-a', name: 'Alex' }],
            rotationType: 'none',
            completions: [],
            taskSeries: [],
        },
    ];

    return {
        familyMembers,
        chores,
        unitDefinitions: overrides.unitDefinitions ?? [],
        allowanceEnvelopes: overrides.allowanceEnvelopes ?? [],
        choreAssignments: overrides.choreAssignments ?? [],
        choreCompletions: overrides.choreCompletions ?? [],
    };
}

describe('ChoresTracker', () => {
    beforeEach(() => {
        choreTrackerMocks.dbUseQuery.mockClear();
        choreTrackerMocks.dbTransact.mockClear();
        choreTrackerMocks.toast.mockClear();
        choreTrackerMocks.computeAllApplicableCurrencyCodes.mockClear();
        choreTrackerMocks.calculateDailyXP.mockClear();
        choreTrackerMocks.lastChoreListProps = null;
        choreTrackerMocks.currentUser = { id: 'kid-a', role: 'child' };
        choreTrackerMocks.isParentMode = false;
        choreTrackerMocks.dbState.isLoading = false;
        choreTrackerMocks.dbState.error = null;
        choreTrackerMocks.dbState.data = makeData();

        choreTrackerMocks.getAssignedMembersForChoreOnDate.mockImplementation((chore: any, selectedDate: Date) => {
            const dateStr = new Date(selectedDate).toISOString().slice(0, 10);
            if (chore.startDate === dateStr) return chore.assignees ?? [];
            return [];
        });
    });

    it('filters chores by selected member and date, and propagates UTC-normalized date selection to ChoreList', async () => {
        const user = userEvent.setup();
        render(<ChoresTracker />);

        // Initial state is "All" + current date, so our test chores for 2026-04-03 are not shown yet.
        await user.click(screen.getByRole('button', { name: /pick 2026-04-03/i }));

        expect(screen.getByTestId('chore-list-date')).toHaveTextContent('2026-04-03T00:00:00.000Z');
        expect(screen.getByTestId('chore-list-chores')).toHaveTextContent('Alex Chore|Blair Chore');

        // One of the mocked FamilyMembersList instances (desktop/mobile) is enough to drive selection.
        await user.click(screen.getAllByRole('button', { name: /select alex/i })[0]);

        await waitFor(() => {
            expect(screen.getByTestId('chore-list-chores')).toHaveTextContent('Alex Chore');
        });
        expect(screen.getByTestId('chore-list-chores')).not.toHaveTextContent('Blair Chore');
    });

    it('uses selected-member defaults for view settings when no explicit preference exists', async () => {
        const user = userEvent.setup();
        render(<ChoresTracker />);

        const showDescriptions = screen.getByLabelText(/chore descriptions/i) as HTMLInputElement;
        const showDetails = screen.getByLabelText(/show task details/i) as HTMLInputElement;

        // "All" view defaults to false
        expect(showDescriptions.checked).toBe(false);
        expect(showDetails.checked).toBe(false);
        expect(screen.getByTestId('chore-list-show-desc')).toHaveTextContent('false');
        expect(screen.getByTestId('chore-list-show-details')).toHaveTextContent('false');

        await user.click(screen.getAllByRole('button', { name: /select alex/i })[0]);

        // Member-specific view defaults to true when unset
        expect((screen.getByLabelText(/chore descriptions/i) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByLabelText(/show task details/i) as HTMLInputElement).checked).toBe(true);
        expect(screen.getByTestId('chore-list-show-desc')).toHaveTextContent('true');
        expect(screen.getByTestId('chore-list-show-details')).toHaveTextContent('true');
    });

    it('persists explicit view setting toggles to the logged-in family member and honors stored preferences', async () => {
        const user = userEvent.setup();
        choreTrackerMocks.dbState.data = makeData({
            familyMembers: [
                {
                    id: 'kid-a',
                    name: 'Alex',
                    role: 'child',
                    viewShowChoreDescriptions: false,
                    viewShowTaskDetails: true,
                    allowanceEnvelopes: [],
                },
                { id: 'kid-b', name: 'Blair', role: 'child', allowanceEnvelopes: [] },
            ],
        });

        render(<ChoresTracker />);

        await user.click(screen.getAllByRole('button', { name: /select alex/i })[0]);

        const showDescriptions = screen.getByLabelText(/chore descriptions/i) as HTMLInputElement;
        const showDetails = screen.getByLabelText(/show task details/i) as HTMLInputElement;

        // Stored prefs override member-view default(true)
        expect(showDescriptions.checked).toBe(false);
        expect(showDetails.checked).toBe(true);

        await user.click(showDescriptions);

        expect(choreTrackerMocks.dbTransact).toHaveBeenCalledWith({
            op: 'update',
            entity: 'familyMembers',
            id: 'kid-a',
            payload: { viewShowChoreDescriptions: true },
        });
    });

    it('disables view setting toggles when no logged-in family member matches and shows restricted add button when not in parent mode', () => {
        choreTrackerMocks.currentUser = null;
        choreTrackerMocks.isParentMode = false;

        render(<ChoresTracker />);

        expect((screen.getByLabelText(/chore descriptions/i) as HTMLInputElement).disabled).toBe(true);
        expect((screen.getByLabelText(/show task details/i) as HTMLInputElement).disabled).toBe(true);

        const addChoreRestricted = screen.getByRole('button', { name: /add chore/i });
        expect(addChoreRestricted).toHaveAttribute('data-restricted', 'true');
        expect(addChoreRestricted).toHaveAttribute('data-restriction-message', 'Only parents can add chores.');
    });

    it('supports tasks page mode with initial member/date focus props', async () => {
        choreTrackerMocks.dbState.data = makeData({
            chores: [
                {
                    id: 'task-chore',
                    title: 'Tasked Chore',
                    startDate: '2026-04-03',
                    done: false,
                    rrule: null,
                    assignees: [{ id: 'kid-b', name: 'Blair' }],
                    rotationType: 'none',
                    completions: [],
                    taskSeries: [{ id: 'series-1', name: 'Series 1', tasks: [] }],
                },
                {
                    id: 'plain-chore',
                    title: 'Plain Chore',
                    startDate: '2026-04-03',
                    done: false,
                    rrule: null,
                    assignees: [{ id: 'kid-b', name: 'Blair' }],
                    rotationType: 'none',
                    completions: [],
                    taskSeries: [],
                },
            ],
        });

        render(
            <ChoresTracker
                pageMode="tasks"
                initialSelectedMember="kid-b"
                initialSelectedDate="2026-04-03"
                focusedChoreId="task-chore"
            />
        );

        await waitFor(() => {
            expect(screen.getByText("Blair's Tasks")).toBeInTheDocument();
        });
        expect(choreTrackerMocks.lastChoreListProps.pageMode).toBe('tasks');
        expect(choreTrackerMocks.lastChoreListProps.focusedChoreId).toBe('task-chore');
        expect(screen.getByTestId('chore-list-chores')).toHaveTextContent('Tasked Chore');
        expect(screen.getByTestId('chore-list-chores')).not.toHaveTextContent('Plain Chore');
    });
});
