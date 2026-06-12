import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/device-activate/route';

describe('POST /api/device-activate', () => {
    beforeEach(() => {
        process.env.DEVICE_ACCESS_KEY = 'test-device-key';
        (process.env as any).NODE_ENV = 'test';
    });

    function makeRequest(body: unknown) {
        return new NextRequest('http://localhost:3000/api/device-activate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    it('requires a key', async () => {
        const response = await POST(makeRequest({}));
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Activation key is required' });
    });

    it('rejects invalid keys', async () => {
        const response = await POST(makeRequest({ key: 'wrong-key' }));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: 'Invalid activation key' });
    });

    it('sets the device auth cookie on success', async () => {
        const response = await POST(makeRequest({ key: 'test-device-key' }));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
        expect(response.headers.get('set-cookie')).toContain('family_device_auth=true');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
    });
});
