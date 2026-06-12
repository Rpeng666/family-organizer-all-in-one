'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { db } from '@/lib/db';
import Calendar from '@/components/Calendar';
import { DashboardHeaderCard } from '@/components/dashboard/DashboardHeaderCard';
import { DashboardChoresSection } from '@/components/dashboard/DashboardChoresSection';
import { DashboardMessagesSection } from '@/components/dashboard/DashboardMessagesSection';
import { DashboardTasksSection } from '@/components/dashboard/DashboardTasksSection';
import { DashboardEventsSection } from '@/components/dashboard/DashboardEventsSection';
import {
    formatDateKeyUTC,
    getAssignedMembersForChoreOnDate,
    getCompletedChoreCompletionsForDate,
    getMemberCompletionForDate,
    localDateToUTC,
} from '@family-organizer/shared-core';
import { getThreadDisplayName, getThreadPreviewText } from '@/lib/message-thread-display';
import { getTasksForDate, type Task } from '@/lib/task-scheduler';
import { hasScheduledChildren } from '@/lib/task-series-progress';
import {
    getTaskParentId,
    getTaskUpdateActorId,
    getTaskUpdateReplyToId,
    getTaskUpdateTime,
    getTaskWorkflowState,
    taskUpdateHasMeaningfulFeedbackContent,
    type TaskUpdateLike,
} from '@/lib/task-progress';
import {
    buildCalendarLabel,
    completionMemberId,
    firstRef,
    formatTimeAgo,
    getPhotoUrl,
    toInitials,
    type DashboardCalendarItem,
    type DashboardChoreCompletion,
    type DashboardFamilyMember,
} from '@/lib/dashboard-utils';
import {
    formatCountLabel,
    planChoreSection,
    planTaskSection,
    type ChoreRow,
    type UnreadThread,
    type TaskRow,
    type TaskGroup,
    type EventRow,
} from '@/lib/dashboard-layout-planner';
// ─── local storage keys ───────────────────────────────────────────────────────
const SELECTED_MEMBER_KEY = 'dashboard-selected-member';
const SELECTED_DATE_KEY = 'dashboard-selected-date';

// ─── query result types ───────────────────────────────────────────────────────
type FamilyMemberRecord = DashboardFamilyMember & { order?: number | null; role?: string | null };

type MessageThreadMembership = {
    familyMemberId?: string | null;
    lastReadAt?: string | null;
    isArchived?: boolean | null;
    familyMember?: { id?: string | null; name?: string | null } | Array<{ id?: string | null; name?: string | null }> | null;
};

type MessageThreadRecord = {
    id: string;
    title?: string | null;
    threadType?: string | null;
    latestMessageAt?: string | null;
    latestMessagePreview?: string | null;
    members?: MessageThreadMembership[] | null;
};

type TaskRecord = Task & {
    updates?: TaskUpdateLike[] | null;
    notes?: string | null;
    parentTask?: Array<{ id?: string | null }> | { id?: string | null } | null;
};

type TaskSeriesRecord = {
    id: string;
    name?: string | null;
    startDate?: string | null;
    familyMember?: { id?: string | null; name?: string | null } | Array<{ id?: string | null; name?: string | null }> | null;
    tasks?: TaskRecord[] | null;
};

type ChoreRecord = {
    id: string;
    title?: string | null;
    startDate: string;
    rrule?: string | null;
    exdates?: string[] | null;
    isUpForGrabs?: boolean | null;
    weight?: number | null;
    assignees?: Array<{ id: string; name?: string | null }> | null;
    assignments?: Array<{
        order?: number | null;
        familyMember?: { id?: string | null; name?: string | null } | Array<{ id?: string | null; name?: string | null }> | null;
    }> | null;
    completions?: DashboardChoreCompletion[] | null;
    taskSeries?: TaskSeriesRecord[] | null;
};

// ─── local helpers ────────────────────────────────────────────────────────────
function dateKeyToUtcDate(dateKey: string): Date {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) return localDateToUTC(new Date());
    return new Date(Date.UTC(year, month - 1, day));
}

function dateKeyToLocalDate(dateKey: string): Date {
    return new Date(`${dateKey}T00:00:00`);
}

