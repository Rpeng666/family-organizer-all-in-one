import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { id as instantId, init as initCore } from '@instantdb/core';
import schema from '@/instant.schema';
import {
    getInstantAdminDb,
    getKidPrincipalAuthEmail,
    getParentPrincipalAuthEmail,
    mintPrincipalToken,
} from '@/lib/instant-admin';

const RUN_LIVE = process.env.RUN_LIVE_INSTANT_PERMS === '1';

function loadLocalEnvFile(fileName: string) {
    const filePath = path.join(process.cwd(), fileName);
    if (!existsSync(filePath)) return;

    const contents = readFileSync(filePath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const equalsIndex = trimmed.indexOf('=');
        if (equalsIndex <= 0) continue;
        const key = trimmed.slice(0, equalsIndex).trim();
        if (!key || process.env[key] !== undefined) continue;
        let value = trimmed.slice(equalsIndex + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    }
}

type ClientDb = ReturnType<typeof initCore>;

function requiredEnv(name: string) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is required for live Instant perms smoke tests`);
    }
    return value;
}

function createClient(): ClientDb {
    const appId = process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID;
    if (!appId) {
        throw new Error('INSTANT_APP_ID or NEXT_PUBLIC_INSTANT_APP_ID is required for live Instant perms smoke tests');
    }

    const connectionConfig =
        process.env.NEXT_PUBLIC_INSTANT_API_URI && process.env.NEXT_PUBLIC_INSTANT_WEBSOCKET_URI
            ? {
                  apiURI: process.env.NEXT_PUBLIC_INSTANT_API_URI,
                  websocketURI: process.env.NEXT_PUBLIC_INSTANT_WEBSOCKET_URI,
              }
            : {};

    return initCore({
        appId,
        schema,
        ...connectionConfig,
    });
}

async function expectRejected(promise: Promise<unknown>, label: string) {
    let rejected = false;
    try {
        await promise;
    } catch (error) {
        rejected = true;
        expect(error).toBeTruthy();
    }

    if (!rejected) {
        throw new Error(`Expected operation to be rejected: ${label}`);
    }
}

const suite = RUN_LIVE ? describe : describe.skip;

suite('live Instant perms smoke matrix (hosted app)', () => {
    let adminDb: ReturnType<typeof getInstantAdminDb>;
    let anonDb: ClientDb;
    let kidDb: ClientDb;
    let parentDb: ClientDb;
    let kidPrincipalUserId: string;
    const cleanup = {
        calendarItems: new Set<string>(),
        allowanceTransactions: new Set<string>(),
        chores: new Set<string>(),
        choreCompletions: new Set<string>(),
    };

    beforeAll(async () => {
        loadLocalEnvFile('.env.local');
        loadLocalEnvFile('.env');

        requiredEnv('INSTANT_APP_ADMIN_TOKEN');
        if (!(process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID)) {
            throw new Error('INSTANT_APP_ID or NEXT_PUBLIC_INSTANT_APP_ID is required for live Instant perms smoke tests');
        }

        adminDb = getInstantAdminDb();

        anonDb = createClient();
        kidDb = createClient();
        parentDb = createClient();

        const [kidToken, parentToken] = await Promise.all([mintPrincipalToken('kid'), mintPrincipalToken('parent')]);
        await Promise.all([kidDb.auth.signInWithToken(kidToken), parentDb.auth.signInWithToken(parentToken)]);

        const kidUser = await adminDb.auth.getUser({ email: getKidPrincipalAuthEmail() });
        await adminDb.auth.getUser({ email: getParentPrincipalAuthEmail() });
        kidPrincipalUserId = kidUser.id;
    });

    afterAll(async () => {
        const txs: any[] = [];
        for (const entryId of Array.from(cleanup.choreCompletions)) {
            txs.push(adminDb.tx.choreCompletions[entryId].delete());
        }
        for (const entryId of Array.from(cleanup.chores)) {
            txs.push(adminDb.tx.chores[entryId].delete());
        }
        for (const entryId of Array.from(cleanup.calendarItems)) {
            txs.push(adminDb.tx.calendarItems[entryId].delete());
        }
        for (const entryId of Array.from(cleanup.allowanceTransactions)) {
            txs.push(adminDb.tx.allowanceTransactions[entryId].delete());
        }
        if (txs.length > 0) {
            await adminDb.transact(txs);
        }

        anonDb?.shutdown?.();
        kidDb?.shutdown?.();
        parentDb?.shutdown?.();
    });

    it(
        'enforces a basic anonymous/kid/parent allow-deny matrix',
        async () => {
            // Anonymous should not be able to read app data now that perms require family principals.
            await expectRejected(anonDb.queryOnce({ familyMembers: {} }), 'anonymous familyMembers query');

            // Kid principal can read family members, but parent pin hashes should be hidden.
            const kidFamilyMembersResp = await kidDb.queryOnce({ familyMembers: {} });
            const kidFamilyMembers = (kidFamilyMembersResp.data.familyMembers as any[]) || [];
            expect(kidFamilyMembers.length).toBeGreaterThan(0);
            const parentRows = kidFamilyMembers.filter((m) => m.role === 'parent');
            if (parentRows.length > 0) {
                expect(parentRows.some((m) => typeof m.pinHash === 'string' && m.pinHash.length > 0)).toBe(false);
            }

            // Kid principal cannot create parent-managed calendar items.
            const deniedCalendarId = instantId();
            await expectRejected(
                kidDb.transact(
                    kidDb.tx.calendarItems[deniedCalendarId].create({
                        dayOfMonth: 1,
                        description: 'perms smoke denied create',
                        endDate: '2026-02-25T12:00:00.000Z',
                        isAllDay: true,
                        month: 2,
                        startDate: '2026-02-25T12:00:00.000Z',
                        title: 'Kid cannot create this',
                        year: 2026,
                    })
                ),
                'kid calendarItems create'
            );

            // Parent principal can create and delete calendar items.
            const parentCalendarId = instantId();
            await parentDb.transact(
                parentDb.tx.calendarItems[parentCalendarId].create({
                    dayOfMonth: 1,
                    description: 'perms smoke parent create',
                    endDate: '2026-02-25T12:00:00.000Z',
                    isAllDay: true,
                    month: 2,
                    startDate: '2026-02-25T12:00:00.000Z',
                    title: 'Parent can create this',
                    year: 2026,
                })
            );
            cleanup.calendarItems.add(parentCalendarId);
            await parentDb.transact(parentDb.tx.calendarItems[parentCalendarId].delete());
            cleanup.calendarItems.delete(parentCalendarId);

            // Kid must stamp allowance transaction audit with the trusted DB principal id.
            const deniedAuditTxId = instantId();
            await expectRejected(
                kidDb.transact(
                    kidDb.tx.allowanceTransactions[deniedAuditTxId].create({
                        amount: 1,
                        createdAt: new Date().toISOString(),
                        createdBy: 'some-other-principal',
                        currency: 'USD',
                        description: 'invalid audit stamp',
                        transactionType: 'adjustment',
                        updatedAt: new Date().toISOString(),
                    })
                ),
                'kid allowanceTransactions create with mismatched createdBy'
            );

            const validKidTxId = instantId();
            await kidDb.transact(
                kidDb.tx.allowanceTransactions[validKidTxId].create({
                    amount: 1,
                    createdAt: new Date().toISOString(),
                    createdBy: kidPrincipalUserId,
                    currency: 'USD',
                    description: 'perms smoke valid kid tx',
                    transactionType: 'adjustment',
                    updatedAt: new Date().toISOString(),
                })
            );
            cleanup.allowanceTransactions.add(validKidTxId);

            await expectRejected(
                kidDb.transact(kidDb.tx.allowanceTransactions[validKidTxId].delete()),
                'kid allowanceTransactions delete'
            );

            await parentDb.transact(parentDb.tx.allowanceTransactions[validKidTxId].delete());
            cleanup.allowanceTransactions.delete(validKidTxId);

            // Kid principal can mark chores complete for any family member by linking a completion row onto the chore.
            const targetFamilyMember = parentRows[0] || kidFamilyMembers[0];
            expect(targetFamilyMember?.id).toBeTruthy();

            const choreId = instantId();
            const completionId = instantId();
            const nowIso = new Date().toISOString();

            await parentDb.transact([
                parentDb.tx.chores[choreId].update({
                    title: 'Perms smoke chore',
                    createdAt: nowIso,
                    description: 'Kid can link completion rows',
                    startDate: '2026-02-25T00:00:00.000Z',
                    done: false,
                    rotationType: 'none',
                }),
                parentDb.tx.chores[choreId].link({ assignees: targetFamilyMember.id }),
                parentDb.tx.familyMembers[targetFamilyMember.id].link({ assignedChores: choreId }),
            ]);
            cleanup.chores.add(choreId);

            await kidDb.transact([
                kidDb.tx.choreCompletions[completionId].update({
                    dateDue: '2026-02-25',
                    dateCompleted: nowIso,
                    completed: true,
                    allowanceAwarded: false,
                }),
                kidDb.tx.chores[choreId].link({ completions: completionId }),
                kidDb.tx.familyMembers[targetFamilyMember.id].link({ completedChores: completionId }),
                kidDb.tx.familyMembers[targetFamilyMember.id].link({ markedCompletions: completionId }),
            ]);
            cleanup.choreCompletions.add(completionId);
        },
        120_000
    );
});
