// components/task-series/MyTaskSeriesOverview.tsx
'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { tx } from '@instantdb/react';
import { ArrowLeft, ChevronDown, ChevronRight, FastForward, Undo2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';
import { isActionableTask, isTaskDone, getTaskWorkflowState, getTaskStatusLabel } from '@/lib/task-progress';
import {
    countTaskDayBlocks,
    countCompletedTaskDayBlocks,
    computePlannedEndDate,
    computeLiveProjectedEndDate,
    computeScheduleDrift,
    canPullForward,
    getNextPullableDate,
    areTodayTasksFinished,
    buildPullForwardTransactions,
    buildUndoPullForwardTransactions,
    getTaskDayBlocks,
    getCurrentTaskDayBlockIndex,
    type ChoreScheduleInfo,
    type ScheduleDrift,
} from '@/lib/task-series-schedule';
import { getTasksForDate } from '@/lib/task-scheduler';
import { toUTCDate } from '@/lib/chore-utils';
import type { Task } from '@/lib/task-scheduler';

type SeriesFilter = 'active_now' | 'future' | 'finished' | 'all';
type SeriesStatus = 'active_now' | 'future' | 'finished';

interface MyTaskSeriesOverviewProps {
    db: any;
    initialMemberId?: string | null;
}

interface EnrichedSeries {
    raw: any;
    status: SeriesStatus;
    totalTasks: number;
    completedTasks: number;
    taskProgress: number;
    totalBlocks: number;
    completedBlocks: number;
    blockProgress: number;
    nextScheduledDate: string | null;
    drift: ScheduleDrift;
    schedule: ChoreScheduleInfo | null;
    pullForwardCount: number;
    canPull: boolean;
    nextPullDate: string | null;
    todayTasks: Task[];
    todayTasksFinished: boolean;
}

const MyTaskSeriesOverview: React.FC<MyTaskSeriesOverviewProps> = ({ db, initialMemberId }) => {
    const { toast } = useToast();
    const { currentUser } = useAuth();
    const [filter, setFilter] = useState<SeriesFilter>('active_now');
    const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);
    const [undoState, setUndoState] = useState<{ seriesId: string; historyEventId: string; timeoutId: ReturnType<typeof setTimeout> } | null>(null);

    const selectedMemberId = initialMemberId || currentUser?.id || null;

    const { data, isLoading, error } = db.useQuery({
        taskSeries: {
            tasks: {},
            familyMember: {},
            scheduledActivity: {},
        },
        familyMembers: {},
    });

    const memberName = useMemo(() => {
        if (!selectedMemberId || !data?.familyMembers) return null;
        const member = (data.familyMembers as any[]).find((m: any) => m.id === selectedMemberId);
        return member?.name || null;
    }, [selectedMemberId, data?.familyMembers]);

    const today = useMemo(() => toUTCDate(new Date()), []);
    const todayKey = useMemo(() => today.toISOString().slice(0, 10), [today]);

    const enrichedSeries = useMemo<EnrichedSeries[]>(() => {
        const rawSeries = data?.taskSeries || [];

        return rawSeries
            .filter((s: any) => {
                // Only show series assigned to selected member
                const memberId = Array.isArray(s.familyMember) ? s.familyMember[0]?.id : s.familyMember?.id;
                if (!memberId || memberId !== selectedMemberId) return false;
                // Only show linked/scheduled series
                const activity = Array.isArray(s.scheduledActivity) ? s.scheduledActivity[0] : s.scheduledActivity;
                return !!activity;
            })
            .map((s: any) => {
                const tasks: Task[] = (s.tasks || []).map((t: any) => ({
                    ...t,
                    parentTask: t.parentTask ? (Array.isArray(t.parentTask) ? t.parentTask : [t.parentTask]) : undefined,
                    subTasks: t.subTasks ? (Array.isArray(t.subTasks) ? t.subTasks : [t.subTasks]) : undefined,
                }));
                const activity = Array.isArray(s.scheduledActivity) ? s.scheduledActivity[0] : s.scheduledActivity;

                const actionableTasks = tasks.filter((t) => isActionableTask(t, tasks));
                const totalTasks = actionableTasks.length;
                const completedTasks = actionableTasks.filter((t) => isTaskDone(t)).length;
                const taskProgress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

                const totalBlocks = countTaskDayBlocks(tasks);
                const completedBlocks = countCompletedTaskDayBlocks(tasks);
                const blockProgress = totalBlocks > 0 ? (completedBlocks / totalBlocks) * 100 : 0;

                const pullForwardCount = s.pullForwardCount || 0;

                const schedule: ChoreScheduleInfo | null = activity
                    ? {
                          startDate: activity.startDate ? new Date(activity.startDate).toISOString().slice(0, 10) : todayKey,
                          rruleString: activity.rrule || null,
                          seriesStartDate: s.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : null,
                          exdates: Array.isArray(activity.exdates) ? activity.exdates : [],
                      }
                    : null;

                const plannedEnd = s.plannedEndDate
                    ? new Date(s.plannedEndDate).toISOString().slice(0, 10)
                    : schedule
                      ? computePlannedEndDate(schedule, totalBlocks)
                      : null;

                const liveEnd = schedule
                    ? computeLiveProjectedEndDate(schedule, totalBlocks, completedBlocks, pullForwardCount)
                    : null;

                const drift = schedule
                    ? computeScheduleDrift(plannedEnd, liveEnd, schedule)
                    : { status: 'on_target' as const, days: 0, label: 'On target' };

                const nextScheduledDate = schedule ? getNextPullableDate(schedule, tasks, pullForwardCount) : null;

                const _canPull = canPullForward(s.workAheadAllowed, tasks, pullForwardCount);
                const nextPullDate = _canPull && schedule ? getNextPullableDate(schedule, tasks, pullForwardCount) : null;

                // Get today's tasks for this series
                const todayTasks = schedule
                    ? getTasksForDate(
                          tasks,
                          schedule.rruleString,
                          schedule.startDate,
                          today,
                          schedule.seriesStartDate,
                          schedule.exdates,
                          pullForwardCount
                      )
                    : [];

                const todayFinished = areTodayTasksFinished(todayTasks);

                // Determine status
                const allDone = totalTasks > 0 && completedTasks === totalTasks;
                const effectiveStartDate = s.startDate ? new Date(s.startDate) : null;
                const isFuture = effectiveStartDate && effectiveStartDate > today;
                const hasDependency = !!s.dependsOnSeriesId;

                let status: SeriesStatus = 'active_now';
                if (allDone) {
                    status = 'finished';
                } else if (isFuture || hasDependency) {
                    status = 'future';
                }

                return {
                    raw: s,
                    status,
                    totalTasks,
                    completedTasks,
                    taskProgress,
                    totalBlocks,
                    completedBlocks,
                    blockProgress,
                    nextScheduledDate,
                    drift,
                    schedule,
                    pullForwardCount,
                    canPull: _canPull,
                    nextPullDate,
                    todayTasks,
                    todayTasksFinished: todayFinished,
                };
            })
            .sort((a: EnrichedSeries, b: EnrichedSeries) => {
                // Active first, then future, then finished
                const order = { active_now: 0, future: 1, finished: 2 };
                return order[a.status] - order[b.status];
            });
    }, [data?.taskSeries, selectedMemberId, today, todayKey]);

    const filteredSeries = filter === 'all' ? enrichedSeries : enrichedSeries.filter((s) => s.status === filter);

    const handlePullForward = async (item: EnrichedSeries) => {
        if (!item.nextPullDate || !item.schedule) return;

        const activity = Array.isArray(item.raw.scheduledActivity)
            ? item.raw.scheduledActivity[0]
            : item.raw.scheduledActivity;

        const result = buildPullForwardTransactions({
            tx,
            seriesId: item.raw.id,
            currentPullForwardCount: item.pullForwardCount,
            actorFamilyMemberId: selectedMemberId,
            choreId: activity?.id || null,
            originalScheduledDate: item.nextPullDate,
        });

        await db.transact(result.transactions);

        // Set up undo with timeout
        if (undoState?.timeoutId) clearTimeout(undoState.timeoutId);

        const timeoutId = setTimeout(() => {
            setUndoState(null);
        }, 10000);

        setUndoState({
            seriesId: item.raw.id,
            historyEventId: result.historyEventId,
            timeoutId,
        });

        toast({
            title: 'Tasks pulled forward',
            description: `Pulled forward tasks from ${format(new Date(item.nextPullDate + 'T00:00:00'), 'EEEE, MMM d')}`,
        });
    };

    const handleUndo = async () => {
        if (!undoState) return;

        const series = enrichedSeries.find((s) => s.raw.id === undoState.seriesId);
        if (!series) return;

        clearTimeout(undoState.timeoutId);

        const transactions = buildUndoPullForwardTransactions({
            tx,
            seriesId: undoState.seriesId,
            currentPullForwardCount: series.pullForwardCount,
            historyEventId: undoState.historyEventId,
        });

        await db.transact(transactions);
        setUndoState(null);

        toast({ title: 'Pull forward undone' });
    };

    const renderDriftBadge = (drift: ScheduleDrift) => {
        if (drift.status === 'on_target') {
            return <Badge className="bg-emerald-100 text-emerald-800">On target</Badge>;
        }
        if (drift.status === 'ahead') {
            return <Badge className="bg-blue-100 text-blue-800">{drift.label}</Badge>;
        }
        return <Badge className="bg-amber-100 text-amber-800">{drift.label}</Badge>;
    };

    const filterCounts = useMemo(() => ({
        active_now: enrichedSeries.filter((s) => s.status === 'active_now').length,
        future: enrichedSeries.filter((s) => s.status === 'future').length,
        finished: enrichedSeries.filter((s) => s.status === 'finished').length,
        all: enrichedSeries.length,
    }), [enrichedSeries]);

    if (isLoading) {
        return <div className="max-w-4xl mx-auto p-6 text-sm text-muted-foreground">Loading task series...</div>;
    }

    if (error) {
        return <div className="max-w-4xl mx-auto p-6 text-sm text-destructive">Could not load task series: {error.message}</div>;
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6">
            <div className="flex items-center gap-4">
                <Link href={`/tasks${selectedMemberId ? `?member=${selectedMemberId}` : ''}`}>
                    <Button variant="ghost" size="sm">
                        <ArrowLeft className="h-4 w-4 mr-1" /> Tasks
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold">
                    {memberName ? `${memberName}'s Task Series` : 'My Task Series'}
                </h1>
            </div>

            {/* Filter tabs */}
            <div className="flex flex-wrap gap-2">
                {([
                    ['active_now', 'Active Now'],
                    ['future', 'Future'],
                    ['finished', 'Finished'],
                    ['all', 'All'],
                ] as const).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setFilter(key)}
                        className={cn(
                            'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                            filter === key
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:bg-accent/30'
                        )}
                    >
                        {label} ({filterCounts[key]})
                    </button>
                ))}
            </div>

            {/* Undo banner */}
            {undoState && (
                <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <span className="text-sm">Tasks pulled forward.</span>
                    <Button size="sm" variant="outline" onClick={handleUndo}>
                        <Undo2 className="h-3 w-3 mr-1" /> Undo
                    </Button>
                </div>
            )}

            {/* Series list */}
            {filteredSeries.length === 0 ? (
                <div className="text-sm text-muted-foreground py-8 text-center">
                    {filter === 'active_now'
                        ? 'No active task series right now.'
                        : filter === 'future'
                          ? 'No upcoming task series.'
                          : filter === 'finished'
                            ? 'No finished task series.'
                            : 'No task series assigned to this member.'}
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredSeries.map((item) => {
                        const isExpanded = expandedSeriesId === item.raw.id;
                        const activity = Array.isArray(item.raw.scheduledActivity)
                            ? item.raw.scheduledActivity[0]
                            : item.raw.scheduledActivity;

                        return (
                            <div key={item.raw.id} className="border rounded-lg bg-card overflow-hidden">
                                {/* Card header */}
                                <div
                                    className="p-4 cursor-pointer hover:bg-accent/20 transition-colors"
                                    onClick={() => setExpandedSeriesId(isExpanded ? null : item.raw.id)}
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0 space-y-2">
                                            <div className="flex items-center gap-2">
                                                {isExpanded ? (
                                                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                                ) : (
                                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                                )}
                                                <h2 className="text-base font-semibold truncate">
                                                    {item.raw.name || 'Untitled series'}
                                                </h2>
                                                {renderDriftBadge(item.drift)}
                                                {item.pullForwardCount > 0 && (
                                                    <Badge variant="outline" className="text-xs">
                                                        <FastForward className="h-3 w-3 mr-1" />
                                                        {item.pullForwardCount} pulled
                                                    </Badge>
                                                )}
                                            </div>

                                            {activity && (
                                                <div className="text-xs text-muted-foreground ml-6">
                                                    {activity.title}
                                                    {item.nextScheduledDate && (
                                                        <> &middot; Next: {format(new Date(item.nextScheduledDate + 'T00:00:00'), 'EEE, MMM d')}</>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="w-48 shrink-0 space-y-1">
                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                <span>Tasks</span>
                                                <span>{item.completedTasks}/{item.totalTasks}</span>
                                            </div>
                                            <Progress value={item.taskProgress} className="h-1.5" />
                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                <span>Days</span>
                                                <span>{item.completedBlocks}/{item.totalBlocks}</span>
                                            </div>
                                            <Progress value={item.blockProgress} className="h-1.5" />
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded detail */}
                                {isExpanded && (
                                    <div className="border-t px-4 py-4 space-y-4 bg-muted/30 animate-in fade-in slide-in-from-top-1 duration-150">
                                        {/* Today's tasks finished message + pull forward CTA */}
                                        {item.todayTasksFinished && item.todayTasks.length > 0 && item.canPull && item.nextPullDate && (
                                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                                                <p className="text-sm font-medium text-emerald-800">
                                                    Today&apos;s tasks are finished!
                                                </p>
                                                <p className="text-sm text-emerald-700">
                                                    Want to get started on {format(new Date(item.nextPullDate + 'T00:00:00'), 'EEEE, MMM d')}&apos;s tasks?
                                                </p>
                                                <Button
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePullForward(item);
                                                    }}
                                                >
                                                    <FastForward className="h-3 w-3 mr-1.5" />
                                                    Pull forward
                                                </Button>
                                            </div>
                                        )}

                                        {/* Pull forward CTA when today has no tasks but series is active */}
                                        {item.todayTasks.length === 0 && item.canPull && item.nextPullDate && item.status === 'active_now' && (
                                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 space-y-2">
                                                <p className="text-sm text-blue-800">
                                                    No tasks scheduled today. Next tasks are on{' '}
                                                    {format(new Date(item.nextPullDate + 'T00:00:00'), 'EEEE, MMM d')}.
                                                </p>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handlePullForward(item);
                                                    }}
                                                >
                                                    <FastForward className="h-3 w-3 mr-1.5" />
                                                    Pull forward
                                                </Button>
                                            </div>
                                        )}

                                        {/* Current task-day tasks */}
                                        {item.todayTasks.length > 0 && (
                                            <div className="space-y-2">
                                                <h3 className="text-sm font-medium text-muted-foreground">Current tasks</h3>
                                                <div className="space-y-1">
                                                    {item.todayTasks.map((task) => {
                                                        const state = getTaskWorkflowState(task);
                                                        return (
                                                            <div
                                                                key={task.id}
                                                                className="flex items-center gap-2 rounded px-2 py-1.5 text-sm bg-background"
                                                            >
                                                                <span
                                                                    className={cn(
                                                                        'w-2 h-2 rounded-full shrink-0',
                                                                        state === 'done' && 'bg-emerald-500',
                                                                        state === 'in_progress' && 'bg-blue-500',
                                                                        state === 'blocked' && 'bg-red-500',
                                                                        state === 'skipped' && 'bg-gray-400',
                                                                        state === 'needs_review' && 'bg-amber-500',
                                                                        state === 'not_started' && 'bg-gray-300'
                                                                    )}
                                                                />
                                                                <span className={cn('flex-1', state === 'done' && 'line-through text-muted-foreground')}>
                                                                    {task.text}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {getTaskStatusLabel(state)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Schedule info */}
                                        <div className="grid grid-cols-2 gap-4 text-xs text-muted-foreground">
                                            {item.raw.plannedEndDate && (
                                                <div>
                                                    <span className="font-medium">Planned finish:</span>{' '}
                                                    {format(new Date(item.raw.plannedEndDate), 'MMM d, yyyy')}
                                                </div>
                                            )}
                                            {item.schedule && (
                                                <div>
                                                    <span className="font-medium">Projected finish:</span>{' '}
                                                    {(() => {
                                                        const live = computeLiveProjectedEndDate(
                                                            item.schedule,
                                                            item.totalBlocks,
                                                            item.completedBlocks,
                                                            item.pullForwardCount
                                                        );
                                                        return live ? format(new Date(live + 'T00:00:00'), 'MMM d, yyyy') : 'N/A';
                                                    })()}
                                                </div>
                                            )}
                                        </div>

                                        {/* No work-ahead message */}
                                        {!item.raw.workAheadAllowed && item.todayTasksFinished && item.todayTasks.length > 0 && (
                                            <p className="text-xs text-muted-foreground italic">
                                                Work-ahead is not enabled for this series. A parent can enable it in the series editor.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default MyTaskSeriesOverview;
