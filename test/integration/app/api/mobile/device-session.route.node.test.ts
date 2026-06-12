import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as activateMobile } from '@/app/api/mobile/device-activate/route';
import { POST as refreshMobile } from '@/app/api/mobile/device-session/refresh/route';
import { POST as revokeMobile } from '@/app/api/mobile/device-session/revoke/route';

describe('mobile device session routes', () => {
    beforeEach(() => {
        process.env.DEVICE_ACCESS_KEY = 'test-device-key';
    });

    it('activates a mobile device and returns a bearer session token', async () => {
        const response = await activateMobile(
            new NextRequest('http://localhost:3000/api/mobile/device-activate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    accessKey: 'test-device-key',
                    platform: 'ios',
                    deviceName: 'Kitchen iPhone',
                    appVersion: '1.0.0',
                }),
            })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(typeof body.deviceSessionToken).toBe('string');
        expect(body.deviceSessionToken.split('.')).toHaveLength(3);
        expect(body.sessionId).toBeTruthy();
        expect(typeof body.expiresAt).toBe('string');
    });

    it('refreshes and revokes mobile device sessions', async () => {
        const activated = await activateMobile(
            new NextRequest('http://localhost:3000/api/mobile/device-activate', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ accessKey: 'test-device-key', platform: 'ios' }),
            })
        );
        const activationBody = await activated.json();
        const token = activationBody.deviceSessionToken as string;

        const refreshResponse = await refreshMobile(
            new NextRequest('http://localhost:3000/api/mobile/device-session/refresh', {
                method: 'POST',
                headers: { authorization: `Bearer ${token}` },
            })
        );
        expect(refreshResponse.status).toBe(200);
        const refreshed = await refreshResponse.json();
        expect(refreshed.deviceSessionToken).not.toBe(token);

        const revokeResponse = await revokeMobile(
            new NextRequest('http://localhost:3000/api/mobile/device-session/revoke', {
                method: 'POST',
                headers: { authorization: `Bearer ${refreshed.deviceSessionToken}` },
            })
        );
        expect(revokeResponse.status).toBe(200);
        expect(await revokeResponse.json()).toEqual({ ok: true });

        const refreshAfterRevoke = await refreshMobile(
            new NextRequest('http://localhost:3000/api/mobile/device-session/refresh', {
                method: 'POST',
                headers: { authorization: `Bearer ${refreshed.deviceSessionToken}` },
            })
        );
        expect(refreshAfterRevoke.status).toBe(401);
        expect(await refreshAfterRevoke.json()).toEqual({ error: 'Unauthorized device', reason: 'revoked' });
    });
});
