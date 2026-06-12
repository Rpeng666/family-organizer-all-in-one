import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { getInstantAdminDb } from '@/lib/instant-admin';
import {
    AcknowledgeMessageRequest,
    CreateThreadRequest,
    EditMessageRequest,
    MarkReadRequest,
    MessageImportance,
    MessageNotificationLevel,
    SendMessageRequest,
    ThreadPreferencesRequest,
    ToggleReactionRequest,
    UploadedMessageAttachment,
} from '@/lib/messaging-types';
import {
    buildHistoryEventTransactions,
    HISTORY_MESSAGE_EDIT_WINDOW_MS,
    HISTORY_MESSAGE_THREAD_FAMILY_ID,
} from '@/lib/history-events';

export const PARENTS_ONLY_THREAD_ID = '00000000-0000-4000-8000-000000000002';

function deterministicUuid(key: string) {
    const hex = createHash('sha256').update(key).digest('hex').slice(0, 32).split('');
    hex[12] = '4';
    hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
    return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20, 32).join('')}`;
}

function getMembershipKey(threadId: string, familyMemberId: string) {
    return `member:${threadId}:${familyMemberId}`;
}

function getReactionKey(messageId: string, familyMemberId: string, emoji: string) {
    return `reaction:${messageId}:${familyMemberId}:${emoji}`;
}

function getAcknowledgementKey(messageId: string, familyMemberId: string, kind: string) {
    return `ack:${messageId}:${familyMemberId}:${kind}`;
}

function normalizeTitle(value?: string | null) {
    return String(value || '')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeSearchText(parts: Array<string | null | undefined>) {
    return parts
        .map((value) => normalizeTitle(value))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function buildDirectThreadKey(participantIds: string[]) {
    return `direct:${participantIds.slice().sort().join(':')}`;
}

function buildLinkedThreadKey(domain: string, entityId: string) {
    return `linked:${domain}:${entityId}`;
}

function createMessagePreview(body: string, attachments: UploadedMessageAttachment[]) {
    const trimmed = normalizeTitle(body);
    if (trimmed) {
        return trimmed.slice(0, 160);
    }
    if (attachments.length === 1) {
        return `Attachment: ${attachments[0].name}`;
    }
    if (attachments.length > 1) {
        return `${attachments.length} attachments`;
    }
    return 'New message';
}

function buildThreadSnapshot(params: {
    id: string;
    title: string;
    threadKey: string;
    threadType: string;
    visibility: string;
    createdByFamilyMemberId?: string | null;
    latestMessageAt?: string | null;
    latestMessageAuthorId?: string | null;
    latestMessagePreview?: string | null;
    linkedDomain?: string | null;
    linkedEntityId?: string | null;
    updatedAt: string;
    participants: any[];
}) {
    return {
        id: params.id,
        title: params.title,
        threadKey: params.threadKey,
        threadType: params.threadType,
        visibility: params.visibility,
        createdByFamilyMemberId: params.createdByFamilyMemberId || null,
        latestMessageAt: params.latestMessageAt || null,
        latestMessageAuthorId: params.latestMessageAuthorId || null,
        latestMessagePreview: params.latestMessagePreview || null,
        linkedDomain: params.linkedDomain || null,
        linkedEntityId: params.linkedEntityId || null,
        updatedAt: params.updatedAt,
        members: params.participants.map((member) => ({
            id: deterministicUuid(getMembershipKey(params.id, member.id)),
            familyMemberId: member.id,
            familyMember: [
                {
                    id: member.id,
                    name: member.name || 'Unknown',
                },
            ],
        })),
    };
}

async function queryFamilyMembers() {
    const adminDb = getInstantAdminDb();
    const data = await adminDb.query({
        familyMembers: {
            $: {
                order: {
                    order: 'asc',
                },
            },
        },
    });
    return (data.familyMembers as any[]) || [];
}

async function getThreadById(threadId: string) {
    const adminDb = getInstantAdminDb();
    const data = await adminDb.query({
        messageThreads: {
            $: {
                where: {
                    id: threadId,
                },
            },
            members: {},
            messages: {},
        },
    });
    return (data.messageThreads as any[])?.[0] || null;
}

async function getThreadByKey(threadKey: string) {
    const adminDb = getInstantAdminDb();
    const data = await adminDb.query({
        messageThreads: {
            $: {
                where: {
                    threadKey,
                },
            },
            members: {},
        },
    });
    return (data.messageThreads as any[])?.[0] || null;
}

async function getThreadMembership(threadId: string, familyMemberId: string) {
    const adminDb = getInstantAdminDb();
    const data = await adminDb.query({
        messageThreadMembers: {
            $: {
                where: {
                    threadId,
                    familyMemberId,
                },
            },
        },
    });
    return (data.messageThreadMembers as any[])?.[0] || null;
}

async function getMessageById(messageId: string) {
    const adminDb = getInstantAdminDb();
    const data = await adminDb.query({
        messages: {
            $: {
                where: {
                    id: messageId,
                },
            },
            thread: {
                members: {},
            },
            author: {},
            attachments: {},
            reactions: {
                familyMember: {},
            },
            acknowledgements: {
                familyMember: {},
            },
            replyTo: {
                author: {},
                attachments: {},
            },
        },
    });
    return (data.messages as any[])?.[0] || null;
}

async function upsertMembershipTransactions(params: {
    threadId: string;
    familyMemberId: string;
    memberRole?: string;
    notificationLevel?: MessageNotificationLevel;
    isArchived?: boolean;
    isPinned?: boolean;
    sortTimestamp?: string;
}) {
    const adminDb = getInstantAdminDb();
    const membershipKey = getMembershipKey(params.threadId, params.familyMemberId);
    const membershipId = deterministicUuid(membershipKey);
    const nowIso = params.sortTimestamp || new Date().toISOString();
    return [
        adminDb.tx.messageThreadMembers[membershipId].update({
            familyMemberId: params.familyMemberId,
            isArchived: params.isArchived ?? false,
            isPinned: params.isPinned ?? false,
            joinedAt: nowIso,
            memberRole: params.memberRole || 'member',
            membershipKey,
            notificationLevel: params.notificationLevel || 'all',
            pinnedAt: params.isPinned ? nowIso : null,
            sortTimestamp: nowIso,
            threadId: params.threadId,
        }),
        adminDb.tx.messageThreads[params.threadId].link({ members: membershipId }),
        adminDb.tx.familyMembers[params.familyMemberId].link({ messageThreadMemberships: membershipId }),
    ];
}

export async function ensureMessagingBootstrap() {
    const adminDb = getInstantAdminDb();
    const familyMembers = await queryFamilyMembers();
    const familyThread = await getThreadById(HISTORY_MESSAGE_THREAD_FAMILY_ID);
    const parentsOnlyThread = await getThreadById(PARENTS_ONLY_THREAD_ID);
    const nowIso = new Date().toISOString();
    const transactions: any[] = [];

    const familyThreadId = familyThread?.id || HISTORY_MESSAGE_THREAD_FAMILY_ID;
    transactions.push(
        adminDb.tx.messageThreads[familyThreadId].update({
            createdAt: familyThread?.createdAt || nowIso,
            createdByFamilyMemberId: familyMembers.find((member: any) => member.role === 'parent')?.id || familyMembers[0]?.id || null,
            isClosed: false,
            latestMessageAt: familyThread?.latestMessageAt || familyThread?.updatedAt || null,
            latestMessageAuthorId: familyThread?.latestMessageAuthorId || null,
            latestMessagePreview: familyThread?.latestMessagePreview || null,
            linkedDomain: null,
            linkedEntityId: null,
            searchText: 'family',
            threadKey: 'family',
            threadType: 'family',
            title: 'Family',
            titleNormalized: 'family',
            updatedAt: familyThread?.updatedAt || nowIso,
            visibility: 'family',
        })
    );

    for (const member of familyMembers) {
        transactions.push(
            ...(await upsertMembershipTransactions({
                threadId: familyThreadId,
                familyMemberId: member.id,
                memberRole: 'member',
                notificationLevel: 'all',
                sortTimestamp: familyThread?.latestMessageAt || familyThread?.updatedAt || nowIso,
            }))
        );
    }

    const parentMembers = familyMembers.filter((member: any) => member.role === 'parent');
    const parentsThreadId = parentsOnlyThread?.id || PARENTS_ONLY_THREAD_ID;
    transactions.push(
        adminDb.tx.messageThreads[parentsThreadId].update({
            createdAt: parentsOnlyThread?.createdAt || nowIso,
            createdByFamilyMemberId: parentMembers[0]?.id || null,
            isClosed: false,
            latestMessageAt: parentsOnlyThread?.latestMessageAt || parentsOnlyThread?.updatedAt || null,
            latestMessageAuthorId: parentsOnlyThread?.latestMessageAuthorId || null,
            latestMessagePreview: parentsOnlyThread?.latestMessagePreview || null,
            linkedDomain: null,
            linkedEntityId: null,
            searchText: 'parents',
            threadKey: 'parents_only',
            threadType: 'parents_only',
            title: 'Parents',
            titleNormalized: 'parents',
            updatedAt: parentsOnlyThread?.updatedAt || nowIso,
            visibility: 'parents_only',
        })
    );

    for (const member of parentMembers) {
        transactions.push(
            ...(await upsertMembershipTransactions({
                threadId: parentsThreadId,
                familyMemberId: member.id,
                memberRole: 'member',
                notificationLevel: 'all',
                sortTimestamp: parentsOnlyThread?.latestMessageAt || parentsOnlyThread?.updatedAt || nowIso,
            }))
        );
    }

    if (transactions.length > 0) {
        await adminDb.transact(transactions);
    }

    const existingFamilyThread = await getThreadById(familyThreadId);
    if (existingFamilyThread?.messages?.length) {
        const backfillTxs = (existingFamilyThread.messages as any[])
            .filter((message) => !message.threadId)
            .map((message) => adminDb.tx.messages[message.id].update({ threadId: familyThreadId }));
        if (backfillTxs.length > 0) {
            await adminDb.transact(backfillTxs);
        }
    }

    return {
        familyThreadId,
        parentsOnlyThreadId: parentsThreadId,
    };
}

function assertAllowedImportance(actor: any, importance: MessageImportance) {
    if (actor.role === 'parent') return;
    if (importance === 'announcement' || importance === 'needs_ack') {
        throw new Error('Only parents can send announcements or acknowledgement requests');
    }
}

function requireThreadMembership(membership: any, familyMemberId: string) {
    if (!membership) {
        throw new Error('You are not a member of this thread');
    }
    return membership;
}

export async function createMessageThread(actor: any, input: CreateThreadRequest) {
    await ensureMessagingBootstrap();
    const adminDb = getInstantAdminDb();
    const familyMembers = await queryFamilyMembers();
    const familyMembersById = new Map(familyMembers.map((member: any) => [member.id, member]));
    const nowIso = new Date().toISOString();
    console.info('[messaging-service] createMessageThread:start', {
        actorId: actor?.id,
        actorRole: actor?.role,
        input,
    });

    if (input.threadType === 'family') {
        const existingThread = await getThreadByKey('family');
        return (
            existingThread ||
            buildThreadSnapshot({
                id: HISTORY_MESSAGE_THREAD_FAMILY_ID,
                title: 'Family',
                threadKey: 'family',
                threadType: 'family',
                visibility: 'family',
                createdByFamilyMemberId: familyMembers.find((member: any) => member.role === 'parent')?.id || familyMembers[0]?.id || null,
                updatedAt: nowIso,
                participants: familyMembers,
            })
        );
    }
    if (input.threadType === 'parents_only') {
        if (actor.role !== 'parent') {
            throw new Error('Only parents can create or open parent-only threads');
        }
        const parents = familyMembers.filter((member: any) => member.role === 'parent');
        const existingThread = await getThreadByKey('parents_only');
        return (
            existingThread ||
            buildThreadSnapshot({
                id: PARENTS_ONLY_THREAD_ID,
                title: 'Parents',
                threadKey: 'parents_only',
                threadType: 'parents_only',
                visibility: 'parents_only',
                createdByFamilyMemberId: parents[0]?.id || null,
                updatedAt: nowIso,
                participants: parents,
            })
        );
    }

    let participantIds = Array.from(
        new Set([actor.id, ...((input.participantIds || []).filter(Boolean) as string[])])
    ).filter((memberId) => familyMembersById.has(memberId));

    if (input.threadType === 'direct' && participantIds.length !== 2) {
        throw new Error('Direct messages require exactly two participants');
    }

    if (input.threadType === 'linked' && participantIds.length < 2) {
        participantIds = Array.from(
            new Set([
                actor.id,
                ...familyMembers
                    .filter((member: any) => member.role === 'parent')
                    .map((member: any) => member.id),
            ])
        ).filter((memberId) => familyMembersById.has(memberId));
    }

    if ((input.threadType === 'group' || input.threadType === 'linked') && participantIds.length < 2) {
        throw new Error('Group conversations require at least two participants');
    }

    let threadKey = '';
    let title = normalizeTitle(input.title);
    let visibility: 'members' | 'parents_only' | 'family' = 'members';

    if (input.threadType === 'direct') {
        threadKey = buildDirectThreadKey(participantIds);
        if (!title) {
            title = participantIds
                .map((memberId) => familyMembersById.get(memberId)?.name || 'Unknown')
                .join(' & ');
        }
    } else if (input.threadType === 'linked') {
        if (!input.linkedDomain || !input.linkedEntityId) {
            throw new Error('linkedDomain and linkedEntityId are required for linked threads');
        }
        threadKey = buildLinkedThreadKey(input.linkedDomain, input.linkedEntityId);
        if (!title) {
            title = 'Discussion';
        }
    } else {
        threadKey = `group:${randomUUID()}`;
        if (!title) {
            title = participantIds
                .map((memberId) => familyMembersById.get(memberId)?.name || 'Unknown')
                .join(', ');
        }
    }

    const existingThread = await getThreadByKey(threadKey);
    if (existingThread) {
        console.info('[messaging-service] createMessageThread:existing', {
            threadId: existingThread.id,
            threadKey,
        });
        return existingThread;
    }

    const threadId = input.threadType === 'linked' ? randomUUID() : randomUUID();
    const transactions: any[] = [
        adminDb.tx.messageThreads[threadId].update({
            createdAt: nowIso,
            createdByFamilyMemberId: actor.id,
            isClosed: false,
            latestMessageAt: null,
            latestMessageAuthorId: null,
            latestMessagePreview: null,
            linkedDomain: input.linkedDomain || null,
            linkedEntityId: input.linkedEntityId || null,
            searchText: normalizeSearchText([title, ...participantIds.map((memberId) => familyMembersById.get(memberId)?.name)]),
            threadKey,
            threadType: input.threadType,
            title,
            titleNormalized: title.toLowerCase(),
            updatedAt: nowIso,
            visibility,
        }),
    ];

    for (const participantId of participantIds) {
        transactions.push(
            ...(await upsertMembershipTransactions({
                threadId,
                familyMemberId: participantId,
                memberRole: participantId === actor.id && input.threadType === 'group' ? 'owner' : 'member',
                notificationLevel: 'all',
                sortTimestamp: nowIso,
            }))
        );
    }

    await adminDb.transact(transactions);
    const snapshot =
        (await getThreadByKey(threadKey)) ||
        buildThreadSnapshot({
            id: threadId,
            title,
            threadKey,
            threadType: input.threadType,
            visibility,
            createdByFamilyMemberId: actor.id,
            linkedDomain: input.linkedDomain || null,
            linkedEntityId: input.linkedEntityId || null,
            updatedAt: nowIso,
            participants: participantIds.map((memberId) => familyMembersById.get(memberId)).filter(Boolean),
        });
    console.info('[messaging-service] createMessageThread:done', {
        threadId: snapshot?.id,
        threadKey,
        participantIds,
    });
    return snapshot;
}

export async function sendThreadMessage(actor: any, input: SendMessageRequest) {
    await ensureMessagingBootstrap();
    const adminDb = getInstantAdminDb();
    const thread = await getThreadById(input.threadId);
    if (!thread) {
        throw new Error('Thread not found');
    }

    const actorMembership = await getThreadMembership(thread.id, actor.id);
    console.info('[messaging-service] sendThreadMessage:membership', {
        actorId: actor?.id,
        threadId: thread?.id,
        membershipId: actorMembership?.id || null,
    });
    requireThreadMembership(actorMembership, actor.id);

    const body = String(input.body || '').trim();
    const attachments = Array.isArray(input.attachments) ? input.attachments : [];
    if (!body && attachments.length === 0) {
        throw new Error('Message body or attachment is required');
    }

    const importance = (input.importance || 'normal') as MessageImportance;
    assertAllowedImportance(actor, importance);

    const nowIso = input.clientTimestamp && !Number.isNaN(new Date(input.clientTimestamp).getTime())
        ? new Date(input.clientTimestamp).toISOString()
        : new Date().toISOString();
    const messageId = randomUUID();
    const transactions: any[] = [
        adminDb.tx.messages[messageId].update({
            authorFamilyMemberId: actor.id,
            body,
            clientNonce: input.clientNonce || null,
            createdAt: nowIso,
            deletedAt: null,
            editableUntil: new Date(Date.now() + HISTORY_MESSAGE_EDIT_WINDOW_MS).toISOString(),
            editedAt: null,
            importance,
            isSystem: false,
            metadata: null,
            removedByFamilyMemberId: null,
            removedReason: null,
            replyToMessageId: input.replyToMessageId || null,
            threadId: thread.id,
            updatedAt: nowIso,
        }),
        adminDb.tx.messageThreads[thread.id].update({
            latestMessageAt: nowIso,
            latestMessageAuthorId: actor.id,
            latestMessagePreview: createMessagePreview(body, attachments),
            updatedAt: nowIso,
        }),
        adminDb.tx.messageThreads[thread.id].link({ messages: messageId }),
        adminDb.tx.familyMembers[actor.id].link({ authoredMessages: messageId }),
    ];

    if (input.replyToMessageId) {
        transactions.push(adminDb.tx.messages[messageId].link({ replyTo: input.replyToMessageId }));
    }

    for (const attachment of attachments) {
        transactions.push(
            adminDb.tx.messageAttachments[attachment.id].update({
                blurhash: attachment.blurhash || null,
                createdAt: nowIso,
                durationSec: attachment.durationSec ?? null,
                height: attachment.height ?? null,
                kind: attachment.kind || null,
                name: attachment.name,
                sizeBytes: attachment.sizeBytes ?? null,
                thumbnailHeight: attachment.thumbnailHeight ?? null,
                thumbnailUrl: attachment.thumbnailUrl || null,
                thumbnailWidth: attachment.thumbnailWidth ?? null,
                type: attachment.type,
                updatedAt: nowIso,
                url: attachment.url,
                waveformPeaks: attachment.waveformPeaks || null,
                width: attachment.width ?? null,
            }),
            adminDb.tx.messages[messageId].link({ attachments: attachment.id })
        );
    }

    for (const membership of thread.members || []) {
        const membershipId = deterministicUuid(getMembershipKey(thread.id, membership.familyMemberId));
        transactions.push(
            adminDb.tx.messageThreadMembers[membershipId].update({
                sortTimestamp: nowIso,
            })
        );
    }

    if (actor.role === 'parent' && importance === 'announcement' && thread.threadKey === 'family') {
        const historyEvent = buildHistoryEventTransactions({
            tx: adminDb.tx,
            createId: () => randomUUID(),
            occurredAt: nowIso,
            domain: 'messages',
            actionType: 'message_announcement',
            summary: `${actor.name} posted an announcement in Family`,
            source: 'manual',
            actorFamilyMemberId: actor.id,
            messageThreadId: thread.id,
            messageId,
            metadata: {
                importance,
                threadType: thread.threadType,
            },
        });
        transactions.push(...historyEvent.transactions);
    }

    await adminDb.transact(transactions);
    const message = await getMessageById(messageId);
    console.info('[messaging-service] sendThreadMessage:done', {
        messageId,
        threadId: thread.id,
        hasMessage: Boolean(message),
    });
    return message;
}

export async function editThreadMessage(actor: any, input: EditMessageRequest) {
    const adminDb = getInstantAdminDb();
    const message = await getMessageById(input.messageId);
    if (!message) {
        throw new Error('Message not found');
    }

    if (message.authorFamilyMemberId !== actor.id) {
        throw new Error('Only the author can edit this message');
    }

    const editableUntilMs = message.editableUntil ? new Date(message.editableUntil).getTime() : 0;
    if (Date.now() > editableUntilMs) {
        throw new Error('This message can no longer be edited');
    }

    const body = String(input.body || '').trim();
    if (!body) {
        throw new Error('Message body is required');
    }

    const nowIso = new Date().toISOString();
    await adminDb.transact([
        adminDb.tx.messages[message.id].update({
            body,
            editedAt: nowIso,
            updatedAt: nowIso,
        }),
    ]);

    return getMessageById(message.id);
}

export async function removeThreadMessage(actor: any, input: { messageId: string; reason?: string | null }) {
    const adminDb = getInstantAdminDb();
    const message = await getMessageById(input.messageId);
    if (!message) {
        throw new Error('Message not found');
    }

    const isAuthor = message.authorFamilyMemberId === actor.id;
    const editableUntilMs = message.editableUntil ? new Date(message.editableUntil).getTime() : 0;
    if (!actor || (!isAuthor && actor.role !== 'parent')) {
        throw new Error('You cannot remove this message');
    }
    if (actor.role !== 'parent' && Date.now() > editableUntilMs) {
        throw new Error('This message can no longer be removed');
    }

    const nowIso = new Date().toISOString();
    const removedReason = normalizeTitle(input.reason) || (actor.role === 'parent' ? 'Removed by parent' : 'Deleted by author');
    await adminDb.transact([
        adminDb.tx.messages[message.id].update({
            body: '',
            deletedAt: nowIso,
            removedByFamilyMemberId: actor.id,
            removedReason,
            updatedAt: nowIso,
        }),
    ]);

    return getMessageById(message.id);
}

export async function toggleMessageReaction(actor: any, input: ToggleReactionRequest) {
    const adminDb = getInstantAdminDb();
    const message = await getMessageById(input.messageId);
    if (!message) {
        throw new Error('Message not found');
    }
    const thread = Array.isArray(message.thread) ? message.thread[0] : message.thread;
    const actorMembership = await getThreadMembership(thread?.id, actor.id);
    requireThreadMembership(actorMembership, actor.id);

    const emoji = normalizeTitle(input.emoji);
    if (!emoji) {
        throw new Error('Emoji is required');
    }

    const reactionKey = getReactionKey(message.id, actor.id, emoji);
    const reactionId = deterministicUuid(reactionKey);
    const existing = (message.reactions || []).find((reaction: any) => reaction.reactionKey === reactionKey);
    if (existing) {
        await adminDb.transact([adminDb.tx.messageReactions[reactionId].delete()]);
        return { active: false, reactionId };
    }

    const nowIso = new Date().toISOString();
    await adminDb.transact([
        adminDb.tx.messageReactions[reactionId].update({
            createdAt: nowIso,
            emoji,
            familyMemberId: actor.id,
            messageId: message.id,
            reactionKey,
        }),
        adminDb.tx.messages[message.id].link({ reactions: reactionId }),
        adminDb.tx.familyMembers[actor.id].link({ messageReactions: reactionId }),
    ]);

    return { active: true, reactionId };
}

export async function acknowledgeMessage(actor: any, input: AcknowledgeMessageRequest) {
    const adminDb = getInstantAdminDb();
    const message = await getMessageById(input.messageId);
    if (!message) {
        throw new Error('Message not found');
    }
    const thread = Array.isArray(message.thread) ? message.thread[0] : message.thread;
    const actorMembership = await getThreadMembership(thread?.id, actor.id);
    requireThreadMembership(actorMembership, actor.id);

    const acknowledgementKey = getAcknowledgementKey(message.id, actor.id, input.kind);
    const acknowledgementId = deterministicUuid(acknowledgementKey);
    const nowIso = new Date().toISOString();
    await adminDb.transact([
        adminDb.tx.messageAcknowledgements[acknowledgementId].update({
            ackKey: acknowledgementKey,
            createdAt: nowIso,
            familyMemberId: actor.id,
            kind: input.kind,
            messageId: message.id,
        }),
        adminDb.tx.messages[message.id].link({ acknowledgements: acknowledgementId }),
        adminDb.tx.familyMembers[actor.id].link({ messageAcknowledgements: acknowledgementId }),
    ]);

    return { acknowledgementId };
}

export async function markThreadRead(actor: any, input: MarkReadRequest) {
    const adminDb = getInstantAdminDb();
    const thread = await getThreadById(input.threadId);
    if (!thread) {
        throw new Error('Thread not found');
    }

    const membership = requireThreadMembership(await getThreadMembership(thread.id, actor.id), actor.id);
    const nowIso = new Date().toISOString();
    await adminDb.transact([
        adminDb.tx.messageThreadMembers[membership.id].update({
            isArchived: false,
            lastReadAt: nowIso,
            lastReadMessageId: input.lastReadMessageId,
            sortTimestamp: thread.latestMessageAt || nowIso,
        }),
    ]);

    return {
        threadId: thread.id,
        lastReadAt: nowIso,
        lastReadMessageId: input.lastReadMessageId,
    };
}

export async function updateThreadPreferences(actor: any, input: ThreadPreferencesRequest) {
    const adminDb = getInstantAdminDb();
    const thread = await getThreadById(input.threadId);
    if (!thread) {
        throw new Error('Thread not found');
    }

    const membership = requireThreadMembership(await getThreadMembership(thread.id, actor.id), actor.id);
    const nowIso = new Date().toISOString();
    await adminDb.transact([
        adminDb.tx.messageThreadMembers[membership.id].update({
            isArchived: typeof input.isArchived === 'boolean' ? input.isArchived : membership.isArchived || false,
            isPinned: typeof input.isPinned === 'boolean' ? input.isPinned : membership.isPinned || false,
            notificationLevel: input.notificationLevel || membership.notificationLevel || 'all',
            pinnedAt:
                typeof input.isPinned === 'boolean'
                    ? input.isPinned
                        ? nowIso
                        : null
                    : membership.pinnedAt || null,
        }),
    ]);

    return getThreadById(thread.id);
}

export async function joinThreadWatchMode(actor: any, input: { threadId: string }) {
    const adminDb = getInstantAdminDb();
    const thread = await getThreadById(input.threadId);
    if (!thread) {
        throw new Error('Thread not found');
    }
    if (actor.role !== 'parent') {
        throw new Error('Only parents can watch other threads');
    }

    const existingMembership = (thread.members || []).find((entry: any) => entry.familyMemberId === actor.id);
    if (!existingMembership) {
        await adminDb.transact(
            await upsertMembershipTransactions({
                threadId: thread.id,
                familyMemberId: actor.id,
                memberRole: 'watcher',
                notificationLevel: 'watch',
                sortTimestamp: thread.latestMessageAt || new Date().toISOString(),
            })
        );
    }

    return getThreadById(thread.id);
}

export async function leaveThreadWatchMode(actor: any, input: { threadId: string }) {
    const adminDb = getInstantAdminDb();
    const thread = await getThreadById(input.threadId);
    if (!thread) {
        throw new Error('Thread not found');
    }
    const membership = await getThreadMembership(thread.id, actor.id);
    if (!membership) {
        return thread;
    }

    if (membership.memberRole === 'watcher') {
        await adminDb.transact([adminDb.tx.messageThreadMembers[membership.id].delete()]);
        return getThreadById(thread.id);
    }

    await adminDb.transact([
        adminDb.tx.messageThreadMembers[membership.id].update({
            isArchived: true,
        }),
    ]);
    return getThreadById(thread.id);
}

export async function upsertPushDevice(actor: any, input: { token: string; platform: string; isEnabled?: boolean }) {
    const adminDb = getInstantAdminDb();
    const nowIso = new Date().toISOString();
    const pushDeviceId = deterministicUuid(`push:${input.token}`);
    await adminDb.transact([
        adminDb.tx.pushDevices[pushDeviceId].update({
            familyMemberId: actor.id,
            isEnabled: input.isEnabled ?? true,
            lastSeenAt: nowIso,
            platform: input.platform,
            token: input.token,
        }),
        adminDb.tx.familyMembers[actor.id].link({ pushDevices: pushDeviceId }),
    ]);

    return {
        token: input.token,
        platform: input.platform,
        isEnabled: input.isEnabled ?? true,
    };
}
