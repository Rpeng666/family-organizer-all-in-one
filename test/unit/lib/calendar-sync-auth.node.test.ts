import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    getUserFromRequest: vi.fn(),
    verifyToken: vi.fn(),
    getDeviceAuthContextFromNextRequest: vi.fn(),
    getParentPrincipalAuthEmail: vi.fn(),
}));

vi.mock('@/lib/device-auth-server', () => ({
    getDeviceAuthContextFromNextRequest: mocks.getDeviceAuthContextFromNextRequest,
}));

vi.mock('@/lib/instant-admin', () => ({
    getInstantAdminDb: () => ({
        auth: {
            getUserFromRequest: mocks.getUserFromRequest,
            verifyToken: mocks.verifyToken,
        },
    }),
    getParentPrincipalAuthEmail: mocks.getParentPrincipalAuthEmail,
}));

describe('calendar sync auth', () => {
    beforeEach(() => {
        process.env.CALENDAR_SYNC_CRON_SECRET = 'cron-secret';
        mocks.getUserFromRequest.mockReset();
        mocks.verifyToken.mockReset();
        mocks.getDeviceAuthContextFromNextRequest.mockReset();
        mocks.getParentPrincipalAuthEmail.mockReturnValue('parent@family-organizer.local');
        mocks.getUserFromRequest.mockResolvedValue(null);
        mocks.getDeviceAuthContextFromNextRequest.mockReturnValue({ authorized: false, reason: 'missing' });
    });

    it('accepts cron secret requests', async () => {
        const { requireCalendarSyncRouteAuth } = await import('@/lib/calendar-sync-auth');
        const result = await requireCalendarSyncRouteAuth(
            new NextRequest('http://localhost:3000/api/calendar-sync/apple/run', {
                headers: { authorization: 'Bearer cron-secret' },
            })
        );

        expect(result).toEqual({ authorized: true, kind: 'cron' });
    });

    it('rejects device-only requests without a verified parent principal', async () => {
        mocks.getDeviceAuthContextFromNextRequest.mockReturnValue({ authorized: true });
        const { requireCalendarSyncRouteAuth } = await import('@/lib/calendar-sync-auth');
        const result = await requireCalendarSyncRouteAuth(
            new NextRequest('http://localhost:3000/api/calendar-sync/apple/run', {
                headers: { cookie: 'family_device_auth=true' },
            })
        );

        expect(result).toEqual({ authorized: false, reason: 'parent_required' });
    });

    it('accepts verified parent principals from the Instant cookie', async () => {
        mocks.getUserFromRequest.mockResolvedValue({ email: 'parent@family-organizer.local', type: 'parent' });
        const { requireCalendarSyncRouteAuth } = await import('@/lib/calendar-sync-auth');
        const result = await requireCalendarSyncRouteAuth(
            new NextRequest('http://localhost:3000/api/calendar-sync/apple/status')
        );

        expect(result).toEqual({ authorized: true, kind: 'parent-cookie' });
    });

    it('accepts a verified parent principal token header on device-authenticated requests', async () => {
        mocks.getDeviceAuthContextFromNextRequest.mockReturnValue({ authorized: true });
        mocks.verifyToken.mockResolvedValue({ email: 'parent@family-organizer.local', type: 'parent' });
        const { requireCalendarSyncRouteAuth } = await import('@/lib/calendar-sync-auth');
        const { CALENDAR_SYNC_PARENT_TOKEN_HEADER } = await import('@/lib/calendar-sync-constants');
        const result = await requireCalendarSyncRouteAuth(
            new NextRequest('http://localhost:3000/api/calendar-sync/apple/status', {
                headers: {
                    cookie: 'family_device_auth=true',
                    [CALENDAR_SYNC_PARENT_TOKEN_HEADER]: 'parent-token',
                },
            })
        );

        expect(result).toEqual({ authorized: true, kind: 'parent-device' });
    });
});
