import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return NextResponse.json({ error: 'Unauthorized device', reason }, { status: 401 });
    }
    const instantAppId =
        process.env.NEXT_PUBLIC_INSTANT_APP_ID || process.env.INSTANT_APP_ID;

    if (!instantAppId) {
        return NextResponse.json(
            { error: 'Server is not configured (missing INSTANT_APP_ID)' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
    }

    const apiURI =
        process.env.NEXT_PUBLIC_INSTANT_API_URI || undefined;
    const websocketURI =
        process.env.NEXT_PUBLIC_INSTANT_WEBSOCKET_URI || undefined;

    return NextResponse.json(
        {
            instantAppId,
            ...(apiURI ? { instantApiURI: apiURI } : {}),
            ...(websocketURI ? { instantWebsocketURI: websocketURI } : {}),
        },
        { headers: { 'Cache-Control': 'no-store' } }
    );
}
