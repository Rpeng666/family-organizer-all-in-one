// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const txHistoryMocks = vi.hoisted(() => ({
    formatBalances: vi.fn((balances: Record<string, number>) =>
        Object.entries(balances)
            .map(([currency, amount]) => `${currency} ${amount}`)
            .join(', ')
    ),
}));

vi.mock('@instantdb/react', () => ({
    id: vi.fn(() => 'mock-id'),
    tx: {},
}));

vi.mock('@/lib/currency-utils', () => ({
    formatBalances: txHistoryMocks.formatBalances,
}));

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, ...props }: any) => (
        <button type="button" {...props}>
            {children}
        </button>
    ),
}));

vi.mock('@/components/ui/card', () => ({
    Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CardTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
    CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CardFooter: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/scroll-area', () => ({
    ScrollArea: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/ui/badge', () => ({
    Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/select', async () => {
    const React = await import('react');

    type Option = { value: string; label: string };
    type Ctx = {
        value?: string;
        onValueChange?: (value: string) => void;
        options: Option[];
        registerOption: (option: Option) => () => void;
    };

    const SelectCtx = React.createContext<Ctx | null>(null);

    function flattenText(node: any): string {
        if (node == null) return '';
        if (typeof node === 'string' || typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(flattenText).join('');
        if (React.isValidElement(node)) return flattenText((node.props as any).children);
        return '';
    }

    const Select = ({ value, onValueChange, children }: any) => {
        const [options, setOptions] = React.useState<Option[]>([]);
        const registerOption = React.useCallback((option: Option) => {
            setOptions((prev) => (prev.some((existing) => existing.value === option.value) ? prev : [...prev, option]));
            return () => setOptions((prev) => prev.filter((existing) => existing.value !== option.value));
        }, []);

        return <SelectCtx.Provider value={{ value, onValueChange, options, registerOption }}>{children}</SelectCtx.Provider>;
    };

    const SelectTrigger = ({ children: _children, ...props }: any) => {
        const ctx = React.useContext(SelectCtx);
        return (
            <select
                aria-label="Currency filter"
                value={ctx?.value ?? ''}
                onChange={(e) => ctx?.onValueChange?.(e.target.value)}
                {...props}
            >
                <option value="" />
                {(ctx?.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        );
    };

    const SelectValue = () => null;
    const SelectContent = ({ children }: any) => <>{children}</>;
    const SelectItem = ({ value, children }: any) => {
        const ctx = React.useContext(SelectCtx);
        const registerOption = ctx?.registerOption;
        const label = flattenText(children).trim();

        React.useEffect(() => registerOption?.({ value, label }), [registerOption, value, label]);
        return null;
    };

    return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

import TransactionHistoryView from '@/components/allowance/TransactionHistoryView';

function createDb(mainResult: any, familyNamesResult?: any) {
    return {
        useQuery: vi.fn((query: any, options?: any) => {
            if (options) {
                return mainResult;
            }
            if (query?.familyMembers && !options) {
                return (
                    familyNamesResult ?? {
                        isLoading: false,
                        error: null,
                        data: { familyMembers: [] },
                    }
                );
            }
            return {
                isLoading: false,
                error: null,
                data: {},
            };
        }),
    };
}

describe('TransactionHistoryView', () => {
    beforeEach(() => {
        txHistoryMocks.formatBalances.mockClear();
    });

    it('renders loading and error states from the main query', () => {
        const loadingDb = createDb({ isLoading: true, error: null, data: null });
        const noop = () => {};

        const { rerender } = render(
            <TransactionHistoryView db={loadingDb} mode="all" unitDefinitions={[]} onClose={noop} />
        );
        expect(screen.getByText(/loading transactions/i)).toBeInTheDocument();

        const errorDb = createDb({ isLoading: false, error: new Error('boom'), data: null });
        rerender(<TransactionHistoryView db={errorDb} mode="all" unitDefinitions={[]} onClose={noop} />);
        expect(screen.getByText(/error loading transactions: boom/i)).toBeInTheDocument();
    });

    it('filters out intra-member transfer-out rows and renders member-friendly labels + currency filtering', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const db = createDb(
            {
                isLoading: false,
                error: null,
                data: {
                    familyMembers: [
                        {
                            allowanceEnvelopes: [
                                {
                                    id: 'env-savings',
                                    transactions: [
                                        {
                                            id: 'tx-hidden-transfer-out',
                                            amount: -5,
                                            createdAt: '2026-04-01T10:00:00Z',
                                            currency: 'USD',
                                            transactionType: 'transfer-out',
                                            description: 'Hidden transfer-out row',
                                            sourceEnvelope: { id: 'env-savings', name: 'Savings', familyMember: { id: 'm1', name: 'Alex' } },
                                            destinationEnvelope: { id: 'env-spending', name: 'Spending', familyMember: { id: 'm1', name: 'Alex' } },
                                        },
                                        {
                                            id: 'tx-transfer-in',
                                            amount: 5,
                                            createdAt: '2026-04-01T10:00:01Z',
                                            currency: 'USD',
                                            transactionType: 'transfer-in',
                                            sourceEnvelope: { id: 'env-savings', name: 'Savings', familyMember: { id: 'm1', name: 'Alex' } },
                                            destinationEnvelope: { id: 'env-spending', name: 'Spending', familyMember: { id: 'm1', name: 'Alex' } },
                                        },
                                        {
                                            id: 'tx-deposit',
                                            amount: 12,
                                            createdAt: '2026-04-02T08:30:00Z',
                                            currency: 'USD',
                                            transactionType: 'deposit',
                                            description: 'Allowance bonus',
                                            createdByFamilyMemberId: 'm2',
                                            envelope: { id: 'env-spending', name: 'Spending', familyMember: { id: 'm1', name: 'Alex' } },
                                            sourceEnvelope: { id: 'env-wallet', name: 'Wallet', familyMember: { id: 'm2', name: 'Mom' } },
                                        },
                                        {
                                            id: 'tx-send-person',
                                            amount: -3,
                                            createdAt: '2026-04-03T09:00:00Z',
                                            currency: 'EUR',
                                            transactionType: 'transfer-out-person',
                                            createdBy: 'shared-parent-principal',
                                            sourceEnvelope: { id: 'env-spending', name: 'Spending', familyMember: { id: 'm1', name: 'Alex' } },
                                            destinationEnvelope: { id: 'env-dad', name: 'Dad Savings', familyMember: { id: 'm3', name: 'Dad' } },
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
            {
                isLoading: false,
                error: null,
                data: {
                    familyMembers: [
                        { id: 'm1', name: 'Alex' },
                        { id: 'm2', name: 'Mom' },
                        { id: 'm3', name: 'Dad' },
                    ],
                },
            }
        );

        render(
            <TransactionHistoryView
                db={db}
                mode="member"
                familyMemberId="m1"
                unitDefinitions={[]}
                onClose={onClose}
            />
        );

        expect(screen.getByRole('heading', { name: /member transactions/i })).toBeInTheDocument();
        expect(screen.queryByText('Hidden transfer-out row')).not.toBeInTheDocument();

        expect(screen.getByText('Transfer from Savings to Spending')).toBeInTheDocument();
        expect(screen.getByText('Deposit from Mom Wallet')).toBeInTheDocument();
        expect(screen.getByText('Transfer to Dad')).toBeInTheDocument();

        expect(screen.getByText('Created by Mom')).toBeInTheDocument();
        expect(screen.getByText('Created by Unknown (legacy or shared principal)')).toBeInTheDocument();

        expect(screen.getByText('+USD 12')).toBeInTheDocument();
        expect(screen.getByText('EUR 3')).toBeInTheDocument();

        const currencyFilter = screen.getByRole('combobox');
        await user.selectOptions(currencyFilter, 'EUR');
        expect(screen.queryByText('+USD 12')).not.toBeInTheDocument();
        expect(screen.getByText('Transfer to Dad')).toBeInTheDocument();

        await user.selectOptions(currencyFilter, 'USD');
        expect(screen.getByText('Transfer from Savings to Spending')).toBeInTheDocument();
        expect(screen.queryByText('Transfer to Dad')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /go back/i }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows empty state text in all mode and builds the expected ordered query', () => {
        const db = createDb({
            isLoading: false,
            error: null,
            data: { allowanceTransactions: [] },
        });

        render(<TransactionHistoryView db={db} mode="all" unitDefinitions={[]} onClose={() => {}} />);

        expect(screen.getByRole('heading', { name: /all transactions/i })).toBeInTheDocument();
        expect(screen.getByText(/no transactions found/i)).toBeInTheDocument();

        const [query, options] = db.useQuery.mock.calls[0];
        expect(query).toEqual(
            expect.objectContaining({
                allowanceTransactions: expect.objectContaining({
                    $: expect.objectContaining({
                        order: { serverCreatedAt: 'desc' },
                    }),
                }),
            })
        );
        expect(options).toEqual({ enabled: true });
    });
});
