import { NextRequest, NextResponse } from 'next/server';
import { requireMessageActor } from '@/lib/message-route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const actorResult = await requireMessageActor(request);
    if (!actorResult.ok) {
        return actorResult.response;
    }

    return NextResponse.json(
        {
            serverNow: new Date().toISOString(),
        },
        {
            headers: {
                'Cache-Control': 'no-store',
            },
        }
    );
}
