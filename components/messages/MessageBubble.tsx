'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { useToast } from '@/components/ui/use-toast';
import { editMessage, removeMessage, toggleReaction, acknowledge } from '@/lib/message-client';
import { ReplyPreviewCard } from './ReplyPreviewCard';
import { getAuthorName, formatMessageTime, getReplyToMessage } from './message-utils';
import type { MessageRecord } from './message-types';

interface MessageBubbleProps {
    message: MessageRecord;
    currentUserId: string | null;
    currentUserRole: string | null;
    familyMemberNamesById: Map<string, string>;
    referenceNowMs: number;
    editingMessageId: string | null;
    editingBody: string;
    onEditStart: (id: string, body: string) => void;
    onEditCancel: () => void;
    onEditBodyChange: (body: string) => void;
    onReply: (id: string) => void;
}

export function MessageBubble({
    message,
    currentUserId,
    currentUserRole,
    familyMemberNamesById,
    referenceNowMs,
    editingMessageId,
    editingBody,
    onEditStart,
    onEditCancel,
    onEditBodyChange,
    onReply,
}: MessageBubbleProps) {
    const { toast } = useToast();
    const isOwnMessage = Boolean(currentUserId && message.authorFamilyMemberId === currentUserId);
    const isOptimistic = (message as any)._optimistic === true;
    const editableUntil = message.editableUntil ? new Date(message.editableUntil).getTime() : 0;
    const canEdit = !isOptimistic && isOwnMessage && referenceNowMs < editableUntil && !message.deletedAt;
    const canDelete = !isOptimistic && ((isOwnMessage && referenceNowMs < editableUntil) || currentUserRole === 'parent');
    const isEditing = editingMessageId === message.id;
    const replyTo = getReplyToMessage(message.replyTo);

    return (
        <div className={cn('flex', isOwnMessage ? 'justify-end' : 'justify-start', isOptimistic && 'opacity-60')}>
            <div
                className={cn(
                    'max-w-[78%] rounded-[28px] border px-4 py-3 shadow-sm',
                    isOwnMessage
                        ? 'border-foreground/20 bg-foreground text-background'
                        : 'border-border/50 bg-card text-foreground'
                )}
            >
                <div className={cn('mb-1 flex flex-wrap items-center gap-2 text-xs', isOwnMessage ? 'text-background/60' : 'text-muted-foreground/70')}>
                    <span className="font-semibold">{getAuthorName(message, familyMemberNamesById)}</span>
                    <span>{formatMessageTime(message.createdAt)}</span>
                    {message.editedAt ? <span>edited</span> : null}
                    {message.importance === 'urgent' ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">urgent</span>
                    ) : null}
                    {message.importance === 'announcement' ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">announcement</span>
                    ) : null}
                </div>

                {replyTo ? (
                    <div className="mb-3">
                        <ReplyPreviewCard
                            message={replyTo}
                            familyMemberNamesById={familyMemberNamesById}
                            label="Reply to"
                            variant={isOwnMessage ? 'bubble-own' : 'bubble-other'}
                        />
                    </div>
                ) : null}

                {isEditing ? (
                    <div className="space-y-2">
                        <textarea
                            value={editingBody}
                            onChange={(event) => onEditBodyChange(event.target.value)}
                            rows={4}
                            className="w-full rounded-2xl border border-border/50 bg-background px-3 py-2 text-sm text-foreground"
                        />
                        <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={onEditCancel}>
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={async () => {
                                    try {
                                        await editMessage({ messageId: message.id, body: editingBody });
                                        onEditCancel();
                                    } catch (error: any) {
                                        toast({ title: 'Unable to edit message', description: error?.message || 'Please try again.', variant: 'destructive' });
                                    }
                                }}
                            >
                                Save
                            </Button>
                        </div>
                    </div>
                ) : message.deletedAt ? (
                    <div className={cn('rounded-2xl px-3 py-2 text-sm italic', isOwnMessage ? 'bg-card/10 text-background/70' : 'bg-secondary/40 text-muted-foreground/70')}>
                        {message.removedReason || 'Message removed'}
                    </div>
                ) : (
                    <>
                        {message.body ? <div className="whitespace-pre-wrap text-sm leading-6">{message.body}</div> : null}
                        {message.attachments?.length ? (
                            <AttachmentCollection
                                attachments={message.attachments}
                                className="mt-3"
                                variant={isOwnMessage ? 'bubble-own' : 'bubble-other'}
                            />
                        ) : null}
                    </>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {['👍', '❤️', '😂', '🔥'].map((emoji) => {
                        const count = (message.reactions || []).filter((r) => r.emoji === emoji).length;
                        const isActive = (message.reactions || []).some((r) => {
                            const member = Array.isArray(r.familyMember) ? r.familyMember[0] : r.familyMember;
                            return r.emoji === emoji && member?.id === currentUserId;
                        });
                        return (
                            <button
                                key={`${message.id}-${emoji}`}
                                type="button"
                                onClick={() => {
                                    void toggleReaction({ messageId: message.id, emoji }).catch((error) => {
                                        toast({ title: 'Unable to react', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
                                    });
                                }}
                                className={cn(
                                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                                    isOwnMessage
                                        ? isActive ? 'border-white/30 bg-card/20 text-white' : 'border-white/20 bg-card/10 text-background/60'
                                        : isActive ? 'border-border bg-secondary text-foreground' : 'border-border/40 bg-secondary/40 text-muted-foreground'
                                )}
                            >
                                {emoji} {count > 0 ? count : ''}
                            </button>
                        );
                    })}

                    {message.importance === 'needs_ack' ? (
                        <button
                            type="button"
                            onClick={() => {
                                void acknowledge({ messageId: message.id, kind: 'acknowledged' }).catch((error) => {
                                    toast({ title: 'Unable to acknowledge message', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
                                });
                            }}
                            className={cn(
                                'rounded-full border px-2.5 py-1 text-xs font-medium',
                                isOwnMessage ? 'border-white/20 bg-card/10 text-background/60' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            )}
                        >
                            {message.acknowledgements?.length ? `${message.acknowledgements.length} acknowledged` : 'Acknowledge'}
                        </button>
                    ) : null}

                    <div className="ml-auto flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => onReply(message.id)}
                            className={cn('text-xs font-semibold', isOwnMessage ? 'text-background/70 hover:text-white' : 'text-muted-foreground/70 hover:text-foreground')}
                        >
                            Reply
                        </button>
                        {canEdit ? (
                            <button
                                type="button"
                                onClick={() => onEditStart(message.id, message.body || '')}
                                className={cn('text-xs font-semibold', isOwnMessage ? 'text-background/70 hover:text-white' : 'text-muted-foreground/70 hover:text-foreground')}
                            >
                                Edit
                            </button>
                        ) : null}
                        {canDelete ? (
                            <button
                                type="button"
                                onClick={() => {
                                    void removeMessage(message.id).catch((error) => {
                                        toast({ title: 'Unable to remove message', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
                                    });
                                }}
                                className={cn('text-xs font-semibold', isOwnMessage ? 'text-background/70 hover:text-white' : 'text-muted-foreground/70 hover:text-foreground')}
                            >
                                Remove
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
