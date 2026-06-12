export type CachedPrincipalType = 'kid' | 'parent';

export const KID_TOKEN_CACHE_KEY = 'family_organizer_instant_kid_token';
export const PARENT_TOKEN_CACHE_KEY = 'family_organizer_instant_parent_token';
export const ACTIVE_MEMBER_TOKEN_CACHE_KEY = 'family_organizer_instant_member_token';
export const ACTIVE_MEMBER_ID_CACHE_KEY = 'family_organizer_instant_member_id';
export const PARENT_UNLOCKED_KEY = 'family_organizer_parent_principal_unlocked';
export const PARENT_SHARED_DEVICE_KEY = 'family_organizer_parent_shared_device';
export const PARENT_LAST_ACTIVITY_KEY = 'family_organizer_parent_last_activity_at';
export const PREFERRED_PRINCIPAL_KEY = 'family_organizer_preferred_principal';

export const DEFAULT_PARENT_SHARED_DEVICE = true;
export const DEFAULT_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export function isBrowser() {
    return typeof window !== 'undefined';
}

export function getCachedToken(principalType: CachedPrincipalType) {
    if (!isBrowser()) return null;
    return localStorage.getItem(principalType === 'kid' ? KID_TOKEN_CACHE_KEY : PARENT_TOKEN_CACHE_KEY);
}

export function setCachedToken(principalType: CachedPrincipalType, token: string) {
    if (!isBrowser()) return;
    localStorage.setItem(principalType === 'kid' ? KID_TOKEN_CACHE_KEY : PARENT_TOKEN_CACHE_KEY, token);
}

export function clearCachedToken(principalType: CachedPrincipalType) {
    if (!isBrowser()) return;
    localStorage.removeItem(principalType === 'kid' ? KID_TOKEN_CACHE_KEY : PARENT_TOKEN_CACHE_KEY);
}

export function getCachedMemberToken() {
    if (!isBrowser()) return null;
    return localStorage.getItem(ACTIVE_MEMBER_TOKEN_CACHE_KEY);
}

export function setCachedMemberToken(token: string) {
    if (!isBrowser()) return;
    localStorage.setItem(ACTIVE_MEMBER_TOKEN_CACHE_KEY, token);
}

export function clearCachedMemberToken() {
    if (!isBrowser()) return;
    localStorage.removeItem(ACTIVE_MEMBER_TOKEN_CACHE_KEY);
}

export function getCachedMemberId() {
    if (!isBrowser()) return null;
    return localStorage.getItem(ACTIVE_MEMBER_ID_CACHE_KEY);
}

export function setCachedMemberId(memberId: string) {
    if (!isBrowser()) return;
    localStorage.setItem(ACTIVE_MEMBER_ID_CACHE_KEY, memberId);
}

export function clearCachedMemberId() {
    if (!isBrowser()) return;
    localStorage.removeItem(ACTIVE_MEMBER_ID_CACHE_KEY);
}

export function getParentUnlocked() {
    if (!isBrowser()) return false;
    return localStorage.getItem(PARENT_UNLOCKED_KEY) === 'true';
}

export function setParentUnlocked(value: boolean) {
    if (!isBrowser()) return;
    if (value) {
        localStorage.setItem(PARENT_UNLOCKED_KEY, 'true');
    } else {
        localStorage.removeItem(PARENT_UNLOCKED_KEY);
    }
}

export function getParentSharedDeviceMode() {
    if (!isBrowser()) return DEFAULT_PARENT_SHARED_DEVICE;
    const value = localStorage.getItem(PARENT_SHARED_DEVICE_KEY);
    if (value === null) return DEFAULT_PARENT_SHARED_DEVICE;
    return value === 'true';
}

export function setParentSharedDeviceMode(value: boolean) {
    if (!isBrowser()) return;
    localStorage.setItem(PARENT_SHARED_DEVICE_KEY, value ? 'true' : 'false');
}

export function clearParentSharedDeviceMode() {
    if (!isBrowser()) return;
    localStorage.removeItem(PARENT_SHARED_DEVICE_KEY);
}

export function getParentLastActivityAt() {
    if (!isBrowser()) return null;
    const value = localStorage.getItem(PARENT_LAST_ACTIVITY_KEY);
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function setParentLastActivityAt(timestampMs: number) {
    if (!isBrowser()) return;
    localStorage.setItem(PARENT_LAST_ACTIVITY_KEY, String(timestampMs));
}

export function clearParentLastActivityAt() {
    if (!isBrowser()) return;
    localStorage.removeItem(PARENT_LAST_ACTIVITY_KEY);
}

export function getPreferredPrincipal<T extends 'kid' | 'parent' | 'unknown'>(): T {
    if (!isBrowser()) return 'unknown' as T;
    const stored = localStorage.getItem(PREFERRED_PRINCIPAL_KEY);
    if (stored === 'kid' || stored === 'parent') return stored as T;
    return 'unknown' as T;
}

export function setPreferredPrincipal(principalType: 'kid' | 'parent') {
    if (!isBrowser()) return;
    localStorage.setItem(PREFERRED_PRINCIPAL_KEY, principalType);
}

export function getParentSharedDeviceIdleTimeoutMs() {
    const raw = process.env.NEXT_PUBLIC_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS;
    }
    return parsed;
}
