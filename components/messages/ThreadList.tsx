'use client';

import React from 'react';
import { Shield, Users, Search, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getThreadDisplayName, getThreadMembersSummary, getThreadPreviewText, getThreadTypeLabel, isParentOverseeingThread } from '@/lib/message-thread-display';
import { formatMessageTime, isThreadUnread } from './message-utils';
import type { ThreadRecord } from './message-types';

interface ThreadListProps {
    threads: ThreadRecord[];
    selectedThreadId: string | null;
    currentUser: any;
    threadSearch: string;
    isOverseeMode: boolean;
    showNotificationPrefs: boolean;
    browserNotificationPermission: string;
    availableParticipants: any[];
    creationMode: 'direct' | 'group' | null;
    newThreadTitle: string;
    selectedParticipantIds: string[];
    isCreatingThread: boolean;
    familyMemberNamesById: Map<string, string>;
    onSelectThread: (id: string) => void;
    onThreadSearchChange: (value: string) => void;
    onToggleOverseeMode: () => void;
    onToggleNotificationPrefs: () => void;
    onRequestNotifications: () => void;
    onOpenCanonicalThread: (type: 'family' | 'parents_only') => void;
    onSetCreationMode: (mode: 'direct' | 'group' | null) => void;
    onNewThreadTitleChange: (value: string) => void;
    onToggleParticipant: (id: string) => void;
    onCreateThread: () => void;
    onSaveNotificationPrefs: (patch: Record<string, any>) => void;
}

