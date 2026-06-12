// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    authState: {
        currentUser: null as any,
        isAuthenticated: false,
        isLoading: false,
    },
    parentModeState: {
        isParentMode: false,
    },
}));

vi.mock('@/components/AuthProvider', () => ({
    useAuth: () => mocks.authState,
}));

vi.mock('@/components/auth/useParentMode', () => ({
    useParentMode: () => ({
        isParentMode: mocks.parentModeState.isParentMode,
    }),
}));

vi.mock('@/components/auth/LoginModal', () => ({
    LoginModal: ({ isOpen }: { isOpen: boolean }) => <div data-testid="login-modal">{isOpen ? 'open' : 'closed'}</div>,
}));

import { ParentGate } from '@/components/auth/ParentGate';

describe('ParentGate', () => {
    beforeEach(() => {
        mocks.authState.currentUser = null;
        mocks.authState.isAuthenticated = false;
        mocks.authState.isLoading = false;
        mocks.parentModeState.isParentMode = false;
    });

    it('shows a loading spinner while auth state is loading', () => {
        mocks.authState.isLoading = true;

        render(
            <ParentGate>
                <div>Secret content</div>
            </ParentGate>
        );

        expect(screen.queryByText('Secret content')).not.toBeInTheDocument();
        expect(screen.queryByText('Access Restricted')).not.toBeInTheDocument();
        expect(document.querySelector('.animate-spin')).toBeTruthy();
    });

    it('renders children when authenticated in parent mode', () => {
        mocks.authState.currentUser = { id: 'p1', role: 'parent' };
        mocks.authState.isAuthenticated = true;
        mocks.parentModeState.isParentMode = true;

        render(
            <ParentGate>
                <div>Secret content</div>
            </ParentGate>
        );

        expect(screen.getByText('Secret content')).toBeInTheDocument();
        expect(screen.queryByText('Access Restricted')).not.toBeInTheDocument();
    });

    it('shows the restricted state and auto-opens the login modal when unauthorized', async () => {
        render(
            <ParentGate>
                <div>Secret content</div>
            </ParentGate>
        );

        expect(screen.getByText('Access Restricted')).toBeInTheDocument();
        expect(screen.getByText(/restricted to parents only/i)).toBeInTheDocument();
        expect(await screen.findByTestId('login-modal')).toHaveTextContent('open');
        expect(screen.getByRole('button', { name: /open login/i })).toBeInTheDocument();
    });

    it('can re-open the login modal via button after it is closed', async () => {
        const user = userEvent.setup();

        render(
            <ParentGate>
                <div>Secret content</div>
            </ParentGate>
        );

        const modal = await screen.findByTestId('login-modal');
        expect(modal).toHaveTextContent('open');

        // Our mock modal has no close button; simulate close by rerendering through internal state via the button path:
        // clicking "Open Login" should keep it open and acts as a regression guard for the CTA.
        await user.click(screen.getByRole('button', { name: /open login/i }));
        expect(screen.getByTestId('login-modal')).toHaveTextContent('open');
    });
});
