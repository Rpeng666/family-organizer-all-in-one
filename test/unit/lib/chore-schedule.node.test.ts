import { describe, expect, it } from 'vitest';
import {
    cancelChorePausePatch,
    createChorePausePatch,
    getChorePauseStatus,
    getChoreScheduleEndCondition,
    resumeChorePatch,
} from '@/lib/chore-schedule';

const DAILY_COUNT_CHORE = {
    id: 'chore-1',
    title: 'Daily dishes',
    startDate: '2026-03-01T00:00:00.000Z',
    rrule: 'RRULE:FREQ=DAILY;COUNT=5',
    exdates: [],
    pauseState: null,
};

describe('chore schedule helpers', () => {
    it('extends COUNT-based recurrences when creating a bounded pause', () => {
        const patch = createChorePausePatch(DAILY_COUNT_CHORE, {
            pauseStartDate: '2026-03-03',
            resumeOnDate: '2026-03-05',
        });

        expect(patch.exdates).toEqual(['2026-03-03', '2026-03-04']);
        expect(getChoreScheduleEndCondition(patch.rrule).type).toBe('count');
        expect(getChoreScheduleEndCondition(patch.rrule)).toEqual({ type: 'count', count: 7 });
        expect(patch.pauseState).toMatchObject({
            mode: 'bounded',
            pauseStartDate: '2026-03-03',
            resumeOnDate: '2026-03-05',
            generatedExdates: ['2026-03-03', '2026-03-04'],
            originalEndCondition: { type: 'count', count: 5 },
        });
    });

    it('restores the original COUNT when canceling a bounded pause', () => {
        const paused = createChorePausePatch(DAILY_COUNT_CHORE, {
            pauseStartDate: '2026-03-03',
            resumeOnDate: '2026-03-05',
        });

        const canceled = cancelChorePausePatch({
            ...DAILY_COUNT_CHORE,
            ...paused,
        }, new Date('2026-03-02T12:00:00Z'));

        expect(canceled.exdates).toEqual([]);
        expect(canceled.pauseState).toBeNull();
        expect(canceled.rrule).toBe('RRULE:FREQ=DAILY;COUNT=5');
    });

    it('caps the rule for an open-ended pause and restores it with skip dates on resume', () => {
        const paused = createChorePausePatch(DAILY_COUNT_CHORE, {
            pauseStartDate: '2026-03-03',
        });

        expect(paused.rrule).toBe('RRULE:FREQ=DAILY;UNTIL=20260302');
        expect(paused.pauseState).toMatchObject({
            mode: 'open-ended',
            pauseStartDate: '2026-03-03',
            originalEndCondition: { type: 'count', count: 5 },
        });

        const resumed = resumeChorePatch(
            {
                ...DAILY_COUNT_CHORE,
                ...paused,
            },
            {
                resumeOnDate: '2026-03-05',
            }
        );

        expect(resumed.pauseState).toBeNull();
        expect(resumed.exdates).toEqual(['2026-03-03', '2026-03-04']);
        expect(resumed.rrule).toBe('RRULE:FREQ=DAILY;COUNT=7');
    });

    it('treats future open-ended ends as scheduled and active open-ended ends as ended', () => {
        const openEndedChore = {
            ...DAILY_COUNT_CHORE,
            rrule: 'RRULE:FREQ=DAILY',
        };

        const scheduledEnd = createChorePausePatch(openEndedChore, {
            pauseStartDate: '2026-03-08',
            intent: 'ended',
        });

        expect(
            getChorePauseStatus(
                {
                    ...openEndedChore,
                    ...scheduledEnd,
                },
                new Date('2026-03-05T12:00:00Z')
            ).kind
        ).toBe('scheduled');

        expect(
            getChorePauseStatus(
                {
                    ...openEndedChore,
                    ...scheduledEnd,
                },
                new Date('2026-03-10T12:00:00Z')
            ).kind
        ).toBe('ended');
    });
});
