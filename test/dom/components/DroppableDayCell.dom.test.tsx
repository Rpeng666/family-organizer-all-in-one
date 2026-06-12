// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dndMocks = vi.hoisted(() => ({
    dropTargetForElements: vi.fn(),
    cleanup: vi.fn(),
    lastConfig: null as any,
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
    dropTargetForElements: (config: any) => {
        dndMocks.lastConfig = config;
        dndMocks.dropTargetForElements(config);
        return dndMocks.cleanup;
    },
}));

import { DroppableDayCell } from '@/components/DroppableDayCell';

describe('DroppableDayCell', () => {
    beforeEach(() => {
        dndMocks.dropTargetForElements.mockReset();
        dndMocks.cleanup.mockReset();
        dndMocks.lastConfig = null;
    });

    it('registers as a drop target, exposes day data, and toggles drag-over state', () => {
        const onClick = vi.fn();
        const day = new Date(2026, 3, 2);

        const { unmount } = render(
            <table>
                <tbody>
                    <tr>
                        <DroppableDayCell day={day} dateStr="2026-04-02" className="base-cell" onClick={onClick}>
                            <span>2</span>
                        </DroppableDayCell>
                    </tr>
                </tbody>
            </table>
        );

        expect(dndMocks.dropTargetForElements).toHaveBeenCalledTimes(1);
        expect(dndMocks.lastConfig.getData()).toEqual({ type: 'calendar-day', dateStr: '2026-04-02' });
        expect(dndMocks.lastConfig.canDrop({ source: { data: { type: 'calendar-event' } } })).toBe(true);
        expect(dndMocks.lastConfig.canDrop({ source: { data: { type: 'other' } } })).toBe(false);

        const cell = screen.getByRole('cell');
        const initialClass = cell.className;

        act(() => {
            dndMocks.lastConfig.onDragEnter();
        });
        expect(cell.className).not.toBe(initialClass);

        act(() => {
            dndMocks.lastConfig.onDragLeave();
        });
        expect(cell.className).toBe(initialClass);

        act(() => {
            dndMocks.lastConfig.onDragEnter();
            dndMocks.lastConfig.onDrop();
        });
        expect(cell.className).toBe(initialClass);

        fireEvent.click(cell);
        expect(onClick).toHaveBeenCalledWith(day);

        unmount();
        expect(dndMocks.cleanup).toHaveBeenCalledTimes(1);
    });
});
