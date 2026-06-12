'use client';

import React from 'react';
import { Loader2, Search, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getThreadDisplayName, getThreadMembersSummary, getThreadTypeLabel, isParentOverseeingThread } from '@/lib/message-thread-display';
import { joinThreadWatch, leaveThreadWatch, updateThreadPreferences } from '@/lib/message-client';
import { useToast } from '@/components/ui/use-toast';
import { ReplyPreviewCard } from './ReplyPreviewCard';
import { MessageBubble } from './MessageBubble';
import type { MessageRecord, ThreadRecord } from './message-types';
import type { MessageNotificationLevel } from '@/lib/messaging-types';

interface MessageThreadProps {
    thread: ThreadRecord;
    messages: MessageRecord[];
    currentUser: any;
    familyMemberNamesById: Map<string, string>;
    isOverseeMode: boolean;
    messageSearch: string;
    onMessageSearchChange: (value: string) => void;
    presentPeers: any[];
    typingPeers: any[];
    referenceNowMs: number;
    editingMessageId: string | null;
    editingBody: string;
    onEditStart: (id: string, body: string) => void;
    onEditCancel: () => void;
    onEditBodyChange: (body: string) => void;
    replyToMessageId: string | null;
    onReply: (id: string) => void;
    replyTarget: MessageRecord | null;
    onClearReply: () => void;
    composerBody: string;
    onComposerBodyChange: (value: string) => void;
    composerImportance: 'normal' | 'urgent' | 'announcement' | 'needs_ack';
    onComposerImportanceChange: (value: 'normal' | 'urgent' | 'announcement' | 'needs_ack') => void;
    pendingFiles: File[];
    onAddFiles: (files: File[]) => void;
    onRemoveFile: (index: number) => void;
    isSending: boolean;
    canComposeInThread: boolean;
    activeMessagesLoading: boolean;
    activeMessagesError: any;
    onSend: () => void;
    onTypingBlur: () => void;
    onTypingKeyDown: (event: React.KeyboardEvent) => void;
}

