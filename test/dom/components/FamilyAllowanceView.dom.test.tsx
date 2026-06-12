// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const queryState = {
        isLoading: false,
        error: null as any,
        data: null as any,
    };

    return {
        queryState,
        familyListProps: null as any,
        memberDetailProps: null as any,
        computeMonetaryCurrencies: vi.fn(() => ['USD', 'EUR']),
    };
});

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@instantdb/react', () => ({
    tx: {},
    id: vi.fn(() => 'generated-id'),
}));

vi.mock('@/lib/db', () => ({
    db: {
        useQuery: () => ({
            isLoading: mocks.queryState.isLoading,
            error: mocks.queryState.error,
            data: mocks.queryState.data,
        }),
    },
}));

vi.mock('@/lib/currency-utils', () => ({
    computeMonetaryCurrencies: (...args: any[]) => (mocks.computeMonetaryCurrencies as any)(...args),
}));

vi.mock('@/components/FamilyMembersList', () => ({
    __esModule: true,
    default: (props: any) => {
        mocks.familyListProps = props;
        return (
            <div data-testid="family-members-list">
                <button type="button" onClick={() => props.setSelectedMember?.('All')}>
                    Select All
                </button>
                {(props.familyMembers ?? []).map((member: any) => (
                    <button key={member.id} type="button" onClick={() => props.setSelectedMember?.(member.id)}>
                        Select {member.name}
                    </button>
                ))}
            </div>
        );
    },
}));

vi.mock('@/components/allowance/MemberAllowanceDetail', () => ({
    __esModule: true,
    default: (props: any) => {
        mocks.memberDetailProps = props;
        return (
            <div data-testid="member-allowance-detail">
                <span>Member Detail for {props.memberId}</span>
            </div>
        );
    },
}));

import FamilyAllowanceView from '@/components/allowance/FamilyAllowanceView';

describe('FamilyAllowanceView', () => {
    beforeEach(() => {
        mocks.queryState.isLoading = false;
        mocks.queryState.error = null;
        mocks.queryState.data = {
            familyMembers: [
                { id: 'm-1', name: 'Alex' },
                { id: 'm-2', name: 'Blair' },
            ],
            allowanceEnvelopes: [
                { id: 'env-1', balances: { USD: 10 } },
                { id: 'env-2', balances: { EUR: 3 } },
            ],
            unitDefinitions: [
                { code: 'USD', isMonetary: true },
                { code: 'EUR', isMonetary: true },
            ],
        };
        mocks.familyListProps = null;
        mocks.memberDetailProps = null;
        mocks.computeMonetaryCurrencies.mockClear();
        mocks.computeMonetaryCurrencies.mockReturnValue(['USD', 'EUR']);
    });

    it('renders loading and error states from the app-level query', () => {
        mocks.queryState.isLoading = true;
        const { rerender } = render(<FamilyAllowanceView />);

        expect(screen.getByText(/loading family members/i)).toBeInTheDocument();

        mocks.queryState.isLoading = false;
        mocks.queryState.error = new Error('boom');
        rerender(<FamilyAllowanceView />);

        expect(screen.getByText(/could not load family members/i)).toBeInTheDocument();
    });

    it('renders the family list with balance mode and shows placeholder before a member is selected', () => {
        render(<FamilyAllowanceView />);

        expect(screen.getByTestId('family-members-list')).toBeInTheDocument();
        expect(screen.getByText(/select a family member to view their allowance details/i)).toBeInTheDocument();
        expect(screen.queryByTestId('member-allowance-detail')).not.toBeInTheDocument();

        expect(mocks.familyListProps).toEqual(
            expect.objectContaining({
                familyMembers: expect.arrayContaining([
                    expect.objectContaining({ id: 'm-1', name: 'Alex' }),
                    expect.objectContaining({ id: 'm-2', name: 'Blair' }),
                ]),
                selectedMember: null,
                showBalances: true,
                unitDefinitions: mocks.queryState.data.unitDefinitions,
            })
        );

        expect(mocks.computeMonetaryCurrencies).toHaveBeenCalledWith(
            mocks.queryState.data.allowanceEnvelopes,
            mocks.queryState.data.unitDefinitions
        );
    });

    it('renders MemberAllowanceDetail with mapped props after selecting a member, and hides it for All', async () => {
        const user = userEvent.setup();
        render(<FamilyAllowanceView />);

        await user.click(screen.getByRole('button', { name: /select blair/i }));

        expect(screen.getByTestId('member-allowance-detail')).toBeInTheDocument();
        expect(screen.getByText(/member detail for m-2/i)).toBeInTheDocument();
        expect(mocks.memberDetailProps).toEqual(
            expect.objectContaining({
                memberId: 'm-2',
                allFamilyMembers: [
                    { id: 'm-1', name: 'Alex' },
                    { id: 'm-2', name: 'Blair' },
                ],
                allMonetaryCurrenciesInUse: ['USD', 'EUR'],
                unitDefinitions: mocks.queryState.data.unitDefinitions,
            })
        );

        await user.click(screen.getByRole('button', { name: /select all/i }));

        expect(screen.queryByTestId('member-allowance-detail')).not.toBeInTheDocument();
        expect(screen.getByText(/select a family member to view their allowance details/i)).toBeInTheDocument();
    });
});

