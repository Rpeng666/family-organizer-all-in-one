// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    pathname: '/calendar',
    push: vi.fn(),
    resizeObservers: [] as Array<{ callback: ResizeObserverCallback }>,
}));

vi.mock('next/navigation', () => ({
    usePathname: () => mocks.pathname,
    useRouter: () => ({
        push: mocks.push,
    }),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children, onSelect, ...props }: any) => (
        <button
            type="button"
            onClick={() => onSelect?.()}
            {...props}
        >
            {children}
        </button>
    ),
}));

import { MainNav } from '@/components/MainNav';

describe('MainNav', () => {
    const originalResizeObserver = global.ResizeObserver;
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

    const widthByTestId: Record<string, number> = {
        'main-nav-measure-dashboard': 96,
        'main-nav-measure-chores': 82,
        'main-nav-measure-countdown': 102,
        'main-nav-measure-tasks': 78,
        'main-nav-measure-task-series': 108,
        'main-nav-measure-calendar': 92,
        'main-nav-measure-messages': 98,
        'main-nav-measure-finance': 84,
        'main-nav-measure-allowance-distribution': 162,
        'main-nav-measure-content': 86,
        'main-nav-measure-history': 88,
        'main-nav-measure-settings': 88,
        'main-nav-measure-trigger': 36,
    };

    const triggerResizeObservers = () => {
        mocks.resizeObservers.forEach(({ callback }) => {
            callback([], {} as ResizeObserver);
        });
    };

    beforeEach(() => {
        mocks.pathname = '/calendar';
        mocks.push.mockReset();
        mocks.resizeObservers = [];

        class MockResizeObserver {
            callback: ResizeObserverCallback;

            constructor(callback: ResizeObserverCallback) {
                this.callback = callback;
                mocks.resizeObservers.push({ callback });
            }

            observe() {}

            disconnect() {}

            unobserve() {}
        }

        global.ResizeObserver = MockResizeObserver as typeof ResizeObserver;
        HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
            const testId = this.getAttribute('data-testid') || '';
            const width = widthByTestId[testId] ?? 0;
            return {
                width,
                height: 36,
                top: 0,
                left: 0,
                right: width,
                bottom: 36,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            } as DOMRect;
        };
    });

    afterEach(() => {
        global.ResizeObserver = originalResizeObserver;
        HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    });

    it('shows all links inline when there is enough horizontal space', () => {
        render(<MainNav />);

        const container = screen.getByTestId('main-nav-container');
        Object.defineProperty(container, 'clientWidth', {
            configurable: true,
            value: 1400,
        });

        act(() => {
            triggerResizeObservers();
        });

        expect(screen.getByTestId('main-nav-link-dashboard')).toBeInTheDocument();
        expect(screen.getByTestId('main-nav-link-task-series')).toBeInTheDocument();
        expect(screen.getByTestId('main-nav-link-settings')).toBeInTheDocument();
        expect(screen.queryByTestId('main-nav-overflow-trigger')).toBeNull();
    });

    it('keeps the leftmost links visible and moves only the overflowing tail into the hamburger menu', () => {
        render(<MainNav />);

        const container = screen.getByTestId('main-nav-container');
        Object.defineProperty(container, 'clientWidth', {
            configurable: true,
            value: 360,
        });

        act(() => {
            triggerResizeObservers();
        });

        expect(screen.getByTestId('main-nav-link-dashboard')).toBeInTheDocument();
        expect(screen.getByTestId('main-nav-link-chores')).toBeInTheDocument();
        expect(screen.getByTestId('main-nav-link-countdown')).toBeInTheDocument();
        expect(screen.queryByTestId('main-nav-link-tasks')).toBeNull();
        expect(screen.getByTestId('main-nav-overflow-trigger')).toBeInTheDocument();
        expect(screen.getByTestId('main-nav-overflow-item-tasks')).toBeInTheDocument();
        expect(screen.getByTestId('main-nav-overflow-item-task-series')).toBeInTheDocument();
        expect(screen.getByTestId('main-nav-overflow-item-settings')).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('main-nav-overflow-item-task-series'));
        expect(mocks.push).toHaveBeenCalledWith('/task-series');
    });
});
