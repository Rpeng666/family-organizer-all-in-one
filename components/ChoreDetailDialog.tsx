'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getAssignedMembersForChoreOnDate } from '@/lib/chore-utils';
import { getChorePauseStatus, getNextChoreOccurrence, type ChorePauseStatus, type ChoreScheduleLike } from '@/lib/chore-schedule';
import { recurrenceSummary, parseRecurrenceUiStateFromRrule } from '@/lib/recurrence';
import { getTaskSeriesProgress } from '@/lib/task-series-progress';
import { getTasksForDate, type Task } from '@/lib/task-scheduler';
import { isTaskDone } from '@/lib/task-progress';
import ChoreAssignmentPreviewSection from './ChoreAssignmentPreviewSection';

type FamilyMemberLike = {
    id: string;
    name?: string | null;
};

type ChoreCompletionLike = {
    id?: string;
    completed?: boolean | null;
    dateDue?: string | null;
    dateCompleted?: string | null;
    allowanceAwarded?: boolean | null;
    completedBy?: FamilyMemberLike | FamilyMemberLike[] | null;
};

type ChoreAssignmentLike = {
    id?: string;
    order?: number | null;
    familyMember?: FamilyMemberLike | FamilyMemberLike[] | null;
};

type TaskSeriesLike = {
    id: string;
    name?: string | null;
    startDate?: string | null;
    tasks?: Task[] | null;
    familyMember?: FamilyMemberLike | FamilyMemberLike[] | null;
};

type ChoreLike = ChoreScheduleLike & {
    id: string;
    title?: string | null;
    description?: string | null;
    weight?: number | null;
    rewardType?: 'fixed' | 'weight' | string | null;
    rewardAmount?: number | null;
    rewardCurrency?: string | null;
    estimatedDurationSecs?: number | null;
    isUpForGrabs?: boolean | null;
    isJoint?: boolean | null;
    rotationType?: string | null;
    assignees?: FamilyMemberLike[] | null;
    assignments?: ChoreAssignmentLike[] | null;
    completions?: ChoreCompletionLike[] | null;
    taskSeries?: TaskSeriesLike[] | null;
};

interface ChoreDetailDialogProps {
    chore: ChoreLike | null;
    familyMembers: FamilyMemberLike[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEdit: () => void;
    selectedDate: Date;
    selectedMember: string;
}

type TaskSeriesDetail = {
    id: string;
    name: string;
    ownerName: string | null;
    scheduledTasks: Task[];
    progress: number | null;
};

function getDateOnlyToken(value?: string | Date | null): string {
    if (!value) return '';
    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }

    const rawValue = String(value || '').trim();
    const hyphenMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})/);
    if (hyphenMatch) return hyphenMatch[1];

    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

