// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ChoreCalendarView', () => ({
    __esModule: true,
    default: ({ chore }: any) => <div data-testid="chore-calendar-preview">{chore?.title ?? 'preview'}</div>,
}));

vi.mock('@/components/RecurrenceRuleForm', () => ({
    __esModule: true,
    default: () => <div data-testid="recurrence-rule-form-mock">Recurrence Rule Form</div>,
}));

vi.mock('@/components/CurrencySelector', () => ({
    __esModule: true,
    default: ({ value, onChange, currencyOptions, disabled }: any) => (
        <select
            aria-label="Reward Currency"
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={Boolean(disabled)}
        >
            <option value="">Select reward currency...</option>
            {currencyOptions?.map((option: any) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    ),
}));

vi.mock('@/components/ui/switch', () => ({
    Switch: ({ id, checked, onCheckedChange }: any) => (
        <input
            id={id}
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
        />
    ),
}));

vi.mock('@/components/ui/radio-group', async () => {
    const React = await import('react');
    const RadioCtx = React.createContext<{ value?: string; onValueChange?: (value: string) => void } | null>(null);
    return {
        RadioGroup: ({ value, onValueChange, children }: any) => (
            <RadioCtx.Provider value={{ value, onValueChange }}>
                <div>{children}</div>
            </RadioCtx.Provider>
        ),
        RadioGroupItem: ({ id, value }: any) => {
            const ctx = React.useContext(RadioCtx);
            return (
                <input
                    id={id}
                    type="radio"
                    name="mock-radio-group"
                    value={value}
                    checked={ctx?.value === value}
                    onChange={() => ctx?.onValueChange?.(value)}
                />
            );
        },
    };
});

vi.mock('@/components/ui/popover', () => ({
    Popover: ({ children }: any) => <div>{children}</div>,
    PopoverTrigger: ({ asChild, children }: any) => (asChild ? children : <button type="button">{children}</button>),
    PopoverContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
    TooltipProvider: ({ children }: any) => <>{children}</>,
    Tooltip: ({ children }: any) => <>{children}</>,
    TooltipTrigger: ({ asChild, children }: any) => (asChild ? children : <button type="button">{children}</button>),
    TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

import DetailedChoreForm from '@/components/DetailedChoreForm';

type FamilyMember = { id: string; name: string };

const familyMembers: FamilyMember[] = [
    { id: 'm1', name: 'Ava' },
    { id: 'm2', name: 'Ben' },
];

function renderForm(props?: Partial<React.ComponentProps<typeof DetailedChoreForm>>) {
    const onSave = vi.fn();
    render(
        <DetailedChoreForm
            familyMembers={familyMembers as any}
            onSave={onSave}
            initialChore={null}
            initialDate={new Date(Date.UTC(2026, 0, 15))}
            db={{}}
            unitDefinitions={[]}
            currencyOptions={[
                { value: 'USD', label: 'USD' },
                { value: 'PTS', label: 'Points' },
            ]}
            {...props}
        />
    );
    return { onSave };
}

describe('DetailedChoreForm', () => {
    beforeEach(() => {
        vi.stubGlobal('alert', vi.fn());
    });

    it('keeps save disabled until required title and assignee are selected', async () => {
        renderForm();
        const user = userEvent.setup();

        const saveButton = screen.getByRole('button', { name: /save chore/i });
        expect(saveButton).toBeDisabled();
        expect(screen.getByText(/at least one assignee is required/i)).toBeInTheDocument();

        await user.type(screen.getByLabelText('Title *'), 'Load Dishwasher');
        expect(saveButton).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Ava' }));

        expect(saveButton).toBeEnabled();
        expect(screen.getByTestId('chore-calendar-preview')).toBeInTheDocument();
    });

    it('saves an up-for-grabs fixed reward chore and nulls weight/rotation fields', async () => {
        const { onSave } = renderForm();
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('Title *'), 'Feed the Cat');
        await user.click(screen.getByRole('button', { name: 'Ava' }));
        await user.click(screen.getByLabelText(/up for grabs chore/i));

        expect(screen.queryByLabelText(/rotate between selected assignees/i)).not.toBeInTheDocument();

        await user.click(screen.getByLabelText(/fixed amount/i));
        await user.type(screen.getByLabelText(/fixed reward amount/i), '2.50');
        await user.selectOptions(screen.getByRole('combobox', { name: /reward currency/i }), 'USD');

        await user.click(screen.getByRole('button', { name: /save chore/i }));

        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Feed the Cat',
                isUpForGrabs: true,
                isJoint: false,
                rewardType: 'fixed',
                rewardAmount: 2.5,
                rewardCurrency: 'USD',
                weight: null,
                rotationType: 'none',
                assignments: null,
                assignees: [{ id: 'm1' }],
            })
        );
    });

    it('saves rotation order in assignment order and assignee order when rotation is enabled', async () => {
        const { onSave } = renderForm();
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('Title *'), 'Take Out Trash');
        await user.click(screen.getByRole('button', { name: 'Ava' }));
        await user.click(screen.getByRole('button', { name: 'Ben' }));

        expect(screen.getByLabelText(/joint chore/i)).toBeInTheDocument();
        await user.click(screen.getByLabelText(/rotate between selected assignees/i));

        await user.click(screen.getByRole('button', { name: /move ben up/i }));
        await user.click(screen.getByRole('button', { name: /save chore/i }));

        expect(onSave).toHaveBeenCalledTimes(1);
        const payload = onSave.mock.calls[0][0];
        expect(payload.rotationType).toBe('daily');
        expect(payload.assignees).toEqual([{ id: 'm2' }, { id: 'm1' }]);
        expect(payload.assignments).toHaveLength(2);
        expect(payload.assignments.map((a: any) => [a.order, a.familyMember.id])).toEqual([
            [0, 'm2'],
            [1, 'm1'],
        ]);
    });

    it('saves before-marker timing with a single fallback time', async () => {
        const { onSave } = renderForm({
            availableChoreAnchors: [
                { id: 'other-chore', title: 'Wash dishes' },
            ] as any,
        });
        const user = userEvent.setup();

        await user.type(screen.getByLabelText('Title *'), 'Set the Table');
        await user.click(screen.getByRole('button', { name: 'Ava' }));
        await user.click(screen.getByLabelText(/before a routine marker/i));
        await user.selectOptions(screen.getByRole('combobox', { name: /routine marker/i }), 'breakfast');
        await user.type(screen.getByLabelText(/^Fallback Time/), '11:00');

        await user.click(screen.getByRole('button', { name: /save chore/i }));

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                timingMode: 'before_marker',
                timeBucket: null,
                timingConfig: expect.objectContaining({
                    mode: 'before_marker',
                    anchor: expect.objectContaining({
                        sourceType: 'routine',
                        routineKey: 'breakfast',
                        fallbackTime: '11:00',
                    }),
                }),
            })
        );
    });
});
