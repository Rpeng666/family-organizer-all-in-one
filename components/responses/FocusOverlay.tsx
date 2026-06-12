'use client';

import React, { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Minimize2, Columns2, X, ArrowLeftRight, FileText, Image, Film, Mic, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FocusPanelContent } from './FocusPanelContent';
import type { FocusPanelItem, FocusPanelState, FocusableItem } from './focus-panel-types';

interface Props {
    state: FocusPanelState;
    onClose: () => void;
    onEnterSplit: () => void;
    onSelectSplitItem: (item: FocusPanelItem) => void;
    onSwapPanels: () => void;
    onCloseSplitPanel: (side: 'left' | 'right') => void;
    /** All items available for the split picker */
    availableItems: FocusableItem[];
    /** Called when user picks an item from the picker — parent resolves it to a FocusPanelItem */
    onPickItem: (item: FocusableItem) => void;
}

function getItemLabel(item: FocusPanelItem): string {
    if (item.kind === 'rich_text') return item.label;
    if (item.kind === 'attachment') return item.label || item.name;
    return item.label || 'Notes';
}

const kindIcons: Record<FocusPanelItem['kind'], React.ReactNode> = {
    rich_text: <FileText className="h-4 w-4" />,
    attachment: <Image className="h-4 w-4" />,
    notes: <StickyNote className="h-4 w-4" />,
};

export const FocusOverlay: React.FC<Props> = ({
    state,
    onClose,
    onEnterSplit,
    onSelectSplitItem,
    onSwapPanels,
    onCloseSplitPanel,
    availableItems,
    onPickItem,
}) => {
    // Escape key handler
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            }
        },
        [onClose]
    );

    useEffect(() => {
        if (state.mode === 'closed') return;
        window.addEventListener('keydown', handleKeyDown, true);
        return () => window.removeEventListener('keydown', handleKeyDown, true);
    }, [state.mode, handleKeyDown]);

    if (state.mode === 'closed') return null;

    const overlay = (
        <div
            className="fixed inset-0 z-[60] flex flex-col bg-white animate-in fade-in slide-in-from-bottom-2 duration-200"
            role="dialog"
            aria-label="Expanded view"
        >
            {state.mode === 'focus' && (
                <FocusModeLayout
                    item={state.item}
                    onClose={onClose}
                    onEnterSplit={onEnterSplit}
                    availableItems={availableItems}
                />
            )}
            {state.mode === 'split' && (
                <SplitModeLayout
                    left={state.left}
                    right={state.right}
                    onClose={onClose}
                    onSwapPanels={onSwapPanels}
                    onCloseSplitPanel={onCloseSplitPanel}
                    availableItems={availableItems}
                    onPickItem={onPickItem}
                />
            )}
        </div>
    );

    return createPortal(overlay, document.body);
};

// --- Focus Mode ---

function FocusModeLayout({
    item,
    onClose,
    onEnterSplit,
    availableItems,
}: {
    item: FocusPanelItem;
    onClose: () => void;
    onEnterSplit: () => void;
    availableItems: FocusableItem[];
}) {
    const hasSplitTargets = availableItems.length > 0;

    return (
        <>
            <PanelHeader
                label={getItemLabel(item)}
                icon={kindIcons[item.kind]}
                actions={
                    <>
                        {hasSplitTargets && (
                            <HeaderButton onClick={onEnterSplit} title="View side by side">
                                <Columns2 className="h-4 w-4" />
                                <span className="hidden sm:inline text-xs">Split</span>
                            </HeaderButton>
                        )}
                        <HeaderButton onClick={onClose} title="Close (Escape)">
                            <Minimize2 className="h-4 w-4" />
                        </HeaderButton>
                    </>
                }
            />
            <div className="flex flex-1 flex-col overflow-hidden p-4">
                <FocusPanelContent item={item} fullHeight />
            </div>
        </>
    );
}

// --- Split Mode ---

