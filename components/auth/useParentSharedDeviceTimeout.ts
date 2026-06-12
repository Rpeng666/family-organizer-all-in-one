'use client';

import { useEffect } from 'react';
import {
    getParentLastActivityAt,
    isBrowser,
    setParentLastActivityAt,
} from '@/lib/instant-principal-storage';
import type { InstantPrincipalType } from '@/lib/instant-principal-types';

type UseParentSharedDeviceTimeoutParams = {
    principalType: InstantPrincipalType;
    parentUnlocked: boolean;
    isParentSessionSharedDevice: boolean;
    parentSharedDeviceIdleTimeoutMs: number;
    expireParentMode: () => void;
};

export function useParentSharedDeviceTimeout({
    principalType,
    parentUnlocked,
    isParentSessionSharedDevice,
    parentSharedDeviceIdleTimeoutMs,
    expireParentMode,
}: UseParentSharedDeviceTimeoutParams) {
    useEffect(() => {
        if (!isBrowser()) return;
        if (principalType !== 'parent' || !parentUnlocked || !isParentSessionSharedDevice) {
            return;
        }

        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let expired = false;

        const expire = () => {
            if (expired) return;
            expired = true;
            expireParentMode();
        };

        const scheduleTimeout = () => {
            if (timeoutId) clearTimeout(timeoutId);
            const now = Date.now();
            const lastActivity = getParentLastActivityAt() ?? now;
            const idleMs = Math.max(0, now - lastActivity);
            const remaining = Math.max(0, parentSharedDeviceIdleTimeoutMs - idleMs);
            timeoutId = setTimeout(expire, remaining);
        };

        const recordActivity = () => {
            setParentLastActivityAt(Date.now());
            scheduleTimeout();
        };

        scheduleTimeout();
        window.addEventListener('mousemove', recordActivity);
        window.addEventListener('keydown', recordActivity);
        window.addEventListener('click', recordActivity);
        window.addEventListener('touchstart', recordActivity);

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            window.removeEventListener('mousemove', recordActivity);
            window.removeEventListener('keydown', recordActivity);
            window.removeEventListener('click', recordActivity);
            window.removeEventListener('touchstart', recordActivity);
        };
    }, [principalType, parentUnlocked, isParentSessionSharedDevice, parentSharedDeviceIdleTimeoutMs, expireParentMode]);
}
