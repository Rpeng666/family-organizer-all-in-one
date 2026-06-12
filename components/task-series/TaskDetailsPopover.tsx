'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { autoUpdate, flip, offset, shift, useFloating } from '@floating-ui/react-dom';
import { id as generateId, tx } from '@instantdb/react';
import { ChevronLeft, ChevronRight, Loader2, Trash2, Upload } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useDebouncedCallback } from 'use-debounce';

import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { ResponseFieldEditor } from '@/components/task-series/ResponseFieldEditor';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { uploadFilesToS3 } from '@/lib/file-uploads';
import { cn } from '@/lib/utils';

import {
    dispatchCloseTaskDetails,
    findAdjacentTaskDetailsTarget,
    formatTaskSeriesShortcutLabel,
    matchesTaskSeriesShortcut,
    openAdjacentTaskDetails,
    TASK_SERIES_CLOSE_DETAILS_EVENT,
    TASK_SERIES_OPEN_DETAILS_EVENT,
    type TaskSeriesCloseDetailsPayload,
    type TaskSeriesNavigationDirection,
    type TaskSeriesOpenDetailsPayload,
    type TaskSeriesSelectionSnapshot,
} from './taskSeriesCommands';

type TaskDateMap = Record<string, { label: string; date: Date } | undefined>;

const POSITION_TRANSITION = 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)';
const CONTENT_TRANSITION = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';

const getTaskDetailsTriggerElement = (editor: Editor | null, taskPos: number) => {
    if (!editor || editor.isDestroyed) return null;

    const nodeDom = editor.view.nodeDOM(taskPos);
    if (!(nodeDom instanceof HTMLElement)) return null;

    return nodeDom.querySelector<HTMLElement>('[data-task-details-trigger="true"]');
};

const restoreEditorSelection = (editor: Editor | null, selection: TaskSeriesSelectionSnapshot | null) => {
    if (!editor || editor.isDestroyed || !selection) return;

    const target = selection.anchor === selection.head ? selection.anchor : { from: selection.anchor, to: selection.head };
    editor.chain().focus().setTextSelection(target).run();
};

