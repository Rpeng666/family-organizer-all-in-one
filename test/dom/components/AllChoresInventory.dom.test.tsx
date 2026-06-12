// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: vi.fn(),
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
    };
});

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

import AllChoresInventory from '@/components/AllChoresInventory';

const familyMembers = [
    { id: 'kid-a', name: 'Alex' },
    { id: 'kid-b', name: 'Blair' },
];

function makePauseState(overrides: any = {}) {
    return {
        mode: 'bounded',
        intent: 'paused',
        pauseStartDate: '2026-03-14',
        resumeOnDate: '2026-03-20',
        generatedExdates: [],
        originalEndCondition: { type: 'none' },
        createdAt: '2026-03-14T00:00:00.000Z',
        ...overrides,
    };
}

function makeChore(overrides: any = {}) {
    return {
        id: overrides.id ?? `chore-${Math.random()}`,
        title: overrides.title ?? 'Test Chore',
        startDate: overrides.startDate ?? '2026-03-01T00:00:00.000Z',
        createdAt: overrides.createdAt ?? '2026-03-16T00:00:00.000Z',
        rrule: Object.prototype.hasOwnProperty.call(overrides, 'rrule') ? overrides.rrule : 'RRULE:FREQ=DAILY',
        assignees: overrides.assignees ?? [{ id: 'kid-a', name: 'Alex' }],
        assignments: overrides.assignments ?? [],
        completions: overrides.completions ?? [],
        taskSeries: overrides.taskSeries ?? [],
        pauseState: overrides.pauseState,
        isUpForGrabs: overrides.isUpForGrabs ?? false,
        isJoint: overrides.isJoint ?? false,
        rotationType: overrides.rotationType ?? 'none',
    };
}

function renderInventory(chores: any[]) {
    return render(
        <AllChoresInventory
            chores={chores}
            familyMembers={familyMembers}
            referenceDate={new Date('2026-03-16T00:00:00.000Z')}
            updateChore={vi.fn()}
            updateChoreSchedule={vi.fn()}
            db={{}}
            unitDefinitions={[]}
            currencyOptions={[]}
            canEditChores={true}
        />
    );
}

describe('AllChoresInventory', () => {
    it('shows only active chores by default, including recurring chores not due today and one-time chores due today', () => {
        renderInventory([
            makeChore({
                id: 'recurring-active',
                title: 'Every Other Day',
                startDate: '2026-03-15T00:00:00.000Z',
                rrule: 'RRULE:FREQ=DAILY;INTERVAL=2',
            }),
            makeChore({
                id: 'one-time-today',
                title: 'Today Only',
                startDate: '2026-03-16T00:00:00.000Z',
                rrule: null,
            }),
            makeChore({
                id: 'paused',
                title: 'Paused Chore',
                pauseState: makePauseState(),
            }),
            makeChore({
                id: 'future-one-time',
                title: 'Future One-Time',
                startDate: '2026-03-20T00:00:00.000Z',
                rrule: null,
            }),
            makeChore({
                id: 'past-one-time',
                title: 'Past One-Time',
                startDate: '2026-03-10T00:00:00.000Z',
                rrule: null,
            }),
        ]);

        expect(screen.getByText('Every Other Day')).toBeInTheDocument();
        expect(screen.getByText('Today Only')).toBeInTheDocument();
        expect(screen.queryByText('Paused Chore')).not.toBeInTheDocument();
        expect(screen.queryByText('Future One-Time')).not.toBeInTheDocument();
        expect(screen.queryByText('Past One-Time')).not.toBeInTheDocument();
    });

    it('groups one-time chores into past, today, and future sections', async () => {
        const user = userEvent.setup();
        renderInventory([
            makeChore({
                id: 'today',
                title: 'One-Time Today',
                startDate: '2026-03-16T00:00:00.000Z',
                rrule: null,
            }),
            makeChore({
                id: 'future',
                title: 'One-Time Future',
                startDate: '2026-03-20T00:00:00.000Z',
                rrule: null,
            }),
            makeChore({
                id: 'past',
                title: 'One-Time Past',
                startDate: '2026-03-10T00:00:00.000Z',
                rrule: null,
            }),
        ]);

        await user.click(screen.getAllByRole('button', { name: /one-time/i })[0]);

        expect(screen.getByRole('heading', { name: /past/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /today/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /future/i })).toBeInTheDocument();
        expect(screen.getByText('One-Time Past')).toBeInTheDocument();
        expect(screen.getByText('One-Time Today')).toBeInTheDocument();
        expect(screen.getByText('One-Time Future')).toBeInTheDocument();
    });

    it('opens the shared detail modal from an inventory row', async () => {
        const user = userEvent.setup();
        renderInventory([
            makeChore({
                id: 'recurring-active',
                title: 'Inventory Detail Chore',
                startDate: '2026-03-15T00:00:00.000Z',
                rrule: 'RRULE:FREQ=DAILY;INTERVAL=2',
            }),
        ]);

        await user.click(screen.getByRole('button', { name: /inventory detail chore/i }));

        expect(screen.getByRole('heading', { name: /inventory detail chore/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /assignment preview/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /edit chore/i })).toBeInTheDocument();
    });
});
