import { NextRequest, NextResponse } from 'next/server';
import { getCalendarSyncAuthError, requireCalendarSyncRouteAuth } from '@/lib/calendar-sync-auth';
import { getAppleCalendarSyncStatus } from '@/lib/apple-caldav/sync';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const auth = await requireCalendarSyncRouteAuth(request);
    if (!auth.authorized) {
        return NextResponse.json(
            { ...getCalendarSyncAuthError(auth.reason), reason: auth.reason },
            { status: 401 }
        );
    }

    try {
        const status = await getAppleCalendarSyncStatus();
        return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to load Apple Calendar sync status' }, { status: 500 });
    }
}