function formatEventDayLabel(startsAt: Date, selectedDateKey: string, nextDateKey: string) {
    const eventDayKey = format(startsAt, 'yyyy-MM-dd');
    if (eventDayKey === selectedDateKey) return 'Today';
    if (eventDayKey === nextDateKey) return 'Tomorrow';
    return format(startsAt, 'EEE, MMM d');
}

function stripToPlainText(value?: string | null) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getTaskUpdateAffectedPersonId(entry: TaskUpdateLike | null | undefined) {
    const affectedPerson = entry?.affectedPerson;
    if (Array.isArray(affectedPerson)) return affectedPerson[0]?.id || null;
    return affectedPerson?.id || null;
}

function taskUpdateHasMeaningfulDashboardResponseContent(entry: TaskUpdateLike | null | undefined) {
    if (!entry) return false;
    if (entry.note?.trim()) return true;
    if (entry.attachments && entry.attachments.length > 0) return true;
    return (entry.responseFieldValues || []).some((value) =>
        Boolean(stripToPlainText(value.richTextContent) || value.fileUrl?.trim())
    );
}

// ─── component ────────────────────────────────────────────────────────────────
export default function PersonalDashboard() {
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [selectedDateKey, setSelectedDateKey] = useState(() => formatDateKeyUTC(localDateToUTC(new Date())));
    const [datePickerOpen, setDatePickerOpen] = useState(false);
    const [memberPickerOpen, setMemberPickerOpen] = useState(false);

    // Restore persisted selections
    useEffect(() => {
        try {
            const savedMemberId = localStorage.getItem(SELECTED_MEMBER_KEY);
            if (savedMemberId) setSelectedMemberId(savedMemberId);
            const savedDateKey = localStorage.getItem(SELECTED_DATE_KEY);
            if (savedDateKey) setSelectedDateKey(savedDateKey);
        } catch { /* ignore */ }
    }, []);

    // Persist selections
    useEffect(() => {
        try {
            if (selectedMemberId) localStorage.setItem(SELECTED_MEMBER_KEY, selectedMemberId);
            localStorage.setItem(SELECTED_DATE_KEY, selectedDateKey);
        } catch { /* ignore */ }
    }, [selectedDateKey, selectedMemberId]);

    const { data, isLoading, error } = db.useQuery({
        familyMembers: { $: { order: { order: 'asc' } } },
        messageThreads: { members: { familyMember: {} } },
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            completions: { completedBy: {} },
            taskSeries: {
                familyMember: {},
                tasks: {
                    parentTask: {},
                    updates: {
                        actor: {},
                        affectedPerson: {},
                        attachments: {},
                        gradeType: {},
                        replyTo: {},
                        responseFieldValues: { field: {} },
                    },
                },
            },
        },
        calendarItems: { pertainsTo: {} },
    });

    const familyMembers = useMemo(
        () => ((data?.familyMembers || []) as unknown as FamilyMemberRecord[]).filter((m) => Boolean(m?.id)),
        [data?.familyMembers]
    );

    const activeMemberId = selectedMemberId || familyMembers[0]?.id || null;
    const activeMember = familyMembers.find((m) => m.id === activeMemberId) || null;

    const selectedDateUtc = useMemo(() => dateKeyToUtcDate(selectedDateKey), [selectedDateKey]);
    const selectedDateLocal = useMemo(() => dateKeyToLocalDate(selectedDateKey), [selectedDateKey]);
    const nextSelectedDateKey = useMemo(() => format(addDays(selectedDateLocal, 1), 'yyyy-MM-dd'), [selectedDateLocal]);
    const todayKey = formatDateKeyUTC(localDateToUTC(new Date()));
    const isSelectedToday = selectedDateKey === todayKey;

    const memberNamesById = useMemo(
        () => new Map(familyMembers.map((m) => [m.id, m.name] as const)),
        [familyMembers]
    );

    const unreadThreads = useMemo((): UnreadThread[] => {
        if (!activeMemberId) return [];
        return ((data?.messageThreads || []) as unknown as MessageThreadRecord[])
            .reduce<UnreadThread[]>((result, thread) => {
                const membership = (thread.members || []).find((e) => e.familyMemberId === activeMemberId);
                if (!membership || membership.isArchived || !thread.latestMessageAt) return result;
                if (thread.latestMessageAt > String(membership.lastReadAt || '')) {
                    result.push({
                        id: thread.id,
                        displayName: getThreadDisplayName(thread, memberNamesById, activeMemberId),
                        previewText: getThreadPreviewText(thread),
                        latestMessageAt: thread.latestMessageAt,
                    });
                }
                return result;
            }, [])
            .sort((a, b) => b.latestMessageAt.localeCompare(a.latestMessageAt));
    }, [activeMemberId, data?.messageThreads, memberNamesById]);

    const choresForDay = useMemo(() => {
        if (!activeMemberId) return { incomplete: [] as ChoreRow[], completed: [] as ChoreRow[] };

        const rows = ((data?.chores || []) as unknown as ChoreRecord[]).reduce<ChoreRow[]>((result, chore) => {
            const assignedMembers = getAssignedMembersForChoreOnDate(chore as any, selectedDateUtc);
            if (!assignedMembers.some((m) => m.id === activeMemberId)) return result;

            const memberCompletion = getMemberCompletionForDate(chore as any, activeMemberId, selectedDateUtc);
            const isCompleted = Boolean(memberCompletion?.completed);

            const completionsOnDate = getCompletedChoreCompletionsForDate(chore as any, selectedDateUtc) as DashboardChoreCompletion[];
            const firstCompleterId = completionMemberId(completionsOnDate.find((c) => completionMemberId(c)));
            if (chore.isUpForGrabs && firstCompleterId && firstCompleterId !== activeMemberId) return result;

            result.push({
                id: chore.id,
                title: chore.title || 'Untitled chore',
                weight: Number(chore.weight || 0),
                isUpForGrabs: Boolean(chore.isUpForGrabs),
                isCompleted,
            });
            return result;
        }, []);

        const sort = (a: ChoreRow, b: ChoreRow) =>
            a.isUpForGrabs !== b.isUpForGrabs ? (a.isUpForGrabs ? 1 : -1) : a.title.localeCompare(b.title);

        return {
            incomplete: rows.filter((r) => !r.isCompleted).sort(sort),
            completed: rows.filter((r) => r.isCompleted).sort(sort),
        };
    }, [activeMemberId, data?.chores, selectedDateUtc]);

    const taskGroups = useMemo((): TaskGroup[] => {
        if (!activeMemberId) return [];
        return ((data?.chores || []) as unknown as ChoreRecord[]).reduce<TaskGroup[]>((result, chore) => {
            const assignedMembers = getAssignedMembersForChoreOnDate(chore as any, selectedDateUtc);
            if (!assignedMembers.some((m) => m.id === activeMemberId)) return result;
            const assignedIds = new Set(assignedMembers.map((m) => m.id));

            (chore.taskSeries || []).forEach((series) => {
                const owner = firstRef(series.familyMember);
                if (owner?.id && (!assignedIds.has(owner.id) || owner.id !== activeMemberId)) return;

                const allTasks = [...(series.tasks || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
                if (allTasks.length === 0) return;

                const scheduledTasks = getTasksForDate(
                    allTasks,
                    chore.rrule || null,
                    chore.startDate,
                    selectedDateUtc,
                    series.startDate || null,
                    chore.exdates || null
                );
                if (scheduledTasks.length === 0) return;

                const scheduledIds = new Set(scheduledTasks.map((t) => t.id));
                const tasksById = new Map(allTasks.map((t) => [t.id, t] as const));

                const rows = scheduledTasks
                    .filter((task) => !hasScheduledChildren(task.id, scheduledIds, allTasks))
                    .map<TaskRow>((task) => {
                        const workflowState = getTaskWorkflowState(task);
                        const parents: string[] = [];
                        let parentId = getTaskParentId(task);
                        while (parentId) {
                            const parentTask = tasksById.get(parentId);
                            if (!parentTask) break;
                            parents.unshift(parentTask.text || 'Parent task');
                            parentId = getTaskParentId(parentTask);
                        }
                        return {
                            id: task.id,
                            text: task.text || 'Untitled task',
                            workflowState,
                            notePreview: stripToPlainText(task.notes || null) || null,
                            parentLabel: parents.length > 0 ? parents.join(' / ') : null,
                            depth: Math.min(parents.length, 3),
                        };
                    })
                    .filter((t) => t.workflowState !== 'done');

                if (rows.length > 0) {
                    result.push({ seriesId: series.id, seriesName: series.name || 'Task series', tasks: rows });
                }
            });

            return result;
        }, []);
    }, [activeMemberId, data?.chores, selectedDateUtc]);

    const taskCount = useMemo(
        () => taskGroups.reduce((sum, g) => sum + g.tasks.length, 0),
        [taskGroups]
    );

    const upcomingEvents = useMemo((): EventRow[] => {
        if (!activeMemberId) return [];
        return ((data?.calendarItems || []) as unknown as DashboardCalendarItem[])
            .map((item) => {
                const memberIds = (item.pertainsTo || []).map((m) => m.id).filter(Boolean) as string[];
                const isFamilyWide = memberIds.length === 0;
                if (!isFamilyWide && !memberIds.includes(activeMemberId)) return null;

                const { startsAt, endsAt, label } = buildCalendarLabel(item);
                if (endsAt.getTime() < selectedDateLocal.getTime()) return null;

                return {
                    id: item.id,
                    title: item.title || 'Untitled event',
                    timeLabel: label,
                    dayLabel: formatEventDayLabel(startsAt, selectedDateKey, nextSelectedDateKey),
                    isFamilyWide,
                    isAllDay: item.isAllDay,
                    withinInitialWindow: startsAt.getTime() < addDays(selectedDateLocal, 2).getTime(),
                    startsAt,
                } satisfies EventRow;
            })
            .filter((item): item is EventRow => item !== null)
            .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    }, [activeMemberId, data?.calendarItems, nextSelectedDateKey, selectedDateKey, selectedDateLocal]);

    const outstandingFeedbackCount = useMemo(() => {
        if (!activeMemberId || !isSelectedToday) return 0;
        const allTasks = ((data?.chores || []) as unknown as ChoreRecord[]).flatMap((chore) =>
            (chore.taskSeries || []).flatMap((series) => series.tasks || [])
        );
        return allTasks.reduce((count, task) => {
            const updates = (task.updates || []).filter((e) => !e.isDraft);
            const latestResponse = updates
                .filter((e) => !getTaskUpdateReplyToId(e))
                .filter((e) => taskUpdateHasMeaningfulDashboardResponseContent(e))
                .filter((e) => {
                    const actorId = getTaskUpdateActorId(e);
                    const affectedId = getTaskUpdateAffectedPersonId(e);
                    return actorId === activeMemberId || affectedId === activeMemberId;
                })
                .sort((a, b) => getTaskUpdateTime(b) - getTaskUpdateTime(a))[0];
            if (!latestResponse?.id) return count;
            const feedbackReplies = updates
                .filter((e) => getTaskUpdateReplyToId(e) === latestResponse.id)
                .filter((e) => taskUpdateHasMeaningfulFeedbackContent(e))
                .sort((a, b) => getTaskUpdateTime(b) - getTaskUpdateTime(a));
            if (feedbackReplies.length === 0) return count;
            const latestFeedbackAt = getTaskUpdateTime(feedbackReplies[0]);
            return updates.some((e) => getTaskUpdateTime(e) > latestFeedbackAt) ? count : count + 1;
        }, 0);
    }, [activeMemberId, data?.chores, isSelectedToday]);

    const summaryLine = useMemo(() => {
        const parts = [
            formatCountLabel(choresForDay.incomplete.length, 'chore left', 'chores left'),
            formatCountLabel(unreadThreads.length, 'unread message', 'unread messages'),
            formatCountLabel(taskCount, 'task to do', 'tasks to do'),
        ];
        if (isSelectedToday && outstandingFeedbackCount > 0) {
            parts.push(formatCountLabel(outstandingFeedbackCount, 'new feedback', 'new feedback'));
        }
        return parts.join(' • ');
    }, [choresForDay.incomplete.length, isSelectedToday, outstandingFeedbackCount, taskCount, unreadThreads.length]);

    const chorePlan = useMemo(
        () => planChoreSection(choresForDay.incomplete.length, choresForDay.completed.length, null),
        [choresForDay.completed.length, choresForDay.incomplete.length]
    );

    const taskPlan = useMemo(
        () => planTaskSection(taskGroups, null),
        [taskGroups]
    );

    // ─── loading / error / empty states ──────────────────────────────────────
    if (isLoading) {
        return (
            <div className="min-h-full bg-background flex items-center justify-center p-10">
                <div className="rounded-3xl border border-border/60 bg-card px-8 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                    <p className="text-sm text-muted-foreground">Loading day view...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-full bg-background flex items-center justify-center p-10">
                <div className="rounded-3xl border border-rose-200 bg-rose-50 px-8 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                    <p className="text-sm font-medium text-rose-700">The personal day view failed to load.</p>
                    <p className="mt-2 text-sm text-rose-600">{error.message}</p>
                </div>
            </div>
        );
    }

    if (!activeMember) {
        return (
            <div className="min-h-full bg-background flex items-center justify-center p-10">
                <div className="rounded-3xl border border-border/60 bg-card px-8 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                    <p className="text-sm text-muted-foreground">Add a family member to start using the day view.</p>
                </div>
            </div>
        );
    }

    // ─── render ───────────────────────────────────────────────────────────────
    return (
        <div className="min-h-full overflow-auto bg-background">
            <div className="mx-auto max-w-5xl px-6 py-10 space-y-8">

                {/* ── HERO: Today ─────────────────────────────────────────── */}
                {/* Member + date header, chores for today, calendar timeline  */}
                <section className="rounded-3xl border border-border/60 bg-card shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
                    {/* Header row */}
                    <div className="px-8 pt-8 pb-6 border-b border-border/40">
                        <DashboardHeaderCard
                            activeMember={activeMember}
                            familyMembers={familyMembers}
                            activeMemberId={activeMemberId}
                            summaryLine={summaryLine}
                            selectedDateKey={selectedDateKey}
                            selectedDateLocal={selectedDateLocal}
                            isSelectedToday={isSelectedToday}
                            memberPickerOpen={memberPickerOpen}
                            datePickerOpen={datePickerOpen}
                            onMemberPickerOpenChange={setMemberPickerOpen}
                            onDatePickerOpenChange={setDatePickerOpen}
                            onMemberSelect={setSelectedMemberId}
                            onDateSelect={setSelectedDateKey}
                            bare
                        />
                    </div>

                    {/* Today's chores — primary content of the hero */}
                    <div className="px-8 py-6 border-b border-border/40">
                        <DashboardChoresSection
                            incompleteChores={choresForDay.incomplete}
                            completedChores={choresForDay.completed}
                            plan={chorePlan}
                            height={null}
                        />
                    </div>

                    {/* Calendar timeline — family's timeline, 40–60% per SKILL */}
                    <div className="h-[260px]">
                        <Calendar
                            className="h-full"
                            currentDate={selectedDateLocal}
                            showChores={false}
                            everyoneSelected={true}
                            selectedMemberIds={[activeMemberId]}
                            commandBusEnabled={false}
                            viewMode="day"
                            dayVisibleDays={4}
                            dayRowCount={1}
                            dayHourHeight={36}
                            dayFontScale={0.72}
                            dayBufferDays={0}
                            eventFontScale={0.7}
                            displayBS={true}
                        />
                    </div>
                </section>

                {/* ── PRIMARY: Upcoming ───────────────────────────────────── */}
                {/* Tasks + Events side by side — supporting the hero         */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <DashboardTasksSection
                        totalCount={taskCount}
                        plan={taskPlan}
                        activeMemberId={activeMemberId}
                        height={null}
                    />
                    <DashboardEventsSection
                        events={upcomingEvents}
                        totalCount={upcomingEvents.length}
                        height={null}
                    />
                </div>

                {/* ── SECONDARY: Messages ─────────────────────────────────── */}
                {/* Understated — messages support, never dominate             */}
                <DashboardMessagesSection
                    threads={unreadThreads}
                    totalCount={unreadThreads.length}
                    height={null}
                />

            </div>
        </div>
    );
}
