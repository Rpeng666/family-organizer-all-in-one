import { NextRequest, NextResponse } from 'next/server';
import { getCalendarSyncAuthError, requireCalendarSyncRouteAuth } from '@/lib/calendar-sync-auth';
import { runAppleCalendarSync } from '@/lib/apple-caldav/sync';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const auth = await requireCalendarSyncRouteAuth(request);
    if (!auth.authorized) {
        return NextResponse.json(
            { ...getCalendarSyncAuthError(auth.reason), reason: auth.reason },
            { status: 401 }
        );
    }

    let body: any = {};
    try {
        body = await request.json();
    } catch {
        body = {};
    }

    try {
        const result = await runAppleCalendarSync({
            accountId: body?.accountId ? String(body.accountId) : undefined,
            trigger: body?.trigger ? String(body.trigger) : auth.kind === 'cron' ? 'cron' : 'manual',
        });
        if (result?.skipped && result.reason === 'already_running') {
            return NextResponse.json(result, { status: 409, headers: { 'Cache-Control': 'no-store' } });
        }
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error: any) {
        return NextResponse.json({ error: error?.message || 'Failed to run Apple Calendar sync' }, { status: 500 });
    }
}
