import type { MessageRecord, ThreadRecord } from './message-types';

export function formatMessageTime(value?: string | null) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

export function getAuthorName(message: MessageRecord, familyMemberNamesById: Map<string, string>) {
    if (Array.isArray(message.author) && message.author[0]?.name) {
        return message.author[0].name || 'Unknown';
    }
    if (message.author && !Array.isArray(message.author) && message.author.name) {
        return message.author.name || 'Unknown';
    }
    if (message.authorFamilyMemberId) {
        return familyMemberNamesById.get(message.authorFamilyMemberId) || 'Unknown';
    }
    return 'Unknown';
}

export function getReplyToMessage(replyTo: MessageRecord['replyTo']) {
    if (!replyTo) return null;
    if (Array.isArray(replyTo)) return replyTo[0] || null;
    return replyTo || null;
}

export function getReplyPreviewText(message: MessageRecord) {
    if (message.deletedAt) {
        return message.removedReason || 'Original message removed';
    }
    const body = String(message.body || '').trim();
    if (body) return body;
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    if (attachments.length === 1) {
        return `Attachment: ${attachments[0]?.name || 'Attachment'}`;
    }
    if (attachments.length > 1) {
        return `${attachments.length} attachments`;
    }
    return 'Message';
}

export function isThreadUnread(thread: ThreadRecord) {
    const latest = thread.latestMessageAt ? new Date(thread.latestMessageAt).getTime() : 0;
    const readAt = thread.membership?.lastReadAt ? new Date(thread.membership.lastReadAt).getTime() : 0;
    return latest > readAt;
}

export function sortThreads(threads: ThreadRecord[]) {
    return threads.slice().sort((left, right) => {
        const leftPinned = left.membership?.isPinned ? 1 : 0;
        const rightPinned = right.membership?.isPinned ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
        const leftTime = left.latestMessageAt ? new Date(left.latestMessageAt).getTime() : 0;
        const rightTime = right.latestMessageAt ? new Date(right.latestMessageAt).getTime() : 0;
        return rightTime - leftTime;
    });
}

export function getDraftKey(threadId: string | null) {
    return threadId ? `family-organizer.message-draft:${threadId}` : '';
}
