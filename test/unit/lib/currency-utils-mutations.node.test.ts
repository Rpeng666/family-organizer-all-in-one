import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeTime } from '@/test/utils/fake-clock';

const currencyMocks = vi.hoisted(() => {
    const txFactory = (entity: string) =>
        new Proxy(
            {},
            {
                get(_target, id: string) {
                    return {
                        update(payload: unknown) {
                            return { op: 'update', entity, id, payload };
                        },
                        link(payload: unknown) {
                            return { op: 'link', entity, id, payload };
                        },
                        delete() {
                            return { op: 'delete', entity, id };
                        },
                    };
                },
            }
        );

    const txRoot = new Proxy(
        {},
        {
            get(_target, entity: string) {
                return txFactory(entity);
            },
        }
    );

    return {
        id: vi.fn(() => 'mock-id'),
        tx: txRoot,
        getAuth: vi.fn(),
    };
});

vi.mock('@instantdb/react', () => ({
    id: currencyMocks.id,
    tx: currencyMocks.tx,
}));

vi.mock('@/lib/db', () => ({
    db: {
        getAuth: currencyMocks.getAuth,
    },
}));

import type { Envelope } from '@/lib/currency-utils';
import {
    createAdditionalEnvelope,
    createInitialSavingsEnvelope,
    deleteEnvelope,
    depositToSpecificEnvelope,
    reconcileEnvelope,
    transferFunds,
    transferFundsToPerson,
    updateEnvelope,
    withdrawFromEnvelope,
    setLastDisplayCurrencyPref,
} from '@/lib/currency-utils';

