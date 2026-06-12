import { beforeEach, describe, expect, it, vi } from 'vitest';

type ShortcutTokenRow = {
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

const shortcutTokenHelperMocks = vi.hoisted(() => {
    let records: ShortcutTokenRow[] = [];

    const createAdminDb = () => ({
        query: vi.fn(async (query: any) => {
            const where = query?.shortcutTokens?.$?.where || {};
            const filtered = records.filter((record) =>
                Object.entries(where).every(([key, value]) => (record as Record<string, unknown>)[key] === value)
            );
            return { shortcutTokens: filtered.map((record) => ({ ...record })) };
        }),
        transact: vi.fn(async (ops: any[]) => {
            for (const op of ops) {
                if (op?.__op !== 'update' || op?.entity !== 'shortcutTokens') continue;
                const index = records.findIndex((record) => record.id === op.id);
                if (index >= 0) {
                    records[index] = { ...records[index], ...op.patch };
                } else {
                    records.push({ id: op.id, ...op.patch });
                }
            }
        }),
        tx: {
            shortcutTokens: new Proxy(
                {},
                {
                    get(_target, recordId) {
                        return {
                            update: (patch: Record<string, unknown>) => ({
                                __op: 'update',
                                entity: 'shortcutTokens',
                                id: String(recordId),
                                patch,
                            }),
                        };
                    },
                }
            ),
        },
    });

    return {
        getInstantAdminDb: vi.fn(() => createAdminDb()),
        getRecords: () => records.map((record) => ({ ...record })),
        resetRecords: () => {
            records = [];
        },
        seedRecords: (next: ShortcutTokenRow[]) => {
            records = next.map((record) => ({ ...record }));
        },
    };
});

vi.mock('@/lib/instant-admin', () => ({
    getInstantAdminDb: shortcutTokenHelperMocks.getInstantAdminDb,
}));

import {
    MOBILE_SHORTCUT_CHORE_CAPABILITY,
    authorizeMobileShortcutToken,
    issueMobileShortcutToken,
} from '@/lib/mobile-shortcut-tokens';

describe('mobile shortcut token helpers', () => {
    beforeEach(() => {
        shortcutTokenHelperMocks.resetRecords();
    });

    it('issues a new token and revokes previous active tokens with the same label + parent', async () => {
        shortcutTokenHelperMocks.seedRecords([
            {
                id: 'existing-1',
                capability: MOBILE_SHORTCUT_CHORE_CAPABILITY,
                createdAt: '2026-03-20T10:00:00.000Z',
                label: 'Kitchen Shortcut',
                parentFamilyMemberId: 'parent-1',
                revokedAt: null,
                tokenHash: 'old-hash',
            },
        ]);

        const issued = await issueMobileShortcutToken({
            capability: MOBILE_SHORTCUT_CHORE_CAPABILITY,
            label: 'Kitchen Shortcut',
            parentFamilyMemberId: 'parent-1',
            issuedPlatform: 'ios',
            issuedDeviceName: 'Kitchen iPhone',
        });

        const records = shortcutTokenHelperMocks.getRecords();
        expect(issued.token).toMatch(/^fost_/);
        expect(records).toHaveLength(2);
        expect(records.find((record) => record.id === 'existing-1')?.revokedAt).toBeTruthy();
        const current = records.find((record) => record.id !== 'existing-1');
        expect(current?.label).toBe('Kitchen Shortcut');
        expect(current?.parentFamilyMemberId).toBe('parent-1');
        expect(current?.capability).toBe(MOBILE_SHORTCUT_CHORE_CAPABILITY);
        expect(current?.issuedPlatform).toBe('ios');
        expect(current?.issuedDeviceName).toBe('Kitchen iPhone');
        expect(current?.tokenHash).toBeTruthy();
        expect(current?.tokenHash).not.toBe(issued.token);
    });

    it('returns missing or invalid for absent tokens', async () => {
        expect(await authorizeMobileShortcutToken({ token: '', capability: MOBILE_SHORTCUT_CHORE_CAPABILITY })).toEqual({
            ok: false,
            reason: 'missing',
        });

        expect(await authorizeMobileShortcutToken({ token: 'fost_unknown', capability: MOBILE_SHORTCUT_CHORE_CAPABILITY })).toEqual({
            ok: false,
            reason: 'invalid',
        });
    });

    it('rejects revoked or mismatched-capability tokens', async () => {
        const issued = await issueMobileShortcutToken({
            capability: MOBILE_SHORTCUT_CHORE_CAPABILITY,
            label: 'Kitchen Shortcut',
            parentFamilyMemberId: 'parent-1',
        });
        const [current] = shortcutTokenHelperMocks.getRecords().filter((record) => record.id);
        shortcutTokenHelperMocks.seedRecords([{ ...current, revokedAt: '2026-03-22T10:00:00.000Z' }]);

        expect(await authorizeMobileShortcutToken({ token: issued.token, capability: MOBILE_SHORTCUT_CHORE_CAPABILITY })).toEqual({
            ok: false,
            reason: 'revoked',
        });

        shortcutTokenHelperMocks.seedRecords([{ ...current, revokedAt: null, capability: 'other_capability' }]);
        expect(await authorizeMobileShortcutToken({ token: issued.token, capability: MOBILE_SHORTCUT_CHORE_CAPABILITY })).toEqual({
            ok: false,
            reason: 'capability_mismatch',
        });
    });

    it('authorizes active tokens and updates lastUsedAt', async () => {
        const issued = await issueMobileShortcutToken({
            capability: MOBILE_SHORTCUT_CHORE_CAPABILITY,
            label: 'Kitchen Shortcut',
            parentFamilyMemberId: 'parent-1',
        });

        const result = await authorizeMobileShortcutToken({
            token: issued.token,
            capability: MOBILE_SHORTCUT_CHORE_CAPABILITY,
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.record.parentFamilyMemberId).toBe('parent-1');
        }
        const [record] = shortcutTokenHelperMocks.getRecords().filter((entry) => entry.parentFamilyMemberId === 'parent-1' && !entry.revokedAt);
        expect(record.lastUsedAt).toBeTruthy();
    });
});
