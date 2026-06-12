export const MESSAGE_THREAD_TYPES = ['family', 'parents_only', 'direct', 'group', 'linked'] as const;
export const MESSAGE_VISIBILITIES = ['family', 'parents_only', 'members'] as const;
export const MESSAGE_IMPORTANCE_LEVELS = ['normal', 'urgent', 'announcement', 'needs_ack'] as const;
export const MESSAGE_NOTIFICATION_LEVELS = ['all', 'mentions', 'mute', 'watch'] as const;
export const MESSAGE_MEMBER_ROLES = ['member', 'owner', 'watcher'] as const;
export const LINKED_THREAD_DOMAINS = ['tasks', 'chores', 'calendar', 'finance'] as const;

export type MessageThreadType = (typeof MESSAGE_THREAD_TYPES)[number];
export type MessageVisibility = (typeof MESSAGE_VISIBILITIES)[number];
export type MessageImportance = (typeof MESSAGE_IMPORTANCE_LEVELS)[number];
export type MessageNotificationLevel = (typeof MESSAGE_NOTIFICATION_LEVELS)[number];
export type MessageMemberRole = (typeof MESSAGE_MEMBER_ROLES)[number];
export type LinkedThreadDomain = (typeof LINKED_THREAD_DOMAINS)[number];

export type UploadedMessageAttachment = {
    id: string;
    name: string;
    url: string;
    type: string;
    kind?: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
    thumbnailUrl?: string | null;
    thumbnailWidth?: number | null;
    thumbnailHeight?: number | null;
    blurhash?: string | null;
    waveformPeaks?: number[] | null;
};

export type CreateThreadRequest = {
    threadType: MessageThreadType;
    participantIds?: string[];
    title?: string;
    linkedDomain?: LinkedThreadDomain;
    linkedEntityId?: string;
};

export type SendMessageRequest = {
    threadId: string;
    body?: string;
    attachments?: UploadedMessageAttachment[];
    replyToMessageId?: string | null;
    importance?: MessageImportance;
    clientNonce?: string | null;
    clientTimestamp?: string | null;
};

export type EditMessageRequest = {
    messageId: string;
    body: string;
};

export type ThreadPreferencesRequest = {
    threadId: string;
    notificationLevel?: MessageNotificationLevel;
    isArchived?: boolean;
    isPinned?: boolean;
};

export type ToggleReactionRequest = {
    messageId: string;
    emoji: string;
};

export type AcknowledgeMessageRequest = {
    messageId: string;
    kind: 'seen' | 'acknowledged';
};

export type MarkReadRequest = {
    threadId: string;
    lastReadMessageId: string;
};
