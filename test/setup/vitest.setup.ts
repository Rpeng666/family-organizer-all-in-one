import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

vi.mock('server-only', () => ({}));
process.env.NEXT_PUBLIC_INSTANT_APP_ID ||= '00000000-0000-0000-0000-000000000000';

beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
    }
});

afterEach(() => {
    if (typeof document !== 'undefined') {
        cleanup();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
});
