'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CountdownSlot, CountdownSlotState } from '@family-organizer/shared-core';

interface CountdownPillProps {
    slot: CountdownSlot;
    now?: number; // current timestamp ms, for live updates
    className?: string;
}

function formatCountdown(remainingMs: number): string {
    const totalSecs = Math.abs(Math.round(remainingMs / 1000));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const sign = remainingMs < 0 ? '+' : '';
    if (h > 0) return `${sign}${h}h ${m}m`;
    if (m > 0) return `${sign}${m}m ${s}s`;
    return `${sign}${s}s`;
}

const STATE_STYLES: Record<CountdownSlotState, string> = {
    upcoming: 'bg-slate-100 text-slate-600 border-slate-200',
    active: 'bg-amber-100 text-amber-800 border-amber-300 animate-pulse',
    overdue_active: 'bg-red-100 text-red-700 border-red-300 animate-pulse',
    buffer: 'bg-slate-50 text-slate-400 border-slate-150',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    waiting_decision: 'bg-violet-100 text-violet-700 border-violet-200',
};

const STATE_LABELS: Record<CountdownSlotState, string> = {
    upcoming: '',
    active: '⏱',
    overdue_active: '⚠️',
    buffer: '',
    completed: '✓',
    waiting_decision: '⏸',
};

export default function CountdownPill({ slot, now: nowProp, className }: CountdownPillProps) {
    const [nowMs, setNowMs] = useState(() => nowProp ?? Date.now());

    // Tick every second for live countdown when active/overdue.
    useEffect(() => {
        if (slot.state === 'completed' || slot.state === 'buffer' || slot.state === 'waiting_decision') return;
        const interval = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [slot.state]);

    // Update from prop if provided.
    useEffect(() => {
        if (nowProp != null) setNowMs(nowProp);
    }, [nowProp]);

    const remainingMs = slot.countdownEndMs - nowMs;
    const isOverdue = remainingMs < 0 && slot.state !== 'completed';

    // Determine effective state (live recalculation).
    let effectiveState = slot.state;
    if (slot.state !== 'completed' && slot.state !== 'waiting_decision') {
        if (nowMs >= slot.countdownStartMs && nowMs < slot.countdownEndMs) {
            effectiveState = 'active';
        } else if (nowMs >= slot.countdownEndMs) {
            effectiveState = 'overdue_active';
        } else {
            effectiveState = 'upcoming';
        }
    }

    const stateIcon = STATE_LABELS[effectiveState];
    const timeText = effectiveState === 'completed'
        ? 'Done'
        : effectiveState === 'waiting_decision'
        ? 'Pending'
        : effectiveState === 'upcoming'
        ? `in ${formatCountdown(slot.countdownStartMs - nowMs)}`
        : isOverdue
        ? `${formatCountdown(remainingMs)} over`
        : formatCountdown(remainingMs);

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 border font-medium tabular-nums',
                STATE_STYLES[effectiveState],
                className,
            )}
            title={`${slot.scheduleType} · ${slot.durationSecs}s duration · ends ${new Date(slot.countdownEndMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
        >
            {stateIcon && <span>{stateIcon}</span>}
            {timeText}
        </span>
    );
}
