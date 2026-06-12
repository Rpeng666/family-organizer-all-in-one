// @vitest-environment jsdom

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { freezeTime } from '@/test/utils/fake-clock';

import NavbarDate from '@/components/NavbarDate';

describe('NavbarDate', () => {
    beforeEach(() => {
        freezeTime(new Date('2031-07-04T15:30:00Z'));
    });

    it('renders nothing before the client effect runs, then shows the formatted current date', async () => {
        const { container } = render(<NavbarDate />);

        // The first render may be null before the effect sets state.
        await act(async () => {
            await Promise.resolve();
        });

        expect(container.querySelector('span')).toBeTruthy();
        expect(screen.getByText(/2031/)).toBeInTheDocument();
        expect(screen.getByText(/july/i)).toBeInTheDocument();
        expect(screen.getByText(/4/)).toBeInTheDocument();
    });
});