describe('currency-utils mutation helpers', () => {
    beforeEach(() => {
        currencyMocks.id.mockReset();
        currencyMocks.id.mockReturnValue('mock-id');
        currencyMocks.getAuth.mockReset();
        currencyMocks.getAuth.mockResolvedValue({ id: 'instant-parent-principal' });
        freezeTime(new Date('2026-02-26T12:34:56Z'));
    });

    describe('envelope creation and updates', () => {
        it('creates an initial Savings envelope and links it to the family member', async () => {
            currencyMocks.id.mockReturnValueOnce('env-savings');
            const db = { transact: vi.fn().mockResolvedValue(undefined) };

            await expect(createInitialSavingsEnvelope(db as any, 'member-1')).resolves.toBe('env-savings');

            expect(db.transact).toHaveBeenCalledTimes(1);
            const txs = db.transact.mock.calls[0][0] as any[];
            expect(txs).toEqual(
                expect.arrayContaining([
                    {
                        op: 'update',
                        entity: 'allowanceEnvelopes',
                        id: 'env-savings',
                        payload: {
                            name: 'Savings',
                            balances: {},
                            isDefault: true,
                            familyMember: 'member-1',
                            goalAmount: null,
                            goalCurrency: null,
                        },
                    },
                    {
                        op: 'link',
                        entity: 'familyMembers',
                        id: 'member-1',
                        payload: { allowanceEnvelopes: 'env-savings' },
                    },
                    {
                        op: 'update',
                        entity: 'allowanceTransactions',
                        id: 'mock-id',
                        payload: {
                            createdBy: 'instant-parent-principal',
                            amount: 0,
                            currency: 'USD',
                            transactionType: 'init',
                            description: 'Envelope Created',
                            createdAt: '2026-02-26T12:34:56.000Z',
                            updatedAt: '2026-02-26T12:34:56.000Z',
                            envelope: 'env-savings',
                        },
                    },
                    {
                        op: 'link',
                        entity: 'allowanceEnvelopes',
                        id: 'env-savings',
                        payload: { transactions: 'mock-id' },
                    },
                    {
                        op: 'link',
                        entity: 'historyEvents',
                        id: 'mock-id',
                        payload: { affectedFamilyMembers: 'member-1' },
                    },
                ])
            );
        });

        it('creates an additional envelope with trimmed name and goal fields', async () => {
            currencyMocks.id.mockReturnValueOnce('env-extra');
            const db = { transact: vi.fn().mockResolvedValue(undefined) };

            const newId = await createAdditionalEnvelope(db as any, 'member-1', '  Vacation  ', false, 150, 'USD');
            expect(newId).toBe('env-extra');

            const txs = db.transact.mock.calls[0][0] as any[];
            expect(txs[0]).toMatchObject({
                entity: 'allowanceEnvelopes',
                id: 'env-extra',
                op: 'update',
                payload: {
                    name: 'Vacation',
                    balances: {},
                    isDefault: false,
                    familyMember: 'member-1',
                    goalAmount: 150,
                    goalCurrency: 'USD',
                },
            });
            expect(txs[1]).toMatchObject({
                entity: 'familyMembers',
                id: 'member-1',
                op: 'link',
                payload: { allowanceEnvelopes: 'env-extra' },
            });
            expect(txs[2]).toMatchObject({
                op: 'update',
                entity: 'allowanceTransactions',
                payload: expect.objectContaining({
                    amount: 0,
                    currency: 'USD',
                    transactionType: 'init',
                    description: 'Envelope Created',
                    envelope: 'env-extra',
                }),
            });
            expect(txs[3]).toMatchObject({
                op: 'link',
                entity: 'allowanceEnvelopes',
                id: 'env-extra',
                payload: expect.objectContaining({ transactions: expect.any(String) }),
            });
        });

        it('validates additional envelope input before transacting', async () => {
            const db = { transact: vi.fn() };

            await expect(createAdditionalEnvelope(db as any, 'member-1', '', false)).rejects.toThrow('Envelope name cannot be empty.');
            await expect(createAdditionalEnvelope(db as any, 'member-1', 'Trip', false, 0, 'USD')).rejects.toThrow(
                'Goal amount must be positive if set.'
            );
            await expect(createAdditionalEnvelope(db as any, 'member-1', 'Trip', false, 10, null as any)).rejects.toThrow(
                'Goal currency must be specified if goal amount is set.'
            );
            expect(db.transact).not.toHaveBeenCalled();
        });

        it('updates envelope fields and validates name/goal amount', async () => {
            const db = { transact: vi.fn().mockResolvedValue(undefined) };

            await updateEnvelope(db as any, 'env-1', '  New Name  ', true, 25, 'EUR');
            expect(db.transact).toHaveBeenCalledTimes(1);
            expect(db.transact.mock.calls[0][0]).toEqual(
                expect.arrayContaining([
                    {
                        op: 'update',
                        entity: 'allowanceEnvelopes',
                        id: 'env-1',
                        payload: {
                            name: 'New Name',
                            isDefault: true,
                            goalAmount: 25,
                            goalCurrency: 'EUR',
                        },
                    },
                    {
                        op: 'update',
                        entity: 'historyEvents',
                        id: 'mock-id',
                        payload: expect.objectContaining({
                            summary: 'Updated envelope "New Name"',
                        }),
                    },
                ])
            );

            await expect(updateEnvelope(db as any, 'env-1', '   ', false)).rejects.toThrow('Envelope name cannot be empty.');
            await expect(updateEnvelope(db as any, 'env-1', 'A', false, -1, 'USD')).rejects.toThrow('Goal amount must be positive if set.');
        });
    });

    describe('deposit/withdraw/transfer helper transactions', () => {
        it('deposits using uppercase currency and merges balances', async () => {
            currencyMocks.id.mockReturnValueOnce('tx-deposit');
            const db = { transact: vi.fn().mockResolvedValue(undefined) };

            await depositToSpecificEnvelope(db as any, 'env-1', { usd: 1, PTS: 2 } as any, 4, 'usd', 'Allowance');

            const txs = db.transact.mock.calls[0][0] as any[];
            expect(txs[0]).toMatchObject({
                entity: 'allowanceEnvelopes',
                id: 'env-1',
                payload: { balances: { usd: 1, PTS: 2, USD: 4 } },
            });
            expect(txs[1]).toMatchObject({
                entity: 'allowanceTransactions',
                id: 'tx-deposit',
                payload: expect.objectContaining({
                    createdBy: 'instant-parent-principal',
                    amount: 4,
                    currency: 'USD',
                    transactionType: 'deposit',
                    envelope: 'env-1',
                    destinationEnvelope: 'env-1',
                    description: 'Allowance',
                    createdAt: '2026-02-26T12:34:56.000Z',
                }),
            });
            expect(txs[2]).toMatchObject({
                entity: 'allowanceEnvelopes',
                id: 'env-1',
                op: 'link',
                payload: { transactions: 'tx-deposit' },
            });
        });

        it('rejects non-positive deposits before transacting', async () => {
            const db = { transact: vi.fn() };

            await expect(depositToSpecificEnvelope(db as any, 'env-1', {}, 0, 'USD')).rejects.toThrow('Deposit amount must be positive.');
            await expect(depositToSpecificEnvelope(db as any, 'env-1', {}, -1, 'USD')).rejects.toThrow('Deposit amount must be positive.');
            expect(db.transact).not.toHaveBeenCalled();
        });

        it('withdraws funds, removes zeroed currency balances, and links the transaction', async () => {
            currencyMocks.id.mockReturnValueOnce('tx-withdraw');
            const db = { transact: vi.fn().mockResolvedValue(undefined) };
            const envelope: Envelope = { id: 'env-1', name: 'Wallet', balances: { USD: 7, PTS: 10 } };

            await withdrawFromEnvelope(db as any, envelope, 7, 'usd', 'Cash out');

            const txs = db.transact.mock.calls[0][0] as any[];
            expect(txs[0]).toMatchObject({
                entity: 'allowanceEnvelopes',
                id: 'env-1',
                payload: { balances: { PTS: 10 } },
            });
            expect(txs[1]).toMatchObject({
                entity: 'allowanceTransactions',
                id: 'tx-withdraw',
                payload: expect.objectContaining({
                    amount: -7,
                    currency: 'USD',
                    transactionType: 'withdrawal',
                    envelope: 'env-1',
                    description: 'Cash out',
                }),
            });
            expect(txs[2]).toMatchObject({
                entity: 'allowanceEnvelopes',
                id: 'env-1',
                op: 'link',
                payload: { transactions: 'tx-withdraw' },
            });
        });

        it('records the envelope owner in withdrawal history when the member is resolved from envelope context', async () => {
            currencyMocks.id.mockReturnValueOnce('tx-withdraw').mockReturnValueOnce('history-withdraw');
            const db = {
                transact: vi.fn().mockResolvedValue(undefined),
                queryOnce: vi.fn().mockResolvedValue({
                    data: {
                        allowanceEnvelopes: [
                            {
                                id: 'env-1',
                                name: 'Savings',
                                familyMember: [{ id: 'member-ethan', name: 'Ethan' }],
                            },
                        ],
                    },
                }),
            };

            await withdrawFromEnvelope(db as any, { id: 'env-1', name: 'Savings', balances: { USD: 10 } } as any, 3.22, 'usd');

            const txs = db.transact.mock.calls[0][0] as any[];
            expect(
                txs.some(
                    (tx) =>
                        tx.entity === 'historyEvents' &&
                        tx.op === 'update' &&
                        tx.payload?.summary === `Withdrew $3.22 from Ethan's Savings`
                )
            ).toBe(true);
            expect(
                txs.some(
                    (tx) =>
                        tx.entity === 'historyEvents' &&
                        tx.op === 'link' &&
                        tx.payload?.affectedFamilyMembers === 'member-ethan'
                )
            ).toBe(true);
        });

        it('validates withdrawal inputs and insufficient funds', async () => {
            const db = { transact: vi.fn() };

            await expect(withdrawFromEnvelope(db as any, { id: 'env-1', name: 'Wallet', balances: { USD: 1 } } as any, 0, 'USD')).rejects.toThrow(
                'Withdrawal amount must be positive.'
            );
            await expect(withdrawFromEnvelope(db as any, { id: 'env-1', name: 'Wallet' } as any, 1, 'USD')).rejects.toThrow(
                'Invalid envelope data provided.'
            );
            await expect(
                withdrawFromEnvelope(db as any, { id: 'env-1', name: 'Wallet', balances: { USD: 1 } } as any, 2, 'USD')
            ).rejects.toThrow('Insufficient USD funds in Wallet. Available: 1, Tried: 2');
            expect(db.transact).not.toHaveBeenCalled();
        });

        it('transfers between envelopes, removes zeroed source balance, and creates paired transactions/links', async () => {
            currencyMocks.id.mockReturnValueOnce('tx-out').mockReturnValueOnce('tx-in');
            const db = { transact: vi.fn().mockResolvedValue(undefined) };

            await transferFunds(
                db as any,
                { id: 'env-a', name: 'Spending', balances: { USD: 5, PTS: 9 } } as any,
                { id: 'env-b', name: 'Savings', balances: { USD: 1 } } as any,
                5,
                'usd'
            );

            const txs = db.transact.mock.calls[0][0] as any[];
            expect(txs[0]).toMatchObject({
                entity: 'allowanceEnvelopes',
                id: 'env-a',
                payload: { balances: { PTS: 9 } },
            });
            expect(txs[1]).toMatchObject({
                entity: 'allowanceEnvelopes',
                id: 'env-b',
                payload: { balances: { USD: 6 } },
            });
            const transactionSteps = txs.filter((tx) => tx.entity === 'allowanceTransactions');
            expect(transactionSteps).toHaveLength(2);
            expect(transactionSteps.map((t: any) => t.payload.transactionType).sort()).toEqual(['transfer-in', 'transfer-out']);
            expect(transactionSteps.every((t: any) => t.payload.currency === 'USD')).toBe(true);
            expect(txs.filter((tx) => tx.op === 'link' && tx.entity === 'allowanceEnvelopes')).toHaveLength(2);
        });

        it('validates transferFunds input and insufficient funds', async () => {
            const db = { transact: vi.fn() };
            const env = { id: 'env-a', name: 'A', balances: { USD: 1 } } as any;

            await expect(transferFunds(db as any, env, { id: 'env-b', name: 'B', balances: {} } as any, 0, 'USD')).rejects.toThrow(
                'Transfer amount must be positive.'
            );
            await expect(transferFunds(db as any, env, env, 1, 'USD')).rejects.toThrow('Cannot transfer funds to the same envelope.');
            await expect(transferFunds(db as any, env, { id: 'env-b', name: 'B', balances: {} } as any, 2, 'USD')).rejects.toThrow(
                'Insufficient USD funds in A.'
            );
            expect(db.transact).not.toHaveBeenCalled();
        });

        it('transfers funds to another person with fallback description and paired person-transfer transaction types', async () => {
            currencyMocks.id.mockReturnValueOnce('tx-person-out').mockReturnValueOnce('tx-person-in');
            const db = { transact: vi.fn().mockResolvedValue(undefined) };

            await transferFundsToPerson(
                db as any,
                {
                    id: 'env-s',
                    name: 'Spending',
                    balances: { USD: 3 },
                    familyMember: [{ id: 'm1', name: 'Alice' }],
                } as any,
                {
                    id: 'env-r',
                    name: 'Savings',
                    balances: { USD: 7 },
                    familyMember: [{ id: 'm2', name: 'Bob' }],
                } as any,
                3,
                'usd'
            );

            const txs = db.transact.mock.calls[0][0] as any[];
            expect(txs[0]).toMatchObject({
                entity: 'allowanceEnvelopes',
                id: 'env-s',
                payload: { balances: {} },
            });
            expect(txs[1]).toMatchObject({
                entity: 'allowanceEnvelopes',
                id: 'env-r',
                payload: { balances: { USD: 10 } },
            });
            const transactionSteps = txs.filter((tx) => tx.entity === 'allowanceTransactions');
            expect(transactionSteps).toHaveLength(2);
            expect(transactionSteps.map((t: any) => t.payload.transactionType).sort()).toEqual(['transfer-in-person', 'transfer-out-person']);
            expect(transactionSteps.every((t: any) => t.payload.description === 'Transfer from Alice to Bob')).toBe(true);
        });

        it('validates transferFundsToPerson envelopes and insufficient funds', async () => {
            const db = { transact: vi.fn() };
            const source = { id: 'env-s', name: 'Spending', balances: { USD: 1 } } as any;
            const dest = { id: 'env-r', name: 'Savings', balances: { USD: 0 } } as any;

            await expect(transferFundsToPerson(db as any, source, dest, 0, 'USD')).rejects.toThrow('Transfer amount must be positive.');
            await expect(transferFundsToPerson(db as any, { id: 'env-s' } as any, dest, 1, 'USD')).rejects.toThrow('Invalid source envelope data.');
            await expect(transferFundsToPerson(db as any, source, { id: 'env-r' } as any, 1, 'USD')).rejects.toThrow(
                'Invalid destination envelope data.'
            );
            await expect(transferFundsToPerson(db as any, source, source, 1, 'USD')).rejects.toThrow(
                'Source and destination envelopes cannot be the same.'
            );
            await expect(transferFundsToPerson(db as any, source, dest, 2, 'USD')).rejects.toThrow(
                'Insufficient USD funds in source envelope (Spending). Available: 1, Tried: 2'
            );
            expect(db.transact).not.toHaveBeenCalled();
        });
    });

    describe('deleteEnvelope helper', () => {
        it('validates deleteEnvelope preconditions', async () => {
            const db = { transact: vi.fn() };
            const envelopes = [
                { id: 'e1', name: 'A', balances: {}, isDefault: true },
                { id: 'e2', name: 'B', balances: {}, isDefault: false },
            ] as any;

            await expect(deleteEnvelope(db as any, envelopes, 'e1', 'e1')).rejects.toThrow('Cannot transfer funds to the envelope being deleted.');
            await expect(deleteEnvelope(db as any, [{ id: 'only', name: 'A', balances: {} }] as any, 'only', 'x')).rejects.toThrow(
                'Cannot delete the last envelope.'
            );
            await expect(deleteEnvelope(db as any, envelopes, 'missing', 'e2')).rejects.toThrow('Envelope to delete not found in provided list.');
            await expect(deleteEnvelope(db as any, envelopes, 'e1', 'missing')).rejects.toThrow(
                'Envelope to transfer funds to not found in provided list.'
            );
            await expect(deleteEnvelope(db as any, envelopes, 'e1', 'e2')).rejects.toThrow(
                'Must specify a new default envelope when deleting the default.'
            );
            await expect(deleteEnvelope(db as any, envelopes, 'e1', 'e2', 'e1')).rejects.toThrow('New default cannot be the deleted envelope.');
            await expect(deleteEnvelope(db as any, envelopes, 'e1', 'e2', 'missing')).rejects.toThrow(
                'Specified new default envelope (missing) not found.'
            );
        });

        it('deletes an envelope, transfers only positive balances, updates default, and records paired transfer transactions', async () => {
            currencyMocks.id
                .mockReturnValueOnce('tx-out-usd')
                .mockReturnValueOnce('tx-in-usd')
                .mockReturnValueOnce('tx-out-pts')
                .mockReturnValueOnce('tx-in-pts');

            const db = { transact: vi.fn().mockResolvedValue(undefined) };
            const envelopes: Envelope[] = [
                {
                    id: 'env-delete',
                    name: 'Delete Me',
                    balances: { USD: 5, PTS: 3, EUR: 0, NEG: -2 as any },
                    isDefault: true,
                },
                { id: 'env-target', name: 'Target', balances: { USD: 1 }, isDefault: false },
                { id: 'env-new-default', name: 'Main', balances: { USD: 9 }, isDefault: false },
            ] as any;

            await deleteEnvelope(db as any, envelopes, 'env-delete', 'env-target', 'env-new-default');

            expect(db.transact).toHaveBeenCalledTimes(1);
            const txs = db.transact.mock.calls[0][0] as any[];

            const targetBalanceUpdate = txs.find((tx) => tx.entity === 'allowanceEnvelopes' && tx.id === 'env-target' && tx.op === 'update');
            expect(targetBalanceUpdate?.payload?.balances).toEqual({
                USD: 6,
                PTS: 3,
            });

            expect(
                txs.some((tx) => tx.entity === 'allowanceEnvelopes' && tx.id === 'env-new-default' && tx.op === 'update' && tx.payload?.isDefault === true)
            ).toBe(true);
            expect(txs[txs.length - 1]).toEqual({ op: 'delete', entity: 'allowanceEnvelopes', id: 'env-delete' });

            const txUpdates = txs.filter((tx) => tx.entity === 'allowanceTransactions' && tx.op === 'update');
            expect(txUpdates).toHaveLength(4);
            expect(txUpdates.map((tx: any) => tx.payload.currency).sort()).toEqual(['PTS', 'PTS', 'USD', 'USD']);
            expect(txUpdates.map((tx: any) => tx.payload.transactionType).sort()).toEqual(['transfer-in', 'transfer-in', 'transfer-out', 'transfer-out']);

            const incomingLinks = txs.filter(
                (tx) => tx.entity === 'allowanceEnvelopes' && tx.id === 'env-target' && tx.op === 'link' && tx.payload?.incomingTransfers
            );
            expect(incomingLinks).toHaveLength(2);
        });
    });

    describe('preference helper', () => {
        it('stores last display currency preference for a member', async () => {
            const db = { transact: vi.fn().mockResolvedValue(undefined) };

            await setLastDisplayCurrencyPref(db as any, 'member-1', 'EUR');

            expect(db.transact).toHaveBeenCalledWith([
                { op: 'update', entity: 'familyMembers', id: 'member-1', payload: { lastDisplayCurrency: 'EUR' } },
            ]);
        });

        it('returns early when no member id is provided', async () => {
            const db = { transact: vi.fn() };

            await setLastDisplayCurrencyPref(db as any, '', 'USD');

            expect(db.transact).not.toHaveBeenCalled();
        });
    });

    describe('reconcileEnvelope', () => {
        it('returns fixed:false when calculated balances match current balances', async () => {
            const db = {
                transact: vi.fn(),
                queryOnce: vi.fn().mockResolvedValue({
                    data: {
                        allowanceTransactions: [
                            { amount: 10, currency: 'USD' },
                            { amount: 5, currency: 'USD' },
                            { amount: 3, currency: 'EUR' },
                        ],
                    },
                }),
            };

            const result = await reconcileEnvelope(db as any, 'env-1', { USD: 15, EUR: 3 });

            expect(result).toEqual({ fixed: false });
            expect(db.transact).not.toHaveBeenCalled();
            expect(db.queryOnce).toHaveBeenCalledWith({
                allowanceTransactions: { $: { where: { envelope: 'env-1' } } },
            });
        });

        it('fixes and returns calculated balances when mismatch exceeds tolerance', async () => {
            const db = {
                transact: vi.fn().mockResolvedValue(undefined),
                queryOnce: vi.fn().mockResolvedValue({
                    data: {
                        allowanceTransactions: [
                            { amount: 10, currency: 'USD' },
                            { amount: 7, currency: 'USD' },
                        ],
                    },
                }),
            };

            const result = await reconcileEnvelope(db as any, 'env-1', { USD: 20 });

            expect(result).toEqual({ fixed: true, balances: { USD: 17 } });
            expect(db.transact).toHaveBeenCalledTimes(1);
            expect(db.transact.mock.calls[0][0]).toEqual({
                op: 'update',
                entity: 'allowanceEnvelopes',
                id: 'env-1',
                payload: { balances: { USD: 17 } },
            });
        });

        it('returns fixed:false for empty transactions when current balances are empty', async () => {
            const db = {
                transact: vi.fn(),
                queryOnce: vi.fn().mockResolvedValue({
                    data: { allowanceTransactions: [] },
                }),
            };

            const result = await reconcileEnvelope(db as any, 'env-1', {});

            expect(result).toEqual({ fixed: false });
            expect(db.transact).not.toHaveBeenCalled();
        });

        it('fixes when current balances are non-zero but no transactions exist', async () => {
            const db = {
                transact: vi.fn().mockResolvedValue(undefined),
                queryOnce: vi.fn().mockResolvedValue({
                    data: { allowanceTransactions: [] },
                }),
            };

            const result = await reconcileEnvelope(db as any, 'env-1', { USD: 5 });

            expect(result).toEqual({ fixed: true, balances: {} });
            expect(db.transact).toHaveBeenCalledTimes(1);
        });

        it('ignores transactions with no currency field when summing balances', async () => {
            const db = {
                transact: vi.fn(),
                queryOnce: vi.fn().mockResolvedValue({
                    data: {
                        allowanceTransactions: [
                            { amount: 10, currency: 'USD' },
                            { amount: 5 },
                            { amount: 3, currency: null },
                            { amount: 2, currency: 'USD' },
                        ],
                    },
                }),
            };

            const result = await reconcileEnvelope(db as any, 'env-1', { USD: 12 });

            expect(result).toEqual({ fixed: false });
            expect(db.transact).not.toHaveBeenCalled();
        });

        it('treats differences within 0.001 tolerance as matching', async () => {
            const db = {
                transact: vi.fn(),
                queryOnce: vi.fn().mockResolvedValue({
                    data: {
                        allowanceTransactions: [{ amount: 10.0005, currency: 'USD' }],
                    },
                }),
            };

            const result = await reconcileEnvelope(db as any, 'env-1', { USD: 10.001 });

            expect(result).toEqual({ fixed: false });
            expect(db.transact).not.toHaveBeenCalled();
        });
    });
});
