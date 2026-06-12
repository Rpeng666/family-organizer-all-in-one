'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { tx, id } from '@instantdb/react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
    HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
    COUNTDOWN_SETTINGS_NAME,
    getFamilyDayDateUTC,
    parseSharedScheduleSettings,
    parseCountdownSettings,
    computeCountdownTimelines,
    getChoreTimingMode,
    type SharedScheduleSettings,
    type CountdownEngineOutput,
    type CountdownChoreInput,
    type CountdownSlot,
    type CountdownSlotState,
    type CountdownCollision,
    type CollisionDecision,
    type PersonCountdownTimeline,
    type CountdownSettings,
} from '@family-organizer/shared-core';
import { useAuth } from '@/components/AuthProvider';
import { getAssignedMembersForChoreOnDate as getAssignedMembersLocal } from '@/lib/chore-utils';
import { getPhotoUrl } from '@/lib/photo-urls';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import RadialTimer, { type RadialTimerState } from './RadialTimer';
import CollisionDecisionDialog from './CollisionDecisionDialog';
import {
    Maximize2,
    Minimize2,
    Check,
    ChevronRight,
    AlertTriangle,
    Timer,
    Clock,
    TrendingUp,
    TrendingDown,
    Minus,
    Play,
    Square,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCountdown(remainingMs: number): { main: string; sub: string; sign: string } {
    const totalSecs = Math.abs(Math.round(remainingMs / 1000));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const sign = remainingMs < 0 ? '+' : '';
    if (h > 0) {
        return { main: `${h}:${String(m).padStart(2, '0')}`, sub: String(s).padStart(2, '0'), sign };
    }
    return { main: `${m}:${String(s).padStart(2, '0')}`, sub: '', sign };
}

function formatDelta(seconds: number): string {
    const abs = Math.abs(Math.round(seconds));
    const h = Math.floor(abs / 3600);
    const m = Math.floor((abs % 3600) / 60);
    const s = abs % 60;
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
}

function getLiveState(slot: CountdownSlot, nowMs: number): CountdownSlotState {
    if (slot.state === 'completed') return 'completed';
    if (slot.state === 'waiting_decision') return 'waiting_decision';
    if (nowMs >= slot.countdownEndMs) return 'overdue_active';
    if (nowMs >= slot.countdownStartMs) return 'active';
    return 'upcoming';
}

function getSlotProgress(slot: CountdownSlot, nowMs: number): number {
    if (slot.state === 'completed') return 1;
    const total = slot.countdownEndMs - slot.countdownStartMs;
    if (total <= 0) return 1;
    const elapsed = nowMs - slot.countdownStartMs;
    return Math.max(0, Math.min(1, elapsed / total));
}

function getTimerState(liveState: CountdownSlotState): RadialTimerState {
    switch (liveState) {
        case 'completed':
            return 'completed';
        case 'overdue_active':
            return 'overdue';
        case 'active':
            return 'active';
        default:
            return 'upcoming';
    }
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Cumulative delta calculation
// ---------------------------------------------------------------------------

/**
 * Returns seconds ahead (positive) / behind (negative) for the current stack.
 *
 * Formula: `targetEndMs - max(countdownEndMs, nowMs)` on the focus slot.
 *
 * - `countdownEndMs` is the effective end (already shifted by the engine's
 *   chain pass to reflect actual completion times of earlier chores and any
 *   manual early starts).
 * - If we blow past the effective end live, we keep counting up using `nowMs`.
 * - `targetEndMs` is the unshifted planned end — the reference point.
 *
 * Positive result = ahead, negative = behind.
 */
function computeStackDelta(focusSlot: CountdownSlot | null, nowMs: number): number {
    if (!focusSlot) return 0;
    const effectiveEnd = Math.max(focusSlot.countdownEndMs, nowMs);
    return (focusSlot.targetEndMs - effectiveEnd) / 1000;
}

// ---------------------------------------------------------------------------
// Progress dots component
// ---------------------------------------------------------------------------

function ProgressDots({
    total,
    completed,
    currentIndex,
}: {
    total: number;
    completed: number;
    currentIndex: number;
}) {
    if (total <= 0) return null;
    // For many chores, show as text instead of dots
    if (total > 12) {
        return (
            <span className="text-xs font-medium text-white/70">
                {currentIndex + 1} of {total}
            </span>
        );
    }
    return (
        <div className="flex items-center gap-1.5">
            {Array.from({ length: total }, (_, i) => (
                <div
                    key={i}
                    className={cn(
                        'rounded-full transition-all duration-300',
                        i < completed
                            ? 'h-2 w-2 bg-white/90'
                            : i === currentIndex
                              ? 'h-2.5 w-2.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]'
                              : 'h-2 w-2 bg-white/30',
                    )}
                />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function FocusedCountdownPage() {
    const { currentUser } = useAuth();

    // --- Query ---
    const { data, isLoading, error } = db.useQuery({
        familyMembers: {
            $: { order: { order: 'asc' } },
            choreAssignments: {},
        },
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            completions: { completedBy: {} },
            taskSeries: { tasks: {} },
        },
        routineMarkerStatuses: {},
        choreManualStarts: {},
        settings: {
            $: {
                where: {
                    or: [
                        { name: HOUSEHOLD_SCHEDULE_SETTINGS_NAME },
                        { name: COUNTDOWN_SETTINGS_NAME },
                    ],
                },
            },
        },
    });

    // --- Derived data ---
    const familyMembers = useMemo(() => (data?.familyMembers as any[]) || [], [data?.familyMembers]);
    const chores = useMemo(() => (data?.chores as any[]) || [], [data?.chores]);
    const routineMarkerStatuses = useMemo(
        () => (data?.routineMarkerStatuses as any[]) || [],
        [data?.routineMarkerStatuses],
    );
    const scheduleSettings: SharedScheduleSettings = useMemo(() => {
        const row = (data?.settings as any[])?.find((s: any) => s.name === HOUSEHOLD_SCHEDULE_SETTINGS_NAME);
        return parseSharedScheduleSettings(row?.value || null);
    }, [data?.settings]);
    const countdownSettings: CountdownSettings = useMemo(() => {
        const row = (data?.settings as any[])?.find((s: any) => s.name === COUNTDOWN_SETTINGS_NAME);
        return parseCountdownSettings(row?.value || null);
    }, [data?.settings]);

    const today = useMemo(() => getFamilyDayDateUTC(new Date(), scheduleSettings), [scheduleSettings]);
    const todayKey = today.toISOString().slice(0, 10);

    // --- State ---
    const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
    const [autoComplete, setAutoComplete] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [nowMs, setNowMs] = useState(Date.now());
    const [collisionDecisions, setCollisionDecisions] = useState<Record<string, CollisionDecision>>({});
    const [activeCollision, setActiveCollision] = useState<CountdownCollision | null>(null);
    const [celebratingSlotKey, setCelebratingSlotKey] = useState<string | null>(null);
    const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Build manualStarts map from InstantDB query results.
    const manualStarts: Record<string, string> = useMemo(() => {
        const map: Record<string, string> = {};
        for (const ms of (data?.choreManualStarts as any[]) || []) {
            if (ms.date === todayKey) {
                map[ms.choreId] = ms.startedAt;
            }
        }
        return map;
    }, [data?.choreManualStarts, todayKey]);

    // Sync auto-complete default from settings
    useEffect(() => {
        setAutoComplete(countdownSettings.autoMarkCompleteOnCountdownEnd);
    }, [countdownSettings.autoMarkCompleteOnCountdownEnd]);

    // Tick every second
    useEffect(() => {
        const interval = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Escape key exits fullscreen
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isFullscreen]);

    // --- Countdown engine ---
    const countdownOutput: CountdownEngineOutput | null = useMemo(() => {
        if (chores.length === 0) return null;
        try {
            const choreInputs: CountdownChoreInput[] = chores
                .filter((c: any) => {
                    const mode = getChoreTimingMode(c);
                    if (mode === 'anytime') return false;
                    const assigned = getAssignedMembersLocal(c, today);
                    return assigned.length > 0;
                })
                .map((c: any) => {
                    const assigned = getAssignedMembersLocal(c, today);
                    const memberCompletions: Record<string, string> = {};
                    for (const comp of c.completions || []) {
                        if (comp.completed && comp.dateDue === todayKey && comp.completedBy?.id) {
                            memberCompletions[comp.completedBy.id] =
                                comp.dateCompleted || new Date().toISOString();
                        }
                    }
                    return {
                        id: c.id,
                        title: c.title,
                        estimatedDurationSecs: c.estimatedDurationSecs ?? null,
                        weight: c.weight ?? null,
                        sortOrder: c.sortOrder ?? null,
                        isJoint: c.isJoint ?? false,
                        assigneeIds: assigned.map((a: any) => a.id),
                        timingMode: c.timingMode || 'anytime',
                        timingConfig: c.timingConfig || null,
                        timeBucket: c.timeBucket || null,
                        completedAt: null,
                        memberCompletions,
                    };
                });
            if (choreInputs.length === 0) return null;
            return computeCountdownTimelines({
                chores: choreInputs,
                routineMarkerStatuses,
                allChoresRaw: chores as any,
                countdownSettings,
                scheduleSettings,
                now: new Date(nowMs),
                date: today,
                collisionDecisions:
                    Object.keys(collisionDecisions).length > 0 ? collisionDecisions : undefined,
                manualStarts:
                    Object.keys(manualStarts).length > 0 ? manualStarts : undefined,
            });
        } catch (err) {
            console.error('Countdown engine error:', err);
            return null;
        }
        // Recompute every 30s (not every tick)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        chores,
        todayKey,
        routineMarkerStatuses,
        countdownSettings,
        scheduleSettings,
        collisionDecisions,
        manualStarts,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        Math.floor(nowMs / 30000),
    ]);

    // --- People with timelines ---
    const timelinePeople = useMemo(() => {
        if (!countdownOutput?.timelines) return [];
        return Object.entries(countdownOutput.timelines)
            .filter(([, t]) => (t as PersonCountdownTimeline).slots.length > 0)
            .map(([personId, timeline]) => {
                const member = familyMembers.find((m: any) => m.id === personId);
                return {
                    personId,
                    name: member?.name || 'Unknown',
                    photoUrls: member?.photoUrls,
                    timeline: timeline as PersonCountdownTimeline,
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [countdownOutput, familyMembers]);

    // Default selection to current user
    useEffect(() => {
        if (selectedPersonId && timelinePeople.some((p) => p.personId === selectedPersonId)) return;
        const currentMatch = timelinePeople.find((p) => p.personId === currentUser?.id);
        if (currentMatch) {
            setSelectedPersonId(currentMatch.personId);
        } else if (timelinePeople.length > 0) {
            setSelectedPersonId(timelinePeople[0].personId);
        }
    }, [timelinePeople, currentUser?.id, selectedPersonId]);

    // --- Active person data ---
    const activeTimeline = selectedPersonId
        ? (countdownOutput?.timelines?.[selectedPersonId] as PersonCountdownTimeline | undefined)
        : null;

    const visibleSlots = useMemo(() => {
        if (!activeTimeline) return [];
        return activeTimeline.slots
            .filter((s) => s.state !== 'buffer')
            .sort((a, b) => a.countdownStartMs - b.countdownStartMs);
    }, [activeTimeline]);

    const selectedPerson = timelinePeople.find((p) => p.personId === selectedPersonId);

    // --- Find the focus chore (first undone) ---
    const { focusSlot, focusIndex, completedCount, nextSlot } = useMemo(() => {
        let focus: CountdownSlot | null = null;
        let idx = -1;
        let completed = 0;
        let next: CountdownSlot | null = null;

        // Priority: overdue → active → upcoming
        const overdue: CountdownSlot[] = [];
        const active: CountdownSlot[] = [];
        const upcoming: CountdownSlot[] = [];

        for (const slot of visibleSlots) {
            const st = getLiveState(slot, nowMs);
            if (st === 'completed') {
                completed++;
            } else if (st === 'overdue_active') {
                overdue.push(slot);
            } else if (st === 'active') {
                active.push(slot);
            } else if (st === 'upcoming') {
                upcoming.push(slot);
            }
        }

        const ordered = [...overdue, ...active, ...upcoming];
        if (ordered.length > 0) {
            focus = ordered[0];
            idx = visibleSlots.indexOf(focus);
            next = ordered.length > 1 ? ordered[1] : null;
        }

        return { focusSlot: focus, focusIndex: idx, completedCount: completed, nextSlot: next };
    }, [visibleSlots, nowMs]);

    // --- Ahead/behind delta for the current focus chore ---
    const cumulativeDelta = useMemo(() => {
        return computeStackDelta(focusSlot, nowMs);
    }, [focusSlot, nowMs]);

    // --- Chore description lookup ---
    const focusChoreDescription = useMemo(() => {
        if (!focusSlot) return null;
        const chore = chores.find((c: any) => c.id === focusSlot.choreId) as any;
        return chore?.description || null;
    }, [focusSlot, chores]);

    // --- Collision handling ---
    const handleCollisionDecision = useCallback(
        (startChoreId: string, deadlineChoreId: string, decision: CollisionDecision) => {
            const key = `${startChoreId}:${deadlineChoreId}`;
            setCollisionDecisions((prev) => ({ ...prev, [key]: decision }));
        },
        [],
    );

    const unresolvedCollisions = useMemo(() => {
        if (!countdownOutput?.timelines) return [];
        const all: Array<CountdownCollision & { memberName: string }> = [];
        for (const [personId, timeline] of Object.entries(countdownOutput.timelines)) {
            const t = timeline as PersonCountdownTimeline;
            for (const c of t.collisions) {
                const member = familyMembers.find((m: any) => m.id === personId);
                all.push({ ...c, memberName: member?.name || 'Unknown' });
            }
        }
        return all;
    }, [countdownOutput, familyMembers]);

    // --- Mark done handler ---
    const handleMarkDone = useCallback(
        async (choreId: string, personId: string) => {
            const slotKey = `${choreId}:${personId}`;
            const nowIso = new Date().toISOString();
            const dateKey = todayKey;

            // Trigger celebration animation
            setCelebratingSlotKey(slotKey);
            if (celebrationTimerRef.current) clearTimeout(celebrationTimerRef.current);
            celebrationTimerRef.current = setTimeout(() => {
                setCelebratingSlotKey(null);
            }, countdownSettings.stackBufferSecs * 1000);

            try {
                const completionId = id();
                await db.transact([
                    tx.choreCompletions[completionId]
                        .update({
                            completed: true,
                            dateDue: dateKey,
                            dateCompleted: nowIso,
                            allowanceAwarded: false,
                        })
                        .link({ chore: choreId, completedBy: personId }),
                ]);
            } catch (err) {
                console.error('Failed to mark chore done:', err);
            }
        },
        [todayKey, countdownSettings.stackBufferSecs],
    );

    // --- Start Now handler ---
    // Creates a manual start in InstantDB for the given chore at the current
    // time. The engine applies this to shift the chore's effective start
    // earlier. No buffer is applied — the chore starts immediately.
    const handleStartNow = useCallback(
        async (choreId: string) => {
            if (!selectedPersonId) return;
            const nowIso = new Date().toISOString();
            try {
                const manualStartId = id();
                await db.transact([
                    tx.choreManualStarts[manualStartId]
                        .update({
                            choreId,
                            familyMemberId: selectedPersonId,
                            date: todayKey,
                            startedAt: nowIso,
                        })
                        .link({ chore: choreId, familyMember: selectedPersonId }),
                ]);
            } catch (err) {
                console.error('Failed to start chore:', err);
            }
        },
        [todayKey, selectedPersonId],
    );

    // --- Stop handler ---
    // Clears all manual starts for the current person and date, reverting
    // all uncompleted chores to their original target times.
    const handleStop = useCallback(
        async () => {
            if (!selectedPersonId) return;
            const toDelete = ((data?.choreManualStarts as any[]) || []).filter(
                (ms: any) =>
                    ms.date === todayKey && ms.familyMemberId === selectedPersonId,
            );
            if (toDelete.length === 0) return;
            try {
                await db.transact(
                    toDelete.map((ms: any) => tx.choreManualStarts[ms.id].delete()),
                );
            } catch (err) {
                console.error('Failed to clear manual starts:', err);
            }
        },
        [todayKey, selectedPersonId, data?.choreManualStarts],
    );

    // --- Auto-complete effect ---
    useEffect(() => {
        if (!autoComplete || !activeTimeline) return;
        for (const slot of activeTimeline.slots) {
            if (slot.state === 'completed') continue;
            const liveState = getLiveState(slot, nowMs);
            if (liveState === 'overdue_active') {
                handleMarkDone(slot.choreId, slot.personId);
            }
        }
    }, [autoComplete, activeTimeline, nowMs, handleMarkDone]);

    // --- Timer state for the focus chore ---
    const focusTimerState: RadialTimerState = useMemo(() => {
        if (!focusSlot) return 'upcoming';
        const slotKey = `${focusSlot.choreId}:${focusSlot.personId}`;
        if (celebratingSlotKey === slotKey) return 'celebrating';
        return getTimerState(getLiveState(focusSlot, nowMs));
    }, [focusSlot, nowMs, celebratingSlotKey]);

    const focusProgress = focusSlot ? getSlotProgress(focusSlot, nowMs) : 0;
    // When the focus slot is upcoming, display the time until its start instead
    // of the full duration (which would otherwise count down statically with
    // the ring sitting at 0). Once it goes active we switch to the remaining
    // duration as normal.
    const focusIsUpcoming = focusTimerState === 'upcoming' && !!focusSlot;
    const focusDisplayMs = focusSlot
        ? focusIsUpcoming
            ? focusSlot.countdownStartMs - nowMs
            : focusSlot.countdownEndMs - nowMs
        : 0;
    const { main: countdownMain, sub: countdownSub, sign: countdownSign } = formatCountdown(focusDisplayMs);

    // --- Measurement-based adaptive font sizing ---
    // We measure the digits using a canvas context (synchronous, no DOM dependency).
    // Once shrunk during a chore, the scale never jumps back up.
    const ringContainerRef = useRef<HTMLDivElement>(null);
    const [ringWidthPx, setRingWidthPx] = useState(0);
    const minScaleRef = useRef(1);
    const prevFocusChoreId = useRef<string | null>(null);
    const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);

    // Reset min scale when the chore changes
    useEffect(() => {
        const choreId = focusSlot?.choreId ?? null;
        if (choreId !== prevFocusChoreId.current) {
            prevFocusChoreId.current = choreId;
            minScaleRef.current = 1;
        }
    }, [focusSlot?.choreId]);

    // Observe ring container width
    useEffect(() => {
        const el = ringContainerRef.current;
        if (!el) return;
        // Read initial size synchronously
        setRingWidthPx(el.offsetWidth);
        const ro = new ResizeObserver(([entry]) => {
            setRingWidthPx(entry.contentRect.width);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Ideal base size: 20% of ring width for main digits
    // Ideal base size: 26% of ring width for main digits (matches the HTML reference proportions)
    const idealMainPx = ringWidthPx * 0.26;
    // Safe text area for the countdown digits: ~65% of ring diameter
    const safeWidth = ringWidthPx * 0.75;

    // Synchronous canvas-based text measurement + ratchet-down scale
    const fontScale = useMemo(() => {
        if (idealMainPx <= 0 || safeWidth <= 0) return 1;

        // Lazily create a canvas context for text measurement
        if (!canvasCtxRef.current) {
            const canvas = document.createElement('canvas');
            canvasCtxRef.current = canvas.getContext('2d');
        }
        const ctx = canvasCtxRef.current;
        if (!ctx) return minScaleRef.current;

        // Measure the full text string at the ideal main font size
        const fontFamily = 'system-ui, -apple-system, sans-serif';
        ctx.font = `bold ${idealMainPx}px ${fontFamily}`;
        const mainWidth = ctx.measureText(countdownSign + countdownMain).width;
        const subWidth = countdownSub
            ? (() => {
                  ctx.font = `bold ${idealMainPx * 0.45}px ${fontFamily}`;
                  return ctx.measureText(countdownSub).width + idealMainPx * 0.05; // + small gap
              })()
            : 0;
        const totalWidth = mainWidth + subWidth;

        let needed = 1;
        if (totalWidth > safeWidth) {
            needed = safeWidth / totalWidth;
        }
        // Ratchet down only — never grow back during the same chore
        minScaleRef.current = Math.min(needed, minScaleRef.current);
        return minScaleRef.current;
    }, [countdownMain, countdownSub, countdownSign, idealMainPx, safeWidth]);

    // When ringWidthPx is 0 (before first measure), use CSS vmin-based fallback
    const hasMeasured = ringWidthPx > 0;
    const scaledMainPx = idealMainPx * fontScale;
    const scaledSubPx = scaledMainPx * 0.45;
    const scaledSignPx = scaledMainPx * 0.35;
    // CSS fallback sizes for the initial render frame
    const mainFontStyle = hasMeasured
        ? { fontSize: `${scaledMainPx}px` }
        : { fontSize: 'min(21vmin, 180px)' };
    const subFontStyle = hasMeasured
        ? { fontSize: `${scaledSubPx}px` }
        : { fontSize: 'min(9.5vmin, 81px)' };
    const signFontStyle = hasMeasured
        ? { fontSize: `${scaledSignPx}px` }
        : { fontSize: 'min(7.3vmin, 63px)' };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="text-lg text-white/60 animate-pulse">Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="text-lg text-red-300">Error: {error.message}</div>
            </div>
        );
    }

    if (timelinePeople.length === 0) {
        return (
            <div className="flex h-[80vh] flex-col items-center justify-center gap-4">
                <Timer className={cn('h-16 w-16', isFullscreen ? 'text-white/30' : 'text-muted-foreground/30')} />
                <div className="text-center">
                    <h2 className={cn('text-xl font-semibold', isFullscreen ? 'text-white/80' : 'text-foreground/70')}>No Countdown Chores</h2>
                    <p className={cn('mt-1 text-sm', isFullscreen ? 'text-white/50' : 'text-muted-foreground')}>
                        Chores with timing rules and estimated durations will appear here.
                    </p>
                </div>
            </div>
        );
    }

    const allDone = visibleSlots.length > 0 && completedCount === visibleSlots.length;

    return (
        <div
            className={cn(
                'flex flex-col items-center',
                isFullscreen && 'fixed inset-0 z-50 overflow-auto bg-black',
                !isFullscreen && 'min-h-[80vh]',
            )}
        >
            {/* ---- Top bar ---- */}
            <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
                {/* Person selector */}
                <div className="flex flex-wrap items-center gap-2">
                    {timelinePeople.map((p) => {
                        const isSelected = p.personId === selectedPersonId;
                        const memberPhotoUrl = getPhotoUrl(p.photoUrls, '64');
                        return (
                            <button
                                key={p.personId}
                                type="button"
                                onClick={() => setSelectedPersonId(p.personId)}
                                className={cn(
                                    'flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                                    isSelected
                                        ? 'bg-white/25 text-white shadow-lg shadow-white/10 backdrop-blur-sm'
                                        : 'bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80 backdrop-blur-sm',
                                )}
                            >
                                <Avatar className="h-6 w-6">
                                    {memberPhotoUrl && <AvatarImage src={memberPhotoUrl} alt={p.name} />}
                                    <AvatarFallback className="bg-white/20 text-[10px] text-white font-semibold">
                                        {getInitials(p.name)}
                                    </AvatarFallback>
                                </Avatar>
                                {p.name}
                            </button>
                        );
                    })}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">
                            Auto
                        </span>
                        <Switch
                            checked={autoComplete}
                            onCheckedChange={setAutoComplete}
                            className="data-[state=checked]:bg-white/30"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsFullscreen((f) => !f)}
                        className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                    </button>
                </div>
            </div>

            {/* ---- Collision banners ---- */}
            {unresolvedCollisions.length > 0 && (
                <div className="w-full max-w-lg space-y-2 px-4">
                    {unresolvedCollisions.map((c) => {
                        const key = `${c.startDrivenChoreId}:${c.deadlineDrivenChoreId}`;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setActiveCollision(c)}
                                className="w-full rounded-xl border border-amber-400/30 bg-amber-500/20 px-4 py-2 text-left backdrop-blur-sm transition-all hover:bg-amber-500/30"
                            >
                                <div className="flex items-center gap-2 text-sm font-medium text-amber-100">
                                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                                    <span className="flex-1 truncate">
                                        Conflict: &ldquo;{c.startDrivenChoreTitle}&rdquo; overlaps
                                        &ldquo;{c.deadlineDrivenChoreTitle}&rdquo;
                                    </span>
                                    <span className="text-xs text-amber-200/70">Resolve &rarr;</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}

            <CollisionDecisionDialog
                collision={activeCollision}
                memberName={
                    activeCollision
                        ? familyMembers.find((m: any) => m.id === activeCollision.personId)?.name || 'Unknown'
                        : ''
                }
                open={activeCollision !== null}
                onDecision={handleCollisionDecision}
                onClose={() => setActiveCollision(null)}
            />

            {/* ---- Timer ---- */}
            <div className="flex flex-1 flex-col items-center justify-center px-4">
                {allDone ? (
                    /* All chores complete */
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-white/15 backdrop-blur-sm">
                            <Check className="h-16 w-16 text-white" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold text-white">All Done!</h2>
                            <p className="mt-2 text-base text-white/60">
                                {completedCount} chore{completedCount !== 1 ? 's' : ''} completed
                            </p>
                            {cumulativeDelta !== 0 && (
                                <p
                                    className={cn(
                                        'mt-1 text-sm font-medium',
                                        cumulativeDelta > 0 ? 'text-emerald-300' : 'text-red-300',
                                    )}
                                >
                                    {cumulativeDelta > 0 ? 'Finished' : 'Ran'} {formatDelta(Math.abs(cumulativeDelta))}{' '}
                                    {cumulativeDelta > 0 ? 'ahead of schedule' : 'behind schedule'}
                                </p>
                            )}
                        </div>
                    </div>
                ) : focusSlot ? (
                    /* Active timer */
                    <div ref={ringContainerRef} className="relative">
                        <RadialTimer
                            startMs={focusSlot.countdownStartMs}
                            endMs={focusSlot.countdownEndMs}
                            progress={focusProgress}
                            state={focusTimerState}
                            choreKey={`${focusSlot.choreId}:${focusSlot.personId}`}
                        >
                            {/* Countdown numbers */}
                            <div className="flex flex-col items-center gap-2">
                                {focusIsUpcoming && (
                                    <div
                                        className="font-medium uppercase tracking-wider text-white/60"
                                        style={hasMeasured ? { fontSize: `${Math.max(11, ringWidthPx * 0.022)}px` } : { fontSize: 'min(2.4vmin, 14px)' }}
                                    >
                                        Starts in
                                    </div>
                                )}
                                <div className="flex items-baseline gap-0.5">
                                    {countdownSign && (
                                        <span
                                            className={cn(
                                                'font-bold tabular-nums leading-none',
                                                focusTimerState === 'overdue'
                                                    ? 'text-red-200'
                                                    : focusTimerState === 'celebrating'
                                                      ? 'text-emerald-200'
                                                      : 'text-white',
                                            )}
                                            style={signFontStyle}
                                        >
                                            {countdownSign}
                                        </span>
                                    )}
                                    <span
                                        className={cn(
                                            'font-bold tabular-nums leading-none',
                                            focusTimerState === 'overdue'
                                                ? 'text-red-100'
                                                : focusTimerState === 'celebrating'
                                                  ? 'text-emerald-100'
                                                  : 'text-white',
                                        )}
                                        style={{
                                            ...mainFontStyle,
                                            fontVariantNumeric: 'tabular-nums',
                                            textShadow: '0 10px 30px rgba(0,0,0,0.15)',
                                        }}
                                    >
                                        {focusTimerState === 'celebrating' ? (
                                            <Check
                                                className="inline"
                                                style={
                                                    hasMeasured
                                                        ? { width: `${scaledMainPx * 0.8}px`, height: `${scaledMainPx * 0.8}px` }
                                                        : { width: 'min(17vmin, 144px)', height: 'min(17vmin, 144px)' }
                                                }
                                            />
                                        ) : (
                                            countdownMain
                                        )}
                                    </span>
                                    {countdownSub && focusTimerState !== 'celebrating' && (
                                        <span
                                            className={cn(
                                                'ml-1 font-bold tabular-nums leading-none',
                                                focusTimerState === 'overdue'
                                                    ? 'text-red-200/60'
                                                    : 'text-white/40',
                                            )}
                                            style={subFontStyle}
                                        >
                                            {countdownSub}
                                        </span>
                                    )}
                                </div>

                                {/* Chore title */}
                                <div className="mt-3 max-w-[82%] text-center">
                                    <div
                                        className={cn(
                                            'font-semibold leading-snug',
                                            focusTimerState === 'overdue'
                                                ? 'text-red-100/90'
                                                : focusTimerState === 'celebrating'
                                                  ? 'text-emerald-100/90'
                                                  : 'text-white/80',
                                        )}
                                        style={hasMeasured ? { fontSize: `${Math.max(16, ringWidthPx * 0.042)}px` } : { fontSize: 'min(4vmin, 28px)' }}
                                    >
                                        {focusSlot.choreTitle}
                                    </div>
                                    {focusChoreDescription && (
                                        <div
                                            className="mt-1.5 leading-snug text-white/50 line-clamp-2"
                                            style={hasMeasured ? { fontSize: `${Math.max(13, ringWidthPx * 0.028)}px` } : { fontSize: 'min(2.8vmin, 18px)' }}
                                        >
                                            {focusChoreDescription}
                                        </div>
                                    )}
                                </div>

                                {/* Family member avatar */}
                                {selectedPerson && (
                                    <Avatar
                                        className="mt-3 ring-2 ring-white/20"
                                        style={
                                            hasMeasured
                                                ? { width: `${Math.max(36, ringWidthPx * 0.08)}px`, height: `${Math.max(36, ringWidthPx * 0.08)}px` }
                                                : { width: 'min(8vmin, 56px)', height: 'min(8vmin, 56px)' }
                                        }
                                    >
                                        {getPhotoUrl(selectedPerson.photoUrls, '320') && (
                                            <AvatarImage
                                                src={getPhotoUrl(selectedPerson.photoUrls, '320')!}
                                                alt={selectedPerson.name}
                                            />
                                        )}
                                        <AvatarFallback
                                            className="bg-white/20 text-white font-semibold"
                                            style={hasMeasured ? { fontSize: `${Math.max(12, ringWidthPx * 0.028)}px` } : { fontSize: 'min(3vmin, 18px)' }}
                                        >
                                            {getInitials(selectedPerson.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                )}
                            </div>
                        </RadialTimer>
                    </div>
                ) : (
                    /* No focus chore — shouldn't happen if not allDone, but handle gracefully */
                    <div className="flex flex-col items-center gap-4 text-center">
                        <Clock className="h-12 w-12 text-white/30" />
                        <p className="text-white/50">Waiting for the next chore...</p>
                    </div>
                )}
            </div>

            {/* ---- Info strip below the timer ---- */}
            {focusSlot && !allDone && (
                <div className="flex w-full max-w-lg flex-col items-center gap-4 px-4 pb-4">
                    {/* Progress dots + delta + next chore */}
                    <div className="flex w-full flex-col items-center gap-3">
                        <ProgressDots
                            total={visibleSlots.length}
                            completed={completedCount}
                            currentIndex={focusIndex}
                        />

                        <div className="flex items-center gap-4">
                            {/* Cumulative delta */}
                            {cumulativeDelta !== 0 && (
                                <div
                                    className={cn(
                                        'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm',
                                        cumulativeDelta > 0
                                            ? 'bg-emerald-500/20 text-emerald-200'
                                            : 'bg-red-500/20 text-red-200',
                                    )}
                                >
                                    {cumulativeDelta > 0 ? (
                                        <TrendingUp className="h-3 w-3" />
                                    ) : (
                                        <TrendingDown className="h-3 w-3" />
                                    )}
                                    {formatDelta(Math.abs(cumulativeDelta))}{' '}
                                    {cumulativeDelta > 0 ? 'ahead' : 'behind'}
                                </div>
                            )}
                            {cumulativeDelta === 0 && completedCount > 0 && (
                                <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/60 backdrop-blur-sm">
                                    <Minus className="h-3 w-3" />
                                    On track
                                </div>
                            )}
                        </div>

                        {/* Next chore preview */}
                        {nextSlot && (
                            <div className="flex items-center gap-1.5 text-xs text-white/50">
                                <span>Next:</span>
                                <span className="font-medium text-white/70">{nextSlot.choreTitle}</span>
                                <ChevronRight className="h-3 w-3" />
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex w-full max-w-xs flex-col gap-2">
                        {focusIsUpcoming ? (
                            <Button
                                size="lg"
                                onClick={() => {
                                    if (focusSlot) handleStartNow(focusSlot.choreId);
                                }}
                                className="w-full rounded-2xl bg-white/90 py-6 text-base font-bold text-slate-900 shadow-xl shadow-white/20 transition-all hover:bg-white"
                            >
                                <span className="flex items-center gap-2">
                                    <Play className="h-5 w-5 fill-current" />
                                    Start Now
                                </span>
                            </Button>
                        ) : (
                            <Button
                                size="lg"
                                onClick={() => {
                                    if (focusSlot && selectedPersonId) {
                                        handleMarkDone(focusSlot.choreId, selectedPersonId);
                                    }
                                }}
                                disabled={focusTimerState === 'celebrating'}
                                className={cn(
                                    'w-full rounded-2xl py-6 text-base font-bold shadow-xl transition-all',
                                    focusTimerState === 'overdue'
                                        ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                                        : focusTimerState === 'celebrating'
                                          ? 'bg-emerald-500 text-white shadow-emerald-500/30'
                                          : focusTimerState === 'active'
                                            ? 'bg-white/90 hover:bg-white text-slate-900 shadow-white/20'
                                            : 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm',
                                )}
                            >
                                {focusTimerState === 'celebrating' ? (
                                    <span className="flex items-center gap-2">
                                        <Check className="h-5 w-5" />
                                        Done!
                                    </span>
                                ) : (
                                    'Mark Done'
                                )}
                            </Button>
                        )}
                        {/* Stop button — visible only when ahead, reverts to target times */}
                        {cumulativeDelta > 0 && !focusIsUpcoming && (
                            <Button
                                size="lg"
                                variant="ghost"
                                onClick={handleStop}
                                className="w-full rounded-2xl py-4 text-sm font-medium text-white/60 transition-all hover:bg-white/10 hover:text-white/80"
                            >
                                <span className="flex items-center gap-2">
                                    <Square className="h-4 w-4" />
                                    Stop — revert to schedule
                                </span>
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
