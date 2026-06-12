import { NextRequest, NextResponse } from 'next/server';
import { listMobileShortcutFamilyMembers } from '@/lib/mobile-shortcut-chore-service';
import {
    authorizeMobileShortcutToken,
    MOBILE_SHORTCUT_CHORE_CAPABILITY,
    MOBILE_SHORTCUT_TOKEN_HEADER,
} from '@/lib/mobile-shortcut-tokens';

export const dynamic = 'force-dynamic';

function noStoreJson(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
    const auth = await authorizeMobileShortcutToken({
        token: request.headers.get(MOBILE_SHORTCUT_TOKEN_HEADER),
        capability: MOBILE_SHORTCUT_CHORE_CAPABILITY,
    });
    if (!auth.ok) {
        const reason = 'reason' in auth ? auth.reason : 'invalid';
        return noStoreJson({ error: 'Unauthorized shortcut', reason }, 401);
    }

    try {
        const familyMembers = await listMobileShortcutFamilyMembers();
        return noStoreJson({ familyMembers });
    } catch (error) {
        console.error('Failed to load shortcut family members', error);
        return noStoreJson({ error: 'Failed to load family members' }, 500);
    }
}
