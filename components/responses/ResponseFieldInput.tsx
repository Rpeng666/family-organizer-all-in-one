'use client';

import React, { useRef } from 'react';
import { Upload, X, FileText, Image, Film, Mic, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/responses/RichTextEditor';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import type { TaskResponseFieldType } from '@/lib/task-response-types';
import { RESPONSE_FIELD_TYPE_LABELS } from '@/lib/task-response-types';

interface Props {
    fieldId: string;
    type: TaskResponseFieldType;
    label: string;
    description?: string | null;
    required: boolean;
    /** Current rich text content (for rich_text type). */
    richTextContent?: string | null;
    /** Current file URL (for media/file types). */
    fileUrl?: string | null;
    fileName?: string | null;
    fileType?: string | null;
    /** Called when rich text changes. */
    onRichTextChange?: (content: string) => void;
    /** Called when files are selected for upload. */
    onFileSelect?: (files: File[]) => void;
    /** Called to clear the current file. */
    onFileClear?: () => void;
    isUploading?: boolean;
    disabled?: boolean;
    onExpand?: () => void;
}

const fieldTypeIcon: Record<TaskResponseFieldType, React.ReactNode> = {
    rich_text: <FileText className="h-4 w-4" />,
    photo: <Image className="h-4 w-4" />,
    video: <Film className="h-4 w-4" />,
    audio: <Mic className="h-4 w-4" />,
    file: <FileText className="h-4 w-4" />,
};

const acceptMap: Record<string, string> = {
    photo: 'image/*',
    video: 'video/*',
    audio: 'audio/*',
    file: '*/*',
};

export const ResponseFieldInput: React.FC<Props> = ({
    fieldId,
    type,
    label,
    description,
    required,
    richTextContent,
    fileUrl,
    fileName,
    fileType,
    onRichTextChange,
    onFileSelect,
    onFileClear,
    isUploading,
    disabled,
    onExpand,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            onFileSelect?.(Array.from(files));
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (type === 'rich_text') {
        // For rich text fields, the toolbar makes the type obvious. Hide the
        // generic "Rich Text" label — but keep custom labels, descriptions,
        // and the required badge visible.
        const isGenericRichTextLabel =
            label.toLowerCase().replace(/[\s_-]+/g, '') === 'richtext';
        const effectiveLabel = isGenericRichTextLabel ? '' : label;
        const showHeader =
            effectiveLabel.length > 0 || required || (description && description.trim().length > 0);

        return (
            <div className="space-y-2">
                {showHeader && (
                    <FieldHeader type={type} label={effectiveLabel} description={description} required={required} />
                )}
                <RichTextEditor
                    content={richTextContent || ''}
                    onContentChange={(html) => onRichTextChange?.(html)}
                    disabled={disabled}
                    onExpand={onExpand}
                />
            </div>
        );
    }

    // Media / file type
    return (
        <div className="space-y-2">
            <FieldHeader type={type} label={label} description={description} required={required} />
            {fileUrl ? (
                <div className="space-y-2">
                    {/* Interactive preview: images open lightbox, audio shows waveform,
                        video shows poster/player, files open preview dialog.
                        Constrain width so images/video don't blow up to full card width;
                        audio waveforms benefit from more width so use a wider cap. */}
                    <div className={type === 'audio' ? 'max-w-md' : 'max-w-xs'}>
                        <AttachmentCollection
                            attachments={[{
                                id: fieldId,
                                name: fileName || RESPONSE_FIELD_TYPE_LABELS[type],
                                type: fileType || acceptMap[type] || '',
                                url: fileUrl,
                            }]}
                            variant="compact"
                        />
                    </div>
                    {/* Replace / remove controls */}
                    {!disabled && (
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <RefreshCw className="mr-1.5 h-3 w-3" />
                                Replace
                            </Button>
                            <button
                                type="button"
                                onClick={onFileClear}
                                className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                                title="Remove file"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={acceptMap[type] || '*/*'}
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-6">
                    {isUploading ? (
                        <>
                            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                            <p className="text-sm text-slate-500">Uploading...</p>
                        </>
                    ) : (
                        <>
                            <div className="rounded-full bg-slate-100 p-2 text-slate-400">
                                {fieldTypeIcon[type]}
                            </div>
                            <p className="text-sm text-slate-500">
                                Upload {RESPONSE_FIELD_TYPE_LABELS[type].toLowerCase()}
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={disabled}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="mr-1.5 h-3.5 w-3.5" />
                                Choose file
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={acceptMap[type] || '*/*'}
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

function FieldHeader({
    label,
    description,
    required,
}: {
    type?: TaskResponseFieldType;
    label: string;
    description?: string | null;
    required: boolean;
}) {
    return (
        <div>
            <div className="flex items-center gap-1.5">
                {label ? <span className="text-sm font-medium text-slate-800">{label}</span> : null}
                {required && (
                    <span className="text-xs font-medium text-rose-500">Required</span>
                )}
            </div>
            {description && (
                <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            )}
        </div>
    );
}

