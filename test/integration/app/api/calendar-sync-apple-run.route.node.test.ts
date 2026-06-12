import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const runAppleCalendarSync = vi.fn();

vi.mock('@/lib/apple-caldav/sync', () => ({
    runAppleCalendarSync,
}));

describe('POST /api/calendar-sync/apple/run', () => {
    beforeEach(() => {
        process.env.DEVICE_ACCESS_KEY = 'test-device-key';
        process.env.CALENDAR_SYNC_CRON_SECRET = 'cron-secret';
        runAppleCalendarSync.mockReset();
    });

    it('accepts cron secret authentication', async () => {
        runAppleCalendarSync.mockResolvedValue({ skipped: false, runId: 'run_1' });
        const { POST } = await import('@/app/api/calendar-sync/apple/run/route');
        const response = await POST(
            new NextRequest('http://localhost:3000/api/calendar-sync/apple/run', {
                method: 'POST',
                headers: {
                    authorization: 'Bearer cron-secret',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ trigger: 'cron' }),
            })
        );

        expect(response.status).toBe(200);
        expect(runAppleCalendarSync).toHaveBeenCalledWith({ accountId: undefined, trigger: 'cron' });
    });

    it('returns 409 when a sync is already running', async () => {
        runAppleCalendarSync.mockResolvedValue({ skipped: true, reason: 'already_running' });
        const { POST } = await import('@/app/api/calendar-sync/apple/run/route');
        const response = await POST(
            new NextRequest('http://localhost:3000/api/calendar-sync/apple/run', {
                method: 'POST',
                headers: { authorization: 'Bearer cron-secret' },
            })
        );

        expect(response.status).toBe(409);
    });

    it('returns 200 for cron ticks that are not due yet', async () => {
        runAppleCalendarSync.mockResolvedValue({
            skipped: true,
            reason: 'not_due',
            nextPollInMs: 30_000,
        });
        const { POST } = await import('@/app/api/calendar-sync/apple/run/route');
        const response = await POST(
            new NextRequest('http://localhost:3000/api/calendar-sync/apple/run', {
                method: 'POST',
                headers: { authorization: 'Bearer cron-secret' },
            })
        );

        expect(response.status).toBe(200);
    });
});
