import { NextRequest, NextResponse } from 'next/server';
import { toggleMessageReaction } from '@/lib/messaging-service';
import { requireMessageActor, jsonRouteError } from '@/lib/message-route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
    const actorResult = await requireMessageActor(request);
    if (!actorResult.ok) {
        return actorResult.response;
    }

    try {
        const params = await context.params;
        const body = (await request.json()) as { emoji?: string };
        const result = await toggleMessageReaction(actorResult.actor, {
            messageId: params.messageId,
            emoji: String(body?.emoji || ''),
        });
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return jsonRouteError(error, 'Unable to toggle reaction');
    }
}
