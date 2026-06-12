import React, { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { AttachmentThumbnailRow } from '@/components/attachments/AttachmentThumbnail';
import { TaskUpdatePanel } from '@/components/task-updates/TaskUpdatePanel';
import { UpdateHistory } from '@/components/task-updates/UpdateHistory';
import { TaskResponseFeedbackThread } from '@/components/task-updates/TaskUpdateThread';
import { FocusOverlay } from '@/components/responses/FocusOverlay';
import type { FocusPanelItem, FocusPanelState, FocusableItem } from '@/components/responses/focus-panel-types';
import type { GradeTypeLike } from '@/lib/task-response-types';
import type { ResponseFieldValueInput } from '@/lib/task-update-mutations';
import { uploadSingleFileToS3 } from '@/lib/file-uploads';
import {
    getLatestTaskResponseThread,
    getLatestTaskUpdate,
    getTaskUpdateActorName,
    getTaskLastActiveState,
    getTaskStatusLabel,
    getTaskWorkflowState,
    isActionableTask,
    sortTaskUpdates,
    type TaskRestoreTiming,
    type TaskWorkflowState,
} from '@/lib/task-progress';
import { cn } from '@/lib/utils';
import type { Task } from '@/lib/task-scheduler';
import type { TaskChecklistUpdateInput } from '@/components/TaskSeriesChecklist';

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
    if (Array.isArray(task.parentTask)) return task.parentTask[0]?.id;
    return (task.parentTask as any).id;
};

const getTaskLineage = (task: Task, allTasks: Task[]) => {
    const lineage: Task[] = [];
    let parentId = getParentId(task);
    let depth = 0;
    while (parentId && depth < 10) {
        const parent = allTasks.find((t) => t.id === parentId);
        if (!parent) break;
        lineage.unshift(parent);
        parentId = getParentId(parent);
        depth++;
    }
    return lineage;
};

const getTaskContextMeta = (task: Task, allTasks: Task[]) => {
    const lineage = getTaskLineage(task, allTasks);
    const immediateParent = lineage[lineage.length - 1] || null;
    let subtitle: string | null = null;
    if (immediateParent) {
        const siblings = allTasks
            .filter((t) => getParentId(t) === immediateParent.id && !t.isDayBreak)
            .sort((a, b) => (a.order || 0) - (b.order || 0));
        const index = siblings.findIndex((t) => t.id === task.id) + 1;
        if (index > 0) subtitle = `Task ${index} of ${siblings.length}`;
    }
    return {
        subtitle,
        immediateParentLabel: immediateParent?.text || '',
        breadcrumbLabel: lineage.map((t) => t.text).join(' / '),
    };
};

const formatDateTimeLabel = (value: number | string | Date | null | undefined) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
};

const formatDateKeyLabel = (value: string | null | undefined) => {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};

interface TaskDetailDialogProps {
    composerTask: Task | null;
    allTasks: Task[];
    isReadOnly?: boolean;
    canWriteTaskProgress?: boolean;
    isParentReviewer?: boolean;
    effectiveMemberId?: string | null;
    detailContext?: {
        choreTitle?: string;
        seriesName?: string;
        ownerName?: string;
        selectedDateLabel?: string;
    };
    gradeTypes?: GradeTypeLike[];
    onClose: () => void;
    onToggle: (taskId: string, currentStatus: boolean) => void;
    onTaskUpdate?: (taskId: string, input: TaskChecklistUpdateInput) => Promise<void> | void;
    onRequireTaskAuth?: () => void;
}

