import { NextRequest, NextResponse } from 'next/server';
import { editThreadMessage } from '@/lib/messaging-service';
import { requireMessageActor, jsonRouteError } from '@/lib/message-route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ messageId: string }> }) {
    const actorResult = await requireMessageActor(request);
    if (!actorResult.ok) {
        return actorResult.response;
    }

    try {
        const params = await context.params;
        const body = (await request.json()) as { body?: string };
        const message = await editThreadMessage(actorResult.actor, {
            messageId: params.messageId,
            body: String(body?.body || ''),
        });
        return NextResponse.json({ message }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return jsonRouteError(error, 'Unable to edit message');
    }
}
