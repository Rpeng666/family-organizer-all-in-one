'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/db';
import {
    nextDigestAt,
    normalizeDigestMode,
    normalizeDigestWindowMinutes,
    shouldQueueDigest,
    type MessageNotificationPreferences,
} from '@/lib/message-notification-preferences';
import { getMessageServerTime } from '@/lib/message-client';
import { createMessageServerTimeAnchor, getMessageServerNowMs, getMonotonicNowMs, type MessageServerTimeAnchor } from '@/lib/message-server-time';

type DigestItem = {
    threadId: string;
    title: string;
    body: string;
    dueAt: string;
    occurredAt: string;
};

function queueKey(memberId: string) {
    return `family_organizer_message_digest_queue:${memberId}`;
}

function readQueue(memberId: string): DigestItem[] {
    try {
        const raw = window.localStorage.getItem(queueKey(memberId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeQueue(memberId: string, queue: DigestItem[]) {
    try {
        window.localStorage.setItem(queueKey(memberId), JSON.stringify(queue));
    } catch {
        // best effort
    }
}

function summarizeDigest(queue: DigestItem[]) {
    const titles = Array.from(new Set(queue.map((item) => item.title).filter(Boolean)));
    if (queue.length === 1) {
        return queue[0].body || `New message in ${queue[0].title}`;
    }
    if (titles.length === 1) {
        return `${queue.length} new messages in ${titles[0]}`;
    }
    const preview = titles.slice(0, 3).join(', ');
    return `${queue.length} new messages across ${titles.length} threads: ${preview}`;
}

function showBrowserNotification(title: string, body: string, tag: string) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;
    new window.Notification(title, {
        body,
        tag,
    });
}

export function MessageNotificationBridge() {
    const { currentUser } = useAuth();
    const seenThreadActivityRef = useRef<Record<string, string>>({});
    const [serverNowAnchor, setServerNowAnchor] = useState<MessageServerTimeAnchor | null>(null);

    const membershipQuery = (db as any).useQuery(
        currentUser
            ? {
                  messageThreadMembers: {
                  },
              }
            : null
    ) as any;

    const threads = useMemo(() => {
        const memberships = membershipQuery?.data?.messageThreadMembers || [];
        return memberships
            .filter((membership: any) => membership?.threadId)
            .map((membership: any) => ({
                id: membership.threadId,
                latestMessageAt: membership.lastReadAt || '',
                latestMessageAuthorId: null,
                latestMessagePreview: '',
                title: 'Message thread',
                membership,
            }));
    }, [membershipQuery?.data?.messageThreadMembers]);

    const prefs = currentUser || ({} as MessageNotificationPreferences & { id?: string | null });

    useEffect(() => {
        if (!currentUser?.id) {
            setServerNowAnchor(null);
            return;
        }

        let cancelled = false;

        const syncServerNow = async () => {
            try {
                const response = await getMessageServerTime();
                const nextAnchor = createMessageServerTimeAnchor(response?.serverNow);
                if (!cancelled && nextAnchor) {
                    setServerNowAnchor(nextAnchor);
                }
            } catch (error) {
                console.error('Unable to sync message server time for notifications', error);
            }
        };

        void syncServerNow();
        const intervalId = window.setInterval(() => {
            void syncServerNow();
        }, 5 * 60 * 1000);

        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [currentUser?.id]);

    useEffect(() => {
        if (!currentUser?.id) return;
        const intervalId = window.setInterval(() => {
            const queue = readQueue(currentUser.id);
            if (!queue.length) return;
            const nowMs = getMessageServerNowMs(serverNowAnchor, getMonotonicNowMs());
            const due = queue.filter((item) => new Date(item.dueAt).getTime() <= nowMs);
            if (!due.length) return;
            const remaining = queue.filter((item) => new Date(item.dueAt).getTime() > nowMs);
            writeQueue(currentUser.id, remaining);
            showBrowserNotification('Family message digest', summarizeDigest(due), `digest:${currentUser.id}`);
        }, 30_000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [currentUser?.id, serverNowAnchor]);

    useEffect(() => {
        if (!currentUser?.id) return;

        const digestMode = normalizeDigestMode(prefs.messageDigestMode);
        const digestWindowMinutes = normalizeDigestWindowMinutes(prefs.messageDigestWindowMinutes);

        for (const thread of threads) {
            const latestMessageAt = thread.latestMessageAt || '';
            if (!latestMessageAt) continue;

            const previousLatest = seenThreadActivityRef.current[thread.id];
            seenThreadActivityRef.current[thread.id] = latestMessageAt;

            if (!previousLatest) continue;
            if (previousLatest === latestMessageAt) continue;
            if (thread.latestMessageAuthorId === currentUser.id) continue;

            const body = thread.latestMessagePreview || 'New message';
            const title = thread.title || 'Family message';
            const now = new Date(getMessageServerNowMs(serverNowAnchor, getMonotonicNowMs()));

            if (shouldQueueDigest(prefs, now) || digestMode === 'digest') {
                const queue = readQueue(currentUser.id);
                const dueAt = nextDigestAt(
                    {
                        ...prefs,
                        messageDigestMode: digestMode,
                        messageDigestWindowMinutes: digestWindowMinutes,
                    },
                    now
                );
                queue.push({
                    threadId: thread.id,
                    title,
                    body,
                    dueAt: dueAt.toISOString(),
                    occurredAt: latestMessageAt,
                });
                writeQueue(currentUser.id, queue);
                continue;
            }

            showBrowserNotification(title, body, `thread:${thread.id}`);
        }
    }, [
        currentUser?.id,
        prefs.messageDigestMode,
        prefs.messageDigestWindowMinutes,
        prefs.messageQuietHoursEnabled,
        prefs.messageQuietHoursEnd,
        prefs.messageQuietHoursStart,
        serverNowAnchor,
        threads,
    ]);

    return null;
}
