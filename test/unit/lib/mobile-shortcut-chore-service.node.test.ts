import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FamilyMemberRow = {
    id: string;
    name?: string | null;
    role?: string | null;
    photoUrls?: Record<string, string> | null;
};

const shortcutChoreServiceMocks = vi.hoisted(() => {
    let familyMembersById = new Map<string, FamilyMemberRow>();
    let roster: Array<{
        id: string;
        name: string;
        role?: string | null;
        photoUrls?: Record<string, string> | null;
        hasPin?: boolean;
    }> = [];
    let settingsRows: Array<{ name?: string | null; value?: string | null }> = [];
    let choreRows: Array<{ id: string; sortOrder?: number | null }> = [];
    let txLog: any[] = [];

    const createAdminDb = () => ({
        query: vi.fn(async () => ({
            settings: settingsRows.map((row) => ({ ...row })),
            chores: choreRows.map((row) => ({ ...row })),
        })),
        transact: vi.fn(async (ops: any[]) => {
            txLog = ops.map((op) => ({ ...op }));
        }),
        tx: {
            chores: new Proxy(
                {},
                {
                    get(_target, entityId) {
                        return {
                            update: (patch: Record<string, unknown>) => ({
                                __op: 'update',
                                entity: 'chores',
                                id: String(entityId),
                                patch,
                            }),
                            link: (patch: Record<string, unknown>) => ({
                                __op: 'link',
                                entity: 'chores',
                                id: String(entityId),
                                patch,
                            }),
                        };
                    },
                }
            ),
            familyMembers: new Proxy(
                {},
                {
                    get(_target, entityId) {
                        return {
                            link: (patch: Record<string, unknown>) => ({
                                __op: 'link',
                                entity: 'familyMembers',
                                id: String(entityId),
                                patch,
                            }),
                        };
                    },
                }
            ),
        },
    });

    return {
        getFamilyMemberById: vi.fn(async (familyMemberId: string) => familyMembersById.get(familyMemberId) || null),
        getInstantAdminDb: vi.fn(() => createAdminDb()),
        listFamilyMemberRoster: vi.fn(async () => roster.map((entry) => ({ ...entry }))),
        setFamilyMembers(next: FamilyMemberRow[]) {
            familyMembersById = new Map(next.map((entry) => [entry.id, { ...entry }]));
        },
        setRoster(next: Array<{ id: string; name: string; role?: string | null; photoUrls?: Record<string, string> | null; hasPin?: boolean }>) {
            roster = next.map((entry) => ({ ...entry }));
        },
        setSettingsRows(next: Array<{ name?: string | null; value?: string | null }>) {
            settingsRows = next.map((entry) => ({ ...entry }));
        },
        setChoreRows(next: Array<{ id: string; sortOrder?: number | null }>) {
            choreRows = next.map((entry) => ({ ...entry }));
        },
        getTxLog() {
            return txLog.map((entry) => ({ ...entry }));
        },
        reset() {
            familyMembersById = new Map();
            roster = [];
            settingsRows = [];
            choreRows = [];
            txLog = [];
        },
    };
});

vi.mock('@/lib/instant-admin', () => ({
    getFamilyMemberById: shortcutChoreServiceMocks.getFamilyMemberById,
    getInstantAdminDb: shortcutChoreServiceMocks.getInstantAdminDb,
    listFamilyMemberRoster: shortcutChoreServiceMocks.listFamilyMemberRoster,
}));

import { createTodayAnytimeShortcutChore, listMobileShortcutFamilyMembers } from '@/lib/mobile-shortcut-chore-service';

