// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

    return {
        id: vi.fn(),
        tx: {
            allowanceEnvelopes: txFactory('allowanceEnvelopes'),
            allowanceTransactions: txFactory('allowanceTransactions'),
            historyEvents: txFactory('historyEvents'),
            historyEventAttachments: txFactory('historyEventAttachments'),
        },
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

describe('currency-utils allowance transaction audit stamping', () => {
    beforeEach(() => {
        vi.resetModules();
        currencyMocks.id.mockReset();
        currencyMocks.getAuth.mockReset();
        currencyMocks.id.mockReturnValue('tx_123');
        currencyMocks.getAuth.mockResolvedValue({ id: 'instant-kid-principal' });
        window.localStorage.clear();
    });

    it('stamps createdBy and selected family member on deposit transactions', async () => {
        window.localStorage.setItem('family_organizer_user_id', 'family-member-abc');

        const { depositToSpecificEnvelope } = await import('@/lib/currency-utils');
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        await depositToSpecificEnvelope(db as any, 'env_1', { USD: 10 }, 5, 'usd', 'Test deposit');

        expect(db.transact).toHaveBeenCalledTimes(1);
        const txSteps = db.transact.mock.calls[0][0] as any[];
        const transactionUpdate = txSteps.find((step) => step.entity === 'allowanceTransactions' && step.op === 'update');

        expect(transactionUpdate).toBeTruthy();
        expect(transactionUpdate.payload).toMatchObject({
            createdBy: 'instant-kid-principal',
            createdByFamilyMemberId: 'family-member-abc',
            amount: 5,
            currency: 'USD',
            transactionType: 'deposit',
            envelope: 'env_1',
        });
    });

    it('throws when no Instant auth principal is present', async () => {
        currencyMocks.getAuth.mockResolvedValue(null);

        const { depositToSpecificEnvelope } = await import('@/lib/currency-utils');
        const db = { transact: vi.fn() };

        await expect(depositToSpecificEnvelope(db as any, 'env_1', {}, 5, 'USD')).rejects.toThrow(
            'Instant auth is required to create allowance transactions'
        );
        expect(db.transact).not.toHaveBeenCalled();
    });

    it('stamps both transfer records in transferFunds with the same audit actor', async () => {
        window.localStorage.setItem('family_organizer_user_id', 'family-member-xyz');
        currencyMocks.id.mockReset();
        currencyMocks.id.mockReturnValueOnce('tx_out').mockReturnValueOnce('tx_in');

        const { transferFunds } = await import('@/lib/currency-utils');
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        await transferFunds(
            db as any,
            { id: 'env_a', name: 'A', balances: { USD: 20 } } as any,
            { id: 'env_b', name: 'B', balances: { USD: 3 } } as any,
            5,
            'usd'
        );

        const txSteps = db.transact.mock.calls[0][0] as any[];
        const transactionUpdates = txSteps.filter((step) => step.entity === 'allowanceTransactions' && step.op === 'update');

        expect(transactionUpdates).toHaveLength(2);
        for (const step of transactionUpdates) {
            expect(step.payload).toMatchObject({
                createdBy: 'instant-kid-principal',
                createdByFamilyMemberId: 'family-member-xyz',
                currency: 'USD',
            });
        }
        expect(transactionUpdates.map((step) => step.payload.transactionType).sort()).toEqual(['transfer-in', 'transfer-out']);
    });

    it('stamps createdBy fields on withdraw transactions', async () => {
        window.localStorage.setItem('family_organizer_user_id', 'member-withdraw');
        currencyMocks.id.mockReset();
        currencyMocks.id.mockReturnValue('tx_withdraw');

        const { withdrawFromEnvelope } = await import('@/lib/currency-utils');
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        await withdrawFromEnvelope(db as any, { id: 'env_w', name: 'Wallet', balances: { USD: 20 } } as any, 7, 'usd', 'Cash out');

        const txSteps = db.transact.mock.calls[0][0] as any[];
        const transactionUpdate = txSteps.find((step) => step.entity === 'allowanceTransactions' && step.op === 'update');

        expect(transactionUpdate.payload).toMatchObject({
            createdBy: 'instant-kid-principal',
            createdByFamilyMemberId: 'member-withdraw',
            amount: -7,
            currency: 'USD',
            transactionType: 'withdrawal',
            envelope: 'env_w',
        });
    });

    it('stamps both transaction records created by deleteEnvelope transfers', async () => {
        window.localStorage.setItem('family_organizer_user_id', 'member-delete');
        currencyMocks.id.mockReset();
        currencyMocks.id.mockReturnValueOnce('tx_del_out').mockReturnValueOnce('tx_del_in');

        const { deleteEnvelope } = await import('@/lib/currency-utils');
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        await deleteEnvelope(
            db as any,
            [
                { id: 'env_delete', name: 'Old Envelope', balances: { USD: 4 }, isDefault: false },
                { id: 'env_target', name: 'Target Envelope', balances: { USD: 1 }, isDefault: true },
            ] as any,
            'env_delete',
            'env_target',
            null
        );

        const txSteps = db.transact.mock.calls[0][0] as any[];
        const transactionUpdates = txSteps.filter((step) => step.entity === 'allowanceTransactions' && step.op === 'update');

        expect(transactionUpdates).toHaveLength(2);
        for (const step of transactionUpdates) {
            expect(step.payload).toMatchObject({
                createdBy: 'instant-kid-principal',
                createdByFamilyMemberId: 'member-delete',
                currency: 'USD',
            });
        }
        expect(transactionUpdates.map((step) => step.payload.transactionType).sort()).toEqual(['transfer-in', 'transfer-out']);
    });

    it('stamps both person-transfer transaction records with audit actor', async () => {
        window.localStorage.setItem('family_organizer_user_id', 'member-person-transfer');
        currencyMocks.id.mockReset();
        currencyMocks.id.mockReturnValueOnce('tx_person_out').mockReturnValueOnce('tx_person_in');

        const { transferFundsToPerson } = await import('@/lib/currency-utils');
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        await transferFundsToPerson(
            db as any,
            {
                id: 'env_sender',
                name: 'Spending',
                balances: { USD: 25 },
                familyMember: [{ id: 'm1', name: 'Alice' }],
            } as any,
            {
                id: 'env_receiver',
                name: 'Savings',
                balances: { USD: 2 },
                familyMember: [{ id: 'm2', name: 'Bob' }],
            } as any,
            6,
            'usd'
        );

        const txSteps = db.transact.mock.calls[0][0] as any[];
        const transactionUpdates = txSteps.filter((step) => step.entity === 'allowanceTransactions' && step.op === 'update');

        expect(transactionUpdates).toHaveLength(2);
        for (const step of transactionUpdates) {
            expect(step.payload).toMatchObject({
                createdBy: 'instant-kid-principal',
                createdByFamilyMemberId: 'member-person-transfer',
                currency: 'USD',
                sourceEnvelope: 'env_sender',
                destinationEnvelope: 'env_receiver',
            });
        }
        expect(transactionUpdates.map((step) => step.payload.transactionType).sort()).toEqual(['transfer-in-person', 'transfer-out-person']);
    });
});
