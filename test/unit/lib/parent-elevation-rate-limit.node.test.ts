import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceTimeBy, freezeTime, restoreTime } from '@/test/utils/fake-clock';
import {
    __resetParentElevationRateLimitForTests,
    checkParentElevationRateLimit,
    clearParentElevationRateLimit,
    getParentElevationRateLimitKey,
    recordParentElevationFailure,
} from '@/lib/parent-elevation-rate-limit';

describe('parent elevation rate limiter', () => {
    beforeEach(() => {
        freezeTime(new Date('2026-02-25T12:00:00Z'));
        __resetParentElevationRateLimitForTests();
        delete process.env.PARENT_ELEVATION_RATE_LIMIT_FREE_FAILURES;
        delete process.env.PARENT_ELEVATION_RATE_LIMIT_BASE_BACKOFF_MS;
        delete process.env.PARENT_ELEVATION_RATE_LIMIT_MAX_BACKOFF_MS;
        delete process.env.PARENT_ELEVATION_RATE_LIMIT_WINDOW_MS;
    });

    afterEach(() => {
        restoreTime();
        __resetParentElevationRateLimitForTests();
    });

    it('builds a stable rate-limit key from ip and family member', () => {
        expect(getParentElevationRateLimitKey({ familyMemberId: 'p1', ip: '1.2.3.4, 10.0.0.1' })).toBe('1.2.3.4::p1');
        expect(getParentElevationRateLimitKey({ familyMemberId: 'p1', ip: null })).toBe('unknown::p1');
    });

    it('allows a few failed attempts before applying backoff, then resets on clear', () => {
        process.env.PARENT_ELEVATION_RATE_LIMIT_FREE_FAILURES = '2';
        process.env.PARENT_ELEVATION_RATE_LIMIT_BASE_BACKOFF_MS = '1000';
        process.env.PARENT_ELEVATION_RATE_LIMIT_MAX_BACKOFF_MS = '8000';

        const key = '127.0.0.1::parent-1';

        expect(checkParentElevationRateLimit(key)).toEqual({ allowed: true });
        recordParentElevationFailure(key); // #1 free
        expect(checkParentElevationRateLimit(key)).toEqual({ allowed: true });
        recordParentElevationFailure(key); // #2 free
        expect(checkParentElevationRateLimit(key)).toEqual({ allowed: true });

        recordParentElevationFailure(key); // #3 => 1s backoff
        const decision = checkParentElevationRateLimit(key);
        expect(decision.allowed).toBe(false);
        if (!decision.allowed && 'retryAfterMs' in decision) {
            expect(decision.retryAfterMs).toBeGreaterThanOrEqual(900);
        }

        advanceTimeBy(1000);
        expect(checkParentElevationRateLimit(key)).toEqual({ allowed: true });

        clearParentElevationRateLimit(key);
        expect(checkParentElevationRateLimit(key)).toEqual({ allowed: true });
    });

    it('expires stale attempts after the configured window', () => {
        process.env.PARENT_ELEVATION_RATE_LIMIT_FREE_FAILURES = '1';
        process.env.PARENT_ELEVATION_RATE_LIMIT_WINDOW_MS = '2000';
        process.env.PARENT_ELEVATION_RATE_LIMIT_BASE_BACKOFF_MS = '1000';

        const key = 'unknown::parent-2';
        recordParentElevationFailure(key); // free
        recordParentElevationFailure(key); // blocked
        expect(checkParentElevationRateLimit(key).allowed).toBe(false);

        advanceTimeBy(3000);
        expect(checkParentElevationRateLimit(key)).toEqual({ allowed: true });
    });
});
