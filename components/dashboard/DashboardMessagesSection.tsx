'use client';

import React from 'react';
import Link from 'next/link';
import { MessageCircle } from 'lucide-react';
import { DashboardSectionHeader } from '@/components/dashboard/DashboardSectionHeader';
import { formatCountLabel, type UnreadThread } from '@/lib/dashboard-layout-planner';
import { formatTimeAgo } from '@/lib/dashboard-utils';

interface DashboardMessagesSectionProps {
    threads: UnreadThread[];
    totalCount: number;
    height: number | null;
}

export function DashboardMessagesSection({ threads, totalCount, height }: DashboardMessagesSectionProps) {
    return (
        <div
            className="overflow-hidden rounded-3xl border border-border/60 bg-card px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
            style={height != null ? { height: `${height}px` } : undefined}
        >
            <DashboardSectionHeader
                icon={MessageCircle}
                title="Unread Messages"
                href="/messages"
                countLabel={formatCountLabel(totalCount, 'thread', 'threads')}
            />

            <div className="mt-3 space-y-1.5">
                {threads.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/50 px-4 py-3 text-xs text-muted-foreground/60">
                        All caught up on messages.
                    </div>
                ) : (
                    threads.map((thread) => (
                        <Link
                            key={thread.id}
                            href="/messages"
                            className="block rounded-2xl border border-border/50 bg-background/60 px-4 py-3 transition-colors duration-200 hover:bg-secondary/60"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p
                                        className="truncate text-sm text-foreground"
                                        style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500 }}
                                    >
                                        {thread.displayName}
                                    </p>
                                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-muted-foreground/70">{thread.previewText}</p>
                                </div>
                                <span className="shrink-0 text-[10px] text-muted-foreground/40">
                                    {formatTimeAgo(thread.latestMessageAt)}
                                </span>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
