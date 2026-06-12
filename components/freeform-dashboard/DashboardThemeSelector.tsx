'use client';

import React from 'react';
import { useDashboardTheme } from '@/lib/freeform-dashboard/useDashboardTheme';
import { DASHBOARD_THEMES, type DashboardTheme } from '@/lib/freeform-dashboard/dashboard-theme';

export default function DashboardThemeSelector() {
    const { theme, setTheme } = useDashboardTheme();

    return (
        <div>
            <h2 className="text-xl font-semibold mb-4">Appearance</h2>
            <p className="text-sm text-slate-500 mb-4">Choose a theme for the family dashboard.</p>
            <div className="flex gap-4">
                {DASHBOARD_THEMES.map((t) => {
                    const isActive = theme === t.id;
                    const [canvas, panel, ink, accent] = t.previewColors;

                    return (
                        <button
                            key={t.id}
                            onClick={() => setTheme(t.id as DashboardTheme)}
                            className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-colors ${
                                isActive ? 'border-blue-500' : 'border-slate-200 hover:border-slate-300'
                            }`}
                            style={{ width: 140 }}
                        >
                            {/* Preview swatch */}
                            <div
                                className="w-full rounded-lg overflow-hidden"
                                style={{ backgroundColor: canvas, height: 64, padding: 6 }}
                            >
                                <div className="flex gap-1.5 h-full">
                                    <div
                                        className="flex-1 rounded"
                                        style={{ backgroundColor: panel }}
                                    >
                                        <div
                                            className="mt-1.5 mx-1.5 h-1 rounded-full"
                                            style={{ backgroundColor: ink, opacity: 0.6, width: '60%' }}
                                        />
                                        <div
                                            className="mt-1 mx-1.5 h-1 rounded-full"
                                            style={{ backgroundColor: accent, width: '40%' }}
                                        />
                                    </div>
                                    <div
                                        className="flex-1 rounded"
                                        style={{ backgroundColor: panel }}
                                    >
                                        <div
                                            className="mt-1.5 mx-1.5 h-1 rounded-full"
                                            style={{ backgroundColor: ink, opacity: 0.6, width: '50%' }}
                                        />
                                        <div
                                            className="mt-1 mx-1.5 h-1 rounded-full"
                                            style={{ backgroundColor: ink, opacity: 0.3, width: '70%' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="text-sm font-medium">{t.label}</div>
                            <div className="text-xs text-slate-400 text-center leading-tight">{t.description}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
