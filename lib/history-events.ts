export type HistoryDomain = 'tasks' | 'chores' | 'calendar' | 'finance' | 'messages' | 'system';
export type HistorySource = 'manual' | 'apple_sync' | 'system';
export type HistoryFilterMode = 'off' | 'include' | 'exclude';

export interface HistoryAttachmentInput {
    id: string;
    name: string;
    type: string;
    url: string;
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
}

export interface BuildHistoryEventTransactionsParams {
    tx: any;
    createId: () => string;
    occurredAt?: string | null;
    domain: HistoryDomain;
    actionType: string;
    summary: string;
    source?: HistorySource | string | null;
    actorFamilyMemberId?: string | null;
    affectedFamilyMemberIds?: Array<string | null | undefined>;
    metadata?: Record<string, any> | null;
    taskSeriesId?: string | null;
    taskId?: string | null;
    choreId?: string | null;
    calendarItemId?: string | null;
    allowanceTransactionId?: string | null;
    messageThreadId?: string | null;
    messageId?: string | null;
    scheduledForDate?: string | null;
    restoreTiming?: string | null;
    attachments?: HistoryAttachmentInput[];
}

export interface HistoryEventLike {
    id: string;
    domain?: string | null;
    actionType?: string | null;
    source?: string | null;
    summary?: string | null;
    occurredAt?: string | null;
    actorFamilyMemberId?: string | null;
    taskSeriesId?: string | null;
    taskId?: string | null;
    choreId?: string | null;
    calendarItemId?: string | null;
    allowanceTransactionId?: string | null;
    messageThreadId?: string | null;
    messageId?: string | null;
    scheduledForDate?: string | null;
    restoreTiming?: string | null;
    metadata?: Record<string, any> | null;
    actor?: Array<{ id?: string; name?: string | null }> | { id?: string; name?: string | null } | null;
    affectedFamilyMembers?: Array<{ id?: string; name?: string | null }> | null;
    attachments?: HistoryAttachmentLike[] | null;
    message?: Array<MessageLike> | MessageLike | null;
}

export interface HistoryAttachmentLike {
    id: string;
    name?: string | null;
    type?: string | null;
    url?: string | null;
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
}

export interface MessageLike {
    id: string;
    body?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
    editedAt?: string | null;
    authorFamilyMemberId?: string | null;
    author?: Array<{ id?: string; name?: string | null }> | { id?: string; name?: string | null } | null;
    attachments?: HistoryAttachmentLike[] | null;
}

export const HISTORY_DOMAIN_LABELS: Record<HistoryDomain, string> = {
    tasks: 'Tasks',
    chores: 'Chores',
    calendar: 'Calendar',
    finance: 'Finance',
    messages: 'Messages',
    system: 'System',
};

export const HISTORY_SOURCE_APPLE_SYNC = 'apple_sync';
export const HISTORY_ACTOR_APPLE_SYNC = 'apple_sync';
export const HISTORY_MESSAGE_THREAD_FAMILY_ID = '00000000-0000-4000-8000-000000000001';
export const HISTORY_MESSAGE_EDIT_WINDOW_MS = 5 * 60 * 1000;

