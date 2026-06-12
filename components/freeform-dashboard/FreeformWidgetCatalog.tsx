'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { getAllFreeformWidgets } from '@/lib/freeform-dashboard/freeform-widget-registry';
import type { FreeformWidgetRegistration } from '@/lib/freeform-dashboard/types';
import type { DashboardWidgetRecord } from '@/lib/freeform-dashboard/types';

interface FreeformWidgetCatalogProps {
    existingWidgets: DashboardWidgetRecord[];
    familyMembers: { id: string; name: string; photoUrls?: Record<string, string> | null }[];
    onAdd: (widgetType: string, config?: Record<string, unknown>) => void;
    onClose: () => void;
}

export default function FreeformWidgetCatalog({
    existingWidgets,
    familyMembers,
    onAdd,
    onClose,
}: FreeformWidgetCatalogProps) {
    const allWidgets = getAllFreeformWidgets();
    const [selectedWidget, setSelectedWidget] = useState<FreeformWidgetRegistration | null>(null);
    const [configStep, setConfigStep] = useState(false);

    const handleSelectWidget = (reg: FreeformWidgetRegistration) => {
        // If widget requires a family-member selection at creation, show config step
        const hasMemberField = reg.meta.configFields?.some((f) => f.type === 'family-member' && f.required);
        if (hasMemberField) {
            setSelectedWidget(reg);
            setConfigStep(true);
        } else {
            // Check if non-multiple widget already exists
            if (!reg.meta.allowMultiple) {
                const exists = existingWidgets.some((w) => w.widgetType === reg.meta.type);
                if (exists) return; // Already exists, can't add another
            }
            onAdd(reg.meta.type);
        }
    };

    const handleMemberSelect = (memberId: string) => {
        if (selectedWidget) {
            onAdd(selectedWidget.meta.type, { memberId });
            setConfigStep(false);
            setSelectedWidget(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">
                        {configStep ? 'Select Family Member' : 'Add Widget'}
                    </h2>
                    <button
                        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                        onClick={onClose}
                    >
                        <X size={20} />
                    </button>
                </div>

                {configStep && selectedWidget ? (
                    <div className="grid grid-cols-3 gap-3">
                        {familyMembers.map((member) => (
                            <button
                                key={member.id}
                                className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 p-4 text-center transition-colors hover:border-blue-300 hover:bg-blue-50"
                                onClick={() => handleMemberSelect(member.id)}
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-medium text-slate-600">
                                    {member.name.charAt(0).toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-slate-700">{member.name}</span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {allWidgets.map((reg) => {
                            const Icon = reg.meta.icon;
                            const alreadyExists =
                                !reg.meta.allowMultiple &&
                                existingWidgets.some((w) => w.widgetType === reg.meta.type);

                            return (
                                <button
                                    key={reg.meta.type}
                                    className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                                        alreadyExists
                                            ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-50'
                                            : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                                    }`}
                                    onClick={() => !alreadyExists && handleSelectWidget(reg)}
                                    disabled={alreadyExists}
                                >
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                        <Icon size={18} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-slate-900">{reg.meta.label}</div>
                                        <div className="mt-0.5 text-xs leading-tight text-slate-500">
                                            {reg.meta.description}
                                        </div>
                                        {alreadyExists && (
                                            <div className="mt-1 text-xs text-slate-400">Already added</div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
