// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ open, children }: any) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children }: any) => <div>{children}</div>,
    DialogDescription: ({ children }: any) => <p>{children}</p>,
    DialogFooter: ({ children }: any) => <div>{children}</div>,
    DialogHeader: ({ children }: any) => <div>{children}</div>,
    DialogTitle: ({ children }: any) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, onClick, ...props }: any) => (
        <button type="button" onClick={onClick} {...props}>
            {children}
        </button>
    ),
}));

import { RecurrenceScopeDialog } from '@/components/RecurrenceScopeDialog';

describe('RecurrenceScopeDialog', () => {
    it('uses "All events" wording for original-series edit and move flows', () => {
        render(<RecurrenceScopeDialog open action="drag" scopeMode="all" onSelect={() => {}} />);

        expect(screen.getByRole('heading', { name: 'Move Repeating Event' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'All events' })).toBeInTheDocument();
        expect(screen.getByText(/all events in the series/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'This and following events' })).not.toBeInTheDocument();
    });

    it('uses "This and following events" wording for non-original occurrences', () => {
        render(<RecurrenceScopeDialog open action="edit" scopeMode="following" onSelect={() => {}} />);

        expect(screen.getByRole('heading', { name: 'Edit Repeating Event' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'This and following events' })).toBeInTheDocument();
        expect(screen.getByText(/all following occurrences/i)).toBeInTheDocument();
    });
});
