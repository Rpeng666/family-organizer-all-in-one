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
        id: vi.fn(() => 'rate-cache-id'),
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

import type { CachedExchangeRate, Envelope, UnitDefinition } from '@/lib/currency-utils';
import {
    calculateEnvelopeProgress,
    canInitiateTransaction,
    computeAllApplicableCurrencyCodes,
    computeMonetaryCurrencies,
    distributeAllowance,
    findOrDefaultEnvelope,
    formatBalances,
    getExchangeRate,
    executeAllowanceTransaction,
    setDefaultEnvelope,
} from '@/lib/currency-utils';

describe('currency-utils core helpers', () => {
    beforeEach(() => {
        currencyMocks.id.mockReset();
        currencyMocks.id.mockReturnValue('rate-cache-id');
        currencyMocks.getAuth.mockReset();
        currencyMocks.getAuth.mockResolvedValue({ id: 'instant-principal' });
        freezeTime(new Date('2026-02-26T12:00:00Z'));
    });

    it('formats balances using unit definitions with symbol placement/spacing defaults', () => {
        const unitDefinitions: UnitDefinition[] = [
            {
                id: 'usd',
                code: 'USD',
                symbol: '$',
                isMonetary: true,
                decimalPlaces: 2,
            },
            {
                id: 'stars',
                code: 'STARS',
                symbol: '⭐',
                isMonetary: false,
                symbolPlacement: 'before',
                symbolSpacing: true,
                decimalPlaces: 0,
            },
        ];

        const formatted = formatBalances({ usd: 10, stars: 25, customThing: 3 }, unitDefinitions);

        expect(formatted).toContain('$10.00');
        expect(formatted).toContain('⭐ 25');
        expect(formatted).toContain('3 customThing');
    });

    it('computes monetary currency codes from balances + definitions with heuristic fallback', () => {
        const envelopes: Envelope[] = [
            { id: 'e1', name: 'Savings', balances: { usd: 10, stars: 5 } },
            { id: 'e2', name: 'Wallet', balances: { eur: 3 } },
        ];
        const defs: UnitDefinition[] = [
            { id: 'usd', code: 'USD', isMonetary: true },
            { id: 'stars', code: 'STARS', isMonetary: false },
            { id: 'gems', code: 'GEMS', isMonetary: false },
        ];

        expect(computeMonetaryCurrencies(envelopes, defs)).toEqual(['EUR', 'USD']);
    });

    it('computes all applicable currency codes and includes USD default', () => {
        const envelopes: Envelope[] = [{ id: 'e1', name: 'Savings', balances: { npr: 1000 } }];
        const defs: UnitDefinition[] = [{ id: 'stars', code: 'STARS', isMonetary: false }];

        expect(computeAllApplicableCurrencyCodes(envelopes, defs)).toEqual(['NPR', 'STARS', 'USD']);
    });

    it('distributes allowance by scaled percentages and falls back to first envelope when unset', () => {
        expect(
            distributeAllowance(100, 'USD', [
                { id: 'a', allowancePercentage: 25 },
                { id: 'b', allowancePercentage: 25 },
            ])
        ).toEqual([
            { envelopeId: 'a', amount: 50 },
            { envelopeId: 'b', amount: 50 },
        ]);

        expect(distributeAllowance(42, 'USD', [{ id: 'solo' }, { id: 'other' }])).toEqual([{ envelopeId: 'solo', amount: 42 }]);
    });

    it('enforces simple transaction initiation permissions by role', () => {
        expect(canInitiateTransaction('Parent', 'deposit')).toBe(true);
        expect(canInitiateTransaction('Parent', 'withdrawal')).toBe(true);
        expect(canInitiateTransaction('Parent', 'transfer')).toBe(true);
        expect(canInitiateTransaction('Child', 'transfer')).toBe(true);
        expect(canInitiateTransaction('Child', 'deposit')).toBe(false);
        expect(canInitiateTransaction('Child', 'withdrawal')).toBe(false);
    });

    it('returns identity and valid cached rates without requesting an API fetch', async () => {
        const now = new Date('2026-02-26T12:00:00Z');
        const cachedRates: CachedExchangeRate[] = [
            {
                id: 'r1',
                baseCurrency: 'EUR',
                targetCurrency: 'NPR',
                rate: 140,
                lastFetchedTimestamp: now,
            },
        ];
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        await expect(getExchangeRate(db as any, 'USD', 'USD', cachedRates)).resolves.toMatchObject({
            rate: 1,
            source: 'identity',
            needsApiFetch: false,
        });

        await expect(getExchangeRate(db as any, 'EUR', 'NPR', cachedRates)).resolves.toMatchObject({
            rate: 140,
            source: 'cache',
            needsApiFetch: false,
        });
        expect(db.transact).not.toHaveBeenCalled();
    });

    it('calculates cross rates from valid USD cache entries and caches the derived rate', async () => {
        const now = new Date('2026-02-26T12:00:00Z');
        const cachedRates: CachedExchangeRate[] = [
            {
                id: 'usd-eur',
                baseCurrency: 'USD',
                targetCurrency: 'EUR',
                rate: 0.5,
                lastFetchedTimestamp: now,
            },
            {
                id: 'usd-npr',
                baseCurrency: 'USD',
                targetCurrency: 'NPR',
                rate: 150,
                lastFetchedTimestamp: now,
            },
        ];
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        const result = await getExchangeRate(db as any, 'EUR', 'NPR', cachedRates);
        expect(result.rate).toBe(300); // 150 / 0.5
        expect(result.source).toBe('calculated');
        expect(result.needsApiFetch).toBe(false);

        await Promise.resolve();
        expect(db.transact).toHaveBeenCalledTimes(1);
        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs.some((tx) => tx.entity === 'exchangeRates' && tx.op === 'update')).toBe(true);
    });

    it('returns stale direct rate with needsApiFetch when cached rate is expired', async () => {
        const stale = new Date('2026-02-26T08:00:00Z'); // older than 2h vs frozen 12:00
        const cachedRates: CachedExchangeRate[] = [
            {
                id: 'stale-direct',
                baseCurrency: 'EUR',
                targetCurrency: 'NPR',
                rate: 142,
                lastFetchedTimestamp: stale,
            },
        ];
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        const result = await getExchangeRate(db as any, 'EUR', 'NPR', cachedRates);

        expect(result).toMatchObject({
            rate: 142,
            source: 'unavailable',
            needsApiFetch: true,
        });
    });

    it('returns unavailable with null rate when no usable cache path exists', async () => {
        const db = { transact: vi.fn().mockResolvedValue(undefined) };

        const result = await getExchangeRate(db as any, 'EUR', 'JPY', []);

        expect(result).toMatchObject({
            rate: null,
            source: 'unavailable',
            needsApiFetch: true,
        });
    });

    it('generates the right default-envelope update transactions when switching defaults', async () => {
        const db = { transact: vi.fn().mockResolvedValue(undefined) };
        const envelopes: Envelope[] = [
            { id: 'env-a', name: 'A', balances: {}, isDefault: true },
            { id: 'env-b', name: 'B', balances: {}, isDefault: false },
        ];

        await setDefaultEnvelope(db as any, envelopes, 'env-b');

        expect(db.transact).toHaveBeenCalledTimes(1);
        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs).toEqual([
            { op: 'update', entity: 'allowanceEnvelopes', id: 'env-a', payload: { isDefault: false } },
            { op: 'update', entity: 'allowanceEnvelopes', id: 'env-b', payload: { isDefault: true } },
        ]);
    });

    it('does not transact when the requested envelope is already the default', async () => {
        const db = { transact: vi.fn().mockResolvedValue(undefined) };
        const envelopes: Envelope[] = [
            { id: 'env-a', name: 'A', balances: {}, isDefault: true },
            { id: 'env-b', name: 'B', balances: {}, isDefault: false },
        ];

        await setDefaultEnvelope(db as any, envelopes, 'env-a');

        expect(db.transact).not.toHaveBeenCalled();
    });

    it('finds an existing default envelope without mutating data', async () => {
        const db = { transact: vi.fn(), queryOnce: vi.fn() };
        const envelopes: Envelope[] = [
            { id: 'env-default', name: 'Savings', balances: {}, isDefault: true },
            { id: 'env-other', name: 'Spending', balances: {}, isDefault: false },
        ];

        await expect(findOrDefaultEnvelope(db as any, 'member-1', envelopes)).resolves.toBe('env-default');
        expect(db.transact).not.toHaveBeenCalled();
        expect(db.queryOnce).not.toHaveBeenCalled();
    });

    it('promotes the Savings envelope to default when no default exists', async () => {
        const db = { transact: vi.fn().mockResolvedValue(undefined) };
        const envelopes: Envelope[] = [
            { id: 'env-savings', name: 'Savings', balances: {}, isDefault: false },
            { id: 'env-other', name: 'Spending', balances: {}, isDefault: false },
        ];

        await expect(findOrDefaultEnvelope(db as any, 'member-1', envelopes)).resolves.toBe('env-savings');
        expect(db.transact).toHaveBeenCalledTimes(1);
        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs.some((tx) => tx.entity === 'allowanceEnvelopes' && tx.id === 'env-savings' && tx.payload?.isDefault === true)).toBe(true);
    });

    it('falls back to the first envelope when no default and no Savings envelope exist', async () => {
        const db = { transact: vi.fn().mockResolvedValue(undefined) };
        const envelopes: Envelope[] = [
            { id: 'env-first', name: 'Wallet', balances: {}, isDefault: false },
            { id: 'env-second', name: 'Spending', balances: {}, isDefault: false },
        ];

        await expect(findOrDefaultEnvelope(db as any, 'member-1', envelopes)).resolves.toBe('env-first');
        expect(db.transact).toHaveBeenCalledTimes(1);
        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs).toEqual([{ op: 'update', entity: 'allowanceEnvelopes', id: 'env-first', payload: { isDefault: true } }]);
    });

    it('creates an initial Savings envelope when no envelopes exist', async () => {
        const db = { transact: vi.fn().mockResolvedValue(undefined) };
        currencyMocks.id.mockReturnValueOnce('new-savings-id');

        await expect(findOrDefaultEnvelope(db as any, 'member-42', [])).resolves.toBe('new-savings-id');

        expect(db.transact).toHaveBeenCalledTimes(1);
        const txs = db.transact.mock.calls[0][0] as any[];
        expect(txs.length).toBeGreaterThanOrEqual(4);
        expect(txs[0]).toMatchObject({
            op: 'update',
            entity: 'allowanceEnvelopes',
            id: 'new-savings-id',
            payload: expect.objectContaining({
                name: 'Savings',
                isDefault: true,
                familyMember: 'member-42',
            }),
        });
        expect(txs[1]).toMatchObject({
            op: 'link',
            entity: 'familyMembers',
            id: 'member-42',
            payload: { allowanceEnvelopes: 'new-savings-id' },
        });
        expect(txs[2]).toMatchObject({
            op: 'update',
            entity: 'allowanceTransactions',
            payload: expect.objectContaining({
                amount: 0,
                transactionType: 'init',
                description: 'Envelope Created',
                envelope: 'new-savings-id',
            }),
        });
        expect(txs[3]).toMatchObject({
            op: 'link',
            entity: 'allowanceEnvelopes',
            id: 'new-savings-id',
            payload: expect.objectContaining({ transactions: expect.any(String) }),
        });
    });

    it('calculates envelope goal progress using cached/identity rates and skips non-monetary balances', async () => {
        const db = { transact: vi.fn().mockResolvedValue(undefined) };
        const envelope: Envelope = {
            id: 'env1',
            name: 'Savings',
            balances: {
                USD: 50,
                EUR: 10,
                STARS: 500,
            },
            goalAmount: 100,
            goalCurrency: 'USD',
        };
        const unitDefinitions: UnitDefinition[] = [
            { id: 'usd', code: 'USD', isMonetary: true },
            { id: 'eur', code: 'EUR', isMonetary: true },
            { id: 'stars', code: 'STARS', isMonetary: false },
        ];
        const cachedRates: CachedExchangeRate[] = [
            {
                id: 'usd-eur',
                baseCurrency: 'USD',
                targetCurrency: 'EUR',
                rate: 0.5,
                lastFetchedTimestamp: new Date('2026-02-26T12:00:00Z'),
            },
        ];

        const result = await calculateEnvelopeProgress(db as any, envelope, unitDefinitions, cachedRates);

        // EUR -> USD derived from stale? no, valid USD->EUR in cache and inverse path should be calculated => 1 / 0.5 = 2
        // Total = 50 USD + 10 EUR * 2 = 70 USD ; STARS ignored
        expect(result.totalValueInGoalCurrency).toBe(70);
        expect(result.percentage).toBe(70);
        expect(result.errors).toEqual([]);
    });

    it('reports missing rates in goal progress and triggers a background exchange-rate fetch/cache', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                rates: { USD: 1, JPY: 150 },
                timestamp: 1_700_000_000,
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const db = { transact: vi.fn().mockResolvedValue(undefined) };
        const envelope: Envelope = {
            id: 'env2',
            name: 'Savings',
            balances: { JPY: 1000 },
            goalAmount: 100,
            goalCurrency: 'EUR',
        };
        const defs: UnitDefinition[] = [
            { id: 'jpy', code: 'JPY', isMonetary: true },
            { id: 'eur', code: 'EUR', isMonetary: true },
        ];

        const result = await calculateEnvelopeProgress(db as any, envelope, defs, []);

        expect(result.totalValueInGoalCurrency).toBe(0);
        expect(result.percentage).toBe(0);
        expect(result.errors).toContain('Could not find exchange rate from JPY to EUR.');

        await Promise.resolve();
        await Promise.resolve();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(db.transact).toHaveBeenCalledTimes(1); // cacheExchangeRates background write
    });

    it('skips allowance execution for zero amount and routes positive/negative amounts to the default envelope', async () => {
        const db = {
            transact: vi.fn().mockResolvedValue(undefined),
            queryOnce: vi.fn().mockResolvedValue({ data: { allowanceEnvelopes: [] } }),
        };
        const envelopes: Envelope[] = [{ id: 'env-default', name: 'Savings', balances: { USD: 5 }, isDefault: true }];

        await executeAllowanceTransaction(db as any, 'member-1', envelopes, 0, 'USD', 'No-op');
        expect(db.transact).not.toHaveBeenCalled();

        await executeAllowanceTransaction(db as any, 'member-1', envelopes, 10, 'USD', 'Allowance deposit');
        expect(db.queryOnce).toHaveBeenCalledTimes(1);
        expect(db.transact).toHaveBeenCalledTimes(1);
        const depositTxs = db.transact.mock.calls[0][0] as any[];
        expect(depositTxs.some((tx) => tx.entity === 'allowanceEnvelopes' && tx.id === 'env-default' && tx.payload?.balances?.USD === 15)).toBe(true);
        expect(
            depositTxs.some(
                (tx) => tx.entity === 'allowanceTransactions' && tx.payload?.transactionType === 'deposit' && tx.payload?.amount === 10 && tx.payload?.currency === 'USD'
            )
        ).toBe(true);

        db.transact.mockClear();
        await executeAllowanceTransaction(db as any, 'member-1', envelopes, -3, 'USD', 'Allowance withdrawal');
        const withdrawalTxs = db.transact.mock.calls[0][0] as any[];
        expect(withdrawalTxs.some((tx) => tx.entity === 'allowanceEnvelopes' && tx.id === 'env-default' && tx.payload?.balances?.USD === 2)).toBe(true);
        expect(
            withdrawalTxs.some(
                (tx) =>
                    tx.entity === 'allowanceTransactions' && tx.payload?.transactionType === 'withdrawal' && tx.payload?.amount === -3 && tx.payload?.currency === 'USD'
            )
        ).toBe(true);
    });

    it('fetches the default envelope via queryOnce when it is created or missing from the provided envelope list', async () => {
        currencyMocks.id.mockReturnValueOnce('created-default').mockReturnValueOnce('tx-deposit');

        const db = {
            transact: vi.fn().mockResolvedValue(undefined),
            queryOnce: vi.fn().mockResolvedValue({
                data: {
                    allowanceEnvelopes: [{ id: 'created-default', name: 'Savings', balances: {}, isDefault: true }],
                },
            }),
        };

        await executeAllowanceTransaction(db as any, 'member-new', [], 7, 'USD', 'Initial allowance');

        expect(db.queryOnce).toHaveBeenCalledWith({
            allowanceEnvelopes: { $: { where: { id: 'created-default' } } },
        });
        expect(db.transact).toHaveBeenCalledTimes(2); // create initial envelope + deposit transaction

        const depositTxs = db.transact.mock.calls[1][0] as any[];
        expect(
            depositTxs.some(
                (tx) => tx.entity === 'allowanceTransactions' && tx.payload?.transactionType === 'deposit' && tx.payload?.amount === 7 && tx.payload?.envelope === 'created-default'
            )
        ).toBe(true);
    });
});
