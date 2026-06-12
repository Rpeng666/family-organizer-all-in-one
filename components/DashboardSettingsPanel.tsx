'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GripVertical, LayoutDashboard } from 'lucide-react';
import { id as instantId } from '@instantdb/react';
import { db } from '@/lib/db';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getPhotoUrl, toInitials, type DashboardFamilyMember } from '@/lib/dashboard-utils';
import { resolveDashboardConfig, type DashboardConfig } from '@/lib/dashboard-config';
import { getAllWidgets, getDefaultWidgetOrder, getDefaultDisabledWidgets } from '@/components/dashboard/widgets/registry';

interface DashboardSettingsPanelProps {
    familyMembers: any[];
}

export default function DashboardSettingsPanel({ familyMembers }: DashboardSettingsPanelProps) {
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
        familyMembers[0]?.id || null
    );

    const { data } = db.useQuery({
        familyMembers: {
            $: { where: selectedMemberId ? { id: selectedMemberId } : undefined },
            dashboardConfig: {},
        },
    });

    const member = useMemo(
        () => (data?.familyMembers?.[0] as any) || null,
        [data?.familyMembers]
    );

    const storedConfig = useMemo(
        () => (member?.dashboardConfig?.[0] || null) as (Partial<DashboardConfig> & { id?: string }) | null,
        [member]
    );

    const allWidgets = useMemo(() => getAllWidgets(), []);
    const allWidgetIds = useMemo(() => allWidgets.map((w) => w.meta.id), [allWidgets]);

    const config = useMemo(
        () => resolveDashboardConfig(storedConfig, allWidgetIds, getDefaultWidgetOrder(), getDefaultDisabledWidgets()),
        [storedConfig, allWidgetIds]
    );

    const disabledSet = useMemo(() => new Set(config.disabledWidgets), [config.disabledWidgets]);

    const saveConfig = useCallback(
        (updatedConfig: DashboardConfig) => {
            if (!selectedMemberId) return;

            const configId = storedConfig?.id || instantId();
            const now = Date.now();

            if (storedConfig?.id) {
                db.transact(
                    db.tx.dashboardConfigs[configId].update({
                        widgetOrder: updatedConfig.widgetOrder,
                        disabledWidgets: updatedConfig.disabledWidgets,
                        widgetSettings: updatedConfig.widgetSettings,
                        updatedAt: now,
                    })
                );
            } else {
                db.transact(
                    db.tx.dashboardConfigs[configId]
                        .create({
                            widgetOrder: updatedConfig.widgetOrder,
                            disabledWidgets: updatedConfig.disabledWidgets,
                            widgetSettings: updatedConfig.widgetSettings,
                            updatedAt: now,
                        })
                        .link({ familyMember: selectedMemberId })
                );
            }
        },
        [selectedMemberId, storedConfig?.id]
    );

    const toggleWidget = (widgetId: string) => {
        const newDisabled = disabledSet.has(widgetId)
            ? config.disabledWidgets.filter((id) => id !== widgetId)
            : [...config.disabledWidgets, widgetId];

        saveConfig({ ...config, disabledWidgets: newDisabled });
    };

    const moveWidget = (widgetId: string, direction: 'up' | 'down') => {
        const order = [...config.widgetOrder];
        const idx = order.indexOf(widgetId);
        if (idx < 0) return;

        const newIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= order.length) return;

        [order[idx], order[newIdx]] = [order[newIdx], order[idx]];
        saveConfig({ ...config, widgetOrder: order });
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2 mb-4">
                <LayoutDashboard className="h-5 w-5 text-slate-600" />
                <h2 className="text-lg font-semibold text-slate-900">Dashboard Widgets</h2>
            </div>

            <p className="text-sm text-slate-600 mb-4">
                Configure which widgets appear on each family member&apos;s personal dashboard.
            </p>

            {/* Member selector */}
            <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
                {familyMembers.map((m: any) => {
                    const isActive = m.id === selectedMemberId;
                    return (
                        <button
                            key={m.id}
                            onClick={() => setSelectedMemberId(m.id)}
                            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                                isActive
                                    ? 'border-blue-300 bg-blue-50 text-blue-800'
                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <Avatar className="h-5 w-5">
                                {getPhotoUrl(m) ? <AvatarImage src={getPhotoUrl(m)} alt={m.name} /> : null}
                                <AvatarFallback className="text-[8px]">{toInitials(m.name)}</AvatarFallback>
                            </Avatar>
                            {m.name}
                        </button>
                    );
                })}
            </div>

            {/* Widget list */}
            <ul className="space-y-2">
                {config.widgetOrder.map((widgetId, idx) => {
                    const registration = allWidgets.find((w) => w.meta.id === widgetId);
                    if (!registration) return null;

                    const meta = registration.meta;
                    const Icon = meta.icon;
                    const isEnabled = !disabledSet.has(widgetId);
                    const isRequired = !!meta.required;

                    return (
                        <li
                            key={widgetId}
                            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                                isEnabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50'
                            }`}
                        >
                            <div className="flex flex-col gap-0.5">
                                <button
                                    onClick={() => moveWidget(widgetId, 'up')}
                                    disabled={idx === 0}
                                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-[10px] leading-none"
                                >
                                    ▲
                                </button>
                                <button
                                    onClick={() => moveWidget(widgetId, 'down')}
                                    disabled={idx === config.widgetOrder.length - 1}
                                    className="text-slate-400 hover:text-slate-600 disabled:opacity-30 text-[10px] leading-none"
                                >
                                    ▼
                                </button>
                            </div>

                            <Icon className={`h-4 w-4 shrink-0 ${isEnabled ? 'text-slate-600' : 'text-slate-400'}`} />

                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium ${isEnabled ? 'text-slate-900' : 'text-slate-500'}`}>
                                    {meta.label}
                                </p>
                                {meta.description && (
                                    <p className="text-[11px] text-slate-500 truncate">{meta.description}</p>
                                )}
                            </div>

                            {!isRequired && (
                                <button
                                    onClick={() => toggleWidget(widgetId)}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                        isEnabled ? 'bg-blue-600' : 'bg-slate-200'
                                    }`}
                                >
                                    <span
                                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                                            isEnabled ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                    />
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
