'use client';

import { useCallback, useMemo } from 'react';
import { id } from '@instantdb/react';
import { db } from '@/lib/db';
import type { DashboardLayoutRecord, DashboardWidgetRecord } from './types';

/**
 * Queries the family dashboard layouts + widgets from InstantDB.
 * Returns the full set of layouts and CRUD helpers.
 */
export function useFamilyDashboardLayout() {
    const { data, isLoading, error } = db.useQuery({
        familyDashboardLayouts: {
            widgets: {},
        },
    });

    const layouts: DashboardLayoutRecord[] = useMemo(() => {
        if (!data?.familyDashboardLayouts) return [];
        const rawLayouts = data.familyDashboardLayouts as any[];
        return rawLayouts.map((l) => ({
            id: l.id,
            breakpointKey: l.breakpointKey,
            label: l.label,
            minWidth: l.minWidth,
            maxWidth: l.maxWidth,
            isDefault: l.isDefault,
            order: l.order,
            createdAt: l.createdAt,
            updatedAt: l.updatedAt,
            widgets: (l.widgets ?? []).map((w) => ({
                id: w.id,
                widgetType: w.widgetType,
                x: w.x,
                y: w.y,
                w: w.w,
                h: w.h,
                z: w.z,
                config: w.config as Record<string, unknown> | undefined,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt,
            })),
        }));
    }, [data]);

    const addWidget = useCallback(
        (layoutId: string, widget: Omit<DashboardWidgetRecord, 'id' | 'createdAt' | 'updatedAt'>) => {
            const now = new Date().toISOString();
            const widgetId = id();
            db.transact([
                db.tx.familyDashboardWidgets[widgetId]
                    .update({
                        widgetType: widget.widgetType,
                        x: widget.x,
                        y: widget.y,
                        w: widget.w,
                        h: widget.h,
                        z: widget.z,
                        config: widget.config,
                        createdAt: now,
                        updatedAt: now,
                    })
                    .link({ layout: layoutId }),
            ]);
            return widgetId;
        },
        []
    );

    const updateWidget = useCallback(
        (widgetId: string, updates: Partial<Pick<DashboardWidgetRecord, 'x' | 'y' | 'w' | 'h' | 'z' | 'config'>>) => {
            db.transact([
                db.tx.familyDashboardWidgets[widgetId].update({
                    ...updates,
                    updatedAt: new Date().toISOString(),
                }),
            ]);
        },
        []
    );

    const updateWidgets = useCallback(
        (updates: { id: string; changes: Partial<Pick<DashboardWidgetRecord, 'x' | 'y' | 'w' | 'h' | 'z'>> }[]) => {
            const now = new Date().toISOString();
            db.transact(
                updates.map((u) =>
                    db.tx.familyDashboardWidgets[u.id].update({
                        ...u.changes,
                        updatedAt: now,
                    })
                )
            );
        },
        []
    );

    const removeWidget = useCallback((widgetId: string) => {
        db.transact([db.tx.familyDashboardWidgets[widgetId].delete()]);
    }, []);

    const bringToFront = useCallback(
        (widgetId: string, allWidgets: DashboardWidgetRecord[]) => {
            const maxZ = Math.max(0, ...allWidgets.map((w) => w.z));
            db.transact([
                db.tx.familyDashboardWidgets[widgetId].update({
                    z: maxZ + 1,
                    updatedAt: new Date().toISOString(),
                }),
            ]);
        },
        []
    );

    const createLayout = useCallback(
        (layout: {
            breakpointKey: string;
            label: string;
            minWidth: number;
            maxWidth: number;
            isDefault: boolean;
            order: number;
        }) => {
            const now = new Date().toISOString();
            const layoutId = id();
            db.transact([
                db.tx.familyDashboardLayouts[layoutId].update({
                    ...layout,
                    createdAt: now,
                    updatedAt: now,
                }),
            ]);
            return layoutId;
        },
        []
    );

    const deleteLayout = useCallback((layoutId: string) => {
        db.transact([db.tx.familyDashboardLayouts[layoutId].delete()]);
    }, []);

    return {
        layouts,
        isLoading,
        error,
        addWidget,
        updateWidget,
        updateWidgets,
        removeWidget,
        bringToFront,
        createLayout,
        deleteLayout,
    };
}
