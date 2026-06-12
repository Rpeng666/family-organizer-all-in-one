'use client';

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/db';
import {
    clearCachedMemberId,
    clearCachedMemberToken,
    clearParentLastActivityAt,
    clearParentSharedDeviceMode,
    DEFAULT_PARENT_SHARED_DEVICE,
    getCachedMemberToken,
    getParentSharedDeviceIdleTimeoutMs,
    getParentSharedDeviceMode,
    getParentUnlocked,
    isBrowser,
    setCachedMemberId,
    setCachedMemberToken,
    setParentLastActivityAt,
    setParentSharedDeviceMode,
    setParentUnlocked,
} from '@/lib/instant-principal-storage';
import type { ElevateParentParams, InstantPrincipalType } from '@/lib/instant-principal-types';
import { useParentSharedDeviceTimeout } from '@/components/auth/useParentSharedDeviceTimeout';

type BootstrapStatus = 'checking' | 'signing-in' | 'ready' | 'degraded';

type SignInFamilyMemberParams = {
    familyMemberId: string;
    pin?: string;
    sharedDevice?: boolean;
};

type InstantPrincipalContextValue = {
    principalType: InstantPrincipalType;
    isSwitchingPrincipal: boolean;
    canUseCachedParentPrincipal: boolean;
    isParentSessionSharedDevice: boolean;
    parentSharedDeviceIdleTimeoutMs: number;
    ensureKidPrincipal: (opts?: { clearParentSession?: boolean }) => Promise<void>;
    elevateParentPrincipal: (params: ElevateParentParams) => Promise<void>;
    signInFamilyMember: (params: SignInFamilyMemberParams) => Promise<void>;
};

const InstantPrincipalContext = createContext<InstantPrincipalContextValue | undefined>(undefined);

async function fetchMemberToken(params: SignInFamilyMemberParams) {
    const response = await fetch('/api/instant-auth-token', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            familyMemberId: params.familyMemberId,
            pin: params.pin || '',
        }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload?.error || `Token endpoint failed with ${response.status}`);
        (error as any).status = response.status;
        throw error;
    }

    if (!payload?.token || typeof payload.token !== 'string') {
        throw new Error('Token endpoint returned an invalid response');
    }

    return payload as {
        token: string;
        principalType: InstantPrincipalType;
        familyMemberId: string;
        familyMemberRole?: string;
    };
}

async function clearCurrentSession() {
    clearCachedMemberToken();
    clearCachedMemberId();
    setParentUnlocked(false);
    clearParentLastActivityAt();
    await db.auth.signOut().catch(() => {});
}

