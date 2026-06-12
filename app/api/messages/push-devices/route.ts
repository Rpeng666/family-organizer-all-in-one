import { NextRequest, NextResponse } from 'next/server';
import { upsertPushDevice } from '@/lib/messaging-service';
import { requireMessageActor, jsonRouteError } from '@/lib/message-route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const actorResult = await requireMessageActor(request);
    if (!actorResult.ok) {
        return actorResult.response;
    }

    try {
        const body = (await request.json()) as { token?: string; platform?: string; isEnabled?: boolean };
        const device = await upsertPushDevice(actorResult.actor, {
            token: String(body?.token || ''),
            platform: String(body?.platform || ''),
            isEnabled: body?.isEnabled,
        });
        return NextResponse.json({ device }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return jsonRouteError(error, 'Unable to register push device');
    }
}
