'use client';

import { useMemo } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useInstantPrincipal } from '@/components/InstantFamilySessionProvider';
import { isEffectiveParentMode, isParentPrincipal } from '@/lib/parent-mode';

export function useParentMode() {
    const { currentUser } = useAuth();
    const { principalType, isParentSessionSharedDevice, parentSharedDeviceIdleTimeoutMs } = useInstantPrincipal();

    return useMemo(
        () => ({
            isSelectedParent: currentUser?.role === 'parent',
            hasParentPrincipal: isParentPrincipal(principalType),
            isParentMode: isEffectiveParentMode(currentUser?.role, principalType),
            isParentSessionSharedDevice: isParentSessionSharedDevice && principalType === 'parent',
            parentSharedDeviceIdleTimeoutMs,
        }),
        [currentUser?.role, principalType, isParentSessionSharedDevice, parentSharedDeviceIdleTimeoutMs]
    );
}
