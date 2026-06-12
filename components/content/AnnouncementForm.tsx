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

interface AnnouncementFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    existingAnnouncement?: {
        id: string;
        title: string;
        richTextContent?: string;
        linkUrl?: string;
        expiresAt?: string;
        attachments?: Array<{ id: string; name: string; type: string; url: string; [k: string]: unknown }>;
    };
}

export function AnnouncementForm({
    open,
    onOpenChange,
    existingAnnouncement,
}: AnnouncementFormProps) {
    const [title, setTitle] = useState(existingAnnouncement?.title ?? '');
    const [richTextContent, setRichTextContent] = useState(
        existingAnnouncement?.richTextContent ?? '',
    );
    const [linkUrl, setLinkUrl] = useState(
        existingAnnouncement?.linkUrl ?? '',
    );
    const [expiresAt, setExpiresAt] = useState(
        existingAnnouncement?.expiresAt
            ? existingAnnouncement.expiresAt.split('T')[0]
            : '',
    );
    const [attachments, setAttachments] = useState<UploadedFileAttachment[]>(
        (existingAnnouncement?.attachments as UploadedFileAttachment[]) ?? [],
    );
    const [saving, setSaving] = useState(false);

    const isEditing = !!existingAnnouncement;

    async function handleSave() {
        if (!title.trim()) return;
        setSaving(true);

        const now = new Date().toISOString();
        const expiresIso = expiresAt
            ? new Date(expiresAt + 'T23:59:59').toISOString()
            : '';

        try {
            if (isEditing) {
                const txs: any[] = [
                    db.tx.announcements[existingAnnouncement.id].update({
                        title: title.trim(),
                        richTextContent,
                        linkUrl: linkUrl.trim(),
                        expiresAt: expiresIso,
                        isActive: true,
                        archivedAt: '',
                        updatedAt: now,
                    }),
                ];

                for (const att of attachments) {
                    const existingIds = (
                        existingAnnouncement.attachments ?? []
                    ).map((a) => a.id);
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
                                .link({
                                    announcement: existingAnnouncement.id,
                                }),
                        );
                    }
                }

                db.transact(txs);
            } else {
                const annId = id();
                const txs: any[] = [
                    db.tx.announcements[annId].create({
                        title: title.trim(),
                        richTextContent,
                        linkUrl: linkUrl.trim(),
                        expiresAt: expiresIso,
                        isActive: true,
                        createdAt: now,
                        updatedAt: now,
                        createdByFamilyMemberId: '',
                    }),
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
                            .link({ announcement: annId }),
                    );
                }

                db.transact(txs);
            }

            onOpenChange(false);
        } catch (error) {
            console.error('Failed to save announcement', error);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing
                            ? 'Edit Announcement'
                            : 'New Announcement'}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="ann-title">Title</Label>
                        <Input
                            id="ann-title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Announcement title"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Content</Label>
                        <RichTextEditor
                            content={richTextContent}
                            onContentChange={setRichTextContent}
                            placeholder="Announcement content..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="ann-link">Link URL (optional)</Label>
                        <Input
                            id="ann-link"
                            type="url"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            placeholder="https://..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="ann-expires">
                            Expiration date (optional)
                        </Label>
                        <Input
                            id="ann-expires"
                            type="date"
                            value={expiresAt}
                            onChange={(e) => setExpiresAt(e.target.value)}
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
                              : 'Create'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
