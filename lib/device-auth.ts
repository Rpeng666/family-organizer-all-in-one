export const DEVICE_AUTH_COOKIE_NAME = 'family_device_auth';
export const DEVICE_AUTH_COOKIE_VALUE = 'true';
export const DEVICE_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400; // ~400 days

export function hasValidDeviceAuthCookie(value: string | null | undefined): boolean {
    return value === DEVICE_AUTH_COOKIE_VALUE;
}

export function getDeviceAuthCookieOptions() {
    return {
        maxAge: DEVICE_AUTH_COOKIE_MAX_AGE_SECONDS,
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
    };
}
