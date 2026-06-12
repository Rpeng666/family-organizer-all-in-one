// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const timeMachineMocks = vi.hoisted(() => ({
    initTimeMachine: vi.fn(),
    getTimeOffset: vi.fn(() => 0),
    enableTimeTravel: vi.fn(),
    disableTimeTravel: vi.fn(),
}));

vi.mock('@/lib/time-machine', () => ({
    initTimeMachine: timeMachineMocks.initTimeMachine,
    getTimeOffset: timeMachineMocks.getTimeOffset,
    enableTimeTravel: timeMachineMocks.enableTimeTravel,
    disableTimeTravel: timeMachineMocks.disableTimeTravel,
}));

import DebugTimeWidget from '@/components/debug/DebugTimeWidget';

function getDateTimeInput(): HTMLInputElement {
    const input = document.querySelector('input[type="datetime-local"]');
    if (!(input instanceof HTMLInputElement)) {
        throw new Error('Expected datetime-local input');
    }
    return input;
}

describe('DebugTimeWidget', () => {
    beforeEach(() => {
        timeMachineMocks.initTimeMachine.mockReset();
        timeMachineMocks.getTimeOffset.mockReset();
        timeMachineMocks.enableTimeTravel.mockReset();
        timeMachineMocks.disableTimeTravel.mockReset();
        timeMachineMocks.getTimeOffset.mockReturnValue(0);
    });

    it('initializes the time machine on mount and renders launcher in non-production mode', async () => {
        render(<DebugTimeWidget />);

        expect(timeMachineMocks.initTimeMachine).toHaveBeenCalledTimes(1);
        expect(timeMachineMocks.getTimeOffset).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: /open time machine/i })).toBeInTheDocument();
    });

    it('opens the panel, lets users jump days, and submits travel target', async () => {
        render(<DebugTimeWidget />);
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: /open time machine/i }));

        const datetime = getDateTimeInput();
        expect(datetime.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

        await user.clear(datetime);
        await user.type(datetime, '2026-01-10T09:30');

        const jumpDaysInput = document.querySelector('input[type="number"]') as HTMLInputElement;
        expect(jumpDaysInput).toBeTruthy();
        fireEvent.change(jumpDaysInput, { target: { value: '2' } });

        await user.click(screen.getByRole('button', { name: /^fwd$/i }));
        expect(datetime.value).toBe('2026-01-12T09:30');

        await user.click(screen.getByRole('button', { name: /travel/i }));

        expect(timeMachineMocks.enableTimeTravel).toHaveBeenCalledTimes(1);
        const [targetDate] = timeMachineMocks.enableTimeTravel.mock.calls[0];
        expect(targetDate).toBeInstanceOf(Date);
        expect(targetDate.getFullYear()).toBe(2026);
        expect(targetDate.getMonth()).toBe(0);
        expect(targetDate.getDate()).toBe(12);
        expect(targetDate.getHours()).toBe(9);
        expect(targetDate.getMinutes()).toBe(30);
    });

    it('shows reset controls when simulation is active and can reset', async () => {
        timeMachineMocks.getTimeOffset.mockReturnValue(60_000);
        render(<DebugTimeWidget />);
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: /open time machine/i }));

        expect(screen.getByText(/simulation active/i)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /reset to real time/i }));

        expect(timeMachineMocks.disableTimeTravel).toHaveBeenCalledTimes(1);
    });

    it('renders nothing in production mode', () => {
        vi.stubEnv('NODE_ENV', 'production');

        const { container } = render(<DebugTimeWidget />);

        expect(container).toBeEmptyDOMElement();
        expect(timeMachineMocks.initTimeMachine).toHaveBeenCalledTimes(1);
    });
});