export function MessageThread({
    thread,
    messages,
    currentUser,
    familyMemberNamesById,
    isOverseeMode,
    messageSearch,
    onMessageSearchChange,
    presentPeers,
    typingPeers,
    referenceNowMs,
    editingMessageId,
    editingBody,
    onEditStart,
    onEditCancel,
    onEditBodyChange,
    replyToMessageId,
    onReply,
    replyTarget,
    onClearReply,
    composerBody,
    onComposerBodyChange,
    composerImportance,
    onComposerImportanceChange,
    pendingFiles,
    onAddFiles,
    onRemoveFile,
    isSending,
    canComposeInThread,
    activeMessagesLoading,
    activeMessagesError,
    onSend,
    onTypingBlur,
    onTypingKeyDown,
}: MessageThreadProps) {
    const { toast } = useToast();
    const membership = thread.membership ?? null;
    const displayName = getThreadDisplayName(thread, familyMemberNamesById, currentUser?.id || '');
    const memberSummary = getThreadMembersSummary(thread, familyMemberNamesById, currentUser?.id || '');
    const isOverseen = isParentOverseeingThread(thread, currentUser?.role);

    return (
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border/60 bg-card shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
            {/* Thread header */}
            <div className="border-b border-border/50 px-6 py-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground/50">{getThreadTypeLabel(thread)}</div>
                        <h2
                            className="mt-1 text-2xl text-foreground"
                            style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500 }}
                        >
                            {displayName}
                        </h2>
                        {memberSummary ? (
                            <p className="mt-2 max-w-3xl text-sm text-muted-foreground/70">{memberSummary}</p>
                        ) : null}
                        {isOverseen ? (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border/50 bg-secondary/60 px-3 py-1 text-xs text-muted-foreground/70">
                                <Shield className="h-3.5 w-3.5" />
                                Viewing as parent oversight
                            </div>
                        ) : null}
                        {presentPeers.length > 0 ? (
                            <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                                Online now: {presentPeers.map((peer: any) => peer.name || 'Unknown').join(', ')}
                            </p>
                        ) : null}
                        {typingPeers.length > 0 ? (
                            <p className="mt-2 text-sm text-muted-foreground/70">
                                {typingPeers.length === 1
                                    ? `${typingPeers[0].name} is typing...`
                                    : `${typingPeers[0].name} and ${typingPeers.length - 1} others are typing...`}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {currentUser?.role === 'parent' && isOverseeMode && !membership ? (
                            <Button type="button" variant="outline" onClick={async () => {
                                try {
                                    await joinThreadWatch(thread.id);
                                    toast({ title: 'Thread joined', description: 'You are now watching this thread.' });
                                } catch (error: any) {
                                    toast({ title: 'Unable to join thread', description: error?.message || 'Please try again.', variant: 'destructive' });
                                }
                            }}>
                                Join Thread
                            </Button>
                        ) : null}
                        {membership?.memberRole === 'watcher' ? (
                            <Button type="button" variant="outline" onClick={async () => {
                                try {
                                    await leaveThreadWatch(thread.id);
                                    toast({ title: 'Left thread', description: 'Watcher mode has been removed.' });
                                } catch (error: any) {
                                    toast({ title: 'Unable to leave watch mode', description: error?.message || 'Please try again.', variant: 'destructive' });
                                }
                            }}>
                                Leave Watch
                            </Button>
                        ) : null}
                        {membership ? (
                            <>
                                <Button type="button" variant="outline" onClick={() => {
                                    void updateThreadPreferences({ threadId: thread.id, isPinned: !membership.isPinned }).catch((error) => {
                                        toast({ title: 'Unable to update thread', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
                                    });
                                }}>
                                    {membership.isPinned ? 'Unpin' : 'Pin'}
                                </Button>
                                <Button type="button" variant="outline" onClick={() => {
                                    void updateThreadPreferences({ threadId: thread.id, isArchived: true }).catch((error) => {
                                        toast({ title: 'Unable to archive thread', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
                                    });
                                }}>
                                    Archive
                                </Button>
                            </>
                        ) : null}
                    </div>
                </div>

                {membership ? (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">Notifications</label>
                        <select
                            value={membership.notificationLevel || 'all'}
                            onChange={(event) => {
                                void updateThreadPreferences({
                                    threadId: thread.id,
                                    notificationLevel: event.target.value as MessageNotificationLevel,
                                }).catch((error) => {
                                    toast({ title: 'Unable to update notifications', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
                                });
                            }}
                            className="rounded-full border border-border/50 bg-background px-3 py-2 text-sm text-foreground"
                        >
                            <option value="all">All</option>
                            <option value="mentions">Mentions</option>
                            <option value="watch">Watch</option>
                            <option value="mute">Mute</option>
                        </select>
                        <div className="ml-auto flex items-center gap-2 rounded-full border border-border/50 bg-secondary/60 px-3 py-2">
                            <Search className="h-4 w-4 text-muted-foreground/40" />
                            <input
                                value={messageSearch}
                                onChange={(event) => onMessageSearchChange(event.target.value)}
                                placeholder="Search in this thread"
                                className="bg-transparent text-sm outline-none"
                            />
                        </div>
                    </div>
                ) : null}
            </div>

            {/* Message list */}
            <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-4 px-6 py-6">
                    {activeMessagesError ? (
                        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                            Could not load messages: {activeMessagesError.message || 'Unknown error'}
                        </div>
                    ) : null}
                    {activeMessagesLoading ? (
                        <div className="flex items-center gap-3 rounded-3xl border border-border/50 bg-card px-4 py-3 text-sm text-muted-foreground/60">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading conversation...
                        </div>
                    ) : null}

                    {messages.map((message) => (
                        <MessageBubble
                            key={message.id}
                            message={message}
                            currentUserId={currentUser?.id || null}
                            currentUserRole={currentUser?.role || null}
                            familyMemberNamesById={familyMemberNamesById}
                            referenceNowMs={referenceNowMs}
                            editingMessageId={editingMessageId}
                            editingBody={editingBody}
                            onEditStart={onEditStart}
                            onEditCancel={onEditCancel}
                            onEditBodyChange={onEditBodyChange}
                            onReply={onReply}
                        />
                    ))}

                    {!activeMessagesLoading && messages.length === 0 ? (
                        <div className="rounded-[28px] border border-dashed border-border/60 bg-secondary/40 px-4 py-10 text-center text-sm text-muted-foreground/70">
                            No messages in this thread yet.
                        </div>
                    ) : null}
                </div>
            </ScrollArea>

            {/* Composer */}
            <div className="border-t border-border/50 bg-secondary/40 p-5">
                {!canComposeInThread ? (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Join this thread to reply or add a watch membership from oversee mode.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {replyTarget ? (
                            <ReplyPreviewCard
                                message={replyTarget}
                                familyMemberNamesById={familyMemberNamesById}
                                label="Replying to"
                                variant="composer"
                                onClear={onClearReply}
                            />
                        ) : null}

                        <textarea
                            value={composerBody}
                            onChange={(event) => onComposerBodyChange(event.target.value)}
                            onBlur={onTypingBlur}
                            onKeyDown={onTypingKeyDown}
                            rows={4}
                            placeholder="Write a message..."
                            className="w-full rounded-[24px] border border-border/60 bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition focus:border-border"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            {currentUser?.role === 'parent' ? (
                                <select
                                    value={composerImportance}
                                    onChange={(event) => onComposerImportanceChange(event.target.value as any)}
                                    className="rounded-full border border-border/60 bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm"
                                >
                                    <option value="normal">Normal</option>
                                    <option value="urgent">Urgent</option>
                                    <option value="announcement">Announcement</option>
                                    <option value="needs_ack">Needs Ack</option>
                                </select>
                            ) : null}
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-2 text-xs font-medium text-foreground shadow-sm">
                                <span>Add files</span>
                                <input
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={(event) => {
                                        onAddFiles(Array.from(event.target.files || []));
                                        event.target.value = '';
                                    }}
                                    disabled={isSending}
                                />
                            </label>
                            <Button
                                type="button"
                                onClick={onSend}
                                disabled={isSending || (!composerBody.trim() && pendingFiles.length === 0)}
                            >
                                {isSending ? 'Sending...' : 'Send message'}
                            </Button>
                        </div>

                        {pendingFiles.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                                {pendingFiles.map((file, index) => (
                                    <button
                                        key={`${file.name}-${index}`}
                                        type="button"
                                        onClick={() => onRemoveFile(index)}
                                        className="rounded-full border border-border/60 bg-card px-3 py-1 text-xs text-foreground"
                                    >
                                        {file.name} ×
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </section>
    );
}
