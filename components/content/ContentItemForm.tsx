'use client';

import React, { useState } from 'react';
import { id } from '@instantdb/react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { RichTextEditor } from '@/components/responses/RichTextEditor';
import { ContentAttachmentUploader } from '@/components/content/ContentAttachmentUploader';
import type { UploadedFileAttachment } from '@/lib/file-uploads';

interface ContentItemFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    categoryId: string;
    /** If provided, editing an existing item */
    existingItem?: {
        id: string;
        title: string;
        richTextContent?: string;
        linkUrl?: string;
        durationMs?: number;
        attachments?: Array<{ id: string; name: string; type: string; url: string; [k: string]: unknown }>;
    };
    nextSortOrder: number;
}

export function ContentItemForm({
    open,
    onOpenChange,
    categoryId,
    existingItem,
    nextSortOrder,
}: ContentItemFormProps) {
    const [title, setTitle] = useState(existingItem?.title ?? '');
    const [richTextContent, setRichTextContent] = useState(
        existingItem?.richTextContent ?? '',
    );
    const [linkUrl, setLinkUrl] = useState(existingItem?.linkUrl ?? '');
    const [durationHours, setDurationHours] = useState(
        existingItem?.durationMs
            ? String(existingItem.durationMs / (1000 * 60 * 60))
            : '',
    );
    const [attachments, setAttachments] = useState<UploadedFileAttachment[]>(
        (existingItem?.attachments as UploadedFileAttachment[]) ?? [],
    );
    const [saving, setSaving] = useState(false);

    const isEditing = !!existingItem;

    async function handleSave() {
        if (!title.trim()) return;
        setSaving(true);

        const now = new Date().toISOString();
        const durationMs = durationHours
            ? Math.round(parseFloat(durationHours) * 60 * 60 * 1000)
            : 0;

        try {
            if (isEditing) {
                const txs: any[] = [
                    db.tx.contentQueueItems[existingItem.id].update({
                        title: title.trim(),
                        richTextContent,
                        linkUrl: linkUrl.trim(),
                        durationMs,
                        updatedAt: now,
                    }),
                ];

                // Link new attachments
                for (const att of attachments) {
                    const existingIds = (existingItem.attachments ?? []).map(
                        (a) => a.id,
                    );
                    if (!existingIds.includes(att.id)) {
                        txs.push(
                            db.tx.contentAttachments[att.id]
                                .create({
                                    name: att.name,
                                    type: att.type,
                                    url: att.url,
                                    kind: att.kind ?? '',
                                    sizeBytes: att.sizeBytes ?? 0,
                                    width: att.width ?? 0,
                                    height: att.height ?? 0,
                                    thumbnailUrl: att.thumbnailUrl ?? '',
                                    thumbnailWidth: att.thumbnailWidth ?? 0,
                                    thumbnailHeight: att.thumbnailHeight ?? 0,
                                    blurhash: att.blurhash ?? '',
                                    durationSec: att.durationSec ?? 0,
                                    waveformPeaks: att.waveformPeaks ?? [],
                                    createdAt: now,
                                    updatedAt: now,
                                })
                                .link({ contentQueueItem: existingItem.id }),
                        );
                    }
                }

                db.transact(txs);
            } else {
                const itemId = id();
                const txs: any[] = [
                    db.tx.contentQueueItems[itemId]
                        .create({
                            title: title.trim(),
                            richTextContent,
                            linkUrl: linkUrl.trim(),
                            status: 'queued',
                            sortOrder: nextSortOrder,
                            durationMs,
                            createdAt: now,
                            updatedAt: now,
                        })
                        .link({ category: categoryId }),
                ];

                for (const att of attachments) {
                    txs.push(
                        db.tx.contentAttachments[att.id]
                            .create({
                                name: att.name,
                                type: att.type,
                                url: att.url,
                                kind: att.kind ?? '',
                                sizeBytes: att.sizeBytes ?? 0,
                                width: att.width ?? 0,
                                height: att.height ?? 0,
                                thumbnailUrl: att.thumbnailUrl ?? '',
                                thumbnailWidth: att.thumbnailWidth ?? 0,
                                thumbnailHeight: att.thumbnailHeight ?? 0,
                                blurhash: att.blurhash ?? '',
                                durationSec: att.durationSec ?? 0,
                                waveformPeaks: att.waveformPeaks ?? [],
                                createdAt: now,
                                updatedAt: now,
                            })
                            .link({ contentQueueItem: itemId }),
                    );
                }

                db.transact(txs);
            }

            onOpenChange(false);
        } catch (error) {
            console.error('Failed to save content item', error);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing ? 'Edit Content Item' : 'Add Content Item'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="item-title">Title</Label>
                        <Input
                            id="item-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="e.g., Amazing Grace"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Content</Label>
                        <RichTextEditor
                            content={richTextContent}
                            onContentChange={setRichTextContent}
                            placeholder="Rich text content..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="item-link">Link URL (optional)</Label>
                        <Input
                            id="item-link"
                            type="url"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            placeholder="https://..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="item-duration">
                            Duration override (hours, leave empty for category
                            default)
                        </Label>
                        <Input
                            id="item-duration"
                            type="number"
                            min="0"
                            step="0.5"
                            value={durationHours}
                            onChange={(e) => setDurationHours(e.target.value)}
                            placeholder="e.g., 168 (1 week)"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Attachments</Label>
                        <ContentAttachmentUploader
                            attachments={attachments}
                            onAttachmentsChange={setAttachments}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={!title.trim() || saving}
                    >
                        {saving
                            ? 'Saving...'
                            : isEditing
                              ? 'Save Changes'
                              : 'Add to Queue'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
