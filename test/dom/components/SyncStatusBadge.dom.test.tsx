// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    connectionState: {
        status: 'authenticated',
    },
    useConnectionStatus: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    db: {
        useConnectionStatus: () => mocks.connectionState.status,
    },
}));

import { SyncStatusBadge } from '@/components/SyncStatusBadge';

function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value,
    });
}

describe('SyncStatusBadge', () => {
    beforeEach(() => {
        mocks.connectionState.status = 'authenticated';
        setOnline(true);
    });

    it('renders synced state when online and Instant is authenticated', () => {
        render(<SyncStatusBadge />);

        expect(screen.getByText('Synced')).toBeInTheDocument();
        expect(screen.getByTitle(/Network: online · Instant: authenticated/i)).toBeInTheDocument();
        expect(document.querySelector('.animate-spin')).toBeNull();
    });

    it('renders syncing state with spinner when Instant is connecting/opened', () => {
        mocks.connectionState.status = 'connecting';
        const { rerender, container } = render(<SyncStatusBadge />);

        expect(screen.getByText('Syncing')).toBeInTheDocument();
        expect(container.querySelector('.animate-spin')).toBeTruthy();

        mocks.connectionState.status = 'opened';
        rerender(<SyncStatusBadge />);
        expect(screen.getByText('Syncing')).toBeInTheDocument();
    });

    it('reacts to browser offline/online events', () => {
        const { container } = render(<SyncStatusBadge />);
        expect(screen.getByText('Synced')).toBeInTheDocument();

        setOnline(false);
        fireEvent(window, new Event('offline'));
        expect(screen.getByText('Offline')).toBeInTheDocument();
        expect(screen.getByTitle(/Network: offline/i)).toBeInTheDocument();
        expect(container.querySelector('.animate-spin')).toBeNull();

        setOnline(true);
        fireEvent(window, new Event('online'));
        expect(screen.getByText('Synced')).toBeInTheDocument();
    });

    it('renders reconnecting for non-authenticated non-connecting online statuses', () => {
        mocks.connectionState.status = 'closed';
        const { container } = render(<SyncStatusBadge />);

        expect(screen.getByText('Reconnecting')).toBeInTheDocument();
        expect(container.querySelector('.animate-spin')).toBeTruthy();
    });
});
