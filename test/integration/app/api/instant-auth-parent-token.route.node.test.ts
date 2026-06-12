import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const parentRouteMocks = vi.hoisted(() => ({
    getFamilyMemberById: vi.fn(),
    isInstantFamilyAuthConfigured: vi.fn(),
    mintFamilyMemberToken: vi.fn(),
    verifyFamilyMemberCredentials: vi.fn(),
    checkParentElevationRateLimit: vi.fn(),
    clearParentElevationRateLimit: vi.fn(),
    getParentElevationRateLimitKey: vi.fn(),
    recordParentElevationFailure: vi.fn(),
}));

vi.mock('@/lib/instant-admin', () => ({
    getFamilyMemberById: parentRouteMocks.getFamilyMemberById,
    isInstantFamilyAuthConfigured: parentRouteMocks.isInstantFamilyAuthConfigured,
    mintFamilyMemberToken: parentRouteMocks.mintFamilyMemberToken,
    verifyFamilyMemberCredentials: parentRouteMocks.verifyFamilyMemberCredentials,
}));

vi.mock('@/lib/parent-elevation-rate-limit', () => ({
    checkParentElevationRateLimit: parentRouteMocks.checkParentElevationRateLimit,
    clearParentElevationRateLimit: parentRouteMocks.clearParentElevationRateLimit,
    getParentElevationRateLimitKey: parentRouteMocks.getParentElevationRateLimitKey,
    recordParentElevationFailure: parentRouteMocks.recordParentElevationFailure,
}));

import { POST } from '@/app/api/instant-auth-parent-token/route';

describe('POST /api/instant-auth-parent-token', () => {
    beforeEach(() => {
        process.env.DEVICE_ACCESS_KEY = 'test-device-key';
        parentRouteMocks.isInstantFamilyAuthConfigured.mockReturnValue(true);
        parentRouteMocks.getFamilyMemberById.mockResolvedValue(null);
        parentRouteMocks.verifyFamilyMemberCredentials.mockResolvedValue(undefined);
        parentRouteMocks.mintFamilyMemberToken.mockResolvedValue({
            token: 'parent-token',
            principalType: 'parent',
            member: {
                id: 'parent-1',
                role: 'parent',
            },
        });
        parentRouteMocks.checkParentElevationRateLimit.mockReturnValue({ allowed: true });
        parentRouteMocks.getParentElevationRateLimitKey.mockReturnValue('ip::parent-1');
    });

    function makeRequest(body: unknown, cookie = true) {
        return new NextRequest('http://localhost:3000/api/instant-auth-parent-token', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(cookie ? { cookie: 'family_device_auth=true' } : {}),
            },
            body: JSON.stringify(body),
        });
    }

    it('rejects unauthorized devices', async () => {
        const response = await POST(makeRequest({ familyMemberId: 'p1', pin: '1234' }, false));
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized device', reason: 'missing' });
    });

    it('rejects missing familyMemberId', async () => {
        const response = await POST(makeRequest({ pin: '1234' }));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'familyMemberId is required' });
    });

    it('rejects non-parent family members', async () => {
        parentRouteMocks.getFamilyMemberById.mockResolvedValue({ id: 'child-1', role: 'child' });

        const response = await POST(makeRequest({ familyMemberId: 'child-1', pin: '1234' }));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Selected member is not a parent' });
        expect(parentRouteMocks.recordParentElevationFailure).toHaveBeenCalledWith('ip::parent-1');
    });

    it('rejects incorrect parent PINs', async () => {
        parentRouteMocks.getFamilyMemberById.mockResolvedValue({
            id: 'parent-1',
            role: 'parent',
            pinHash: 'expected-hash',
        });
        parentRouteMocks.verifyFamilyMemberCredentials.mockRejectedValue(new Error('Incorrect PIN'));

        const response = await POST(makeRequest({ familyMemberId: 'parent-1', pin: '1234' }));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Incorrect PIN' });
        expect(parentRouteMocks.recordParentElevationFailure).toHaveBeenCalledWith('ip::parent-1');
    });

    it('returns 429 when parent elevation is rate-limited', async () => {
        parentRouteMocks.checkParentElevationRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 2400 });

        const response = await POST(makeRequest({ familyMemberId: 'parent-1', pin: '1234' }));

        expect(response.status).toBe(429);
        expect(response.headers.get('Retry-After')).toBe('3');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({ error: 'Too many parent elevation attempts. Try again later.' });
        expect(parentRouteMocks.getFamilyMemberById).not.toHaveBeenCalled();
    });

    it('returns a parent principal token after successful verification', async () => {
        parentRouteMocks.getFamilyMemberById.mockResolvedValue({
            id: 'parent-1',
            role: 'parent',
            pinHash: 'expected-hash',
        });

        const response = await POST(makeRequest({ familyMemberId: 'parent-1', pin: '1234' }));

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(await response.json()).toEqual({
            token: 'parent-token',
            principalType: 'parent',
            familyMemberId: 'parent-1',
            familyMemberRole: 'parent',
        });
        expect(parentRouteMocks.verifyFamilyMemberCredentials).toHaveBeenCalledWith('parent-1', '1234');
        expect(parentRouteMocks.mintFamilyMemberToken).toHaveBeenCalledWith('parent-1');
        expect(parentRouteMocks.clearParentElevationRateLimit).toHaveBeenCalledWith('ip::parent-1');
    });

    it('accepts a mobile bearer device session token', async () => {
        const { issueMobileDeviceSessionToken } = await import('@/lib/device-auth-server');
        const session = issueMobileDeviceSessionToken({ platform: 'ios', deviceName: 'Parent iPhone' });

        parentRouteMocks.getFamilyMemberById.mockResolvedValue({
            id: 'parent-1',
            role: 'parent',
            pinHash: 'expected-hash',
        });

        const response = await POST(
            new NextRequest('http://localhost:3000/api/instant-auth-parent-token', {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${session.token}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ familyMemberId: 'parent-1', pin: '1234' }),
            })
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            token: 'parent-token',
            principalType: 'parent',
            familyMemberId: 'parent-1',
            familyMemberRole: 'parent',
        });
    });
});
