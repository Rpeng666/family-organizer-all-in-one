'use client';

import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { FileText, Image, Film, Mic } from 'lucide-react';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import type { TaskResponseFieldType } from '@/lib/task-response-types';
import { RESPONSE_FIELD_TYPE_LABELS } from '@/lib/task-response-types';

interface Props {
    type: TaskResponseFieldType;
    label: string;
    description?: string | null;
    required: boolean;
    richTextContent?: string | null;
    fileUrl?: string | null;
    fileName?: string | null;
    fileType?: string | null;
    fileSizeBytes?: number | null;
    thumbnailUrl?: string | null;
}

const fieldTypeIcon: Record<TaskResponseFieldType, React.ReactNode> = {
    rich_text: <FileText className="h-4 w-4" />,
    photo: <Image className="h-4 w-4" />,
    video: <Film className="h-4 w-4" />,
    audio: <Mic className="h-4 w-4" />,
    file: <FileText className="h-4 w-4" />,
};

export const ResponseFieldDisplay: React.FC<Props> = ({
    type,
    label,
    description,
    required,
    richTextContent,
    fileUrl,
    fileName,
    fileType,
    fileSizeBytes,
    thumbnailUrl,
}) => {
    const hasContent = type === 'rich_text'
        ? !!richTextContent?.trim()
        : !!fileUrl;

    const sanitizedHtml = useMemo(
        () => (richTextContent ? DOMPurify.sanitize(richTextContent) : ''),
        [richTextContent]
    );

    return (
        <div className="space-y-2">
            <div className="flex items-start gap-2">
                <span className="mt-0.5 text-slate-400">{fieldTypeIcon[type]}</span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                        {required && <span className="text-xs font-medium text-rose-500">Required</span>}
                        <span className="text-xs text-slate-400">{RESPONSE_FIELD_TYPE_LABELS[type]}</span>
                    </div>
                    {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
                </div>
            </div>

            {!hasContent ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-sm text-slate-400 italic">
                    No response provided
                </div>
            ) : type === 'rich_text' ? (
                <div
                    className="prose prose-sm prose-slate max-w-none rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5"
                    dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
            ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2">
                    <AttachmentCollection
                        attachments={[
                            {
                                id: 'field-value',
                                name: fileName || 'Uploaded file',
                                type: fileType || 'application/octet-stream',
                                url: fileUrl!,
                                sizeBytes: fileSizeBytes ?? undefined,
                                thumbnailUrl: thumbnailUrl ?? undefined,
                            },
                        ]}
                        variant="compact"
                    />
                </div>
            )}
        </div>
    );
};