export function TaskDetailDialog({
    composerTask,
    allTasks,
    isReadOnly,
    canWriteTaskProgress = true,
    isParentReviewer = false,
    effectiveMemberId,
    detailContext,
    gradeTypes = [],
    onClose,
    onToggle,
    onTaskUpdate,
    onRequireTaskAuth,
}: TaskDetailDialogProps) {
    const [composerFiles, setComposerFiles] = useState<File[]>([]);
    const [composerRestoreTiming, setComposerRestoreTiming] = useState<TaskRestoreTiming | null>(null);
    const [isSubmittingComposer, setIsSubmittingComposer] = useState(false);
    const [focusPanelState, setFocusPanelState] = useState<FocusPanelState>({ mode: 'closed' });

    const handleResponseFileUpload = useCallback(async (_fieldId: string, file: File) => uploadSingleFileToS3(file), []);

    const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
        setComposerFiles((prev) => [...prev, ...Array.from(e.target.files || [])]);
        e.target.value = '';
    };

    const handleRemovePendingFile = (index: number) => {
        setComposerFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const closeComposer = () => {
        if (isSubmittingComposer) return;
        setComposerFiles([]);
        setComposerRestoreTiming(null);
        setFocusPanelState({ mode: 'closed' });
        onClose();
    };

    const composerTaskMeta = composerTask ? getTaskContextMeta(composerTask, allTasks) : null;
    const composerTaskAttachments = composerTask ? ((composerTask as any).attachments || []) : [];
    const composerLatestEntry = composerTask ? getLatestTaskUpdate(composerTask) : null;
    const composerHistoryEntries = composerTask ? sortTaskUpdates((composerTask.updates || []).filter((e) => !e.isDraft)) : [];
    const composerTaskCurrentState = composerTask ? getTaskWorkflowState(composerTask) : null;
    const composerTaskIsActionable = composerTask ? isActionableTask(composerTask, allTasks) : false;
    const canRestoreFromComposer =
        composerTaskCurrentState === 'blocked' ||
        composerTaskCurrentState === 'skipped' ||
        composerTaskCurrentState === 'needs_review';
    const restoreTargetState = composerTask ? getTaskLastActiveState(composerTask) : null;
    const composerLatestActorName = getTaskUpdateActorName(composerLatestEntry);
    const composerLatestCreatedAt = formatDateTimeLabel(composerLatestEntry?.createdAt);
    const composerScheduledForDate = formatDateKeyLabel(composerLatestEntry?.scheduledForDate || composerTask?.completedOnDate || null);
    const composerDeferredUntilDate = formatDateKeyLabel(composerTask?.deferredUntilDate || null);
    const composerCompletedOnDate = formatDateKeyLabel(composerTask?.completedOnDate || null);
    const composerHistoryCountLabel = `${composerHistoryEntries.length} update${composerHistoryEntries.length === 1 ? '' : 's'}`;
    const composerCurrentStateLabel = composerTaskCurrentState ? getTaskStatusLabel(composerTaskCurrentState) : null;
    const composerTaskSpecificTime = composerTask?.specificTime || null;
    const composerTaskHasReferenceContent =
        Boolean(composerTask?.notes?.trim()) || composerTaskAttachments.length > 0 || Boolean(composerTaskSpecificTime);
    const composerUpdateUnavailableReason = !composerTaskIsActionable
        ? 'This is a parent/header task. Update the child tasks below it instead.'
        : isReadOnly
          ? 'This date is read-only, so progress updates are disabled here.'
          : !canWriteTaskProgress
            ? 'Sign in as a family member to save updates, notes, or evidence.'
            : !onTaskUpdate
              ? 'Task updates are unavailable in this view.'
              : null;

    // Focus panel handlers
    const focusAvailableItems: FocusableItem[] = useMemo(() => {
        if (!composerTask) return [];
        const items: FocusableItem[] = [];
        const fields = (composerTask as any).responseFields as Array<{ id: string; type: string; label: string }> | undefined;
        if (fields) {
            for (const f of fields) {
                items.push({ kind: f.type === 'rich_text' ? 'rich_text' : 'attachment', id: f.id, label: f.label });
            }
        }
        for (const att of composerTaskAttachments) {
            items.push({ kind: 'attachment', id: att.id || att.url, label: att.name || 'Attachment', thumbnailUrl: att.thumbnailUrl });
        }
        if (composerTask.notes?.trim()) {
            items.push({ kind: 'notes', id: 'task-notes', label: 'Task Notes' });
        }
        return items;
    }, [composerTask, composerTaskAttachments]);

    const buildFocusItemForField = useCallback(
        (fieldId: string): FocusPanelItem | null => {
            if (!composerTask) return null;
            const fields = (composerTask as any).responseFields as Array<{ id: string; type: string; label: string }> | undefined;
            const field = fields?.find((f) => f.id === fieldId);
            if (!field) return null;
            if (field.type === 'rich_text') {
                const updates = (composerTask as any).updates as Array<{ isDraft?: boolean; responseFieldValues?: Array<{ field?: Array<{ id: string }>; richTextContent?: string | null }> }> | undefined;
                const draft = updates?.find((u) => u.isDraft);
                const fv = draft?.responseFieldValues?.find((v) => {
                    const f = v.field;
                    const resolved = Array.isArray(f) ? f[0] : f;
                    return resolved?.id === fieldId;
                });
                return { kind: 'rich_text', fieldId, label: field.label, taskId: composerTask.id, content: fv?.richTextContent || '', onContentChange: () => {} };
            }
            return null;
        },
        [composerTask]
    );

    const buildFocusItemFromPickerItem = useCallback(
        (pickerItem: FocusableItem): FocusPanelItem | null => {
            if (!composerTask) return null;
            if (pickerItem.kind === 'rich_text') return buildFocusItemForField(pickerItem.id);
            if (pickerItem.kind === 'attachment') {
                const att = composerTaskAttachments.find((a: any) => (a.id || a.url) === pickerItem.id);
                if (att) return { kind: 'attachment', url: att.url, name: att.name || 'Attachment', type: att.type || 'application/octet-stream', label: pickerItem.label };
                return null;
            }
            if (pickerItem.kind === 'notes') return { kind: 'notes', text: composerTask.notes || '', label: 'Task Notes' };
            return null;
        },
        [composerTask, composerTaskAttachments, buildFocusItemForField]
    );

    const splitPickerItems = useMemo(() => {
        if (focusPanelState.mode !== 'split') return focusAvailableItems;
        const leftId = focusPanelState.left.kind === 'rich_text' ? focusPanelState.left.fieldId
            : focusPanelState.left.kind === 'attachment' ? focusPanelState.left.url
            : 'task-notes';
        return focusAvailableItems.filter((item) => item.id !== leftId);
    }, [focusPanelState, focusAvailableItems]);

    const handleFocusClose = useCallback(() => setFocusPanelState({ mode: 'closed' }), []);

    const handleEnterSplit = useCallback(() => {
        setFocusPanelState((prev) => prev.mode === 'focus' ? { mode: 'split', left: prev.item, right: null } : prev);
    }, []);

    const handleSwapPanels = useCallback(() => {
        setFocusPanelState((prev) => prev.mode === 'split' && prev.right ? { mode: 'split', left: prev.right, right: prev.left } : prev);
    }, []);

    const handleCloseSplitPanel = useCallback((side: 'left' | 'right') => {
        setFocusPanelState((prev) => {
            if (prev.mode !== 'split') return prev;
            const remaining = side === 'left' ? prev.right : prev.left;
            return remaining ? { mode: 'focus', item: remaining } : { mode: 'closed' };
        });
    }, []);

    const handlePickSplitItem = useCallback(
        (pickerItem: FocusableItem) => {
            const item = buildFocusItemFromPickerItem(pickerItem);
            if (!item) return;
            setFocusPanelState((prev) => prev.mode === 'split' ? { mode: 'split', left: prev.left, right: item } : prev);
        },
        [buildFocusItemFromPickerItem]
    );

    if (!composerTask) return null;

    return (
        <>
            <Dialog open={true} onOpenChange={(open) => !open && closeComposer()}>
                <DialogContent className="max-w-5xl p-0">
                    <div className="flex max-h-[85vh] flex-col">
                        <DialogHeader className="border-b border-slate-200 bg-gradient-to-br from-slate-50 via-white to-sky-50 px-6 py-5">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                <div className="space-y-3">
                                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Task Details</div>
                                    <div className="space-y-2">
                                        <DialogTitle className="text-2xl leading-tight text-slate-900">{composerTask.text}</DialogTitle>
                                        <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                                            {detailContext?.choreTitle && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Chore: {detailContext.choreTitle}</span>}
                                            {detailContext?.seriesName && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Series: {detailContext.seriesName}</span>}
                                            {detailContext?.ownerName && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Owner: {detailContext.ownerName}</span>}
                                            {detailContext?.selectedDateLabel && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">For {detailContext.selectedDateLabel}</span>}
                                            {composerTaskMeta?.subtitle && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{composerTaskMeta.subtitle}</span>}
                                            {composerTaskMeta?.breadcrumbLabel && <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">In {composerTaskMeta.breadcrumbLabel}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 xl:max-w-[320px] xl:justify-end">
                                    {composerCurrentStateLabel && (
                                        <span className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', statusToneClassName[composerTaskCurrentState as TaskWorkflowState])}>
                                            {composerCurrentStateLabel}
                                        </span>
                                    )}
                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600">{composerHistoryCountLabel}</span>
                                    {composerTaskAttachments.length > 0 && (
                                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600">
                                            {composerTaskAttachments.length} file{composerTaskAttachments.length === 1 ? '' : 's'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto px-6 py-5">
                            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                                <div className="space-y-5">
                                    {/* Overview */}
                                    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="text-sm font-semibold text-slate-900">Overview</h3>
                                            <span className="text-xs text-slate-500">{composerLatestCreatedAt ? `Latest update ${composerLatestCreatedAt}` : 'No progress updates yet'}</span>
                                        </div>
                                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Current State</div>
                                                <div className="mt-2 text-sm font-medium text-slate-900">{composerCurrentStateLabel || 'Not started'}</div>
                                                {composerLatestActorName && <div className="mt-1 text-xs text-slate-500">Latest by {composerLatestActorName}</div>}
                                            </div>
                                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Schedule</div>
                                                <div className="mt-2 text-sm font-medium text-slate-900">{composerScheduledForDate || detailContext?.selectedDateLabel || 'Active now'}</div>
                                                {composerDeferredUntilDate ? <div className="mt-1 text-xs text-slate-500">Deferred until {composerDeferredUntilDate}</div>
                                                    : composerCompletedOnDate ? <div className="mt-1 text-xs text-slate-500">Completed on {composerCompletedOnDate}</div>
                                                    : null}
                                            </div>
                                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Timing</div>
                                                <div className="mt-2 text-sm font-medium text-slate-900">{composerTaskSpecificTime || 'No specific time'}</div>
                                                {composerTask?.overrideWorkAhead && <div className="mt-1 text-xs text-slate-500">Work-ahead override enabled</div>}
                                            </div>
                                            <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Structure</div>
                                                <div className="mt-2 text-sm font-medium text-slate-900">
                                                    {composerTaskMeta?.breadcrumbLabel ? `In ${composerTaskMeta.breadcrumbLabel}` : 'Top-level task'}
                                                </div>
                                                {composerTaskMeta?.subtitle && <div className="mt-1 text-xs text-slate-500">{composerTaskMeta.subtitle}</div>}
                                            </div>
                                        </div>
                                    </section>

                                    {/* Reference Details */}
                                    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="text-sm font-semibold text-slate-900">Reference Details</h3>
                                            <span className="text-xs text-slate-500">{composerTaskHasReferenceContent ? 'Instructions and supporting files' : 'No saved instructions yet'}</span>
                                        </div>
                                        {composerTaskHasReferenceContent ? (
                                            <div className="mt-4 space-y-4">
                                                {composerTask?.notes?.trim() && (
                                                    <div>
                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</div>
                                                        <div className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm text-slate-700">{composerTask.notes}</div>
                                                    </div>
                                                )}
                                                {composerTaskAttachments.length > 0 && (
                                                    <div>
                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Attachments</div>
                                                        <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                                                            <AttachmentCollection attachments={composerTaskAttachments} variant="compact" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-500">
                                                This task does not have saved notes or reference files yet.
                                            </div>
                                        )}
                                    </section>

                                    {/* Latest Activity */}
                                    {composerLatestEntry && (
                                        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <h3 className="text-sm font-semibold text-slate-900">Latest Activity</h3>
                                                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                                                    {composerLatestActorName && <span>by {composerLatestActorName}</span>}
                                                    {composerLatestCreatedAt && <span>{composerLatestCreatedAt}</span>}
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                                                <span className={cn('rounded-full border px-2 py-0.5 font-semibold', statusToneClassName[getTaskWorkflowState(composerTask)])}>
                                                    {getTaskStatusLabel(getTaskWorkflowState(composerTask))}
                                                </span>
                                            </div>
                                            {composerLatestEntry.note && (
                                                <div className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-sm text-slate-700">{composerLatestEntry.note}</div>
                                            )}
                                            {composerLatestEntry.responseFieldValues && composerLatestEntry.responseFieldValues.length > 0 && (
                                                <div className="mt-3 space-y-1.5">
                                                    {composerLatestEntry.responseFieldValues.map((rfv: any, i: number) => {
                                                        const rawField = rfv.field;
                                                        const resolvedF = Array.isArray(rawField) ? rawField[0] : rawField;
                                                        const fieldLabel = resolvedF?.label || '';
                                                        const isGenericLabel = fieldLabel.toLowerCase().replace(/[\s_-]+/g, '') === 'richtext';
                                                        return (
                                                            <div key={rfv.id || i} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                                                                {fieldLabel && !isGenericLabel && <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{fieldLabel}</div>}
                                                                {rfv.richTextContent && rfv.richTextContent !== '<p></p>' && (
                                                                    <div className="prose prose-sm mt-1 max-w-none text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: rfv.richTextContent }} />
                                                                )}
                                                                {rfv.fileUrl && (
                                                                    <div className="mt-1.5">
                                                                        <AttachmentCollection attachments={[{ id: rfv.id || `rfv-${i}`, name: rfv.fileName || 'File', type: rfv.fileType || '', url: rfv.fileUrl }]} variant="compact" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {composerLatestEntry.attachments?.length ? (
                                                <div className="mt-3">
                                                    <AttachmentThumbnailRow
                                                        attachments={composerLatestEntry.attachments.map((a: any) => ({ id: a.id || '', name: a.name || '', type: a.type || '', url: a.url || '', thumbnailUrl: a.thumbnailUrl || null, durationSec: a.durationSec || null, waveformPeaks: a.waveformPeaks || null }))}
                                                        size={44}
                                                    />
                                                </div>
                                            ) : null}
                                        </section>
                                    )}
                                </div>

                                {/* Update panel */}
                                <div className="space-y-5 xl:sticky xl:top-0">
                                    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <h3 className="text-sm font-semibold text-slate-900">Update</h3>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {composerTask?.responseFields?.length ? 'Respond, set status, and add notes in one step.' : 'Capture progress, blockers, or review notes.'}
                                                </p>
                                            </div>
                                        </div>

                                        {composerUpdateUnavailableReason ? (
                                            <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm text-slate-600">
                                                <p>{composerUpdateUnavailableReason}</p>
                                                {!canWriteTaskProgress && !isReadOnly && composerTaskIsActionable && (
                                                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => onRequireTaskAuth?.()}>
                                                        Log in to update
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="mt-4">
                                                <TaskUpdatePanel
                                                    task={composerTask}
                                                    variant="full"
                                                    canEdit={canWriteTaskProgress}
                                                    disabled={isReadOnly}
                                                    isParentReviewer={isParentReviewer}
                                                    ownerName={detailContext?.ownerName}
                                                    gradeTypes={gradeTypes}
                                                    onFileUpload={handleResponseFileUpload}
                                                    onSubmit={async (submission) => {
                                                        setIsSubmittingComposer(true);
                                                        try {
                                                            await onTaskUpdate?.(composerTask.id, {
                                                                nextState: submission.nextState,
                                                                note: submission.note,
                                                                responseFieldValues: submission.responseFieldValues,
                                                                files: composerFiles,
                                                                restoreTiming: composerRestoreTiming,
                                                                replyToUpdateId: submission.replyToUpdateId,
                                                            });
                                                            closeComposer();
                                                        } finally {
                                                            setIsSubmittingComposer(false);
                                                        }
                                                    }}
                                                >
                                                    {canRestoreFromComposer && restoreTargetState && (
                                                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                                                            <div className="text-sm font-medium text-amber-900">Restore With Context</div>
                                                            <p className="mt-1 text-xs text-amber-800">Bring this task back to active work and include notes or files as part of the restore event.</p>
                                                            <div className="mt-3 flex flex-wrap gap-2">
                                                                <Button type="button" variant="outline" size="sm" onClick={() => setComposerRestoreTiming('now')}>Restore now</Button>
                                                                <Button type="button" variant="outline" size="sm" onClick={() => setComposerRestoreTiming('next_scheduled')}>Restore next scheduled day</Button>
                                                            </div>
                                                            {composerRestoreTiming && (
                                                                <div className="mt-3 space-y-2">
                                                                    <label className="text-sm font-medium text-slate-700">Restore timing</label>
                                                                    <select
                                                                        value={composerRestoreTiming}
                                                                        onChange={(e) => setComposerRestoreTiming(e.target.value as TaskRestoreTiming)}
                                                                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                                    >
                                                                        <option value="now">Return now</option>
                                                                        <option value="next_scheduled">Return on the next scheduled day</option>
                                                                    </select>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Evidence</div>
                                                            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100">
                                                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                                Add files
                                                                <input type="file" multiple className="hidden" onChange={handleFileSelection} />
                                                            </label>
                                                        </div>
                                                        {composerFiles.length > 0 ? (
                                                            <div className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                                                                {composerFiles.map((file, index) => (
                                                                    <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 text-sm text-slate-700">
                                                                        <span className="truncate">{file.name}</span>
                                                                        <button type="button" onClick={() => handleRemovePendingFile(index)} className="text-xs font-medium text-rose-600">Remove</button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500">
                                                                Add photos, documents, voice notes, or video for this update.
                                                            </div>
                                                        )}
                                                    </div>
                                                </TaskUpdatePanel>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            </div>

                            {/* History */}
                            <section className="mt-5 rounded-2xl border border-slate-200 bg-white/90 shadow-sm">
                                <div className="border-b border-slate-200 px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h3 className="text-sm font-semibold text-slate-900">History</h3>
                                            <p className="mt-1 text-xs text-slate-500">Every saved task update, restore, note, and evidence file appears here.</p>
                                        </div>
                                        <span className="text-xs text-slate-500">{composerHistoryCountLabel}</span>
                                    </div>
                                </div>
                                <div className="max-h-[320px] space-y-3 overflow-y-auto p-4">
                                    {composerHistoryEntries.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">No progress updates yet.</div>
                                    ) : (
                                        <UpdateHistory updates={composerTask?.updates || []} />
                                    )}
                                </div>
                            </section>
                        </div>

                        <div className="flex items-center justify-end border-t border-slate-200 bg-white px-6 py-4">
                            <Button type="button" variant="outline" onClick={closeComposer} disabled={isSubmittingComposer}>Close</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <FocusOverlay
                state={focusPanelState}
                onClose={handleFocusClose}
                onEnterSplit={handleEnterSplit}
                onSelectSplitItem={() => {}}
                onSwapPanels={handleSwapPanels}
                onCloseSplitPanel={handleCloseSplitPanel}
                availableItems={splitPickerItems}
                onPickItem={handlePickSplitItem}
            />
        </>
    );
}