const TaskMetadataManager = ({
    taskId,
    registerPendingSaveFlush,
}: {
    taskId: string;
    registerPendingSaveFlush?: (flushFn: null | (() => Promise<void>)) => void;
}) => {
    const { data, isLoading } = db.useQuery({
        tasks: {
            $: { where: { id: taskId } },
            attachments: {},
            responseFields: {},
        },
    });

    const task = data?.tasks?.[0] as
        | {
              id: string;
              notes?: string | null;
              weight?: number | null;
              attachments?: Array<{ id: string; name?: string; url?: string; type?: string }>;
              responseFields?: Array<{
                  id: string;
                  type: string;
                  label: string;
                  description?: string | null;
                  weight: number;
                  required: boolean;
                  order: number;
              }>;
          }
        | undefined;
    const [notes, setNotes] = useState(task?.notes || '');
    const [uploading, setUploading] = useState(false);
    const notesRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        if (task) {
            setNotes(task.notes || '');
        }
    }, [task?.notes]);

    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            const textarea = notesRef.current;
            if (!textarea) return;

            textarea.focus({ preventScroll: true });
            const cursorPosition = textarea.value.length;
            textarea.setSelectionRange(cursorPosition, cursorPosition);
        });

        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [taskId]);

    const saveNotes = useDebouncedCallback((newNotes: string) => {
        db.transact(tx.tasks[taskId].update({ notes: newNotes }));
    }, 1000);

    const flushPendingNotes = useCallback(async () => {
        const flush = (saveNotes as typeof saveNotes & { flush?: () => unknown | Promise<unknown> }).flush;
        if (typeof flush === 'function') {
            await flush();
        }
    }, [saveNotes]);

    useEffect(() => {
        registerPendingSaveFlush?.(flushPendingNotes);

        return () => {
            registerPendingSaveFlush?.(null);
            void flushPendingNotes();
        };
    }, [flushPendingNotes, registerPendingSaveFlush]);

    const handleNotesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = event.target.value;
        setNotes(value);
        saveNotes(value);
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const [uploadedAttachment] = await uploadFilesToS3([file], generateId);
            if (!uploadedAttachment) throw new Error('Upload failed');

            const attachmentId = uploadedAttachment.id;
            db.transact([
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
                tx.tasks[taskId].link({ attachments: attachmentId }),
            ]);
        } catch (error) {
            console.error('File upload error:', error);
            alert('Failed to upload file.');
        } finally {
            setUploading(false);
            event.target.value = '';
        }
    };

    const handleDeleteAttachment = (attachmentId: string) => {
        if (confirm('Are you sure you want to remove this attachment?')) {
            db.transact(tx.taskAttachments[attachmentId].delete());
        }
    };

    if (isLoading) {
        return <div className="p-4 text-xs text-muted-foreground">Loading details...</div>;
    }

    const saveWeight = useDebouncedCallback((newWeight: number) => {
        db.transact(tx.tasks[taskId].update({ weight: newWeight }));
    }, 1000);

    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-700">Notes</label>
                <textarea
                    ref={notesRef}
                    className="w-full min-h-[100px] p-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white/50 resize-y"
                    placeholder="Add details, instructions, or context..."
                    value={notes}
                    onChange={handleNotesChange}
                />
                <div className="text-[10px] text-gray-400 text-right">Auto-saved</div>
            </div>

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700">Attachments</label>
                    <label className="cursor-pointer text-xs flex items-center gap-1 text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded transition-colors">
                        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        <span>{uploading ? 'Uploading...' : 'Upload'}</span>
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                    </label>
                </div>

                <div className="flex flex-col gap-2 max-h-[150px] overflow-y-auto pr-1">
                    {task?.attachments?.length === 0 && (
                        <div className="text-xs text-gray-400 italic py-2 text-center border border-dashed rounded">No files attached</div>
                    )}
                    {task?.attachments?.length ? <AttachmentCollection attachments={task.attachments} variant="compact" /> : null}
                    {task?.attachments?.map((file: any) => (
                        <div key={`${file.id}-remove`} className="group flex items-center justify-between gap-2 rounded border bg-white px-2 py-1.5 text-xs">
                            <span className="min-w-0 flex-1 truncate text-slate-600">{file.name}</span>
                            <button
                                type="button"
                                onClick={() => handleDeleteAttachment(file.id)}
                                className="text-gray-400 transition-colors hover:text-red-500"
                            >
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="border-t border-gray-100 pt-3">
                <ResponseFieldEditor taskId={taskId} responseFields={task?.responseFields || []} />
            </div>

            <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-700">Task Weight</label>
                    <input
                        type="number"
                        min={0}
                        className="w-16 rounded border border-gray-200 bg-white/50 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        defaultValue={task?.weight ?? 0}
                        onChange={(e) => saveWeight(Math.max(0, Number(e.target.value) || 0))}
                    />
                    <span className="text-[10px] text-gray-400">For series grade weighting</span>
                </div>
            </div>
        </div>
    );
};

export function TaskDetailsPopover({ editor, taskDateMap }: { editor: Editor | null; taskDateMap: TaskDateMap }) {
    const [activeDetails, setActiveDetails] = useState<TaskSeriesOpenDetailsPayload | null>(null);
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
    const [positionShouldAnimate, setPositionShouldAnimate] = useState(false);
    const [contentMotionKey, setContentMotionKey] = useState(0);
    const [contentDirection, setContentDirection] = useState<TaskSeriesNavigationDirection>('next');
    const [contentAtRest, setContentAtRest] = useState(true);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const restoreSelectionRef = useRef<TaskSeriesSelectionSnapshot | null>(null);
    const pendingSaveFlushRef = useRef<null | (() => Promise<void>)>(null);

    const { refs, floatingStyles } = useFloating({
        open: !!activeDetails,
        placement: 'bottom-end',
        strategy: 'fixed',
        whileElementsMounted: autoUpdate,
        middleware: [offset(10), shift({ padding: 16 }), flip({ padding: 16 })],
    });

    useLayoutEffect(() => {
        refs.setReference(anchorElement);
    }, [anchorElement, refs]);

    const registerPendingSaveFlush = useCallback((flushFn: null | (() => Promise<void>)) => {
        pendingSaveFlushRef.current = flushFn;
    }, []);

    const flushPendingEdits = useCallback(async () => {
        await pendingSaveFlushRef.current?.();
    }, []);

    const requestClose = useCallback(
        async (restoreSelection: boolean) => {
            await flushPendingEdits();
            dispatchCloseTaskDetails({ restoreSelection });
        },
        [flushPendingEdits]
    );

    const navigateTaskDetails = useCallback(
        async (direction: TaskSeriesNavigationDirection) => {
            if (!editor || !activeDetails) return;

            await flushPendingEdits();
            openAdjacentTaskDetails(editor, activeDetails.taskPos, direction);
        },
        [activeDetails, editor, flushPendingEdits]
    );

    useLayoutEffect(() => {
        if (!editor || !activeDetails) {
            setAnchorElement(null);
            return;
        }

        setAnchorElement(getTaskDetailsTriggerElement(editor, activeDetails.taskPos));
    }, [activeDetails?.taskPos, editor]);

    useEffect(() => {
        if (!activeDetails) return;
        if (contentAtRest) return;

        const frame = window.requestAnimationFrame(() => {
            setContentAtRest(true);
        });

        return () => {
            window.cancelAnimationFrame(frame);
        };
    }, [activeDetails, contentAtRest]);

    useEffect(() => {
        const handleOpen = (event: Event) => {
            const detail = (event as CustomEvent<TaskSeriesOpenDetailsPayload>).detail;
            if (!detail) return;

            restoreSelectionRef.current = detail.selection;
            setAnchorElement(getTaskDetailsTriggerElement(editor, detail.taskPos));
            setActiveDetails((currentDetails) => {
                const isAdjacentMove = !!currentDetails && currentDetails.taskPos !== detail.taskPos;
                setPositionShouldAnimate(isAdjacentMove);

                if (currentDetails && currentDetails.taskPos !== detail.taskPos) {
                    setContentDirection(detail.taskPos > currentDetails.taskPos ? 'next' : 'previous');
                    setContentAtRest(false);
                    setContentMotionKey((currentKey) => currentKey + 1);
                } else {
                    setContentAtRest(true);
                }

                return detail;
            });
        };

        const handleClose = (event: Event) => {
            const detail = (event as CustomEvent<TaskSeriesCloseDetailsPayload>).detail;
            const shouldRestoreSelection = !!detail?.restoreSelection;

            setActiveDetails(null);
            setAnchorElement(null);
            setPositionShouldAnimate(false);
            setContentAtRest(true);

            const selectionToRestore = restoreSelectionRef.current;
            restoreSelectionRef.current = null;

            if (shouldRestoreSelection) {
                restoreEditorSelection(editor, selectionToRestore);
            }
        };

        window.addEventListener(TASK_SERIES_OPEN_DETAILS_EVENT, handleOpen as EventListener);
        window.addEventListener(TASK_SERIES_CLOSE_DETAILS_EVENT, handleClose as EventListener);

        return () => {
            window.removeEventListener(TASK_SERIES_OPEN_DETAILS_EVENT, handleOpen as EventListener);
            window.removeEventListener(TASK_SERIES_CLOSE_DETAILS_EVENT, handleClose as EventListener);
        };
    }, [editor]);

    const previousTaskTarget = useMemo(() => {
        if (!editor || !activeDetails) return null;
        return findAdjacentTaskDetailsTarget(editor, activeDetails.taskPos, 'previous');
    }, [activeDetails, editor]);

    const nextTaskTarget = useMemo(() => {
        if (!editor || !activeDetails) return null;
        return findAdjacentTaskDetailsTarget(editor, activeDetails.taskPos, 'next');
    }, [activeDetails, editor]);

    useEffect(() => {
        if (!activeDetails || !editor) return;

        const handlePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;

            if (panelRef.current?.contains(target)) return;
            if (target.closest('[data-task-details-trigger="true"]')) return;

            void requestClose(false);
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target;
            const targetNode = target instanceof Node ? target : null;
            const targetIsInPanel = !!(targetNode && panelRef.current?.contains(targetNode));
            const targetIsInEditor = !!(targetNode && editor.view.dom.contains(targetNode));
            const targetIsTrigger = !!(target instanceof HTMLElement && target.closest('[data-task-details-trigger="true"]'));

            if (!targetIsInPanel && !targetIsInEditor && !targetIsTrigger) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                void requestClose(true);
                return;
            }

            if (!targetIsInPanel && !targetIsTrigger) {
                return;
            }

            if (matchesTaskSeriesShortcut(event, 'Ctrl-Alt-,')) {
                if (!previousTaskTarget) return;
                event.preventDefault();
                void navigateTaskDetails('previous');
                return;
            }

            if (matchesTaskSeriesShortcut(event, 'Ctrl-Alt-.')) {
                if (!nextTaskTarget) return;
                event.preventDefault();
                void navigateTaskDetails('next');
            }
        };

        document.addEventListener('pointerdown', handlePointerDown, true);
        document.addEventListener('keydown', handleKeyDown, true);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true);
            document.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [activeDetails, editor, navigateTaskDetails, nextTaskTarget, previousTaskTarget, requestClose]);

    if (!activeDetails || !anchorElement || typeof document === 'undefined') {
        return null;
    }

    const currentTaskDate = activeDetails.taskId ? taskDateMap[activeDetails.taskId] : undefined;
    const previousShortcutLabel = formatTaskSeriesShortcutLabel('Ctrl-Alt-,');
    const nextShortcutLabel = formatTaskSeriesShortcutLabel('Ctrl-Alt-.');
    const contentStartTransform = contentDirection === 'next' ? 'translateX(18px)' : 'translateX(-18px)';

    return createPortal(
        <div
            ref={refs.setFloating}
            style={{
                ...floatingStyles,
                transition: positionShouldAnimate ? POSITION_TRANSITION : undefined,
            }}
            className="z-50"
        >
            <div
                ref={panelRef}
                role="dialog"
                aria-label="Task Details"
                className="w-80 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.45)] backdrop-blur-sm"
            >
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h4 className="font-medium leading-none">Task Details</h4>
                        <div className="flex items-center gap-1">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2"
                                disabled={!previousTaskTarget}
                                onClick={() => void navigateTaskDetails('previous')}
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                <span>Prev</span>
                                <span className="text-[10px] text-muted-foreground">{previousShortcutLabel}</span>
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2"
                                disabled={!nextTaskTarget}
                                onClick={() => void navigateTaskDetails('next')}
                            >
                                <span>Next</span>
                                <ChevronRight className="h-3.5 w-3.5" />
                                <span className="text-[10px] text-muted-foreground">{nextShortcutLabel}</span>
                            </Button>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50/70">
                        <div
                            key={`${activeDetails.taskId ?? activeDetails.taskPos}-${contentMotionKey}`}
                            className={cn('min-h-[260px] px-3 py-3')}
                            style={{
                                transform: contentAtRest ? 'translateX(0)' : contentStartTransform,
                                transition: CONTENT_TRANSITION,
                            }}
                        >
                            <div className="text-xs text-gray-400 pb-3 border-b mb-3 space-y-1">
                                <div>Task ID: {activeDetails.taskId ? `${activeDetails.taskId.slice(0, 8)}...` : 'Pending ID'}</div>
                                {currentTaskDate?.date && <div>Assigned Date: {currentTaskDate.date.toDateString()}</div>}
                            </div>

                            {activeDetails.taskId ? (
                                <TaskMetadataManager taskId={activeDetails.taskId} registerPendingSaveFlush={registerPendingSaveFlush} />
                            ) : (
                                <div className="p-4 text-xs text-muted-foreground">This task is still getting an ID. Try again in a moment.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
