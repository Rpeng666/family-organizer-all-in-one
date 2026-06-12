import { NextRequest, NextResponse } from 'next/server';
import { getCalendarSyncAuthError, requireCalendarSyncRouteAuth } from '@/lib/calendar-sync-auth';
import { connectAppleCalendarAccount } from '@/lib/apple-caldav/sync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const auth = await requireCalendarSyncRouteAuth(request);
    if (!auth.authorized) {
        return NextResponse.json(
            { ...getCalendarSyncAuthError(auth.reason), reason: auth.reason },
            { status: 401 }
        );
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const username = String(body?.username || '').trim();
    const appSpecificPassword = String(body?.appSpecificPassword || '').trim();
    const accountLabel = String(body?.accountLabel || '').trim();

    if (!username || !appSpecificPassword) {
        return NextResponse.json({ error: 'username and appSpecificPassword are required' }, { status: 400 });
    }

    try {
        const result = await connectAppleCalendarAccount({ username, appSpecificPassword, accountLabel });
        return NextResponse.json({
            ok: true,
            accountId: result.accountId,
            principalUrl: result.discovery.principalUrl,
            calendarHomeUrl: result.discovery.calendarHomeUrl,
            calendars: result.discovery.calendars,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to connect Apple Calendar' }, { status: 500 });
    }
}
