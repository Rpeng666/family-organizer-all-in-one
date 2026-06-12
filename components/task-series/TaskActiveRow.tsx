import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ClipboardList } from 'lucide-react';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { AttachmentThumbnailRow } from '@/components/attachments/AttachmentThumbnail';
import { TaskUpdatePanel } from '@/components/task-updates/TaskUpdatePanel';
import { TaskResponseFeedbackThread } from '@/components/task-updates/TaskUpdateThread';
import { uploadSingleFileToS3 } from '@/lib/file-uploads';
import { Task } from '@/lib/task-scheduler';
import {
    getTaskChildProgressPercent,
    getLatestTaskResponseThread,
    getLatestTaskUpdate,
    getTaskUpdateActorName,
    getTaskUpdateReplyToId,
    getTaskStatusLabel,
    getTaskWorkflowState,
    isTaskDone,
    taskUpdateHasMeaningfulFeedbackContent,
    type TaskWorkflowState,
} from '@/lib/task-progress';
import type { TaskChecklistUpdateInput } from '@/components/TaskSeriesChecklist';

// ---------------------------------------------------------------------------
// Local helpers (mirrors of the private helpers in TaskSeriesChecklist)
// ---------------------------------------------------------------------------

const statusToneClassName: Record<TaskWorkflowState, string> = {
    not_started: 'bg-slate-100 text-slate-700 border-slate-200',
    in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
    blocked: 'bg-rose-100 text-rose-700 border-rose-200',
    skipped: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    needs_review: 'bg-violet-100 text-violet-700 border-violet-200',
    done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const getParentId = (task: Task): string | undefined => {
    if (!task.parentTask) return undefined;
    if (Array.isArray(task.parentTask)) {
        return task.parentTask[0]?.id;
    }
    return (task.parentTask as any).id;
};

const hasScheduledChildren = (parentId: string, scheduledIds: Set<string>, allTasks: Task[]) => {
    return allTasks.some((t) => {
        const pId = getParentId(t);
        return pId === parentId && scheduledIds.has(t.id);
    });
};

const getTaskLineage = (task: Task, allTasks: Task[]) => {
    const lineage: Task[] = [];
    let parentId = getParentId(task);
    let depth = 0;

    while (parentId && depth < 10) {
        const parent = allTasks.find((candidate) => candidate.id === parentId);
        if (!parent) break;
        lineage.unshift(parent);
        parentId = getParentId(parent);
        depth += 1;
    }

    return lineage;
};

const getTaskContextMeta = (task: Task, allTasks: Task[]) => {
    const lineage = getTaskLineage(task, allTasks);
    const immediateParent = lineage[lineage.length - 1] || null;
    let subtitle: string | null = null;

    if (immediateParent) {
        const siblings = allTasks
            .filter((candidate) => getParentId(candidate) === immediateParent.id && !candidate.isDayBreak)
            .sort((left, right) => (left.order || 0) - (right.order || 0));
        const index = siblings.findIndex((candidate) => candidate.id === task.id) + 1;
        if (index > 0) {
            subtitle = `Task ${index} of ${siblings.length}`;
        }
    }

    return {
        subtitle,
        immediateParentLabel: immediateParent?.text || '',
        breadcrumbLabel: lineage.map((candidate) => candidate.text).join(' / '),
    };
};

const getResponseThreadLabel = (feedbackReplies: unknown[] | null | undefined) => {
    return feedbackReplies && feedbackReplies.length > 0 ? 'Latest reviewed response' : 'Latest response';
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TaskActiveRowProps {
    task: Task;
    allTasks: Task[];
    scheduledIds: Set<string>;
    showDetails: boolean;
    localExpandedIds: Set<string>;
    onToggleLocalExpand: (taskId: string) => void;
    isReadOnly?: boolean;
    canWriteTaskProgress?: boolean;
    effectiveMemberId: string | null;
    onOpenComposer: (task: Task, intent?: 'details' | 'update') => void;
    onToggle: (taskId: string, currentStatus: boolean) => void;
    onTaskUpdate?: (taskId: string, input: TaskChecklistUpdateInput) => Promise<void> | void;
    onRequireTaskAuth?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TaskActiveRow: React.FC<TaskActiveRowProps> = ({
    task,
    allTasks,
    scheduledIds,
    showDetails,
    localExpandedIds,
    onToggleLocalExpand,
    isReadOnly,
    canWriteTaskProgress,
    effectiveMemberId,
    onOpenComposer,
    onToggle,
    onTaskUpdate,
    onRequireTaskAuth,
}) => {
    const handleResponseFileUpload = async (_fieldId: string, file: File) =>
        uploadSingleFileToS3(file);

    // -----------------------------------------------------------------------
    // Sub-renderers (inlined from TaskSeriesChecklist)
    // -----------------------------------------------------------------------

    const renderReferenceDetails = (t: Task) => {
        const hasNotes = !!t.notes?.trim();
        const attachments = (t as any).attachments || [];
        const hasAttachments = attachments.length > 0;
        const hasMetadata = hasNotes || hasAttachments;
        const isDetailsVisible = showDetails || localExpandedIds.has(t.id);

        if (!hasMetadata) return null;

        return (
            <>
                {!showDetails && (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleLocalExpand(t.id);
                        }}
                        className="mt-1 w-fit text-[10px] font-medium text-blue-600 hover:underline"
                    >
                        {localExpandedIds.has(t.id) ? 'hide task details' : 'view task details'}
                    </button>
                )}
                {isDetailsVisible ? (
                    <div className="mt-2 rounded-md border border-blue-100 bg-blue-50/50 p-2 text-sm">
                        {hasNotes ? (
                            <div className="mb-2 whitespace-pre-wrap text-xs text-gray-700">{t.notes}</div>
                        ) : null}
                        {hasAttachments ? (
                            <AttachmentCollection attachments={attachments} variant="compact" />
                        ) : null}
                    </div>
                ) : null}
            </>
        );
    };

    const renderResponseFieldBadge = (t: Task) => {
        const fields = t.responseFields;
        if (!fields || fields.length === 0) return null;

        const updates = t.updates || [];
        const nonDraftUpdates = updates.filter((u) => !u.isDraft);
        const hasDraftUpdate = updates.some((u) => u.isDraft);
        const hasGrade = nonDraftUpdates.some((u) => u.gradeDisplayValue && !u.gradeIsProvisional);
        const taskState = getTaskWorkflowState(t);
        const requiredCount = fields.filter((f) => f.required).length;

        let label: string;
        let badgeClass: string;

        if (hasGrade && taskState === 'done') {
            label = 'Graded';
            badgeClass = 'border-emerald-200 bg-emerald-50 text-emerald-700';
        } else if (taskState === 'needs_review') {
            label = 'Needs review';
            badgeClass = 'border-amber-200 bg-amber-50 text-amber-700';
        } else if (
            taskState === 'in_progress' &&
            nonDraftUpdates.some((u) => u.toState === 'in_progress' && u.fromState === 'needs_review')
        ) {
            label = 'Revision requested';
            badgeClass = 'border-rose-200 bg-rose-50 text-rose-700';
        } else if (hasDraftUpdate) {
            label = 'Draft response';
            badgeClass = 'border-slate-200 bg-slate-50 text-slate-600';
        } else {
            label = requiredCount > 0 ? 'Response required' : 'Response available';
            badgeClass =
                requiredCount > 0
                    ? 'border-purple-200 bg-purple-50 text-purple-700'
                    : 'border-purple-100 bg-purple-50/50 text-purple-600';
        }

        return (
            <button
                type="button"
                onClick={() => onOpenComposer(t, 'details')}
                className={cn(
                    'mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors hover:opacity-80',
                    badgeClass,
                )}
            >
                <ClipboardList className="h-3 w-3" />
                {label}
            </button>
        );
    };

    const renderProgressMeta = (t: Task) => {
        const latestEntry = getLatestTaskUpdate(t);
        if (!latestEntry) return null;
        const latestEntryIsThreadedFeedback =
            Boolean(getTaskUpdateReplyToId(latestEntry)) &&
            taskUpdateHasMeaningfulFeedbackContent(latestEntry);
        if (latestEntryIsThreadedFeedback) return null;

        const actorName = getTaskUpdateActorName(latestEntry);
        const createdAt = latestEntry.createdAt ? new Date(latestEntry.createdAt).toLocaleString() : null;

        return (
            <div className="mt-2 rounded-md border border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-600">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                        className={cn(
                            'rounded-full border px-2 py-0.5 font-semibold',
                            statusToneClassName[getTaskWorkflowState(t)],
                        )}
                    >
                        {getTaskStatusLabel(getTaskWorkflowState(t))}
                    </span>
                    {actorName ? <span>by {actorName}</span> : null}
                    {createdAt ? <span>{createdAt}</span> : null}
                </div>
                {latestEntry.note ? (
                    <div className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{latestEntry.note}</div>
                ) : null}
                {latestEntry.attachments && latestEntry.attachments.length > 0 && (
                    <div className="mt-1.5">
                        <AttachmentThumbnailRow
                            attachments={latestEntry.attachments.map((a: any) => ({
                                id: a.id || '',
                                name: a.name || '',
                                type: a.type || '',
                                url: a.url || '',
                                thumbnailUrl: a.thumbnailUrl || null,
                                durationSec: a.durationSec || null,
                                waveformPeaks: a.waveformPeaks || null,
                            }))}
                            size={36}
                            maxVisible={3}
                        />
                    </div>
                )}
            </div>
        );
    };

    const renderLatestResponseThread = (t: Task, className?: string) => {
        const thread = getLatestTaskResponseThread(t);
        if (!thread) return null;

        return (
            <TaskResponseFeedbackThread
                submission={thread.submission}
                feedbackReplies={thread.feedbackReplies}
                className={className}
                label={getResponseThreadLabel(thread.feedbackReplies)}
                tone="indigo"
            />
        );
    };

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    const isHeader = hasScheduledChildren(task.id, scheduledIds, allTasks) || !scheduledIds.has(task.id);
    const currentState = getTaskWorkflowState(task);
    const canMutate = !isReadOnly;
    const { subtitle, immediateParentLabel } = getTaskContextMeta(task, allTasks);
    const childProgressPercent = isHeader ? getTaskChildProgressPercent(task.id, allTasks) : null;

    if (isHeader) {
        return (
            <div
                className="relative my-1 mt-4 flex items-start pr-2"
                style={{ marginLeft: `${(task.indentationLevel || 0) * 1.5}rem` }}
            >
                <div className="flex min-w-0 flex-grow flex-col">
                    <div className="flex min-w-0 items-center gap-2 px-1">
                        <button
                            type="button"
                            onClick={() => onOpenComposer(task, 'details')}
                            className="min-w-0 text-left text-xs font-bold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:text-sky-700 hover:underline"
                        >
                            {task.text}
                        </button>
                        {typeof childProgressPercent === 'number' ? (
                            <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-sky-700">
                                {childProgressPercent}% complete
                            </span>
                        ) : null}
                    </div>
                    {renderResponseFieldBadge(task)}
                    {renderReferenceDetails(task)}
                </div>
            </div>
        );
    }

    return (
        <div
            className="group relative my-1 flex items-start pr-2"
            style={{ marginLeft: `${(task.indentationLevel || 0) * 1.5}rem` }}
        >
            <div className="flex min-w-0 flex-grow flex-col rounded-lg border border-slate-200 bg-white/80 p-3">
                <div className="flex items-start gap-3">
                    <Checkbox
                        id={`task-${task.id}`}
                        checked={false}
                        disabled={!canMutate}
                        onCheckedChange={() => onToggle(task.id, isTaskDone(task))}
                        className="mt-0.5 h-4 w-4 border-muted-foreground/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    />
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => onOpenComposer(task, 'details')}
                                className="text-left text-sm leading-tight text-foreground transition-colors hover:text-sky-700 hover:underline"
                            >
                                {task.text}
                            </button>
                            <span
                                className={cn(
                                    'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                    statusToneClassName[currentState],
                                )}
                            >
                                {getTaskStatusLabel(currentState)}
                            </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                            {subtitle ? <span>{subtitle}</span> : null}
                            {immediateParentLabel ? (
                                <span>{subtitle ? `in ${immediateParentLabel}` : immediateParentLabel}</span>
                            ) : null}
                        </div>
                        {renderReferenceDetails(task)}
                        {renderProgressMeta(task)}
                        {renderLatestResponseThread(task, 'mt-3')}
                    </div>
                </div>

                {/* Inline response fields — shown directly in the card */}
                {task.responseFields && task.responseFields.length > 0 && effectiveMemberId ? (
                    <div className="mt-3">
                        <TaskUpdatePanel
                            task={task}
                            variant="inline"
                            canEdit={canWriteTaskProgress}
                            disabled={!canMutate}
                            onRequireAuth={onRequireTaskAuth}
                            onFileUpload={handleResponseFileUpload}
                            onSubmit={
                                canMutate
                                    ? async (submission) => {
                                          await onTaskUpdate?.(task.id, {
                                              nextState: submission.nextState,
                                              note: submission.note,
                                              responseFieldValues: submission.responseFieldValues,
                                          });
                                      }
                                    : undefined
                            }
                        />
                    </div>
                ) : task.responseFields && task.responseFields.length > 0 && !effectiveMemberId ? (
                    renderResponseFieldBadge(task)
                ) : null}

                {/* Action buttons — only for tasks WITHOUT inline response fields */}
                {canMutate && !(task.responseFields && task.responseFields.length > 0 && effectiveMemberId) ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                        {currentState === 'not_started' ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    if (!canWriteTaskProgress) {
                                        onRequireTaskAuth?.();
                                        return;
                                    }
                                    onTaskUpdate?.(task.id, { nextState: 'in_progress' });
                                }}
                            >
                                Start
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenComposer(task, 'details')}
                        >
                            Details
                        </Button>
                        <Button type="button" size="sm" onClick={() => onToggle(task.id, false)}>
                            Done
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
};
