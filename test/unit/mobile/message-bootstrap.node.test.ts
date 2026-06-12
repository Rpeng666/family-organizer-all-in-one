import { describe, expect, it } from 'vitest';
import { shouldBootstrapMessageRepair } from '../../../mobile/src/lib/message-bootstrap.js';

describe('mobile message bootstrap helper', () => {
    it('repairs missing required family threads only when online and not yet attempted', () => {
        expect(
            shouldBootstrapMessageRepair({
                isOnline: true,
                isLoadingThreads: false,
                threads: [],
                currentUserRole: 'child',
                hasAttemptedBootstrap: false,
            }),
        ).toBe(true);

        expect(
            shouldBootstrapMessageRepair({
                isOnline: false,
                isLoadingThreads: false,
                threads: [],
                currentUserRole: 'child',
                hasAttemptedBootstrap: false,
            }),
        ).toBe(false);

        expect(
            shouldBootstrapMessageRepair({
                isOnline: true,
                isLoadingThreads: false,
                threads: [{ threadKey: 'family', threadType: 'family' }],
                currentUserRole: 'child',
                hasAttemptedBootstrap: false,
            }),
        ).toBe(false);
    });

    it('requires the parents thread for parent principals', () => {
        expect(
            shouldBootstrapMessageRepair({
                isOnline: true,
                isLoadingThreads: false,
                threads: [{ threadKey: 'family', threadType: 'family' }],
                currentUserRole: 'parent',
                hasAttemptedBootstrap: false,
            }),
        ).toBe(true);

        expect(
            shouldBootstrapMessageRepair({
                isOnline: true,
                isLoadingThreads: false,
                threads: [
                    { threadKey: 'family', threadType: 'family' },
                    { threadKey: 'parents_only', threadType: 'parents_only' },
                ],
                currentUserRole: 'parent',
                hasAttemptedBootstrap: false,
            }),
        ).toBe(false);
    });
});
