import { NextRequest, NextResponse } from 'next/server';
import { getCalendarSyncAuthError, requireCalendarSyncRouteAuth } from '@/lib/calendar-sync-auth';
import { updateAppleCalendarSyncSettings } from '@/lib/apple-caldav/sync';

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

    const accountId = String(body?.accountId || '').trim();
    if (!accountId) {
        return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    try {
        await updateAppleCalendarSyncSettings({
            accountId,
            selectedCalendarIds: Array.isArray(body?.selectedCalendarIds) ? body.selectedCalendarIds.map(String) : [],
            enabled: body?.enabled !== false,
            syncWindowPastDays: Number(body?.syncWindowPastDays || 0) || undefined,
            syncWindowFutureDays: Number(body?.syncWindowFutureDays || 0) || undefined,
        });
        return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to update Apple Calendar sync settings' }, { status: 500 });
    }
}