function formatLocalDateKey(value: Date) {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

describe('mobile shortcut chore service', () => {
    beforeEach(() => {
        shortcutChoreServiceMocks.reset();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-22T12:00:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('maps the roster to the shortcut-safe family member shape', async () => {
        shortcutChoreServiceMocks.setRoster([
            {
                id: 'fm-1',
                name: 'Judah',
                role: 'child',
                photoUrls: { '64': 'https://example.com/judah-64.png' },
                hasPin: true,
            },
        ]);

        await expect(listMobileShortcutFamilyMembers()).resolves.toEqual([
            {
                id: 'fm-1',
                label: 'Judah',
                name: 'Judah',
                role: 'child',
                photoUrls: { '64': 'https://example.com/judah-64.png' },
            },
        ]);
    });

    it('generates stable labels for duplicate names', async () => {
        shortcutChoreServiceMocks.setRoster([
            { id: 'abcd1111', name: 'Alex', role: 'child' },
            { id: 'abcd2222', name: 'Alex', role: 'parent' },
            { id: 'wxyz3333', name: 'Alex', role: 'parent' },
        ]);

        await expect(listMobileShortcutFamilyMembers()).resolves.toEqual([
            { id: 'abcd1111', label: 'Alex (child)', name: 'Alex', role: 'child', photoUrls: null },
            { id: 'abcd2222', label: 'Alex (parent • 2222)', name: 'Alex', role: 'parent', photoUrls: null },
            { id: 'wxyz3333', label: 'Alex (parent • 3333)', name: 'Alex', role: 'parent', photoUrls: null },
        ]);
    });

    it('creates a today/anytime chore using server family-day logic and next sort order', async () => {
        shortcutChoreServiceMocks.setFamilyMembers([{ id: 'fm-1', name: 'Judah', role: 'child' }]);
        shortcutChoreServiceMocks.setSettingsRows([
            {
                name: 'householdSchedulingSettings',
                value: JSON.stringify({ dayBoundaryTime: '23:59' }),
            },
        ]);
        shortcutChoreServiceMocks.setChoreRows([
            { id: 'chore-a', sortOrder: 2 },
            { id: 'chore-b', sortOrder: 7 },
        ]);

        const result = await createTodayAnytimeShortcutChore({
            title: 'Clean room',
            assigneeFamilyMemberId: 'fm-1',
        });

        const localNow = new Date('2026-03-22T12:00:00.000Z');
        localNow.setDate(localNow.getDate() - 1);
        const expectedDateKey = formatLocalDateKey(localNow);

        expect(result).toEqual({
            choreId: expect.any(String),
            title: 'Clean room',
            assigneeFamilyMemberId: 'fm-1',
            dateKey: expectedDateKey,
        });

        const txLog = shortcutChoreServiceMocks.getTxLog();
        expect(txLog).toHaveLength(3);
        expect(txLog[0]).toMatchObject({
            __op: 'update',
            entity: 'chores',
            patch: {
                title: 'Clean room',
                rotationType: 'none',
                rrule: null,
                sortOrder: 8,
                startDate: `${expectedDateKey}T00:00:00.000Z`,
                timeBucket: null,
                timingMode: 'anytime',
                timingConfig: { mode: 'anytime' },
                weight: 0,
                isUpForGrabs: false,
                isJoint: false,
                done: false,
            },
        });
        expect(txLog[1]).toMatchObject({
            __op: 'link',
            entity: 'chores',
            patch: { assignees: 'fm-1' },
        });
        expect(txLog[2]).toMatchObject({
            __op: 'link',
            entity: 'familyMembers',
            id: 'fm-1',
            patch: { assignedChores: result.choreId },
        });
    });

    it('rejects empty titles and missing assignees', async () => {
        await expect(
            createTodayAnytimeShortcutChore({
                title: '   ',
                assigneeFamilyMemberId: 'fm-1',
            })
        ).rejects.toThrow('Title is required');

        shortcutChoreServiceMocks.setFamilyMembers([]);
        await expect(
            createTodayAnytimeShortcutChore({
                title: 'Clean room',
                assigneeFamilyMemberId: 'missing',
            })
        ).rejects.toThrow('Assignee not found');
    });
});
