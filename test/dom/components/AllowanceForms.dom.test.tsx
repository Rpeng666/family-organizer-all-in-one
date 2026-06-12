// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    toast: vi.fn(),
}));

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: mocks.toast,
    }),
}));

vi.mock('@/lib/db', () => ({
    db: {},
}));

vi.mock('@instantdb/react', () => ({
    tx: {},
    id: vi.fn(() => 'mock-id'),
}));

vi.mock('@/components/EnvelopeItem', () => ({}));

vi.mock('@/lib/currency-utils', () => ({
    formatBalances: (balances: Record<string, number>) =>
        Object.entries(balances)
            .map(([currency, amount]) => `${currency}:${amount}`)
            .join(', ') || 'Empty',
}));

vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog-root">{children}</div> : null),
    DialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    DialogFooter: ({ children }: any) => <div>{children}</div>,
    DialogClose: ({ children }: any) => <>{children}</>,
}));

vi.mock('@/components/ui/select', async () => {
    const React = await import('react');

    type Option = { value: string; label: string };
    type SelectCtxValue = {
        value?: string;
        onValueChange?: (value: string) => void;
        disabled?: boolean;
        options: Option[];
        registerOption: (option: Option) => () => void;
    };

    const SelectCtx = React.createContext<SelectCtxValue | null>(null);

    function flattenText(node: any): string {
        if (node == null) return '';
        if (typeof node === 'string' || typeof node === 'number') return String(node);
        if (Array.isArray(node)) return node.map(flattenText).join('');
        if (React.isValidElement(node)) return flattenText((node.props as any).children);
        return '';
    }

    const Select = ({ value, onValueChange, disabled, children }: any) => {
        const [options, setOptions] = React.useState<Option[]>([]);

        const registerOption = React.useCallback((option: Option) => {
            setOptions((prev) => (prev.some((o) => o.value === option.value) ? prev : [...prev, option]));
            return () => {
                setOptions((prev) => prev.filter((o) => o.value !== option.value));
            };
        }, []);

        return (
            <SelectCtx.Provider value={{ value, onValueChange, disabled, options, registerOption }}>
                <div data-testid="mock-select-wrapper">{children}</div>
            </SelectCtx.Provider>
        );
    };

    const SelectTrigger = (props: any) => {
        const ctx = React.useContext(SelectCtx);
        return (
            <select
                data-testid="mock-select"
                value={ctx?.value ?? ''}
                disabled={Boolean(ctx?.disabled)}
                onChange={(e) => ctx?.onValueChange?.(e.target.value)}
                {...props}
            >
                <option value="" />
                {(ctx?.options ?? []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        );
    };

    const SelectValue = () => null;
    const SelectContent = ({ children }: any) => <>{children}</>;
    const SelectItem = ({ value, children }: any) => {
        const ctx = React.useContext(SelectCtx);
        const label = flattenText(children).trim();
        const registerOption = ctx?.registerOption;

        React.useEffect(() => registerOption?.({ value, label }), [registerOption, value, label]);
        return null;
    };

    return {
        Select,
        SelectTrigger,
        SelectValue,
        SelectContent,
        SelectItem,
    };
});

import TransferFundsForm from '@/components/allowance/TransferFundsForm';
import WithdrawForm from '@/components/allowance/WithdrawForm';
import TransferToPersonForm from '@/components/allowance/TransferToPersonForm';

type Envelope = {
    id: string;
    name: string;
    balances: Record<string, number>;
    isDefault?: boolean | null;
};

function getComboboxes() {
    return screen.getAllByRole('combobox') as HTMLSelectElement[];
}

describe('Allowance Forms', () => {
    beforeEach(() => {
        mocks.toast.mockReset();
    });

    describe('TransferFundsForm', () => {
        it('returns null when closed or source envelope is missing', () => {
            const { rerender, container } = render(
                <TransferFundsForm
                    db={{}}
                    isOpen={false}
                    onClose={vi.fn()}
                    onSubmit={vi.fn()}
                    sourceEnvelopeId="env-1"
                    allEnvelopes={[] as any}
                />
            );
            expect(container).toBeEmptyDOMElement();

            rerender(
                <TransferFundsForm
                    db={{}}
                    isOpen
                    onClose={vi.fn()}
                    onSubmit={vi.fn()}
                    sourceEnvelopeId="missing"
                    allEnvelopes={[{ id: 'env-1', name: 'Savings', balances: { USD: 10 } }] as any}
                />
            );
            expect(container).toBeEmptyDOMElement();
        });

        it('auto-selects the only funded currency and submits a transfer to another envelope', async () => {
            const onSubmit = vi.fn().mockResolvedValue(undefined);
            const user = userEvent.setup();

            render(
                <TransferFundsForm
                    db={{}}
                    isOpen
                    onClose={vi.fn()}
                    onSubmit={onSubmit}
                    sourceEnvelopeId="env-1"
                    allEnvelopes={
                        [
                            { id: 'env-1', name: 'Spending', balances: { USD: 12, PTS: 0 } },
                            { id: 'env-2', name: 'Savings', balances: { USD: 2 } },
                        ] as any
                    }
                />
            );

            const [currencySelect, destinationSelect] = getComboboxes();
            expect(currencySelect.value).toBe('USD');

            await user.type(screen.getByLabelText('Amount'), '5');
            await user.selectOptions(destinationSelect, 'env-2');
            await user.click(screen.getByRole('button', { name: /confirm transfer/i }));

            expect(onSubmit).toHaveBeenCalledWith(5, 'USD', 'env-2');
        });

        it('shows an insufficient funds validation toast before submit', async () => {
            const onSubmit = vi.fn().mockResolvedValue(undefined);
            const user = userEvent.setup();

            render(
                <TransferFundsForm
                    db={{}}
                    isOpen
                    onClose={vi.fn()}
                    onSubmit={onSubmit}
                    sourceEnvelopeId="env-1"
                    allEnvelopes={
                        [
                            { id: 'env-1', name: 'Spending', balances: { USD: 3 } },
                            { id: 'env-2', name: 'Savings', balances: { USD: 0 } },
                        ] as any
                    }
                />
            );

            const [, destinationSelect] = getComboboxes();
            await user.type(screen.getByLabelText('Amount'), '10');
            await user.selectOptions(destinationSelect, 'env-2');
            await user.click(screen.getByRole('button', { name: /confirm transfer/i }));

            expect(onSubmit).not.toHaveBeenCalled();
            expect(mocks.toast).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Validation Error',
                    description: expect.stringMatching(/insufficient funds/i),
                    variant: 'destructive',
                })
            );
        });
    });

    describe('WithdrawForm', () => {
        it('shows an empty-state message when the member has no envelopes', () => {
            render(
                <WithdrawForm
                    db={{}}
                    isOpen
                    onClose={vi.fn()}
                    onSubmit={vi.fn()}
                    memberEnvelopes={[] as any}
                    unitDefinitions={[] as any}
                />
            );

            expect(screen.getByText(/you need at least one envelope to withdraw funds/i)).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /confirm withdraw/i })).not.toBeInTheDocument();
        });

        it('submits a withdrawal with a trimmed optional description', async () => {
            const onSubmit = vi.fn().mockResolvedValue(undefined);
            const user = userEvent.setup();

            render(
                <WithdrawForm
                    db={{}}
                    isOpen
                    onClose={vi.fn()}
                    onSubmit={onSubmit}
                    memberEnvelopes={
                        [
                            { id: 'env-1', name: 'Cash', balances: { USD: 20, PTS: 0 } },
                            { id: 'env-2', name: 'Savings', balances: { USD: 5 } },
                        ] as any
                    }
                    unitDefinitions={[] as any}
                />
            );

            const [envelopeSelect, currencySelect] = getComboboxes();
            expect(currencySelect).toBeDisabled();

            await user.selectOptions(envelopeSelect, 'env-1');
            expect(currencySelect).toBeEnabled();
            await user.selectOptions(currencySelect, 'USD');

            const amountInput = screen.getByLabelText('Amount') as HTMLInputElement;
            expect(amountInput.max).toBe('20');
            await user.type(amountInput, '7.5');
            await user.type(screen.getByLabelText(/description \(optional\)/i), '  Cash for snacks  ');

            await user.click(screen.getByRole('button', { name: /confirm withdraw/i }));

            expect(onSubmit).toHaveBeenCalledWith('env-1', 7.5, 'USD', 'Cash for snacks');
        });
    });

    describe('TransferToPersonForm', () => {
        function makeDb(useQueryImpl?: any) {
            const cache = new Map<string, any>();
            return {
                useQuery: vi.fn((query: any, opts: any) => {
                    const requestedId = query?.familyMembers?.$?.where?.id ?? null;
                    const enabled = Boolean(opts?.enabled);
                    const cacheKey = JSON.stringify({ requestedId, enabled });
                    if (!cache.has(cacheKey)) {
                        cache.set(
                            cacheKey,
                            useQueryImpl ? useQueryImpl(query, opts) : { isLoading: false, error: null, data: { familyMembers: [] } }
                        );
                    }
                    return cache.get(cacheKey);
                }),
            };
        }

        const allFamilyMembers = [
            { id: 'm1', name: 'Alex' },
            { id: 'm2', name: 'Bri' },
            { id: 'm3', name: 'Casey' },
        ];

        const sourceEnvelopes: Envelope[] = [
            { id: 'src-1', name: 'Spending', balances: { USD: 25 } },
            { id: 'src-2', name: 'Fun', balances: { PTS: 40 } },
        ];

        it('loads the recipient default envelope and submits a person-to-person transfer', async () => {
            const onSubmit = vi.fn().mockResolvedValue(undefined);
            const user = userEvent.setup();

            const db = makeDb((query: any) => {
                const requestedId = query?.familyMembers?.$?.where?.id;
                if (requestedId === 'm2') {
                    return {
                        isLoading: false,
                        error: null,
                        data: {
                            familyMembers: [
                                {
                                    id: 'm2',
                                    allowanceEnvelopes: [
                                        { id: 'dest-1', name: 'Main', balances: { USD: 5 }, isDefault: true },
                                        { id: 'dest-2', name: 'Extra', balances: { USD: 0 }, isDefault: false },
                                    ],
                                },
                            ],
                        },
                    };
                }
                return { isLoading: false, error: null, data: { familyMembers: [] } };
            });

            render(
                <TransferToPersonForm
                    db={db as any}
                    isOpen
                    onClose={vi.fn()}
                    onSubmit={onSubmit}
                    sourceMemberId="m1"
                    allFamilyMembers={allFamilyMembers as any}
                    sourceMemberEnvelopes={sourceEnvelopes as any}
                    unitDefinitions={[] as any}
                />
            );

            let [destMemberSelect, sourceEnvelopeSelect, currencySelect] = getComboboxes();
            expect(destMemberSelect).toBeEnabled();
            expect(sourceEnvelopeSelect).toBeDisabled();
            expect(currencySelect).toBeDisabled();

            await user.selectOptions(destMemberSelect, 'm2');

            [destMemberSelect, sourceEnvelopeSelect, currencySelect] = getComboboxes();
            expect(sourceEnvelopeSelect).toBeEnabled();
            await user.selectOptions(sourceEnvelopeSelect, 'src-1');
            await user.selectOptions(currencySelect, 'USD');
            await user.type(screen.getByLabelText('Amount'), '10');
            await user.type(screen.getByLabelText(/description \(optional\)/i), '  For pizza  ');

            const submitButton = screen.getByRole('button', { name: /confirm transfer/i });
            expect(submitButton).toBeEnabled();
            await user.click(submitButton);

            expect(onSubmit).toHaveBeenCalledTimes(1);
            expect(onSubmit).toHaveBeenCalledWith(
                'src-1',
                expect.objectContaining({ id: 'dest-1', isDefault: true }),
                10,
                'USD',
                'For pizza'
            );
        });

        it('warns and disables submit when recipient has no default envelope', async () => {
            const onSubmit = vi.fn().mockResolvedValue(undefined);
            const user = userEvent.setup();

            const db = makeDb((query: any) => {
                const requestedId = query?.familyMembers?.$?.where?.id;
                if (requestedId === 'm3') {
                    return {
                        isLoading: false,
                        error: null,
                        data: {
                            familyMembers: [
                                {
                                    id: 'm3',
                                    allowanceEnvelopes: [{ id: 'dest-x', name: 'No Default', balances: { USD: 1 }, isDefault: false }],
                                },
                            ],
                        },
                    };
                }
                return { isLoading: false, error: null, data: { familyMembers: [] } };
            });

            render(
                <TransferToPersonForm
                    db={db as any}
                    isOpen
                    onClose={vi.fn()}
                    onSubmit={onSubmit}
                    sourceMemberId="m1"
                    allFamilyMembers={allFamilyMembers as any}
                    sourceMemberEnvelopes={sourceEnvelopes as any}
                    unitDefinitions={[] as any}
                />
            );

            const [destMemberSelect] = getComboboxes();
            await user.selectOptions(destMemberSelect, 'm3');

            expect(screen.getByText(/recipient does not have a default envelope set/i)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /confirm transfer/i })).toBeDisabled();
            expect(mocks.toast).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Error',
                    description: expect.stringMatching(/none marked as default/i),
                    variant: 'destructive',
                })
            );
            expect(onSubmit).not.toHaveBeenCalled();
        });
    });
});
