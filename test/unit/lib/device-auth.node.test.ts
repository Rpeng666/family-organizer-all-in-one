import { describe, expect, it } from 'vitest';
import { DEVICE_AUTH_COOKIE_NAME, DEVICE_AUTH_COOKIE_VALUE, hasValidDeviceAuthCookie } from '@/lib/device-auth';

describe('device auth helpers', () => {
    it('exports stable cookie constants', () => {
        expect(DEVICE_AUTH_COOKIE_NAME).toBe('family_device_auth');
        expect(DEVICE_AUTH_COOKIE_VALUE).toBe('true');
    });

    it('accepts only the exact cookie value', () => {
        expect(hasValidDeviceAuthCookie('true')).toBe(true);
        expect(hasValidDeviceAuthCookie('false')).toBe(false);
        expect(hasValidDeviceAuthCookie(undefined)).toBe(false);
        expect(hasValidDeviceAuthCookie(null)).toBe(false);
        expect(hasValidDeviceAuthCookie('TRUE')).toBe(false);
    });
});
