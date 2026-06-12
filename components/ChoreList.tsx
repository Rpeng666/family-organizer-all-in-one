// components/ChoreList.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
import { getAssignedMembersForChoreOnDate, toUTCDate } from '@/lib/chore-utils';
import { choreOccursOnDate } from '@/lib/chore-schedule';
import { format } from 'date-fns';
import ToggleableAvatar from '@/components/ui/ToggleableAvatar';
import DetailedChoreForm from './DetailedChoreForm';
import { id, tx } from '@instantdb/react';
import { getTasksForDate, type Task, isSeriesActiveForDate } from '@/lib/task-scheduler';
import { TaskSeriesChecklist } from './TaskSeriesChecklist';
import { useToast } from '@/components/ui/use-toast';
import { getTaskSeriesProgress, hasScheduledChildren } from '@/lib/task-series-progress';
import { uploadFilesToS3 } from '@/lib/file-uploads';
import { buildTaskUpdateTransactions, type ResponseFieldValueInput } from '@/lib/task-update-mutations';
import { getTaskBucketCounts, getTaskLastActiveState, isActionableTask, isTaskDone } from '@/lib/task-progress';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import ChoreDetailDialog from './ChoreDetailDialog';
import { sortChoresForDisplay, getChoreTimingMode, type CountdownEngineOutput, type CountdownSettings } from '@family-organizer/shared-core';
import CountdownPill from './CountdownPill';
import type { SharedScheduleSettings } from '@family-organizer/shared-core';
import type { FamilyMember, Chore, RoutineMarkerStatus } from '@/hooks/useChoresData';
import type { UnitDefinition } from '@/lib/currency-utils';
import type { ChoreSchedulePatch } from '@/lib/chore-schedule';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CurrencyOption { value: string; label: string }
interface CurrentUser { id: string; name?: string; role?: string }

interface GradeType { id: string; label?: string; color?: string }

interface ChoreListProps {
    chores: Chore[];
    familyMembers: FamilyMember[];
    selectedMember: string;
    selectedDate: Date;
    toggleChoreDone: (choreId: string, memberId: string, executorId?: string) => Promise<void>;
    toggleChoreNotDone: (choreId: string, memberId: string, executorId?: string) => Promise<void>;
    updateChore: (choreId: string, data: Partial<Chore> & { assignees: FamilyMember[] }) => Promise<void>;
    updateChoreSchedule: (choreId: string, patch: ChoreSchedulePatch) => Promise<void>;
    deleteChore: (choreId: string) => void;
    db: { transact: (txns: unknown[]) => Promise<void> };
    unitDefinitions: UnitDefinition[];
    currencyOptions: CurrencyOption[];
    onEditTaskSeries: (seriesId: string) => void;
    currentUser: CurrentUser | null;
    canEditChores: boolean;
    showChoreDescriptions: boolean;
    showTaskDetails: boolean;
    pageMode?: 'chores' | 'tasks';
    focusedChoreId?: string | null;
    gradeTypes?: GradeType[];
    routineMarkerStatuses?: RoutineMarkerStatus[];
    selectedDateKey?: string;
    todayDateKey?: string;
    onRoutineMarkerStart?: (key: string) => Promise<void>;
    onRoutineMarkerComplete?: (key: string) => Promise<void>;
    onRoutineMarkerClear?: (key: string) => Promise<void>;
    allChores?: Chore[];
    scheduleSettings?: SharedScheduleSettings | null;
    countdownTimelines?: CountdownEngineOutput | null;
    countdownSettings?: CountdownSettings | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function isSameUTCDay(a: Date, b: Date): boolean {
    return (
        a.getUTCFullYear() === b.getUTCFullYear() &&
        a.getUTCMonth() === b.getUTCMonth() &&
        a.getUTCDate() === b.getUTCDate()
    );
}

function safeUTCDate(date: Date): Date {
    if (date instanceof Date && !isNaN(date.getTime())) {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    }
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ─── Section header pill ────────────────────────────────────────────────────────

function SectionHeaderPill({ sectionKey, sectionLabel }: { sectionKey: string; sectionLabel: string }) {
    const styles: Record<string, string> = {
        now: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        upcoming: 'bg-primary/10 text-primary border-primary/20',
    };
    return (
        <li className="mb-2 mt-5 first:mt-0">
            <div className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1',
                'text-xs font-semibold uppercase tracking-widest',
                styles[sectionKey] ?? 'bg-muted text-muted-foreground border-border',
            )}>
                {sectionLabel}
            </div>
        </li>
    );
}

// ─── Chore row ─────────────────────────────────────────────────────────────────

interface ChoreRowProps {
    chore: Chore;
    timing: { sectionKey: string; sectionLabel: string; mode: string; label?: string; summary?: string };
    familyMembers: FamilyMember[];
    selectedMember: string;
    safeSelectedDate: Date;
    formattedSelectedDate: string;
    isPastDate: boolean;
    pageMode: 'chores' | 'tasks';
    focusedChoreId: string | null | undefined;
    showChoreDescriptions: boolean;
    showTaskDetails: boolean;
    canEditChores: boolean;
    currentUser: CurrentUser | null;
    familyMemberNamesById: Record<string, string>;
    countdownSlotsByChore: Map<string, Array<{ personId: string; slot: unknown }>>;
    expandedTaskSeriesByMember: Record<string, Record<string, boolean>>;
    expandedTaskSeriesInAllView: Record<string, boolean>;
    allChores: Chore[];
    scheduleSettings: SharedScheduleSettings | null | undefined;
    gradeTypes: GradeType[];
    onAvatarClick: (chore: Chore, memberId: string, visibleTasks: Task[], allTasks: Task[]) => void;
    onMarkNotDone: (choreId: string, memberId: string, executorId?: string) => void;
    onEditChore: (chore: Chore) => void;
    onOpenDetails: (choreId: string) => void;
    onDeleteChore: (choreId: string) => void;
    onEditTaskSeries: (seriesId: string) => void;
    onTaskToggle: (taskId: string, status: boolean, allTasks: Task[], chore: Chore, series?: { id: string; ownerId?: string }) => Promise<void>;
    onTaskUpdate: (taskId: string, input: {
        nextState: unknown; note?: string; files?: File[]; restoreTiming?: 'now' | 'next_scheduled' | null;
        responseFieldValues?: ResponseFieldValueInput[]; replyToUpdateId?: string | null;
    }, allTasks: Task[], chore: Chore, series?: { id: string; ownerId?: string }) => Promise<void>;
    onTaskPreviewToggle: (task: Task, allTasks: Task[], chore: Chore, series?: { id: string; ownerId?: string }) => Promise<void>;
    buildTasksHref: (choreId: string) => string;
    setExpandedTaskSeriesByMember: React.Dispatch<React.SetStateAction<Record<string, Record<string, boolean>>>>;
    setExpandedTaskSeriesInAllView: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}

