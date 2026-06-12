import { NextRequest, NextResponse } from 'next/server';
import { extractBearerTokenFromAuthorizationHeader, revokeMobileDeviceSessionToken } from '@/lib/device-auth-server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const bearer = extractBearerTokenFromAuthorizationHeader(request.headers.get('authorization'));
    const result = revokeMobileDeviceSessionToken(bearer);

    if (!result.ok) {
        return NextResponse.json({ error: 'Unauthorized device' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }

    return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

