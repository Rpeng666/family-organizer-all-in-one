// components/ChoresTracker.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { tx, id } from '@instantdb/react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
    PlusCircle,
    SlidersHorizontal,
    ListTodo,
    GitBranch,
    LayoutList,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import ChoreList from './ChoreList';
import AllChoresInventory from './AllChoresInventory';
import SequenceTimeline from '@/components/countdown/SequenceTimeline';
import DetailedChoreForm from './DetailedChoreForm';
import DateCarousel from '@/components/ui/DateCarousel';
import { toUTCDate } from '@/lib/chore-utils';
import { useAuth } from '@/components/AuthProvider';
import { useParentMode } from '@/components/auth/useParentMode';
import { RestrictedButton } from '@/components/ui/RestrictedButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import TaskSeriesEditor from '@/components/task-series/TaskSeriesEditor';
import {
    getFamilyDayDateUTC,
    getAssignedMembersForChoreOnDate,
    sortChoresForDisplay,
    computeCountdownTimelines,
    getChoreTimingMode,
    type CountdownEngineOutput,
    type CountdownChoreInput,
    type PersonCountdownTimeline,
} from '@family-organizer/shared-core';
import { useChoresData } from '@/hooks/useChoresData';
import { useChoreMutations } from '@/hooks/useChoreMutations';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChoresTrackerProps {
    pageMode?: 'chores' | 'tasks';
    viewScope?: 'daily' | 'all';
    initialSelectedMember?: string | null;
    initialSelectedDate?: string | null;
    focusedChoreId?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

function ChoresTracker({
    pageMode = 'chores',
    viewScope = 'daily',
    initialSelectedMember = null,
    initialSelectedDate = null,
    focusedChoreId = null,
}: ChoresTrackerProps) {
    // ── UI state ──────────────────────────────────────────────────────────────
    const [selectedMember, setSelectedMember] = useState<string>(
        viewScope === 'all' ? 'All' : initialSelectedMember ?? 'All',
    );
    const [allChoresSubView, setAllChoresSubView] = useState<'inventory' | 'sequence'>('inventory');
    const [nowMs, setNowMs] = useState(Date.now());
    const [isDetailedChoreModalOpen, setIsDetailedChoreModalOpen] = useState(false);
    const [editingTaskSeriesId, setEditingTaskSeriesId] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(() => {
        if (initialSelectedDate) {
            const parsed = new Date(`${initialSelectedDate}T00:00:00Z`);
            if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        return getFamilyDayDateUTC(new Date());
    });

    // ── Auth ──────────────────────────────────────────────────────────────────
    const { currentUser } = useAuth();
    const { isParentMode } = useParentMode();
    const isParent = isParentMode;

    // Sync props → state
    React.useEffect(() => {
        if (viewScope === 'all') { setSelectedMember('All'); return; }
        if (initialSelectedMember) setSelectedMember(initialSelectedMember);
    }, [initialSelectedMember, viewScope]);

    React.useEffect(() => {
        if (viewScope === 'all') {
            const now = new Date();
            setSelectedDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
            return;
        }
        if (!initialSelectedDate) return;
        const parsed = new Date(`${initialSelectedDate}T00:00:00Z`);
        if (!Number.isNaN(parsed.getTime())) setSelectedDate(parsed);
    }, [initialSelectedDate, viewScope]);

    // ── Data ──────────────────────────────────────────────────────────────────
    const {
        isLoading, error,
        familyMembers, chores, unitDefinitions, gradeTypes,
        allChoreCompletions, routineMarkerStatuses, choreAssignments,
        scheduleSettings, countdownSettings,
        currencyOptions,
    } = useChoresData();

    const selectedDateKey = selectedDate.toISOString().slice(0, 10);
    const todayDateKey = getFamilyDayDateUTC(new Date(), scheduleSettings).toISOString().slice(0, 10);

    // ── Mutations ─────────────────────────────────────────────────────────────
    const mutations = useChoreMutations({
        chores, routineMarkerStatuses, allChoreCompletions, familyMembers,
        choreAssignments, selectedDate, selectedDateKey,
        currentUserId: currentUser?.id, isParentMode,
        onAddChoreSuccess: () => setIsDetailedChoreModalOpen(false),
    });

    // ── Countdown engine ──────────────────────────────────────────────────────
    const countdownTimelines: CountdownEngineOutput | null = useMemo(() => {
        if (chores.length === 0) return null;
        try {
            const choreInputs: CountdownChoreInput[] = chores
                .filter((c) => {
                    if (getChoreTimingMode(c as never) === 'anytime') return false;
                    return getAssignedMembersForChoreOnDate(c as never, selectedDate).length > 0;
                })
                .map((c) => {
                    const assigned = getAssignedMembersForChoreOnDate(c as never, selectedDate);
                    const memberCompletions: Record<string, string> = {};
                    for (const comp of c.completions ?? []) {
                        if (comp.completed && comp.dateDue === selectedDateKey && comp.completedBy?.id) {
                            memberCompletions[comp.completedBy.id] = new Date().toISOString();
                        }
                    }
                    return {
                        id: c.id, title: c.title,
                        estimatedDurationSecs: c.estimatedDurationSecs ?? null,
                        weight: c.weight ?? null, sortOrder: c.sortOrder ?? null,
                        isJoint: c.isJoint ?? false,
                        assigneeIds: assigned.map((a) => a.id),
                        timingMode: c.timingMode ?? 'anytime',
                        timingConfig: c.timingConfig ?? null,
                        timeBucket: c.timeBucket ?? null,
                        completedAt: null, memberCompletions,
                    };
                });
            if (choreInputs.length === 0) return null;
            return computeCountdownTimelines({
                chores: choreInputs, routineMarkerStatuses, allChoresRaw: chores as never,
                countdownSettings, scheduleSettings, now: new Date(), date: selectedDate,
            });
        } catch (err) {
            console.error('Countdown engine error:', err);
            return null;
        }
    }, [chores, selectedDateKey, selectedDate, routineMarkerStatuses, countdownSettings, scheduleSettings]);

    // Tick for sequence view
    React.useEffect(() => {
        if (allChoresSubView !== 'sequence') return;
        const interval = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [allChoresSubView]);

    const sequencePeople = useMemo(() => {
        if (!countdownTimelines?.timelines) return [];
        return Object.entries(countdownTimelines.timelines)
            .filter(([, t]) => (t as PersonCountdownTimeline).slots.length > 0)
            .map(([personId, timeline]) => {
                const member = familyMembers.find((m) => m.id === personId);
                return { personId, name: member?.name ?? 'Unknown', timeline: timeline as PersonCountdownTimeline };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [countdownTimelines, familyMembers]);

    const sequenceFamilyMembers = useMemo(
        () => familyMembers.map((m) => ({ id: m.id, name: m.name, color: m.color })),
        [familyMembers],
    );
    const sequenceChoresRaw = useMemo(
        () => chores.map((c) => ({ id: c.id, timingMode: c.timingMode, sortOrder: c.sortOrder, timingConfig: c.timingConfig })),
        [chores],
    );

    // ── Filtered chores ───────────────────────────────────────────────────────
    const filteredChores = useMemo(() => {
        const visible = chores.filter((chore) => {
            if (!chore?.id || !chore.startDate) return false;
            if (pageMode === 'tasks' && (!chore.taskSeries || chore.taskSeries.length === 0)) {
                const hasActivePullForward = false;
                if (!hasActivePullForward) return false;
            }
            if (pageMode === 'tasks' && chore.taskSeries) {
                const hasActivePullForward = chore.taskSeries.some((series: unknown) => {
                    const s = series as { pullForwardCount?: number; familyMember?: unknown };
                    if ((s.pullForwardCount ?? 0) <= 0) return false;
                    const ownerId = Array.isArray(s.familyMember)
                        ? (s.familyMember as { id: string }[])[0]?.id
                        : (s.familyMember as { id: string })?.id;
                    return selectedMember === 'All' || ownerId === selectedMember;
                });
                if (hasActivePullForward) return true;
            }
            const assignedMembers = getAssignedMembersForChoreOnDate(chore as never, selectedDate);
            if (selectedMember === 'All') return assignedMembers.length > 0;
            return assignedMembers.some((a) => a.id === selectedMember);
        });
        return sortChoresForDisplay(visible as never, {
            date: selectedDate, routineMarkerStatuses, chores: chores as never, scheduleSettings,
        }).map((entry) => entry.chore as typeof chores[0]);
    }, [chores, pageMode, routineMarkerStatuses, scheduleSettings, selectedDate, selectedMember]);

    // ── View settings ─────────────────────────────────────────────────────────
    const loggedInMember = familyMembers.find((m) => m.id === currentUser?.id);
    const defaultViewSetting = selectedMember !== 'All';
    const showChoreDescriptions = loggedInMember?.viewShowChoreDescriptions ?? defaultViewSetting;
    const showTaskDetails = loggedInMember?.viewShowTaskDetails ?? defaultViewSetting;

    // ── Derived ───────────────────────────────────────────────────────────────
    const canAddChore = isParent;
    const selectedMemberName = familyMembers.find((m) => m.id === selectedMember)?.name;
    const selectedDateLabel = selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const tasksHistoryHref = (() => {
        const params = new URLSearchParams();
        params.set('domain', 'tasks');
        if (selectedMember !== 'All') params.set('member', selectedMember);
        return `/history?${params.toString()}`;
    })();
    const completedCount = filteredChores.filter((chore) =>
        chore.completions?.some((c) =>
            c.completed && c.dateDue === selectedDateKey &&
            (selectedMember === 'All' || c.completedBy?.id === selectedMember),
        )
    ).length;

    // ── Loading / error states ────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <p className="text-sm">Loading chores…</p>
                </div>
            </div>
        );
    }
    if (error) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center max-w-sm">
                    <p className="font-medium text-destructive">Failed to load</p>
                    <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
                </div>
            </div>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="mx-auto w-full max-w-5xl px-4 md:px-6 py-8 space-y-6">

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="rounded-3xl border border-border/60 bg-card px-6 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">
                            {pageMode === 'tasks' ? 'Tasks' : 'Chores'}
                        </p>
                        <h1
                            className="text-3xl leading-tight text-foreground"
                            style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500, letterSpacing: '-0.02em' }}
                        >
                            {viewScope === 'all'
                                ? 'All Chores'
                                : selectedMember === 'All'
                                ? `Family ${pageMode === 'tasks' ? 'Tasks' : 'Day'}`
                                : `${selectedMemberName ?? 'Selected'}’s ${pageMode === 'tasks' ? 'Tasks' : 'Day'}`
                            }
                        </h1>
                        <p className="mt-1.5 text-sm text-muted-foreground/60">
                            {viewScope === 'all'
                                ? `All family members · ${selectedDateLabel}`
                                : `${completedCount} of ${filteredChores.length} done · ${selectedDateLabel}`
                            }
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {viewScope === 'all' && pageMode === 'chores' && (
                            <>
                                <div className="flex rounded-lg border border-border p-0.5 bg-muted/40">
                                    {[
                                        { view: 'inventory' as const, icon: <LayoutList className="h-3.5 w-3.5" />, label: 'List' },
                                        { view: 'sequence' as const, icon: <GitBranch className="h-3.5 w-3.5" />, label: 'Sequence' },
                                    ].map(({ view, icon, label }) => (
                                        <button
                                            key={view}
                                            type="button"
                                            onClick={() => setAllChoresSubView(view)}
                                            className={cn(
                                                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                                                allChoresSubView === view
                                                    ? 'bg-primary text-primary-foreground shadow-sm'
                                                    : 'text-muted-foreground hover:text-foreground',
                                            )}
                                        >
                                            {icon} {label}
                                        </button>
                                    ))}
                                </div>
                                <Link href="/chores">
                                    <Button variant="outline" size="sm">Day view</Button>
                                </Link>
                            </>
                        )}

                        {viewScope === 'daily' && (
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button
                                        type="button"
                                        className="shrink-0 rounded-2xl border border-border/60 bg-secondary/60 px-4 py-3 text-right transition-colors duration-200 hover:bg-secondary"
                                    >
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                                            {selectedDateKey === todayDateKey ? 'Today' : 'Selected'}
                                        </p>
                                        <p
                                            className="text-sm text-foreground"
                                            style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500 }}
                                        >
                                            {selectedDateLabel}
                                        </p>
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-[min(92vw,640px)] p-2">
                                    <DateCarousel
                                        initialDate={selectedDate}
                                        onDateSelect={(date) => setSelectedDate(toUTCDate(date))}
                                    />
                                </PopoverContent>
                            </Popover>
                        )}
                    </div>
                </div>

                {/* Member pills */}
                {viewScope === 'daily' && familyMembers.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedMember('All')}
                            className={cn(
                                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-200',
                                selectedMember === 'All'
                                    ? 'border-foreground/20 bg-foreground text-background'
                                    : 'border-border/60 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
                            )}
                        >
                            All
                        </button>
                        {familyMembers.map((member) => {
                            const isActive = selectedMember === member.id;
                            const m = member as { resizedPhotoUrls?: { small?: string }; photoUrl?: string };
                            const photoUrl = m.resizedPhotoUrls?.small ?? m.photoUrl ?? null;
                            return (
                                <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => setSelectedMember(member.id)}
                                    className={cn(
                                        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-200',
                                        isActive
                                            ? 'border-foreground/20 bg-foreground text-background'
                                            : 'border-border/60 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
                                    )}
                                >
                                    <Avatar className="h-5 w-5 shrink-0">
                                        {photoUrl ? <AvatarImage src={photoUrl} alt={member.name} /> : null}
                                        <AvatarFallback className="text-[9px] bg-muted">
                                            {member.name.slice(0, 1).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    {member.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </section>

            {/* ── Countdown warnings ───────────────────────────────────────── */}
            {viewScope === 'daily' && countdownTimelines && (() => {
                const warnings: Array<{ key: string; memberName: string; message: string; severity: string }> = [];
                for (const [pid, tl] of Object.entries(countdownTimelines.timelines)) {
                    const t = tl as PersonCountdownTimeline;
                    for (const w of t.warnings) {
                        const member = familyMembers.find((m) => m.id === pid);
                        warnings.push({ key: `${pid}:${w.message}`, memberName: member?.name ?? 'Unknown', message: w.message, severity: w.severity });
                    }
                }
                if (warnings.length === 0) return null;
                return (
                    <div className="space-y-1.5">
                        {warnings.map((w) => (
                            <div
                                key={w.key}
                                className={cn(
                                    'rounded-lg border px-3 py-1.5 text-xs flex items-center gap-2',
                                    w.severity === 'error' ? 'border-destructive/20 bg-destructive/5 text-destructive'
                                    : w.severity === 'warning' ? 'border-warning/20 bg-warning/5 text-warning'
                                    : 'border-info/20 bg-info/5 text-info',
                                )}
                            >
                                <span className="font-medium">{w.memberName}:</span> {w.message}
                            </div>
                        ))}
                    </div>
                );
            })()}

            {/* ── Primary content ──────────────────────────────────────────── */}
            {viewScope === 'all' && pageMode === 'chores' ? (
                allChoresSubView === 'sequence' && countdownTimelines && sequencePeople.length > 0 ? (
                    <SequenceTimeline
                        output={countdownTimelines}
                        people={sequencePeople}
                        familyMembers={sequenceFamilyMembers}
                        choresRaw={sequenceChoresRaw}
                        nowMs={nowMs}
                        onMarkDone={async (choreId, personId) => {
                            const completionId = id();
                            await db.transact([
                                tx.choreCompletions[completionId]
                                    .update({ completed: true, dateDue: selectedDateKey, dateCompleted: new Date().toISOString() })
                                    .link({ chore: choreId, completedBy: personId }),
                            ]);
                        }}
                        onReorder={mutations.handleSequenceReorder}
                    />
                ) : allChoresSubView === 'sequence' ? (
                    <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed text-muted-foreground text-sm">
                        No timed chores available for this date
                    </div>
                ) : (
                    <AllChoresInventory
                        chores={chores as never}
                        familyMembers={familyMembers as never}
                        referenceDate={selectedDate}
                        updateChore={mutations.updateChore}
                        updateChoreSchedule={mutations.updateChoreSchedule}
                        db={db}
                        unitDefinitions={unitDefinitions}
                        currencyOptions={currencyOptions}
                        canEditChores={isParent}
                        allChores={chores as never}
                        scheduleSettings={scheduleSettings}
                    />
                )
            ) : (
                <div className="space-y-4">
                    {/* Utility bar */}
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1 flex-wrap">
                            {pageMode === 'chores' && viewScope === 'daily' && (
                                <Link href="/chores/all">
                                    <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
                                        View all chores
                                    </Button>
                                </Link>
                            )}
                            {pageMode === 'tasks' && (
                                <Link href={`/my-tasks${selectedMember !== 'All' ? `?member=${selectedMember}` : ''}`}>
                                    <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
                                        <ListTodo className="mr-1.5 h-3.5 w-3.5" /> My Task Series
                                    </Button>
                                </Link>
                            )}
                            {pageMode === 'tasks' && isParent && (
                                <>
                                    <Link href="/task-series">
                                        <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
                                            Manage Series
                                        </Button>
                                    </Link>
                                    <Link href={tasksHistoryHref}>
                                        <Button variant="ghost" size="sm" className="text-muted-foreground text-xs">
                                            History
                                        </Button>
                                    </Link>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {pageMode === 'chores' && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="ghost" size="icon-sm" title="View settings">
                                            <SlidersHorizontal className="h-4 w-4" />
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent align="end" className="w-64 p-4">
                                        <p className="text-sm font-medium mb-3">View settings</p>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="show-descriptions" className="text-sm">Show Descriptions</Label>
                                                <Switch
                                                    id="show-descriptions"
                                                    checked={showChoreDescriptions}
                                                    onCheckedChange={(val) =>
                                                        loggedInMember && mutations.toggleViewSetting(loggedInMember.id, 'viewShowChoreDescriptions', val)
                                                    }
                                                    disabled={!loggedInMember}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <Label htmlFor="show-details" className="text-sm">Show Task Details</Label>
                                                <Switch
                                                    id="show-details"
                                                    checked={showTaskDetails}
                                                    onCheckedChange={(val) =>
                                                        loggedInMember && mutations.toggleViewSetting(loggedInMember.id, 'viewShowTaskDetails', val)
                                                    }
                                                    disabled={!loggedInMember}
                                                />
                                            </div>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            )}
                            <Dialog open={isDetailedChoreModalOpen} onOpenChange={setIsDetailedChoreModalOpen}>
                                {canAddChore ? (
                                    <DialogTrigger asChild>
                                        <Button size="sm">
                                            <PlusCircle className="mr-1.5 h-4 w-4" /> Add Chore
                                        </Button>
                                    </DialogTrigger>
                                ) : (
                                    <RestrictedButton
                                        isRestricted
                                        restrictionMessage="Only parents can add chores."
                                        size="sm"
                                    >
                                        <PlusCircle className="mr-1.5 h-4 w-4" /> Add Chore
                                    </RestrictedButton>
                                )}
                                <DialogContent className="sm:max-w-[500px]">
                                    <DialogHeader>
                                        <DialogTitle>Add New Chore</DialogTitle>
                                    </DialogHeader>
                                    <DetailedChoreForm
                                        familyMembers={familyMembers}
                                        onSave={mutations.addChore}
                                        initialDate={selectedDate}
                                        db={db}
                                        unitDefinitions={unitDefinitions}
                                        currencyOptions={currencyOptions}
                                        availableChoreAnchors={chores as never}
                                        scheduleSettings={scheduleSettings}
                                        routineMarkerStatuses={routineMarkerStatuses}
                                        countdownSettings={countdownSettings}
                                    />
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    <ChoreList
                        chores={filteredChores}
                        familyMembers={familyMembers}
                        selectedMember={selectedMember}
                        selectedDate={selectedDate}
                        toggleChoreDone={mutations.toggleChoreDone}
                        toggleChoreNotDone={mutations.toggleChoreNotDone}
                        updateChore={mutations.updateChore}
                        updateChoreSchedule={mutations.updateChoreSchedule}
                        deleteChore={mutations.deleteChore}
                        db={db as never}
                        unitDefinitions={unitDefinitions}
                        currencyOptions={currencyOptions}
                        onEditTaskSeries={(seriesId: string) => setEditingTaskSeriesId(seriesId)}
                        currentUser={currentUser}
                        canEditChores={isParent}
                        showChoreDescriptions={showChoreDescriptions}
                        showTaskDetails={showTaskDetails}
                        pageMode={pageMode}
                        focusedChoreId={focusedChoreId}
                        gradeTypes={gradeTypes as never}
                        routineMarkerStatuses={routineMarkerStatuses}
                        selectedDateKey={selectedDateKey}
                        todayDateKey={todayDateKey}
                        onRoutineMarkerStart={mutations.markRoutineMarkerStarted}
                        onRoutineMarkerComplete={mutations.markRoutineMarkerFinished}
                        onRoutineMarkerClear={mutations.clearRoutineMarkerStatus}
                        allChores={chores}
                        scheduleSettings={scheduleSettings}
                        countdownTimelines={countdownTimelines}
                        countdownSettings={countdownSettings}
                    />
                </div>
            )}

            {/* Task Series Editor modal */}
            <Dialog open={!!editingTaskSeriesId} onOpenChange={(open) => !open && setEditingTaskSeriesId(null)}>
                <DialogContent className="w-[90vw] max-w-[1400px] h-[85vh] overflow-y-auto p-0">
                    {editingTaskSeriesId && (
                        <TaskSeriesEditor
                            db={db}
                            initialSeriesId={editingTaskSeriesId}
                            onClose={() => setEditingTaskSeriesId(null)}
                            className="w-full max-w-none"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default ChoresTracker;
