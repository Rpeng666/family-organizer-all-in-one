'use client';

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { RichTextEditor } from '@/components/responses/RichTextEditor';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import type { FocusPanelItem } from './focus-panel-types';

interface Props {
    item: FocusPanelItem;
    /** When true, the editor fills available height */
    fullHeight?: boolean;
}

export const FocusPanelContent: React.FC<Props> = ({ item, fullHeight }) => {
    if (item.kind === 'rich_text') {
        return (
            <RichTextEditor
                content={item.content}
                onContentChange={item.onContentChange}
                className={fullHeight ? 'flex-1 [&_.response-editor-content]:min-h-0 [&_.response-editor-content]:max-h-none [&_.response-editor-content]:flex-1' : undefined}
            />
        );
    }

    if (item.kind === 'attachment') {
        return <AttachmentFocusView url={item.url} name={item.name} type={item.type} />;
    }

    if (item.kind === 'notes') {
        return <NotesFocusView text={item.text} />;
    }

    return null;
};

function AttachmentFocusView({ url, name, type }: { url: string; name: string; type: string }) {
    const isPdf = type === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
    const isImage = type.startsWith('image/');
    const isVideo = type.startsWith('video/');
    const isAudio = type.startsWith('audio/');

    if (isPdf) {
        return (
            <iframe
                src={url}
                title={name}
                className="h-full w-full rounded-lg border border-slate-200"
            />
        );
    }

    if (isImage) {
        return (
            <div className="flex h-full items-center justify-center overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={name} className="max-h-full max-w-full object-contain" />
            </div>
        );
    }

    if (isVideo) {
        return (
            <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-slate-900">
                <video src={url} controls className="max-h-full max-w-full">
                    <track kind="captions" />
                </video>
            </div>
        );
    }

    if (isAudio) {
        return (
            <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-8">
                <audio src={url} controls className="w-full max-w-md">
                    <track kind="captions" />
                </audio>
            </div>
        );
    }

    // Generic file — show link
    return (
        <div className="flex h-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            <div className="text-center">
                <AttachmentCollection
                    attachments={[{ id: 'focus-file', name, type, url }]}
                    variant="compact"
                />
            </div>
        </div>
    );
}

function NotesFocusView({ text }: { text: string }) {
    const sanitized = useMemo(() => DOMPurify.sanitize(text), [text]);
    // If the notes look like HTML (starts with <), render as HTML; otherwise render as preformatted text
    const isHtml = text.trim().startsWith('<');

    return (
        <div className="h-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-6">
            {isHtml ? (
                <div
                    className="prose prose-sm prose-slate max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitized }}
                />
            ) : (
                <div className="whitespace-pre-wrap text-sm text-slate-700">{text}</div>
            )}
        </div>
    );
}
