'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { id } from '@instantdb/react';
import { db } from '@/lib/db';
import { useParentMode } from '@/components/auth/useParentMode';
import { useActiveBreakpoint } from '@/lib/freeform-dashboard/useActiveBreakpoint';
import { useFamilyDashboardLayout } from '@/lib/freeform-dashboard/useFamilyDashboardLayout';
import { useFreeformDrag } from '@/lib/freeform-dashboard/useFreeformDrag';
import { useFreeformResize } from '@/lib/freeform-dashboard/useFreeformResize';
import { getFreeformWidget, getFreeformWidgetMeta } from '@/lib/freeform-dashboard/freeform-widget-registry';
import { DEFAULT_BREAKPOINTS } from '@/lib/freeform-dashboard/breakpoint-utils';
import { generateDefaultLayout } from '@/lib/freeform-dashboard/default-layouts';
import { scaleLayout } from '@/lib/freeform-dashboard/layout-scaler';
import type { DashboardWidgetRecord, SnapGuide, WidgetRect } from '@/lib/freeform-dashboard/types';
import FreeformCanvas from './FreeformCanvas';
import FreeformWidgetWrapper from './FreeformWidgetWrapper';
import FreeformEditModeControls from './FreeformEditModeControls';
import FreeformWidgetCatalog from './FreeformWidgetCatalog';
import FreeformWidgetSettingsDialog from './FreeformWidgetSettingsDialog';
import { WidgetScaleProvider } from '@/lib/freeform-dashboard/widget-scale';
import { useDashboardTheme } from '@/lib/freeform-dashboard/useDashboardTheme';
import { useActiveDashboardTheme } from '@/lib/freeform-dashboard/DashboardThemeContext';

// Import all widget registrations
import './widgets';

interface FreeformDashboardProps {
    editMode: boolean;
}

