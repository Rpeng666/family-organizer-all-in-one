'use client';

import React from 'react';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { GradeDisplay } from '@/components/responses/GradeDisplay';
import { cn } from '@/lib/utils';
import {
    getTaskUpdateActorName,
    getTaskUpdateFeedbackReplies,
    getTaskStatusLabel,
    taskUpdateHasStateTransition,
    type TaskUpdateLike,
    type TaskWorkflowState,
} from '@/lib/task-progress';

function formatTimestamp(value: number | string | Date | null | undefined): string {
    if (!value) return '';
    const date = typeof value === 'number' ? new Date(value) : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
}

function resolveField(
    field: NonNullable<NonNullable<TaskUpdateLike['responseFieldValues']>[number]>['field'],
) {
    if (!field) return null;
    if (Array.isArray(field)) return field[0] ?? null;
    return field;
}

function resolveGradeType(entry: TaskUpdateLike | null | undefined) {
    const gradeType = entry?.gradeType;
    if (!gradeType) return null;
    if (Array.isArray(gradeType)) return (gradeType[0] as any) || null;
    return gradeType as any;
}

export const TaskResponseFieldValuesList: React.FC<{
    responseFieldValues?: TaskUpdateLike['responseFieldValues'];
    className?: string;
    itemClassName?: string;
    contentClassName?: string;
}> = ({
    responseFieldValues,
    className,
    itemClassName,
    contentClassName = 'text-sm text-slate-700',
}) => {
    const visibleValues = (responseFieldValues || []).filter((value) => {
        const richText = value.richTextContent?.trim() || '';
        const hasRichText = richText.length > 0 && richText !== '<p></p>';
        const hasFile = Boolean(value.fileUrl);
        return hasRichText || hasFile;
    });

    if (visibleValues.length === 0) return null;

    return (
        <div className={cn('space-y-1.5', className)}>
            {visibleValues.map((value, index) => {
                const resolvedField = resolveField(value.field);
                const fieldLabel = resolvedField?.label || 'Response';
                const isGenericLabel = fieldLabel.toLowerCase().replace(/[\s_-]+/g, '') === 'richtext';

                return (
                    <div
                        key={value.id || index}
                        className={cn('rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2', itemClassName)}
                    >
                        {!isGenericLabel ? (
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                {fieldLabel}
                            </div>
                        ) : null}
                        {value.richTextContent && value.richTextContent !== '<p></p>' ? (
                            <div
                                className={cn('prose prose-sm mt-1 max-w-none', contentClassName)}
                                dangerouslySetInnerHTML={{ __html: value.richTextContent }}
                            />
                        ) : null}
                        {value.fileUrl ? (
                            <div className="mt-1.5">
                                <AttachmentCollection
                                    attachments={[
                                        {
                                            id: value.id || `response-file-${index}`,
                                            name: value.fileName || 'File',
                                            type: value.fileType || '',
                                            url: value.fileUrl,
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
};

export const TaskFeedbackReplies: React.FC<{
    replies?: TaskUpdateLike[] | null;
    className?: string;
    tone?: 'indigo' | 'slate';
}> = ({ replies, className, tone = 'indigo' }) => {
    const visibleReplies = getTaskUpdateFeedbackReplies(replies as TaskUpdateLike[] | null | undefined);
    if (visibleReplies.length === 0) return null;

    const toneClasses =
        tone === 'indigo'
            ? {
                  card: 'border-indigo-200 bg-indigo-50/50',
                  accent: 'border-indigo-300',
                  meta: 'text-indigo-700',
              }
            : {
                  card: 'border-slate-200 bg-slate-50/80',
                  accent: 'border-slate-300',
                  meta: 'text-slate-700',
              };

    return (
        <div className={cn('space-y-2', className)}>
            {visibleReplies.map((reply) => {
                const actorName = getTaskUpdateActorName(reply);
                const timestamp = formatTimestamp(reply.createdAt);
                const gradeType = resolveGradeType(reply);
                const hasStateTransition = taskUpdateHasStateTransition(reply);
                const fromState = reply.fromState ? getTaskStatusLabel(reply.fromState as TaskWorkflowState) : null;
                const toState = reply.toState ? getTaskStatusLabel(reply.toState as TaskWorkflowState) : null;

                return (
                    <div
                        key={reply.id}
                        className={cn(
                            'rounded-lg border-l-2 px-3 py-2',
                            toneClasses.card,
                            toneClasses.accent
                        )}
                    >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                            {actorName ? (
                                <span className={cn('font-medium', toneClasses.meta)}>{actorName}</span>
                            ) : null}
                            {timestamp ? <span className="text-slate-400">{timestamp}</span> : null}
                        </div>
                        {hasStateTransition && toState ? (
                            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 font-semibold text-slate-700">
                                    {toState}
                                </span>
                                {fromState && fromState !== toState ? (
                                    <span className="text-slate-400">from {fromState}</span>
                                ) : null}
                            </div>
                        ) : null}
                        {(reply.gradeDisplayValue != null || reply.gradeNumericValue != null) && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                {reply.gradeNumericValue != null ? (
                                    <GradeDisplay
                                        numericValue={reply.gradeNumericValue}
                                        displayValue={reply.gradeDisplayValue || String(reply.gradeNumericValue)}
                                        gradeType={gradeType}
                                        size="sm"
                                    />
                                ) : (
                                    <span className="text-sm font-semibold text-emerald-700">
                                        {reply.gradeDisplayValue}
                                    </span>
                                )}
                                {reply.gradeIsProvisional ? (
                                    <span className="text-[11px] text-amber-700">(provisional)</span>
                                ) : null}
                            </div>
                        )}
                        {reply.note ? (
                            <div className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">
                                {reply.note}
                            </div>
                        ) : null}
                        {reply.attachments && reply.attachments.length > 0 ? (
                            <AttachmentCollection
                                attachments={reply.attachments as any[]}
                                className="mt-2"
                                variant="compact"
                            />
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
};

export const TaskResponseFeedbackThread: React.FC<{
    submission: TaskUpdateLike;
    feedbackReplies?: TaskUpdateLike[] | null;
    className?: string;
    label?: string;
    tone?: 'indigo' | 'slate';
}> = ({
    submission,
    feedbackReplies,
    className,
    label = 'Latest response',
    tone = 'indigo',
}) => {
    const actorName = getTaskUpdateActorName(submission);
    const timestamp = formatTimestamp(submission.createdAt);
    const repliesToRender = feedbackReplies || getTaskUpdateFeedbackReplies(submission);

    const shellTone =
        tone === 'indigo'
            ? { shell: 'border-indigo-200 bg-indigo-50/40', label: 'text-indigo-600' }
            : { shell: 'border-slate-200 bg-slate-50/80', label: 'text-slate-600' };

    return (
        <div className={cn('rounded-xl border p-3', shellTone.shell, className)}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', shellTone.label)}>
                    {label}
                </span>
                {actorName ? <span className="text-[11px] text-slate-500">by {actorName}</span> : null}
                {timestamp ? <span className="text-[11px] text-slate-500">{timestamp}</span> : null}
            </div>

            <div className="mt-3 rounded-lg border border-white/70 bg-white/80 px-3 py-3 shadow-sm">
                {submission.note ? (
                    <div className="whitespace-pre-wrap text-sm text-slate-700">{submission.note}</div>
                ) : null}
                <TaskResponseFieldValuesList
                    responseFieldValues={submission.responseFieldValues}
                    className={submission.note ? 'mt-2' : undefined}
                />
                {submission.attachments && submission.attachments.length > 0 ? (
                    <AttachmentCollection
                        attachments={submission.attachments as any[]}
                        className="mt-2"
                        variant="compact"
                    />
                ) : null}
            </div>

            <TaskFeedbackReplies replies={repliesToRender} className="mt-3" tone={tone} />
        </div>
    );
};
