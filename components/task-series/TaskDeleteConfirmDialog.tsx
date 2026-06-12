// components/task-series/TaskDeleteConfirmDialog.tsx
'use client';

import React from 'react';
import { AlertTriangle, FileText, History, Paperclip, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskDataSummary } from '@/lib/task-data-guard';

interface Props {
    open: boolean;
    /** Summary of tasks that have associated data. */
    tasksWithData: TaskDataSummary[];
    /** Human-readable summary message. */
    message: string;
    /** Called when the user confirms deletion. */
    onConfirm: () => void;
    /** Called when the user cancels. */
    onCancel: () => void;
}

export const TaskDeleteConfirmDialog: React.FC<Props> = ({
    open,
    tasksWithData,
    message,
    onConfirm,
    onCancel,
}) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* Dialog */}
            <div className="relative z-10 mx-4 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                {/* Icon */}
                <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-full bg-amber-100 p-2.5">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">
                        Delete tasks with data?
                    </h3>
                </div>

                {/* Message */}
                <p className="mb-4 text-sm text-slate-600">{message}</p>

                {/* Task list with data summary */}
                {tasksWithData.length > 0 && (
                    <div className="mb-5 max-h-48 space-y-2 overflow-y-auto">
                        {tasksWithData.map((task) => (
                            <div
                                key={task.taskId}
                                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                            >
                                <div className="text-sm font-medium text-slate-800 truncate">
                                    {task.taskText}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                    {task.updateCount > 0 && (
                                        <span className="flex items-center gap-1">
                                            <History className="h-3 w-3" />
                                            {task.updateCount} update{task.updateCount === 1 ? '' : 's'}
                                        </span>
                                    )}
                                    {task.attachmentCount > 0 && (
                                        <span className="flex items-center gap-1">
                                            <Paperclip className="h-3 w-3" />
                                            {task.attachmentCount} file{task.attachmentCount === 1 ? '' : 's'}
                                        </span>
                                    )}
                                    {task.responseFieldCount > 0 && (
                                        <span className="flex items-center gap-1">
                                            <FileText className="h-3 w-3" />
                                            {task.responseFieldCount} response field{task.responseFieldCount === 1 ? '' : 's'}
                                        </span>
                                    )}
                                    {task.hasNotes && (
                                        <span className="flex items-center gap-1">
                                            <StickyNote className="h-3 w-3" />
                                            notes
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        onClick={onConfirm}
                    >
                        Delete anyway
                    </Button>
                </div>
            </div>
        </div>
    );
};
