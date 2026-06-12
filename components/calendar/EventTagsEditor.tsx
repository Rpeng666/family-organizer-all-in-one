'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { normalizeCalendarTagKey } from '@/lib/calendar-tags';

interface CalendarTag {
    id?: string;
    name: string;
    normalizedName?: string;
}

interface EventTagsEditorProps {
    selectedTags: CalendarTag[];
    tagDraft: string;
    tagSuggestions: CalendarTag[];
    disabled?: boolean;
    onTagDraftInput: (value: string) => void;
    onAddTagDraft: () => void;
    onRemoveTag: (tagKey: string) => void;
    onAddTags: (tags: Array<CalendarTag | string>) => void;
}

export function EventTagsEditor({
    selectedTags,
    tagDraft,
    tagSuggestions,
    disabled = false,
    onTagDraftInput,
    onAddTagDraft,
    onRemoveTag,
    onAddTags,
}: EventTagsEditorProps) {
    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Label htmlFor="event-tag-input">Tags</Label>
                <p className="text-xs text-muted-foreground">Reusable labels for future calendar filters</p>
            </div>
            {selectedTags.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                    No tags yet. Add one or more labels to group related calendar events.
                </p>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {selectedTags.map((tag) => {
                        const tagKey = String(tag.normalizedName || normalizeCalendarTagKey(tag.name)).trim();
                        return (
                            <button
                                key={tagKey}
                                type="button"
                                onClick={() => onRemoveTag(tagKey)}
                                disabled={disabled}
                                className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <span>{tag.name}</span>
                                <span className="text-[11px] uppercase tracking-wide text-sky-700">Remove</span>
                            </button>
                        );
                    })}
                </div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                    id="event-tag-input"
                    value={tagDraft}
                    onChange={(event) => onTagDraftInput(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            onAddTagDraft();
                        }
                    }}
                    placeholder="School, travel, birthday"
                    disabled={disabled}
                />
                <Button type="button" variant="outline" onClick={onAddTagDraft} disabled={disabled}>
                    Add Tag
                </Button>
            </div>
            {tagSuggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                    {tagSuggestions.map((tag) => (
                        <Button
                            key={String(tag.normalizedName || normalizeCalendarTagKey(tag.name))}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onAddTags([tag])}
                            disabled={disabled}
                            className="rounded-full"
                        >
                            {tag.name}
                        </Button>
                    ))}
                </div>
            ) : null}
            <p className="text-xs text-muted-foreground">
                Type a label and press Enter, click Add Tag, or separate multiple tags with commas.
            </p>
        </div>
    );
}
