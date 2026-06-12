import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const shortcutTokenRouteMocks = vi.hoisted(() => ({
    getFamilyMemberById: vi.fn(),
    isInstantFamilyAuthConfigured: vi.fn(),
    issueMobileShortcutToken: vi.fn(),
    verifyFamilyMemberCredentials: vi.fn(),
    checkParentElevationRateLimit: vi.fn(),
    clearParentElevationRateLimit: vi.fn(),
    getParentElevationRateLimitKey: vi.fn(),
    recordParentElevationFailure: vi.fn(),
}));

vi.mock('@/lib/instant-admin', () => ({
    getFamilyMemberById: shortcutTokenRouteMocks.getFamilyMemberById,
    isInstantFamilyAuthConfigured: shortcutTokenRouteMocks.isInstantFamilyAuthConfigured,
    verifyFamilyMemberCredentials: shortcutTokenRouteMocks.verifyFamilyMemberCredentials,
}));

vi.mock('@/lib/mobile-shortcut-tokens', () => ({
    MOBILE_SHORTCUT_CHORE_CAPABILITY: 'shortcut_chore_quick_create_v1',
    issueMobileShortcutToken: shortcutTokenRouteMocks.issueMobileShortcutToken,
}));

vi.mock('@/lib/parent-elevation-rate-limit', () => ({
    checkParentElevationRateLimit: shortcutTokenRouteMocks.checkParentElevationRateLimit,
    clearParentElevationRateLimit: shortcutTokenRouteMocks.clearParentElevationRateLimit,
    getParentElevationRateLimitKey: shortcutTokenRouteMocks.getParentElevationRateLimitKey,
    recordParentElevationFailure: shortcutTokenRouteMocks.recordParentElevationFailure,
}));

import { POST } from '@/app/api/mobile/shortcuts/chore-create-token/route';

describe('POST /api/mobile/shortcuts/chore-create-token', () => {
    beforeEach(() => {
        process.env.DEVICE_ACCESS_KEY = 'test-device-key';
        shortcutTokenRouteMocks.isInstantFamilyAuthConfigured.mockReturnValue(true);
        shortcutTokenRouteMocks.getFamilyMemberById.mockResolvedValue(null);
        shortcutTokenRouteMocks.verifyFamilyMemberCredentials.mockResolvedValue(undefined);
        shortcutTokenRouteMocks.issueMobileShortcutToken.mockResolvedValue({
            token: 'fost_test_token',
            parentFamilyMemberId: 'parent-1',
            label: 'Kitchen Shortcut',
        });
        shortcutTokenRouteMocks.checkParentElevationRateLimit.mockReturnValue({ allowed: true });
        shortcutTokenRouteMocks.getParentElevationRateLimitKey.mockReturnValue('ip::parent-1');
    });

    async function makeBearerRequest(body: unknown) {
        const { issueMobileDeviceSessionToken } = await import('@/lib/device-auth-server');
        const session = issueMobileDeviceSessionToken({
            platform: 'ios',
            deviceName: 'Kitchen iPhone',
        });

        return POST(
            new NextRequest('http://localhost:3000/api/mobile/shortcuts/chore-create-token', {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${session.token}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify(body),
            })
        );
    }

    it('rejects requests without a mobile bearer session', async () => {
        const response = await POST(
            new NextRequest('http://localhost:3000/api/mobile/shortcuts/chore-create-token', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ familyMemberId: 'parent-1', pin: '1234', label: 'Kitchen Shortcut' }),
            })
        );

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized device', reason: 'missing' });
    });

    it('rejects cookie-authenticated requests because bearer auth is required', async () => {
        const response = await POST(
            new NextRequest('http://localhost:3000/api/mobile/shortcuts/chore-create-token', {
                method: 'POST',
                headers: {
                    cookie: 'family_device_auth=true',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ familyMemberId: 'parent-1', pin: '1234', label: 'Kitchen Shortcut' }),
            })
        );

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized device', reason: 'bearer_required' });
    });

    it('rejects missing request fields', async () => {
        const response = await makeBearerRequest({ familyMemberId: 'parent-1', pin: '1234' });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'label is required' });
    });

    it('rejects non-parent members', async () => {
        shortcutTokenRouteMocks.getFamilyMemberById.mockResolvedValue({ id: 'child-1', role: 'child' });

        const response = await makeBearerRequest({
            familyMemberId: 'child-1',
            pin: '1234',
            label: 'Kitchen Shortcut',
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Selected member is not a parent' });
        expect(shortcutTokenRouteMocks.recordParentElevationFailure).toHaveBeenCalledWith('ip::parent-1');
    });

    it('rejects incorrect parent PINs', async () => {
        shortcutTokenRouteMocks.getFamilyMemberById.mockResolvedValue({ id: 'parent-1', role: 'parent' });
        shortcutTokenRouteMocks.verifyFamilyMemberCredentials.mockRejectedValue(new Error('Incorrect PIN'));

        const response = await makeBearerRequest({
            familyMemberId: 'parent-1',
            pin: '1234',
            label: 'Kitchen Shortcut',
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Incorrect PIN' });
    });

    it('returns 429 when parent verification is rate-limited', async () => {
        shortcutTokenRouteMocks.checkParentElevationRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 2400 });

        const response = await makeBearerRequest({
            familyMemberId: 'parent-1',
            pin: '1234',
            label: 'Kitchen Shortcut',
        });

        expect(response.status).toBe(429);
        expect(await response.json()).toEqual({ error: 'Too many parent elevation attempts. Try again later.' });
        expect(shortcutTokenRouteMocks.getFamilyMemberById).not.toHaveBeenCalled();
    });

    it('issues a scoped shortcut token after successful parent verification', async () => {
        shortcutTokenRouteMocks.getFamilyMemberById.mockResolvedValue({ id: 'parent-1', role: 'parent' });

        const response = await makeBearerRequest({
            familyMemberId: 'parent-1',
            pin: '1234',
            label: 'Kitchen Shortcut',
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            shortcutToken: 'fost_test_token',
            parentFamilyMemberId: 'parent-1',
            label: 'Kitchen Shortcut',
        });
        expect(shortcutTokenRouteMocks.verifyFamilyMemberCredentials).toHaveBeenCalledWith('parent-1', '1234');
        expect(shortcutTokenRouteMocks.issueMobileShortcutToken).toHaveBeenCalledWith({
            capability: 'shortcut_chore_quick_create_v1',
            label: 'Kitchen Shortcut',
            parentFamilyMemberId: 'parent-1',
            issuedPlatform: 'ios',
            issuedDeviceName: 'Kitchen iPhone',
        });
        expect(shortcutTokenRouteMocks.clearParentElevationRateLimit).toHaveBeenCalledWith('ip::parent-1');
    });
});
