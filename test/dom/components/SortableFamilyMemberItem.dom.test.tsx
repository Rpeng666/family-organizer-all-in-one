// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dndMocks = vi.hoisted(() => ({
    draggable: vi.fn(),
    dropTargetForElements: vi.fn(),
    draggableCleanup: vi.fn(),
    dropCleanup: vi.fn(),
    draggableConfig: null as any,
    dropConfig: null as any,
    attachClosestEdge: vi.fn((data: any, { input }: any) => ({
        ...data,
        __edge: input?.edge ?? null,
    })),
    extractClosestEdge: vi.fn((data: any) => data?.__edge ?? null),
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
    draggable: (config: any) => {
        dndMocks.draggableConfig = config;
        dndMocks.draggable(config);
        return dndMocks.draggableCleanup;
    },
    dropTargetForElements: (config: any) => {
        dndMocks.dropConfig = config;
        dndMocks.dropTargetForElements(config);
        return dndMocks.dropCleanup;
    },
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box', () => ({
    DropIndicator: ({ edge }: any) => <div data-testid={`drop-indicator-${edge}`}>drop-{edge}</div>,
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge', () => ({
    attachClosestEdge: dndMocks.attachClosestEdge,
    extractClosestEdge: dndMocks.extractClosestEdge,
}));

vi.mock('@/components/allowance/CombinedBalanceDisplay', () => ({
    default: ({ totalBalances }: any) => (
        <div data-testid="combined-balance">
            {Object.entries(totalBalances)
                .map(([currency, amount]) => `${currency}:${amount}`)
                .join(',')}
        </div>
    ),
}));

vi.mock('lucide-react', () => ({
    GripVertical: () => <span>GripVertical</span>,
    Trash2: () => <span>Trash2</span>,
}));

vi.mock('@/components/ui/button', async () => {
    const React = await import('react');
    const Button = React.forwardRef<HTMLButtonElement, any>(function MockButton({ children, ...props }, ref) {
        return (
            <button ref={ref} type={props.type ?? 'button'} {...props}>
                {children}
            </button>
        );
    });
    return { Button };
});

vi.mock('@/components/ui/avatar', () => ({
    Avatar: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    AvatarImage: (props: any) => <img {...props} />,
    AvatarFallback: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@/lib/currency-utils', () => ({
    formatBalances: (balances: Record<string, number>) =>
        Object.entries(balances || {})
            .map(([code, amount]) => `${code} ${amount}`)
            .join(', ') || 'Empty',
}));

import { SortableFamilyMemberItem } from '@/components/SortableFamilyMemberItem';

const baseMember = {
    id: 'member-1',
    name: 'Alex Kid',
    photoUrls: null,
};

function renderItem(overrides: Partial<React.ComponentProps<typeof SortableFamilyMemberItem>> = {}) {
    const props: React.ComponentProps<typeof SortableFamilyMemberItem> = {
        member: baseMember,
        index: 2,
        isEditMode: true,
        selectedMember: 'All',
        setSelectedMember: vi.fn(),
        showBalances: false,
        membersBalances: {},
        unitDefinitions: [],
        onMemberActivate: vi.fn(),
        handleDeleteMember: vi.fn(),
        currentUser: { id: 'parent-1', role: 'parent' },
        xpData: { current: 3, possible: 5 },
        ...overrides,
    };

    return { ...render(<SortableFamilyMemberItem {...props} />), props };
}

