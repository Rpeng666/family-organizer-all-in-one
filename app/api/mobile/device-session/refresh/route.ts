import { NextRequest, NextResponse } from 'next/server';
import { extractBearerTokenFromAuthorizationHeader, refreshMobileDeviceSessionToken } from '@/lib/device-auth-server';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
    const bearer = extractBearerTokenFromAuthorizationHeader(request.headers.get('authorization'));
    const result = refreshMobileDeviceSessionToken(bearer);

    if (!result.ok) {
        const reason = 'error' in result ? result.error : 'unknown';
        return noStoreJson({ error: 'Unauthorized device', reason }, 401);
    }
    if (!('token' in result)) {
        return noStoreJson({ error: 'Unauthorized device', reason: 'unknown' }, 401);
    }

    return noStoreJson({
        deviceSessionToken: result.token,
        expiresAt: result.expiresAt,
        sessionId: result.sessionId,
    });
}
