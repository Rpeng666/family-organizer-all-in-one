// @vitest-environment jsdom

import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PwaServiceWorkerRegistration } from '@/components/PwaServiceWorkerRegistration';

function setServiceWorker(value: any) {
    if (typeof value === 'undefined') {
        try {
            delete (window.navigator as any).serviceWorker;
        } catch {}
        return;
    }

    Object.defineProperty(window.navigator, 'serviceWorker', {
        configurable: true,
        value,
    });
}

async function flushEffects() {
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe('PwaServiceWorkerRegistration', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        setServiceWorker(undefined);
    });

    it('does nothing when service workers are unsupported', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        render(<PwaServiceWorkerRegistration />);
        await flushEffects();

        expect(warningSpy).not.toHaveBeenCalled();
    });

    it('does not register in development unless explicitly enabled', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_SW_IN_DEV', 'false');
        const update = vi.fn().mockResolvedValue(undefined);
        const register = vi.fn().mockResolvedValue({ update });
        setServiceWorker({ register });

        render(<PwaServiceWorkerRegistration />);
        await flushEffects();

        expect(register).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it('registers and triggers update in production', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const update = vi.fn().mockResolvedValue(undefined);
        const register = vi.fn().mockResolvedValue({ update });
        setServiceWorker({ register });

        render(<PwaServiceWorkerRegistration />);
        await flushEffects();

        expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('registers in development when NEXT_PUBLIC_ENABLE_SW_IN_DEV=true', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('NEXT_PUBLIC_ENABLE_SW_IN_DEV', 'true');
        const update = vi.fn().mockResolvedValue(undefined);
        const register = vi.fn().mockResolvedValue({ update });
        setServiceWorker({ register });

        render(<PwaServiceWorkerRegistration />);
        await flushEffects();

        expect(register).toHaveBeenCalledTimes(1);
        expect(update).toHaveBeenCalledTimes(1);
    });

    it('logs a warning when registration fails', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const register = vi.fn().mockRejectedValue(new Error('boom'));
        setServiceWorker({ register });

        render(<PwaServiceWorkerRegistration />);
        await flushEffects();

        expect(register).toHaveBeenCalledTimes(1);
        expect(warningSpy).toHaveBeenCalledWith('Service worker registration failed', expect.any(Error));
    });

    it('does not call registration.update if the component unmounts before register resolves', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        const pending = deferred<{ update: ReturnType<typeof vi.fn> }>();
        const update = vi.fn().mockResolvedValue(undefined);
        const register = vi.fn().mockReturnValue(pending.promise);
        setServiceWorker({ register });

        const view = render(<PwaServiceWorkerRegistration />);
        await flushEffects();
        expect(register).toHaveBeenCalledTimes(1);

        view.unmount();
        pending.resolve({ update });
        await flushEffects();

        expect(update).not.toHaveBeenCalled();
    });
});
