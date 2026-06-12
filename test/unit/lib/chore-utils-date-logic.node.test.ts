import { describe, expect, it, vi } from 'vitest';
import { freezeTime } from '@/test/utils/fake-clock';

const instantMocks = vi.hoisted(() => ({
    id: vi.fn(() => 'mock-id'),
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
                                create(payload: unknown) {
                                    return { op: 'create', entity, id, payload };
                                },
                                link(payload: unknown) {
                                    return { op: 'link', entity, id, payload };
                                },
                                delete() {
                                    return { op: 'delete', entity, id };
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
    id: instantMocks.id,
    tx: instantMocks.tx,
}));

vi.mock('@/lib/db', () => ({
    db: {},
}));

import {
    calculatePeriodDetails,
    calculateDailyXP,
    getAllowancePeriodForDate,
    getAssignedMembersForChoreOnDate,
    getChoreAssignmentGridFromChore,
    getChoreOccurrencesForMemberInPeriod,
    markCompletionsAwarded,
    type Chore,
} from '@/lib/chore-utils';

function makeRotatingChore(overrides: Partial<Chore> = {}): Chore {
    return {
        id: 'chore-1',
        title: 'Rotating Dishes',
        startDate: '2026-03-01',
        rrule: 'FREQ=DAILY',
        rotationType: 'daily',
        assignees: [
            { id: 'kid-a', name: 'Alex' },
            { id: 'kid-b', name: 'Blair' },
        ],
        assignments: [
            { order: 2, familyMember: { id: 'kid-b', name: 'Blair' } },
            { order: 1, familyMember: { id: 'kid-a', name: 'Alex' } },
        ],
        ...overrides,
    };
}

describe('chore-utils date logic', () => {
    it('returns assignees for a non-recurring chore only on its start date', () => {
        const chore: Chore = {
            id: 'one-off',
            title: 'One-off',
            startDate: '2026-03-04',
            rrule: null,
            rotationType: 'none',
            assignees: [{ id: 'kid-a', name: 'Alex' }],
        };

        expect(getAssignedMembersForChoreOnDate(chore, new Date('2026-03-04T10:00:00Z')).map((m) => m.id)).toEqual(['kid-a']);
        expect(getAssignedMembersForChoreOnDate(chore, new Date('2026-03-05T10:00:00Z'))).toEqual([]);
    });

    it('assigns rotating chores using sorted assignment order across occurrences', () => {
        const chore = makeRotatingChore();

        const day1 = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-01T12:00:00Z'));
        const day2 = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-02T12:00:00Z'));
        const day3 = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-03T12:00:00Z'));

        expect(day1.map((m) => m.id)).toEqual(['kid-a']);
        expect(day2.map((m) => m.id)).toEqual(['kid-b']);
        expect(day3.map((m) => m.id)).toEqual(['kid-a']);
    });

    it('treats up-for-grabs chores as available to all assignees even when rotation data exists', () => {
        const chore = makeRotatingChore({ isUpForGrabs: true });

        const assigned = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-02T12:00:00Z'));

        expect(assigned.map((m) => m.id).sort()).toEqual(['kid-a', 'kid-b']);
    });

    it('returns an empty assignment list when a recurring chore does not occur on the queried date', () => {
        const chore = makeRotatingChore({ rrule: 'FREQ=WEEKLY;BYDAY=MO' });

        const assigned = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-03T12:00:00Z')); // Tue

        expect(assigned).toEqual([]);
    });

    it('handles monthly end-of-month recurrences that skip shorter months', () => {
        const chore = makeRotatingChore({
            startDate: '2026-01-31',
            rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
            rotationType: 'none',
        });

        expect(getAssignedMembersForChoreOnDate(chore, new Date('2026-02-28T12:00:00Z'))).toEqual([]);
        expect(getAssignedMembersForChoreOnDate(chore, new Date('2026-03-31T12:00:00Z')).map((m) => m.id)).toEqual(['kid-a', 'kid-b']);
    });

    it('advances weekly rotation by recurrence interval, not raw elapsed weeks', () => {
        const chore = makeRotatingChore({
            startDate: '2026-03-02', // Monday
            rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO',
            rotationType: 'weekly',
        });

        const week0 = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-02T12:00:00Z'));
        const week2 = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-16T12:00:00Z'));
        const week4 = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-30T12:00:00Z'));

        expect(week0.map((m) => m.id)).toEqual(['kid-a']);
        expect(week2.map((m) => m.id)).toEqual(['kid-b']);
        expect(week4.map((m) => m.id)).toEqual(['kid-a']);
    });

    it('advances monthly rotation by recurrence interval, not raw elapsed months', () => {
        const chore = makeRotatingChore({
            startDate: '2026-01-15',
            rrule: 'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=15',
            rotationType: 'monthly',
        });

        const month0 = getAssignedMembersForChoreOnDate(chore, new Date('2026-01-15T12:00:00Z'));
        const month2 = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-15T12:00:00Z'));
        const month4 = getAssignedMembersForChoreOnDate(chore, new Date('2026-05-15T12:00:00Z'));

        expect(month0.map((m) => m.id)).toEqual(['kid-a']);
        expect(month2.map((m) => m.id)).toEqual(['kid-b']);
        expect(month4.map((m) => m.id)).toEqual(['kid-a']);
    });

    it('returns no assignees when the RRULE is invalid', () => {
        const chore = makeRotatingChore({ rrule: 'NOT_A_REAL_RRULE' as any });
        const assigned = getAssignedMembersForChoreOnDate(chore, new Date('2026-03-02T12:00:00Z'));
        expect(assigned).toEqual([]);
    });

    it('computes the containing allowance period boundaries for weekly schedules', () => {
        const period = getAllowancePeriodForDate(new Date('2026-03-05T12:00:00Z'), 'FREQ=WEEKLY', '2026-03-02');

        expect(period).not.toBeNull();
        expect(period?.startDate.toISOString().slice(0, 10)).toBe('2026-03-02');
        expect(period?.endDate.toISOString().slice(0, 10)).toBe('2026-03-08');
    });

    it('returns null when asking for an allowance period before the first scheduled occurrence', () => {
        const period = getAllowancePeriodForDate(new Date('2026-02-28T12:00:00Z'), 'FREQ=WEEKLY', '2026-03-02');
        expect(period).toBeNull();
    });

    it('returns only occurrences assigned to the requested member within a period', () => {
        const chore = makeRotatingChore();
        const occurrences = getChoreOccurrencesForMemberInPeriod(
            chore,
            'kid-a',
            new Date('2026-03-01T00:00:00Z'),
            new Date('2026-03-05T23:59:59Z')
        );

        expect(occurrences.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-03-01', '2026-03-03', '2026-03-05']);
    });

    it('returns a one-off occurrence for a non-recurring chore only if the member is assigned and the date is in range', () => {
        const chore: Chore = {
            id: 'one-off',
            title: 'Clean room',
            startDate: '2026-03-04',
            rrule: null,
            rotationType: 'none',
            assignees: [{ id: 'kid-a', name: 'Alex' }],
        };

        const inRange = getChoreOccurrencesForMemberInPeriod(
            chore,
            'kid-a',
            new Date('2026-03-01T00:00:00Z'),
            new Date('2026-03-10T00:00:00Z')
        );
        const wrongMember = getChoreOccurrencesForMemberInPeriod(
            chore,
            'kid-b',
            new Date('2026-03-01T00:00:00Z'),
            new Date('2026-03-10T00:00:00Z')
        );
        const outOfRange = getChoreOccurrencesForMemberInPeriod(
            chore,
            'kid-a',
            new Date('2026-03-05T00:00:00Z'),
            new Date('2026-03-10T00:00:00Z')
        );

        expect(inRange.map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-03-04']);
        expect(wrongMember).toEqual([]);
        expect(outOfRange).toEqual([]);
    });

    it('calculates daily XP with standard, fixed-reward, and up-for-grabs chores', () => {
        const date = new Date('2026-03-05T00:00:00Z');
        const familyMembers = [
            { id: 'kid-a', name: 'Alex' },
            { id: 'kid-b', name: 'Blair' },
        ];

        const chores = [
            {
                id: 'standard',
                startDate: '2026-03-01',
                rrule: 'FREQ=DAILY',
                rotationType: 'none',
                assignees: [{ id: 'kid-a' }, { id: 'kid-b' }],
                weight: 2,
                completions: [
                    { dateDue: '2026-03-05', completed: true, completedBy: { id: 'kid-a' } },
                    { dateDue: '2026-03-05', completed: false, completedBy: { id: 'kid-b' } },
                ],
            },
            {
                id: 'fixed-up-for-grabs',
                startDate: '2026-03-01',
                rrule: 'FREQ=DAILY',
                rotationType: 'none',
                assignees: [{ id: 'kid-a' }, { id: 'kid-b' }],
                weight: 5,
                isUpForGrabs: true,
                rewardType: 'fixed',
                completions: [{ dateDue: '2026-03-05', completed: true, completedBy: { id: 'kid-b' } }],
            },
            {
                id: 'weight-up-for-grabs-unclaimed',
                startDate: '2026-03-01',
                rrule: 'FREQ=DAILY',
                rotationType: 'none',
                assignees: [{ id: 'kid-a' }, { id: 'kid-b' }],
                weight: 3,
                isUpForGrabs: true,
                rewardType: 'weight',
                completions: [],
            },
            {
                id: 'weight-up-for-grabs-claimed',
                startDate: '2026-03-01',
                rrule: 'FREQ=DAILY',
                rotationType: 'none',
                assignees: [{ id: 'kid-a' }, { id: 'kid-b' }],
                weight: 4,
                isUpForGrabs: true,
                rewardType: 'weight',
                completions: [{ dateDue: '2026-03-05', completed: true, completedBy: { id: 'kid-b' } }],
            },
        ];

        const xp = calculateDailyXP(chores, familyMembers, date);

        expect(xp['kid-a']).toEqual({
            // Standard chore: possible +2, completed +2
            // Unclaimed up-for-grabs weight chore: possible +3
            current: 2,
            possible: 5,
        });

        expect(xp['kid-b']).toEqual({
            // Standard chore: possible +2
            // Unclaimed up-for-grabs weight chore: possible +3
            // Claimed up-for-grabs weight chore: possible +4, current +4
            // Fixed reward chore contributes 0 XP
            current: 4,
            possible: 9,
        });
    });

    it('calculates allowance period details with weighted chores, fixed rewards, and up-for-grabs contribution', async () => {
        freezeTime(new Date('2026-03-08T12:00:00Z'));

        const allChores: any[] = [
            {
                id: 'regular',
                title: 'Daily regular chore',
                startDate: '2026-03-01',
                rrule: 'FREQ=DAILY',
                rotationType: 'none',
                assignees: [{ id: 'kid-a', name: 'Alex' }],
                weight: 2,
            },
            {
                id: 'ufg-weight',
                title: 'Up for grabs weight',
                startDate: '2026-03-01',
                rrule: 'FREQ=DAILY',
                rotationType: 'none',
                assignees: [{ id: 'kid-a', name: 'Alex' }, { id: 'kid-b', name: 'Blair' }],
                weight: 3,
                isUpForGrabs: true,
                rewardType: 'weight',
            },
            {
                id: 'ufg-fixed',
                title: 'Up for grabs fixed',
                startDate: '2026-03-01',
                rrule: 'FREQ=DAILY',
                rotationType: 'none',
                assignees: [{ id: 'kid-a', name: 'Alex' }, { id: 'kid-b', name: 'Blair' }],
                isUpForGrabs: true,
                rewardType: 'fixed',
                rewardAmount: 4,
                rewardCurrency: 'usd',
                weight: 0,
            },
        ];

        const completions: any[] = [
            { id: 'c1', dateDue: '2026-03-01', completed: true, chore: [{ id: 'regular' }] },
            { id: 'c2', dateDue: '2026-03-02', completed: false, chore: [{ id: 'regular' }] },
            { id: 'c3', dateDue: '2026-03-03', completed: true, chore: [{ id: 'ufg-weight' }] },
            { id: 'c4', dateDue: '2026-03-04', completed: true, chore: [{ id: 'ufg-fixed' }] },
            { id: 'c5', dateDue: '2026-03-20', completed: true, chore: [{ id: 'regular' }] }, // outside period
        ];

        const result = await calculatePeriodDetails(
            {} as any,
            'kid-a',
            new Date('2026-03-01T00:00:00Z'),
            new Date('2026-03-07T00:00:00Z'),
            100,
            allChores as any,
            completions as any
        );

        expect(result).not.toBeNull();
        expect(result).toMatchObject({
            familyMemberId: 'kid-a',
            totalWeight: 14, // 7 days * weight 2 for regular chore
            completedWeight: 5, // regular complete (2) + up-for-grabs weight complete (3)
            calculatedAmount: (5 / 14) * 100,
            fixedRewardsEarned: { USD: 4 },
            completionsToMark: ['c1', 'c2', 'c3', 'c4'],
        });
        expect(result?.percentage).toBeCloseTo((5 / 14) * 100, 6);
        expect(result?.upForGrabsContributionPercentage).toBeCloseTo((3 / 14) * 100, 6);
        expect(result?.lastCalculatedAt.toISOString()).toBe('2026-03-08T12:00:00.000Z');
    });

    it('marks completions as awarded via batch update transactions', async () => {
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        await markCompletionsAwarded(db as any, ['comp-1', 'comp-2']);

        expect(db.transact).toHaveBeenCalledTimes(1);
        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs).toHaveLength(2);
        expect(txs).toEqual([
            { op: 'update', entity: 'choreCompletions', id: 'comp-1', payload: { allowanceAwarded: true } },
            { op: 'update', entity: 'choreCompletions', id: 'comp-2', payload: { allowanceAwarded: true } },
        ]);
    });

    it('returns assignment preview grid for rotating chores across a date range', async () => {
        const chore = makeRotatingChore({
            id: 'rot-grid',
            startDate: '2026-03-01',
            rrule: 'FREQ=DAILY',
        });

        const grid = await getChoreAssignmentGridFromChore(chore as any, new Date('2026-03-01T00:00:00Z'), new Date('2026-03-03T00:00:00Z'));

        expect(Object.keys(grid).sort()).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
        expect(grid['2026-03-01']).toMatchObject({ 'kid-a': { assigned: true, completed: false } });
        expect(grid['2026-03-02']).toMatchObject({ 'kid-b': { assigned: true, completed: false } });
        expect(grid['2026-03-03']).toMatchObject({ 'kid-a': { assigned: true, completed: false } });
    });

    it('merges completions into the assignment grid', async () => {
        const chore = makeRotatingChore({
            id: 'rot-comp',
            startDate: '2026-03-01',
            rrule: 'FREQ=DAILY',
            completions: [
                { id: 'c1', completed: true, dateDue: '2026-03-01', completedBy: { id: 'kid-a' } },
                { id: 'c2', completed: true, dateDue: '2026-03-02', completedBy: { id: 'kid-b' } },
            ],
        } as any);

        const grid = await getChoreAssignmentGridFromChore(chore as any, new Date('2026-03-01T00:00:00Z'), new Date('2026-03-03T00:00:00Z'));

        expect(grid['2026-03-01']['kid-a']).toMatchObject({ assigned: true, completed: true });
        expect(grid['2026-03-02']['kid-b']).toMatchObject({ assigned: true, completed: true });
        expect(grid['2026-03-03']['kid-a']).toMatchObject({ assigned: true, completed: false });
    });

    it('ignores completions for dates outside the grid range', async () => {
        const chore = makeRotatingChore({
            id: 'rot-out-of-range',
            startDate: '2026-03-01',
            rrule: 'FREQ=DAILY',
            completions: [
                { id: 'c1', completed: true, dateDue: '2026-02-28', completedBy: { id: 'kid-a' } },
            ],
        } as any);

        const grid = await getChoreAssignmentGridFromChore(chore as any, new Date('2026-03-01T00:00:00Z'), new Date('2026-03-02T00:00:00Z'));

        expect(grid['2026-03-01']['kid-a']).toMatchObject({ assigned: true, completed: false });
        expect(grid).not.toHaveProperty('2026-02-28');
    });

    it('handles completedBy as array format from InstantDB', async () => {
        const chore = makeRotatingChore({
            id: 'rot-arr',
            startDate: '2026-03-01',
            rrule: 'FREQ=DAILY',
            completions: [
                { id: 'c1', completed: true, dateDue: '2026-03-01', completedBy: [{ id: 'kid-a' }] },
            ],
        } as any);

        const grid = await getChoreAssignmentGridFromChore(chore as any, new Date('2026-03-01T00:00:00Z'), new Date('2026-03-01T00:00:00Z'));

        expect(grid['2026-03-01']['kid-a']).toMatchObject({ assigned: true, completed: true });
    });
});
