'use client';

import React, { useMemo, useState } from 'react';
import { id } from '@instantdb/react';
import {
    Plus,
    Play,
    Archive,
    Clock,
    GripVertical,
    Pencil,
    Trash2,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    SkipForward,
    Repeat,
} from 'lucide-react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { ContentItemForm } from '@/components/content/ContentItemForm';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import {
    checkAndAdvanceCategory,
    getLiveItem,
    getQueuedItems,
    getArchivedItems,
    getNextSortOrder,
} from '@/lib/content-queue';

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function formatDuration(ms: number): string {
    const hours = ms / (1000 * 60 * 60);
    if (hours < 24) return `${hours}h`;
    const days = hours / 24;
    if (days === 7) return '1 week';
    if (days % 7 === 0) return `${days / 7} weeks`;
    return `${days}d`;
}

export function ContentCategoryManager() {
    const { data } = db.useQuery({
        contentCategories: {
            items: {
                attachments: {},
            },
        },
    });

    const categories = useMemo(
        () => (data?.contentCategories ?? []) as any[],
        [data?.contentCategories],
    );

    const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<any>(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
        null,
    );
    const [itemFormOpen, setItemFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [showArchived, setShowArchived] = useState<Record<string, boolean>>(
        {},
    );

    // Category form state
    const [catName, setCatName] = useState('');
    const [catSlug, setCatSlug] = useState('');
    const [catDurationHours, setCatDurationHours] = useState('168'); // 1 week default
    const [catLoop, setCatLoop] = useState(false);

    function openNewCategory() {
        setEditingCategory(null);
        setCatName('');
        setCatSlug('');
        setCatDurationHours('168');
        setCatLoop(false);
        setCategoryDialogOpen(true);
    }

    function openEditCategory(cat: any) {
        setEditingCategory(cat);
        setCatName(cat.name);
        setCatSlug(cat.slug);
        setCatDurationHours(
            String(cat.defaultDurationMs / (1000 * 60 * 60)),
        );
        setCatLoop(cat.loopWhenEmpty ?? false);
        setCategoryDialogOpen(true);
    }

    function saveCategory() {
        if (!catName.trim()) return;
        const now = new Date().toISOString();
        const slug = catSlug.trim() || slugify(catName);
        const durationMs = Math.round(
            parseFloat(catDurationHours || '168') * 60 * 60 * 1000,
        );

        if (editingCategory) {
            db.transact(
                db.tx.contentCategories[editingCategory.id].update({
                    name: catName.trim(),
                    slug,
                    defaultDurationMs: durationMs,
                    loopWhenEmpty: catLoop,
                    updatedAt: now,
                }),
            );
        } else {
            db.transact(
                db.tx.contentCategories[id()].create({
                    name: catName.trim(),
                    slug,
                    defaultDurationMs: durationMs,
                    loopWhenEmpty: catLoop,
                    createdAt: now,
                    updatedAt: now,
                }),
            );
        }
        setCategoryDialogOpen(false);
    }

    function deleteCategory(catId: string) {
        db.transact(db.tx.contentCategories[catId].delete());
    }

    function openNewItem(categoryId: string) {
        setSelectedCategoryId(categoryId);
        setEditingItem(null);
        setItemFormOpen(true);
    }

    function openEditItem(categoryId: string, item: any) {
        setSelectedCategoryId(categoryId);
        setEditingItem(item);
        setItemFormOpen(true);
    }

    function deleteItem(itemId: string) {
        db.transact(db.tx.contentQueueItems[itemId].delete());
    }

    function forceAdvance(category: any) {
        const items = category.items ?? [];
        checkAndAdvanceCategory(
            items,
            { ...category, defaultDurationMs: category.defaultDurationMs },
            new Date(Date.now() + category.defaultDurationMs + 1), // fake future time
            db.tx as any,
            (txs) => db.transact(txs),
        );
    }

    function makeLive(item: any, category: any) {
        const now = new Date();
        const duration = (item.durationMs && item.durationMs > 0 ? item.durationMs : null) ?? category.defaultDurationMs;
        const liveUntil = new Date(now.getTime() + duration).toISOString();
        const txs: any[] = [];

        // Archive current live item if any
        const currentLive = (category.items ?? []).find(
            (i: any) => i.status === 'live',
        );
        if (currentLive) {
            txs.push(
                db.tx.contentQueueItems[currentLive.id].update({
                    status: 'archived',
                    archivedAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                }),
            );
        }

        txs.push(
            db.tx.contentQueueItems[item.id].update({
                status: 'live',
                liveAt: now.toISOString(),
                liveUntil,
                updatedAt: now.toISOString(),
            }),
        );

        db.transact(txs);
    }

    function archiveItem(itemId: string) {
        db.transact(
            db.tx.contentQueueItems[itemId].update({
                status: 'archived',
                archivedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }),
        );
    }

    function requeueItem(itemId: string, items: any[]) {
        db.transact(
            db.tx.contentQueueItems[itemId].update({
                status: 'queued',
                sortOrder: getNextSortOrder(items),
                archivedAt: '',
                liveAt: '',
                liveUntil: '',
                updatedAt: new Date().toISOString(),
            }),
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Content Categories</h2>
                <Button onClick={openNewCategory} size="sm">
                    <Plus className="mr-1 h-4 w-4" />
                    New Category
                </Button>
            </div>

            {categories.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                    No content categories yet. Create one to start building
                    rotation queues.
                </div>
            )}

            {categories.map((cat) => {
                const items = cat.items ?? [];
                const liveItem = getLiveItem(items);
                const queued = getQueuedItems(items);
                const archived = getArchivedItems(items);
                const isArchivedOpen = showArchived[cat.id] ?? false;

                return (
                    <div
                        key={cat.id}
                        className="rounded-lg border border-slate-200 bg-white"
                    >
                        {/* Category header */}
                        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                            <div>
                                <h3 className="font-medium text-slate-900">
                                    {cat.name}
                                </h3>
                                <p className="text-xs text-slate-500">
                                    slug: {cat.slug} &middot; default:{' '}
                                    {formatDuration(cat.defaultDurationMs)}
                                    {cat.loopWhenEmpty && (
                                        <span className="ml-1 inline-flex items-center gap-0.5 text-blue-500">
                                            <Repeat className="inline h-3 w-3" /> loop
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openNewItem(cat.id)}
                                >
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    Add Item
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditCategory(cat)}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-700"
                                    onClick={() => deleteCategory(cat.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>

                        <div className="p-4 space-y-4">
                            {/* Live item */}
                            {liveItem ? (
                                <div className="rounded-md border border-green-200 bg-green-50 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant="default"
                                                className="bg-green-600"
                                            >
                                                <Play className="mr-1 h-3 w-3" />
                                                Live
                                            </Badge>
                                            <span className="font-medium text-sm">
                                                {liveItem.title}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {liveItem.liveUntil && (
                                                <span className="text-xs text-slate-500">
                                                    <Clock className="mr-0.5 inline h-3 w-3" />
                                                    until{' '}
                                                    {new Date(
                                                        liveItem.liveUntil,
                                                    ).toLocaleDateString()}
                                                </span>
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    openEditItem(
                                                        cat.id,
                                                        liveItem,
                                                    )
                                                }
                                                title="Edit item"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() =>
                                                    archiveItem(liveItem.id)
                                                }
                                                title="Archive now"
                                            >
                                                <Archive className="h-3.5 w-3.5" />
                                            </Button>
                                            {queued.length > 0 && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() =>
                                                        forceAdvance(cat)
                                                    }
                                                    title="Skip to next"
                                                >
                                                    <SkipForward className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    {liveItem.richTextContent && (
                                        <div
                                            className="prose prose-sm max-w-none text-slate-700 [&_p]:my-0 [&_p:empty]:before:content-['\a0']"
                                            dangerouslySetInnerHTML={{
                                                __html: liveItem.richTextContent,
                                            }}
                                        />
                                    )}
                                    {liveItem.linkUrl && (
                                        <a
                                            href={liveItem.linkUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                            {liveItem.linkUrl}
                                        </a>
                                    )}
                                    {liveItem.attachments?.length > 0 && (
                                        <div className="mt-2">
                                            <AttachmentCollection
                                                attachments={
                                                    liveItem.attachments
                                                }
                                                variant="compact"
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-sm text-slate-500 italic">
                                    No live item.{' '}
                                    {queued.length > 0
                                        ? 'Click play on a queued item to make it live.'
                                        : 'Add items to the queue to get started.'}
                                </div>
                            )}

                            {/* Queued items */}
                            {queued.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-medium uppercase text-slate-400 mb-2">
                                        Queue ({queued.length})
                                    </h4>
                                    <div className="space-y-1">
                                        {queued.map((item, idx) => (
                                            <div
                                                key={item.id}
                                                className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-3 py-2"
                                            >
                                                <GripVertical className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                                                <span className="text-xs text-slate-400 w-5">
                                                    {idx + 1}
                                                </span>
                                                <span className="text-sm flex-1 truncate">
                                                    {item.title}
                                                </span>
                                                {item.durationMs > 0 && (
                                                    <span className="text-xs text-slate-400">
                                                        {formatDuration(
                                                            item.durationMs,
                                                        )}
                                                    </span>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() =>
                                                        makeLive(item, cat)
                                                    }
                                                    title="Make live now"
                                                >
                                                    <Play className="h-3 w-3 text-green-600" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0"
                                                    onClick={() =>
                                                        openEditItem(
                                                            cat.id,
                                                            item,
                                                        )
                                                    }
                                                >
                                                    <Pencil className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                                                    onClick={() =>
                                                        deleteItem(item.id)
                                                    }
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Archived items (collapsible) */}
                            {archived.length > 0 && (
                                <div>
                                    <button
                                        type="button"
                                        className="flex items-center gap-1 text-xs font-medium uppercase text-slate-400 hover:text-slate-600"
                                        onClick={() =>
                                            setShowArchived((prev) => ({
                                                ...prev,
                                                [cat.id]: !isArchivedOpen,
                                            }))
                                        }
                                    >
                                        {isArchivedOpen ? (
                                            <ChevronDown className="h-3 w-3" />
                                        ) : (
                                            <ChevronRight className="h-3 w-3" />
                                        )}
                                        Archived ({archived.length})
                                    </button>
                                    {isArchivedOpen && (
                                        <div className="mt-2 space-y-1">
                                            {archived.map((item) => (
                                                <div
                                                    key={item.id}
                                                    className="flex items-center gap-2 rounded border border-slate-100 px-3 py-2 opacity-60"
                                                >
                                                    <Archive className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" />
                                                    <span className="text-sm flex-1 truncate">
                                                        {item.title}
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0"
                                                        onClick={() =>
                                                            openEditItem(
                                                                cat.id,
                                                                item,
                                                            )
                                                        }
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 text-xs"
                                                        onClick={() =>
                                                            requeueItem(
                                                                item.id,
                                                                items,
                                                            )
                                                        }
                                                    >
                                                        Re-queue
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/* Category create/edit dialog */}
            <Dialog
                open={categoryDialogOpen}
                onOpenChange={setCategoryDialogOpen}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingCategory
                                ? 'Edit Category'
                                : 'New Content Category'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="cat-name">Name</Label>
                            <Input
                                id="cat-name"
                                value={catName}
                                onChange={(e) => {
                                    setCatName(e.target.value);
                                    if (!editingCategory) {
                                        setCatSlug(slugify(e.target.value));
                                    }
                                }}
                                placeholder="e.g., Hymn of the Week"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cat-slug">
                                Slug (for API/widgets)
                            </Label>
                            <Input
                                id="cat-slug"
                                value={catSlug}
                                onChange={(e) => setCatSlug(e.target.value)}
                                placeholder="e.g., hymn-of-the-week"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="cat-duration">
                                Default rotation duration (hours)
                            </Label>
                            <Input
                                id="cat-duration"
                                type="number"
                                min="1"
                                step="1"
                                value={catDurationHours}
                                onChange={(e) =>
                                    setCatDurationHours(e.target.value)
                                }
                                placeholder="168 = 1 week"
                            />
                        </div>
                        <label className="flex items-center justify-between gap-3">
                            <div>
                                <span className="text-sm font-medium text-slate-700">Loop when finished</span>
                                <p className="text-xs text-slate-400">
                                    Automatically restart from the beginning when all items have been shown
                                </p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={catLoop}
                                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                    catLoop ? 'bg-blue-600' : 'bg-slate-200'
                                }`}
                                onClick={() => setCatLoop(!catLoop)}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                        catLoop ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </label>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCategoryDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={saveCategory}
                            disabled={!catName.trim()}
                        >
                            {editingCategory ? 'Save' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Content item form dialog */}
            {selectedCategoryId && (
                <ContentItemForm
                    key={editingItem?.id ?? 'new'}
                    open={itemFormOpen}
                    onOpenChange={setItemFormOpen}
                    categoryId={selectedCategoryId}
                    existingItem={editingItem}
                    nextSortOrder={getNextSortOrder(
                        categories.find(
                            (c: any) => c.id === selectedCategoryId,
                        )?.items ?? [],
                    )}
                />
            )}
        </div>
    );
}
