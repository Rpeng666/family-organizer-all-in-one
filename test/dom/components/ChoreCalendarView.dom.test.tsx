// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const choreUtilsMocks = vi.hoisted(() => ({
    getChoreAssignmentGridFromChore: vi.fn(),
    toUTCDate: vi.fn((value: any) => {
        const d = value instanceof Date ? new Date(value) : new Date(value);
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }),
    createRRuleWithStartDate: vi.fn(),
}));

vi.mock('@/lib/chore-utils', () => ({
    getChoreAssignmentGridFromChore: choreUtilsMocks.getChoreAssignmentGridFromChore,
    toUTCDate: choreUtilsMocks.toUTCDate,
    createRRuleWithStartDate: choreUtilsMocks.createRRuleWithStartDate,
}));

// Mock IntersectionObserver and scrollIntoView (not available in jsdom)
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

const { MockIntersectionObserver } = vi.hoisted(() => {
    const mockObs = vi.fn();
    const mockDisc = vi.fn();
    class MockIO implements Partial<IntersectionObserver> {
        constructor(_cb: IntersectionObserverCallback, _opts?: IntersectionObserverInit) {}
        observe = mockObs;
        disconnect = mockDisc;
        unobserve = vi.fn();
        takeRecords = vi.fn().mockReturnValue([]);
        root = null;
        rootMargin = '';
        thresholds = [0];
    }
    return { MockIntersectionObserver: MockIO, mockObs, mockDisc };
});
globalThis.IntersectionObserver = MockIntersectionObserver as any;

import ChoreCalendarView from '@/components/ChoreCalendarView';

/** Helper: YYYY-MM-DD key for a Date */
function dateKey(d: Date): string {
    return d.toISOString().split('T')[0];
}