export function buildHistoryEventTransactions(params: BuildHistoryEventTransactionsParams) {
    const occurredAt = params.occurredAt || new Date().toISOString();
    const eventId = params.createId();
    const transactions: any[] = [
        params.tx.historyEvents[eventId].update({
            actionType: params.actionType,
            actorFamilyMemberId: params.actorFamilyMemberId || null,
            allowanceTransactionId: params.allowanceTransactionId || null,
            calendarItemId: params.calendarItemId || null,
            choreId: params.choreId || null,
            domain: params.domain,
            messageId: params.messageId || null,
            messageThreadId: params.messageThreadId || null,
            metadata: params.metadata || null,
            occurredAt,
            restoreTiming: params.restoreTiming || null,
            scheduledForDate: params.scheduledForDate || null,
            source: params.source || null,
            summary: params.summary,
            taskId: params.taskId || null,
            taskSeriesId: params.taskSeriesId || null,
        }),
    ];

    if (params.actorFamilyMemberId && typeof params.tx.historyEvents?.[eventId]?.link === 'function') {
        transactions.push(params.tx.historyEvents[eventId].link({ actor: params.actorFamilyMemberId }));
    }

    const affectedFamilyMemberIds = Array.from(
        new Set((params.affectedFamilyMemberIds || []).filter((memberId): memberId is string => Boolean(memberId)))
    );
    for (const memberId of affectedFamilyMemberIds) {
        if (typeof params.tx.historyEvents?.[eventId]?.link === 'function') {
            transactions.push(params.tx.historyEvents[eventId].link({ affectedFamilyMembers: memberId }));
        }
    }

    if (params.messageId && typeof params.tx.historyEvents?.[eventId]?.link === 'function') {
        transactions.push(params.tx.historyEvents[eventId].link({ message: params.messageId }));
    }

    for (const attachment of params.attachments || []) {
        if (typeof params.tx.historyEventAttachments?.[attachment.id]?.update === 'function') {
            transactions.push(
                params.tx.historyEventAttachments[attachment.id].update({
                    blurhash: attachment.blurhash || null,
                    createdAt: occurredAt,
                    durationSec: attachment.durationSec ?? null,
                    height: attachment.height ?? null,
                    kind: attachment.kind || null,
                    name: attachment.name,
                    sizeBytes: attachment.sizeBytes ?? null,
                    thumbnailHeight: attachment.thumbnailHeight ?? null,
                    thumbnailUrl: attachment.thumbnailUrl || null,
                    thumbnailWidth: attachment.thumbnailWidth ?? null,
                    type: attachment.type,
                    updatedAt: occurredAt,
                    url: attachment.url,
                    waveformPeaks: attachment.waveformPeaks || null,
                    width: attachment.width ?? null,
                })
            );
        }

        if (typeof params.tx.historyEvents?.[eventId]?.link === 'function') {
            transactions.push(params.tx.historyEvents[eventId].link({ attachments: attachment.id }));
        }
    }

    return { eventId, transactions };
}

export function getHistoryActorKey(event: HistoryEventLike | null | undefined): string | null {
    if (event?.actorFamilyMemberId) return event.actorFamilyMemberId;
    if (String(event?.source || '').trim().toLowerCase() === HISTORY_SOURCE_APPLE_SYNC) {
        return HISTORY_ACTOR_APPLE_SYNC;
    }
    return null;
}

export function getHistoryActorLabel(event: HistoryEventLike | null | undefined, familyMemberNamesById?: Map<string, string> | Record<string, string>) {
    const actor = event?.actor;
    if (Array.isArray(actor) && actor[0]?.name) return actor[0].name || null;
    if (actor && !Array.isArray(actor) && actor.name) return actor.name || null;

    const actorKey = getHistoryActorKey(event);
    if (!actorKey) return null;
    if (actorKey === HISTORY_ACTOR_APPLE_SYNC) return 'Apple Sync';

    if (familyMemberNamesById instanceof Map) {
        return familyMemberNamesById.get(actorKey) || null;
    }
    if (familyMemberNamesById && typeof familyMemberNamesById === 'object') {
        return (familyMemberNamesById as Record<string, string>)[actorKey] || null;
    }
    return null;
}

export function getHistoryAffectedMemberIds(event: HistoryEventLike | null | undefined) {
    return Array.from(
        new Set(
            (event?.affectedFamilyMembers || [])
                .map((member) => member?.id || null)
                .filter((memberId): memberId is string => Boolean(memberId))
        )
    );
}

export function getLinkedMessage(event: HistoryEventLike | null | undefined): MessageLike | null {
    if (!event?.message) return null;
    if (Array.isArray(event.message)) {
        return event.message[0] || null;
    }
    return event.message || null;
}

export function toggleFilterMode(current: HistoryFilterMode): HistoryFilterMode {
    if (current === 'off') return 'include';
    if (current === 'include') return 'exclude';
    return 'off';
}

export function matchesFilterMode(mode: HistoryFilterMode, matched: boolean) {
    if (mode === 'off') return true;
    if (mode === 'include') return matched;
    return !matched;
}
