'use client';

import React, { useMemo } from 'react';
import { MessageCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { registerFreeformWidget } from '@/lib/freeform-dashboard/freeform-widget-registry';
import type { FreeformWidgetProps } from '@/lib/freeform-dashboard/types';
import { formatTimeAgo, getPhotoUrl, toInitials } from '@/lib/dashboard-utils';
import type { DashboardFamilyMember } from '@/lib/dashboard-utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useWidgetScale } from '@/lib/freeform-dashboard/widget-scale';

function FamilyChatWidget({ width, height, todayUtc }: FreeformWidgetProps) {
    const { s, sv } = useWidgetScale();
    const { data } = db.useQuery({
        messageThreads: {
            messages: {
                $: { order: { createdAt: 'desc' }, limit: 20 },
                author: {},
            },
        },
        familyMembers: {},
    });

    const MESSAGE_HEIGHT = s(52);
    const HEADER_HEIGHT = s(32);
    const padding = s(12);
    const maxMessages = Math.max(1, Math.floor((height - HEADER_HEIGHT - padding * 2) / MESSAGE_HEIGHT));

    const messages = useMemo(() => {
        if (!data?.messageThreads) return [];

        // Find the family general thread
        const familyThread = data.messageThreads.find(
            (t) => (t as Record<string, unknown>).threadKey === 'family'
        );
        if (!familyThread?.messages) return [];

        const membersMap = new Map(
            ((data.familyMembers ?? []) as any[]).map((m) => [m.id, m])
        );

        return familyThread.messages
            .filter((m) => !(m as Record<string, unknown>).deletedAt)
            .slice(0, maxMessages)
            .map((msg) => {
                const authorId = (msg as Record<string, unknown>).authorFamilyMemberId as string | undefined;
                const author = authorId ? membersMap.get(authorId) : undefined;
                return {
                    id: msg.id,
                    body: (msg as Record<string, unknown>).body as string || '',
                    createdAt: (msg as Record<string, unknown>).createdAt as string,
                    authorName: author?.name || 'Unknown',
                    authorPhotoUrl: author ? getPhotoUrl(author as DashboardFamilyMember) : undefined,
                    authorInitials: toInitials(author?.name),
                };
            })
            .reverse(); // Show oldest first (chronological)
    }, [data, maxMessages]);

    const avatarSize = s(24);

    return (
        <div className="flex h-full flex-col" style={{ padding }}>
            <div className="flex items-center font-semibold uppercase tracking-wider" style={{ marginBottom: s(8), gap: s(6), fontSize: sv(12), color: 'var(--fd-ink-faint)' }}>
                <MessageCircle size={s(12)} />
                Family Chat
            </div>

            {messages.length === 0 ? (
                <div className="flex flex-1 items-center justify-center" style={{ fontSize: sv(12), color: 'var(--fd-ink-faint)' }}>
                    No messages yet
                </div>
            ) : (
                <div className="flex flex-col" style={{ gap: s(4) }}>
                    {messages.map((msg) => (
                        <div key={msg.id} className="flex items-start" style={{ gap: s(8), paddingTop: s(4), paddingBottom: s(4), minHeight: MESSAGE_HEIGHT - s(8) }}>
                            <Avatar className="shrink-0" style={{ width: avatarSize, height: avatarSize, marginTop: s(2) }}>
                                <AvatarImage src={msg.authorPhotoUrl} />
                                <AvatarFallback style={{ fontSize: sv(9) }}>{msg.authorInitials}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-baseline" style={{ gap: s(6) }}>
                                    <span className="font-medium" style={{ fontSize: sv(12), color: 'var(--fd-ink)' }}>{msg.authorName}</span>
                                    <span style={{ fontSize: sv(10), color: 'var(--fd-ink-faint)' }}>{formatTimeAgo(msg.createdAt)}</span>
                                </div>
                                <div className="line-clamp-2 leading-relaxed" style={{ fontSize: sv(12), color: 'var(--fd-ink-muted)' }}>{msg.body}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

registerFreeformWidget({
    meta: {
        type: 'family-chat',
        label: 'Family Chat',
        icon: MessageCircle,
        description: 'Recent messages from the family general chat thread',
        minWidth: 250,
        minHeight: 200,
        defaultWidth: 350,
        defaultHeight: 300,
        allowMultiple: false,
    },
    component: FamilyChatWidget,
});

export default FamilyChatWidget;
