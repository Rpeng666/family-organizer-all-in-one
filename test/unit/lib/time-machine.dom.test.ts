// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('lib/time-machine', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.restoreAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        delete (window as any).__RealDate;
    });

    it('reads a stored debug offset and returns 0 when missing', async () => {
        const mod = await import('@/lib/time-machine');

        expect(mod.getTimeOffset()).toBe(0);
        window.localStorage.setItem('debug_time_offset', '12345');
        expect(mod.getTimeOffset()).toBe(12345);
    });

    it('stores an offset relative to window.__RealDate and reloads the page on enable', async () => {
        (window as any).__RealDate = class extends Date {
            static now() {
                return 1_000;
            }
        };

        const mod = await import('@/lib/time-machine');
        mod.enableTimeTravel(new Date(6_000));

        expect(window.localStorage.getItem('debug_time_offset')).toBe('5000');
    });

    it('falls back to window.Date.now when __RealDate is unavailable', async () => {
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);

        const mod = await import('@/lib/time-machine');
        mod.enableTimeTravel(new Date(25_000));

        expect(window.localStorage.getItem('debug_time_offset')).toBe('15000');
        expect(nowSpy).toHaveBeenCalledTimes(1);
    });

    it('clears the debug offset and reloads the page on disable', async () => {
        window.localStorage.setItem('debug_time_offset', '999');
        const mod = await import('@/lib/time-machine');

        mod.disableTimeTravel();

        expect(window.localStorage.getItem('debug_time_offset')).toBeNull();
    });

    it('keeps initTimeMachine as a no-op compatibility shim', async () => {
        const mod = await import('@/lib/time-machine');
        expect(() => mod.initTimeMachine()).not.toThrow();
    });
});
