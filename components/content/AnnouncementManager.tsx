'use client';

import React, { useMemo, useState } from 'react';
import {
    Plus,
    Pencil,
    Trash2,
    ExternalLink,
    ChevronDown,
    ChevronRight,
    RotateCcw,
    Megaphone,
    Calendar,
} from 'lucide-react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { AnnouncementForm } from '@/components/content/AnnouncementForm';
import {
    checkAnnouncementExpiry,
    getActiveAnnouncements,
    getArchivedAnnouncements,
} from '@/lib/announcement-utils';

export function AnnouncementManager() {
    const { data } = db.useQuery({
        announcements: {
            attachments: {},
        },
    });

    const announcements = useMemo(
        () => (data?.announcements ?? []) as any[],
        [data?.announcements],
    );

    // Lazy expiry check on render
    useMemo(() => {
        if (announcements.length > 0) {
            checkAnnouncementExpiry(
                announcements,
                new Date(),
                db.tx as any,
                (txs) => db.transact(txs),
            );
        }
    }, [announcements]);

    const active = useMemo(
        () => getActiveAnnouncements(announcements) as any[],
        [announcements],
    );
    const archived = useMemo(
        () => getArchivedAnnouncements(announcements) as any[],
        [announcements],
    );

    const [formOpen, setFormOpen] = useState(false);
    const [editingAnn, setEditingAnn] = useState<any>(null);
    const [showArchived, setShowArchived] = useState(false);

    function openNew() {
        setEditingAnn(null);
        setFormOpen(true);
    }

    function openEdit(ann: any) {
        setEditingAnn(ann);
        setFormOpen(true);
    }

    function deleteAnnouncement(annId: string) {
        db.transact(db.tx.announcements[annId].delete());
    }

    function reactivate(ann: any) {
        db.transact(
            db.tx.announcements[ann.id].update({
                isActive: true,
                archivedAt: '',
                expiresAt: '',
                updatedAt: new Date().toISOString(),
            }),
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Announcements</h2>
                <Button onClick={openNew} size="sm">
                    <Plus className="mr-1 h-4 w-4" />
                    New Announcement
                </Button>
            </div>

            {active.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    No active announcements. Create one to display on the
                    dashboard.
                </div>
            )}

            <div className="space-y-3">
                {active.map((ann) => (
                    <div
                        key={ann.id}
                        className="rounded-lg border border-slate-200 bg-white p-4"
                    >
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Megaphone className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                <h3 className="font-medium text-slate-900">
                                    {ann.title}
                                </h3>
                                <Badge
                                    variant="default"
                                    className="bg-green-100 text-green-700 text-xs"
                                >
                                    Active
                                </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEdit(ann)}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-700"
                                    onClick={() => deleteAnnouncement(ann.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>

                        {ann.richTextContent && (
                            <div
                                className="prose prose-sm max-w-none text-slate-700 mb-2"
                                dangerouslySetInnerHTML={{
                                    __html: ann.richTextContent,
                                }}
                            />
                        )}

                        {ann.linkUrl && (
                            <a
                                href={ann.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mb-2"
                            >
                                <ExternalLink className="h-3 w-3" />
                                {ann.linkUrl}
                            </a>
                        )}

                        {ann.attachments?.length > 0 && (
                            <AttachmentCollection
                                attachments={ann.attachments}
                                variant="compact"
                            />
                        )}

                        {ann.expiresAt && (
                            <div className="mt-2 text-xs text-slate-400">
                                <Calendar className="mr-0.5 inline h-3 w-3" />
                                Expires:{' '}
                                {new Date(ann.expiresAt).toLocaleDateString()}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Archived announcements */}
            {archived.length > 0 && (
                <div>
                    <button
                        type="button"
                        className="flex items-center gap-1 text-xs font-medium uppercase text-slate-400 hover:text-slate-600"
                        onClick={() => setShowArchived(!showArchived)}
                    >
                        {showArchived ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )}
                        Archived ({archived.length})
                    </button>
                    {showArchived && (
                        <div className="mt-2 space-y-2">
                            {archived.map((ann) => (
                                <div
                                    key={ann.id}
                                    className="rounded-lg border border-slate-100 p-3 opacity-60"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">
                                            {ann.title}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => reactivate(ann)}
                                                title="Reactivate"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => openEdit(ann)}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-red-500 hover:text-red-700"
                                                onClick={() =>
                                                    deleteAnnouncement(ann.id)
                                                }
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <AnnouncementForm
                open={formOpen}
                onOpenChange={setFormOpen}
                existingAnnouncement={editingAnn}
            />
        </div>
    );
}
