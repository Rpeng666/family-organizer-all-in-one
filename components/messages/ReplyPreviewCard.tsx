'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { getAuthorName, getReplyPreviewText } from './message-utils';
import type { MessageRecord, ReplyPreviewVariant } from './message-types';

interface ReplyPreviewCardProps {
    message: MessageRecord;
    familyMemberNamesById: Map<string, string>;
    label: string;
    variant: ReplyPreviewVariant;
    onClear?: (() => void) | null;
}

export function ReplyPreviewCard({ message, familyMemberNamesById, label, variant, onClear }: ReplyPreviewCardProps) {
    const isComposer = variant === 'composer';
    const isOwn = variant === 'bubble-own';

    return (
        <div
            className={cn(
                'min-w-0 rounded-2xl border px-3 py-2',
                isComposer
                    ? 'flex items-start justify-between gap-3 border-border/50 bg-card'
                    : isOwn
                    ? 'border-white/20 bg-card/10'
                    : 'border-border/50 bg-secondary/50'
            )}
        >
            <div className="min-w-0 flex-1">
                <div
                    className={cn(
                        'text-[11px] font-semibold uppercase tracking-[0.14em]',
                        isComposer ? 'text-muted-foreground/70' : isOwn ? 'text-background/60' : 'text-muted-foreground/70'
                    )}
                >
                    {label}{' '}
                    <span
                        className={cn(
                            'normal-case tracking-normal',
                            isComposer ? 'text-foreground' : isOwn ? 'text-white' : 'text-foreground'
                        )}
                    >
                        {getAuthorName(message, familyMemberNamesById)}
                    </span>
                </div>
                <div
                    className={cn(
                        'mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-5',
                        isComposer ? 'text-muted-foreground' : isOwn ? 'text-background/60' : 'text-muted-foreground'
                    )}
                >
                    {getReplyPreviewText(message)}
                </div>
            </div>
            {onClear ? (
                <button
                    type="button"
                    className="shrink-0 text-xs font-semibold text-muted-foreground/70 hover:text-foreground"
                    onClick={onClear}
                >
                    Clear
                </button>
            ) : null}
        </div>
    );
}
