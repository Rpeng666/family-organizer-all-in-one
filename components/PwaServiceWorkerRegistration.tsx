'use client';

import { useEffect } from 'react';

export function PwaServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;

        const enableInDev = process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV === 'true';
        if (process.env.NODE_ENV !== 'production' && !enableInDev) {
            if (typeof navigator.serviceWorker.getRegistrations !== 'function') {
                return;
            }

            void navigator.serviceWorker
                .getRegistrations()
                .then(async (registrations) => {
                    await Promise.all(registrations.map((registration) => registration.unregister()));
                    if ('caches' in window) {
                        const keys = await caches.keys();
                        await Promise.all(keys.map((key) => caches.delete(key)));
                    }
                    console.info('[pwa] Cleared service workers and caches in dev mode');
                })
                .catch((error) => {
                    console.warn('[pwa] Failed to clear service workers in dev mode', error);
                });
            return;
        }

        let cancelled = false;

        const register = async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
                if (cancelled) return;

                // Kick the browser to fetch an updated worker in the background.
                void registration.update().catch(() => {});
            } catch (error) {
                console.warn('Service worker registration failed', error);
            }
        };

        void register();

        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}
