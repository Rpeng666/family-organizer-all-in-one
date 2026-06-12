// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Frequency, RRule } from 'rrule';

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

vi.mock('@/components/ui/checkbox', () => ({
    Checkbox: ({ id, checked, onCheckedChange }: any) => (
        <input
            id={id}
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
        />
    ),
}));

import RecurrenceRuleForm from '@/components/RecurrenceRuleForm';

function latestCallArg<T>(fn: ReturnType<typeof vi.fn>): T {
    const calls = fn.mock.calls;
    if (calls.length === 0) {
        throw new Error('Expected at least one call');
    }
    return calls[calls.length - 1][0] as T;
}

describe('RecurrenceRuleForm', () => {
    it('auto-saves "once" as null on initial mount with no initial options', () => {
        const onSave = vi.fn();

        render(<RecurrenceRuleForm onSave={onSave} />);

        expect(onSave).toHaveBeenCalled();
        expect(latestCallArg(onSave)).toBeNull();
    });

    it('builds a weekly rule with sorted weekday selections and clamps interval to 1', async () => {
        const onSave = vi.fn();
        render(<RecurrenceRuleForm onSave={onSave} />);
        const user = userEvent.setup();

        await user.click(screen.getByLabelText('Weekly'));

        fireEvent.change(screen.getByLabelText('Every'), { target: { value: '0' } });
        await user.click(screen.getByLabelText('Wed'));
        await user.click(screen.getByLabelText('Mon'));

        const rule = latestCallArg<{ freq: Frequency; interval?: number; byweekday?: any[] }>(onSave);
        expect(rule.freq).toBe(Frequency.WEEKLY);
        expect(rule.interval).toBe(1);
        expect(rule.byweekday).toBeDefined();
        expect(rule.byweekday?.map((d) => d.toString())).toEqual([RRule.MO.toString(), RRule.WE.toString()]);
    });

    it('builds a monthly rule with sorted month days and clears bymonthday when switching to daily', async () => {
        const onSave = vi.fn();
        render(<RecurrenceRuleForm onSave={onSave} />);
        const user = userEvent.setup();

        await user.click(screen.getByLabelText('Monthly'));
        await user.click(screen.getByLabelText('20'));
        await user.click(screen.getByLabelText('3'));

        const monthlyRule = latestCallArg<{ freq: Frequency; bymonthday?: number[] }>(onSave);
        expect(monthlyRule.freq).toBe(Frequency.MONTHLY);
        expect(monthlyRule.bymonthday).toEqual([3, 20]);

        await user.click(screen.getByLabelText('Daily'));

        const dailyRule = latestCallArg<{ freq: Frequency; bymonthday?: number[] }>(onSave);
        expect(dailyRule.freq).toBe(Frequency.DAILY);
        expect('bymonthday' in dailyRule).toBe(false);
    });
});
