'use client';

import React, { useRef, useState } from 'react';
import { id } from '@instantdb/react';
import { Paperclip, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadFilesToS3, type UploadedFileAttachment } from '@/lib/file-uploads';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';

interface ContentAttachmentUploaderProps {
    attachments: UploadedFileAttachment[];
    onAttachmentsChange: (attachments: UploadedFileAttachment[]) => void;
    disabled?: boolean;
}

export function ContentAttachmentUploader({
    attachments,
    onAttachmentsChange,
    disabled,
}: ContentAttachmentUploaderProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        if (files.length === 0) return;

        setUploading(true);
        try {
            const uploaded = await uploadFilesToS3(files, () => id());
            onAttachmentsChange([...attachments, ...uploaded]);
        } catch (error) {
            console.error('Failed to upload files', error);
        } finally {
            setUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    }

    function handleRemove(attachmentId: string) {
        onAttachmentsChange(attachments.filter((a) => a.id !== attachmentId));
    }

    return (
        <div className="space-y-3">
            {attachments.length > 0 && (
                <div className="space-y-2">
                    <AttachmentCollection
                        attachments={attachments}
                        variant="compact"
                    />
                    <div className="flex flex-wrap gap-1">
                        {attachments.map((att) => (
                            <button
                                key={att.id}
                                type="button"
                                onClick={() => handleRemove(att.id)}
                                className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 hover:bg-red-50 hover:text-red-600"
                            >
                                <X className="h-3 w-3" />
                                {att.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled || uploading}
                    onClick={() => fileInputRef.current?.click()}
                >
                    {uploading ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                        <Paperclip className="mr-1 h-3.5 w-3.5" />
                    )}
                    {uploading ? 'Uploading...' : 'Attach files'}
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                    disabled={disabled || uploading}
                />
            </div>
        </div>
    );
}
