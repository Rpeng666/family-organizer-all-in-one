import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { listFamilyMemberRoster } from '@/lib/instant-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return NextResponse.json({ error: 'Unauthorized device', reason }, { status: 401 });
    }

    try {
        const familyMembers = await listFamilyMemberRoster();
        return NextResponse.json(
            {
                familyMembers,
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Failed to load family member roster', error);
        return NextResponse.json(
            { error: 'Failed to load family members' },
            { status: 500, headers: { 'Cache-Control': 'no-store' } }
        );
    }
}
