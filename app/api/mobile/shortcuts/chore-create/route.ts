import { NextRequest, NextResponse } from 'next/server';
import { createTodayAnytimeShortcutChore } from '@/lib/mobile-shortcut-chore-service';
import {
    authorizeMobileShortcutToken,
    MOBILE_SHORTCUT_CHORE_CAPABILITY,
    MOBILE_SHORTCUT_TOKEN_HEADER,
} from '@/lib/mobile-shortcut-tokens';

export const dynamic = 'force-dynamic';

type ShortcutCreateChoreBody = {
    assigneeFamilyMemberId?: string;
    title?: string;
};

function noStoreJson(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function statusForCreateError(message: string) {
    if (message === 'Title is required') return 400;
    if (message === 'assigneeFamilyMemberId is required') return 400;
    if (message === 'Assignee not found') return 404;
    return 500;
}

export async function POST(request: NextRequest) {
    const auth = await authorizeMobileShortcutToken({
        token: request.headers.get(MOBILE_SHORTCUT_TOKEN_HEADER),
        capability: MOBILE_SHORTCUT_CHORE_CAPABILITY,
    });
    if (!auth.ok) {
        const reason = 'reason' in auth ? auth.reason : 'invalid';
        return noStoreJson({ error: 'Unauthorized shortcut', reason }, 401);
    }

    let body: ShortcutCreateChoreBody = {};
    try {
        body = (await request.json()) as ShortcutCreateChoreBody;
    } catch {
        return noStoreJson({ error: 'Invalid request body' }, 400);
    }

    try {
        const created = await createTodayAnytimeShortcutChore({
            title: String(body.title || ''),
            assigneeFamilyMemberId: String(body.assigneeFamilyMemberId || ''),
        });
        return noStoreJson(created);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create chore';
        return noStoreJson({ error: message }, statusForCreateError(message));
    }
}
