import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { isInstantFamilyAuthConfigured, mintPrincipalToken } from '@/lib/instant-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return NextResponse.json({ error: 'Unauthorized device', reason }, { status: 401 });
    }

    if (!isInstantFamilyAuthConfigured()) {
        return NextResponse.json(
            { error: 'Instant auth is not configured' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
    }

    try {
        const token = await mintPrincipalToken('kid');
        return NextResponse.json(
            {
                token,
                principalType: 'kid',
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create shared kid principal token';
        return NextResponse.json({ error: message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
    }
}
