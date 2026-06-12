import { describe, expect, it } from 'vitest';
import {
    countUnreadThreadMemberships,
    findUnreadMembershipsForMember,
    isMembershipUnread,
} from '../../../mobile/src/lib/message-memberships.js';

describe('mobile message membership helpers', () => {
    it('treats sortTimestamp newer than lastReadAt as unread', () => {
        expect(
            isMembershipUnread({
                sortTimestamp: '2026-03-22T10:00:00.000Z',
                lastReadAt: '2026-03-22T09:00:00.000Z',
            }),
        ).toBe(true);
        expect(
            isMembershipUnread({
                sortTimestamp: '2026-03-22T09:00:00.000Z',
                lastReadAt: '2026-03-22T10:00:00.000Z',
            }),
        ).toBe(false);
    });

    it('ignores archived memberships and supports member-specific filtering', () => {
        const memberships = [
            {
                threadId: 'a',
                familyMemberId: 'kid-1',
                sortTimestamp: '2026-03-22T10:00:00.000Z',
                lastReadAt: '2026-03-22T09:00:00.000Z',
                isArchived: false,
            },
            {
                threadId: 'b',
                familyMemberId: 'kid-1',
                sortTimestamp: '2026-03-22T10:00:00.000Z',
                lastReadAt: '2026-03-22T09:00:00.000Z',
                isArchived: true,
            },
            {
                threadId: 'c',
                familyMemberId: 'kid-2',
                sortTimestamp: '2026-03-22T10:00:00.000Z',
                lastReadAt: '2026-03-22T09:00:00.000Z',
                isArchived: false,
            },
        ];

        expect(countUnreadThreadMemberships(memberships)).toBe(2);
        expect(findUnreadMembershipsForMember(memberships, 'kid-1').map((membership) => membership.threadId)).toEqual(['a']);
    });
});