function todayUTC(): Date {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

describe('ChoreCalendarView', () => {
    beforeEach(() => {
        choreUtilsMocks.getChoreAssignmentGridFromChore.mockReset();
        choreUtilsMocks.toUTCDate.mockClear();
        choreUtilsMocks.getChoreAssignmentGridFromChore.mockResolvedValue({});
        Element.prototype.scrollIntoView = vi.fn();
    });

    it('derives preview rows from rotation assignments when present', async () => {
        choreUtilsMocks.getChoreAssignmentGridFromChore.mockResolvedValue({});

        render(
            <ChoreCalendarView
                chore={{
                    id: 'chore-1',
                    title: 'Trash',
                    startDate: '2026-03-01T00:00:00.000Z',
                    assignments: [
                        { order: 0, familyMember: { id: 'm1', name: 'Ava' } },
                        { order: 1, familyMember: { id: 'm2', name: 'Ben' } },
                    ],
                }}
            />
        );

        expect(await screen.findByText('Ava')).toBeInTheDocument();
        expect(screen.getByText('Ben')).toBeInTheDocument();

        await waitFor(() => expect(choreUtilsMocks.getChoreAssignmentGridFromChore).toHaveBeenCalledTimes(1));
        const [choreArg, choreStartDateArg, endDateArg] = choreUtilsMocks.getChoreAssignmentGridFromChore.mock.calls[0];
        expect(choreArg.id).toBe('chore-1');
        expect(choreStartDateArg).toBeInstanceOf(Date);
        expect(endDateArg).toBeInstanceOf(Date);
    });

    it('sorts rotation preview rows by assignment order', async () => {
        choreUtilsMocks.getChoreAssignmentGridFromChore.mockResolvedValue({});

        const { container } = render(
            <ChoreCalendarView
                chore={{
                    id: 'chore-ordered',
                    title: 'Counters',
                    startDate: '2026-03-01T00:00:00.000Z',
                    assignments: [
                        { order: 4, familyMember: { id: 'm5', name: 'Ransom' } },
                        { order: 0, familyMember: { id: 'm1', name: 'David' } },
                        { order: 2, familyMember: { id: 'm3', name: 'Judah' } },
                        { order: 3, familyMember: { id: 'm4', name: 'Sarala' } },
                        { order: 1, familyMember: { id: 'm2', name: 'Mandy' } },
                    ],
                }}
            />
        );

        await screen.findByText('David');

        const rowLabels = Array.from(container.querySelectorAll('tbody > tr > td:first-child')).map((cell) => cell.textContent?.trim());
        expect(rowLabels).toEqual(['David', 'Mandy', 'Judah', 'Sarala', 'Ransom']);
    });

    it('renders green dot for completed and orange dot for missed (today)', async () => {
        const todayStr = dateKey(todayUTC());
        choreUtilsMocks.getChoreAssignmentGridFromChore.mockResolvedValue({
            [todayStr]: {
                m1: { assigned: true, completed: true },
                m2: { assigned: true, completed: false },
            },
        });

        const { container } = render(
            <ChoreCalendarView
                chore={{
                    id: 'chore-2',
                    title: 'Laundry',
                    startDate: new Date().toISOString(),
                    assignees: [
                        { id: 'm1', name: 'Ava' },
                        { id: 'm2', name: 'Ben' },
                    ],
                }}
            />
        );

        expect(await screen.findByText('Ava')).toBeInTheDocument();
        expect(screen.getByText('Ben')).toBeInTheDocument();

        await waitFor(() => {
            expect(container.querySelectorAll('span.bg-green-500')).toHaveLength(1);
            expect(container.querySelectorAll('span.bg-orange-500')).toHaveLength(1);
        });
    });

    it('renders gray dot for future dates', async () => {
        const tomorrow = todayUTC();
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const tomorrowStr = dateKey(tomorrow);

        choreUtilsMocks.getChoreAssignmentGridFromChore.mockResolvedValue({
            [tomorrowStr]: {
                m1: { assigned: true, completed: false },
            },
        });

        const { container } = render(
            <ChoreCalendarView
                chore={{
                    id: 'chore-3',
                    title: 'Dishes',
                    startDate: new Date().toISOString(),
                    assignees: [{ id: 'm1', name: 'Ava' }],
                }}
            />
        );

        expect(await screen.findByText('Ava')).toBeInTheDocument();

        await waitFor(() => {
            expect(container.querySelectorAll('span.bg-gray-300')).toHaveLength(1);
        });
    });

    it('renders orange dot for past uncompleted dates', async () => {
        const yesterday = todayUTC();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayStr = dateKey(yesterday);

        choreUtilsMocks.getChoreAssignmentGridFromChore.mockResolvedValue({
            [yesterdayStr]: {
                m1: { assigned: true, completed: false },
            },
        });

        const { container } = render(
            <ChoreCalendarView
                chore={{
                    id: 'chore-4',
                    title: 'Vacuum',
                    startDate: yesterday.toISOString(),
                    assignees: [{ id: 'm1', name: 'Ava' }],
                }}
            />
        );

        expect(await screen.findByText('Ava')).toBeInTheDocument();

        await waitFor(() => {
            expect(container.querySelectorAll('span.bg-orange-500')).toHaveLength(1);
        });
    });

    it('highlights today column with blue background', async () => {
        const todayStr = dateKey(todayUTC());
        choreUtilsMocks.getChoreAssignmentGridFromChore.mockResolvedValue({
            [todayStr]: {
                m1: { assigned: true, completed: true },
            },
        });

        const { container } = render(
            <ChoreCalendarView
                chore={{
                    id: 'chore-5',
                    title: 'Mop',
                    startDate: new Date().toISOString(),
                    assignees: [{ id: 'm1', name: 'Ava' }],
                }}
            />
        );

        expect(await screen.findByText('Ava')).toBeInTheDocument();

        await waitFor(() => {
            // Today's header cell should have blue background
            const todayHeader = container.querySelector('th.bg-blue-100');
            expect(todayHeader).not.toBeNull();
            // Today's body cell should have blue background
            const todayCell = container.querySelector('td.bg-blue-50');
            expect(todayCell).not.toBeNull();
        });
    });
});
