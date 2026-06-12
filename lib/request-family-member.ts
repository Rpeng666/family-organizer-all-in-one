import 'server-only';

import type { NextRequest } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { getFamilyMemberById, getInstantAdminDb } from '@/lib/instant-admin';

export const INSTANT_AUTH_TOKEN_HEADER = 'x-instant-auth-token';

export type RequestFamilyMemberContext =
    | {
          ok: true;
          deviceAuth: ReturnType<typeof getDeviceAuthContextFromNextRequest>;
          instantUser: any;
          familyMember: any;
      }
    | {
          ok: false;
          status: number;
          error: string;
          reason?: string;
      };

async function getInstantUserFromRequest(request: NextRequest) {
    const adminDb = getInstantAdminDb();
    const headerToken = request.headers.get(INSTANT_AUTH_TOKEN_HEADER) || '';

    if (headerToken) {
        try {
            return await adminDb.auth.verifyToken(headerToken as any);
        } catch {
            return null;
        }
    }

    try {
        return await adminDb.auth.getUserFromRequest(request);
    } catch {
        return null;
    }
}

export async function requireRequestFamilyMember(request: NextRequest, options?: { requireParent?: boolean }): Promise<RequestFamilyMemberContext> {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return {
            ok: false,
            status: 401,
            error: 'Unauthorized device',
            reason,
        };
    }

    const instantUser = await getInstantUserFromRequest(request);
    if (!instantUser) {
        return {
            ok: false,
            status: 401,
            error: 'Family member auth required',
        };
    }

    const familyMemberId =
        typeof (instantUser as any).familyMemberId === 'string' && (instantUser as any).familyMemberId
            ? (instantUser as any).familyMemberId
            : null;
    if (!familyMemberId) {
        return {
            ok: false,
            status: 403,
            error: 'This auth session is not linked to a family member',
        };
    }

    const familyMember = await getFamilyMemberById(familyMemberId);
    if (!familyMember) {
        return {
            ok: false,
            status: 404,
            error: 'Family member not found',
        };
    }

    if (options?.requireParent && familyMember.role !== 'parent') {
        return {
            ok: false,
            status: 403,
            error: 'Parent access required',
        };
    }

    return {
        ok: true,
        deviceAuth,
        instantUser,
        familyMember,
    };
}