describe('SortableFamilyMemberItem', () => {
    beforeEach(() => {
        dndMocks.draggable.mockReset();
        dndMocks.dropTargetForElements.mockReset();
        dndMocks.draggableCleanup.mockReset();
        dndMocks.dropCleanup.mockReset();
        dndMocks.draggableConfig = null;
        dndMocks.dropConfig = null;
        dndMocks.attachClosestEdge.mockClear();
        dndMocks.extractClosestEdge.mockClear();
    });

    it('shows parent controls, registers DnD, and triggers member activation in always-edit mode', () => {
        const { props, unmount } = renderItem({ alwaysEditMode: true });

        expect(dndMocks.draggable).toHaveBeenCalledTimes(1);
        expect(dndMocks.dropTargetForElements).toHaveBeenCalledTimes(1);
        expect(dndMocks.draggableConfig.getInitialData()).toEqual({ memberId: 'member-1', index: 2 });

        const dropData = dndMocks.dropConfig.getData({
            input: { edge: 'top' },
            element: document.createElement('div'),
        });
        expect(dropData).toEqual(expect.objectContaining({ memberId: 'member-1', index: 2, __edge: 'top' }));

        expect(screen.getByRole('button', { name: /reorder alex kid/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /trash2/i })).toBeInTheDocument();
        expect(screen.getByText(/3 xp/i)).toBeInTheDocument();

        act(() => {
            dndMocks.dropConfig.onDrag({ self: { data: { __edge: 'top' } } });
        });
        expect(screen.getByTestId('drop-indicator-top')).toBeInTheDocument();

        act(() => {
            dndMocks.dropConfig.onDrag({ self: { data: { __edge: 'bottom' } } });
        });
        expect(screen.getByTestId('drop-indicator-bottom')).toBeInTheDocument();

        act(() => {
            dndMocks.dropConfig.onDragLeave();
        });
        expect(screen.queryByTestId('drop-indicator-top')).not.toBeInTheDocument();
        expect(screen.queryByTestId('drop-indicator-bottom')).not.toBeInTheDocument();

        const mainButton = screen.getByText('Alex Kid').closest('button') as HTMLButtonElement;
        fireEvent.click(mainButton);
        expect(props.onMemberActivate).toHaveBeenCalledWith(baseMember);

        fireEvent.click(screen.getByRole('button', { name: /trash2/i }));
        expect(props.handleDeleteMember).toHaveBeenCalledWith('member-1');

        unmount();
        expect(dndMocks.draggableCleanup).toHaveBeenCalledTimes(1);
        expect(dndMocks.dropCleanup).toHaveBeenCalledTimes(1);
    });

    it('lets a child activate themself in always-edit mode but hides parent-only delete/reorder controls', () => {
        const { props } = renderItem({
            currentUser: { id: 'member-1', role: 'child' },
            alwaysEditMode: true,
        });

        expect(dndMocks.draggable).not.toHaveBeenCalled();
        expect(dndMocks.dropTargetForElements).not.toHaveBeenCalled();

        const mainButton = screen.getByText('Alex Kid').closest('button') as HTMLButtonElement;
        expect(mainButton).toBeEnabled();

        fireEvent.click(mainButton);
        expect(props.onMemberActivate).toHaveBeenCalledWith(baseMember);

        expect(screen.queryByRole('button', { name: /reorder alex kid/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /trash2/i })).not.toBeInTheDocument();
    });

    it('hides edit/delete controls for a child viewing another member and still supports normal selection outside edit mode', () => {
        const setSelectedMember = vi.fn();
        const { rerender } = render(
            <SortableFamilyMemberItem
                member={baseMember}
                index={0}
                isEditMode={true}
                selectedMember="All"
                setSelectedMember={setSelectedMember}
                showBalances={true}
                membersBalances={{ 'member-1': {} }}
                unitDefinitions={[]}
                onMemberActivate={vi.fn()}
                handleDeleteMember={vi.fn()}
                currentUser={{ id: 'member-2', role: 'child' }}
                xpData={undefined}
            />
        );

        const disabledButton = screen.getByText('Alex Kid').closest('button') as HTMLButtonElement;
        expect(disabledButton).toBeDisabled();
        expect(screen.queryByRole('button', { name: /trash2/i })).not.toBeInTheDocument();
        expect(screen.getByText(/no balance/i)).toBeInTheDocument();

        rerender(
            <SortableFamilyMemberItem
                member={baseMember}
                index={0}
                isEditMode={false}
                selectedMember="All"
                setSelectedMember={setSelectedMember}
                showBalances={true}
                membersBalances={{ 'member-1': { USD: 10 } }}
                unitDefinitions={[]}
                onMemberActivate={vi.fn()}
                handleDeleteMember={vi.fn()}
                currentUser={{ id: 'member-2', role: 'child' }}
                xpData={undefined}
            />
        );

        const mainButton = screen.getByText('Alex Kid').closest('button') as HTMLButtonElement;
        expect(mainButton).toBeEnabled();
        fireEvent.click(mainButton);
        expect(setSelectedMember).toHaveBeenCalledWith('member-1');
        expect(screen.queryByText(/no balance/i)).not.toBeInTheDocument();
        expect(screen.getByText(/10/)).toBeInTheDocument();
    });
});
