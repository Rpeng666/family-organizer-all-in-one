'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowDown, Pause, Play } from 'lucide-react';
import type { CountdownCollision, CollisionDecision } from '@family-organizer/shared-core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CollisionDecisionDialogProps {
    collision: CountdownCollision | null;
    memberName: string;
    open: boolean;
    onDecision: (
        startChoreId: string,
        deadlineChoreId: string,
        decision: CollisionDecision,
    ) => void;
    onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeRange(startMs: number, endMs: number): string {
    const fmt = (ms: number) =>
        new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${fmt(startMs)} – ${fmt(endMs)}`;
}

function formatOverlapDuration(startMs: number, endMs: number): string {
    const mins = Math.round((endMs - startMs) / 60000);
    if (mins >= 60) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${mins}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CollisionDecisionDialog({
    collision,
    memberName,
    open,
    onDecision,
    onClose,
}: CollisionDecisionDialogProps) {
    if (!collision) return null;

    const overlapDuration = formatOverlapDuration(
        collision.overlapStartMs,
        collision.overlapEndMs,
    );

    const handleDecision = (decision: CollisionDecision) => {
        onDecision(
            collision.startDrivenChoreId,
            collision.deadlineDrivenChoreId,
            decision,
        );
        onClose();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-700">
                        <AlertTriangle className="h-5 w-5" />
                        Schedule Conflict
                    </DialogTitle>
                    <DialogDescription>
                        {memberName} has two chores that overlap by{' '}
                        <span className="font-semibold text-slate-700">{overlapDuration}</span>.
                        Choose how to handle this.
                    </DialogDescription>
                </DialogHeader>

                {/* Conflict explanation */}
                <div className="space-y-3 my-2">
                    {/* Start-driven chore */}
                    <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                        <div className="flex items-center gap-2">
                            <Play className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                                Start-driven
                            </span>
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-800">
                            {collision.startDrivenChoreTitle}
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <div className="flex items-center gap-1.5 text-[10px] text-amber-600 font-semibold">
                            <AlertTriangle className="h-3 w-3" />
                            {overlapDuration} overlap
                        </div>
                    </div>

                    {/* Deadline-driven chore */}
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                        <div className="flex items-center gap-2">
                            <ArrowDown className="h-3.5 w-3.5 text-red-600" />
                            <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
                                Deadline-driven
                            </span>
                        </div>
                        <div className="mt-1 text-sm font-medium text-slate-800">
                            {collision.deadlineDrivenChoreTitle}
                        </div>
                    </div>
                </div>

                {/* Decision options */}
                <div className="space-y-2 mt-2">
                    <button
                        type="button"
                        onClick={() => handleDecision('start_driven_first')}
                        className={cn(
                            'w-full rounded-xl border-2 border-blue-200 bg-white px-4 py-3 text-left transition-all',
                            'hover:border-blue-400 hover:bg-blue-50',
                        )}
                    >
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-blue-100 p-1.5">
                                <Play className="h-3.5 w-3.5 text-blue-600" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-slate-800">
                                    Start "{collision.startDrivenChoreTitle}" first
                                </div>
                                <div className="mt-0.5 text-xs text-slate-500">
                                    Begin this chore now, pause when the deadline-driven
                                    chore needs to start, then resume after.
                                </div>
                            </div>
                        </div>
                    </button>

                    <button
                        type="button"
                        onClick={() => handleDecision('deadline_driven_first')}
                        className={cn(
                            'w-full rounded-xl border-2 border-red-200 bg-white px-4 py-3 text-left transition-all',
                            'hover:border-red-400 hover:bg-red-50',
                        )}
                    >
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-full bg-red-100 p-1.5">
                                <ArrowDown className="h-3.5 w-3.5 text-red-600" />
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-slate-800">
                                    Do "{collision.deadlineDrivenChoreTitle}" first
                                </div>
                                <div className="mt-0.5 text-xs text-slate-500">
                                    Push "{collision.startDrivenChoreTitle}" to after the
                                    deadline-driven chore finishes.
                                </div>
                            </div>
                        </div>
                    </button>
                </div>

                <div className="flex justify-end mt-2">
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        Decide later
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
