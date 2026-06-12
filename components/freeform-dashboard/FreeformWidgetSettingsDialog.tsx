'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import type { ConfigField, DashboardWidgetRecord, FreeformWidgetMeta } from '@/lib/freeform-dashboard/types';
import { getPhotoUrl } from '@/lib/photo-urls';
import { db } from '@/lib/db';

interface FreeformWidgetSettingsDialogProps {
    widget: DashboardWidgetRecord;
    meta: FreeformWidgetMeta;
    familyMembers: { id: string; name: string; photoUrls?: Record<string, string> | null }[];
    onSave: (widgetId: string, config: Record<string, unknown>) => void;
    onClose: () => void;
}

export default function FreeformWidgetSettingsDialog({
    widget,
    meta,
    familyMembers,
    onSave,
    onClose,
}: FreeformWidgetSettingsDialogProps) {
    const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...(widget.config ?? {}) }));

    // ── Dragging state ──────────────────────────────────────────────
    const dialogRef = useRef<HTMLDivElement>(null);
    const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef<{ mouseX: number; mouseY: number; offsetX: number; offsetY: number } | null>(null);

    const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
        // Only drag from header area
        e.preventDefault();
        setIsDragging(true);
        dragStartRef.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            offsetX: dragOffset.x,
            offsetY: dragOffset.y,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [dragOffset]);

    const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging || !dragStartRef.current) return;
        setDragOffset({
            x: dragStartRef.current.offsetX + (e.clientX - dragStartRef.current.mouseX),
            y: dragStartRef.current.offsetY + (e.clientY - dragStartRef.current.mouseY),
        });
    }, [isDragging]);

    const handleDragPointerUp = useCallback(() => {
        setIsDragging(false);
        dragStartRef.current = null;
    }, []);

    // ── Real-time save: push draft to parent whenever it changes ────
    const isFirstRender = useRef(true);
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        onSave(widget.id, draft);
    }, [draft, onSave, widget.id]);

    // Inject a "Content Scale" range field so every widget gets it
    const CONTENT_SCALE_FIELD: ConfigField = {
        key: 'contentScale',
        label: 'Content Scale',
        type: 'range',
        min: 50,
        max: 200,
        step: 1,
    };
    const fields: ConfigField[] = [...(meta.configFields ?? []), CONTENT_SCALE_FIELD];

    // Query content categories for content-category config fields
    const hasContentCategoryField = fields.some((f) => f.type === 'content-category');
    const { data: ccData } = db.useQuery(
        hasContentCategoryField ? { contentCategories: {} } : null,
    );
    const contentCategories = useMemo(
        () => (ccData?.contentCategories ?? []) as any[],
        [ccData?.contentCategories],
    );

    const renderField = (field: ConfigField) => {
        const value = draft[field.key];

        switch (field.type) {
            case 'boolean':
                return (
                    <label key={field.key} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-sm font-medium text-slate-700">{field.label}</span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(value)}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                                value ? 'bg-blue-600' : 'bg-slate-200'
                            }`}
                            onClick={() => setDraft((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                        >
                            <span
                                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                                    value ? 'translate-x-5' : 'translate-x-0'
                                }`}
                            />
                        </button>
                    </label>
                );

            case 'number':
                return (
                    <label key={field.key} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-sm font-medium text-slate-700">{field.label}</span>
                        <input
                            type="number"
                            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
                            value={typeof value === 'number' ? value : ''}
                            min={field.min}
                            max={field.max}
                            onChange={(e) => {
                                const num = parseInt(e.target.value, 10);
                                setDraft((prev) => ({ ...prev, [field.key]: Number.isFinite(num) ? num : undefined }));
                            }}
                        />
                    </label>
                );

            case 'string':
                return (
                    <label key={field.key} className="flex flex-col gap-1 py-2">
                        <span className="text-sm font-medium text-slate-700">{field.label}</span>
                        <input
                            type="text"
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300"
                            value={typeof value === 'string' ? value : ''}
                            onChange={(e) => setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        />
                    </label>
                );

            case 'family-member':
                return (
                    <div key={field.key} className="py-2">
                        <span className="mb-2 block text-sm font-medium text-slate-700">{field.label}</span>
                        <div className="grid grid-cols-3 gap-2">
                            {familyMembers.map((member) => {
                                const selected = value === member.id;
                                const photoUrl = getPhotoUrl(member.photoUrls, '64');
                                return (
                                    <button
                                        key={member.id}
                                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                                            selected
                                                ? 'border-blue-400 bg-blue-50'
                                                : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                                        }`}
                                        onClick={() => setDraft((prev) => ({ ...prev, [field.key]: member.id }))}
                                    >
                                        {photoUrl ? (
                                            <img
                                                src={photoUrl}
                                                alt={member.name}
                                                className="h-8 w-8 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600">
                                                {member.name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <span className="text-xs font-medium text-slate-700">{member.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );

            case 'range': {
                const rangeVal = typeof value === 'number' ? value : (field.key === 'contentScale' ? 100 : (field.min ?? 0));
                const displayLabel = field.formatValue
                    ? field.formatValue(rangeVal)
                    : field.key === 'contentScale'
                        ? `${rangeVal}%`
                        : String(rangeVal);
                return (
                    <label key={field.key} className="flex flex-col gap-2 py-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-slate-700">{field.label}</span>
                            <span className="text-sm tabular-nums text-slate-500">{displayLabel}</span>
                        </div>
                        <input
                            type="range"
                            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600"
                            min={field.min ?? 50}
                            max={field.max ?? 200}
                            step={field.step ?? 1}
                            value={rangeVal}
                            onChange={(e) => {
                                const num = parseFloat(e.target.value);
                                setDraft((prev) => ({ ...prev, [field.key]: num }));
                            }}
                        />
                        <div className="flex justify-between text-[10px] text-slate-400">
                            <span>{field.min ?? 50}{field.key === 'contentScale' ? '%' : ''}</span>
                            <span>{field.max ?? 200}{field.key === 'contentScale' ? '%' : ''}</span>
                        </div>
                    </label>
                );
            }

            case 'family-members':
                return (
                    <div key={field.key} className="py-2">
                        <span className="mb-2 block text-sm font-medium text-slate-700">{field.label}</span>
                        <div className="grid grid-cols-3 gap-2">
                            {familyMembers.map((member) => {
                                const selectedIds = Array.isArray(value) ? (value as string[]) : [];
                                const selected = selectedIds.includes(member.id);
                                const photoUrl = getPhotoUrl(member.photoUrls, '64');
                                return (
                                    <button
                                        key={member.id}
                                        className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-colors ${
                                            selected
                                                ? 'border-blue-400 bg-blue-50'
                                                : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                                        }`}
                                        onClick={() => {
                                            setDraft((prev) => {
                                                const prevIds = Array.isArray(prev[field.key]) ? (prev[field.key] as string[]) : [];
                                                const next = selected
                                                    ? prevIds.filter((id) => id !== member.id)
                                                    : [...prevIds, member.id];
                                                return { ...prev, [field.key]: next };
                                            });
                                        }}
                                    >
                                        {photoUrl ? (
                                            <img
                                                src={photoUrl}
                                                alt={member.name}
                                                className={`h-8 w-8 rounded-full object-cover ${selected ? '' : 'opacity-40'}`}
                                            />
                                        ) : (
                                            <div
                                                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                                                    selected ? 'bg-blue-200 text-blue-700' : 'bg-slate-200 text-slate-600 opacity-40'
                                                }`}
                                            >
                                                {member.name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                        <span className="text-xs font-medium text-slate-700">{member.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {(!Array.isArray(value) || (value as string[]).length === 0) && (
                            <p className="mt-1.5 text-xs text-slate-400">None selected — showing all members</p>
                        )}
                    </div>
                );

            case 'content-category':
                return (
                    <div key={field.key} className="py-2">
                        <span className="mb-2 block text-sm font-medium text-slate-700">{field.label}</span>
                        {contentCategories.length === 0 ? (
                            <p className="text-xs text-slate-400">No content categories created yet. Create one on the Content page first.</p>
                        ) : (
                            <div className="space-y-1">
                                {contentCategories.map((cat: any) => {
                                    const selected = value === cat.slug;
                                    return (
                                        <button
                                            key={cat.id}
                                            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                                                selected
                                                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                                                    : 'border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                                            }`}
                                            onClick={() => setDraft((prev) => ({ ...prev, [field.key]: cat.slug }))}
                                        >
                                            <span className="font-medium">{cat.name}</span>
                                            <span className="text-xs text-slate-400">{cat.slug}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );

            case 'select':
                return (
                    <div key={field.key} className="py-2">
                        <span className="mb-2 block text-sm font-medium text-slate-700">{field.label}</span>
                        <div className="flex gap-1.5">
                            {(field.options ?? []).map((opt) => {
                                const selected = value === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                                            selected
                                                ? 'border-blue-400 bg-blue-50 text-blue-700'
                                                : 'border-slate-200 text-slate-600 hover:border-blue-300 hover:bg-blue-50'
                                        }`}
                                        onClick={() => setDraft((prev) => ({ ...prev, [field.key]: opt.value }))}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
            <div
                ref={dialogRef}
                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                style={{
                    transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Draggable header */}
                <div
                    className={`mb-4 flex items-center justify-between ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    onPointerDown={handleDragPointerDown}
                    onPointerMove={handleDragPointerMove}
                    onPointerUp={handleDragPointerUp}
                >
                    <h2 className="select-none text-lg font-semibold text-slate-900">{meta.label} Settings</h2>
                    <button
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        onClick={onClose}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
                    {fields.map(renderField)}
                </div>

                {fields.length === 0 && (
                    <p className="py-4 text-center text-sm text-slate-400">No configurable settings for this widget.</p>
                )}

                <div className="mt-6 flex justify-end">
                    <button
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        onClick={onClose}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