export function InstantFamilySessionProvider({ children }: { children: ReactNode }) {
    const { isLoading, user, error } = db.useAuth();
    const [status, setStatus] = useState<BootstrapStatus>('checking');
    const [principalType, setPrincipalType] = useState<InstantPrincipalType>('unknown');
    const [isSwitchingPrincipal, setIsSwitchingPrincipal] = useState(false);
    const [parentUnlocked, setParentUnlockedState] = useState(false);
    const [isParentSessionSharedDevice, setIsParentSessionSharedDevice] = useState(DEFAULT_PARENT_SHARED_DEVICE);
    const bootstrapAttemptedRef = useRef(false);
    const parentSharedDeviceIdleTimeoutMs = getParentSharedDeviceIdleTimeoutMs();

    const syncPrincipalFromUser = useCallback(
        (nextUser: any | null | undefined) => {
            if (!nextUser) {
                setPrincipalType('unknown');
                setParentUnlockedState(false);
                return;
            }

            const nextPrincipalType = (nextUser as any).type === 'parent' ? 'parent' : 'kid';
            setPrincipalType(nextPrincipalType);
            if (typeof nextUser.familyMemberId === 'string' && nextUser.familyMemberId) {
                setCachedMemberId(nextUser.familyMemberId);
            }

            const unlocked = nextPrincipalType === 'parent' ? getParentUnlocked() || true : false;
            setParentUnlockedState(unlocked);
            setParentUnlocked(unlocked);
        },
        []
    );

    const signInFamilyMember = useCallback(async (params: SignInFamilyMemberParams) => {
        setIsSwitchingPrincipal(true);
        setStatus('signing-in');
        try {
            const payload = await fetchMemberToken(params);
            await db.auth.signInWithToken(payload.token);
            setCachedMemberToken(payload.token);
            setCachedMemberId(payload.familyMemberId);

            const nextPrincipalType = payload.principalType === 'parent' ? 'parent' : 'kid';
            const nextSharedDevice = typeof params.sharedDevice === 'boolean' ? params.sharedDevice : getParentSharedDeviceMode();
            setIsParentSessionSharedDevice(nextSharedDevice);
            setParentSharedDeviceMode(nextSharedDevice);

            if (nextPrincipalType === 'parent') {
                setParentUnlocked(true);
                setParentUnlockedState(true);
                setParentLastActivityAt(Date.now());
            } else {
                setParentUnlocked(false);
                setParentUnlockedState(false);
                clearParentLastActivityAt();
            }

            setPrincipalType(nextPrincipalType);
            setStatus('ready');
        } catch (tokenError) {
            setStatus('degraded');
            throw tokenError;
        } finally {
            setIsSwitchingPrincipal(false);
        }
    }, []);

    const ensureKidPrincipal = useCallback(async (opts?: { clearParentSession?: boolean }) => {
        if (!opts?.clearParentSession && (user as any)?.type === 'kid') {
            setPrincipalType('kid');
            return;
        }

        setIsSwitchingPrincipal(true);
        try {
            await clearCurrentSession();
            setPrincipalType('unknown');
            setParentUnlockedState(false);
            setStatus('ready');
            if (opts?.clearParentSession) {
                clearParentSharedDeviceMode();
                setIsParentSessionSharedDevice(DEFAULT_PARENT_SHARED_DEVICE);
            }
        } finally {
            setIsSwitchingPrincipal(false);
        }
    }, [user]);

    const elevateParentPrincipal = useCallback(async (params: ElevateParentParams) => {
        await signInFamilyMember({
            familyMemberId: params.familyMemberId,
            pin: params.pin,
            sharedDevice: params.sharedDevice,
        });
    }, [signInFamilyMember]);

    useEffect(() => {
        if (!isBrowser()) return;
        setParentUnlockedState(getParentUnlocked());
        setIsParentSessionSharedDevice(getParentSharedDeviceMode());
    }, []);

    useEffect(() => {
        if (isLoading) {
            return;
        }

        if (user) {
            syncPrincipalFromUser(user as any);
            setStatus('ready');
            return;
        }

        if (bootstrapAttemptedRef.current) {
            setStatus('ready');
            return;
        }

        bootstrapAttemptedRef.current = true;
        const cachedToken = getCachedMemberToken();
        if (!cachedToken) {
            setStatus('ready');
            return;
        }

        let cancelled = false;

        const restore = async () => {
            setStatus('signing-in');
            try {
                await db.auth.signInWithToken(cachedToken);
                if (!cancelled) {
                    setStatus('ready');
                }
            } catch (restoreError) {
                console.warn('Cached member Instant token failed; clearing cached session.', restoreError);
                clearCachedMemberToken();
                clearCachedMemberId();
                setParentUnlocked(false);
                if (!cancelled) {
                    setParentUnlockedState(false);
                    setPrincipalType('unknown');
                    setStatus('ready');
                }
            }
        };

        void restore();

        return () => {
            cancelled = true;
        };
    }, [isLoading, syncPrincipalFromUser, user]);

    const expireParentSharedDeviceMode = useCallback(() => {
        void ensureKidPrincipal({ clearParentSession: true }).catch((timeoutError) => {
            console.error('Failed to expire parent shared-device mode', timeoutError);
        });
    }, [ensureKidPrincipal]);

    useParentSharedDeviceTimeout({
        principalType,
        parentUnlocked,
        isParentSessionSharedDevice,
        parentSharedDeviceIdleTimeoutMs,
        expireParentMode: expireParentSharedDeviceMode,
    });

    const contextValue = useMemo<InstantPrincipalContextValue>(
        () => ({
            principalType,
            isSwitchingPrincipal,
            canUseCachedParentPrincipal: principalType === 'parent' && parentUnlocked && Boolean(getCachedMemberToken()),
            isParentSessionSharedDevice,
            parentSharedDeviceIdleTimeoutMs,
            ensureKidPrincipal,
            elevateParentPrincipal,
            signInFamilyMember,
        }),
        [
            elevateParentPrincipal,
            ensureKidPrincipal,
            isParentSessionSharedDevice,
            isSwitchingPrincipal,
            parentSharedDeviceIdleTimeoutMs,
            parentUnlocked,
            principalType,
            signInFamilyMember,
        ]
    );

    if (isLoading || status === 'checking' || status === 'signing-in') {
        return (
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-6">
                    {/* Wordmark */}
                    <div className="text-center">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 mb-1">
                            Family
                        </p>
                        <p
                            className="text-2xl text-foreground"
                            style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500, letterSpacing: '-0.01em' }}
                        >
                            Organizer
                        </p>
                    </div>

                    {/* Minimal pulse line */}
                    <div className="flex items-center gap-1.5">
                        {[0, 1, 2].map((i) => (
                            <span
                                key={i}
                                className="block h-1 w-1 rounded-full bg-muted-foreground/30 animate-pulse"
                                style={{ animationDelay: `${i * 200}ms`, animationDuration: '1.2s' }}
                            />
                        ))}
                    </div>

                    <p
                        className="text-xs text-muted-foreground/50 tracking-wide"
                        style={{ fontFamily: 'var(--font-garamond, Georgia, serif)' }}
                    >
                        Connecting to family data
                    </p>
                </div>
            </div>
        );
    }

    if (error) {
        console.error('Instant auth state error', error);
    }

    return <InstantPrincipalContext.Provider value={contextValue}>{children}</InstantPrincipalContext.Provider>;
}

export function useInstantPrincipal() {
    const context = useContext(InstantPrincipalContext);
    if (!context) {
        throw new Error('useInstantPrincipal must be used within InstantFamilySessionProvider');
    }
    return context;
}
