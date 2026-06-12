import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/mobile/config/route';

describe('GET /api/mobile/config', () => {
    beforeEach(() => {
        process.env.DEVICE_ACCESS_KEY = 'test-device-key';
        delete process.env.NEXT_PUBLIC_INSTANT_APP_ID;
        delete process.env.INSTANT_APP_ID;
        delete process.env.NEXT_PUBLIC_INSTANT_API_URI;
        delete process.env.NEXT_PUBLIC_INSTANT_WEBSOCKET_URI;
    });

    it('returns 401 for unauthenticated requests', async () => {
        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/config')
        );

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.error).toBe('Unauthorized device');
        expect(body.reason).toBe('missing');
    });

    it('returns 503 when INSTANT_APP_ID is not configured', async () => {
        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/config', {
                headers: { cookie: 'family_device_auth=true' },
            })
        );

        expect(response.status).toBe(503);
        const body = await response.json();
        expect(body.error).toBe('Server is not configured (missing INSTANT_APP_ID)');
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('returns 200 with just instantAppId when only NEXT_PUBLIC_INSTANT_APP_ID is set', async () => {
        process.env.NEXT_PUBLIC_INSTANT_APP_ID = 'test-app-id-123';

        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/config', {
                headers: { cookie: 'family_device_auth=true' },
            })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ instantAppId: 'test-app-id-123' });
        expect(body).not.toHaveProperty('instantApiURI');
        expect(body).not.toHaveProperty('instantWebsocketURI');
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('returns 200 with all config fields when all env vars are set', async () => {
        process.env.NEXT_PUBLIC_INSTANT_APP_ID = 'test-app-id';
        process.env.NEXT_PUBLIC_INSTANT_API_URI = 'http://localhost:8888';
        process.env.NEXT_PUBLIC_INSTANT_WEBSOCKET_URI = 'ws://localhost:8889';

        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/config', {
                headers: { cookie: 'family_device_auth=true' },
            })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({
            instantAppId: 'test-app-id',
            instantApiURI: 'http://localhost:8888',
            instantWebsocketURI: 'ws://localhost:8889',
        });
    });

    it('accepts bearer token authentication from mobile device sessions', async () => {
        process.env.NEXT_PUBLIC_INSTANT_APP_ID = 'test-app-id';
        const { issueMobileDeviceSessionToken } = await import('@/lib/device-auth-server');
        const session = issueMobileDeviceSessionToken({ platform: 'ios' });

        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/config', {
                headers: { authorization: `Bearer ${session.token}` },
            })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.instantAppId).toBe('test-app-id');
    });

    it('falls back to INSTANT_APP_ID when NEXT_PUBLIC variant is not set', async () => {
        process.env.INSTANT_APP_ID = 'server-only-app-id';

        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/config', {
                headers: { cookie: 'family_device_auth=true' },
            })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.instantAppId).toBe('server-only-app-id');
    });
});
