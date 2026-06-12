import { NextRequest, NextResponse } from 'next/server';
import { ensureMessagingBootstrap } from '@/lib/messaging-service';
import { requireMessageActor, jsonRouteError } from '@/lib/message-route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const actorResult = await requireMessageActor(request);
    if (!actorResult.ok) {
        return actorResult.response;
    }

    try {
        const result = await ensureMessagingBootstrap();
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return jsonRouteError(error, 'Unable to bootstrap messages');
    }
}
