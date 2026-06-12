// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    authLogin: vi.fn(),
    signInFamilyMember: vi.fn(),
    toast: vi.fn(),
    instantPrincipalState: {
        canUseCachedParentPrincipal: false,
        isParentSessionSharedDevice: true,
    },
}));

vi.mock('@/components/AuthProvider', () => ({
    useAuth: () => ({
        login: mocks.authLogin,
    }),
}));

vi.mock('@/components/InstantFamilySessionProvider', () => ({
    useInstantPrincipal: () => ({
        signInFamilyMember: mocks.signInFamilyMember,
        canUseCachedParentPrincipal: mocks.instantPrincipalState.canUseCachedParentPrincipal,
        isParentSessionSharedDevice: mocks.instantPrincipalState.isParentSessionSharedDevice,
    }),
}));

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: mocks.toast,
    }),
}));

vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog-root">{children}</div> : null),
    DialogContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
    DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

vi.mock('@/components/ui/checkbox', () => ({
    Checkbox: ({ id, checked, onCheckedChange }: any) => (
        <input
            id={id}
            type="checkbox"
            checked={Boolean(checked)}
            onChange={(event) => onCheckedChange?.(event.target.checked)}
        />
    ),
}));

import { LoginModal } from '@/components/auth/LoginModal';

type FamilyMember = {
    id: string;
    name: string;
    role: 'parent' | 'child';
    hasPin?: boolean;
    photoUrls?: Record<string, string>;
};

async function flushRoster(members: FamilyMember[]) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ familyMembers: members }),
        })
    );
}

function renderLoginModal(options?: {
    members?: FamilyMember[];
    canUseCachedParentPrincipal?: boolean;
    isParentSessionSharedDevice?: boolean;
}) {
    const members = options?.members ?? [];
    mocks.instantPrincipalState.canUseCachedParentPrincipal = options?.canUseCachedParentPrincipal ?? false;
    mocks.instantPrincipalState.isParentSessionSharedDevice = options?.isParentSessionSharedDevice ?? true;

    const onClose = vi.fn();
    render(<LoginModal isOpen onClose={onClose} />);
    return { onClose, members };
}

function setNavigatorOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value,
    });
}

describe('LoginModal', () => {
    beforeEach(() => {
        mocks.authLogin.mockReset();
        mocks.signInFamilyMember.mockReset();
        mocks.toast.mockReset();
        mocks.signInFamilyMember.mockResolvedValue(undefined);
        mocks.instantPrincipalState.canUseCachedParentPrincipal = false;
        mocks.instantPrincipalState.isParentSessionSharedDevice = true;
        setNavigatorOnline(true);
        document.body.style.pointerEvents = '';
    });

    it('renders family member selection and shows parent-specific controls after selecting a parent', async () => {
        await flushRoster([
            { id: 'c1', name: 'Ava', role: 'child', hasPin: true },
            { id: 'p1', name: 'Pat', role: 'parent', hasPin: true },
        ]);
        renderLoginModal();
        const user = userEvent.setup();

        expect(screen.getByText('Who are you?')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: /pat/i })).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /pat/i }));

        expect(screen.getByText(/welcome, pat/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/shared device/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter PIN')).toBeInTheDocument();
    });

    it('logs in a child after server-side sign-in verification and closes the modal', async () => {
        await flushRoster([{ id: 'c1', name: 'Ava', role: 'child', hasPin: true }]);
        const { onClose } = renderLoginModal();
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole('button', { name: /ava/i })).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /ava/i }));
        await user.type(screen.getByPlaceholderText('Enter PIN'), '1234');
        await user.click(screen.getByRole('button', { name: /continue/i }));

        expect(mocks.signInFamilyMember).toHaveBeenCalledWith({
            familyMemberId: 'c1',
            pin: '1234',
            sharedDevice: undefined,
        });
        expect(mocks.authLogin).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'c1', name: 'Ava', role: 'child' }),
            false
        );
        expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/welcome back, ava/i) }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows an offline error instead of attempting parent sign-in when a fresh parent PIN check is required', async () => {
        setNavigatorOnline(false);
        await flushRoster([{ id: 'p1', name: 'Pat', role: 'parent', hasPin: true }]);
        renderLoginModal({
            canUseCachedParentPrincipal: false,
        });
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole('button', { name: /pat/i })).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /pat/i }));
        await user.type(screen.getByPlaceholderText('Enter PIN'), '9999');
        await user.click(screen.getByRole('button', { name: /continue/i }));

        expect(mocks.signInFamilyMember).not.toHaveBeenCalled();
        expect(mocks.toast).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Internet required for parent mode',
                variant: 'destructive',
            })
        );
    });

    it('allows parent login without PIN when cached parent principal can be reused', async () => {
        await flushRoster([{ id: 'p1', name: 'Pat', role: 'parent', hasPin: true }]);
        const { onClose } = renderLoginModal({
            canUseCachedParentPrincipal: true,
        });
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByRole('button', { name: /pat/i })).toBeInTheDocument());
        await user.click(screen.getByRole('button', { name: /pat/i }));
        expect(screen.getByPlaceholderText('PIN optional on this device')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: /continue/i }));

        expect(mocks.signInFamilyMember).toHaveBeenCalledWith({
            familyMemberId: 'p1',
            pin: '',
            sharedDevice: true,
        });
        expect(mocks.authLogin).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'p1', name: 'Pat', role: 'parent' }),
            false
        );
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