export function ThreadList({
    threads,
    selectedThreadId,
    currentUser,
    threadSearch,
    isOverseeMode,
    showNotificationPrefs,
    browserNotificationPermission,
    availableParticipants,
    creationMode,
    newThreadTitle,
    selectedParticipantIds,
    isCreatingThread,
    familyMemberNamesById,
    onSelectThread,
    onThreadSearchChange,
    onToggleOverseeMode,
    onToggleNotificationPrefs,
    onRequestNotifications,
    onOpenCanonicalThread,
    onSetCreationMode,
    onNewThreadTitleChange,
    onToggleParticipant,
    onCreateThread,
    onSaveNotificationPrefs,
}: ThreadListProps) {
    return (
        <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
            <div className="border-b border-border/50 p-5">
                <div className="space-y-4">
                    <div>
                        <h1
                            className="text-2xl text-foreground"
                            style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500, letterSpacing: '-0.01em' }}
                        >
                            Messages
                        </h1>
                        <p className="mt-1 text-sm text-muted-foreground/70">Family, DMs, groups, and oversight.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {typeof window !== 'undefined' && 'Notification' in window && browserNotificationPermission !== 'granted' ? (
                            <Button type="button" variant="outline" size="sm" onClick={onRequestNotifications}>
                                Alerts
                            </Button>
                        ) : null}
                        <Button type="button" variant="outline" size="sm" onClick={onToggleNotificationPrefs}>
                            Notify
                        </Button>
                        {currentUser?.role === 'parent' ? (
                            <Button
                                type="button"
                                variant={isOverseeMode ? 'default' : 'outline'}
                                size="sm"
                                onClick={onToggleOverseeMode}
                            >
                                <Shield className="mr-2 h-4 w-4" />
                                {isOverseeMode ? 'Oversee' : 'Inbox'}
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => onSetCreationMode('direct')}
                            aria-label="Start a conversation"
                        >
                            <MessageSquarePlus className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-full border border-border/50 bg-secondary/60 px-3 py-2">
                    <Search className="h-4 w-4 text-muted-foreground/40" />
                    <Input
                        value={threadSearch}
                        onChange={(event) => onThreadSearchChange(event.target.value)}
                        placeholder="Search threads, names, or previews"
                        className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                    />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void onOpenCanonicalThread('family')}>
                        Family
                    </Button>
                    {currentUser?.role === 'parent' ? (
                        <Button type="button" variant="outline" size="sm" onClick={() => void onOpenCanonicalThread('parents_only')}>
                            Parents
                        </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" onClick={() => onSetCreationMode('group')}>
                        <Users className="mr-2 h-4 w-4" />
                        Group
                    </Button>
                </div>

                {showNotificationPrefs && currentUser ? (
                    <div className="mt-4 rounded-3xl border border-border/50 bg-secondary/40 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground/70">Notification preferences</div>
                        <div className="mt-3 grid gap-3">
                            <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                                <span>Quiet hours</span>
                                <input
                                    type="checkbox"
                                    checked={Boolean(currentUser.messageQuietHoursEnabled)}
                                    onChange={(event) => void onSaveNotificationPrefs({ messageQuietHoursEnabled: event.target.checked })}
                                />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className="text-xs text-muted-foreground/70">
                                    Start
                                    <input
                                        type="time"
                                        value={currentUser.messageQuietHoursStart || '22:00'}
                                        onChange={(event) => void onSaveNotificationPrefs({ messageQuietHoursStart: event.target.value })}
                                        className="mt-1 w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm text-foreground"
                                    />
                                </label>
                                <label className="text-xs text-muted-foreground/70">
                                    End
                                    <input
                                        type="time"
                                        value={currentUser.messageQuietHoursEnd || '07:00'}
                                        onChange={(event) => void onSaveNotificationPrefs({ messageQuietHoursEnd: event.target.value })}
                                        className="mt-1 w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm text-foreground"
                                    />
                                </label>
                            </div>
                            <label className="text-xs text-muted-foreground/70">
                                Delivery
                                <select
                                    value={currentUser.messageDigestMode || 'immediate'}
                                    onChange={(event) => void onSaveNotificationPrefs({ messageDigestMode: event.target.value })}
                                    className="mt-1 w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm text-foreground"
                                >
                                    <option value="immediate">Immediate</option>
                                    <option value="digest">Digest</option>
                                </select>
                            </label>
                            <label className="text-xs text-muted-foreground/70">
                                Digest every (minutes)
                                <input
                                    type="number"
                                    min={5}
                                    max={240}
                                    value={currentUser.messageDigestWindowMinutes ?? 30}
                                    onChange={(event) => void onSaveNotificationPrefs({ messageDigestWindowMinutes: Number(event.target.value || 30) })}
                                    className="mt-1 w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm text-foreground"
                                />
                            </label>
                        </div>
                    </div>
                ) : null}
            </div>

            {creationMode ? (
                <div className="border-b border-border/40 bg-secondary/40 p-4">
                    <div className="space-y-3">
                        <div className="text-sm font-semibold text-foreground">
                            {creationMode === 'direct' ? 'Start a direct message' : 'Create a group thread'}
                        </div>
                        {creationMode === 'group' ? (
                            <Input
                                value={newThreadTitle}
                                onChange={(event) => onNewThreadTitleChange(event.target.value)}
                                placeholder="Group title"
                            />
                        ) : null}
                        <div className="max-h-40 space-y-2 overflow-auto rounded-2xl border border-border/50 bg-card p-3">
                            {availableParticipants.map((member: any) => {
                                const checked = selectedParticipantIds.includes(member.id);
                                return (
                                    <label key={member.id} className="flex items-center gap-3 text-sm text-foreground">
                                        <input
                                            type={creationMode === 'direct' ? 'radio' : 'checkbox'}
                                            name="message-thread-member"
                                            checked={checked}
                                            onChange={() => onToggleParticipant(member.id)}
                                        />
                                        <span>{member.name}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => {
                                onSetCreationMode(null);
                                onNewThreadTitleChange('');
                            }}>
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={onCreateThread}
                                disabled={isCreatingThread || selectedParticipantIds.length === 0}
                            >
                                {isCreatingThread ? 'Creating...' : 'Create'}
                            </Button>
                        </div>
                    </div>
                </div>
            ) : null}

            <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-2 p-3">
                    {threads.map((thread) => {
                        const displayName = getThreadDisplayName(thread, familyMemberNamesById, currentUser?.id || '');
                        const memberSummary = getThreadMembersSummary(thread, familyMemberNamesById, currentUser?.id || '');
                        const previewText = getThreadPreviewText(thread);
                        const isOverseen = isParentOverseeingThread(thread, currentUser?.role);
                        return (
                            <button
                                key={thread.id}
                                type="button"
                                onClick={() => onSelectThread(thread.id)}
                                className={cn(
                                    'w-full overflow-hidden rounded-[24px] border px-4 py-3 text-left transition-all',
                                    selectedThreadId === thread.id
                                        ? isOverseen
                                            ? 'border-violet-300 bg-violet-50/70 shadow-sm'
                                            : 'border-border bg-secondary'
                                        : isOverseen
                                        ? 'border-violet-200 bg-violet-50/40 hover:border-violet-300 hover:bg-violet-50/70'
                                        : 'border-transparent hover:border-border/50 hover:bg-secondary/60'
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                                        {memberSummary ? (
                                            <div className="mt-1 truncate text-[11px] font-medium text-muted-foreground/70">{memberSummary}</div>
                                        ) : null}
                                        <div className="mt-1 line-clamp-2 break-words text-xs leading-5 text-muted-foreground/70">
                                            {previewText}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 self-start pl-2">
                                        {isOverseen ? (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground/60">
                                                <Shield className="h-3 w-3" />
                                                Oversee
                                            </span>
                                        ) : null}
                                        {thread.membership?.isPinned ? (
                                            <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground/60">Pinned</span>
                                        ) : null}
                                        {isThreadUnread(thread) ? (
                                            <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] text-background">Unread</span>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="mt-3 flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground/50">
                                    <span className="min-w-0 truncate">{getThreadTypeLabel(thread)}</span>
                                    <span className="ml-auto shrink-0">{formatMessageTime(thread.latestMessageAt)}</span>
                                </div>
                            </button>
                        );
                    })}

                    {!threads.length ? (
                        <div className="rounded-3xl border border-dashed border-border/50 px-4 py-8 text-center text-xs text-muted-foreground/60">
                            No visible threads yet.
                        </div>
                    ) : null}
                </div>
            </ScrollArea>
        </aside>
    );
}