function SplitModeLayout({
    left,
    right,
    onClose,
    onSwapPanels,
    onCloseSplitPanel,
    availableItems,
    onPickItem,
}: {
    left: FocusPanelItem;
    right: FocusPanelItem | null;
    onClose: () => void;
    onSwapPanels: () => void;
    onCloseSplitPanel: (side: 'left' | 'right') => void;
    availableItems: FocusableItem[];
    onPickItem: (item: FocusableItem) => void;
}) {
    return (
        <>
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Columns2 className="h-4 w-4 text-slate-400" />
                    Split View
                </div>
                <div className="flex items-center gap-1">
                    {right && (
                        <HeaderButton onClick={onSwapPanels} title="Swap panels">
                            <ArrowLeftRight className="h-4 w-4" />
                        </HeaderButton>
                    )}
                    <HeaderButton onClick={onClose} title="Close (Escape)">
                        <X className="h-4 w-4" />
                    </HeaderButton>
                </div>
            </div>

            {/* Panels — responsive: stacked on mobile, side-by-side on md+ */}
            <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
                {/* Left panel */}
                <div className="flex min-h-0 flex-1 flex-col border-b border-slate-200 md:border-b-0 md:border-r">
                    <SplitPanelHeader
                        label={getItemLabel(left)}
                        icon={kindIcons[left.kind]}
                        onClose={() => onCloseSplitPanel('left')}
                    />
                    <div className="flex flex-1 flex-col overflow-hidden p-3">
                        <FocusPanelContent item={left} fullHeight />
                    </div>
                </div>

                {/* Right panel */}
                <div className="flex min-h-0 flex-1 flex-col">
                    {right ? (
                        <>
                            <SplitPanelHeader
                                label={getItemLabel(right)}
                                icon={kindIcons[right.kind]}
                                onClose={() => onCloseSplitPanel('right')}
                            />
                            <div className="flex flex-1 flex-col overflow-hidden p-3">
                                <FocusPanelContent item={right} fullHeight />
                            </div>
                        </>
                    ) : (
                        <SplitItemPicker items={availableItems} onPick={onPickItem} />
                    )}
                </div>
            </div>
        </>
    );
}

// --- Split Item Picker ---

function SplitItemPicker({
    items,
    onPick,
}: {
    items: FocusableItem[];
    onPick: (item: FocusableItem) => void;
}) {
    const kindIconMap: Record<string, React.ReactNode> = {
        rich_text: <FileText className="h-5 w-5 text-purple-500" />,
        attachment: <Image className="h-5 w-5 text-blue-500" />,
        notes: <StickyNote className="h-5 w-5 text-amber-500" />,
    };

    const kindLabels: Record<string, string> = {
        rich_text: 'Rich Text',
        attachment: 'File',
        notes: 'Notes',
    };

    return (
        <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div className="w-full max-w-sm space-y-3">
                <div className="text-center">
                    <h3 className="text-sm font-semibold text-slate-800">Choose an item</h3>
                    <p className="mt-1 text-xs text-slate-500">Select what to view in this panel</p>
                </div>
                <div className="space-y-2">
                    {items.map((item) => (
                        <button
                            key={`${item.kind}-${item.id}`}
                            type="button"
                            onClick={() => onPick(item)}
                            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                            {kindIconMap[item.kind] || <FileText className="h-5 w-5 text-slate-400" />}
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-slate-800 truncate">{item.label}</div>
                                <div className="text-xs text-slate-500">{kindLabels[item.kind] || item.kind}</div>
                            </div>
                            {item.thumbnailUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.thumbnailUrl} alt="" className="h-8 w-8 rounded object-cover" />
                            )}
                        </button>
                    ))}
                    {items.length === 0 && (
                        <p className="text-center text-sm text-slate-400 italic">No other items available</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// --- Shared UI pieces ---

function PanelHeader({
    label,
    icon,
    actions,
}: {
    label: string;
    icon?: React.ReactNode;
    actions: React.ReactNode;
}) {
    return (
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
                {icon && <span className="text-slate-400 flex-shrink-0">{icon}</span>}
                <h2 className="text-sm font-semibold text-slate-800 truncate">{label}</h2>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>
        </div>
    );
}

function SplitPanelHeader({
    label,
    icon,
    onClose,
}: {
    label: string;
    icon?: React.ReactNode;
    onClose: () => void;
}) {
    return (
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-1.5">
            <div className="flex items-center gap-1.5 min-w-0">
                {icon && <span className="text-slate-400 flex-shrink-0">{icon}</span>}
                <span className="text-xs font-medium text-slate-600 truncate">{label}</span>
            </div>
            <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                title="Close panel"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

function HeaderButton({
    onClick,
    title,
    children,
}: {
    onClick: () => void;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900"
        >
            {children}
        </button>
    );
}
