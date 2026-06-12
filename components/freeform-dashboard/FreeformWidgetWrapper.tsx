'use client';

import React, { useCallback, useState } from 'react';
import { Settings2, X } from 'lucide-react';
import type { DashboardWidgetRecord, FreeformWidgetMeta, ResizeHandle, WidgetRect } from '@/lib/freeform-dashboard/types';

interface FreeformWidgetWrapperProps {
    widget: DashboardWidgetRecord;
    meta: FreeformWidgetMeta | undefined;
    editMode: boolean;
    /** Override position during drag/resize */
    overrideRect?: { x: number; y: number; w: number; h: number } | null;
    onDragStart?: (e: React.PointerEvent, widgetId: string, rect: WidgetRect) => void;
    onResizeStart?: (e: React.PointerEvent, widgetId: string, handle: ResizeHandle, rect: WidgetRect) => void;
    onClick?: (widgetId: string) => void;
    onDoubleClick?: (widgetId: string) => void;
    onDelete?: (widgetId: string) => void;
    hasAlignedEdges?: boolean;
    shiftHeld?: boolean;
    children: React.ReactNode;
}

const HANDLE_STYLES: Record<ResizeHandle, string> = {
    top: 'absolute -top-1 left-2 right-2 h-2 cursor-ns-resize',
    bottom: 'absolute -bottom-1 left-2 right-2 h-2 cursor-ns-resize',
    left: 'absolute top-2 -left-1 bottom-2 w-2 cursor-ew-resize',
    right: 'absolute top-2 -right-1 bottom-2 w-2 cursor-ew-resize',
    'top-left': 'absolute -top-1 -left-1 h-3 w-3 cursor-nwse-resize',
    'top-right': 'absolute -top-1 -right-1 h-3 w-3 cursor-nesw-resize',
    'bottom-left': 'absolute -bottom-1 -left-1 h-3 w-3 cursor-nesw-resize',
    'bottom-right': 'absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize',
};

const ALL_HANDLES: ResizeHandle[] = ['top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];

export default function FreeformWidgetWrapper({
    widget,
    meta,
    editMode,
    overrideRect,
    onDragStart,
    onResizeStart,
    onClick,
    onDoubleClick,
    onDelete,
    hasAlignedEdges,
    shiftHeld,
    children,
}: FreeformWidgetWrapperProps) {
    const [showTooltip, setShowTooltip] = useState(false);

    const rect = overrideRect ?? { x: widget.x, y: widget.y, w: widget.w, h: widget.h };

    const handleDragStart = useCallback(
        (e: React.PointerEvent) => {
            if (!editMode || !onDragStart) return;
            onDragStart(e, widget.id, { id: widget.id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, z: widget.z });
        },
        [editMode, onDragStart, widget, rect]
    );

    const handleResizeStart = useCallback(
        (e: React.PointerEvent, handle: ResizeHandle) => {
            if (!editMode || !onResizeStart) return;
            onResizeStart(e, widget.id, handle, { id: widget.id, x: rect.x, y: rect.y, w: rect.w, h: rect.h, z: widget.z });
        },
        [editMode, onResizeStart, widget, rect]
    );

    const handleClick = useCallback(() => {
        if (editMode && onClick) {
            onClick(widget.id);
        }
    }, [editMode, onClick, widget.id]);

    const handleDoubleClick = useCallback(() => {
        if (editMode && onDoubleClick) {
            onDoubleClick(widget.id);
        }
    }, [editMode, onDoubleClick, widget.id]);

    return (
        <div
            className={`absolute ${editMode ? 'border border-dashed border-slate-400/60' : ''}`}
            style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                zIndex: widget.z,
            }}
            onClick={handleClick}
            onDoubleClick={handleDoubleClick}
        >
            {/* Widget content with overflow hidden for truncation */}
            <div
                className="h-full w-full overflow-hidden rounded-lg"
                style={{
                    backgroundColor: 'var(--fd-panel)',
                    border: '2px solid var(--fd-canvas)',
                }}
            >
                {children}
            </div>

            {/* Edit mode overlay & controls */}
            {editMode && (
                <>
                    {/* Drag handle area (top portion) */}
                    <div
                        className="absolute inset-x-0 top-0 h-8 cursor-move"
                        onPointerDown={handleDragStart}
                    />

                    {/* Widget type label */}
                    <div className="pointer-events-none absolute left-1 top-1 rounded bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {meta?.label ?? widget.widgetType}
                    </div>

                    {/* Settings button (always shown — contentScale is available for all widgets) */}
                    {onDoubleClick && (
                        <button
                            className="absolute -right-2 top-5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-600 text-white shadow-sm hover:bg-slate-700"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDoubleClick(widget.id);
                            }}
                            title="Widget settings"
                        >
                            <Settings2 size={11} />
                        </button>
                    )}

                    {/* Delete button */}
                    <button
                        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete?.(widget.id);
                        }}
                    >
                        <X size={12} />
                    </button>

                    {/* Resize handles */}
                    {ALL_HANDLES.map((handle) => (
                        <div
                            key={handle}
                            className={`${HANDLE_STYLES[handle]} z-10 hover:bg-blue-400/30`}
                            onPointerDown={(e) => handleResizeStart(e, handle)}
                            onMouseEnter={() => {
                                if (hasAlignedEdges && !shiftHeld) setShowTooltip(true);
                            }}
                            onMouseLeave={() => setShowTooltip(false)}
                        />
                    ))}

                    {/* Shift-drag tooltip */}
                    {showTooltip && hasAlignedEdges && !shiftHeld && (
                        <div className="absolute -bottom-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg">
                            Hold Shift to resize aligned widgets together
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
