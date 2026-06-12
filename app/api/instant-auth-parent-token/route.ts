import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { getFamilyMemberById, isInstantFamilyAuthConfigured, mintFamilyMemberToken, verifyFamilyMemberCredentials } from '@/lib/instant-admin';
import {
    checkParentElevationRateLimit,
    clearParentElevationRateLimit,
    getParentElevationRateLimitKey,
    recordParentElevationFailure,
} from '@/lib/parent-elevation-rate-limit';

export const dynamic = 'force-dynamic';

type ParentElevationBody = {
    familyMemberId?: string;
    pin?: string;
};

export async function POST(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return NextResponse.json({ error: 'Unauthorized device', reason }, { status: 401 });
    }

    if (!isInstantFamilyAuthConfigured()) {
        return NextResponse.json({ error: 'Instant auth is not configured' }, { status: 503 });
    }

    let body: ParentElevationBody = {};
    try {
        body = (await request.json()) as ParentElevationBody;
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.familyMemberId || typeof body.familyMemberId !== 'string') {
        return NextResponse.json({ error: 'familyMemberId is required' }, { status: 400 });
    }

    const rateLimitKey = getParentElevationRateLimitKey({
        familyMemberId: body.familyMemberId,
        ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    });
    const rateLimitDecision = checkParentElevationRateLimit(rateLimitKey);
    if (!rateLimitDecision.allowed) {
        const retryAfterSeconds = Math.ceil(
            ('retryAfterMs' in rateLimitDecision ? rateLimitDecision.retryAfterMs : 1000) / 1000
        );
        return NextResponse.json(
            { error: 'Too many parent elevation attempts. Try again later.' },
            {
                status: 429,
                headers: {
                    'Retry-After': String(retryAfterSeconds),
                    'Cache-Control': 'no-store',
                },
            }
        );
    }

    const member = (await getFamilyMemberById(body.familyMemberId)) as any;
    if (!member) {
        recordParentElevationFailure(rateLimitKey);
        return NextResponse.json({ error: 'Family member not found' }, { status: 404 });
    }

    if (member.role !== 'parent') {
        recordParentElevationFailure(rateLimitKey);
        return NextResponse.json({ error: 'Selected member is not a parent' }, { status: 403 });
    }

    try {
        await verifyFamilyMemberCredentials(body.familyMemberId, body.pin);
        const session = await mintFamilyMemberToken(body.familyMemberId);
        clearParentElevationRateLimit(rateLimitKey);
        return NextResponse.json(
            {
                token: session.token,
                principalType: session.principalType,
                familyMemberId: session.member.id,
                familyMemberRole: session.member.role || 'parent',
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        recordParentElevationFailure(rateLimitKey);
        const message = error instanceof Error ? error.message : 'Failed to create parent auth token';
        const status =
            message === 'Family member not found' ? 404 : message === 'Incorrect PIN' ? 403 : message === 'PIN is required' ? 400 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
