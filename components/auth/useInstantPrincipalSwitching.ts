'use client';

import { useCallback } from 'react';
import { db } from '@/lib/db';
import { fetchPrincipalToken } from '@/lib/instant-principal-api';
import {
    clearCachedToken,
    clearParentLastActivityAt,
    clearParentSharedDeviceMode,
    DEFAULT_PARENT_SHARED_DEVICE,
    getCachedToken,
    getParentSharedDeviceMode,
    getParentUnlocked,
    setCachedToken,
    setParentLastActivityAt,
    setParentSharedDeviceMode,
    setParentUnlocked,
    setPreferredPrincipal,
} from '@/lib/instant-principal-storage';
import type { ElevateParentParams, InstantPrincipalType } from '@/lib/instant-principal-types';

type UseInstantPrincipalSwitchingParams = {
    user: unknown;
    principalType: InstantPrincipalType;
    setPrincipalType: (value: InstantPrincipalType) => void;
    setIsSwitchingPrincipal: (value: boolean) => void;
    setParentUnlockedState: (value: boolean) => void;
    setIsParentSessionSharedDeviceState: (value: boolean) => void;
};

export function useInstantPrincipalSwitching({
    user,
    principalType,
    setPrincipalType,
    setIsSwitchingPrincipal,
    setParentUnlockedState,
    setIsParentSessionSharedDeviceState,
}: UseInstantPrincipalSwitchingParams) {
    const clearParentSessionState = useCallback(() => {
        clearCachedToken('parent');
        setParentUnlocked(false);
        setParentUnlockedState(false);
        clearParentLastActivityAt();
    }, [setParentUnlockedState]);

    const signInWithToken = useCallback(
        async (
            principal: 'kid' | 'parent',
            token: string,
            opts?: {
                cacheToken?: boolean;
                unlockParent?: boolean;
            }
        ) => {
            await db.auth.signInWithToken(token);

            if (opts?.cacheToken !== false) {
                setCachedToken(principal, token);
            }

            if (principal === 'parent') {
                const unlockParent = opts?.unlockParent !== false;
                setParentUnlocked(unlockParent);
                setParentUnlockedState(unlockParent);
                setParentLastActivityAt(Date.now());
            }

            setPreferredPrincipal(principal);
            setPrincipalType(principal);
        },
        [setParentUnlockedState, setPrincipalType]
    );

    const ensureKidPrincipal = useCallback(
        async (opts?: { clearParentSession?: boolean; preferCached?: boolean }) => {
            if (!opts?.clearParentSession && user && principalType === 'kid') {
                return;
            }

            setIsSwitchingPrincipal(true);
            try {
                if (opts?.clearParentSession) {
                    clearParentSessionState();
                    clearParentSharedDeviceMode();
                    setIsParentSessionSharedDeviceState(DEFAULT_PARENT_SHARED_DEVICE);
                }

                const cachedKidToken = opts?.preferCached === false ? null : getCachedToken('kid');
                if (cachedKidToken) {
                    try {
                        await signInWithToken('kid', cachedKidToken);
                        return;
                    } catch (cachedError) {
                        console.warn('Cached kid Instant token failed; fetching a fresh token.', cachedError);
                        clearCachedToken('kid');
                    }
                }

                const token = await fetchPrincipalToken('/api/instant-auth-token');
                await signInWithToken('kid', token);
            } finally {
                setIsSwitchingPrincipal(false);
            }
        },
        [
            clearParentSessionState,
            principalType,
            setIsParentSessionSharedDeviceState,
            setIsSwitchingPrincipal,
            signInWithToken,
            user,
        ]
    );

    const elevateParentPrincipal = useCallback(
        async ({ familyMemberId, pin, sharedDevice }: ElevateParentParams) => {
            const sharedDeviceMode = sharedDevice ?? getParentSharedDeviceMode();
            setParentSharedDeviceMode(sharedDeviceMode);
            setIsParentSessionSharedDeviceState(sharedDeviceMode);
            setParentLastActivityAt(Date.now());

            if (user && principalType === 'parent' && getParentUnlocked()) {
                return;
            }

            setIsSwitchingPrincipal(true);
            try {
                const cachedParentToken = getCachedToken('parent');
                if (cachedParentToken && getParentUnlocked()) {
                    try {
                        await signInWithToken('parent', cachedParentToken, { unlockParent: true });
                        setParentLastActivityAt(Date.now());
                        return;
                    } catch (cachedError) {
                        console.warn('Cached parent Instant token failed; falling back to server verification.', cachedError);
                        clearParentSessionState();
                    }
                }

                const token = await fetchPrincipalToken('/api/instant-auth-parent-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ familyMemberId, pin }),
                });

                await signInWithToken('parent', token, { unlockParent: true });
                setParentLastActivityAt(Date.now());
            } finally {
                setIsSwitchingPrincipal(false);
            }
        },
        [
            clearParentSessionState,
            principalType,
            setIsParentSessionSharedDeviceState,
            setIsSwitchingPrincipal,
            signInWithToken,
            user,
        ]
    );

    return {
        clearParentSessionState,
        signInWithToken,
        ensureKidPrincipal,
        elevateParentPrincipal,
    };
}
