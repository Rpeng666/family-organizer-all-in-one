import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPrincipalToken } from '@/lib/instant-principal-api';

describe('fetchPrincipalToken', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it('requests with no-store + same-origin defaults and returns the token', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ token: 'kid-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchPrincipalToken('/api/instant-auth-token')).resolves.toBe('kid-token');
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/instant-auth-token',
            expect.objectContaining({
                cache: 'no-store',
                credentials: 'same-origin',
            })
        );
    });

    it('allows callers to override/extend request init while preserving wrapper behavior', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ token: 'parent-token' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            fetchPrincipalToken('/api/instant-auth-parent-token', {
                method: 'POST',
                body: JSON.stringify({ pin: '1234' }),
                headers: { 'content-type': 'application/json' },
            })
        ).resolves.toBe('parent-token');

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/instant-auth-parent-token',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ pin: '1234' }),
                headers: { 'content-type': 'application/json' },
                cache: 'no-store',
                credentials: 'same-origin',
            })
        );
    });

    it('throws a decorated error when the endpoint responds with an error payload', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({ error: 'Too many attempts', code: 'RATE_LIMITED' }),
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(fetchPrincipalToken('/api/instant-auth-parent-token')).rejects.toMatchObject({
            message: 'Too many attempts',
            status: 429,
            code: 'RATE_LIMITED',
        });
    });

    it('throws a generic error message when the response is non-json or missing a token', async () => {
        const nonJsonFetch = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => {
                throw new Error('no json');
            },
        });
        vi.stubGlobal('fetch', nonJsonFetch);

        await expect(fetchPrincipalToken('/api/instant-auth-token')).rejects.toMatchObject({
            message: 'Token endpoint failed with 500',
            status: 500,
        });

        const missingTokenFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ principalType: 'kid' }),
        });
        vi.stubGlobal('fetch', missingTokenFetch);

        await expect(fetchPrincipalToken('/api/instant-auth-token')).rejects.toThrow('Token endpoint returned an invalid response');
    });
});
