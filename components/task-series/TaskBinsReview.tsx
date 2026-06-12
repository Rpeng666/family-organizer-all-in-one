'use client';

import React, { useMemo, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { id, tx } from '@instantdb/react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/components/AuthProvider';
import {
    AlertCircle,
    ArrowLeft,
    Bell,
    BellOff,
    CalendarClock,
    Check,
    ChevronDown,
    ChevronUp,
    Eye,
    Filter,
    SortAsc,
} from 'lucide-react';
import {
    getLatestTaskUpdate,
    getTaskStatusLabel,
    getTaskUpdateActorName,
    getTaskUpdateAffectedName,
    getTaskWorkflowState,
    type TaskWorkflowState,
} from '@/lib/task-progress';
import {
    buildTaskBinEntries,
    sortTaskBinEntries,
    groupByAttention,
    type TaskBinFilters,
    type TaskBinSort,
    type TaskBinEntry,
    type TaskLatenessInfo,
} from '@/lib/task-bins';
import {
    buildTaskUpdateTransactions,
    buildNotedTransactions,
    buildClearNotedTransactions,
} from '@/lib/task-update-mutations';
import { TaskUpdatePanel, type TaskUpdatePanelSubmission } from '@/components/task-updates/TaskUpdatePanel';
import { UpdateHistory } from '@/components/task-updates/UpdateHistory';
import { AttachmentThumbnailRow } from '@/components/attachments/AttachmentThumbnail';

// ---------------------------------------------------------------------------
// Status styles
// ---------------------------------------------------------------------------

const statusToneClassName: Record<TaskWorkflowState, string> = {
    not_started: 'bg-slate-100 text-slate-700 border-slate-200',
    in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
    blocked: 'bg-rose-100 text-rose-700 border-rose-200',
    skipped: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    needs_review: 'bg-violet-100 text-violet-700 border-violet-200',
    done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const statusCountColors: Record<TaskWorkflowState, string> = {
    needs_review: 'bg-violet-600 text-white',
    blocked: 'bg-rose-600 text-white',
    in_progress: 'bg-amber-500 text-white',
    not_started: 'bg-slate-400 text-white',
    skipped: 'bg-zinc-400 text-white',
    done: 'bg-emerald-500 text-white',
};

// ---------------------------------------------------------------------------
// Timestamp formatting
// ---------------------------------------------------------------------------

function formatTimestamp(value: number | string | Date | null | undefined): string {
    if (!value) return '';
    const date = typeof value === 'number' ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const TaskLatenessBadge: React.FC<{ lateness: TaskLatenessInfo }> = ({ lateness }) => (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
        {lateness.label}
    </span>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TaskBinsReview: React.FC = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { currentUser } = useAuth();

    // Initialize filters from URL search params (e.g. ?seriesId=abc)
    const initialSeriesId = searchParams.get('seriesId');
    const [filters, setFilters] = useState<TaskBinFilters>(() => ({
        status: 'all',
        showNoted: false,
        ...(initialSeriesId ? { taskSeriesId: initialSeriesId } : {}),
    }));
    const [sort, setSort] = useState<TaskBinSort>('status');
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(!!initialSeriesId);
    const [view, setView] = useState<'attention' | 'all'>(initialSeriesId ? 'all' : 'attention');

    // ---- Queries ----
    const { data, isLoading } = db.useQuery({
        tasks: {
            updates: {
                actor: {},
                affectedPerson: {},
                responseFieldValues: { field: {} },
                gradeType: {},
                attachments: {},
                replyTo: {},
                replies: {
                    actor: {},
                    affectedPerson: {},
                    attachments: {},
                    gradeType: {},
                },
            },
            taskSeries: {
                familyMember: {},
                scheduledActivity: {},
            },
            responseFields: {},
        },
        familyMembers: {},
        taskSeries: {},
        gradeTypes: {},
    });

    const tasks = data?.tasks || [];
    const familyMembers = data?.familyMembers || [];
    const allSeries = data?.taskSeries || [];
    const gradeTypes = data?.gradeTypes || [];

    // ---- Build entries ----
    // In "All Tasks" view, always include noted tasks regardless of the filter toggle.
    const effectiveFilters = useMemo(
        () => (view === 'all' ? { ...filters, showNoted: true } : filters),
        [filters, view]
    );
    const entries = useMemo(
        () => buildTaskBinEntries(tasks as any[], effectiveFilters),
        [tasks, effectiveFilters]
    );
    const sorted = useMemo(() => sortTaskBinEntries(entries, sort), [entries, sort]);
    const { needsAttention, all } = useMemo(() => groupByAttention(sorted), [sorted]);

    const visibleEntries = view === 'attention' ? needsAttention : all;

    // ---- Status counts for badges ----
    const statusCounts = useMemo(() => {
        const counts: Partial<Record<TaskWorkflowState, number>> = {};
        for (const entry of entries) {
            const state = getTaskWorkflowState(entry.task) as TaskWorkflowState;
            counts[state] = (counts[state] || 0) + 1;
        }
        return counts;
    }, [entries]);

    // ---- Handlers ----
    const handleStatusFilter = (status: TaskWorkflowState | 'all') => {
        setFilters((prev) => ({ ...prev, status }));
    };

    const handleUpdateTask = useCallback(
        async (taskId: string, submission: TaskUpdatePanelSubmission) => {
            if (!currentUser?.id) return;

            // Determine the affected person from the task's series owner
            const task = tasks.find((t: any) => t.id === taskId) as any;
            const rawSeries = task?.taskSeries;
            const series = Array.isArray(rawSeries) ? rawSeries[0] : rawSeries;
            const rawOwner = series?.familyMember;
            const owner = Array.isArray(rawOwner) ? rawOwner[0] : rawOwner;
            const affectedId = owner?.id || currentUser.id;

            const { transactions } = buildTaskUpdateTransactions({
                tx,
                createId: id,
                taskId,
                allTasks: tasks as any[],
                nextState: submission.nextState,
                selectedDateKey: new Date().toISOString().slice(0, 10),
                note: submission.note,
                actorFamilyMemberId: currentUser.id,
                affectedFamilyMemberId: affectedId,
                responseFieldValues: submission.responseFieldValues,
                grade: submission.grade,
                replyToUpdateId: submission.replyToUpdateId,
            });

            if (transactions.length > 0) {
                await db.transact(transactions);
                toast({
                    title: 'Task updated',
                    description: `Moved to ${getTaskStatusLabel(submission.nextState)}`,
                });
            }
        },
        [currentUser, tasks, toast]
    );

    const handleNote = useCallback(
        async (taskId: string, mode: 'indefinite' | 'date' | 'clear', untilDate?: string) => {
            let transactions: any[];
            if (mode === 'clear') {
                transactions = buildClearNotedTransactions({ tx, taskId });
            } else {
                transactions = buildNotedTransactions({
                    tx,
                    taskId,
                    indefinitely: mode === 'indefinite',
                    notedUntilDate: mode === 'date' ? untilDate : null,
                });
            }
            await db.transact(transactions);
            toast({
                title: mode === 'clear' ? 'Note cleared' : 'Task noted',
                description:
                    mode === 'clear'
                        ? 'Task will appear in needs attention again.'
                        : mode === 'indefinite'
                          ? 'Hidden from needs attention indefinitely.'
                          : `Hidden until ${untilDate}.`,
            });
        },
        [toast]
    );

    // ---- Render ----

    if (isLoading) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <div className="text-sm text-slate-500">Loading tasks...</div>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl px-4 py-6">
            {/* Header */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/task-series')}
                        className="gap-1.5"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900">Task Bins</h1>
                        <p className="text-sm text-slate-500">
                            Review and manage task progress across all series
                        </p>
                    </div>
                </div>

                {/* View tabs */}
                <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                    <button
                        type="button"
                        onClick={() => setView('attention')}
                        className={cn(
                            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                            view === 'attention'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        )}
                    >
                        <AlertCircle className="h-3.5 w-3.5" />
                        Needs Attention
                        {needsAttention.length > 0 && (
                            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {needsAttention.length}
                            </span>
                        )}
                    </button>
                    <button
                        type="button"
                        onClick={() => setView('all')}
                        className={cn(
                            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                            view === 'all'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        )}
                    >
                        <Eye className="h-3.5 w-3.5" />
                        All Tasks
                        <span className="rounded-full bg-slate-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                            {all.length}
                        </span>
                    </button>
                </div>
            </div>

            {/* Filters bar */}
            <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                        <Filter className="h-3.5 w-3.5" />
                        Filters
                        {showFilters ? (
                            <ChevronUp className="h-3 w-3" />
                        ) : (
                            <ChevronDown className="h-3 w-3" />
                        )}
                    </button>

                    {/* Status quick filters */}
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => handleStatusFilter('all')}
                            className={cn(
                                'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                                filters.status === 'all'
                                    ? 'border-slate-400 bg-slate-200 text-slate-800'
                                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                            )}
                        >
                            All
                        </button>
                        {(['needs_review', 'blocked', 'in_progress', 'not_started', 'skipped', 'done'] as TaskWorkflowState[]).map(
                            (state) => (
                                <button
                                    key={state}
                                    type="button"
                                    onClick={() => handleStatusFilter(state)}
                                    className={cn(
                                        'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors',
                                        filters.status === state
                                            ? statusToneClassName[state]
                                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                                    )}
                                >
                                    {getTaskStatusLabel(state)}
                                    {(statusCounts[state] || 0) > 0 && (
                                        <span
                                            className={cn(
                                                'rounded-full px-1.5 text-[9px] font-bold',
                                                filters.status === state
                                                    ? 'bg-white/30'
                                                    : statusCountColors[state]
                                            )}
                                        >
                                            {statusCounts[state]}
                                        </span>
                                    )}
                                </button>
                            )
                        )}
                    </div>

                    {/* Sort */}
                    <Select value={sort} onValueChange={(v) => setSort(v as TaskBinSort)}>
                        <SelectTrigger className="h-7 w-[130px] text-xs">
                            <SortAsc className="mr-1 h-3 w-3" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="status">By Status</SelectItem>
                            <SelectItem value="newest">Newest First</SelectItem>
                            <SelectItem value="oldest">Oldest First</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Expanded filter row */}
                {showFilters && (
                    <div className="flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Family Member
                            </label>
                            <Select
                                value={filters.familyMemberId || 'all'}
                                onValueChange={(v) =>
                                    setFilters((prev) => ({ ...prev, familyMemberId: v }))
                                }
                            >
                                <SelectTrigger className="h-8 w-[180px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Members</SelectItem>
                                    {familyMembers.map((m: any) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.name || 'Unnamed'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Task Series
                            </label>
                            <Select
                                value={filters.taskSeriesId || 'all'}
                                onValueChange={(v) =>
                                    setFilters((prev) => ({ ...prev, taskSeriesId: v }))
                                }
                            >
                                <SelectTrigger className="h-8 w-[200px] text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Series</SelectItem>
                                    {allSeries.map((s: any) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name || 'Untitled'}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* "Show noted" is only relevant in the Needs Attention view —
                            the All Tasks view shows everything regardless of noted status. */}
                        {view === 'attention' && (
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 text-xs text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={filters.showNoted || false}
                                        onChange={(e) =>
                                            setFilters((prev) => ({
                                                ...prev,
                                                showNoted: e.target.checked,
                                            }))
                                        }
                                        className="rounded border-slate-300"
                                    />
                                    Show noted tasks
                                </label>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Task list */}
            {visibleEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 px-6 py-16 text-center">
                    <div className="rounded-full bg-emerald-100 p-3">
                        <Check className="h-6 w-6 text-emerald-600" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-slate-700">
                        {view === 'attention' ? 'Nothing needs attention' : 'No tasks match filters'}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                        {view === 'attention'
                            ? 'All tasks are on track. Switch to "All Tasks" to see everything.'
                            : 'Try adjusting your filters to see more tasks.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {visibleEntries.map((entry) => {
                        // Resolve the owner name from the task series familyMember
                        const rawSeries = (entry.task as any)?.taskSeries;
                        const series = Array.isArray(rawSeries) ? rawSeries[0] : rawSeries;
                        const rawOwner = series?.familyMember;
                        const owner = Array.isArray(rawOwner) ? rawOwner[0] : rawOwner;
                        const ownerId = owner?.id;
                        const ownerMember = ownerId
                            ? familyMembers.find((m: any) => m.id === ownerId)
                            : null;
                        const resolvedOwnerName = (ownerMember as any)?.name || null;

                        return (
                            <TaskBinCard
                                key={entry.task.id}
                                entry={entry}
                                isExpanded={expandedTaskId === entry.task.id}
                                onToggleExpand={() =>
                                    setExpandedTaskId(
                                        expandedTaskId === entry.task.id ? null : entry.task.id
                                    )
                                }
                                gradeTypes={gradeTypes as any[]}
                                ownerName={resolvedOwnerName}
                                onUpdate={(submission) =>
                                    handleUpdateTask(entry.task.id, submission)
                                }
                                onNote={handleNote}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// TaskBinCard
// ---------------------------------------------------------------------------

interface TaskBinCardProps {
    entry: TaskBinEntry;
    isExpanded: boolean;
    onToggleExpand: () => void;
    gradeTypes: any[];
    /** Resolved name of the child/family member who owns the task series. */
    ownerName: string | null;
    onUpdate: (submission: TaskUpdatePanelSubmission) => Promise<void>;
    onNote: (taskId: string, mode: 'indefinite' | 'date' | 'clear', untilDate?: string) => Promise<void>;
}

const TaskBinCard: React.FC<TaskBinCardProps> = ({
    entry,
    isExpanded,
    onToggleExpand,
    gradeTypes,
    ownerName,
    onUpdate,
    onNote,
}) => {
    const { task, latestUpdate, seriesName, isNoted, lateness } = entry;
    const currentState = getTaskWorkflowState(task) as TaskWorkflowState;
    const actorName = latestUpdate ? getTaskUpdateActorName(latestUpdate) : null;
    const affectedName = latestUpdate ? getTaskUpdateAffectedName(latestUpdate) : null;
    const timestamp = latestUpdate?.createdAt ? formatTimestamp(latestUpdate.createdAt) : null;
    const hasGrade = latestUpdate?.gradeDisplayValue != null;

    return (
        <div
            className={cn(
                'overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md',
                isNoted ? 'border-slate-200 opacity-75' : 'border-slate-200'
            )}
        >
            {/* Card header */}
            <button
                type="button"
                onClick={onToggleExpand}
                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
            >
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span
                            className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                statusToneClassName[currentState]
                            )}
                        >
                            {getTaskStatusLabel(currentState)}
                        </span>
                        <span className="text-sm font-medium text-slate-900">
                            {task.text}
                        </span>
                        {isNoted && (
                            <span className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                <BellOff className="h-3 w-3" />
                                Noted
                            </span>
                        )}
                        {hasGrade && (
                            <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                                {latestUpdate?.gradeDisplayValue}
                            </span>
                        )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                        {seriesName && <span>{seriesName}</span>}
                        {actorName && <span>by {actorName}</span>}
                        {affectedName && actorName !== affectedName && (
                            <span>for {affectedName}</span>
                        )}
                        {timestamp && <span>{timestamp}</span>}
                    </div>
                    {latestUpdate?.note && (
                        <div className="mt-1.5 line-clamp-2 text-xs text-slate-600">
                            {latestUpdate.note}
                        </div>
                    )}
                    {latestUpdate?.attachments && latestUpdate.attachments.length > 0 && (
                        <div className="mt-1.5">
                            <AttachmentThumbnailRow
                                attachments={latestUpdate.attachments.map((a: any) => ({
                                    id: a.id || '',
                                    name: a.name || '',
                                    type: a.type || '',
                                    url: a.url || '',
                                    thumbnailUrl: a.thumbnailUrl || null,
                                    durationSec: a.durationSec || null,
                                    waveformPeaks: a.waveformPeaks || null,
                                }))}
                                size={32}
                                maxVisible={3}
                            />
                        </div>
                    )}
                </div>
                <div className="flex-shrink-0 pt-1">
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                </div>
            </button>

            {/* Expanded detail panel */}
            {isExpanded && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4">
                    <div className="space-y-5">
                        {/* Noted actions — only for overdue tasks or already-noted tasks */}
                        {(entry.isOverdue || isNoted) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {lateness && <TaskLatenessBadge lateness={lateness} />}
                                {isNoted ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => onNote(task.id, 'clear')}
                                        className="gap-1.5 text-xs"
                                    >
                                        <Bell className="h-3.5 w-3.5" />
                                        Un-note
                                    </Button>
                                ) : lateness ? (
                                    <NotedSplitButton
                                        onNote={(mode, untilDate) => onNote(task.id, mode, untilDate)}
                                    />
                                ) : null}
                                {!lateness && isNoted ? (
                                    <span className="text-xs text-slate-500">
                                        This task was previously noted.
                                    </span>
                                ) : null}
                            </div>
                        )}

                        {/* Update panel */}
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <TaskUpdatePanel
                                task={task as any}
                                variant="full"
                                canEdit={true}
                                gradeTypes={gradeTypes}
                                isParentReviewer={true}
                                ownerName={ownerName}
                                onSubmit={onUpdate}
                            />
                        </div>

                        {/* Update history */}
                        {task.updates && task.updates.length > 0 && (
                            <div>
                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                    History
                                </div>
                                <UpdateHistory
                                    updates={task.updates}
                                    limit={5}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// NotedSplitButton
// ---------------------------------------------------------------------------

interface NotedSplitButtonProps {
    onNote: (mode: 'indefinite' | 'date', untilDate?: string) => void;
}

const NotedSplitButton: React.FC<NotedSplitButtonProps> = ({ onNote }) => {
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

    const handleDefaultNote = () => {
        // "Noted" = note until next day
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        onNote('date', tomorrow.toISOString().slice(0, 10));
    };

    const handleDateSelect = (date: Date | undefined) => {
        if (!date) return;
        setSelectedDate(date);
        onNote('date', date.toISOString().slice(0, 10));
        setShowDatePicker(false);
    };

    return (
        <div className="flex">
            {/* Main button */}
            <Button
                variant="outline"
                size="sm"
                onClick={handleDefaultNote}
                className="gap-1.5 rounded-r-none border-r-0 text-xs"
            >
                <BellOff className="h-3.5 w-3.5" />
                Noted
            </Button>

            {/* Dropdown trigger */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-l-none border-l border-l-slate-200 px-1.5"
                    >
                        <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onNote('indefinite')}>
                        <BellOff className="mr-2 h-3.5 w-3.5" />
                        Note indefinitely
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={(e) => {
                            e.preventDefault();
                            setShowDatePicker(true);
                        }}
                    >
                        <CalendarClock className="mr-2 h-3.5 w-3.5" />
                        Note until date...
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Date picker popover */}
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
                <PopoverTrigger asChild>
                    <span />
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateSelect}
                        disabled={(date) => date < new Date()}
                        initialFocus
                    />
                </PopoverContent>
            </Popover>
        </div>
    );
};
