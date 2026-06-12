import { NextRequest, NextResponse } from 'next/server';
import { joinThreadWatchMode, leaveThreadWatchMode } from '@/lib/messaging-service';
import { requireMessageActor, jsonRouteError } from '@/lib/message-route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
    const actorResult = await requireMessageActor(request, { requireParent: true });
    if (!actorResult.ok) {
        return actorResult.response;
    }

    try {
        const params = await context.params;
        const thread = await joinThreadWatchMode(actorResult.actor, {
            threadId: params.threadId,
        });
        return NextResponse.json({ thread }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return jsonRouteError(error, 'Unable to watch thread');
    }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ threadId: string }> }) {
    const actorResult = await requireMessageActor(request, { requireParent: true });
    if (!actorResult.ok) {
        return actorResult.response;
    }

    try {
        const params = await context.params;
        const thread = await leaveThreadWatchMode(actorResult.actor, {
            threadId: params.threadId,
        });
        return NextResponse.json({ thread }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return jsonRouteError(error, 'Unable to leave watch mode');
    }
}
