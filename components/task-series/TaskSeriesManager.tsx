// components/task-series/TaskSeriesManager.tsx
'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { RRule } from 'rrule';
import { id, tx } from '@instantdb/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress'; // if you don’t have this, we can inline a div-based bar
import { Checkbox } from '@/components/ui/checkbox';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/components/AuthProvider';
import { isActionableTask, isTaskDone } from '@/lib/task-progress';
import {
    countTaskDayBlocks,
    countCompletedTaskDayBlocks,
    computePlannedEndDate,
    computeLiveProjectedEndDate,
    computeScheduleDrift,
    buildCatchUpTransactions,
    type ChoreScheduleInfo,
    type ScheduleDrift,
} from '@/lib/task-series-schedule';
import type { Task as SchedulerTask } from '@/lib/task-scheduler';
import { computeSeriesGrade } from '@/lib/task-response-aggregation';
import { formatGradeDisplay } from '@/lib/grade-utils';

type Status = 'draft' | 'pending' | 'in_progress' | 'archived';

interface TaskSeriesManagerProps {
    db: any;
}

const TaskSeriesManager: React.FC<TaskSeriesManagerProps> = ({ db }) => {
    const router = useRouter();
    const { toast } = useToast();
    const { currentUser } = useAuth();
    const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');

    // Selection State
    const [selectedSeriesIds, setSelectedSeriesIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

    // Deletion State
    const [seriesToDelete, setSeriesToDelete] = useState<string[] | null>(null); // Array of IDs to delete
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const { data, isLoading, error } = db.useQuery({
        taskSeries: {
            tasks: {
                responseFields: {},
                updates: {
                    actor: {},
                    affectedPerson: {},
                    responseFieldValues: { field: {} },
                    gradeType: {},
                    attachments: {},
                },
            },
            familyMember: {},
            scheduledActivity: {},
        },
    });

    const seriesList = useMemo(() => {
        const rawSeries = data?.taskSeries || [];

        return [...rawSeries].sort((a: any, b: any) => {
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bTime - aTime;
        });
    }, [data?.taskSeries]);
    const today = useMemo(() => new Date(), []);

    const enrichedSeries = useMemo(() => {
        type BaseInfo = {
            series: any;
            totalTasks: number;
            completedTasks: number;
            hasAssignee: boolean;
            hasScheduledActivity: boolean;
            effectiveStartDate: Date | null;
            lastScheduledDate: Date | null;
            dependsOnSeriesId?: string | null;
        };

        const baseMap = new Map<string, BaseInfo>();

        // --- First pass: compute progress & scheduling info ---
        for (const s of seriesList) {
            const tasks = s.tasks || [];
            const actionableTasks = tasks.filter((t: any) => isActionableTask(t, tasks));
            const totalTasks = actionableTasks.length;
            const completedTasks = actionableTasks.filter((t: any) => isTaskDone(t)).length;

            const hasAssignee = !!s.familyMember;
            const hasScheduledActivity = !!s.scheduledActivity;

            const seriesStartDate = s.startDate ? new Date(s.startDate) : null;
            const choreStartDate = s.scheduledActivity?.startDate ? new Date(s.scheduledActivity.startDate) : null;

            // Effective start = explicit series start, else chore start, else null
            const effectiveStartDate = seriesStartDate ?? choreStartDate ?? null;

            // Last scheduled day:
            // Prefer chore.rrule if we can interpret it (with UNTIL or small COUNT),
            // else fall back to series.targetEndDate, else null (open-ended).
            let lastScheduledDate: Date | null = null;

            if (s.scheduledActivity?.rrule) {
                try {
                    const rule = RRule.fromString(s.scheduledActivity.rrule);

                    if (rule.options.until) {
                        lastScheduledDate = rule.options.until;
                    } else if (typeof rule.options.count === 'number' && rule.options.count > 0 && rule.options.count <= 365) {
                        const all = rule.all();
                        if (all.length > 0) {
                            lastScheduledDate = all[all.length - 1];
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse rrule for chore', s.scheduledActivity?.id, e);
                }
            }

            if (!lastScheduledDate && s.targetEndDate) {
                lastScheduledDate = new Date(s.targetEndDate);
            }

            baseMap.set(s.id, {
                series: s,
                totalTasks,
                completedTasks,
                hasAssignee,
                hasScheduledActivity,
                effectiveStartDate,
                lastScheduledDate,
                dependsOnSeriesId: s.dependsOnSeriesId ?? null,
            });
        }

        // --- Second pass: compute status with dependency awareness ---
        const statusCache = new Map<string, Status>();

        const computeStatus = (seriesId: string): Status => {
            if (statusCache.has(seriesId)) {
                return statusCache.get(seriesId)!;
            }

            const info = baseMap.get(seriesId);
            if (!info) {
                statusCache.set(seriesId, 'draft');
                return 'draft';
            }

            const { hasAssignee, hasScheduledActivity, totalTasks, completedTasks, effectiveStartDate, lastScheduledDate, dependsOnSeriesId } = info;

            const allCompleted = totalTasks > 0 && completedTasks === totalTasks;

            let status: Status = 'draft';

            if (!hasAssignee || !hasScheduledActivity) {
                status = 'draft';
            } else {
                // Dependency
                let dependencyBlocking = false;
                if (dependsOnSeriesId) {
                    const depStatus = computeStatus(dependsOnSeriesId);
                    dependencyBlocking = depStatus !== 'archived';
                }

                if (allCompleted) {
                    // Archived when everything is done AND either:
                    // - we know lastScheduledDate and it's in the past, OR
                    // - we *don't* know lastScheduledDate (treat as done now).
                    if (!lastScheduledDate || lastScheduledDate < today) {
                        status = 'archived';
                    } else {
                        status = 'in_progress';
                    }
                } else if (dependencyBlocking) {
                    status = 'pending';
                } else if (effectiveStartDate && effectiveStartDate > today) {
                    status = 'pending';
                } else {
                    status = 'in_progress';
                }
            }

            statusCache.set(seriesId, status);
            return status;
        };

        return seriesList.map((s: any) => {
            const info = baseMap.get(s.id)!;
            const status = computeStatus(s.id);

            const { totalTasks, completedTasks } = info;
            const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

            // Task-day block progress and schedule drift
            const tasks: SchedulerTask[] = (s.tasks || []).map((t: any) => ({
                id: t.id,
                text: t.text || '',
                isDayBreak: !!t.isDayBreak,
                isCompleted: !!t.isCompleted,
                order: typeof t.order === 'number' ? t.order : 0,
                workflowState: t.workflowState || undefined,
                parentTask: t.parentTask,
                subTasks: t.subTasks,
            }));

            const totalBlocks = countTaskDayBlocks(tasks);
            const completedBlocks = countCompletedTaskDayBlocks(tasks);
            const blockProgress = totalBlocks > 0 ? (completedBlocks / totalBlocks) * 100 : 0;
            const pullForwardCount = s.pullForwardCount || 0;

            let drift: ScheduleDrift = { status: 'on_target', days: 0, label: 'On target' };
            const activity = s.scheduledActivity;
            if (activity?.rrule) {
                const todayKey = today.toISOString().slice(0, 10);
                const schedule: ChoreScheduleInfo = {
                    startDate: activity.startDate ? new Date(activity.startDate).toISOString().slice(0, 10) : todayKey,
                    rruleString: activity.rrule,
                    seriesStartDate: s.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : null,
                    exdates: Array.isArray(activity.exdates) ? activity.exdates : [],
                };

                const plannedEnd = s.plannedEndDate
                    ? new Date(s.plannedEndDate).toISOString().slice(0, 10)
                    : computePlannedEndDate(schedule, totalBlocks);

                const liveEnd = computeLiveProjectedEndDate(schedule, totalBlocks, completedBlocks, pullForwardCount);
                drift = computeScheduleDrift(plannedEnd, liveEnd, schedule);
            }

            // Compute series-level grade
            const seriesGrade = computeSeriesGrade(s.tasks || []);

            return {
                raw: s,
                status,
                totalTasks,
                completedTasks,
                progress,
                totalBlocks,
                completedBlocks,
                blockProgress,
                drift,
                pullForwardCount,
                seriesGrade,
            };
        });
    }, [seriesList, today]);

    const filteredSeries = statusFilter === 'all' ? enrichedSeries : enrichedSeries.filter((s) => s.status === statusFilter);

    // --- Selection Handlers ---

    const handleSelectAll = () => {
        if (selectedSeriesIds.size === filteredSeries.length) {
            setSelectedSeriesIds(new Set());
        } else {
            setSelectedSeriesIds(new Set(filteredSeries.map((s) => s.raw.id)));
        }
    };

    const handleSelect = (id: string, event: React.MouseEvent) => {
        event.stopPropagation(); // Prevent card click

        const newSelected = new Set(selectedSeriesIds);

        // Handle Shift+Click
        if (event.shiftKey && lastSelectedId) {
            const lastIndex = filteredSeries.findIndex((s) => s.raw.id === lastSelectedId);
            const currentIndex = filteredSeries.findIndex((s) => s.raw.id === id);

            if (lastIndex !== -1 && currentIndex !== -1) {
                const start = Math.min(lastIndex, currentIndex);
                const end = Math.max(lastIndex, currentIndex);

                for (let i = start; i <= end; i++) {
                    newSelected.add(filteredSeries[i].raw.id);
                }
            }
        } else {
            // Normal Toggle
            if (newSelected.has(id)) {
                newSelected.delete(id);
            } else {
                newSelected.add(id);
            }
        }

        setLastSelectedId(id);
        setSelectedSeriesIds(newSelected);
    };

    // --- Deletion Logic ---

    const promptDeleteSingle = (id: string, event: React.MouseEvent) => {
        event.stopPropagation();
        setSeriesToDelete([id]);
        setIsDeleteDialogOpen(true);
    };

    const promptDeleteSelected = () => {
        setSeriesToDelete(Array.from(selectedSeriesIds));
        setIsDeleteDialogOpen(true);
    };

    const performDelete = async () => {
        if (!seriesToDelete || seriesToDelete.length === 0) return;

        const transactions: any[] = [];

        // 1. Gather all series to delete
        const targetSeries = seriesList.filter((s: any) => seriesToDelete.includes(s.id));

        for (const series of targetSeries) {
            // Delete the series entity
            transactions.push(tx.taskSeries[series.id].delete());

            // Cascade delete: Explicitly delete all tasks linked to this series
            // Note: Linked FamilyMembers and ScheduledActivities are NOT deleted,
            // the link is just removed when the series is deleted.
            if (series.tasks && series.tasks.length > 0) {
                for (const task of series.tasks) {
                    transactions.push(tx.tasks[task.id].delete());
                }
            }
        }

        try {
            await db.transact(transactions);
            toast({
                title: 'Deleted',
                description: `Successfully deleted ${seriesToDelete.length} task series.`,
            });
            // Clear selection if successful
            setSelectedSeriesIds(new Set());
            setSeriesToDelete(null);
        } catch (err) {
            console.error('Delete failed', err);
            toast({
                title: 'Error',
                description: 'Failed to delete task series.',
                variant: 'destructive',
            });
        } finally {
            setIsDeleteDialogOpen(false);
        }
    };

    const handleOpenSeries = (id: string) => {
        router.push(`/task-series/${id}`);
    };

    const handleCatchUp = async (item: (typeof enrichedSeries)[number], e: React.MouseEvent) => {
        e.stopPropagation();
        const s = item.raw;
        const activity = s.scheduledActivity;
        if (!activity?.rrule) return;

        const todayKey = today.toISOString().slice(0, 10);
        const schedule: ChoreScheduleInfo = {
            startDate: activity.startDate ? new Date(activity.startDate).toISOString().slice(0, 10) : todayKey,
            rruleString: activity.rrule,
            seriesStartDate: s.startDate ? new Date(s.startDate).toISOString().slice(0, 10) : null,
            exdates: Array.isArray(activity.exdates) ? activity.exdates : [],
        };

        const liveEnd = computeLiveProjectedEndDate(schedule, item.totalBlocks, item.completedBlocks, item.pullForwardCount);
        if (!liveEnd) return;

        const transactions = buildCatchUpTransactions({
            tx,
            seriesId: s.id,
            newPlannedEndDate: liveEnd,
            currentDayBreakCount: item.totalBlocks,
            actorFamilyMemberId: currentUser?.id || null,
            choreId: activity.id || null,
        });

        await db.transact(transactions);
        toast({ title: 'Schedule caught up', description: 'Planned end date updated to match current progress.' });
    };

    const handleNewSeries = () => {
        router.push('/task-series/new');
    };

    const renderStatusBadge = (status: Status) => {
        switch (status) {
            case 'draft':
                return <Badge variant="outline">Draft</Badge>;
            case 'pending':
                return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
            case 'in_progress':
                return <Badge className="bg-blue-100 text-blue-800">In Progress</Badge>;
            case 'archived':
                return <Badge className="bg-emerald-100 text-emerald-800">Archived</Badge>;
        }
    };

    const handleDuplicate = async (seriesWithMeta: (typeof enrichedSeries)[number], e: React.MouseEvent) => {
        e.stopPropagation(); // don't trigger open-on-card-click

        const s = seriesWithMeta.raw;

        try {
            const newSeriesId = id();
            const now = new Date();

            const transactions: any[] = [];

            // Create the new series (copying metadata except assignee/scheduledActivity/dependency)
            transactions.push(
                tx.taskSeries[newSeriesId].update({
                    name: s.name ? `${s.name} (copy)` : 'Untitled series (copy)',
                    description: s.description || '',
                    startDate: s.startDate ? new Date(s.startDate) : undefined,
                    targetEndDate: s.targetEndDate ? new Date(s.targetEndDate) : undefined,
                    workAheadAllowed: s.workAheadAllowed ?? undefined,
                    breakType: s.breakType ?? undefined,
                    breakStartDate: s.breakStartDate ? new Date(s.breakStartDate) : undefined,
                    breakDelayValue: s.breakDelayValue ?? undefined,
                    breakDelayUnit: s.breakDelayUnit ?? undefined,
                    dependsOnSeriesId: null,
                    createdAt: now,
                    updatedAt: now,
                })
            );

            // Duplicate tasks (reset completion, keep structure)
            const originalTasks = (s.tasks || []).slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));

            for (const t of originalTasks) {
                const newTaskId = id();

                const taskData: any = {
                    text: t.text,
                    order: t.order,
                    isDayBreak: t.isDayBreak,
                    overrideWorkAhead: t.overrideWorkAhead ?? undefined,
                    notes: t.notes ?? undefined,
                    specificTime: t.specificTime ?? undefined,
                    // Reset completion
                    isCompleted: false,
                    completedAt: null,
                    completedOnDate: null,
                    workflowState: 'not_started',
                    lastActiveState: 'not_started',
                    deferredUntilDate: null,
                    createdAt: now,
                    updatedAt: now,
                };

                // Preserve indentation if your schema includes it
                if (typeof t.indentationLevel === 'number') {
                    taskData.indentationLevel = t.indentationLevel;
                }

                transactions.push(tx.tasks[newTaskId].update(taskData));
                transactions.push(tx.taskSeries[newSeriesId].link({ tasks: newTaskId }));
            }

            await db.transact(transactions);
            toast({ title: 'Task series duplicated' });

            router.push(`/task-series/${newSeriesId}`);
        } catch (err) {
            console.error('Duplicate failed', err);
            toast({
                title: 'Could not duplicate series',
                variant: 'destructive',
            });
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold">Task Series</h1>
                    {selectedSeriesIds.size > 0 && (
                        <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-md border animate-in fade-in slide-in-from-left-2 duration-200">
                            <span className="text-sm font-medium">{selectedSeriesIds.size} selected</span>
                            <Button size="sm" variant="destructive" onClick={promptDeleteSelected} className="h-7 px-2 text-xs">
                                <Trash2 className="h-3 w-3 mr-1.5" />
                                Delete
                            </Button>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => router.push('/task-series/review')}>
                        View Task Bins
                    </Button>
                    <Button onClick={handleNewSeries}>New Task Series</Button>
                </div>
            </div>

            {/* Status Filters & Bulk Select Toggle */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap gap-2">
                    {(['all', 'draft', 'pending', 'in_progress', 'archived'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={cn(
                                'px-3 py-1 rounded-full text-xs font-medium border',
                                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-foreground border-border'
                            )}
                        >
                            {s === 'all' ? 'All' : s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>

                {filteredSeries.length > 0 && (
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="select-all"
                            checked={selectedSeriesIds.size === filteredSeries.length && filteredSeries.length > 0}
                            onCheckedChange={handleSelectAll}
                        />
                        <label htmlFor="select-all" className="text-sm text-muted-foreground select-none cursor-pointer">
                            Select All
                        </label>
                    </div>
                )}
            </div>

            {/* List */}
            {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading task series...</div>
            ) : error ? (
                <div className="text-sm text-destructive">Could not load task series: {error.message}</div>
            ) : filteredSeries.length === 0 ? (
                <div className="text-sm text-muted-foreground">No task series yet. Click &ldquo;New Task Series&rdquo; to create one.</div>
            ) : (
                <div className="space-y-3">
                    {filteredSeries.map((item) => {
                        const { raw: s, status, totalTasks, completedTasks, progress, totalBlocks, completedBlocks, blockProgress, drift, pullForwardCount, seriesGrade } = item;
                        const isSelected = selectedSeriesIds.has(s.id);

                        return (
                            <div
                                key={s.id}
                                className={cn(
                                    'border rounded-lg bg-card p-4 hover:bg-accent/30 cursor-pointer transition-colors flex flex-col md:flex-row md:items-center md:justify-between gap-3 relative group',
                                    isSelected && 'bg-accent/40 border-primary/50'
                                )}
                                onClick={() => handleOpenSeries(s.id)}
                            >
                                {/* Checkbox Overlay/Area */}
                                <div
                                    className="absolute top-4 left-4 z-10"
                                    onClick={(e) => handleSelect(s.id, e)} // Handle select logic
                                >
                                    <Checkbox checked={isSelected} />
                                </div>

                                <div className="space-y-1 pl-8">
                                    {' '}
                                    {/* Add padding left for checkbox */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-base font-semibold">{s.name || 'Untitled series'}</h2>
                                        {renderStatusBadge(status)}
                                        {drift.status !== 'on_target' && (
                                            <Badge className={cn(
                                                drift.status === 'ahead' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                                            )}>
                                                {drift.label}
                                            </Badge>
                                        )}
                                        {drift.status === 'on_target' && status === 'in_progress' && totalBlocks > 0 && (
                                            <Badge className="bg-emerald-100 text-emerald-800">On target</Badge>
                                        )}
                                        {pullForwardCount > 0 && (
                                            <Badge variant="outline" className="text-xs">
                                                {pullForwardCount} pulled fwd
                                            </Badge>
                                        )}
                                    </div>
                                    {s.description && <p className="text-sm text-muted-foreground line-clamp-2">{s.description}</p>}
                                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                                        {s.familyMember && <span>Assignee: {s.familyMember.name}</span>}
                                        {s.scheduledActivity && <span>Activity: {s.scheduledActivity.title}</span>}
                                        {s.updatedAt && <span>Updated: {format(new Date(s.updatedAt), 'MMM d, yyyy')}</span>}
                                    </div>
                                </div>

                                <div className="w-full md:w-72 flex flex-col items-stretch gap-2 pl-8 md:pl-0">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>Tasks</span>
                                        {totalTasks > 0 ? (
                                            <span>
                                                {completedTasks}/{totalTasks}
                                            </span>
                                        ) : (
                                            <span>No tasks yet</span>
                                        )}
                                    </div>
                                    <Progress value={progress} className="h-1.5" />

                                    {totalBlocks > 0 && (
                                        <>
                                            <div className="flex justify-between text-xs text-muted-foreground">
                                                <span>Days</span>
                                                <span>{completedBlocks}/{totalBlocks}</span>
                                            </div>
                                            <Progress value={blockProgress} className="h-1.5" />
                                        </>
                                    )}

                                    {seriesGrade && seriesGrade.gradedCount > 0 && (
                                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                                            <span>Grade</span>
                                            <span className="font-semibold text-emerald-700">
                                                {seriesGrade.gradeType
                                                    ? formatGradeDisplay(seriesGrade.average, seriesGrade.gradeType)
                                                    : seriesGrade.average.toFixed(1)}
                                                <span className="ml-1 font-normal text-slate-500">
                                                    ({seriesGrade.gradedCount}/{seriesGrade.totalGradable} graded)
                                                </span>
                                            </span>
                                        </div>
                                    )}

                                    <div className="flex justify-end gap-2 pt-2 md:pt-0">
                                        {drift.status === 'behind' && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-xs"
                                                onClick={(e) => handleCatchUp(item, e)}
                                            >
                                                Catch up
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={(e) => promptDeleteSingle(s.id, e)}
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={(e) => handleDuplicate(item, e)}>
                                            Duplicate
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {seriesToDelete && seriesToDelete.length > 1
                                ? `This will permanently delete ${seriesToDelete.length} task series and all associated tasks.`
                                : `This will permanently delete "${
                                      seriesList.find((s: any) => s.id === seriesToDelete?.[0])?.name || 'this series'
                                  }" and all its tasks.`}
                            <br />
                            <br />
                            Linked family members and scheduled activities will not be deleted, just unlinked.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={performDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default TaskSeriesManager;
