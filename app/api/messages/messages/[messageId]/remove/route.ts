import { NextRequest, NextResponse } from 'next/server';
import { removeThreadMessage } from '@/lib/messaging-service';
import { requireMessageActor, jsonRouteError } from '@/lib/message-route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
    const actorResult = await requireMessageActor(request);
    if (!actorResult.ok) {
        return actorResult.response;
    }

    try {
        const params = await context.params;
        const body = (await request.json().catch(() => ({}))) as { reason?: string };
        const message = await removeThreadMessage(actorResult.actor, {
            messageId: params.messageId,
            reason: body.reason || null,
        });
        return NextResponse.json({ message }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return jsonRouteError(error, 'Unable to remove message');
    }
}