function formatDateLabel(value?: string | Date | null): string {
    const token = getDateOnlyToken(value);
    if (!token) return 'Unknown';
    const parsed = parseISO(`${token}T00:00:00`);
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTimeLabel(value?: string | null): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getLinkedMember(value?: FamilyMemberLike | FamilyMemberLike[] | null): FamilyMemberLike | null {
    if (!value) return null;
    const candidate = Array.isArray(value) ? value[0] : value;
    return candidate?.id ? candidate : null;
}

function getCompletionMemberId(completion?: ChoreCompletionLike | null): string | null {
    return getLinkedMember(completion?.completedBy)?.id || null;
}

function formatCurrencyAmount(amount: number, currency?: string | null): string {
    if (!Number.isFinite(amount)) return String(amount);
    const normalizedCurrency = String(currency || '').trim().toUpperCase();
    if (!normalizedCurrency) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });

    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: normalizedCurrency,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${normalizedCurrency}`;
    }
}

function describeScheduleStatus(scheduleStatus: ChorePauseStatus): string {
    if (scheduleStatus.kind === 'none') return 'Active';
    if (scheduleStatus.kind === 'completed') return 'Previous pause window finished';

    const pauseState = scheduleStatus.pauseState;
    if (!pauseState) return 'Schedule change queued';

    if (scheduleStatus.kind === 'ended') {
        return `Ended as of ${formatDateLabel(pauseState.pauseStartDate)}`;
    }

    if (scheduleStatus.kind === 'paused') {
        if (pauseState.mode === 'bounded' && pauseState.resumeOnDate) {
            return `Paused until ${formatDateLabel(pauseState.resumeOnDate)}`;
        }
        return `Paused since ${formatDateLabel(pauseState.pauseStartDate)}`;
    }

    if (pauseState.mode === 'open-ended' && pauseState.intent === 'ended') {
        return `Scheduled to end starting ${formatDateLabel(pauseState.pauseStartDate)}`;
    }

    if (pauseState.mode === 'bounded' && pauseState.resumeOnDate) {
        return `Scheduled pause from ${formatDateLabel(pauseState.pauseStartDate)} to ${formatDateLabel(pauseState.resumeOnDate)}`;
    }

    return `Scheduled pause beginning ${formatDateLabel(pauseState.pauseStartDate)}`;
}

function getRecurrenceDetails(chore: ChoreLike) {
    const startDateToken = getDateOnlyToken(chore.startDate);
    if (!String(chore.rrule || '').trim()) {
        return {
            summary: 'Does not repeat',
            repeatEnd: 'One-time chore',
        };
    }

    try {
        const recurrenceState = parseRecurrenceUiStateFromRrule(String(chore.rrule || ''), startDateToken);
        let repeatEnd = 'Repeats forever';
        if (recurrenceState.repeatEndMode === 'until' && recurrenceState.repeatEndUntil) {
            repeatEnd = `Ends on ${formatDateLabel(recurrenceState.repeatEndUntil)}`;
        } else if (recurrenceState.repeatEndMode === 'count') {
            repeatEnd = `${recurrenceState.repeatEndCount} total occurrences`;
        }

        return {
            summary: recurrenceSummary(recurrenceState, startDateToken),
            repeatEnd,
        };
    } catch {
        return {
            summary: 'Custom repeat rule',
            repeatEnd: 'Advanced recurrence',
        };
    }
}

function describeRotation(chore: ChoreLike): string {
    if (chore.isUpForGrabs) return 'First-come, first-served';
    if (chore.rotationType && chore.rotationType !== 'none') {
        return `Rotates ${String(chore.rotationType).toLowerCase()}`;
    }
    if (chore.isJoint) return 'Joint chore';
    return 'Assigned directly';
}

function describeReward(chore: ChoreLike): string {
    if (chore.isUpForGrabs && chore.rewardType === 'fixed' && Number.isFinite(chore.rewardAmount)) {
        return formatCurrencyAmount(Number(chore.rewardAmount), chore.rewardCurrency);
    }

    if (Number.isFinite(chore.weight)) {
        const weight = Number(chore.weight);
        if (weight === 0) return '0 XP (excluded from allowance)';
        if (weight < 0) return `${weight} XP (penalty)`;
        return `${weight} XP`;
    }

    return 'No reward configured';
}

function formatDuration(totalSecs: number): string {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0) parts.push(`${s}s`);
    return parts.join(' ') || '0s';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <div className="mt-3">{children}</div>
        </section>
    );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0 last:pb-0 first:pt-0">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="max-w-[65%] text-right text-sm font-medium text-slate-900">{value}</div>
        </div>
    );
}

export default function ChoreDetailDialog({ chore, familyMembers, open, onOpenChange, onEdit, selectedDate, selectedMember }: ChoreDetailDialogProps) {
    const selectedDateKey = selectedDate.toISOString().slice(0, 10);

    const detailState = useMemo(() => {
        if (!chore) return null;

        const familyMemberNamesById = new Map((familyMembers || []).map((member) => [member.id, member.name || 'Unknown member']));
        const assignedMembersForDate = getAssignedMembersForChoreOnDate(chore as any, selectedDate);
        const completionsForDate = (chore.completions || []).filter((completion) => completion?.completed && completion?.dateDue === selectedDateKey);
        const claimedByMemberId = getCompletionMemberId(completionsForDate[0]);
        const claimedByName = claimedByMemberId ? familyMemberNamesById.get(claimedByMemberId) || 'Unknown member' : null;

        const completionStatuses = assignedMembersForDate.map((member) => {
            const completion =
                (chore.completions || []).find(
                    (entry) => entry?.dateDue === selectedDateKey && getCompletionMemberId(entry) === member.id
                ) || null;

            return {
                member,
                completion,
                isComplete: Boolean(completion?.completed),
            };
        });

        const completedCount = completionStatuses.filter((entry) => entry.isComplete).length;
        let statusHeadline = 'Not completed yet';
        let statusDescription = 'No one has completed this chore for the selected date.';

        if (chore.isUpForGrabs && claimedByName) {
            statusHeadline = `Claimed by ${claimedByName}`;
            statusDescription = `${claimedByName} completed this first-come chore on ${formatDateLabel(selectedDate)}.`;
        } else if (completedCount > 0 && completionStatuses.length > 0 && completedCount === completionStatuses.length) {
            statusHeadline = 'Completed for everyone assigned';
            statusDescription = `${completedCount} of ${completionStatuses.length} assigned member${completionStatuses.length === 1 ? '' : 's'} finished it.`;
        } else if (completedCount > 0) {
            statusHeadline = 'Partially completed';
            statusDescription = `${completedCount} of ${completionStatuses.length} assigned member${completionStatuses.length === 1 ? '' : 's'} finished it.`;
        } else if (assignedMembersForDate.length > 0) {
            statusDescription = `${assignedMembersForDate.length} member${assignedMembersForDate.length === 1 ? '' : 's'} are assigned on this date.`;
        }

        const latestCompletions = [...(chore.completions || [])]
            .filter((completion) => completion?.completed)
            .sort((left, right) => {
                const leftTime = new Date(left?.dateCompleted || `${left?.dateDue || ''}T00:00:00Z`).getTime();
                const rightTime = new Date(right?.dateCompleted || `${right?.dateDue || ''}T00:00:00Z`).getTime();
                return rightTime - leftTime;
            })
            .slice(0, 3)
            .map((completion) => {
                const memberId = getCompletionMemberId(completion);
                return {
                    id: completion?.id || `${completion?.dateDue || 'completion'}-${memberId || 'unknown'}`,
                    memberName: memberId ? familyMemberNamesById.get(memberId) || 'Unknown member' : 'Unknown member',
                    dateDue: completion?.dateDue || '',
                    dateCompleted: completion?.dateCompleted || null,
                    allowanceAwarded: Boolean(completion?.allowanceAwarded),
                };
            });

        const recurrenceDetails = getRecurrenceDetails(chore);
        const scheduleStatus = getChorePauseStatus(chore, selectedDate);
        const nextOccurrence = getNextChoreOccurrence(chore, selectedDate, true);
        const exdateCount = Array.isArray(chore.exdates) ? chore.exdates.length : 0;

        const taskSeriesDetails = (chore.taskSeries || [])
            .map((series) => {
                const owner = getLinkedMember(series.familyMember);
                if (selectedMember !== 'All' && owner?.id && owner.id !== selectedMember) {
                    return null;
                }

                if (owner?.id && !assignedMembersForDate.some((member) => member.id === owner.id)) {
                    return null;
                }

                const scheduledTasks = getTasksForDate(
                    series.tasks || [],
                    chore.rrule || null,
                    chore.startDate,
                    selectedDate,
                    series.startDate || null,
                    Array.isArray(chore.exdates) ? (chore.exdates as string[]) : null
                );

                return {
                    id: series.id,
                    name: String(series.name || 'Task series'),
                    ownerName: owner?.name || null,
                    scheduledTasks,
                    progress: getTaskSeriesProgress(scheduledTasks, series.tasks || []),
                } satisfies TaskSeriesDetail;
            })
            .filter(Boolean) as TaskSeriesDetail[];

        return {
            assignedMembersForDate,
            completionStatuses,
            completedCount,
            statusHeadline,
            statusDescription,
            latestCompletions,
            recurrenceDetails,
            scheduleStatus,
            nextOccurrence,
            exdateCount,
            taskSeriesDetails,
            claimedByName,
            buildTasksHref: `/tasks?${new URLSearchParams({
                date: selectedDateKey,
                member: selectedMember,
                choreId: chore.id,
            }).toString()}#chore-${chore.id}`,
        };
    }, [chore, familyMembers, selectedDate, selectedDateKey, selectedMember]);

    if (!chore || !detailState) return null;

    const showTaskLink = detailState.taskSeriesDetails.length > 0;
    const allAssigneeNames = (chore.assignees || []).map((member) => member.name || 'Unknown member');
    const rotationOrder = [...(chore.assignments || [])]
        .sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))
        .map((assignment) => getLinkedMember(assignment.familyMember)?.name)
        .filter(Boolean) as string[];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[860px]">
                <DialogHeader className="pr-10">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-3">
                            <div>
                                <DialogTitle className="text-2xl font-semibold text-slate-950">{chore.title || 'Untitled chore'}</DialogTitle>
                                <DialogDescription className="mt-2 text-sm text-slate-600">
                                    {detailState.assignedMembersForDate.length > 0
                                        ? `Due on ${formatDateLabel(selectedDate)} for ${detailState.assignedMembersForDate
                                              .map((member) => member.name || 'Unknown member')
                                              .join(', ')}.`
                                        : `Viewing details for ${formatDateLabel(selectedDate)}.`}
                                </DialogDescription>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="outline">{detailState.recurrenceDetails.summary}</Badge>
                                {chore.estimatedDurationSecs != null && chore.estimatedDurationSecs > 0 ? (
                                    <Badge className="bg-violet-100 text-violet-800">{formatDuration(chore.estimatedDurationSecs)}</Badge>
                                ) : null}
                                {chore.isUpForGrabs ? <Badge className="bg-emerald-100 text-emerald-800">Up for Grabs</Badge> : null}
                                {chore.isJoint ? <Badge className="bg-amber-100 text-amber-800">Joint</Badge> : null}
                                {chore.rotationType && chore.rotationType !== 'none' ? (
                                    <Badge className="bg-sky-100 text-sky-800">Rotates {String(chore.rotationType).toLowerCase()}</Badge>
                                ) : null}
                                {detailState.scheduleStatus.kind === 'scheduled' ? (
                                    <Badge className="bg-orange-100 text-orange-800">Pause scheduled</Badge>
                                ) : null}
                                {detailState.scheduleStatus.kind === 'paused' ? (
                                    <Badge className="bg-orange-100 text-orange-800">Paused</Badge>
                                ) : null}
                                {detailState.scheduleStatus.kind === 'ended' ? <Badge className="bg-rose-100 text-rose-800">Ended</Badge> : null}
                                {detailState.taskSeriesDetails.length > 0 ? (
                                    <Badge className="bg-indigo-100 text-indigo-800">{detailState.taskSeriesDetails.length} task series</Badge>
                                ) : null}
                            </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                            {showTaskLink ? (
                                <Link href={detailState.buildTasksHref}>
                                    <Button variant="outline">Open Tasks</Button>
                                </Link>
                            ) : null}
                            <Button type="button" onClick={onEdit}>
                                Edit Chore
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
                    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected Date</div>
                        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                            <div>
                                <div className="text-lg font-semibold text-slate-950">{detailState.statusHeadline}</div>
                                <p className="mt-1 text-sm text-slate-600">{detailState.statusDescription}</p>
                            </div>
                            <div className="text-sm text-slate-500">{formatDateLabel(selectedDate)}</div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-white bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned today</div>
                                <div className="mt-2 text-sm font-medium text-slate-900">
                                    {detailState.assignedMembersForDate.length > 0
                                        ? detailState.assignedMembersForDate.map((member) => member.name || 'Unknown member').join(', ')
                                        : 'No one assigned'}
                                </div>
                            </div>
                            <div className="rounded-xl border border-white bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completion</div>
                                <div className="mt-2 text-sm font-medium text-slate-900">
                                    {detailState.completedCount} / {Math.max(detailState.completionStatuses.length, detailState.assignedMembersForDate.length, 1)} complete
                                </div>
                            </div>
                            <div className="rounded-xl border border-white bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next due</div>
                                <div className="mt-2 text-sm font-medium text-slate-900">
                                    {detailState.nextOccurrence ? formatDateLabel(detailState.nextOccurrence) : 'No future occurrence'}
                                </div>
                            </div>
                            <div className="rounded-xl border border-white bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reward</div>
                                <div className="mt-2 text-sm font-medium text-slate-900">{describeReward(chore)}</div>
                            </div>
                        </div>
                    </section>

                    <div className="grid gap-4 md:grid-cols-[1.25fr,0.95fr]">
                        <div className="min-w-0 space-y-4">
                            {chore.description ? (
                                <Section title="Description">
                                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{chore.description}</p>
                                </Section>
                            ) : null}

                            <Section title="Completion Status">
                                <div className="space-y-3">
                                    {detailState.completionStatuses.length > 0 ? (
                                        detailState.completionStatuses.map(({ member, completion, isComplete }) => (
                                            <div key={member.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-sm font-medium text-slate-900">{member.name || 'Unknown member'}</div>
                                                    <Badge className={isComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}>
                                                        {isComplete ? 'Done' : 'Not done'}
                                                    </Badge>
                                                </div>
                                                {completion?.dateCompleted ? (
                                                    <div className="mt-2 text-xs text-slate-500">Completed {formatDateTimeLabel(completion.dateCompleted)}</div>
                                                ) : null}
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-sm text-slate-600">No assignees are active for this date.</p>
                                    )}
                                    {chore.isUpForGrabs && detailState.claimedByName ? (
                                        <p className="text-xs text-slate-500">
                                            This was claimed first by {detailState.claimedByName}. Other assignees are blocked once it is completed.
                                        </p>
                                    ) : null}
                                </div>
                            </Section>

                            {detailState.taskSeriesDetails.length > 0 ? (
                                <Section title="Task Series">
                                    <div className="space-y-3">
                                        {detailState.taskSeriesDetails.map((series) => {
                                            const completedTasks = series.scheduledTasks.filter((task) => isTaskDone(task)).length;
                                            return (
                                                <div key={series.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                        <div>
                                                            <div className="text-sm font-semibold text-slate-900">{series.name}</div>
                                                            <div className="mt-1 text-xs text-slate-500">
                                                                {series.ownerName ? `${series.ownerName}'s series` : 'Shared series'}
                                                            </div>
                                                        </div>
                                                        <div className="text-xs font-medium text-slate-600">
                                                            {series.progress != null
                                                                ? `${completedTasks}/${series.scheduledTasks.length} tasks done`
                                                                : series.scheduledTasks.length > 0
                                                                  ? `${series.scheduledTasks.length} scheduled`
                                                                  : 'No tasks scheduled'}
                                                        </div>
                                                    </div>

                                                    {series.scheduledTasks.length > 0 ? (
                                                        <div className="mt-3 space-y-2">
                                                            {series.scheduledTasks.map((task) => (
                                                                <div key={task.id} className="rounded-lg border border-white bg-white px-3 py-2">
                                                                    <div className="flex items-start justify-between gap-3">
                                                                        <div className="min-w-0 flex-1">
                                                                            <div className={`text-sm font-medium ${isTaskDone(task) ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                                                                                {task.text}
                                                                            </div>
                                                                            {(task.notes || (task.attachments || []).length > 0) && (
                                                                                <div className="mt-1 text-xs text-slate-500">
                                                                                    {task.notes ? 'Has notes' : null}
                                                                                    {task.notes && (task.attachments || []).length > 0 ? ' • ' : null}
                                                                                    {(task.attachments || []).length > 0
                                                                                        ? `${(task.attachments || []).length} attachment${
                                                                                              (task.attachments || []).length === 1 ? '' : 's'
                                                                                          }`
                                                                                        : null}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <Badge className={isTaskDone(task) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}>
                                                                            {isTaskDone(task) ? 'Done' : 'Open'}
                                                                        </Badge>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="mt-3 text-sm text-slate-600">No scheduled tasks are active for this date.</p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Section>
                            ) : null}

                            <ChoreAssignmentPreviewSection
                                chore={chore}
                                anchorDate={selectedDate}
                                description="Scroll through the schedule to see assignments and completion status across past and future dates."
                            />

                            {detailState.latestCompletions.length > 0 ? (
                                <Section title="Recent Activity">
                                    <div className="space-y-3">
                                        {detailState.latestCompletions.map((completion) => (
                                            <div key={completion.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                                                <div>
                                                    <div className="text-sm font-medium text-slate-900">{completion.memberName}</div>
                                                    <div className="mt-1 text-xs text-slate-500">
                                                        Due {formatDateLabel(completion.dateDue)}
                                                        {completion.dateCompleted ? ` • completed ${formatDateTimeLabel(completion.dateCompleted)}` : ''}
                                                    </div>
                                                </div>
                                                <Badge className={completion.allowanceAwarded ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-700'}>
                                                    {completion.allowanceAwarded ? 'Allowance awarded' : 'Pending allowance'}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            ) : null}
                        </div>

                        <div className="space-y-4">
                            <Section title="Schedule">
                                {chore.estimatedDurationSecs != null && chore.estimatedDurationSecs > 0 ? (
                                    <MetaRow label="Estimated duration" value={formatDuration(chore.estimatedDurationSecs)} />
                                ) : null}
                                <MetaRow label="Starts" value={formatDateLabel(chore.startDate)} />
                                <MetaRow label="Repeats" value={detailState.recurrenceDetails.summary} />
                                <MetaRow label="Repeat end" value={detailState.recurrenceDetails.repeatEnd} />
                                <MetaRow label="Schedule status" value={describeScheduleStatus(detailState.scheduleStatus)} />
                                <MetaRow label="Next occurrence" value={detailState.nextOccurrence ? formatDateLabel(detailState.nextOccurrence) : 'No future occurrence'} />
                                <MetaRow label="Skipped dates" value={detailState.exdateCount > 0 ? detailState.exdateCount : 'None'} />
                            </Section>

                            <Section title="Assignment">
                                <MetaRow label="All assignees" value={allAssigneeNames.length > 0 ? allAssigneeNames.join(', ') : 'None'} />
                                <MetaRow
                                    label="Today"
                                    value={
                                        detailState.assignedMembersForDate.length > 0
                                            ? detailState.assignedMembersForDate.map((member) => member.name || 'Unknown member').join(', ')
                                            : 'None'
                                    }
                                />
                                <MetaRow label="Assignment mode" value={describeRotation(chore)} />
                                <MetaRow label="Joint work" value={chore.isJoint ? 'Yes' : 'No'} />
                                {rotationOrder.length > 0 ? <MetaRow label="Rotation order" value={rotationOrder.join(' -> ')} /> : null}
                            </Section>

                            <Section title="Reward">
                                <MetaRow label="Display" value={describeReward(chore)} />
                                <MetaRow
                                    label="Reward model"
                                    value={chore.isUpForGrabs && chore.rewardType === 'fixed' ? 'Fixed allowance amount' : 'Weight based'}
                                />
                                <MetaRow
                                    label="Weight notes"
                                    value={
                                        Number.isFinite(chore.weight)
                                            ? Number(chore.weight) === 0
                                                ? 'Zero-weight chores do not affect allowance.'
                                                : Number(chore.weight) < 0
                                                  ? 'Negative weight works like a penalty.'
                                                  : 'Positive weight contributes toward allowance and XP.'
                                            : 'No weight note'
                                    }
                                />
                            </Section>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
