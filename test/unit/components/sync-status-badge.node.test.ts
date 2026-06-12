import { describe, expect, it } from 'vitest';
import { getSyncBadgePresentation } from '@/lib/sync-status';

describe('getBadgePresentation', () => {
    it('maps offline and Instant connection states to user-facing labels', () => {
        expect(getSyncBadgePresentation({ online: false, instantStatus: 'authenticated' }).label).toBe('Offline');
        expect(getSyncBadgePresentation({ online: true, instantStatus: 'authenticated' }).label).toBe('Synced');
        expect(getSyncBadgePresentation({ online: true, instantStatus: 'connecting' }).label).toBe('Syncing');
        expect(getSyncBadgePresentation({ online: true, instantStatus: 'errored' }).label).toBe('Reconnecting');
    });
});
