import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRequestFamilyMember } from '@/lib/request-family-member';

export async function requireMessageActor(request: NextRequest, options?: { requireParent?: boolean }) {
    const session = await requireRequestFamilyMember(request, options);
    if (!session.ok) {
        const failure = session as Extract<typeof session, { ok: false }>;
        return {
            ok: false as const,
            response: NextResponse.json(
                {
                    error: failure.error,
                    ...(failure.reason ? { reason: failure.reason } : {}),
                },
                { status: failure.status }
            ),
        };
    }

    return {
        ok: true as const,
        actor: session.familyMember,
    };
}

export function jsonRouteError(error: unknown, fallback = 'Request failed') {
    const message = error instanceof Error ? error.message : fallback;
    const status =
        message.includes('not found')
            ? 404
            : message.includes('required') || message.includes('cannot') || message.includes('must') || message.includes('exactly')
            ? 400
            : message.includes('Only parents') || message.includes('not a member') || message.includes('access')
            ? 403
            : 500;
    return NextResponse.json({ error: message }, { status });
}
