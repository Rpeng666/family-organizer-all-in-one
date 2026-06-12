'use client';

import React, { useState } from 'react';
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
import {
    buildCreateVersionTransactions,
    getNextVersionNumber,
} from '@/lib/family-rules';
import type { UploadedFileAttachment } from '@/lib/file-uploads';

interface FamilyRuleEditorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    rule: {
        id: string;
        title: string;
        activeVersionId: string;
        versions?: Array<{
            id: string;
            richTextContent: string;
            versionNumber: number;
            attachments?: Array<{ id: string; name: string; type: string; url: string; [k: string]: unknown }>;
        }>;
    };
}

export function FamilyRuleEditor({
    open,
    onOpenChange,
    rule,
}: FamilyRuleEditorProps) {
    const versions = (rule.versions ?? []) as any[];
    const activeVersion = versions.find(
        (v) => v.id === rule.activeVersionId,
    );

    const [richTextContent, setRichTextContent] = useState(
        activeVersion?.richTextContent ?? '',
    );
    const [editNote, setEditNote] = useState('');
    const [attachments, setAttachments] = useState<UploadedFileAttachment[]>(
        (activeVersion?.attachments as UploadedFileAttachment[]) ?? [],
    );
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        if (!richTextContent.trim()) return;
        setSaving(true);

        try {
            const versionNumber = getNextVersionNumber(versions);
            const newAttachmentIds = attachments
                .filter(
                    (att) =>
                        !(activeVersion?.attachments ?? []).some(
                            (a: any) => a.id === att.id,
                        ),
                )
                .map((att) => att.id);

            // Create attachment records for new ones
            const now = new Date().toISOString();
            const attTxs: any[] = [];
            for (const att of attachments) {
                if (
                    !(activeVersion?.attachments ?? []).some(
                        (a: any) => a.id === att.id,
                    )
                ) {
                    attTxs.push(
                        db.tx.contentAttachments[att.id].create({
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
                        }),
                    );
                }
            }

            const { transactions } = buildCreateVersionTransactions(
                rule.id,
                rule.activeVersionId || null,
                richTextContent,
                editNote || undefined,
                versionNumber,
                undefined,
                newAttachmentIds,
                db.tx as any,
            );

            db.transact([...attTxs, ...transactions]);
            onOpenChange(false);
        } catch (error) {
            console.error('Failed to save rule version', error);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Rule: {rule.title}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {activeVersion && (
                        <p className="text-xs text-slate-400">
                            Editing version {activeVersion.versionNumber}.
                            Saving will create version{' '}
                            {getNextVersionNumber(versions)}.
                        </p>
                    )}

                    <div className="space-y-2">
                        <Label>Rule Content</Label>
                        <RichTextEditor
                            content={richTextContent}
                            onContentChange={setRichTextContent}
                            placeholder="Define the family rule..."
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="edit-note">
                            Edit note (optional)
                        </Label>
                        <Input
                            id="edit-note"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            placeholder="What changed?"
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
                        disabled={!richTextContent.trim() || saving}
                    >
                        {saving ? 'Saving...' : 'Save New Version'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
