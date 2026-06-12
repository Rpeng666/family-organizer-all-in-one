import { describe, expect, it } from 'vitest';

describe('apple caldav polling policy', () => {
    it('always allows manual runs immediately', async () => {
        const { getAppleCalendarSyncPollPlan } = await import('@/lib/apple-caldav/polling');
        const plan = getAppleCalendarSyncPollPlan({
            trigger: 'manual',
            recentRuns: [],
            now: new Date('2026-03-10T08:00:00.000Z'),
            activePollMs: 15_000,
            maxIdlePollMs: 300_000,
            errorPollMs: 30_000,
            maxErrorPollMs: 300_000,
        });

        expect(plan.due).toBe(true);
        expect(plan.reason).toBe('manual');
        expect(plan.nextPollInMs).toBe(0);
    });

    it('keeps recent changed runs hot at the base polling interval', async () => {
        const { getAppleCalendarSyncPollPlan } = await import('@/lib/apple-caldav/polling');
        const plan = getAppleCalendarSyncPollPlan({
            trigger: 'cron',
            recentRuns: [{
                status: 'success',
                finishedAt: '2026-03-10T08:00:00.000Z',
                eventsCreated: 1,
            }],
            now: new Date('2026-03-10T08:00:10.000Z'),
            activePollMs: 15_000,
            maxIdlePollMs: 300_000,
            errorPollMs: 30_000,
            maxErrorPollMs: 300_000,
        });

        expect(plan.due).toBe(false);
        expect(plan.reason).toBe('recent_changes');
        expect(plan.intervalMs).toBe(15_000);
        expect(plan.nextPollInMs).toBe(5_000);
    });

    it('backs off idle cron polling after quiet runs', async () => {
        const { getAppleCalendarSyncPollPlan } = await import('@/lib/apple-caldav/polling');
        const plan = getAppleCalendarSyncPollPlan({
            trigger: 'cron',
            recentRuns: [
                { status: 'success', finishedAt: '2026-03-10T08:00:00.000Z' },
                { status: 'success', finishedAt: '2026-03-10T07:59:00.000Z' },
            ],
            now: new Date('2026-03-10T08:00:20.000Z'),
            activePollMs: 15_000,
            maxIdlePollMs: 300_000,
            errorPollMs: 30_000,
            maxErrorPollMs: 300_000,
        });

        expect(plan.due).toBe(false);
        expect(plan.reason).toBe('idle_backoff_deep');
        expect(plan.intervalMs).toBe(60_000);
        expect(plan.nextPollInMs).toBe(40_000);
    });

    it('backs off failed cron polling more aggressively', async () => {
        const { getAppleCalendarSyncPollPlan } = await import('@/lib/apple-caldav/polling');
        const plan = getAppleCalendarSyncPollPlan({
            trigger: 'cron',
            recentRuns: [
                { status: 'failed', finishedAt: '2026-03-10T08:00:00.000Z' },
                { status: 'failed', finishedAt: '2026-03-10T07:59:00.000Z' },
            ],
            now: new Date('2026-03-10T08:00:20.000Z'),
            activePollMs: 15_000,
            maxIdlePollMs: 300_000,
            errorPollMs: 30_000,
            maxErrorPollMs: 300_000,
        });

        expect(plan.due).toBe(false);
        expect(plan.reason).toBe('error_backoff');
        expect(plan.intervalMs).toBe(60_000);
        expect(plan.nextPollInMs).toBe(40_000);
    });
});
