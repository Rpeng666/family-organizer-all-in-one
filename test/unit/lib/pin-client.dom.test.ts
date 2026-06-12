// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { hashPinClient } from '@/lib/pin-client';

describe('hashPinClient', () => {
    it('returns a SHA-256 hex digest', async () => {
        await expect(hashPinClient('1234')).resolves.toBe('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');
    });
});
