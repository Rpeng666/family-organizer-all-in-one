// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    authState: {
        currentUser: null as any,
        logout: vi.fn(),
    },
    parentModeState: {
        isParentMode: false,
        isParentSessionSharedDevice: false,
        parentSharedDeviceIdleTimeoutMs: 15 * 60 * 1000,
    },
}));

vi.mock('@/components/AuthProvider', () => ({
    useAuth: () => mocks.authState,
}));

vi.mock('@/components/auth/useParentMode', () => ({
    useParentMode: () => mocks.parentModeState,
}));

vi.mock('@/components/auth/LoginModal', () => ({
    LoginModal: ({ isOpen }: { isOpen: boolean }) => <div data-testid="login-modal">{isOpen ? 'open' : 'closed'}</div>,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
    DropdownMenu: ({ children }: any) => <div>{children}</div>,
    DropdownMenuTrigger: ({ children }: any) => <div>{children}</div>,
    DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
    DropdownMenuItem: ({ children, onClick }: any) => (
        <button type="button" onClick={onClick}>
            {children}
        </button>
    ),
    DropdownMenuLabel: ({ children }: any) => <div>{children}</div>,
    DropdownMenuSeparator: () => <hr />,
}));

import { UserMenu } from '@/components/auth/UserMenu';

describe('UserMenu', () => {
    beforeEach(() => {
        mocks.authState.currentUser = null;
        mocks.authState.logout.mockReset();
        mocks.parentModeState.isParentMode = false;
        mocks.parentModeState.isParentSessionSharedDevice = false;
        mocks.parentModeState.parentSharedDeviceIdleTimeoutMs = 15 * 60 * 1000;
    });

    it('shows guest login action and opens login modal when clicked', () => {
        render(<UserMenu />);

        expect(screen.getByLabelText(/open login menu/i)).toBeInTheDocument();
        expect(screen.getByText(/guest access/i)).toBeInTheDocument();
        expect(screen.getByTestId('login-modal')).toHaveTextContent('closed');

        fireEvent.click(screen.getByRole('button', { name: /log in/i }));
        expect(screen.getByTestId('login-modal')).toHaveTextContent('open');
    });

    it('shows current user details and logout action for authenticated users', () => {
        mocks.authState.currentUser = { id: 'c1', name: 'Ava', role: 'child', photoUrls: {} };

        render(<UserMenu />);

        expect(screen.getByLabelText(/open user menu/i)).toBeInTheDocument();
        expect(screen.getByText('Ava')).toBeInTheDocument();
        expect(screen.getByText(/child/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /log out/i }));
        expect(mocks.authState.logout).toHaveBeenCalledTimes(1);
    });

    it('shows parent-mode shared-device status details and opens switch-user modal', () => {
        mocks.authState.currentUser = { id: 'p1', name: 'Pat', role: 'parent', photoUrls: {} };
        mocks.parentModeState.isParentMode = true;
        mocks.parentModeState.isParentSessionSharedDevice = true;
        mocks.parentModeState.parentSharedDeviceIdleTimeoutMs = 20 * 60 * 1000;

        render(<UserMenu />);

        expect(screen.getByText(/parent mode \(shared device\)/i)).toBeInTheDocument();
        expect(screen.getByText(/auto-expires after 20 min idle/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /switch user/i }));
        expect(screen.getByTestId('login-modal')).toHaveTextContent('open');
    });
});
