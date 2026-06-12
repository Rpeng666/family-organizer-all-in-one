import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { TaskUpdatePanel } from '@/components/task-updates/TaskUpdatePanel';
import { TaskResponseFeedbackThread } from '@/components/task-updates/TaskUpdateThread';
import { uploadSingleFileToS3 } from '@/lib/file-uploads';
import { Task } from '@/lib/task-scheduler';
import {
    getLatestTaskResponseThread,
    getLatestTaskUpdate,
    getTaskUpdateActorName,
    getTaskUpdateReplyToId,
    getTaskLastActiveState,
    getTaskStatusLabel,
    getTaskWorkflowState,
    taskUpdateHasMeaningfulFeedbackContent,
    type TaskBucketState,
    type TaskWorkflowState,
} from '@/lib/task-progress';
import type { TaskChecklistUpdateInput } from '@/components/TaskSeriesChecklist';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const statusToneClassName: Record<TaskWorkflowState, string> = {
    not_started: 'bg-slate-100 text-slate-700 border-slate-200',
    in_progress: 'bg-amber-100 text-amber-800 border-amber-200',
    blocked: 'bg-rose-100 text-rose-700 border-rose-200',
    skipped: 'bg-zinc-100 text-zinc-700 border-zinc-200',
    needs_review: 'bg-violet-100 text-violet-700 border-violet-200',
    done: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const getResponseThreadLabel = (feedbackReplies: unknown[] | null | undefined) => {
    return feedbackReplies && feedbackReplies.length > 0 ? 'Latest reviewed response' : 'Latest response';
};

const formatDateTimeLabel = (value: number | string | Date | null | undefined) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TaskBucketRowProps {
    task: Task;
    state: TaskBucketState;
    isReadOnly?: boolean;
    canWriteTaskProgress?: boolean;
    effectiveMemberId: string | null;
    isParentReviewer?: boolean;
    onOpenComposer: (task: Task, intent?: 'details' | 'update') => void;
    onToggle: (taskId: string, currentStatus: boolean) => void;
    onTaskUpdate?: (taskId: string, input: TaskChecklistUpdateInput) => Promise<void> | void;
    onRequireTaskAuth?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const TaskBucketRow: React.FC<TaskBucketRowProps> = ({
    task,
    state,
    isReadOnly,
    canWriteTaskProgress,
    effectiveMemberId,
    isParentReviewer,
    onOpenComposer,
    onToggle,
    onTaskUpdate,
    onRequireTaskAuth,
}) => {
    const handleResponseFileUpload = async (_fieldId: string, file: File) =>
        uploadSingleFileToS3(file);

    const latestEntry = getLatestTaskUpdate(task);
    const latestResponseThread = getLatestTaskResponseThread(task);
    const latestEntryIsThreadedFeedback =
        Boolean(latestEntry && getTaskUpdateReplyToId(latestEntry)) &&
        taskUpdateHasMeaningfulFeedbackContent(latestEntry);
    const actorName = getTaskUpdateActorName(latestEntry);
    const createdAt = formatDateTimeLabel(latestEntry?.createdAt);

    // Resolve a has-one link that may arrive as a single object or 1-element array
    const resolveField = (field: any): { id?: string; label?: string | null } | null => {
        if (!field) return null;
        if (Array.isArray(field)) return field[0] ?? null;
        return field;
    };

    // Check which response fields have meaningful submitted values
    const submittedFieldIds = new Set(
        (latestEntry?.responseFieldValues || [])
            .filter((rfv) => (rfv.richTextContent && rfv.richTextContent !== '<p></p>') || rfv.fileUrl)
            .map((rfv) => resolveField(rfv.field)?.id)
            .filter(Boolean),
    );
    const hasSubmittedResponse = submittedFieldIds.size > 0;
    const allFieldsSubmitted =
        hasSubmittedResponse &&
        (task.responseFields || []).every((f) => submittedFieldIds.has(f.id));

    // Response field values summary (read-only)
    const renderResponseSummary = (rfvs: typeof latestEntry.responseFieldValues) => (
        <div className="mt-2 space-y-1.5">
            {rfvs?.map((rfv, i) => {
                const resolved = resolveField(rfv.field);
                const fieldLabel = resolved?.label || '';
                const isGenericLabel = fieldLabel.toLowerCase().replace(/[\s_-]+/g, '') === 'richtext';
                if (!rfv.richTextContent && !rfv.fileUrl) return null;
                if (rfv.richTextContent === '<p></p>') return null;
                return (
                    <div key={rfv.id || i} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                        {fieldLabel && !isGenericLabel ? (
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                {fieldLabel}
                            </div>
                        ) : null}
                        {rfv.richTextContent && rfv.richTextContent !== '<p></p>' ? (
                            <div
                                className="prose prose-sm mt-1 max-w-none text-xs text-slate-700"
                                dangerouslySetInnerHTML={{ __html: rfv.richTextContent }}
                            />
                        ) : null}
                        {rfv.fileUrl ? (
                            <div className="mt-1.5">
                                <AttachmentCollection
                                    attachments={[
                                        {
                                            id: rfv.id || `rfv-${i}`,
                                            name: rfv.fileName || 'File',
                                            type: rfv.fileType || '',
                                            url: rfv.fileUrl,
                                        },
                                    ]}
                                    variant="compact"
                                />
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="rounded-lg border border-slate-200 bg-white/80 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onOpenComposer(task, 'details')}
                            className="text-left text-sm font-medium text-slate-900 transition-colors hover:text-sky-700 hover:underline"
                        >
                            {task.text}
                        </button>
                        <span
                            className={cn(
                                'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                                statusToneClassName[state],
                            )}
                        >
                            {getTaskStatusLabel(state)}
                        </span>
                    </div>

                    {/* Update metadata — above response content */}
                    {!latestEntryIsThreadedFeedback ? (
                        <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-slate-500">
                            {actorName ? <span>Latest by {actorName}</span> : null}
                            {createdAt ? <span>{createdAt}</span> : null}
                        </div>
                    ) : null}

                    {latestResponseThread ? (
                        <TaskResponseFeedbackThread
                            submission={latestResponseThread.submission}
                            feedbackReplies={latestResponseThread.feedbackReplies}
                            className="mt-3"
                            label={getResponseThreadLabel(latestResponseThread.feedbackReplies)}
                            tone="indigo"
                        />
                    ) : null}

                    {/* Response fields: read-only summary when all submitted,
                        inline editor (pre-populated) when some are missing */}
                    {task.responseFields && task.responseFields.length > 0 ? (
                        allFieldsSubmitted && !latestResponseThread ? (
                            // All response fields answered — read-only summary
                            renderResponseSummary(latestEntry?.responseFieldValues)
                        ) : effectiveMemberId && (state === 'blocked' || state === 'skipped') ? (
                            // Some fields unanswered — inline editor pre-populated from latest update
                            <div className="mt-2">
                                <TaskUpdatePanel
                                    task={task}
                                    variant="inline"
                                    canEdit={canWriteTaskProgress}
                                    disabled={isReadOnly}
                                    onFileUpload={handleResponseFileUpload}
                                    onRequireAuth={onRequireTaskAuth}
                                    onSubmit={
                                        !isReadOnly
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
                        ) : hasSubmittedResponse && !latestResponseThread ? (
                            // Partial responses exist — show what we have
                            renderResponseSummary(latestEntry?.responseFieldValues)
                        ) : null
                    ) : null}

                    {!latestEntryIsThreadedFeedback && latestEntry?.note ? (
                        <div className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{latestEntry.note}</div>
                    ) : null}
                    {!latestEntryIsThreadedFeedback && latestEntry?.attachments?.length ? (
                        <AttachmentCollection
                            attachments={latestEntry.attachments}
                            className="mt-2"
                            variant="compact"
                        />
                    ) : null}
                </div>

                {!isReadOnly ? (
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenComposer(task, 'details')}
                        >
                            Details
                        </Button>
                        {state === 'done' ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onToggle(task.id, true)}
                            >
                                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                                Undo
                            </Button>
                        ) : null}
                        {state !== 'done' ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                    onOpenComposer(task, 'update')
                                }
                            >
                                Restore
                            </Button>
                        ) : null}
                        {state === 'needs_review' && isParentReviewer ? (
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => onToggle(task.id, false)}
                            >
                                Approve as Done
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
};
