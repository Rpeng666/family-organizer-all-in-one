import { describe, expect, it } from 'vitest';
import {
    getThreadDisplayName,
    getThreadMembersSummary,
    getThreadPreviewText,
    getThreadTypeLabel,
    isParentOverseeingThread,
} from '@/lib/message-thread-display';

const familyMemberNamesById = new Map([
    ['member-1', 'Alex'],
    ['member-2', 'Pat'],
    ['member-3', 'Sam'],
]);

describe('message-thread-display', () => {
    it('uses the other participant as the display name for direct messages', () => {
        const thread = {
            title: 'Alex & Pat',
            threadType: 'direct',
            members: [
                { familyMember: [{ id: 'member-1', name: 'Alex' }] },
                { familyMember: [{ id: 'member-2', name: 'Pat' }] },
            ],
        };

        expect(getThreadDisplayName(thread, familyMemberNamesById, 'member-1')).toBe('Pat');
        expect(getThreadMembersSummary(thread, familyMemberNamesById, 'member-1')).toBe('Direct message with Pat');
        expect(getThreadTypeLabel(thread)).toBe('Direct message');
    });

    it('keeps a custom group title but still exposes its members separately', () => {
        const thread = {
            title: 'Boys',
            threadType: 'group',
            members: [
                { familyMember: [{ id: 'member-1', name: 'Alex' }] },
                { familyMember: [{ id: 'member-3', name: 'Sam' }] },
            ],
            latestMessagePreview: 'Weekend plans',
        };

        expect(getThreadDisplayName(thread, familyMemberNamesById, 'member-2')).toBe('Boys');
        expect(getThreadMembersSummary(thread, familyMemberNamesById, 'member-2')).toBe('Alex, Sam');
        expect(getThreadPreviewText(thread)).toBe('Weekend plans');
        expect(getThreadTypeLabel(thread)).toBe('Group thread');
    });

    it('detects parent-overseen threads by missing membership, not by title', () => {
        expect(isParentOverseeingThread({ membership: null }, 'parent')).toBe(true);
        expect(isParentOverseeingThread({ membership: { id: 'membership-1' } }, 'parent')).toBe(false);
        expect(isParentOverseeingThread({ membership: null }, 'child')).toBe(false);
    });
});
