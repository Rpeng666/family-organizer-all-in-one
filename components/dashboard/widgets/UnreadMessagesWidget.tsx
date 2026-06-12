'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { getThreadDisplayName, getThreadPreviewText } from '@/lib/message-thread-display';
import { formatTimeAgo, type DashboardFamilyMember } from '@/lib/dashboard-utils';
import type { WidgetProps } from './types';
import { registerWidget } from './widget-store';
import WidgetShell from './WidgetShell';

type UnreadThread = {
    id: string;
    displayName: string;
    previewText: string;
    latestMessageAt: string;
};

function UnreadMessagesWidget({ memberId }: WidgetProps) {
    const { data } = db.useQuery({
        familyMembers: { $: { order: { order: 'asc' } } },
        messageThreads: { members: {} },
    });

    const unreadThreads = useMemo(() => {
        if (!data?.messageThreads || !data?.familyMembers) return [] as UnreadThread[];

        const familyMemberNamesById = new Map(
            (data.familyMembers as unknown as DashboardFamilyMember[]).map((m) => [m.id, m.name])
        );
        const threads = data.messageThreads as any[];
        const result: UnreadThread[] = [];

        for (const thread of threads) {
            if (!thread.latestMessageAt) continue;

            const membership = (thread.members || []).find(
                (m: any) => m.familyMemberId === memberId
            );
            if (!membership) continue;
            if (membership.isArchived) continue;

            const lastRead = membership.lastReadAt || '';
            if (thread.latestMessageAt > lastRead) {
                result.push({
                    id: thread.id,
                    displayName: getThreadDisplayName(thread, familyMemberNamesById, memberId),
                    previewText: getThreadPreviewText(thread),
                    latestMessageAt: thread.latestMessageAt,
                });
            }
        }

        return result.sort((a, b) => b.latestMessageAt.localeCompare(a.latestMessageAt));
    }, [data?.messageThreads, data?.familyMembers, memberId]);

    if (unreadThreads.length === 0) return null;

    return (
        <WidgetShell
            meta={UNREAD_MESSAGES_META}
            accentBorder="border-indigo-200"
            headerRight={
                <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">
                    {unreadThreads.length}
                </span>
            }
        >
            <ul className="space-y-1.5">
                {unreadThreads.map((thread) => (
                    <li key={thread.id}>
                        <Link
                            href="/messages"
                            className="flex items-start justify-between gap-2 rounded-lg border border-indigo-100 bg-indigo-50/30 px-3 py-2 hover:bg-indigo-50 transition-colors"
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">{thread.displayName}</p>
                                <p className="truncate text-[11px] text-slate-600">{thread.previewText}</p>
                            </div>
                            <span className="shrink-0 text-[10px] text-slate-400">
                                {formatTimeAgo(thread.latestMessageAt)}
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </WidgetShell>
    );
}

const UNREAD_MESSAGES_META = {
    id: 'unread-messages',
    label: 'Unread Messages',
    icon: MessageCircle,
    defaultSize: { colSpan: 1 as const },
    defaultEnabled: true,
    defaultOrder: 5,
    description: 'Unread message thread previews',
};

registerWidget({ meta: UNREAD_MESSAGES_META, component: UnreadMessagesWidget });
