// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    toast: vi.fn(),
    createAdditionalEnvelope: vi.fn(),
    updateEnvelope: vi.fn(),
    setDefaultEnvelope: vi.fn(),
}));

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: mocks.toast,
    }),
}));

vi.mock('@/components/EnvelopeItem', () => ({}));

vi.mock('@instantdb/react', () => ({
    id: vi.fn(() => 'unused-id'),
    tx: {},
}));

vi.mock('@/lib/currency-utils', () => ({
    createAdditionalEnvelope: mocks.createAdditionalEnvelope,
    updateEnvelope: mocks.updateEnvelope,
    setDefaultEnvelope: mocks.setDefaultEnvelope,
}));

vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog-root">{children}</div> : null),
    DialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    DialogFooter: ({ children }: any) => <div>{children}</div>,
    DialogClose: ({ children }: any) => <>{children}</>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
    AlertDialog: ({ open, children }: any) => (open ? <div data-testid="alert-dialog-root">{children}</div> : null),
    AlertDialogContent: ({ children }: any) => <div>{children}</div>,
    AlertDialogHeader: ({ children }: any) => <div>{children}</div>,
    AlertDialogTitle: ({ children }: any) => <h2>{children}</h2>,
    AlertDialogDescription: ({ children }: any) => <p>{children}</p>,
    AlertDialogFooter: ({ children }: any) => <div>{children}</div>,
    AlertDialogCancel: ({ children, onClick, disabled }: any) => (
        <button type="button" onClick={onClick} disabled={disabled}>
            {children}
        </button>
    ),
    AlertDialogAction: ({ children, onClick, disabled, className }: any) => (
        <button type="button" onClick={onClick} disabled={disabled} className={className}>
            {children}
        </button>
    ),
}));

vi.mock('@/components/ui/switch', () => ({
    Switch: ({ id, checked, onCheckedChange, disabled, 'aria-label': ariaLabel }: any) => (
        <input
            id={id}
            aria-label={ariaLabel}
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            disabled={Boolean(disabled)}
        />
    ),
}));

