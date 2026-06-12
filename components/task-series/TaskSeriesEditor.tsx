// components/task-series/TaskSeriesEditor.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useEditor, EditorContent, JSONContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Plugin } from 'prosemirror-state';
import { id, tx } from '@instantdb/react';
import { startOfDay, format, parseISO, addDays, isSameDay } from 'date-fns';
import { RRule } from 'rrule';
import { Loader2 } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';
import { SlashCommand, slashCommandSuggestion } from './SlashCommand';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';

import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/components/AuthProvider';
import TaskItemExtension, { TaskDateContext } from './TaskItem';
import { TaskDetailsPopover } from './TaskDetailsPopover';
import { ResponseFieldEditor } from './ResponseFieldEditor';
import { UpdateHistory } from '@/components/task-updates/UpdateHistory';
import { uploadFilesToS3 } from '@/lib/file-uploads';
import { cn } from '@/lib/utils';
import { buildHistoryEventTransactions } from '@/lib/history-events';
import { getTaskHistoryEntries, type TaskUpdateLike } from '@/lib/task-progress';
import { countTaskDayBlocks, computePlannedEndDate, type ChoreScheduleInfo } from '@/lib/task-series-schedule';
import type { Task as SchedulerTask } from '@/lib/task-scheduler';
import { computeDeletionImpact, taskHasData, type TaskLikeForGuard } from '@/lib/task-data-guard';
import { TaskDeleteConfirmDialog } from './TaskDeleteConfirmDialog';

// --- Types (Simplified for brevity, matching your provided types) ---
interface Task {
    id: string;
    text?: string | null;
    indentationLevel?: number;
    order?: number | null;
    isDayBreak?: boolean | null;
    isCompleted?: boolean | null;
    workflowState?: string | null;
    lastActiveState?: string | null;
    deferredUntilDate?: string | null;
    parentTask?: { id: string }[]; // Added to track existing parent
}

interface TaskAttachment {
    id: string;
    name?: string | null;
    type?: string | null;
    url?: string | null;
    kind?: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
    thumbnailUrl?: string | null;
    thumbnailWidth?: number | null;
    thumbnailHeight?: number | null;
    blurhash?: string | null;
    waveformPeaks?: number[] | null;
}

interface ResponseField {
    id: string;
    type: string;
    label: string;
    description?: string | null;
    weight: number;
    required: boolean;
    order: number;
}

interface PersistedTask extends Task {
    notes?: string | null;
    specificTime?: string | null;
    overrideWorkAhead?: boolean | null;
    attachments?: TaskAttachment[];
    responseFields?: ResponseField[];
    updates?: TaskUpdateLike[] | null;
}

interface TaskSeriesEditorProps {
    db: any;
    initialSeriesId?: string | null;
    initialFamilyMemberId?: string | null;
    onClose?: () => void;
    className?: string;
}

type DropState = {
    isActive: boolean;
    top: number;
    left: number;
    width: number;
    indentationLevel: number;
};

type TaskCardItem = {
    id: string;
    text: string;
    indentationLevel: number;
    isDayBreak: boolean;
    order: number;
    parentId: string | null;
    parentText: string | null;
    dateLabel: string;
    dateValue: Date | null;
    persistedTask: PersistedTask | null;
};

const ensureDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string') return parseISO(value);
    // Fallback: allow timestamp or other serializable forms
    return new Date(value);
};

// --- HELPER: Safely extract ID from a relation that might be an Object OR an Array ---
const getSingleId = (relation: any): string | null => {
    if (!relation) return null;
    if (Array.isArray(relation)) {
        return relation.length > 0 ? relation[0].id : null;
    }
    return relation.id || null;
};

const buildEmptyTaskNode = (taskId: string, indentationLevel = 0): JSONContent => ({
    type: 'taskItem',
    attrs: {
        id: taskId,
        indentationLevel,
        isDayBreak: false,
    },
});

const buildDayBreakNode = (taskId: string, indentationLevel = 0): JSONContent => ({
    type: 'taskItem',
    attrs: {
        id: taskId,
        indentationLevel,
        isDayBreak: true,
    },
});

const getTopLevelTaskNodes = (editor: NonNullable<ReturnType<typeof useEditor>>) => {
    const nodes: Array<{ index: number; pos: number; node: any }> = [];
    let pos = 0;

    for (let index = 0; index < editor.state.doc.childCount; index += 1) {
        const node = editor.state.doc.child(index);
        nodes.push({ index, pos, node });
        pos += node.nodeSize;
    }

    return nodes;
};

const getInsertPositionAfterTaskSubtree = (editor: NonNullable<ReturnType<typeof useEditor>>, taskId: string) => {
    const nodes = getTopLevelTaskNodes(editor);
    const anchorIndex = nodes.findIndex((item) => item.node?.type?.name === 'taskItem' && item.node?.attrs?.id === taskId);

    if (anchorIndex === -1) {
        return editor.state.doc.content.size;
    }

    const anchorNode = nodes[anchorIndex]?.node;
    const anchorIndentation = anchorNode?.attrs?.indentationLevel || 0;
    let insertIndex = anchorIndex + 1;

    while (insertIndex < nodes.length) {
        const candidate = nodes[insertIndex]?.node;
        if (!candidate || candidate.type?.name !== 'taskItem') break;
        if (candidate.attrs?.isDayBreak) break;
        if ((candidate.attrs?.indentationLevel || 0) <= anchorIndentation) break;
        insertIndex += 1;
    }

    return nodes[insertIndex]?.pos ?? editor.state.doc.content.size;
};

const buildTaskCardItems = (
    json: JSONContent | null | undefined,
    taskDateMap: Record<string, { label: string; date: Date } | undefined>,
    persistedTaskById: Map<string, PersistedTask>
): TaskCardItem[] => {
    const rawItems: TaskCardItem[] = [];
    const stack: Array<{ id: string; indentationLevel: number }> = [];

    const content = json?.content || [];

    for (let index = 0; index < content.length; index += 1) {
        const node = content[index];
        if (node.type !== 'taskItem') continue;

        const attrs = node.attrs || {};
        const taskId = typeof attrs.id === 'string' && attrs.id.trim().length > 0 ? attrs.id : `draft-${index}`;
        const indentationLevel = Number(attrs.indentationLevel || 0);
        const isDayBreak = Boolean(attrs.isDayBreak);

        while (stack.length > 0 && stack[stack.length - 1].indentationLevel >= indentationLevel) {
            stack.pop();
        }

        const parentId = isDayBreak ? null : stack[stack.length - 1]?.id || null;
        const text = isDayBreak ? '' : node.content?.find((child) => child.type === 'text')?.text || '';
        const dateData = taskDateMap[taskId];

        rawItems.push({
            id: taskId,
            text,
            indentationLevel,
            isDayBreak,
            order: index,
            parentId,
            parentText: null,
            dateLabel: dateData?.label || '',
            dateValue: dateData?.date || null,
            persistedTask: persistedTaskById.get(taskId) || null,
        });

        if (!isDayBreak) {
            stack.push({ id: taskId, indentationLevel });
        }
    }

    const labelById = new Map(rawItems.filter((item) => !item.isDayBreak).map((item) => [item.id, item.text]));

    return rawItems.map((item) => ({
        ...item,
        parentText: item.parentId ? labelById.get(item.parentId) || null : null,
    }));
};

const formatTaskMetaDate = (value: Date | string | null | undefined) => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

type TaskSeriesCardProps = {
    db: any;
    seriesId: string;
    item: TaskCardItem;
    historyOpen: boolean;
    onToggleHistory: (taskId: string) => void;
    onDeleteTask: (taskId: string) => void;
    onAddTaskBelow: (taskId: string) => void;
    onAddDayBreakBelow: (taskId: string) => void;
    onTitleChange: (taskId: string, value: string) => void;
};