export default function FreeformDashboard({ editMode }: FreeformDashboardProps) {
    const { isParentMode } = useParentMode();
    const { theme } = useDashboardTheme();
    const { setActiveTheme } = useActiveDashboardTheme();
    const { layouts, isLoading, addWidget, updateWidget, updateWidgets, removeWidget, bringToFront, createLayout } =
        useFamilyDashboardLayout();

    // Broadcast the dashboard theme to the layout shell (navbar, body bg)
    useEffect(() => {
        setActiveTheme(theme);
        return () => setActiveTheme(null);
    }, [theme, setActiveTheme]);
    const { activeBreakpoint, viewportWidth } = useActiveBreakpoint(layouts);
    const [showCatalog, setShowCatalog] = useState(false);
    const [settingsWidgetId, setSettingsWidgetId] = useState<string | null>(null);
    const hasInitializedRef = useRef(false);

    // Query family members for default layout generation + person card config
    const { data: familyData } = db.useQuery({
        familyMembers: {
            $: { order: { order: 'asc' } },
        },
    });

    const familyMembers = useMemo(
        () =>
            (familyData?.familyMembers ?? []).map((m: any) => ({
                id: m.id,
                name: m.name,
                photoUrls: m.photoUrls as Record<string, string> | null | undefined,
            })),
        [familyData]
    );

    // Initialize default layouts on first load if none exist
    useEffect(() => {
        if (isLoading || hasInitializedRef.current || layouts.length > 0 || familyMembers.length === 0) return;
        hasInitializedRef.current = true;

        const memberIds = familyMembers.map((m) => m.id);
        const now = new Date().toISOString();

        const txns: Parameters<typeof db.transact>[0] = [];

        for (const bp of DEFAULT_BREAKPOINTS) {
            const layoutId = id();
            txns.push(
                db.tx.familyDashboardLayouts[layoutId].update({
                    breakpointKey: bp.breakpointKey,
                    label: bp.label,
                    minWidth: bp.minWidth,
                    maxWidth: bp.maxWidth,
                    isDefault: bp.isDefault,
                    order: bp.order,
                    createdAt: now,
                    updatedAt: now,
                })
            );

            // Use the midpoint of the breakpoint range as canvas width
            const canvasW = bp.maxWidth === 99999 ? 1600 : Math.floor((bp.minWidth + bp.maxWidth) / 2);
            const placements = generateDefaultLayout(bp.breakpointKey, canvasW, memberIds);
            for (const p of placements) {
                const wId = id();
                txns.push(
                    db.tx.familyDashboardWidgets[wId]
                        .update({
                            widgetType: p.widgetType,
                            x: p.x,
                            y: p.y,
                            w: p.w,
                            h: p.h,
                            z: p.z,
                            config: p.config ?? {},
                            createdAt: now,
                            updatedAt: now,
                        })
                        .link({ layout: layoutId })
                );
            }
        }

        db.transact(txns);
    }, [isLoading, layouts.length, familyMembers, createLayout, addWidget]);

    // Active layout's widgets
    const activeLayout = useMemo(
        () => layouts.find((l) => l.breakpointKey === activeBreakpoint?.breakpointKey),
        [layouts, activeBreakpoint]
    );

    const widgets: DashboardWidgetRecord[] = useMemo(
        () => (activeLayout?.widgets ?? []).sort((a, b) => a.z - b.z),
        [activeLayout]
    );

    // Build WidgetRect array for snap/drag/resize
    const widgetRects: WidgetRect[] = useMemo(
        () => widgets.map((w) => ({ id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z })),
        [widgets]
    );

    // Min sizes map for resize hook
    const minSizes = useMemo(() => {
        const map = new Map<string, { minWidth: number; minHeight: number }>();
        for (const w of widgets) {
            const meta = getFreeformWidgetMeta(w.widgetType);
            map.set(w.id, { minWidth: meta?.minWidth ?? 100, minHeight: meta?.minHeight ?? 80 });
        }
        return map;
    }, [widgets]);

    // Drag hook
    const handleDragEnd = useCallback(
        (widgetId: string, x: number, y: number) => {
            updateWidget(widgetId, { x, y });
        },
        [updateWidget]
    );

    const { dragPosition, guides: dragGuides, onPointerDown: onDragPointerDown, onPointerMove: onDragPointerMove, onPointerUp: onDragPointerUp } =
        useFreeformDrag({ canvasWidth: viewportWidth, allWidgets: widgetRects, onDragEnd: handleDragEnd });

    // Resize hook
    const handleResizeEnd = useCallback(
        (updates: { id: string; changes: Partial<Pick<WidgetRect, 'x' | 'y' | 'w' | 'h'>> }[]) => {
            updateWidgets(updates.map((u) => ({ id: u.id, changes: u.changes })));
        },
        [updateWidgets]
    );

    const { resizeRect, guides: resizeGuides, shiftHeld, hasAlignedEdges, onResizePointerDown, onResizePointerMove, onResizePointerUp } =
        useFreeformResize({ canvasWidth: viewportWidth, allWidgets: widgetRects, minSizes, onResizeEnd: handleResizeEnd });

    // Combine guides
    const allGuides: SnapGuide[] = useMemo(
        () => [...dragGuides, ...resizeGuides],
        [dragGuides, resizeGuides]
    );

    // Canvas pointer handlers (only in edit mode)
    const handleCanvasPointerMove = useCallback(
        (e: React.PointerEvent) => {
            onDragPointerMove(e);
            onResizePointerMove(e);
        },
        [onDragPointerMove, onResizePointerMove]
    );

    const handleCanvasPointerUp = useCallback(
        (e: React.PointerEvent) => {
            onDragPointerUp(e);
            onResizePointerUp(e);
        },
        [onDragPointerUp, onResizePointerUp]
    );

    // Click to bring to front
    const handleWidgetClick = useCallback(
        (widgetId: string) => {
            if (editMode) {
                bringToFront(widgetId, widgets);
            }
        },
        [editMode, bringToFront, widgets]
    );

    // Double-click to open widget settings
    const handleWidgetDoubleClick = useCallback(
        (widgetId: string) => {
            const widget = widgets.find((w) => w.id === widgetId);
            if (!widget) return;
            // Always allow settings (contentScale is injected for all widgets)
            setSettingsWidgetId(widgetId);
        },
        [widgets]
    );

    // Save widget settings
    const handleSaveWidgetSettings = useCallback(
        (widgetId: string, config: Record<string, unknown>) => {
            updateWidget(widgetId, { config });
        },
        [updateWidget]
    );

    // Add widget from catalog
    const handleAddWidget = useCallback(
        (widgetType: string, config?: Record<string, unknown>) => {
            if (!activeLayout) return;
            const meta = getFreeformWidgetMeta(widgetType);
            const w = meta?.defaultWidth ?? 300;
            const h = meta?.defaultHeight ?? 200;

            // Place at first available position (top-left with offset from existing)
            const existingCount = widgets.filter((wd) => wd.widgetType === widgetType).length;
            const offsetX = 12 + existingCount * 20;
            const offsetY = 12 + existingCount * 20;

            addWidget(activeLayout.id, {
                widgetType,
                x: offsetX,
                y: offsetY,
                w,
                h,
                z: Math.max(0, ...widgets.map((wd) => wd.z)) + 1,
                config,
            });
            setShowCatalog(false);
        },
        [activeLayout, widgets, addWidget]
    );

    // Copy layout from another breakpoint
    const handleCopyLayout = useCallback(
        (sourceBreakpointKey: string) => {
            if (!activeLayout) return;
            const sourceLayout = layouts.find((l) => l.breakpointKey === sourceBreakpointKey);
            if (!sourceLayout?.widgets?.length) return;

            // Delete existing widgets in this layout
            for (const w of widgets) {
                removeWidget(w.id);
            }

            // Scale source widgets to target size
            const sourceWidth = sourceLayout.maxWidth === 99999 ? 1600 : Math.floor((sourceLayout.minWidth + sourceLayout.maxWidth) / 2);
            const targetWidth = activeLayout.maxWidth === 99999 ? 1600 : Math.floor((activeLayout.minWidth + activeLayout.maxWidth) / 2);
            const sourceRects: WidgetRect[] = sourceLayout.widgets.map((w) => ({
                id: w.id, x: w.x, y: w.y, w: w.w, h: w.h, z: w.z,
            }));
            const scaled = scaleLayout(sourceRects, sourceWidth, targetWidth, 900, 900);

            const now = new Date().toISOString();
            const txns: Parameters<typeof db.transact>[0] = [];
            for (let i = 0; i < sourceLayout.widgets.length; i++) {
                const src = sourceLayout.widgets[i];
                const s = scaled[i];
                const wId = id();
                txns.push(
                    db.tx.familyDashboardWidgets[wId]
                        .update({
                            widgetType: src.widgetType,
                            x: s.x,
                            y: s.y,
                            w: s.w,
                            h: s.h,
                            z: s.z,
                            config: src.config ?? {},
                            createdAt: now,
                            updatedAt: now,
                        })
                        .link({ layout: activeLayout.id })
                );
            }
            db.transact(txns);
        },
        [activeLayout, layouts, widgets, removeWidget]
    );

    // Reset to defaults
    const handleResetDefaults = useCallback(() => {
        if (!activeLayout) return;

        // Delete existing widgets
        for (const w of widgets) {
            removeWidget(w.id);
        }

        // Generate and insert defaults
        const canvasW = activeLayout.maxWidth === 99999 ? 1600 : Math.floor((activeLayout.minWidth + activeLayout.maxWidth) / 2);
        const memberIds = familyMembers.map((m) => m.id);
        const placements = generateDefaultLayout(activeLayout.breakpointKey, canvasW, memberIds);
        const now = new Date().toISOString();
        const txns: Parameters<typeof db.transact>[0] = [];
        for (const p of placements) {
            const wId = id();
            txns.push(
                db.tx.familyDashboardWidgets[wId]
                    .update({
                        widgetType: p.widgetType,
                        x: p.x,
                        y: p.y,
                        w: p.w,
                        h: p.h,
                        z: p.z,
                        config: p.config ?? {},
                        createdAt: now,
                        updatedAt: now,
                    })
                    .link({ layout: activeLayout.id })
            );
        }
        db.transact(txns);
    }, [activeLayout, widgets, familyMembers, removeWidget]);

    const todayUtc = useMemo(() => {
        const d = new Date();
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    }, []);

    if (isLoading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <div className="text-sm text-slate-400">Loading dashboard…</div>
            </div>
        );
    }

    const themeClass = `fd-${theme}`;

    return (
        <div className={`${themeClass} min-h-full`} style={{ backgroundColor: 'var(--fd-canvas)' }}>
            <FreeformCanvas
                widgets={widgets}
                editMode={editMode}
                guides={editMode ? allGuides : []}
                onPointerMove={editMode ? handleCanvasPointerMove : undefined}
                onPointerUp={editMode ? handleCanvasPointerUp : undefined}
            >
                {widgets.map((widget) => {
                    const reg = getFreeformWidget(widget.widgetType);
                    const meta = reg?.meta;
                    const WidgetComponent = reg?.component;

                    // Compute override rect if this widget is being dragged or resized
                    let overrideRect: { x: number; y: number; w: number; h: number } | null = null;
                    if (dragPosition && dragPosition.widgetId === widget.id) {
                        overrideRect = { x: dragPosition.x, y: dragPosition.y, w: widget.w, h: widget.h };
                    } else if (resizeRect && resizeRect.widgetId === widget.id) {
                        overrideRect = { x: resizeRect.x, y: resizeRect.y, w: resizeRect.w, h: resizeRect.h };
                    }

                    const displayRect = overrideRect ?? { x: widget.x, y: widget.y, w: widget.w, h: widget.h };

                    return (
                        <FreeformWidgetWrapper
                            key={widget.id}
                            widget={widget}
                            meta={meta}
                            editMode={editMode && isParentMode}
                            overrideRect={overrideRect}
                            onDragStart={onDragPointerDown}
                            onResizeStart={onResizePointerDown}
                            onClick={handleWidgetClick}
                            onDoubleClick={handleWidgetDoubleClick}
                            onDelete={removeWidget}
                            hasAlignedEdges={hasAlignedEdges}
                            shiftHeld={shiftHeld}
                        >
                            {WidgetComponent ? (
                                <WidgetScaleProvider
                                    width={displayRect.w}
                                    height={displayRect.h}
                                    refWidth={meta?.defaultWidth ?? 300}
                                    refHeight={meta?.defaultHeight ?? 200}
                                    contentScale={
                                        typeof (widget.config as Record<string, unknown>)?.contentScale === 'number'
                                            ? ((widget.config as Record<string, unknown>).contentScale as number) / 100
                                            : undefined
                                    }
                                >
                                    <WidgetComponent
                                        config={(widget.config as Record<string, unknown>) ?? {}}
                                        width={displayRect.w}
                                        height={displayRect.h}
                                        todayUtc={todayUtc}
                                    />
                                </WidgetScaleProvider>
                            ) : (
                                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                                    Unknown widget: {widget.widgetType}
                                </div>
                            )}
                        </FreeformWidgetWrapper>
                    );
                })}
            </FreeformCanvas>

            {/* Edit mode controls */}
            {editMode && isParentMode && (
                <FreeformEditModeControls
                    layouts={layouts}
                    activeBreakpointKey={activeBreakpoint?.breakpointKey}
                    viewportWidth={viewportWidth}
                    onAddWidget={() => setShowCatalog(true)}
                    onCopyLayout={handleCopyLayout}
                    onResetDefaults={handleResetDefaults}
                    onSwitchBreakpoint={() => {
                        // Breakpoint is auto-determined by viewport width
                        // This is informational in the picker
                    }}
                />
            )}

            {/* Widget catalog modal */}
            {showCatalog && (
                <FreeformWidgetCatalog
                    existingWidgets={widgets}
                    familyMembers={familyMembers}
                    onAdd={handleAddWidget}
                    onClose={() => setShowCatalog(false)}
                />
            )}

            {/* Widget settings dialog */}
            {settingsWidgetId && (() => {
                const settingsWidget = widgets.find((w) => w.id === settingsWidgetId);
                const settingsMeta = settingsWidget ? getFreeformWidgetMeta(settingsWidget.widgetType) : undefined;
                if (!settingsWidget || !settingsMeta) return null;
                return (
                    <FreeformWidgetSettingsDialog
                        widget={settingsWidget}
                        meta={settingsMeta}
                        familyMembers={familyMembers}
                        onSave={handleSaveWidgetSettings}
                        onClose={() => setSettingsWidgetId(null)}
                    />
                );
            })()}
        </div>
    );
}
