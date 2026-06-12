import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { getFamilyMemberById, isInstantFamilyAuthConfigured, verifyFamilyMemberCredentials } from '@/lib/instant-admin';
import { issueMobileShortcutToken, MOBILE_SHORTCUT_CHORE_CAPABILITY } from '@/lib/mobile-shortcut-tokens';
import {
    checkParentElevationRateLimit,
    clearParentElevationRateLimit,
    getParentElevationRateLimitKey,
    recordParentElevationFailure,
} from '@/lib/parent-elevation-rate-limit';

export const dynamic = 'force-dynamic';

type ShortcutTokenRequestBody = {
    familyMemberId?: string;
    label?: string;
    pin?: string;
};

function noStoreJson(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function failureStatusForCredentialError(message: string) {
    if (message === 'Family member not found') return 404;
    if (message === 'Incorrect PIN') return 403;
    if (message === 'PIN is required') return 400;
    return 500;
}

export async function POST(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return noStoreJson({ error: 'Unauthorized device', reason }, 401);
    }
    if (deviceAuth.source !== 'bearer') {
        return noStoreJson({ error: 'Unauthorized device', reason: 'bearer_required' }, 401);
    }

    if (!isInstantFamilyAuthConfigured()) {
        return noStoreJson({ error: 'Instant auth is not configured' }, 503);
    }

    let body: ShortcutTokenRequestBody = {};
    try {
        body = (await request.json()) as ShortcutTokenRequestBody;
    } catch {
        return noStoreJson({ error: 'Invalid request body' }, 400);
    }

    const familyMemberId = typeof body.familyMemberId === 'string' ? body.familyMemberId.trim() : '';
    const label = typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
    if (!familyMemberId) {
        return noStoreJson({ error: 'familyMemberId is required' }, 400);
    }
    if (!label) {
        return noStoreJson({ error: 'label is required' }, 400);
    }

    const rateLimitKey = getParentElevationRateLimitKey({
        familyMemberId,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    });
    const rateLimitDecision = checkParentElevationRateLimit(rateLimitKey);
    if (!rateLimitDecision.allowed) {
        const retryAfterSeconds = Math.ceil(
            ('retryAfterMs' in rateLimitDecision ? rateLimitDecision.retryAfterMs : 1000) / 1000
        );
        return noStoreJson(
            { error: 'Too many parent elevation attempts. Try again later.' },
            429
        );
    }

    const member = (await getFamilyMemberById(familyMemberId)) as any;
    if (!member) {
        recordParentElevationFailure(rateLimitKey);
        return noStoreJson({ error: 'Family member not found' }, 404);
    }
    if (member.role !== 'parent') {
        recordParentElevationFailure(rateLimitKey);
        return noStoreJson({ error: 'Selected member is not a parent' }, 403);
    }

    try {
        await verifyFamilyMemberCredentials(familyMemberId, body.pin);
        const issued = await issueMobileShortcutToken({
            capability: MOBILE_SHORTCUT_CHORE_CAPABILITY,
            label,
            parentFamilyMemberId: familyMemberId,
            issuedPlatform: deviceAuth.mobileSession.platform,
            issuedDeviceName: deviceAuth.mobileSession.deviceName || null,
        });
        clearParentElevationRateLimit(rateLimitKey);
        return noStoreJson({
            shortcutToken: issued.token,
            parentFamilyMemberId: issued.parentFamilyMemberId,
            label: issued.label,
        });
    } catch (error) {
        recordParentElevationFailure(rateLimitKey);
        const message = error instanceof Error ? error.message : 'Failed to issue shortcut token';
        return noStoreJson({ error: message }, failureStatusForCredentialError(message));
    }
}
