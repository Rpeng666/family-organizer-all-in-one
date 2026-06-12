import { describe, expect, it } from 'vitest';

describe('GET /api/health', () => {
    it('returns a public ok response for container health checks', async () => {
        const { GET } = await import('@/app/api/health/route');
        const response = await GET();

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.ok).toBe(true);
        expect(body.service).toBe('family-organizer');
        expect(typeof body.timestamp).toBe('string');
    });
});