function ChoreRow({
    chore, timing, familyMembers, familyMemberNamesById, selectedMember, safeSelectedDate,
    formattedSelectedDate, isPastDate, pageMode, focusedChoreId,
    showChoreDescriptions, showTaskDetails, canEditChores, currentUser,
    countdownSlotsByChore, expandedTaskSeriesByMember, expandedTaskSeriesInAllView,
    allChores, scheduleSettings, gradeTypes,
    onAvatarClick, onMarkNotDone, onEditChore, onOpenDetails, onDeleteChore,
    onEditTaskSeries, onTaskToggle, onTaskUpdate, onTaskPreviewToggle,
    buildTasksHref, setExpandedTaskSeriesByMember, setExpandedTaskSeriesInAllView,
}: ChoreRowProps) {
    const assignedMembers = getAssignedMembersForChoreOnDate(chore as never, safeSelectedDate);

    // "with…" joint text
    let withOthersText: string | null = null;
    if (selectedMember !== 'All' && chore.isJoint) {
        const others = assignedMembers.filter((m) => m.id !== selectedMember).map((m) => m.name).filter(Boolean);
        if (others.length === 1) withOthersText = `with ${others[0]}`;
        else if (others.length === 2) withOthersText = `with ${others[0]} and ${others[1]}`;
        else if (others.length > 2) { const last = others.pop(); withOthersText = `with ${others.join(', ')}, and ${last}`; }
    }

    // Up-for-grabs completer
    let upForGrabsCompletedByOther = false;
    let completerName = '';
    let completerIdActual: string | null = null;
    if (chore.isUpForGrabs) {
        const comp = (chore.completions ?? []).find((c) => c.dateDue === formattedSelectedDate && c.completed);
        if (comp?.completedBy?.id) {
            completerIdActual = comp.completedBy.id;
            upForGrabsCompletedByOther = true;
            completerName = familyMembers.find((fm) => fm.id === completerIdActual)?.name ?? 'another member';
        }
    }

    const isNegative = (chore.weight ?? 0) < 0;
    const showDetails = showTaskDetails;
    const hasTaskSeries = (chore.taskSeries?.length ?? 0) > 0;

    // ── Avatars ──────────────────────────────────────────────────────────────

    const avatars = (
        <div className="flex flex-wrap gap-2">
            {assignedMembers
                .filter((a) => selectedMember === 'All' || a.id === selectedMember)
                .map((assignee) => {
                    const completion = (chore.completions ?? []).find(
                        (c) => c.completedBy?.id === assignee.id && c.dateDue === formattedSelectedDate,
                    );
                    const fm = familyMembers.find((m) => m.id === assignee.id);
                    const isDisabled = chore.isUpForGrabs && upForGrabsCompletedByOther && assignee.id !== completerIdActual;

                    let visibleTasks: Task[] = [];
                    let allTasksForMember: Task[] = [];
                    const userSeries = chore.taskSeries?.find((s: unknown) => {
                        const series = s as { familyMember?: unknown };
                        const owner = Array.isArray(series.familyMember) ? series.familyMember[0] : series.familyMember;
                        return (owner as { id?: string })?.id === assignee.id;
                    });
                    const sharedSeries = chore.taskSeries?.find((s: unknown) => {
                        const series = s as { familyMember?: unknown };
                        const owner = Array.isArray(series.familyMember) ? series.familyMember[0] : series.familyMember;
                        return !(owner as { id?: string })?.id;
                    });
                    const targetSeries = userSeries ?? sharedSeries;
                    if (targetSeries) {
                        const s = targetSeries as { tasks?: Task[]; startDate?: string; pullForwardCount?: number };
                        allTasksForMember = s.tasks ?? [];
                        visibleTasks = getTasksForDate(
                            allTasksForMember, chore.rrule, chore.startDate, safeSelectedDate,
                            s.startDate, chore.exdates ?? null, s.pullForwardCount ?? 0,
                        );
                    }

                    return (
                        <ToggleableAvatar
                            key={assignee.id}
                            memberId={assignee.id}
                            name={assignee.name}
                            photoUrls={fm?.photoUrls}
                            isComplete={completion?.completed ?? false}
                            isNotDone={completion?.notDone ?? false}
                            taskSeriesProgress={getTaskSeriesProgress(visibleTasks, allTasksForMember)}
                            isDisabled={isDisabled}
                            completerName={isDisabled ? completerName : ''}
                            choreTitle={chore.title}
                            isNegative={isNegative}
                            onToggle={() => { if (!isDisabled) onAvatarClick(chore, assignee.id, visibleTasks, allTasksForMember); }}
                            onMarkNotDone={() => { if (currentUser) onMarkNotDone(chore.id, assignee.id, currentUser.id); }}
                        />
                    );
                })}
        </div>
    );

    // ── Title + meta ─────────────────────────────────────────────────────────

    const titleMeta = (
        <div className="flex-grow flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={() => onOpenDetails(chore.id)}
                    className={cn(
                        'truncate text-left font-medium text-sm transition-colors',
                        'hover:text-primary hover:underline underline-offset-2',
                        upForGrabsCompletedByOther && selectedMember !== 'All'
                            ? 'text-muted-foreground line-through'
                            : 'text-foreground',
                    )}
                >
                    {chore.title}
                </button>

                {withOthersText && (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{withOthersText}</span>
                )}

                {pageMode === 'chores' && timing.mode !== 'anytime' && (
                    <span
                        title={timing.summary}
                        className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 border border-primary/20"
                    >
                        {timing.label}
                    </span>
                )}

                <span className="text-xs text-muted-foreground whitespace-nowrap">
                    XP: {chore.weight ?? 0}
                </span>

                {/* Countdown pill */}
                {(() => {
                    const slots = countdownSlotsByChore.get(chore.id);
                    if (!slots?.length) return null;
                    if (selectedMember !== 'All') {
                        const match = slots.find((s) => s.personId === selectedMember);
                        return match ? <CountdownPill slot={match.slot as never} /> : null;
                    }
                    const priority: Record<string, number> = { overdue_active: 0, active: 1, upcoming: 2, waiting_decision: 3, buffer: 4, completed: 5 };
                    const sorted = [...slots].sort((a, b) => (priority[(a.slot as { state: string }).state] ?? 9) - (priority[(b.slot as { state: string }).state] ?? 9));
                    return <CountdownPill slot={sorted[0].slot as never} />;
                })()}

                {chore.isUpForGrabs && (
                    <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 border border-success/20">
                        Up for Grabs
                    </span>
                )}

                {hasTaskSeries && pageMode === 'chores' && (
                    <Link
                        href={buildTasksHref(chore.id)}
                        className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full whitespace-nowrap hover:bg-primary/15 transition-colors border border-primary/20"
                    >
                        Tasks
                    </Link>
                )}

                {/* Task-mode series labels */}
                {pageMode === 'tasks' && chore.taskSeries?.map((s: unknown) => {
                    const series = s as { id: string; name?: string; familyMember?: unknown; pullForwardCount?: number; startDate?: string; tasks?: Task[] };
                    const rawOwner = Array.isArray(series.familyMember) ? series.familyMember[0] : series.familyMember;
                    const ownerId = (rawOwner as { id?: string })?.id;
                    if (selectedMember !== 'All' && ownerId && ownerId !== selectedMember) return null;
                    if (selectedMember === 'All' && ownerId && !assignedMembers.some((m) => m.id === ownerId)) return null;
                    const isActive = isSeriesActiveForDate(
                        series.tasks ?? [], chore.rrule ?? null, chore.startDate, safeSelectedDate,
                        series.startDate ?? null, chore.exdates ?? null, series.pullForwardCount ?? 0,
                    );
                    if (!isActive) return null;
                    return (
                        <span
                            key={series.id}
                            className="text-[10px] bg-info/10 text-info px-1.5 py-0.5 rounded-full cursor-pointer hover:bg-info/15 transition-colors whitespace-nowrap border border-info/20"
                            onClick={(e) => { e.stopPropagation(); onEditTaskSeries(series.id); }}
                        >
                            {series.name}
                        </span>
                    );
                })}
            </div>

            {showChoreDescriptions && chore.description && (
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{chore.description}</div>
            )}
        </div>
    );

    // ── Action buttons ────────────────────────────────────────────────────────

    const actionButtons = (
        <div className="flex items-center gap-1 flex-shrink-0">
            <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDeleteChore(chore.id)}
                className={cn('text-muted-foreground hover:text-destructive hover:bg-destructive/10', !canEditChores && 'opacity-40')}
                title="Delete chore"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </Button>
        </div>
    );

    // ── Task series section ───────────────────────────────────────────────────

    const taskSeriesContent = (() => {
        const renderable = (chore.taskSeries ?? [])
            .map((s: unknown) => {
                const series = s as { id: string; name?: string; familyMember?: unknown; pullForwardCount?: number; startDate?: string; tasks?: Task[] };
                const rawOwner = Array.isArray(series.familyMember) ? series.familyMember[0] : series.familyMember;
                const ownerId = (rawOwner as { id?: string })?.id;
                const ownerName = (rawOwner as { name?: string })?.name;

                if (ownerId && !assignedMembers.some((m) => m.id === ownerId)) return null;
                if (selectedMember !== 'All' && ownerId && ownerId !== selectedMember) return null;

                const allTasks: Task[] = series.tasks ?? [];
                const pullForwardCount = series.pullForwardCount ?? 0;
                const tasks = getTasksForDate(allTasks, chore.rrule, chore.startDate, safeSelectedDate, series.startDate, chore.exdates ?? null, pullForwardCount);
                const bucketCounts = getTaskBucketCounts(allTasks);
                const hasBucketedTasks = Object.values(bucketCounts).some((c) => c > 0);
                const isUFGDisabled = chore.isUpForGrabs && upForGrabsCompletedByOther && ownerId && ownerId !== completerIdActual;
                if ((!tasks.length && !hasBucketedTasks) || isUFGDisabled) return null;

                return { series, ownerId, ownerName, allTasks, tasks };
            })
            .filter(Boolean) as Array<{ series: { id: string; name?: string; pullForwardCount?: number; startDate?: string }; ownerId?: string; ownerName?: string; allTasks: Task[]; tasks: Task[] }>;

        if (renderable.length === 0) return null;

        return (
            <div className="flex flex-col gap-2 mt-2 w-full pl-2 border-t pt-2">
                {renderable.map(({ series, ownerId, ownerName, allTasks, tasks }) => {
                    const toggleKey = `${chore.id}:${series.id}`;
                    const actionable = tasks.filter((t) => isActionableTask(t, allTasks));
                    const preview = actionable.slice(0, 2);
                    const remaining = Math.max(0, actionable.length - preview.length);
                    const memberKey = selectedMember === 'All' ? 'All' : selectedMember;
                    const hasMoreThanTwo = tasks.length > 2;
                    const isExpanded = !hasMoreThanTwo ? true
                        : selectedMember === 'All'
                            ? (expandedTaskSeriesInAllView[toggleKey] ?? false)
                            : (expandedTaskSeriesByMember[memberKey]?.[toggleKey] ?? true);
                    const visibleTasks = hasMoreThanTwo && !isExpanded ? tasks.slice(0, 2) : tasks;

                    const toggleVisibility = () => {
                        if (!hasMoreThanTwo) return;
                        if (selectedMember === 'All') {
                            setExpandedTaskSeriesInAllView((prev) => ({ ...prev, [toggleKey]: !isExpanded }));
                        } else {
                            setExpandedTaskSeriesByMember((prev) => ({
                                ...prev,
                                [memberKey]: { ...(prev[memberKey] ?? {}), [toggleKey]: !isExpanded },
                            }));
                        }
                    };

                    if (pageMode === 'chores') {
                        return (
                            <div key={series.id}>
                                {selectedMember === 'All' && ownerName && assignedMembers.length > 1 && (
                                    <div className="mb-1 pl-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                        {ownerName}'s Tasks
                                    </div>
                                )}
                                <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                                    {preview.length > 0 ? (
                                        <div className="space-y-2">
                                            {preview.map((task) => (
                                                <div key={task.id} className="flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={isTaskDone(task)}
                                                        disabled={isPastDate}
                                                        onChange={() => void onTaskPreviewToggle(task, allTasks, chore, { id: series.id, ownerId })}
                                                        className="h-4 w-4 rounded border-border accent-primary"
                                                    />
                                                    <Link
                                                        href={buildTasksHref(chore.id)}
                                                        className="min-w-0 flex-1 truncate text-sm text-foreground hover:text-primary hover:underline underline-offset-2"
                                                    >
                                                        {task.text}
                                                    </Link>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-muted-foreground">Open tasks for the full view.</div>
                                    )}
                                    <div className="mt-2.5 flex items-center gap-3 text-[11px] font-medium">
                                        <Link href={buildTasksHref(chore.id)} className="text-primary hover:underline underline-offset-2">
                                            Open Tasks
                                        </Link>
                                        {remaining > 0 && (
                                            <Link href={buildTasksHref(chore.id)} className="text-primary hover:underline underline-offset-2">
                                                {remaining}+ more
                                            </Link>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <div key={series.id}>
                            {selectedMember === 'All' && ownerName && assignedMembers.length > 1 && (
                                <div className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-widest pl-1">
                                    {ownerName}'s Checklist
                                </div>
                            )}
                            {(series.pullForwardCount ?? 0) > 0 && !choreOccursOnDate(
                                { startDate: chore.startDate, rrule: chore.rrule, exdates: chore.exdates },
                                safeSelectedDate,
                            ) && (
                                <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-info/10 border border-info/20 px-2 py-1 text-xs text-info">
                                    Pulled forward
                                </div>
                            )}
                            <TaskSeriesChecklist
                                tasks={visibleTasks}
                                allTasks={allTasks}
                                onToggle={(taskId, status) => onTaskToggle(taskId, status, allTasks, chore, { id: series.id, ownerId })}
                                onTaskUpdate={(taskId, input) => onTaskUpdate(taskId, input, allTasks, chore, { id: series.id, ownerId })}
                                canWriteTaskProgress={!!currentUser}
                                onRequireTaskAuth={() => {}}
                                familyMemberNamesById={familyMemberNamesById}
                                isReadOnly={isPastDate}
                                selectedMember={selectedMember}
                                currentMemberId={currentUser?.id ?? null}
                                currentMemberName={currentUser?.name}
                                showDetails={showDetails}
                                selectedDateKey={safeSelectedDate.toISOString().slice(0, 10)}
                                detailContext={{
                                    choreTitle: chore.title,
                                    seriesName: series.name ?? '',
                                    ownerName,
                                    selectedDateLabel: safeSelectedDate.toLocaleDateString(undefined, {
                                        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                                    }),
                                }}
                                isParentReviewer={canEditChores}
                                gradeTypes={gradeTypes}
                            />
                            {hasMoreThanTwo && (
                                <button
                                    type="button"
                                    className="mt-1 ml-1 text-[11px] font-medium text-primary hover:underline underline-offset-2"
                                    onClick={toggleVisibility}
                                >
                                    {isExpanded ? 'hide tasks' : 'view more'}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    })();

    if (pageMode === 'tasks' && !taskSeriesContent) return null;

    return (
        <React.Fragment>
            <li
                id={`chore-${chore.id}`}
                className={cn(
                    'mb-2 flex flex-col rounded-xl border bg-card p-3 shadow-xs',
                    'transition-shadow duration-150 hover:shadow-sm',
                    focusedChoreId === chore.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                )}
            >
                {/* Desktop layout */}
                <div className="hidden md:flex items-center gap-3">
                    <div className="flex gap-2">{avatars}</div>
                    {titleMeta}
                    {actionButtons}
                </div>

                {/* Mobile layout */}
                {selectedMember === 'All' ? (
                    <div className="flex md:hidden flex-col gap-2">
                        <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0">{titleMeta}</div>
                            {actionButtons}
                        </div>
                        <div>{avatars}</div>
                    </div>
                ) : (
                    <div className="flex md:hidden gap-3">
                        <div className="flex-shrink-0">{avatars}</div>
                        <div className="flex flex-col flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">{titleMeta}</div>
                                {actionButtons}
                            </div>
                        </div>
                    </div>
                )}

                {taskSeriesContent}
            </li>
        </React.Fragment>
    );
}

// ─── RoutineMarkersPanel ────────────────────────────────────────────────────────

interface MarkerPreset { key: string; label: string; defaultTime?: string }

function RoutineMarkersPanel({
    routineMarkerPresets,
    markerStatusesByKey,
    markerDependencyMap,
    canEditRoutineMarkers,
    onStart, onComplete, onClear,
}: {
    routineMarkerPresets: MarkerPreset[];
    markerStatusesByKey: Map<string, { startedAt?: string | null; completedAt?: string | null }>;
    markerDependencyMap: Map<string, { needsStart: boolean; needsFinish: boolean; dependents: Array<{ title: string; event: string }> }>;
    canEditRoutineMarkers: boolean;
    onStart?: (key: string) => void;
    onComplete?: (key: string) => void;
    onClear?: (key: string) => void;
}) {
    return (
        <li className="mb-4 rounded-xl border bg-card p-4 shadow-xs">
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Routine Markers</div>
                        <div className="text-sm text-muted-foreground mt-0.5">
                            Parents can mark shared household moments that unlock relative chore timing.
                        </div>
                    </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {routineMarkerPresets.map((marker) => {
                        const status = markerStatusesByKey.get(marker.key);
                        const deps = markerDependencyMap.get(marker.key);
                        const hasSplitNeeds = deps && deps.needsStart && deps.needsFinish;
                        const startedLabel = status?.startedAt
                            ? new Date(status.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                            : null;
                        const completedLabel = status?.completedAt
                            ? new Date(status.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                            : null;

                        return (
                            <div key={marker.key} className="rounded-xl border bg-muted/40 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-medium text-sm">{marker.label}</div>
                                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{marker.defaultTime ?? '--:--'}</div>
                                </div>
                                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                                    {hasSplitNeeds ? (
                                        <>
                                            <div>Started: {startedLabel ?? 'Not yet'}</div>
                                            <div>Finished: {completedLabel ?? 'Not yet'}</div>
                                        </>
                                    ) : (
                                        <div>Happened: {completedLabel ?? startedLabel ?? 'Not yet'}</div>
                                    )}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {hasSplitNeeds ? (
                                        <>
                                            <Button size="xs" variant="outline" disabled={!canEditRoutineMarkers || !!startedLabel} onClick={() => onStart?.(marker.key)}>
                                                {startedLabel ? `Started ${startedLabel}` : 'Mark started'}
                                            </Button>
                                            <Button size="xs" variant="outline" disabled={!canEditRoutineMarkers || !!completedLabel} onClick={() => onComplete?.(marker.key)}>
                                                {completedLabel ? `Finished ${completedLabel}` : 'Mark finished'}
                                            </Button>
                                        </>
                                    ) : (
                                        <Button size="xs" variant="outline" disabled={!canEditRoutineMarkers} onClick={() => { onStart?.(marker.key); onComplete?.(marker.key); }}>
                                            Mark happened
                                        </Button>
                                    )}
                                    <Button size="xs" variant="ghost" disabled={!canEditRoutineMarkers} onClick={() => onClear?.(marker.key)}>
                                        Reset
                                    </Button>
                                </div>
                                {deps && deps.dependents.length > 0 && (
                                    <div className="mt-2 text-[10px] text-muted-foreground/70">
                                        {deps.dependents.map((d, i) => (
                                            <span key={i}>{i > 0 && ', '}{d.title} <span className="italic">({d.event === 'started' ? 'on start' : 'on finish'})</span></span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </li>
    );
}

// ─── Main ChoreList ─────────────────────────────────────────────────────────────

function ChoreList({
    chores, familyMembers, selectedMember, selectedDate,
    toggleChoreDone, toggleChoreNotDone, updateChore, updateChoreSchedule,
    deleteChore, db, unitDefinitions, currencyOptions, onEditTaskSeries,
    currentUser, canEditChores, showChoreDescriptions, showTaskDetails,
    pageMode = 'chores', focusedChoreId = null, gradeTypes = [],
    routineMarkerStatuses = [], selectedDateKey, todayDateKey,
    onRoutineMarkerStart, onRoutineMarkerComplete, onRoutineMarkerClear,
    allChores = chores, scheduleSettings = null,
    countdownTimelines = null, countdownSettings = null,
}: ChoreListProps) {
    const [editingChore, setEditingChore] = useState<Chore | null>(null);
    const [detailChoreId, setDetailChoreId] = useState<string | null>(null);
    const [expandedTaskSeriesByMember, setExpandedTaskSeriesByMember] = useState<Record<string, Record<string, boolean>>>({});
    const [expandedTaskSeriesInAllView, setExpandedTaskSeriesInAllView] = useState<Record<string, boolean>>({});
    const [pendingCompletion, setPendingCompletion] = useState<{ choreId: string; memberId: string; incompleteTaskIds: string[] } | null>(null);
    const [responseBlockedCompletion, setResponseBlockedCompletion] = useState<{ choreId: string; tasksWithUnfilledResponses: Array<{ id: string; text: string }> } | null>(null);
    const [choreToDelete, setChoreToDelete] = useState<string | null>(null);

    const { toast } = useToast();

    const familyMemberNamesById = React.useMemo(
        () => (familyMembers ?? []).reduce<Record<string, string>>((acc, m) => {
            if (m?.id && m?.name) acc[m.id] = m.name;
            return acc;
        }, {}),
        [familyMembers],
    );

    useEffect(() => {
        if (!focusedChoreId) return;
        const frame = window.requestAnimationFrame(() => {
            document.getElementById(`chore-${focusedChoreId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [focusedChoreId, chores.length]);

    useEffect(() => {
        if (selectedMember === 'All') setExpandedTaskSeriesInAllView({});
    }, [selectedMember]);

    const safeSelectedDate = safeUTCDate(selectedDate);
    const now = new Date();
    const localToday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const isPastDate = safeSelectedDate.getTime() < localToday.getTime();
    const formattedSelectedDate = selectedDateKey ?? safeSelectedDate.toISOString().slice(0, 10);

    const detailChore = React.useMemo(() => {
        if (!detailChoreId) return null;
        return chores.find((c) => c.id === detailChoreId) ?? null;
    }, [chores, detailChoreId]);

    // Routine marker helpers
    const markerStatusesByKey = React.useMemo(() => {
        const map = new Map<string, RoutineMarkerStatus>();
        (routineMarkerStatuses ?? []).forEach((s) => {
            if (String(s?.date ?? '') !== formattedSelectedDate) return;
            if (s?.markerKey) map.set(s.markerKey, s);
        });
        return map;
    }, [formattedSelectedDate, routineMarkerStatuses]);

    const canEditRoutineMarkers = Boolean(canEditChores && formattedSelectedDate === todayDateKey);
    const canViewRoutineMarkers = Boolean(canEditChores);
    const routineMarkerPresets: MarkerPreset[] = (scheduleSettings?.routineMarkers as MarkerPreset[] | undefined) ?? [];

    const markerDependencyMap = React.useMemo(() => {
        const map = new Map<string, { needsStart: boolean; needsFinish: boolean; dependents: Array<{ title: string; event: string }> }>();
        for (const chore of (allChores ?? chores)) {
            const mode = getChoreTimingMode(chore as never);
            if (mode !== 'before_marker' && mode !== 'after_marker') continue;
            const anchor = (chore.timingConfig as { anchor?: { routineKey?: string; event?: string } } | null)?.anchor;
            if (!anchor?.routineKey) continue;
            const markerKey = String(anchor.routineKey);
            const event = anchor.event === 'started' ? 'started' : 'completed';
            const entry = map.get(markerKey) ?? { needsStart: false, needsFinish: false, dependents: [] };
            if (event === 'started') entry.needsStart = true;
            else entry.needsFinish = true;
            entry.dependents.push({ title: chore.title ?? 'Untitled', event });
            map.set(markerKey, entry);
        }
        return map;
    }, [allChores, chores]);

    const countdownSlotsByChore = React.useMemo(() => {
        const map = new Map<string, Array<{ personId: string; slot: unknown }>>();
        if (!countdownTimelines?.timelines) return map;
        for (const [personId, timeline] of Object.entries(countdownTimelines.timelines as Record<string, { slots?: Array<{ choreId: string }> }>)) {
            for (const slot of timeline.slots ?? []) {
                const existing = map.get(slot.choreId) ?? [];
                existing.push({ personId, slot });
                map.set(slot.choreId, existing);
            }
        }
        return map;
    }, [countdownTimelines]);

    const filteredChores = React.useMemo(() => {
        return chores.filter((chore) => {
            try { if (!choreOccursOnDate(chore as never, safeSelectedDate)) return false; }
            catch { return false; }
            const assigned = getAssignedMembersForChoreOnDate(chore as never, safeSelectedDate);
            return selectedMember === 'All' ? assigned.length > 0 : assigned.some((a) => a.id === selectedMember);
        });
    }, [chores, safeSelectedDate, selectedMember]);

    const timedFilteredChores = React.useMemo(
        () => sortChoresForDisplay<Chore>(filteredChores as never, {
            date: safeSelectedDate, routineMarkerStatuses, chores: allChores as never, scheduleSettings,
        }) as Array<{ chore: Chore; timing: { sectionKey: string; sectionLabel: string; mode: string; label?: string; summary?: string } }>,
        [allChores, filteredChores, routineMarkerStatuses, safeSelectedDate, scheduleSettings],
    );

    const buildTasksHref = (choreId: string) => {
        const params = new URLSearchParams({ date: formattedSelectedDate, member: selectedMember, choreId });
        return `/tasks?${params.toString()}#chore-${choreId}`;
    };

    const uploadProgressFiles = async (files: File[]) => uploadFilesToS3(files, id);

    // ── Event handlers ────────────────────────────────────────────────────────

    const handleEditChore = (chore: Chore) => {
        if (!canEditChores) { toast({ title: 'Access Denied', description: 'Only parents can edit chores.', variant: 'destructive' }); return; }
        setEditingChore(chore);
    };

    const handleDeleteChore = (choreId: string) => {
        if (!canEditChores) { toast({ title: 'Access Denied', description: 'Only parents can delete chores.', variant: 'destructive' }); return; }
        setChoreToDelete(choreId);
    };

    const confirmDeleteChore = () => { if (choreToDelete) { deleteChore(choreToDelete); setChoreToDelete(null); } };

    const handleUpdateChore = (updated: Partial<Chore> & { assignees: FamilyMember[] }) => {
        if (editingChore?.id) updateChore(editingChore.id, updated);
        setEditingChore(null);
    };
    const handleScheduleUpdate = async (patch: ChoreSchedulePatch) => {
        if (!editingChore?.id) return;
        await updateChoreSchedule(editingChore.id, patch);
        setEditingChore(null);
    };

    const handleTaskToggle = async (taskId: string, status: boolean, allTasks: Task[], chore: Chore, series?: { id: string; ownerId?: string }) => {
        if (!currentUser?.id) { toast({ title: 'Login Required', description: 'Choose a family member first.', variant: 'destructive' }); return; }
        const targetTask = allTasks.find((t) => t.id === taskId);
        if (!targetTask) return;
        const { transactions } = buildTaskUpdateTransactions({
            tx, createId: id, taskId, allTasks,
            nextState: status ? getTaskLastActiveState(targetTask) : 'done',
            selectedDateKey: formattedSelectedDate,
            actorFamilyMemberId: currentUser.id,
            affectedFamilyMemberId: series?.ownerId ?? currentUser.id,
            taskSeriesId: series?.id ?? null, choreId: chore.id,
            schedule: { startDate: chore.startDate, rrule: chore.rrule ?? null, exdates: chore.exdates ?? null },
            referenceDate: safeSelectedDate,
        });
        if (!transactions.length) return;
        try { await db.transact(transactions); }
        catch (err: unknown) { toast({ title: 'Task update failed', description: (err as Error)?.message, variant: 'destructive' }); }
    };

    const handleTaskUpdate = async (
        taskId: string,
        input: { nextState: unknown; note?: string; files?: File[]; restoreTiming?: 'now' | 'next_scheduled' | null; responseFieldValues?: ResponseFieldValueInput[]; replyToUpdateId?: string | null },
        allTasks: Task[], chore: Chore, series?: { id: string; ownerId?: string },
    ) => {
        if (!currentUser?.id) { toast({ title: 'Login Required', description: 'Choose a family member first.', variant: 'destructive' }); return; }
        try {
            const uploaded = input.files?.length ? await uploadProgressFiles(input.files) : [];
            const { transactions } = buildTaskUpdateTransactions({
                tx, createId: id, taskId, allTasks, nextState: input.nextState,
                selectedDateKey: formattedSelectedDate, note: input.note,
                actorFamilyMemberId: currentUser.id,
                affectedFamilyMemberId: series?.ownerId ?? currentUser.id,
                restoreTiming: input.restoreTiming ?? null,
                taskSeriesId: series?.id ?? null, choreId: chore.id,
                schedule: { startDate: chore.startDate, rrule: chore.rrule ?? null, exdates: chore.exdates ?? null },
                referenceDate: safeSelectedDate, attachments: uploaded,
                responseFieldValues: input.responseFieldValues, replyToUpdateId: input.replyToUpdateId,
            });
            if (!transactions.length) return;
            await db.transact(transactions);
        } catch (err: unknown) { toast({ title: 'Task update failed', description: (err as Error)?.message, variant: 'destructive' }); }
    };

    const handleTaskPreviewToggle = async (task: Task, allTasks: Task[], chore: Chore, series?: { id: string; ownerId?: string }) => {
        await handleTaskUpdate(task.id, { nextState: isTaskDone(task) ? 'not_started' : 'done' }, allTasks, chore, series);
    };

    const getTasksWithUnfilledRequired = (visible: Task[], scheduledIds: Set<string>, allTasks: Task[]) =>
        visible.filter((t) => {
            if (hasScheduledChildren(t.id, scheduledIds, allTasks)) return false;
            if (t.isCompleted) return false;
            const required = ((t as unknown as { responseFields?: Array<{ required?: boolean }> }).responseFields ?? []).filter((f) => f.required);
            if (!required.length) return false;
            const updates = (t as unknown as { updates?: Array<{ isDraft?: boolean; responseFieldValues?: Array<{ field?: Array<{ id: string }>; richTextContent?: string; fileUrl?: string }> }> }).updates ?? [];
            return !updates.some((u) => {
                if (u.isDraft) return false;
                return required.every((field) => {
                    const fv = (u.responseFieldValues ?? []).find((v) => v.field?.some?.((f) => f.id === (field as { id?: string }).id));
                    return fv?.richTextContent?.trim() || fv?.fileUrl;
                });
            });
        }).map((t) => ({ id: t.id, text: t.text }));

    const handleAvatarClick = (chore: Chore, memberId: string, visibleTasks: Task[], allTasks: Task[]) => {
        if (!currentUser) { toast({ title: 'Login Required', description: 'Please log in first.', variant: 'destructive' }); return; }
        const isDone = (chore.completions ?? []).some((c) => c.completedBy?.id === memberId && c.dateDue === formattedSelectedDate && c.completed);
        if (isDone) { toggleChoreDone(chore.id, memberId, currentUser.id); return; }
        const scheduledIds = new Set(visibleTasks.map((t) => t.id));
        const blocked = getTasksWithUnfilledRequired(visibleTasks, scheduledIds, allTasks);
        if (blocked.length > 0) { setResponseBlockedCompletion({ choreId: chore.id, tasksWithUnfilledResponses: blocked }); return; }
        const incomplete = visibleTasks.filter((t) => !t.isCompleted && !hasScheduledChildren(t.id, scheduledIds, allTasks)).map((t) => t.id);
        if (incomplete.length > 0) { setPendingCompletion({ choreId: chore.id, memberId, incompleteTaskIds: incomplete }); }
        else { toggleChoreDone(chore.id, memberId, currentUser.id); }
    };

    const confirmMarkAllAndComplete = () => {
        if (!pendingCompletion || !currentUser?.id) { setPendingCompletion(null); return; }
        const { choreId, memberId, incompleteTaskIds } = pendingCompletion;
        const chore = chores.find((c) => c.id === choreId);
        if (!chore) { setPendingCompletion(null); return; }
        const targetSeries = chore.taskSeries?.find((s: unknown) => {
            const series = s as { familyMember?: unknown };
            const owner = Array.isArray(series.familyMember) ? series.familyMember[0] : series.familyMember;
            return (owner as { id?: string })?.id === memberId || !(owner as { id?: string })?.id;
        });
        const allTasks: Task[] = (targetSeries as { tasks?: Task[] } | undefined)?.tasks ?? [];
        const completable = incompleteTaskIds.filter((taskId) => {
            const task = allTasks.find((t) => t.id === taskId);
            return !task || ((task as unknown as { responseFields?: Array<{ required?: boolean }> }).responseFields ?? []).filter((f) => f.required).length === 0;
        });
        const transactions = completable.flatMap((taskId) =>
            buildTaskUpdateTransactions({
                tx, createId: id, taskId, allTasks, nextState: 'done',
                selectedDateKey: formattedSelectedDate,
                actorFamilyMemberId: currentUser.id,
                affectedFamilyMemberId: memberId || currentUser.id,
                taskSeriesId: (targetSeries as { id?: string } | undefined)?.id ?? null,
                choreId, schedule: { startDate: chore.startDate, rrule: chore.rrule ?? null, exdates: chore.exdates ?? null },
                referenceDate: safeSelectedDate,
            }).transactions,
        );
        db.transact(transactions);
        setTimeout(() => { toggleChoreDone(choreId, memberId, currentUser.id); }, 50);
        setPendingCompletion(null);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <ScrollArea className="grow min-h-0">
            <ul className="p-3 space-y-0">
                {/* Routine markers panel */}
                {pageMode === 'chores' && canViewRoutineMarkers && routineMarkerPresets.length > 0 && (
                    <RoutineMarkersPanel
                        routineMarkerPresets={routineMarkerPresets}
                        markerStatusesByKey={markerStatusesByKey}
                        markerDependencyMap={markerDependencyMap}
                        canEditRoutineMarkers={canEditRoutineMarkers}
                        onStart={onRoutineMarkerStart}
                        onComplete={onRoutineMarkerComplete}
                        onClear={onRoutineMarkerClear}
                    />
                )}

                {/* Chore rows */}
                {timedFilteredChores.map(({ chore, timing }, idx) => {
                    const prevTiming = idx > 0 ? timedFilteredChores[idx - 1]?.timing : null;
                    const showSectionHeader = !prevTiming || prevTiming.sectionKey !== timing.sectionKey;
                    return (
                        <React.Fragment key={chore.id}>
                            {showSectionHeader && (
                                <SectionHeaderPill sectionKey={timing.sectionKey} sectionLabel={timing.sectionLabel} />
                            )}
                            <ChoreRow
                                chore={chore}
                                timing={timing}
                                familyMembers={familyMembers}
                                familyMemberNamesById={familyMemberNamesById}
                                selectedMember={selectedMember}
                                safeSelectedDate={safeSelectedDate}
                                formattedSelectedDate={formattedSelectedDate}
                                isPastDate={isPastDate}
                                pageMode={pageMode}
                                focusedChoreId={focusedChoreId}
                                showChoreDescriptions={showChoreDescriptions}
                                showTaskDetails={showTaskDetails}
                                canEditChores={canEditChores}
                                currentUser={currentUser}
                                countdownSlotsByChore={countdownSlotsByChore}
                                expandedTaskSeriesByMember={expandedTaskSeriesByMember}
                                expandedTaskSeriesInAllView={expandedTaskSeriesInAllView}
                                allChores={allChores}
                                scheduleSettings={scheduleSettings}
                                gradeTypes={gradeTypes}
                                onAvatarClick={handleAvatarClick}
                                onMarkNotDone={(choreId, memberId, executorId) => toggleChoreNotDone(choreId, memberId, executorId)}
                                onEditChore={handleEditChore}
                                onOpenDetails={(choreId) => setDetailChoreId(choreId)}
                                onDeleteChore={handleDeleteChore}
                                onEditTaskSeries={onEditTaskSeries}
                                onTaskToggle={handleTaskToggle}
                                onTaskUpdate={handleTaskUpdate}
                                onTaskPreviewToggle={handleTaskPreviewToggle}
                                buildTasksHref={buildTasksHref}
                                setExpandedTaskSeriesByMember={setExpandedTaskSeriesByMember}
                                setExpandedTaskSeriesInAllView={setExpandedTaskSeriesInAllView}
                            />
                        </React.Fragment>
                    );
                })}
            </ul>

            {/* ── Modals ──────────────────────────────────────────────────── */}
            <Dialog open={editingChore !== null} onOpenChange={() => setEditingChore(null)}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader><DialogTitle>Edit Chore</DialogTitle></DialogHeader>
                    {editingChore && (
                        <DetailedChoreForm
                            familyMembers={familyMembers}
                            onSave={handleUpdateChore}
                            onScheduleAction={handleScheduleUpdate}
                            initialChore={editingChore}
                            initialDate={selectedDate}
                            db={db}
                            unitDefinitions={unitDefinitions}
                            currencyOptions={currencyOptions}
                            availableChoreAnchors={allChores as never}
                            scheduleSettings={scheduleSettings}
                            routineMarkerStatuses={routineMarkerStatuses}
                            countdownSettings={countdownSettings}
                        />
                    )}
                </DialogContent>
            </Dialog>

            <ChoreDetailDialog
                chore={detailChore}
                familyMembers={familyMembers}
                open={detailChore !== null}
                onOpenChange={(open) => { if (!open) setDetailChoreId(null); }}
                onEdit={() => { if (detailChore) { setDetailChoreId(null); handleEditChore(detailChore); } }}
                selectedDate={safeSelectedDate}
                selectedMember={selectedMember}
            />

            <Dialog open={pendingCompletion !== null} onOpenChange={(open) => !open && setPendingCompletion(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unfinished Tasks</DialogTitle>
                        <DialogDescription>
                            There are still unchecked tasks in this series. Mark them all as done and complete the chore?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPendingCompletion(null)}>Cancel</Button>
                        <Button onClick={confirmMarkAllAndComplete}>Mark All Done & Complete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={responseBlockedCompletion !== null} onOpenChange={(open) => !open && setResponseBlockedCompletion(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Required Responses Missing</DialogTitle>
                        <DialogDescription>
                            {responseBlockedCompletion?.tasksWithUnfilledResponses.length} task
                            {(responseBlockedCompletion?.tasksWithUnfilledResponses.length ?? 0) !== 1 ? 's have' : ' has'} required responses that haven&apos;t been submitted yet.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 px-1">
                        {responseBlockedCompletion?.tasksWithUnfilledResponses.map((task) => (
                            <div key={task.id} className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
                                <span className="font-medium">{task.text}</span>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResponseBlockedCompletion(null)}>OK</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!choreToDelete} onOpenChange={(open) => !open && setChoreToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Chore</DialogTitle>
                        <DialogDescription>Are you sure you want to delete this chore? This cannot be undone.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setChoreToDelete(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={confirmDeleteChore}>Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </ScrollArea>
    );
}

export default ChoreList;
