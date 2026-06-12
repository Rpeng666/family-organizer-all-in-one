import 'server-only';

import type { NextRequest } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { getCalendarSyncCronSecret } from '@/lib/apple-caldav/config';
import { getInstantAdminDb } from '@/lib/instant-admin';
import { CALENDAR_SYNC_PARENT_TOKEN_HEADER } from '@/lib/calendar-sync-constants';
import { INSTANT_AUTH_TOKEN_HEADER } from '@/lib/request-family-member';

export function isCalendarSyncCronAuthorized(request: NextRequest) {
    const secret = getCalendarSyncCronSecret();
    if (!secret) return false;
    const bearer = request.headers.get('authorization') || '';
    const headerSecret = request.headers.get('x-calendar-sync-secret') || '';
    return bearer === `Bearer ${secret}` || headerSecret === secret;
}

async function requestHasVerifiedParentPrincipalCookie(request: NextRequest) {
    try {
        const user = await getInstantAdminDb().auth.getUserFromRequest(request);
        return (user as any)?.type === 'parent';
    } catch {
        return false;
    }
}

async function requestHasVerifiedParentPrincipalHeader(request: NextRequest) {
    const tokens = [
        request.headers.get(CALENDAR_SYNC_PARENT_TOKEN_HEADER) || '',
        request.headers.get(INSTANT_AUTH_TOKEN_HEADER) || '',
    ].filter(Boolean);

    for (const token of tokens) {
        try {
            const user = await getInstantAdminDb().auth.verifyToken(token as any);
            if ((user as any)?.type === 'parent') {
                return true;
            }
        } catch {
            // ignore invalid header token
        }
    }

    return false;
}

export async function requireCalendarSyncRouteAuth(request: NextRequest) {
    if (isCalendarSyncCronAuthorized(request)) {
        return { authorized: true, kind: 'cron' as const };
    }

    if (await requestHasVerifiedParentPrincipalCookie(request)) {
        return { authorized: true, kind: 'parent-cookie' as const };
    }

    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return { authorized: false, reason };
    }

    if (await requestHasVerifiedParentPrincipalHeader(request)) {
        return { authorized: true, kind: 'parent-device' as const };
    }

    return { authorized: false, reason: 'parent_required' as const };
}

export function getCalendarSyncAuthError(reason: string | undefined) {
    switch (reason) {
        case 'parent_required':
            return {
                error: 'Parent authorization required',
                message: 'Switch into parent mode again, then retry Apple Calendar sync.',
            };
        case 'missing':
            return {
                error: 'Device activation required',
                message: 'This browser or device is not activated for Family Organizer yet.',
            };
        case 'expired':
            return {
                error: 'Device session expired',
                message: 'Your device session expired. Refresh or re-activate this device, then try again.',
            };
        case 'revoked':
            return {
                error: 'Device session revoked',
                message: 'This device session has been revoked. Activate the device again to continue.',
            };
        case 'malformed':
        case 'invalid_signature':
        case 'invalid_payload':
        case 'unsupported_version':
            return {
                error: 'Invalid device authorization',
                message: 'The device authorization sent with this request was invalid. Refresh and try again.',
            };
        default:
            return {
                error: 'Calendar sync authorization failed',
                message: 'This request is missing the required device or parent authorization.',
            };
    }
}