const TaskSeriesCard = ({
    db,
    seriesId,
    item,
    historyOpen,
    onToggleHistory,
    onDeleteTask,
    onAddTaskBelow,
    onAddDayBreakBelow,
    onTitleChange,
}: TaskSeriesCardProps) => {
    const persistedTask = item.persistedTask;
    const metadataReady = Boolean(persistedTask);
    const [notes, setNotes] = useState(persistedTask?.notes || '');
    const [specificTime, setSpecificTime] = useState(persistedTask?.specificTime || '');
    const [overrideWorkAhead, setOverrideWorkAhead] = useState(Boolean(persistedTask?.overrideWorkAhead));
    const [uploading, setUploading] = useState(false);
    const historyEntries = getTaskHistoryEntries(persistedTask?.updates || []);

    useEffect(() => {
        setNotes(persistedTask?.notes || '');
        setSpecificTime(persistedTask?.specificTime || '');
        setOverrideWorkAhead(Boolean(persistedTask?.overrideWorkAhead));
    }, [persistedTask?.notes, persistedTask?.overrideWorkAhead, persistedTask?.specificTime]);

    const saveMetadata = useCallback(
        async (patch: Record<string, unknown>) => {
            if (!metadataReady) return;

            try {
                await db.transact([
                    tx.tasks[item.id].update({
                        ...patch,
                        updatedAt: new Date(),
                    }),
                    tx.taskSeries[seriesId].link({ tasks: item.id }),
                ]);
            } catch (error) {
                console.error('Unable to save task metadata', error);
            }
        },
        [db, item.id, metadataReady, seriesId]
    );

    const handleNotesBlur = () => {
        if (!metadataReady) return;
        if ((persistedTask?.notes || '') === notes) return;
        void saveMetadata({ notes });
    };

    const handleSpecificTimeBlur = () => {
        if (!metadataReady) return;
        if ((persistedTask?.specificTime || '') === specificTime) return;
        void saveMetadata({ specificTime: specificTime || null });
    };

    const handleOverrideWorkAheadChange = (checked: boolean) => {
        setOverrideWorkAhead(checked);
        if (!metadataReady) return;
        void saveMetadata({ overrideWorkAhead: checked });
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !metadataReady) return;

        setUploading(true);
        try {
            const [uploadedAttachment] = await uploadFilesToS3([file], id);
            if (!uploadedAttachment) throw new Error('Upload failed');

            const attachmentId = uploadedAttachment.id;
            await db.transact([
                tx.taskAttachments[attachmentId].update({
                    blurhash: uploadedAttachment.blurhash || null,
                    createdAt: new Date(),
                    durationSec: uploadedAttachment.durationSec ?? null,
                    height: uploadedAttachment.height ?? null,
                    kind: uploadedAttachment.kind || null,
                    name: uploadedAttachment.name,
                    sizeBytes: uploadedAttachment.sizeBytes ?? null,
                    thumbnailHeight: uploadedAttachment.thumbnailHeight ?? null,
                    thumbnailUrl: uploadedAttachment.thumbnailUrl || null,
                    thumbnailWidth: uploadedAttachment.thumbnailWidth ?? null,
                    type: uploadedAttachment.type,
                    updatedAt: new Date(),
                    url: uploadedAttachment.url,
                    waveformPeaks: uploadedAttachment.waveformPeaks || null,
                    width: uploadedAttachment.width ?? null,
                }),
                tx.tasks[item.id].link({ attachments: attachmentId }),
                tx.taskSeries[seriesId].link({ tasks: item.id }),
            ]);
        } catch (error) {
            console.error('File upload error:', error);
            alert('Failed to upload file.');
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    const handleDeleteAttachment = async (attachmentId: string) => {
        if (!confirm('Remove this attachment from the task?')) return;

        try {
            await db.transact([tx.taskAttachments[attachmentId].delete()]);
        } catch (error) {
            console.error('Unable to delete attachment', error);
        }
    };

    const handleDeleteTask = () => {
        onDeleteTask(item.id);
    };

    return (
        <article
            className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm transition-colors hover:border-slate-300"
            style={{ marginLeft: `${Math.min(item.indentationLevel, 4) * 18}px` }}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        {item.dateLabel ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                                {item.dateLabel}
                            </span>
                        ) : item.dateValue ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {formatTaskMetaDate(item.dateValue)}
                            </span>
                        ) : null}
                        {item.parentText ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                In {item.parentText}
                            </span>
                        ) : null}
                        {historyEntries.length > 0 ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                {historyEntries.length} update{historyEntries.length === 1 ? '' : 's'}
                            </span>
                        ) : null}
                    </div>

                    <Input
                        value={item.text}
                        onChange={(event) => onTitleChange(item.id, event.target.value)}
                        placeholder="New task"
                        className="mt-3 h-11 border-slate-200 bg-white text-base font-semibold"
                        aria-label={`Task title for ${item.text || 'new task'}`}
                    />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={() => onAddTaskBelow(item.id)}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                    >
                        Add task below
                    </button>
                    <button
                        type="button"
                        aria-label={`Add day break below ${item.text || 'task'}`}
                        onClick={() => onAddDayBreakBelow(item.id)}
                        className="h-8 w-8 rounded-full border border-slate-200 text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                    >
                        ||
                    </button>
                    <button
                        type="button"
                        onClick={() => onToggleHistory(item.id)}
                        disabled={!metadataReady}
                        className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {historyOpen ? 'Hide history' : 'History'}
                    </button>
                    <button
                        type="button"
                        onClick={handleDeleteTask}
                        className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:border-rose-300 hover:text-rose-700"
                    >
                        Delete
                    </button>
                </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(220px,0.7fr)]">
                <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Notes</label>
                    <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        onBlur={handleNotesBlur}
                        disabled={!metadataReady}
                        placeholder={metadataReady ? 'Add instructions, context, or prep notes…' : 'Metadata unlocks once this card finishes saving.'}
                        className="min-h-[112px] w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <div className="text-[11px] text-slate-400">{metadataReady ? 'Saved when you leave the field.' : 'Save is pending for this new card.'}</div>
                </div>

                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Timing</div>
                        <div className="mt-3 space-y-3">
                            <div>
                                <label className="text-xs font-medium text-slate-600">Time of day</label>
                                <p className="text-[10px] text-slate-400 mt-0.5 mb-1">When during the day this task should be done (shown as a reminder, not enforced).</p>
                                <Input
                                    type="time"
                                    value={specificTime}
                                    onChange={(event) => setSpecificTime(event.target.value)}
                                    onBlur={handleSpecificTimeBlur}
                                    disabled={!metadataReady}
                                    className="mt-1 border-slate-200 bg-white"
                                />
                            </div>
                            <div>
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={overrideWorkAhead}
                                        onChange={(event) => handleOverrideWorkAheadChange(event.target.checked)}
                                        disabled={!metadataReady}
                                    />
                                    Allow early completion
                                </label>
                                <p className="text-[10px] text-slate-400 mt-1 ml-6">
                                    When the series has &quot;work ahead&quot; disabled, this task can still be completed before its scheduled date.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Attachments</div>
                            <label
                                className={cn(
                                    'rounded-full border border-sky-200 px-3 py-1 text-xs font-medium text-sky-700 transition-colors',
                                    metadataReady ? 'cursor-pointer hover:border-sky-300 hover:text-sky-800' : 'cursor-not-allowed opacity-50'
                                )}
                            >
                                {uploading ? 'Uploading...' : 'Upload'}
                                <input type="file" className="hidden" onChange={handleFileUpload} disabled={!metadataReady || uploading} />
                            </label>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                            {!metadataReady ? (
                                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
                                    Attachments unlock after the task saves.
                                </div>
                            ) : persistedTask?.attachments?.length ? (
                                <div className="w-full space-y-2">
                                    <AttachmentCollection attachments={persistedTask.attachments} variant="compact" />
                                    <div className="flex flex-wrap gap-2">
                                        {persistedTask.attachments.map((file) => (
                                            <button
                                                key={`${file.id}-remove`}
                                                type="button"
                                                onClick={() => void handleDeleteAttachment(file.id)}
                                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 transition-colors hover:border-rose-200 hover:text-rose-600"
                                            >
                                                Remove {file.name || 'attachment'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
                                    No attachments yet.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-purple-100 bg-purple-50/30 p-3">
                        {metadataReady ? (
                            <ResponseFieldEditor taskId={item.id} responseFields={persistedTask?.responseFields || []} />
                        ) : (
                            <div className="space-y-1.5">
                                <div className="text-xs font-semibold text-gray-700">Response Fields</div>
                                <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">
                                    Response fields unlock after the task saves.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {historyOpen ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-semibold text-slate-900">Task history</h3>
                            <p className="text-xs text-slate-500">Later status updates, restore actions, and attached progress files live here.</p>
                        </div>
                        <Link href={`/history?domain=tasks&taskSeriesId=${seriesId}`} className="text-xs font-medium text-sky-700 hover:text-sky-800">
                            Open full history
                        </Link>
                    </div>

                    {historyEntries.length === 0 ? (
                        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-sm text-slate-500">
                            No later updates yet. Creation-time notes and attachments stay on the card itself.
                        </div>
                    ) : (
                        <UpdateHistory updates={persistedTask?.updates || []} className="mt-4" />
                    )}
                </div>
            ) : null}
        </article>
    );
};

const TaskSeriesEditor: React.FC<TaskSeriesEditorProps> = ({ db, initialSeriesId, onClose, className }) => {
    const { toast } = useToast();
    const { currentUser } = useAuth();

    // If initialSeriesId is present, we know it exists in DB
    const [hasPersisted, setHasPersisted] = useState<boolean>(!!initialSeriesId);

    const [seriesId] = useState<string>(initialSeriesId || id());
    const [isSaving, setIsSaving] = useState(false);
    const [editorDocument, setEditorDocument] = useState<JSONContent>({ type: 'doc', content: [] });
    const [mobilePane, setMobilePane] = useState<'bulk' | 'cards'>('bulk');
    const [isBulkEditorCollapsed, setIsBulkEditorCollapsed] = useState(false);
    const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);

    // Map stores object { label, date } instead of just string
    const [taskDateMap, setTaskDateMap] = useState<Record<string, { label: string; date: Date } | undefined>>({});

    const defaultStartDate = useRef(startOfDay(new Date())).current;
    const [taskSeriesName, setTaskSeriesName] = useState('');
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState<Date>(defaultStartDate);
    const [targetEndDate, setTargetEndDate] = useState<Date | null>(null);
    const [workAheadAllowed, setWorkAheadAllowed] = useState<boolean>(false);
    const initialStartDateRef = useRef(defaultStartDate);

    // Links
    const [familyMemberId, setFamilyMemberId] = useState<string | null>(null);
    const [scheduledActivityId, setScheduledActivityId] = useState<string | null>(null);

    // --- Task Delete Confirmation State ---
    const [deleteConfirm, setDeleteConfirm] = useState<{
        taskIds: string[];
        tasksWithData: import('@/lib/task-data-guard').TaskDataSummary[];
        message: string;
        /** Callback to run if user confirms (e.g. execute the actual delete). */
        onConfirm: () => void;
    } | null>(null);
    // IDs that the user has explicitly confirmed deleting (bypass future checks)
    const confirmedDeleteIds = useRef(new Set<string>());

    // --- Drag and Drop State ---
    const editorRef = useRef<HTMLDivElement>(null);
    const [dropState, setDropState] = useState<DropState | null>(null);
    const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);

    // --- Cursor Hiding Logic ---
    useEffect(() => {
        if (isDraggingGlobal) {
            // Force cursor to grabbing globally to hide text cursor and indicate drag
            document.body.style.cursor = 'grabbing';
            document.body.classList.add('select-none'); // Optional: helps prevent text selection
        } else {
            document.body.style.cursor = '';
            document.body.classList.remove('select-none');
        }
        return () => {
            document.body.style.cursor = '';
            document.body.classList.remove('select-none');
        };
    }, [isDraggingGlobal]);

    // --- 1. Fetch Data ---
    const { data, isLoading } = db.useQuery({
        taskSeries: {
            $: { where: { id: seriesId } },
            tasks: {
                parentTask: {}, // Fetch parentTask so we can unlink if hierarchy changes
                attachments: {},
                responseFields: {},
                updates: {
                    attachments: {},
                    actor: {},
                },
            },
            familyMember: {}, // link: taskSeriesOwner
            scheduledActivity: {}, // link: taskSeriesScheduledActivity (chores)
        },
        familyMembers: {
            $: { order: { order: 'asc' } },
        },
        chores: {
            $: {}, // you can later add filters if this is too broad
        },
    });

    const dbTasks: PersistedTask[] = data?.taskSeries?.[0]?.tasks || [];
    const seriesData = data?.taskSeries?.[0];
    const persistedTaskById = React.useMemo(() => new Map(dbTasks.map((task) => [task.id, task])), [dbTasks]);
    const cardItems = React.useMemo(() => buildTaskCardItems(editorDocument, taskDateMap, persistedTaskById), [editorDocument, persistedTaskById, taskDateMap]);
    const taskCount = cardItems.filter((item) => !item.isDayBreak).length;
    const dayBreakCount = cardItems.filter((item) => item.isDayBreak).length;

    // Keep a ref of seriesData so debouncedSave can access the *current* DB state
    // to know what to unlink without needing to be recreated on every render.
    const seriesDataRef = useRef(seriesData);
    const lastHistoryEventAtRef = useRef(0);
    useEffect(() => {
        seriesDataRef.current = seriesData;
    }, [seriesData]);

    // Load series metadata
    useEffect(() => {
        if (seriesData) {
            setHasPersisted(true); // confirms this series exists in DB

            setTaskSeriesName(seriesData.name || '');
            setDescription(seriesData.description || '');

            const start = ensureDate(seriesData.startDate);
            if (start) {
                setStartDate(startOfDay(start));
            }

            const target = ensureDate(seriesData.targetEndDate);
            if (target) {
                setTargetEndDate(startOfDay(target));
            } else {
                setTargetEndDate(null);
            }

            setWorkAheadAllowed(seriesData.workAheadAllowed === true);

            // Linked family member & chore, if present
            if (seriesData.familyMember) {
                setFamilyMemberId(getSingleId(seriesData.familyMember));
            } else {
                setFamilyMemberId(null);
            }

            if (seriesData.scheduledActivity) {
                setScheduledActivityId(getSingleId(seriesData.scheduledActivity));
            } else {
                setScheduledActivityId(null);
            }
        }
    }, [seriesData]);

    // --- 3. Date Calculation Logic (RRule) ---
    // Ref pattern to handle closure staleness in useEditor's onUpdate
    const calculateDatesRef = useRef<(json: JSONContent) => void>(() => {});

    const calculateDates = useCallback(
        (json: JSONContent) => {
            if (!json.content) return;

            const map: Record<string, { label: string; date: Date } | undefined> = {};

            // 1. Determine Logic Strategy
            // Do we use a Chores RRule? Or Manual Relative Days?
            const chore = scheduledActivityId ? data?.chores?.find((c: any) => c.id === scheduledActivityId) : null;
            const useRRule = chore && chore.rrule;

            try {
                let rruleObj: RRule | null = null;
                let currentDate: Date = startDate || startOfDay(new Date());
                let dayCounter = 1; // 1-based index for "Day 1", "Day 2", etc.

                if (useRRule) {
                    // --- RRULE STRATEGY ---
                    const rruleOptions = RRule.parseString(chore.rrule);
                    rruleOptions.dtstart = startDate; // Override start date
                    rruleObj = new RRule(rruleOptions);

                    // Get first valid date
                    const firstDate = rruleObj.after(new Date(startDate.getTime() - 24 * 60 * 60 * 1000), true);
                    if (firstDate) {
                        currentDate = firstDate;
                    }
                } else {
                    // --- MANUAL STRATEGY ---
                    // currentDate defaults to startDate (or today).
                    // We will increment dayCounter on breaks.
                }

                let lastDisplayedDateLabel = '';

                json.content.forEach((node) => {
                    if (node.type === 'taskItem' && node.attrs) {
                        const { id, isDayBreak } = node.attrs;

                        if (isDayBreak) {
                            // --- HANDLE BREAK ---
                            if (useRRule && rruleObj) {
                                // Advance to next scheduled instance
                                const next = rruleObj.after(currentDate);
                                if (next) currentDate = next;
                            } else {
                                // Advance counter
                                dayCounter++;
                                // We increment the date object too, assuming consecutive days for "Day 2", etc.
                                currentDate = addDays(currentDate, 1);
                            }

                            // Breaks get the internal date but no label
                            map[id] = { label: '', date: currentDate };
                        } else {
                            // --- STANDARD TASK ---
                            let dateLabel = '';

                            if (useRRule) {
                                dateLabel = format(currentDate, 'E, M/d');
                            } else {
                                // Manual Strategy
                                if (dayCounter === 1) {
                                    // First section shows the actual date
                                    dateLabel = format(currentDate, 'E, M/d');
                                } else {
                                    // Successive sections show "Day X"
                                    dateLabel = `Day ${dayCounter}`;
                                }
                            }

                            const showLabel = dateLabel !== lastDisplayedDateLabel;

                            map[id] = {
                                label: showLabel ? dateLabel : '',
                                date: currentDate,
                            };

                            if (showLabel) {
                                lastDisplayedDateLabel = dateLabel;
                            }
                        }
                    }
                });

                setTaskDateMap(map);
            } catch (err) {
                console.error('Failed to calculate dates', err);
                setTaskDateMap({});
            }
        },
        [startDate, scheduledActivityId, data?.chores]
    );

    // Keep the ref updated with the latest callback
    useEffect(() => {
        calculateDatesRef.current = calculateDates;
    }, [calculateDates]);

    // --- Delete Guard Plugin ---
    // Uses refs so the plugin always reads the latest task data without
    // re-creating the editor.
    const persistedTaskByIdRef = useRef(persistedTaskById);
    useEffect(() => {
        persistedTaskByIdRef.current = persistedTaskById;
    }, [persistedTaskById]);

    const deleteGuardCallbackRef = useRef<(removedIds: string[], pendingDoc?: any) => void>(() => {});
    // When a paste-over-selection is blocked by the delete guard, we stash the
    // intended resulting doc here so the confirmation handler can replay the
    // full operation (deletion + paste) rather than only the deletion.
    const pendingPasteDocRef = useRef<any>(null);

    const deleteGuardExtension = useMemo(
        () =>
            Extension.create({
                name: 'taskDeleteGuard',
                addProseMirrorPlugins() {
                    return [
                        new Plugin({
                            filterTransaction(tr) {
                                // Allow transactions that explicitly bypass the guard
                                if (tr.getMeta('skipDeleteGuard')) return true;
                                // Don't guard undo/redo — those are user-initiated reversals
                                if (tr.getMeta('history$')) return true;
                                // If nothing changed, allow
                                if (!tr.docChanged) return true;

                                const oldDoc = tr.before;
                                const newDoc = tr.doc;

                                // Collect task IDs from old and new docs
                                const oldIds = new Set<string>();
                                oldDoc.descendants((node) => {
                                    if (node.type.name === 'taskItem' && node.attrs?.id) {
                                        oldIds.add(node.attrs.id as string);
                                    }
                                    return false;
                                });
                                const newIds = new Set<string>();
                                newDoc.descendants((node) => {
                                    if (node.type.name === 'taskItem' && node.attrs?.id) {
                                        newIds.add(node.attrs.id as string);
                                    }
                                    return false;
                                });

                                // Find removed task IDs
                                const removedIds = Array.from(oldIds).filter(
                                    (tid) => !newIds.has(tid)
                                );

                                if (removedIds.length === 0) return true;

                                // Check if any removed tasks have data and aren't confirmed
                                const lookup = persistedTaskByIdRef.current;
                                const unconfirmed = removedIds.filter((tid) => {
                                    if (confirmedDeleteIds.current.has(tid)) return false;
                                    const task = lookup.get(tid);
                                    return task ? taskHasData(task as TaskLikeForGuard) : false;
                                });

                                if (unconfirmed.length === 0) return true;

                                // Block the transaction and trigger the confirmation dialog.
                                // If this is a paste-over-selection, save the intended
                                // doc so we can replay the full operation on confirm.
                                const isPaste = tr.getMeta('uiEvent') === 'paste';
                                const pendingDoc = isPaste ? newDoc : undefined;

                                // We schedule via setTimeout to avoid dispatching during
                                // filterTransaction (which would throw).
                                setTimeout(() => {
                                    deleteGuardCallbackRef.current(removedIds, pendingDoc);
                                }, 0);

                                return false;
                            },
                        }),
                    ];
                },
            }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [] // Intentionally stable — reads from refs
    );

    // --- 2. Editor Setup ---
    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                paragraph: false,
                bulletList: false,
                orderedList: false,
                listItem: false,

                // Disable other blocks to keep the schema clean/flat
                blockquote: false,
                codeBlock: false,
                heading: false,
                horizontalRule: false,

                // Disables the default black drop indicator line
                dropcursor: false,
                // --------------------

                // Note: We implicitly KEEP 'document', 'text', 'bold', 'history', etc.
            }),
            TaskItemExtension,
            deleteGuardExtension,
            // Add Slash Command Extension
            SlashCommand.configure({
                suggestion: slashCommandSuggestion,
            }),
        ],
        content: { type: 'doc', content: [] },
        editorProps: {
            attributes: {
                class: 'focus:outline-none min-h-[300px] p-4',
            },
            // prevent native drag/drop caret & insertion behavior
            handleDOMEvents: {
                dragover: (_view, event) => {
                    event.preventDefault();
                    return true;
                },
                drop: (_view, event) => {
                    event.preventDefault();
                    return true;
                },
            },
        },
        onUpdate: ({ editor }) => {
            const nextJson = editor.getJSON();
            setEditorDocument(nextJson);

            // 1. DATE CALCULATION
            requestAnimationFrame(() => {
                // Use the ref to ensure we use the latest calculateDates logic (with latest startDate/activity)
                calculateDatesRef.current(nextJson);
            });

            // 2. SAVE
            debouncedSave(nextJson);
        },
    });

    // Wire up the delete guard callback to show the confirmation dialog
    useEffect(() => {
        deleteGuardCallbackRef.current = (removedIds: string[], pendingDoc?: any) => {
            const impact = computeDeletionImpact(
                removedIds,
                persistedTaskById as Map<string, TaskLikeForGuard>
            );
            if (impact.tasksWithData.length === 0) return;

            // Stash the pending doc for paste-over-selection replays
            pendingPasteDocRef.current = pendingDoc || null;

            setDeleteConfirm({
                taskIds: removedIds,
                tasksWithData: impact.tasksWithData,
                message: impact.message,
                onConfirm: () => {
                    // Mark all as confirmed and redo the edit
                    removedIds.forEach((tid) => confirmedDeleteIds.current.add(tid));
                    setDeleteConfirm(null);

                    const savedDoc = pendingPasteDocRef.current;
                    pendingPasteDocRef.current = null;

                    // Re-apply the operation with the guard bypass flag.
                    // The editor's onUpdate handler will trigger debounced save.
                    if (editor && !editor.isDestroyed) {
                        editor
                            .chain()
                            .focus()
                            .command(({ state, dispatch }) => {
                                let tr = state.tr;
                                tr.setMeta('skipDeleteGuard', true);

                                if (savedDoc) {
                                    // Paste-over-selection: replace the entire doc
                                    // with the intended result (which includes both
                                    // the deletion of old tasks and the pasted content).
                                    // Assign fresh IDs to any nodes that referenced
                                    // deleted tasks.
                                    tr = tr.replaceWith(0, state.doc.content.size, savedDoc.content);

                                    // Ensure pasted nodes get fresh IDs
                                    const confirmedSet = confirmedDeleteIds.current;
                                    tr.doc.descendants((node: any, pos: number) => {
                                        if (node.type.name !== 'taskItem') return false;
                                        const nodeId = node.attrs?.id as string | undefined;
                                        // Assign fresh IDs to nodes that had deleted task
                                        // IDs or no ID at all
                                        if (!nodeId || confirmedSet.has(nodeId)) {
                                            tr = tr.setNodeMarkup(pos, undefined, {
                                                ...node.attrs,
                                                id: id(),
                                            }, node.marks);
                                        }
                                        return false;
                                    });
                                } else {
                                    // Pure deletion: remove nodes by their IDs
                                    const toDelete: Array<{ from: number; to: number }> = [];
                                    let pos = 0;
                                    for (let i = 0; i < state.doc.childCount; i++) {
                                        const node = state.doc.child(i);
                                        if (
                                            node.type.name === 'taskItem' &&
                                            node.attrs.id &&
                                            removedIds.includes(node.attrs.id as string)
                                        ) {
                                            toDelete.push({ from: pos, to: pos + node.nodeSize });
                                        }
                                        pos += node.nodeSize;
                                    }

                                    // Delete in reverse order so positions stay stable
                                    for (let i = toDelete.length - 1; i >= 0; i--) {
                                        tr = tr.delete(toDelete[i].from, toDelete[i].to);
                                    }
                                }

                                if (dispatch && tr.docChanged) {
                                    dispatch(tr);
                                }
                                return tr.docChanged;
                            })
                            .run();
                    }
                },
            });
        };
    }, [editor, persistedTaskById]);

    // Trigger calculation when dependencies change (so dates update without typing)
    useEffect(() => {
        if (editor && !editor.isDestroyed) {
            calculateDates(editor.getJSON());
        }
    }, [calculateDates, editor]);

    // --- 3. Drag and Drop Logic ---
    useEffect(() => {
        if (!editor) return;

        return monitorForElements({
            onDragStart: ({ source }) => {
                if (source.data.type !== 'task-item') return;
                setIsDraggingGlobal(true);
                editor.commands.blur(); // hide caret while dragging
            },
            onDrag: ({ location, source }) => {
                if (source.data.type !== 'task-item') return;

                const container = editorRef.current;
                if (!container) return;

                const clientX = location.current.input.clientX;
                const clientY = location.current.input.clientY;

                // 1. Identify Target
                // Try direct hit first
                let targetElement = document.elementFromPoint(clientX, clientY)?.closest('[data-task-id]') as HTMLElement | null;

                // GAP FIX: If no direct hit, find nearest task vertically within container
                if (!targetElement) {
                    const elements = Array.from(container.querySelectorAll('[data-task-id]'));
                    let closest: HTMLElement | null = null;
                    let minDistance = Infinity;

                    for (const el of elements) {
                        const rect = el.getBoundingClientRect();
                        // Distance to vertical center of the element
                        const dist = Math.abs(clientY - (rect.top + rect.height / 2));
                        if (dist < minDistance) {
                            minDistance = dist;
                            closest = el as HTMLElement;
                        }
                    }
                    // Only snap if we are relatively close (e.g. within 50px) to prevent snapping from miles away
                    if (closest && minDistance < 100) {
                        targetElement = closest;
                    }
                }

                if (!targetElement) {
                    setDropState(null);
                    return;
                }

                // 2. Calculate Edges (Top vs Bottom)
                const rect = targetElement.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const isTop = clientY < midY;

                // 3. Determine "Preceding Node" (The parent we are checking against)
                // If dropping Top: predecessor is the target's previous sibling.
                // If dropping Bottom: predecessor is the target itself.
                let precedingElement: HTMLElement | null = null;

                if (isTop) {
                    // If we are dropping on the top edge of a task,
                    // effective predecessor is the previous task in the list.
                    // We loop previousElementSibling to skip over non-task nodes (like drag previews)
                    let prev = targetElement.previousElementSibling;
                    while (prev) {
                        if (prev.hasAttribute('data-task-id')) {
                            precedingElement = prev as HTMLElement;
                            break;
                        }
                        prev = prev.previousElementSibling;
                    }
                } else {
                    // If dropping on bottom edge, this task itself is the predecessor
                    precedingElement = targetElement;
                }

                // 4. Calculate Max Indentation
                // Max is predecessor's level + 1.
                // If no predecessor (top of list), Max is 0.
                let maxIndent = 0;
                if (precedingElement) {
                    const prevLevel = parseInt(precedingElement.getAttribute('data-indent-level') || '0', 10);
                    maxIndent = prevLevel + 1;
                }

                // 5. Calculate Desired Indentation from Horizontal Mouse Position
                const INDENT_ZERO_OFFSET = 116; // w-20(80) + pr-3(12) + handle(24)
                const INDENT_WIDTH = 32; // 2rem

                const mouseXRelative = clientX - containerRect.left;
                const rawIndent = Math.floor((mouseXRelative - INDENT_ZERO_OFFSET) / INDENT_WIDTH);

                // Clamp indentation between 0 and allowed Max
                const finalIndent = Math.max(0, Math.min(rawIndent, maxIndent));

                // 6. Set Drop State
                const visualLeft = INDENT_ZERO_OFFSET + finalIndent * INDENT_WIDTH;

                // Align line exactly with the gap
                // If Top: line is at top of rect. If Bottom: line is at bottom of rect.
                const relativeTop = (isTop ? rect.top : rect.bottom) - containerRect.top;

                setDropState({
                    isActive: true,
                    top: relativeTop,
                    left: visualLeft,
                    width: containerRect.width - visualLeft - 40,
                    indentationLevel: finalIndent,
                });
            },
            onDrop: ({ location, source }) => {
                setIsDraggingGlobal(false);
                setDropState(null);
                if (source.data.type !== 'task-item') return;
                if (!editor || editor.isDestroyed) return;

                const draggedId = source.data.id as string;

                // Re-calculate drop target (same logic as onDrag)
                const container = editorRef.current;
                if (!container) return;

                const clientX = location.current.input.clientX;
                const clientY = location.current.input.clientY;

                // --- REPEAT TARGET FINDING LOGIC (Must match onDrag) ---
                let targetElement = document.elementFromPoint(clientX, clientY)?.closest('[data-task-id]') as HTMLElement | null;

                if (!targetElement) {
                    const elements = Array.from(container.querySelectorAll('[data-task-id]'));
                    let closest: HTMLElement | null = null;
                    let minDistance = Infinity;
                    for (const el of elements) {
                        const rect = el.getBoundingClientRect();
                        const dist = Math.abs(clientY - (rect.top + rect.height / 2));
                        if (dist < minDistance) {
                            minDistance = dist;
                            closest = el as HTMLElement;
                        }
                    }
                    if (closest && minDistance < 100) targetElement = closest;
                }
                // -------------------------------------------------------

                if (!targetElement) return;

                const targetId = targetElement.getAttribute('data-task-id');
                if (targetId === draggedId) return;

                // --- Re-calculate logic (must match onDrag exactly) ---
                const rect = targetElement.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const isTop = clientY < midY;

                // --- REPEAT INDENTATION LOGIC ---
                let precedingElement: HTMLElement | null = null;
                if (isTop) {
                    let prev = targetElement.previousElementSibling;
                    while (prev) {
                        if (prev.hasAttribute('data-task-id')) {
                            precedingElement = prev as HTMLElement;
                            break;
                        }
                        prev = prev.previousElementSibling;
                    }
                } else {
                    precedingElement = targetElement;
                }

                let maxIndent = 0;
                if (precedingElement) {
                    const prevLevel = parseInt(precedingElement.getAttribute('data-indent-level') || '0', 10);
                    maxIndent = prevLevel + 1;
                }

                const INDENT_ZERO_OFFSET = 116;
                const INDENT_WIDTH = 32;
                const mouseXRelative = clientX - containerRect.left;
                const rawIndent = Math.floor((mouseXRelative - INDENT_ZERO_OFFSET) / INDENT_WIDTH);
                const finalIndent = Math.max(0, Math.min(rawIndent, maxIndent));
                // -----------------------------------------------------

                // Execute Transaction
                editor
                    .chain()
                    .command(({ state, dispatch, tr }) => {
                        const { doc } = state;
                        let draggedPos: number | null = null;
                        let draggedNode: any = null;
                        let targetPos: number | null = null;

                        // Find positions
                        doc.descendants((node, pos) => {
                            if (node.attrs.id === draggedId) {
                                draggedPos = pos;
                                draggedNode = node;
                            }
                            if (node.attrs.id === targetId) {
                                targetPos = pos;
                            }
                        });

                        if (draggedPos === null || targetPos === null || !draggedNode) return false;

                        // 1. Determine Insertion Point
                        // If isTop, insert before target. If !isTop, insert after target.
                        // We must account for node size.
                        const targetNode = doc.nodeAt(targetPos);
                        if (!targetNode) return false;

                        let insertPos = isTop ? targetPos : targetPos + targetNode.nodeSize;

                        // Adjust insertPos if we are deleting the dragged node *before* the insertion point
                        // (Logic simplifies if we delete first, but we need to map position)

                        // 2. Delete Dragged Node
                        tr.delete(draggedPos, draggedPos + draggedNode.nodeSize);

                        // Map insertion position
                        const mappedInsertPos = tr.mapping.map(insertPos);

                        tr.insert(
                            mappedInsertPos,
                            draggedNode.type.create(
                                {
                                    ...draggedNode.attrs,
                                    indentationLevel: finalIndent,
                                },
                                draggedNode.content
                            )
                        );

                        if (dispatch) dispatch(tr);
                        return true;
                    })
                    .run();
            },
        });
    }, [editor]);

    // --- 4. Hydration (DB -> TipTap) ---
    // We use a ref to ensure we only hydrate ONCE when data is first available
    const hasHydrated = React.useRef(false);

    useEffect(() => {
        if (editor && !isLoading && !hasHydrated.current) {
            let initialDocument: JSONContent;

            if (dbTasks.length > 0) {
                // Sort by order
                const sortedTasks = [...dbTasks].sort((a, b) => (a.order || 0) - (b.order || 0));

                // Convert to TipTap JSON
                const content = sortedTasks.map((t) => ({
                    type: 'taskItem',
                    attrs: {
                        id: t.id,
                        indentationLevel: t.indentationLevel || 0,
                        // STRICT HYDRATION: Only true if DB says true.
                        // If DB has text: "-" but isDayBreak is false, it loads as a normal task with text "-".
                        isDayBreak: t.isDayBreak || false,
                    },
                    content: t.text ? [{ type: 'text', text: t.text }] : undefined,
                }));

                initialDocument = { type: 'doc', content };
            } else {
                // Initialize with one empty task if new
                initialDocument = {
                    type: 'doc',
                    content: [{ type: 'taskItem', attrs: { id: id(), indentationLevel: 0, isDayBreak: false } }],
                };
            }

            editor.commands.setContent(initialDocument);
            setEditorDocument(initialDocument);

            hasHydrated.current = true;
            // Initial date calc
            calculateDates(initialDocument);
        }
    }, [editor, isLoading, dbTasks, calculateDates]);

    // --- 5. Saving (TipTap -> DB) ---
    const debouncedSave = useDebouncedCallback(async (json: JSONContent) => {
        if (!json.content) return;

        // 0. Decide if there is any meaningful content
        const hasMetadataContent =
            taskSeriesName.trim().length > 0 ||
            description.trim().length > 0 ||
            !!familyMemberId ||
            !!scheduledActivityId ||
            !!targetEndDate ||
            !isSameDay(startDate, initialStartDateRef.current);

        let hasTaskContent = false;
        for (const node of json.content) {
            if (node.type !== 'taskItem' || !node.content) continue;
            const textNode = node.content[0];
            if (textNode?.type === 'text' && textNode.text && textNode.text.trim().length > 0) {
                hasTaskContent = true;
                break;
            }
        }

        const hasAnyContent = hasMetadataContent || hasTaskContent;

        // If this is a new series and literally nothing has been entered yet,
        // don't write anything to InstantDB.
        if (!hasPersisted && !hasAnyContent) {
            return;
        }

        setIsSaving(true);

        const transactions: any[] = [];
        const currentIds = new Set<string>();
        let taskStructureChanged = !hasPersisted;

        // Stack to track hierarchy: Array of { id, level }
        const stack: { id: string; level: number }[] = [];

        // 1. Prepare Updates/Inserts for tasks
        json.content.forEach((node, index) => {
            if (node.type !== 'taskItem' || !node.attrs) return;

            const taskId = node.attrs.id || id();
            const isDayBreak = !!node.attrs.isDayBreak;
            const currentLevel = node.attrs.indentationLevel || 0;

            const textContent = isDayBreak ? '' : node.content?.[0]?.text || '';

            currentIds.add(taskId);
            const existingTaskInDb = dbTasks.find((t) => t.id === taskId);
            if (
                !existingTaskInDb ||
                String(existingTaskInDb.text || '') !== textContent ||
                (existingTaskInDb.order || 0) !== index ||
                (existingTaskInDb.indentationLevel || 0) !== currentLevel ||
                Boolean(existingTaskInDb.isDayBreak) !== isDayBreak
            ) {
                taskStructureChanged = true;
            }

            // --- Determine "Leaf" vs "Parent" Status for childTasksComplete ---
            // Look ahead to the next node. If it is deeper, this node is a Parent.
            // If next node is same level or shallower (or doesn't exist), this node is a Leaf.
            const nextNode = json.content![index + 1];
            const nextLevel = nextNode?.type === 'taskItem' && nextNode.attrs ? nextNode.attrs.indentationLevel || 0 : 0;

            // A node is a parent if the very next node is indented further
            const isParent = nextNode && nextLevel > currentLevel;

            const taskData: any = {
                text: textContent,
                order: index,
                indentationLevel: currentLevel,
                isDayBreak,
                updatedAt: new Date(),
                // NEW: Initialize structure logic
                // If it's a leaf, the subtree is complete (it has no children).
                // If it's a parent, assume incomplete (wait for children to be checked).
                childTasksComplete: !isParent,
                workflowState: existingTaskInDb?.workflowState ?? (existingTaskInDb?.isCompleted ? 'done' : 'not_started'),
                lastActiveState: existingTaskInDb?.lastActiveState ?? 'not_started',
                deferredUntilDate: existingTaskInDb?.deferredUntilDate ?? null,
            };

            // Create new task or update existing one
            if (existingTaskInDb) {
                transactions.push(tx.tasks[taskId].update(taskData));
            } else {
                transactions.push(tx.tasks[taskId].create(taskData));
            }

            // Link to series (idempotent)
            transactions.push(tx.taskSeries[seriesId].link({ tasks: taskId }));

            // --- HIERARCHY LOGIC ---
            // 1. Find the parent
            // We look backwards in the stack for the first item with a level LESS than currentLevel
            while (stack.length > 0 && stack[stack.length - 1].level >= currentLevel) {
                stack.pop();
            }

            const parent = stack.length > 0 ? stack[stack.length - 1] : null;

            // 2. Determine if we need to update the parent relationship
            // Check the current DB state for this task's parent
            const existingParentId = existingTaskInDb?.parentTask?.[0]?.id;

            if (parent) {
                // Should have a parent
                if (existingParentId !== parent.id) {
                    taskStructureChanged = true;
                    // It changed (or didn't exist).
                    // If it had a different parent before, we should technically unlink it,
                    // but InstantDB 'link' with 'has: one' (forward) usually overwrites or merges.
                    // To be safe and explicit based on best practices for moving items:
                    if (existingParentId) {
                        transactions.push(tx.tasks[taskId].unlink({ parentTask: existingParentId }));
                    }
                    transactions.push(tx.tasks[taskId].link({ parentTask: parent.id }));
                }
            } else {
                // Should NOT have a parent (root level)
                if (existingParentId) {
                    taskStructureChanged = true;
                    transactions.push(tx.tasks[taskId].unlink({ parentTask: existingParentId }));
                }
            }

            // 3. Push self to stack
            stack.push({ id: taskId, level: currentLevel });
        });

        // 2. Handle Deletions
        // Find tasks in DB that are NOT in the current editor content
        const tasksToDelete = dbTasks.filter((t) => !currentIds.has(t.id));

        // Check if any tasks-to-delete have associated data and haven't been
        // confirmed yet. If so, skip their deletion — the filterTransaction
        // plugin or removeTaskCard will prompt the user. We still delete safe
        // tasks (no data or already confirmed).
        const unconfirmedWithData = tasksToDelete.filter(
            (t) => !confirmedDeleteIds.current.has(t.id) && taskHasData(t as TaskLikeForGuard)
        );

        if (unconfirmedWithData.length > 0) {
            // Re-add these tasks back into the editor so they don't get
            // silently lost. For now, just skip deleting them from DB.
            // The user needs to explicitly confirm via the dialog.
            const safeToDelete = tasksToDelete.filter(
                (t) => confirmedDeleteIds.current.has(t.id) || !taskHasData(t as TaskLikeForGuard)
            );
            if (safeToDelete.length > 0) {
                taskStructureChanged = true;
            }
            safeToDelete.forEach((t) => {
                transactions.push(tx.tasks[t.id].delete());
                transactions.push(tx.taskSeries[seriesId].unlink({ tasks: t.id }));
            });
        } else {
            if (tasksToDelete.length > 0) {
                taskStructureChanged = true;
            }
            tasksToDelete.forEach((t) => {
                // Clear from confirmed set after use
                confirmedDeleteIds.current.delete(t.id);
                transactions.push(tx.tasks[t.id].delete());
                transactions.push(tx.taskSeries[seriesId].unlink({ tasks: t.id }));
            });
        }

        // 3. Update Series Metadata
        const now = new Date();

        const seriesUpdate: any = {
            name: taskSeriesName,
            description,
            updatedAt: now,
        };
        const existingFamilyMemberId = getSingleId(seriesDataRef.current?.familyMember);
        const existingScheduledActivityId = getSingleId(seriesDataRef.current?.scheduledActivity);
        const metadataChanged =
            String(seriesDataRef.current?.name || '') !== taskSeriesName ||
            String(seriesDataRef.current?.description || '') !== description ||
            String(existingFamilyMemberId || '') !== String(familyMemberId || '') ||
            String(existingScheduledActivityId || '') !== String(scheduledActivityId || '') ||
            String(seriesDataRef.current?.startDate ? startOfDay(ensureDate(seriesDataRef.current.startDate) || new Date()).toISOString() : '') !==
                String(startDate ? startOfDay(startDate).toISOString() : '') ||
            String(seriesDataRef.current?.targetEndDate ? startOfDay(ensureDate(seriesDataRef.current.targetEndDate) || new Date()).toISOString() : '') !==
                String(targetEndDate ? startOfDay(targetEndDate).toISOString() : '') ||
            (seriesDataRef.current?.workAheadAllowed === true) !== workAheadAllowed;

        // Dates: InstantDB expects Date objects for i.date()
        if (startDate) {
            seriesUpdate.startDate = startDate;
        }
        if (targetEndDate) {
            seriesUpdate.targetEndDate = targetEndDate;
        } else {
            seriesUpdate.targetEndDate = null;
        }

        seriesUpdate.workAheadAllowed = workAheadAllowed;

        // If this is a brand new series, ensure createdAt is set
        if (!seriesData?.createdAt && !hasPersisted) {
            seriesUpdate.createdAt = now;
        }

        transactions.push(tx.taskSeries[seriesId].update(seriesUpdate));

        // Manage links to familyMember and scheduledActivity
        if (familyMemberId) {
            transactions.push(tx.taskSeries[seriesId].link({ familyMember: familyMemberId }));
        } else if (seriesDataRef.current?.familyMember) {
            // FIX: Safely get the ID to unlink, handling possible array structure
            const idToUnlink = getSingleId(seriesDataRef.current.familyMember);
            if (idToUnlink) {
                transactions.push(tx.taskSeries[seriesId].unlink({ familyMember: idToUnlink }));
            }
        }

        // Manage links to scheduledActivity
        if (scheduledActivityId) {
            transactions.push(
                tx.taskSeries[seriesId].link({
                    scheduledActivity: scheduledActivityId,
                })
            );
        } else if (seriesDataRef.current?.scheduledActivity) {
            // FIX: Safely get the ID to unlink, handling possible array structure
            const idToUnlink = getSingleId(seriesDataRef.current.scheduledActivity);
            if (idToUnlink) {
                transactions.push(
                    tx.taskSeries[seriesId].unlink({
                        scheduledActivity: idToUnlink,
                    })
                );
            }
        }

        if (currentUser?.id && (taskStructureChanged || metadataChanged)) {
            const nowMs = now.getTime();
            if (nowMs - lastHistoryEventAtRef.current > 60_000) {
                const historyEvent = buildHistoryEventTransactions({
                    tx,
                    createId: id,
                    occurredAt: now.toISOString(),
                    domain: 'tasks',
                    actionType: !hasPersisted ? 'task_series_created' : 'task_series_updated',
                    summary: !hasPersisted
                        ? `Created task series "${taskSeriesName || 'Untitled'}"`
                        : taskStructureChanged
                          ? `Updated task series "${taskSeriesName || 'Untitled'}" structure`
                          : `Updated task series "${taskSeriesName || 'Untitled'}"`,
                    source: 'manual',
                    actorFamilyMemberId: currentUser.id,
                    affectedFamilyMemberIds: familyMemberId ? [familyMemberId] : [],
                    taskSeriesId: seriesId,
                    metadata: {
                        taskCount: currentIds.size,
                        metadataChanged,
                        taskStructureChanged,
                        seriesName: taskSeriesName || 'Untitled',
                    },
                });
                transactions.push(...historyEvent.transactions);
                lastHistoryEventAtRef.current = nowMs;
            }
        }

        // --- Planned end date lifecycle ---
        // Compute and persist plannedEndDate + baselineDayBreakCount when we have
        // both a linked chore and task structure with day-breaks.
        if (scheduledActivityId && taskStructureChanged) {
            const chore = data?.chores?.find((c: any) => c.id === scheduledActivityId);
            if (chore?.rrule) {
                // Build minimal Task[] for block counting
                const schedulerTasks: SchedulerTask[] = [...dbTasks, ...Array.from(currentIds).filter(tid => !dbTasks.some(t => t.id === tid)).map(tid => {
                    const node = editor?.state.doc.content.content?.find((n: any) => n.attrs?.id === tid);
                    return {
                        id: tid,
                        text: node?.textContent || '',
                        isDayBreak: node?.attrs?.isDayBreak || false,
                        isCompleted: false,
                        order: 0,
                    } as SchedulerTask;
                })].map((t: any) => ({
                    id: t.id,
                    text: t.text || '',
                    isDayBreak: !!t.isDayBreak,
                    isCompleted: !!t.isCompleted,
                    order: typeof t.order === 'number' ? t.order : 0,
                    workflowState: t.workflowState || undefined,
                    parentTask: t.parentTask,
                    subTasks: t.subTasks,
                } as SchedulerTask));

                const totalBlocks = countTaskDayBlocks(schedulerTasks);
                const existingBaseline = seriesDataRef.current?.baselineDayBreakCount;

                if (totalBlocks > 0) {
                    const schedule: ChoreScheduleInfo = {
                        startDate: chore.startDate ? new Date(chore.startDate).toISOString().slice(0, 10) : format(startDate, 'yyyy-MM-dd'),
                        rruleString: chore.rrule,
                        seriesStartDate: startDate ? format(startDate, 'yyyy-MM-dd') : null,
                        exdates: Array.isArray(chore.exdates) ? chore.exdates : [],
                    };

                    if (existingBaseline == null) {
                        // First time: compute fresh planned end date
                        const endDate = computePlannedEndDate(schedule, totalBlocks);
                        if (endDate) {
                            transactions.push(
                                tx.taskSeries[seriesId].update({
                                    plannedEndDate: new Date(endDate + 'T00:00:00Z').valueOf(),
                                    baselineDayBreakCount: totalBlocks,
                                })
                            );
                        }
                    } else if (totalBlocks !== existingBaseline) {
                        // Parent added or removed day-breaks — adjust planned end date
                        const diff = totalBlocks - existingBaseline;
                        const currentPlanned = seriesDataRef.current?.plannedEndDate
                            ? new Date(seriesDataRef.current.plannedEndDate).toISOString().slice(0, 10)
                            : null;

                        if (currentPlanned) {
                            // Re-compute from current planned end + diff occurrences
                            const newEndDate = computePlannedEndDate(schedule, totalBlocks);
                            if (newEndDate) {
                                transactions.push(
                                    tx.taskSeries[seriesId].update({
                                        plannedEndDate: new Date(newEndDate + 'T00:00:00Z').valueOf(),
                                        baselineDayBreakCount: totalBlocks,
                                    })
                                );
                            }
                        }
                    }
                }
            }
        }

        try {
            await db.transact(transactions);

            if (!hasPersisted) {
                setHasPersisted(true); // from now on, always save
            }
        } catch (err: any) {
            console.error('Save failed', err);
            toast({
                title: 'Save failed',
                description: err.message || 'Check console for details',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    }, 1000);

    // FIX: Flush pending saves when the component unmounts (modal closes)
    useEffect(() => {
        return () => {
            debouncedSave.flush();
        };
    }, [debouncedSave]);

    useEffect(() => {
        const flushPendingSave = () => {
            debouncedSave.flush();
        };

        window.addEventListener('pagehide', flushPendingSave);
        return () => {
            window.removeEventListener('pagehide', flushPendingSave);
        };
    }, [debouncedSave]);

    const triggerSave = useCallback(() => {
        if (editor) {
            debouncedSave(editor.getJSON());
        }
    }, [editor, debouncedSave]);

    const syncEditorSurface = useCallback(() => {
        if (!editor || editor.isDestroyed) return;
        const nextJson = editor.getJSON();
        setEditorDocument(nextJson);
        calculateDatesRef.current(nextJson);
        debouncedSave(nextJson);
    }, [debouncedSave, editor]);

    const appendTaskCard = useCallback(() => {
        if (!editor || editor.isDestroyed) return;

        const insertPos = editor.state.doc.content.size;
        const nextTaskId = id();
        const inserted = editor.chain().focus().insertContentAt(insertPos, buildEmptyTaskNode(nextTaskId)).setTextSelection(insertPos + 1).run();

        if (inserted) {
            setMobilePane('cards');
            syncEditorSurface();
        }
    }, [editor, syncEditorSurface]);

    const appendDayBreakSection = useCallback(() => {
        if (!editor || editor.isDestroyed) return;

        const insertPos = editor.state.doc.content.size;
        const breakId = id();
        const nextTaskId = id();
        const inserted = editor
            .chain()
            .focus()
            .insertContentAt(insertPos, [buildDayBreakNode(breakId, 0), buildEmptyTaskNode(nextTaskId, 0)])
            .setTextSelection(insertPos + 3)
            .run();

        if (inserted) {
            setMobilePane('cards');
            syncEditorSurface();
        }
    }, [editor, syncEditorSurface]);

    const insertTaskBelow = useCallback(
        (taskId: string) => {
            if (!editor || editor.isDestroyed) return;

            const nodes = getTopLevelTaskNodes(editor);
            const anchor = nodes.find((item) => item.node?.attrs?.id === taskId);
            const indentationLevel = anchor?.node?.attrs?.indentationLevel || 0;
            const insertPos = getInsertPositionAfterTaskSubtree(editor, taskId);
            const nextTaskId = id();
            const inserted = editor
                .chain()
                .focus()
                .insertContentAt(insertPos, buildEmptyTaskNode(nextTaskId, indentationLevel))
                .setTextSelection(insertPos + 1)
                .run();

            if (inserted) {
                syncEditorSurface();
            }
        },
        [editor, syncEditorSurface]
    );

    const insertDayBreakBelow = useCallback(
        (taskId: string) => {
            if (!editor || editor.isDestroyed) return;

            const nodes = getTopLevelTaskNodes(editor);
            const anchor = nodes.find((item) => item.node?.attrs?.id === taskId);
            const indentationLevel = anchor?.node?.attrs?.indentationLevel || 0;
            const insertPos = getInsertPositionAfterTaskSubtree(editor, taskId);
            const breakId = id();
            const nextTaskId = id();
            const inserted = editor
                .chain()
                .focus()
                .insertContentAt(insertPos, [buildDayBreakNode(breakId, indentationLevel), buildEmptyTaskNode(nextTaskId, indentationLevel)])
                .setTextSelection(insertPos + 3)
                .run();

            if (inserted) {
                syncEditorSurface();
            }
        },
        [editor, syncEditorSurface]
    );

    const updateTaskTitle = useCallback(
        (taskId: string, value: string) => {
            if (!editor || editor.isDestroyed) return;

            // Use a direct ProseMirror transaction instead of editor.chain().focus()
            // to avoid stealing focus from the card's <Input> field.
            const { state } = editor;
            let pos = 0;

            for (let index = 0; index < state.doc.childCount; index += 1) {
                const node = state.doc.child(index);
                if (node.type.name === 'taskItem' && node.attrs.id === taskId) {
                    const replacement = node.type.create(node.attrs, value ? [state.schema.text(value)] : undefined);
                    const tr = state.tr.replaceWith(pos, pos + node.nodeSize, replacement);
                    editor.view.dispatch(tr);
                    syncEditorSurface();
                    return;
                }
                pos += node.nodeSize;
            }
        },
        [editor, syncEditorSurface]
    );

    const executeRemoveTaskCard = useCallback(
        (taskId: string) => {
            if (!editor || editor.isDestroyed) return;

            const removed = editor
                .chain()
                .focus()
                .command(({ state, dispatch }) => {
                    let pos = 0;

                    for (let index = 0; index < state.doc.childCount; index += 1) {
                        const node = state.doc.child(index);
                        if (node.type.name === 'taskItem' && node.attrs.id === taskId) {
                            if (dispatch) {
                                const tr = state.tr.delete(pos, pos + node.nodeSize);
                                tr.setMeta('skipDeleteGuard', true);
                                dispatch(tr);
                            }
                            return true;
                        }
                        pos += node.nodeSize;
                    }

                    return false;
                })
                .run();

            if (removed) {
                if (historyTaskId === taskId) {
                    setHistoryTaskId(null);
                }
                syncEditorSurface();
            }
        },
        [editor, historyTaskId, syncEditorSurface]
    );

    const removeTaskCard = useCallback(
        (taskId: string) => {
            // Check if this task has associated data
            const task = persistedTaskById.get(taskId);
            if (task && taskHasData(task as TaskLikeForGuard)) {
                const impact = computeDeletionImpact([taskId], persistedTaskById as Map<string, TaskLikeForGuard>);
                setDeleteConfirm({
                    taskIds: [taskId],
                    tasksWithData: impact.tasksWithData,
                    message: impact.message,
                    onConfirm: () => {
                        confirmedDeleteIds.current.add(taskId);
                        setDeleteConfirm(null);
                        executeRemoveTaskCard(taskId);
                    },
                });
                return;
            }
            executeRemoveTaskCard(taskId);
        },
        [persistedTaskById, executeRemoveTaskCard]
    );

    const handleClose = useCallback(async () => {
        if (editor) {
            debouncedSave(editor.getJSON());
        }

        await debouncedSave.flush();
        onClose?.();
    }, [debouncedSave, editor, onClose]);

    // --- Render ---
    if (isLoading && !hasHydrated.current) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="animate-spin" />
            </div>
        );
    }

    return (
        <div data-testid="task-series-editor-root" className={cn('mx-auto w-full max-w-none space-y-6 px-4 py-6 sm:px-6 xl:px-8 2xl:px-10', className)}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold">Task Series Editor</h1>
                    {hasPersisted ? (
                        <>
                            <Link href={`/task-series/review?seriesId=${seriesId}`}>
                                <Button variant="outline" size="sm">
                                    View Task Bins
                                </Button>
                            </Link>
                            <Link href={`/history?domain=tasks&taskSeriesId=${seriesId}`}>
                                <Button variant="outline" size="sm">
                                    View History
                                </Button>
                            </Link>
                        </>
                    ) : null}
                </div>
                <div className="text-sm text-muted-foreground">{isSaving ? 'Saving...' : 'Saved'}</div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">Series Name</label>
                        <Input
                            value={taskSeriesName}
                            onChange={(e) => {
                                setTaskSeriesName(e.target.value);
                                triggerSave();
                            }}
                            placeholder="7th Grade Math..."
                            className="mt-1"
                        />
                    </div>

                    <div>
                        <label className="text-sm font-medium">Description</label>
                        <textarea
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            rows={3}
                            value={description}
                            onChange={(e) => {
                                setDescription(e.target.value);
                                triggerSave();
                            }}
                            placeholder="Describe this task series (e.g., full 7th grade math curriculum)..."
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium">Assignee</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={familyMemberId || ''}
                                onChange={(e) => {
                                    setFamilyMemberId(e.target.value || null);
                                    triggerSave();
                                }}
                            >
                                <option value="">Unassigned</option>
                                {data?.familyMembers?.map((fm: any) => (
                                    <option key={fm.id} value={fm.id}>
                                        {fm.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-sm font-medium">Scheduled Activity</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={scheduledActivityId || ''}
                                onChange={(e) => {
                                    setScheduledActivityId(e.target.value || null);
                                    triggerSave();
                                }}
                            >
                                <option value="">Not linked</option>
                                {data?.chores?.map((chore: any) => (
                                    <option key={chore.id} value={chore.id}>
                                        {chore.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium">Start Date</label>
                            <Input
                                type="date"
                                value={startDate ? format(startDate, 'yyyy-MM-dd') : ''}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        setStartDate(startOfDay(parseISO(e.target.value)));
                                        triggerSave();
                                    }
                                }}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-medium">Target End Date (optional)</label>
                            <Input
                                type="date"
                                value={targetEndDate ? format(targetEndDate, 'yyyy-MM-dd') : ''}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        setTargetEndDate(startOfDay(parseISO(e.target.value)));
                                    } else {
                                        setTargetEndDate(null);
                                    }
                                    triggerSave();
                                }}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                        <Switch
                            checked={workAheadAllowed}
                            onCheckedChange={(checked: boolean) => {
                                setWorkAheadAllowed(checked);
                                triggerSave();
                            }}
                        />
                        <label className="text-sm font-medium">Allow work-ahead (pull forward)</label>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 p-1 lg:hidden">
                <button
                    type="button"
                    onClick={() => setMobilePane('bulk')}
                    className={cn(
                        'flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors',
                        mobilePane === 'bulk' ? 'bg-slate-900 text-white' : 'text-slate-600'
                    )}
                >
                    Bulk editor
                </button>
                <button
                    type="button"
                    onClick={() => setMobilePane('cards')}
                    className={cn(
                        'flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors',
                        mobilePane === 'cards' ? 'bg-slate-900 text-white' : 'text-slate-600'
                    )}
                >
                    Task cards
                </button>
            </div>

            <div
                data-testid="task-series-editor-layout"
                className="grid items-start gap-6 min-[1600px]:grid-cols-[minmax(0,38rem)_minmax(0,1fr)]"
            >
                <section className={cn('min-w-0', mobilePane === 'cards' ? 'hidden lg:block' : 'block')}>
                    <div className="mb-3 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Quick / bulk entry</h2>
                                <p className="text-sm text-slate-500">Paste a long list, indent it, reorder it, and use slash commands when you want speed.</p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="hidden lg:inline-flex min-[1600px]:hidden"
                                aria-expanded={!isBulkEditorCollapsed}
                                aria-controls="task-series-bulk-editor-panel"
                                onClick={() => setIsBulkEditorCollapsed((current) => !current)}
                            >
                                {isBulkEditorCollapsed ? 'Expand bulk editor' : 'Collapse bulk editor'}
                            </Button>
                        </div>
                    </div>

                    <div
                        id="task-series-bulk-editor-panel"
                        data-testid="task-series-bulk-editor-panel"
                        data-collapsed={isBulkEditorCollapsed ? 'true' : 'false'}
                        className={cn(isBulkEditorCollapsed ? 'block lg:hidden min-[1600px]:block' : 'block')}
                    >
                        <div
                            ref={editorRef}
                            className="relative flex min-h-[500px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
                            onDragOver={(e) => e.preventDefault()}
                        >
                            {dropState && dropState.isActive && (
                                <div
                                    className="absolute pointer-events-none z-50 transition-all duration-75 ease-out"
                                    style={{
                                        top: dropState.top,
                                        left: dropState.left,
                                        width: dropState.width,
                                    }}
                                >
                                    <div className="relative w-full border-t-2 border-blue-500">
                                        <div className="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-blue-500" />
                                    </div>
                                </div>
                            )}

                            <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-3 text-xs font-medium text-slate-500">
                                <div className="flex">
                                    <div className="w-20 pr-3 text-right">Date</div>
                                    <div>Task</div>
                                </div>
                            </div>

                            <TaskDateContext.Provider value={taskDateMap}>
                                <div style={isDraggingGlobal ? { caretColor: 'transparent' } : undefined}>
                                    <EditorContent editor={editor} />
                                </div>
                            </TaskDateContext.Provider>
                            <TaskDetailsPopover editor={editor} taskDateMap={taskDateMap} />
                        </div>
                    </div>

                    {isBulkEditorCollapsed ? (
                        <div className="hidden rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-500 lg:block min-[1600px]:hidden">
                            Bulk editor collapsed. Expand it when you want to paste, indent, or reorder a longer task list.
                        </div>
                    ) : null}
                </section>

                <section className={cn('min-w-0', mobilePane === 'bulk' ? 'hidden lg:block' : 'block')}>
                    <div className="mb-3 rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Task cards</h2>
                                <p className="text-sm text-slate-500">Everything here mirrors the bulk editor live. Creation-time metadata stays editable on the cards.</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                                        {taskCount} task{taskCount === 1 ? '' : 's'}
                                    </span>
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                                        {dayBreakCount} day break{dayBreakCount === 1 ? '' : 's'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" onClick={appendTaskCard}>
                                    Add task
                                </Button>
                                <Button type="button" variant="outline" onClick={appendDayBreakSection}>
                                    Add day break
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {cardItems.map((item) =>
                            item.isDayBreak ? (
                                <div key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex min-w-0 flex-1 items-center gap-3">
                                            <div className="h-px flex-1 bg-amber-200" />
                                            <span className="rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                                                Day break
                                            </span>
                                            <div className="h-px flex-1 bg-amber-200" />
                                        </div>
                                        {item.dateValue ? <span className="text-xs text-amber-700/80">{formatTaskMetaDate(item.dateValue)}</span> : null}
                                        <button
                                            type="button"
                                            onClick={() => removeTaskCard(item.id)}
                                            className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-700 transition-colors hover:border-amber-400"
                                        >
                                            Remove break
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <TaskSeriesCard
                                    key={item.id}
                                    db={db}
                                    seriesId={seriesId}
                                    item={item}
                                    historyOpen={historyTaskId === item.id}
                                    onToggleHistory={(taskId) => setHistoryTaskId((current) => (current === taskId ? null : taskId))}
                                    onDeleteTask={removeTaskCard}
                                    onAddTaskBelow={insertTaskBelow}
                                    onAddDayBreakBelow={insertDayBreakBelow}
                                    onTitleChange={updateTaskTitle}
                                />
                            )
                        )}
                    </div>
                </section>
            </div>

            {onClose ? (
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => void handleClose()}>
                        Close
                    </Button>
                </div>
            ) : null}

            {/* Task delete confirmation dialog */}
            <TaskDeleteConfirmDialog
                open={deleteConfirm !== null}
                tasksWithData={deleteConfirm?.tasksWithData || []}
                message={deleteConfirm?.message || ''}
                onConfirm={() => deleteConfirm?.onConfirm()}
                onCancel={() => setDeleteConfirm(null)}
            />
        </div>
    );
};

export default TaskSeriesEditor;
