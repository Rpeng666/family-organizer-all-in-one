import 'server-only';

import { createHash, randomBytes } from 'crypto';
import { id } from '@instantdb/admin';
import { getInstantAdminDb } from '@/lib/instant-admin';

export const MOBILE_SHORTCUT_TOKEN_HEADER = 'x-family-shortcut-token';
export const MOBILE_SHORTCUT_CHORE_CAPABILITY = 'shortcut_chore_quick_create_v1';

type ShortcutTokenRecord = {
    id: string;
    capability?: string | null;
    createdAt?: string | null;
    issuedDeviceName?: string | null;
    issuedPlatform?: string | null;
    label?: string | null;
    lastUsedAt?: string | null;
    parentFamilyMemberId?: string | null;
    revokedAt?: string | null;
    tokenHash?: string | null;
};

export type ShortcutTokenAuthFailureReason = 'missing' | 'invalid' | 'revoked' | 'capability_mismatch';

export type ShortcutTokenAuthResult =
    | {
          ok: true;
          record: ShortcutTokenRecord;
          token: string;
      }
    | {
          ok: false;
          reason: ShortcutTokenAuthFailureReason;
      };

function hashShortcutToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function generateShortcutToken() {
    return `fost_${randomBytes(24).toString('base64url')}`;
}

export function extractShortcutToken(rawValue: string | null | undefined): string {
    return typeof rawValue === 'string' ? rawValue.trim() : '';
}

export async function authorizeMobileShortcutToken(input: {
    token: string | null | undefined;
    capability?: string;
}): Promise<ShortcutTokenAuthResult> {
    const token = extractShortcutToken(input.token);
    if (!token) {
        return { ok: false, reason: 'missing' };
    }

    const adminDb = getInstantAdminDb();
    const tokenHash = hashShortcutToken(token);
    const data = await adminDb.query({
        shortcutTokens: {
            $: {
                where: {
                    tokenHash,
                },
            },
        },
    });

    const record = ((data as any)?.shortcutTokens || [])[0] as ShortcutTokenRecord | undefined;
    if (!record?.id) {
        return { ok: false, reason: 'invalid' };
    }
    if (record.revokedAt) {
        return { ok: false, reason: 'revoked' };
    }
    if (input.capability && record.capability !== input.capability) {
        return { ok: false, reason: 'capability_mismatch' };
    }

    const nowIso = new Date().toISOString();
    await adminDb.transact([
        adminDb.tx.shortcutTokens[record.id].update({
            lastUsedAt: nowIso,
        }),
    ]);

    return {
        ok: true,
        record,
        token,
    };
}

export async function issueMobileShortcutToken(input: {
    capability: string;
    label: string;
    parentFamilyMemberId: string;
    issuedPlatform?: string | null;
    issuedDeviceName?: string | null;
}) {
    const label = String(input.label || '').trim();
    const parentFamilyMemberId = String(input.parentFamilyMemberId || '').trim();
    const capability = String(input.capability || '').trim();
    if (!label) {
        throw new Error('Shortcut label is required');
    }
    if (!parentFamilyMemberId) {
        throw new Error('parentFamilyMemberId is required');
    }
    if (!capability) {
        throw new Error('Shortcut capability is required');
    }

    const adminDb = getInstantAdminDb();
    const existing = await adminDb.query({
        shortcutTokens: {
            $: {
                where: {
                    capability,
                    label,
                    parentFamilyMemberId,
                },
            },
        },
    });

    const nowIso = new Date().toISOString();
    const revokeTxs = (((existing as any)?.shortcutTokens || []) as ShortcutTokenRecord[])
        .filter((record) => record?.id && !record?.revokedAt)
        .map((record) =>
            adminDb.tx.shortcutTokens[record.id].update({
                revokedAt: nowIso,
            })
        );

    const token = generateShortcutToken();
    const tokenHash = hashShortcutToken(token);
    const tokenId = id();

    await adminDb.transact([
        ...revokeTxs,
        adminDb.tx.shortcutTokens[tokenId].update({
            capability,
            createdAt: nowIso,
            issuedDeviceName: input.issuedDeviceName || null,
            issuedPlatform: input.issuedPlatform || null,
            label,
            lastUsedAt: null,
            parentFamilyMemberId,
            revokedAt: null,
            tokenHash,
        }),
    ]);

    return {
        token,
        tokenId,
        capability,
        label,
        parentFamilyMemberId,
    };
}