vi.mock('@/components/ui/select', async () => {
    const React = await import('react');

    type Option = { value: string; label: string };
    type Ctx = {
        value?: string;
        onValueChange?: (value: string) => void;
        disabled?: boolean;
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

    const Select = ({ value, onValueChange, disabled, children }: any) => {
        const [options, setOptions] = React.useState<Option[]>([]);
        const registerOption = React.useCallback((option: Option) => {
            setOptions((prev) => (prev.some((o) => o.value === option.value) ? prev : [...prev, option]));
            return () => setOptions((prev) => prev.filter((o) => o.value !== option.value));
        }, []);
        return <SelectCtx.Provider value={{ value, onValueChange, disabled, options, registerOption }}>{children}</SelectCtx.Provider>;
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
    const SelectItem = ({ value, children, disabled }: any) => {
        const ctx = React.useContext(SelectCtx);
        const registerOption = ctx?.registerOption;
        const label = flattenText(children).trim();
        React.useEffect(() => {
            if (disabled) return;
            return registerOption?.({ value, label });
        }, [registerOption, value, label, disabled]);
        return null;
    };

    return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

import AddEditEnvelopeForm from '@/components/allowance/AddEditEnvelopeForm';
import DeleteEnvelopeDialog from '@/components/allowance/DeleteEnvelopeDialog';

describe('Allowance dialogs', () => {
    beforeEach(() => {
        mocks.toast.mockReset();
        mocks.createAdditionalEnvelope.mockReset();
        mocks.updateEnvelope.mockReset();
        mocks.setDefaultEnvelope.mockReset();
        mocks.createAdditionalEnvelope.mockResolvedValue('env-created');
        mocks.updateEnvelope.mockResolvedValue(undefined);
        mocks.setDefaultEnvelope.mockResolvedValue(undefined);
    });

    describe('AddEditEnvelopeForm', () => {
        const baseProps = {
            db: {},
            isOpen: true,
            onClose: vi.fn(),
            memberId: 'member-1',
            allMemberEnvelopes: [{ id: 'env-a', name: 'Savings', balances: {}, isDefault: true }],
            unitDefinitions: [{ id: 'usd', code: 'USD', symbol: '$', isMonetary: true }],
            allMonetaryCurrenciesInUse: ['USD', 'EUR'],
        } as any;

        it('creates an envelope, trims the name, and sets default when requested', async () => {
            const onClose = vi.fn();
            render(<AddEditEnvelopeForm {...baseProps} onClose={onClose} />);
            const user = userEvent.setup();

            await user.type(screen.getByLabelText(/name/i), '  Travel  ');

            const makeDefault = screen.getByLabelText(/make this the default envelope/i);
            await user.click(makeDefault);

            await user.type(screen.getByLabelText(/savings goal/i), '50');
            const goalCurrencySelect = screen.getAllByRole('combobox')[0];
            expect(goalCurrencySelect).toBeEnabled();
            await user.selectOptions(goalCurrencySelect, 'USD');

            await user.click(screen.getByRole('button', { name: /create envelope/i }));

            expect(mocks.createAdditionalEnvelope).toHaveBeenCalledWith(
                baseProps.db,
                'member-1',
                'Travel',
                true,
                50,
                'USD'
            );
            expect(mocks.setDefaultEnvelope).toHaveBeenCalledWith(
                baseProps.db,
                expect.arrayContaining([expect.objectContaining({ id: 'env-a' }), expect.objectContaining({ id: 'env-created', name: 'Travel' })]),
                'env-created'
            );
            expect(onClose).toHaveBeenCalledTimes(1);
        });

        it('shows a validation toast when a goal amount is set without a currency', async () => {
            render(<AddEditEnvelopeForm {...baseProps} />);
            const user = userEvent.setup();

            await user.type(screen.getByLabelText(/name/i), 'Trip');
            await user.type(screen.getByLabelText(/savings goal/i), '100');
            await user.click(screen.getByRole('button', { name: /create envelope/i }));

            expect(mocks.createAdditionalEnvelope).not.toHaveBeenCalled();
            expect(mocks.toast).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Validation Error',
                    description: expect.stringMatching(/select a goal currency/i),
                    variant: 'destructive',
                })
            );
        });

        it('prevents turning off default while editing the current default envelope', async () => {
            render(
                <AddEditEnvelopeForm
                    {...baseProps}
                    allMemberEnvelopes={[
                        { id: 'env-a', name: 'Savings', balances: {}, isDefault: true },
                        { id: 'env-b', name: 'Spending', balances: {}, isDefault: false },
                    ]}
                    initialData={{ id: 'env-a', name: 'Savings', balances: {}, isDefault: true, goalAmount: null, goalCurrency: null }}
                />
            );
            const user = userEvent.setup();

            const makeDefault = screen.getByLabelText(/make this the default envelope/i) as HTMLInputElement;
            expect(makeDefault.checked).toBe(true);

            await user.click(makeDefault);

            expect((screen.getByLabelText(/make this the default envelope/i) as HTMLInputElement).checked).toBe(true);
            expect(mocks.toast).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Action Needed',
                    description: expect.stringMatching(/change the default/i),
                })
            );
        });

        it('updates an envelope and calls setDefaultEnvelope when making a non-default envelope default in edit mode', async () => {
            const allMemberEnvelopes = [
                { id: 'env-a', name: 'Savings', balances: {}, isDefault: true },
                { id: 'env-b', name: 'Spending', balances: {}, isDefault: false },
            ];
            render(
                <AddEditEnvelopeForm
                    {...baseProps}
                    allMemberEnvelopes={allMemberEnvelopes}
                    initialData={{ id: 'env-b', name: 'Spending', balances: {}, isDefault: false, goalAmount: null, goalCurrency: null }}
                />
            );
            const user = userEvent.setup();

            await user.clear(screen.getByLabelText(/name/i));
            await user.type(screen.getByLabelText(/name/i), 'Spending Updated');
            await user.click(screen.getByLabelText(/make this the default envelope/i));
            await user.click(screen.getByRole('button', { name: /save changes/i }));

            expect(mocks.updateEnvelope).toHaveBeenCalledWith(baseProps.db, 'env-b', 'Spending Updated', true, null, null);
            expect(mocks.setDefaultEnvelope).toHaveBeenCalledWith(baseProps.db, allMemberEnvelopes, 'env-b');
        });
    });

    describe('DeleteEnvelopeDialog', () => {
        const commonProps = {
            db: {},
            isOpen: true,
            onClose: vi.fn(),
            onConfirm: vi.fn().mockResolvedValue(undefined),
        };

        it('closes immediately and toasts when trying to delete the last envelope', () => {
            const onClose = vi.fn();
            render(
                <DeleteEnvelopeDialog
                    {...commonProps}
                    onClose={onClose}
                    envelopeToDelete={{ id: 'env-a', name: 'Only', balances: {}, isDefault: true }}
                    allEnvelopes={[{ id: 'env-a', name: 'Only', balances: {}, isDefault: true }]}
                />
            );

            expect(onClose).toHaveBeenCalledTimes(1);
            expect(mocks.toast).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Error',
                    description: 'Cannot delete the last envelope.',
                    variant: 'destructive',
                })
            );
            expect(screen.queryByTestId('alert-dialog-root')).not.toBeInTheDocument();
        });

        it('requires transfer target and (when deleting default) new default before confirming', async () => {
            const onConfirm = vi.fn().mockResolvedValue(undefined);
            render(
                <DeleteEnvelopeDialog
                    {...commonProps}
                    onConfirm={onConfirm}
                    envelopeToDelete={{ id: 'env-a', name: 'Savings', balances: {}, isDefault: true }}
                    allEnvelopes={[
                        { id: 'env-a', name: 'Savings', balances: {}, isDefault: true },
                        { id: 'env-b', name: 'Spending', balances: {}, isDefault: false },
                    ]}
                />
            );
            const user = userEvent.setup();

            const confirmButton = screen.getByRole('button', { name: /confirm delete/i });
            expect(confirmButton).toBeDisabled();

            const selects = screen.getAllByRole('combobox');
            await user.selectOptions(selects[0], 'env-b');
            expect(confirmButton).toBeDisabled();

            await user.selectOptions(selects[1], 'env-b');
            expect(confirmButton).toBeEnabled();

            await user.click(confirmButton);
            expect(onConfirm).toHaveBeenCalledWith('env-b', 'env-b');
        });

        it('passes null newDefaultId when deleting a non-default envelope', async () => {
            const onConfirm = vi.fn().mockResolvedValue(undefined);
            render(
                <DeleteEnvelopeDialog
                    {...commonProps}
                    onConfirm={onConfirm}
                    envelopeToDelete={{ id: 'env-a', name: 'Spending', balances: {}, isDefault: false }}
                    allEnvelopes={[
                        { id: 'env-a', name: 'Spending', balances: {}, isDefault: false },
                        { id: 'env-b', name: 'Savings', balances: {}, isDefault: true },
                    ]}
                />
            );
            const user = userEvent.setup();

            await user.selectOptions(screen.getByRole('combobox'), 'env-b');
            await user.click(screen.getByRole('button', { name: /confirm delete/i }));

            expect(onConfirm).toHaveBeenCalledWith('env-b', null);
        });

        it('shows a generic error toast when onConfirm rejects', async () => {
            const onConfirm = vi.fn().mockRejectedValue(new Error('boom'));
            render(
                <DeleteEnvelopeDialog
                    {...commonProps}
                    onConfirm={onConfirm}
                    envelopeToDelete={{ id: 'env-a', name: 'Spending', balances: {}, isDefault: false }}
                    allEnvelopes={[
                        { id: 'env-a', name: 'Spending', balances: {}, isDefault: false },
                        { id: 'env-b', name: 'Savings', balances: {}, isDefault: true },
                    ]}
                />
            );
            const user = userEvent.setup();

            await user.selectOptions(screen.getByRole('combobox'), 'env-b');
            await user.click(screen.getByRole('button', { name: /confirm delete/i }));

            expect(mocks.toast).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Error',
                    description: 'Deletion failed for some reason',
                    variant: 'destructive',
                })
            );
        });
    });
});
