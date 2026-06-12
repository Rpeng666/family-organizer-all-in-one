import type { MessageNotificationLevel } from '@/lib/messaging-types';

export type MembershipRow = {
    id: string;
    familyMemberId?: string | null;
    memberRole?: string | null;
    notificationLevel?: MessageNotificationLevel | null;
    isArchived?: boolean | null;
    isPinned?: boolean | null;
    lastReadAt?: string | null;
    threadId?: string | null;
    thread?: any;
};

export type ThreadRecord = {
    id: string;
    title?: string | null;
    threadType?: string | null;
    visibility?: string | null;
    latestMessageAt?: string | null;
    latestMessagePreview?: string | null;
    latestMessageAuthorId?: string | null;
    members?: Array<any>;
    membership?: MembershipRow | null;
};

export type MessageRecord = {
    id: string;
    body?: string | null;
    threadId?: string | null;
    deletedAt?: string | null;
    removedReason?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    editedAt?: string | null;
    editableUntil?: string | null;
    importance?: string | null;
    authorFamilyMemberId?: string | null;
    attachments?: Array<any>;
    author?: Array<{ id?: string; name?: string | null }> | { id?: string; name?: string | null } | null;
    reactions?: Array<{ id: string; emoji?: string | null; familyMember?: Array<{ id?: string; name?: string | null }> | { id?: string; name?: string | null } | null }>;
    acknowledgements?: Array<{ id: string; kind?: string | null; familyMember?: Array<{ id?: string; name?: string | null }> | { id?: string; name?: string | null } | null }>;
    replyTo?: Array<MessageRecord> | MessageRecord | null;
};

export type ReplyPreviewVariant = 'composer' | 'bubble-own' | 'bubble-other';
