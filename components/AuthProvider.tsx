// components/AuthProvider.tsx
'use client';

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db';
import { useInstantPrincipal } from '@/components/InstantFamilySessionProvider';
import { isEffectiveParentMode } from '@/lib/parent-mode';

export interface FamilyMemberUser {
    id: string;
    name: string;
    messageDigestMode?: string | null;
    messageDigestWindowMinutes?: number | null;
    messageQuietHoursEnabled?: boolean | null;
    messageQuietHoursEnd?: string | null;
    messageQuietHoursStart?: string | null;
    role?: 'parent' | 'child' | string;
    photoUrls?: any;
}

interface AuthContextType {
    currentUser: FamilyMemberUser | null;
    login: (user: FamilyMemberUser, remember?: boolean) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const FAMILY_MEMBER_STORAGE_KEY = 'family_organizer_user_id';
const REMEMBER_KEY = 'family_organizer_remember_me';

export function AuthProvider({ children }: { children: ReactNode }) {
    const { ensureKidPrincipal, principalType } = useInstantPrincipal();
    const auth = db.useAuth();
    const [rememberMe, setRememberMe] = useState(false);

    const familyQuery = (db as any).useQuery(
        auth.user
            ? {
                  familyMembers: {
                      $: {
                          order: {
                              order: 'asc',
                          },
                      },
                  },
              }
            : (null as any)
    ) as any;

    const familyMembers = (familyQuery?.data?.familyMembers as any[]) || [];
    const currentFamilyMemberId =
        auth.user && typeof (auth.user as any).familyMemberId === 'string' ? String((auth.user as any).familyMemberId) : null;
    const currentUser = useMemo<FamilyMemberUser | null>(() => {
        if (!currentFamilyMemberId) return null;
        const member = familyMembers.find((entry: any) => entry.id === currentFamilyMemberId);
        if (!member) return null;
        return {
            id: member.id,
            name: member.name,
            messageDigestMode: member.messageDigestMode,
            messageDigestWindowMinutes: member.messageDigestWindowMinutes,
            messageQuietHoursEnabled: member.messageQuietHoursEnabled,
            messageQuietHoursEnd: member.messageQuietHoursEnd,
            messageQuietHoursStart: member.messageQuietHoursStart,
            role: member.role,
            photoUrls: member.photoUrls,
        };
    }, [currentFamilyMemberId, familyMembers]);

    useEffect(() => {
        const storedRemember = localStorage.getItem(REMEMBER_KEY);
        if (storedRemember === 'true') {
            setRememberMe(true);
        }

        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === REMEMBER_KEY) {
                setRememberMe(event.newValue === 'true');
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    useEffect(() => {
        if (!currentUser) return;
        localStorage.setItem(FAMILY_MEMBER_STORAGE_KEY, currentUser.id);
    }, [currentUser]);

    const login = useCallback((user: FamilyMemberUser, remember: boolean = false) => {
        localStorage.setItem(FAMILY_MEMBER_STORAGE_KEY, user.id);
        if (remember) {
            localStorage.setItem(REMEMBER_KEY, 'true');
            setRememberMe(true);
            return;
        }

        localStorage.removeItem(REMEMBER_KEY);
        setRememberMe(false);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(FAMILY_MEMBER_STORAGE_KEY);
        localStorage.removeItem(REMEMBER_KEY);
        setRememberMe(false);
        void ensureKidPrincipal({ clearParentSession: true }).catch((error) => {
            console.error('Failed to clear member auth session', error);
        });
    }, [ensureKidPrincipal]);

    useEffect(() => {
        if (!currentUser) return;

        if (currentUser.role === 'parent' && !isEffectiveParentMode(currentUser.role, principalType)) {
            localStorage.removeItem(FAMILY_MEMBER_STORAGE_KEY);
            localStorage.removeItem(REMEMBER_KEY);
            setRememberMe(false);
        }
    }, [currentUser, principalType]);

    useEffect(() => {
        if (!currentUser || rememberMe) return;

        let timeoutId: NodeJS.Timeout;

        const resetTimer = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                logout();
            }, IDLE_TIMEOUT_MS);
        };

        window.addEventListener('mousemove', resetTimer);
        window.addEventListener('keydown', resetTimer);
        window.addEventListener('click', resetTimer);
        window.addEventListener('touchstart', resetTimer);
        resetTimer();

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('mousemove', resetTimer);
            window.removeEventListener('keydown', resetTimer);
            window.removeEventListener('click', resetTimer);
            window.removeEventListener('touchstart', resetTimer);
        };
    }, [currentUser, logout, rememberMe]);

    const isLoading = auth.isLoading || (Boolean(auth.user) && familyQuery.isLoading);

    return (
        <AuthContext.Provider value={{ currentUser, login, logout, isAuthenticated: Boolean(currentUser), isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export function useOptionalAuth() {
    return useContext(AuthContext);
}
