// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    DEFAULT_PARENT_SHARED_DEVICE,
    DEFAULT_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS,
    clearCachedToken,
    clearParentLastActivityAt,
    clearParentSharedDeviceMode,
    getCachedToken,
    getParentLastActivityAt,
    getParentSharedDeviceIdleTimeoutMs,
    getParentSharedDeviceMode,
    getParentUnlocked,
    getPreferredPrincipal,
    setCachedToken,
    setParentLastActivityAt,
    setParentSharedDeviceMode,
    setParentUnlocked,
    setPreferredPrincipal,
} from '@/lib/instant-principal-storage';

describe('instant principal storage helpers', () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.unstubAllEnvs();
    });

    it('stores and clears kid/parent cached tokens independently', () => {
        expect(getCachedToken('kid')).toBeNull();
        expect(getCachedToken('parent')).toBeNull();

        setCachedToken('kid', 'kid-token');
        setCachedToken('parent', 'parent-token');

        expect(getCachedToken('kid')).toBe('kid-token');
        expect(getCachedToken('parent')).toBe('parent-token');

        clearCachedToken('kid');
        expect(getCachedToken('kid')).toBeNull();
        expect(getCachedToken('parent')).toBe('parent-token');

        clearCachedToken('parent');
        expect(getCachedToken('parent')).toBeNull();
    });

    it('manages parent unlocked and shared-device flags with sensible defaults', () => {
        expect(getParentUnlocked()).toBe(false);
        expect(getParentSharedDeviceMode()).toBe(DEFAULT_PARENT_SHARED_DEVICE);

        setParentUnlocked(true);
        setParentSharedDeviceMode(false);
        expect(getParentUnlocked()).toBe(true);
        expect(getParentSharedDeviceMode()).toBe(false);

        setParentUnlocked(false);
        clearParentSharedDeviceMode();
        expect(getParentUnlocked()).toBe(false);
        expect(getParentSharedDeviceMode()).toBe(DEFAULT_PARENT_SHARED_DEVICE);
    });

    it('stores, parses, and clears the parent last-activity timestamp', () => {
        expect(getParentLastActivityAt()).toBeNull();

        setParentLastActivityAt(1_234_567);
        expect(getParentLastActivityAt()).toBe(1_234_567);

        window.localStorage.setItem('family_organizer_parent_last_activity_at', 'not-a-number');
        expect(getParentLastActivityAt()).toBeNull();

        setParentLastActivityAt(7_654_321);
        clearParentLastActivityAt();
        expect(getParentLastActivityAt()).toBeNull();
    });

    it('stores and reads the preferred principal with unknown fallback', () => {
        expect(getPreferredPrincipal()).toBe('unknown');

        setPreferredPrincipal('kid');
        expect(getPreferredPrincipal()).toBe('kid');

        setPreferredPrincipal('parent');
        expect(getPreferredPrincipal()).toBe('parent');

        window.localStorage.setItem('family_organizer_preferred_principal', 'weird-value');
        expect(getPreferredPrincipal()).toBe('unknown');
    });

    it('parses the shared-device idle timeout env var and falls back for invalid values', () => {
        vi.stubEnv('NEXT_PUBLIC_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS', '900000');
        expect(getParentSharedDeviceIdleTimeoutMs()).toBe(900000);

        vi.stubEnv('NEXT_PUBLIC_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS', '0');
        expect(getParentSharedDeviceIdleTimeoutMs()).toBe(DEFAULT_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS);

        vi.stubEnv('NEXT_PUBLIC_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS', 'not-a-number');
        expect(getParentSharedDeviceIdleTimeoutMs()).toBe(DEFAULT_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS);
    });
});
