'use client';

import React from 'react';
import { History, Clock } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { getSortedVersions } from '@/lib/family-rules';
import { Badge } from '@/components/ui/badge';

interface FamilyRuleHistoryDialogProps {
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
            editNote?: string;
            createdByFamilyMemberId?: string;
            createdAt: string;
            attachments?: Array<Record<string, unknown>>;
        }>;
    };
}

export function FamilyRuleHistoryDialog({
    open,
    onOpenChange,
    rule,
}: FamilyRuleHistoryDialogProps) {
    const versions = getSortedVersions((rule.versions ?? []) as any[]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <History className="h-5 w-5" />
                        Version History: {rule.title}
                    </DialogTitle>
                </DialogHeader>

                <div className="py-4">
                    {versions.length === 0 ? (
                        <p className="text-sm text-slate-500">
                            No version history available.
                        </p>
                    ) : (
                        <div className="relative space-y-0">
                            {/* Timeline line */}
                            <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />

                            {versions.map((version, idx) => {
                                const isActive =
                                    version.id === rule.activeVersionId;
                                return (
                                    <div
                                        key={version.id}
                                        className="relative pl-8 pb-6"
                                    >
                                        {/* Timeline dot */}
                                        <div
                                            className={`absolute left-1.5 top-1.5 h-3 w-3 rounded-full border-2 ${
                                                isActive
                                                    ? 'border-blue-500 bg-blue-500'
                                                    : 'border-slate-300 bg-white'
                                            }`}
                                        />

                                        <div
                                            className={`rounded-lg border p-3 ${
                                                isActive
                                                    ? 'border-blue-200 bg-blue-50'
                                                    : 'border-slate-100 bg-white'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-medium text-slate-600">
                                                    v{version.versionNumber}
                                                </span>
                                                {isActive && (
                                                    <Badge
                                                        variant="default"
                                                        className="bg-blue-600 text-xs"
                                                    >
                                                        Current
                                                    </Badge>
                                                )}
                                                <span className="text-xs text-slate-400 ml-auto">
                                                    <Clock className="mr-0.5 inline h-3 w-3" />
                                                    {new Date(
                                                        version.createdAt,
                                                    ).toLocaleString()}
                                                </span>
                                            </div>

                                            {version.editNote && (
                                                <p className="text-xs text-slate-500 italic mb-2">
                                                    &ldquo;{version.editNote}
                                                    &rdquo;
                                                </p>
                                            )}

                                            <div
                                                className="prose prose-sm max-w-none text-slate-700"
                                                dangerouslySetInnerHTML={{
                                                    __html: version.richTextContent,
                                                }}
                                            />

                                            {(version.attachments as any[])
                                                ?.length > 0 && (
                                                <div className="mt-2">
                                                    <AttachmentCollection
                                                        attachments={
                                                            version.attachments as any[]
                                                        }
                                                        variant="compact"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
