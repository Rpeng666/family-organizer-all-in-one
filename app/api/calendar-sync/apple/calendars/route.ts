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

    const status = await getAppleCalendarSyncStatus();
    return NextResponse.json({
        accountId: status.account?.id || null,
        calendars: status.calendars || [],
    }, { headers: { 'Cache-Control': 'no-store' } });
}
