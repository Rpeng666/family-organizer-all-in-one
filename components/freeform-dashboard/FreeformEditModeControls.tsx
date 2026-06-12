'use client';

import React, { useState } from 'react';
import { Copy, Layout, Plus, RotateCcw } from 'lucide-react';
import type { DashboardLayoutRecord } from '@/lib/freeform-dashboard/types';

interface FreeformEditModeControlsProps {
    layouts: DashboardLayoutRecord[];
    activeBreakpointKey: string | undefined;
    viewportWidth: number;
    onAddWidget: () => void;
    onCopyLayout: (sourceBreakpointKey: string) => void;
    onResetDefaults: () => void;
    onSwitchBreakpoint: (breakpointKey: string) => void;
}

export default function FreeformEditModeControls({
    layouts,
    activeBreakpointKey,
    viewportWidth,
    onAddWidget,
    onCopyLayout,
    onResetDefaults,
    onSwitchBreakpoint,
}: FreeformEditModeControlsProps) {
    const [showCopyMenu, setShowCopyMenu] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const activeLayout = layouts.find((l) => l.breakpointKey === activeBreakpointKey);

    return (
        <div
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2 shadow-lg"
            style={{ backgroundColor: 'var(--fd-panel)', border: '1px solid var(--fd-line)' }}
        >
            {/* Breakpoint picker */}
            <div className="relative">
                <select
                    className="appearance-none rounded-lg px-3 py-1.5 pr-8 text-sm font-medium"
                    style={{ backgroundColor: 'var(--fd-surface-muted)', border: '1px solid var(--fd-line)', color: 'var(--fd-ink)' }}
                    value={activeBreakpointKey ?? ''}
                    onChange={(e) => onSwitchBreakpoint(e.target.value)}
                >
                    {layouts
                        .sort((a, b) => a.order - b.order)
                        .map((l) => (
                            <option key={l.breakpointKey} value={l.breakpointKey}>
                                {l.label} ({l.minWidth}–{l.maxWidth === 99999 ? '∞' : l.maxWidth}px)
                            </option>
                        ))}
                </select>
                <Layout size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--fd-ink-faint)' }} />
            </div>

            <span className="text-xs" style={{ color: 'var(--fd-ink-faint)' }}>{viewportWidth}px</span>

            <div className="mx-1 h-6 w-px" style={{ backgroundColor: 'var(--fd-line)' }} />

            {/* Copy layout */}
            <div className="relative">
                <button
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--fd-surface-muted)]"
                    style={{ color: 'var(--fd-ink-muted)' }}
                    onClick={() => setShowCopyMenu(!showCopyMenu)}
                >
                    <Copy size={14} />
                    Copy From…
                </button>
                {showCopyMenu && (
                    <div className="absolute bottom-full left-0 mb-2 w-56 rounded-lg py-1 shadow-lg" style={{ backgroundColor: 'var(--fd-panel)', border: '1px solid var(--fd-line)' }}>
                        {layouts
                            .filter((l) => l.breakpointKey !== activeBreakpointKey)
                            .sort((a, b) => a.order - b.order)
                            .map((l) => (
                                <button
                                    key={l.breakpointKey}
                                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--fd-surface-muted)]"
                                    style={{ color: 'var(--fd-ink)' }}
                                    onClick={() => {
                                        onCopyLayout(l.breakpointKey);
                                        setShowCopyMenu(false);
                                    }}
                                >
                                    {l.label}{' '}
                                    <span style={{ color: 'var(--fd-ink-faint)' }}>
                                        ({l.widgets?.length ?? 0} widgets)
                                    </span>
                                </button>
                            ))}
                    </div>
                )}
            </div>

            {/* Add widget */}
            <button
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
                style={{ backgroundColor: 'var(--fd-accent)', color: 'var(--fd-on-accent)' }}
                onClick={onAddWidget}
            >
                <Plus size={14} />
                Add Widget
            </button>

            {/* Reset defaults */}
            <div className="relative">
                <button
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-[var(--fd-surface-muted)]"
                    style={{ color: 'var(--fd-ink-muted)' }}
                    onClick={() => setShowResetConfirm(!showResetConfirm)}
                >
                    <RotateCcw size={14} />
                </button>
                {showResetConfirm && (
                    <div className="absolute bottom-full right-0 mb-2 w-52 rounded-lg p-3 shadow-lg" style={{ backgroundColor: 'var(--fd-panel)', border: '1px solid var(--fd-line)' }}>
                        <p className="mb-2 text-sm" style={{ color: 'var(--fd-ink)' }}>Reset this layout to defaults?</p>
                        <div className="flex gap-2">
                            <button
                                className="flex-1 rounded-lg bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
                                onClick={() => {
                                    onResetDefaults();
                                    setShowResetConfirm(false);
                                }}
                            >
                                Reset
                            </button>
                            <button
                                className="flex-1 rounded-lg px-3 py-1 text-sm hover:bg-[var(--fd-surface-muted)]"
                                style={{ color: 'var(--fd-ink-muted)', border: '1px solid var(--fd-line)' }}
                                onClick={() => setShowResetConfirm(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
