import type { InstantPrincipalType } from '@/lib/instant-principal-types';

export function isParentPrincipal(principalType: InstantPrincipalType) {
    return principalType === 'parent';
}

export function isEffectiveParentMode(userRole: string | undefined, principalType: InstantPrincipalType) {
    return userRole === 'parent' && isParentPrincipal(principalType);
}
