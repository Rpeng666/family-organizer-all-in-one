// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/currency-utils', () => ({
    formatBalances: (balances: Record<string, number>) =>
        Object.entries(balances)
            .map(([code, amount]) => `${code}:${amount}`)
            .join(', ') || 'Empty',
}));

vi.mock('@/components/ui/popover', () => ({
    Popover: ({ children }: any) => <div>{children}</div>,
    PopoverTrigger: ({ children }: any) => <>{children}</>,
    PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
    DropdownMenuContent: ({ children }: any) => <div data-testid="dropdown-content">{children}</div>,
    DropdownMenuItem: ({ children, onSelect, className, disabled }: any) => (
        <button
            type="button"
            className={className}
            disabled={Boolean(disabled)}
            onClick={() => onSelect?.()}
        >
            {children}
        </button>
    ),
}));

vi.mock('@/components/ui/scroll-area', () => ({
    ScrollArea: ({ children, className }: any) => <div className={className}>{children}</div>,
    ScrollBar: () => null,
}));

import CombinedBalanceDisplay from '@/components/allowance/CombinedBalanceDisplay';

const unitDefinitions = [
    { id: 'usd', code: 'USD', symbol: '$', isMonetary: true },
    { id: 'eur', code: 'EUR', symbol: 'EUR', isMonetary: true },
    { id: 'stars', code: 'STARS', symbol: '⭐', isMonetary: false },
] as any;

describe('CombinedBalanceDisplay', () => {
    it('renders original balances and only monetary balances trigger currency changes', async () => {
        const onCurrencyChange = vi.fn();
        render(
            <CombinedBalanceDisplay
                totalBalances={{ USD: 10, STARS: 5 }}
                unitDefinitions={unitDefinitions}
                isLoading={false}
                showCombinedBalance={false}
                onCurrencyChange={onCurrencyChange}
            />
        );
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'USD:10' }));
        expect(onCurrencyChange).toHaveBeenCalledWith('USD');

        expect(screen.getByText('STARS:5')).toBeInTheDocument();
    });

    it('shows loading combined balance state when rates/calculation are loading', () => {
        render(
            <CombinedBalanceDisplay
                totalBalances={{ USD: 10 }}
                displayCurrency="USD"
                combinedMonetaryValue={null}
                unitDefinitions={unitDefinitions}
                isLoading
                allMonetaryCurrenciesInUse={['USD', 'EUR']}
            />
        );

        expect(screen.getByText(/combined, in/i)).toBeInTheDocument();
        expect(screen.getByText(/calculating/i)).toBeInTheDocument();
    });

    it('renders combined value, non-monetary balances, tooltip breakdown, and supports dropdown currency selection', async () => {
        const onCurrencyChange = vi.fn();
        render(
            <CombinedBalanceDisplay
                totalBalances={{ USD: 10, EUR: 5, STARS: 3 }}
                displayCurrency="USD"
                combinedMonetaryValue={16}
                nonMonetaryBalances={{ STARS: 3 }}
                tooltipLines={['USD:10', 'EUR:5 x 1.2 = USD:6']}
                unitDefinitions={unitDefinitions}
                isLoading={false}
                onCurrencyChange={onCurrencyChange}
                allMonetaryCurrenciesInUse={['USD', 'EUR']}
            />
        );
        const user = userEvent.setup();

        expect(screen.getByText(/combined, in/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'USD:16' })).toBeInTheDocument();
        expect(screen.getAllByText('STARS:3').length).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText('USD:10').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('EUR:5 x 1.2 = USD:6')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /EUR \(EUR\)/i }));
        expect(onCurrencyChange).toHaveBeenCalledWith('EUR');
    });

    it('shows unavailable when combined monetary value is null and not loading', () => {
        render(
            <CombinedBalanceDisplay
                totalBalances={{ USD: 10 }}
                displayCurrency="USD"
                combinedMonetaryValue={null}
                unitDefinitions={unitDefinitions}
                isLoading={false}
                allMonetaryCurrenciesInUse={['USD']}
            />
        );

        expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
    });
});
