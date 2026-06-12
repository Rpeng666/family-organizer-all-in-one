'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CheckCircle2, ListTodo, Sparkles, Users, Wallet2 } from 'lucide-react';
import { db } from '@/lib/db';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { type UnitDefinition } from '@/lib/currency-utils';
import {
    calculateDailyXP,
    formatDateKeyUTC,
    getAssignedMembersForChoreOnDate,
    getCompletedChoreCompletionsForDate,
    getMemberCompletionForDate,
    localDateToUTC,
} from '@family-organizer/shared-core';
import { getTasksForDate, type Task } from '@/lib/task-scheduler';
import { hasScheduledChildren } from '@/lib/task-series-progress';
import {
    addUtcDays,
    buildCalendarLabel,
    buildDueLabel,
    buildMemberBalanceLabel,
    completionMemberId,
    dayDiff,
    firstRef,
    toInitials,
    type DashboardCalendarItem,
    type DashboardChoreCompletion,
    type DashboardFamilyMember,
    type EnvelopeLike,
} from '@/lib/dashboard-utils';
import PersonalDashboard from '@/components/dashboard/PersonalDashboard';
import FreeformDashboard from '@/components/freeform-dashboard/FreeformDashboard';
import { useDashboardViewMode } from '@/lib/dashboard-view-mode';

const OVERDUE_LOOKBACK_DAYS = 7;
const CHORE_LOOKAHEAD_DAYS = 14;
const TASK_SERIES_LOOKAHEAD_DAYS = 10;
const MAX_CHORE_PREVIEW = 2;
const MAX_TASK_SERIES_PREVIEW = 2;

const BEATITUDES_ESV = [
    { verse: 'Matthew 5:3', text: 'Blessed are the poor in spirit, for theirs is the kingdom of heaven.' },
    { verse: 'Matthew 5:4', text: 'Blessed are those who mourn, for they shall be comforted.' },
    { verse: 'Matthew 5:5', text: 'Blessed are the meek, for they shall inherit the earth.' },
    { verse: 'Matthew 5:6', text: 'Blessed are those who hunger and thirst for righteousness, for they shall be satisfied.' },
    { verse: 'Matthew 5:7', text: 'Blessed are the merciful, for they shall receive mercy.' },
    { verse: 'Matthew 5:8', text: 'Blessed are the pure in heart, for they shall see God.' },
    { verse: 'Matthew 5:9', text: 'Blessed are the peacemakers, for they shall be called sons of God.' },
    { verse: 'Matthew 5:10', text: 'Blessed are those who are persecuted for righteousness\' sake, for theirs is the kingdom of heaven.' },
];

type FamilyMember = DashboardFamilyMember;
type ChoreCompletion = DashboardChoreCompletion;
type CalendarItem = DashboardCalendarItem;

type TaskSeriesRecord = {
    id: string;
    name?: string | null;
    startDate?: string | null;
    familyMember?: { id?: string; name?: string } | Array<{ id?: string; name?: string }> | null;
    tasks?: Task[] | null;
};

type ChoreRecord = {
    id: string;
    title?: string | null;
    description?: string | null;
    startDate: string;
    rrule?: string | null;
    exdates?: string[] | null;
    rewardType?: string | null;
    weight?: number | null;
    isUpForGrabs?: boolean | null;
    isJoint?: boolean | null;
    assignees?: Array<{ id: string; name?: string }> | null;
    assignments?: Array<{ order: number; familyMember?: { id: string; name?: string } | Array<{ id: string; name?: string }> | null }> | null;
    completions?: ChoreCompletion[] | null;
    taskSeries?: TaskSeriesRecord[] | null;
};

type ChorePreview = {
    key: string;
    title: string;
    description?: string | null;
    dueDate: Date;
    dueLabel: string;
    weight: number;
    isUpForGrabs: boolean;
};

type TaskSeriesPreview = {
    key: string;
    seriesName: string;
    choreTitle: string;
    dueDate: Date;
    dueLabel: string;
    openCount: number;
    previewTasks: string[];
};

type CalendarPreview = {
    id: string;
    title: string;
    description?: string | null;
    startsAt: Date;
    endsAt: Date;
    isAllDay: boolean;
    timeLabel: string;
};

type MemberSnapshot = {
    member: FamilyMember;
    financeLabel: string;
    xpCurrent: number;
    xpPossible: number;
    choresDueToday: number;
    choresOverdue: number;
    choresCompletedToday: number;
    taskSeriesDueSoon: number;
    nextChores: ChorePreview[];
    nextTaskSeries: TaskSeriesPreview[];
};

export default function WebFamilyDashboard() {
    const [viewMode] = useDashboardViewMode();
    const [editMode, setEditMode] = useState(false);

    // Listen for edit mode toggle events from the header button
    useEffect(() => {
        const handler = () => setEditMode((prev) => !prev);
        window.addEventListener('freeform-dashboard:toggle-edit', handler);
        return () => window.removeEventListener('freeform-dashboard:toggle-edit', handler);
    }, []);

    // Reset edit mode when switching away from family view
    useEffect(() => {
        if (viewMode !== 'family') setEditMode(false);
    }, [viewMode]);

    if (viewMode === 'personal') {
        return <PersonalDashboard />;
    }

    return <FreeformDashboard editMode={editMode} />;
}

function FamilyOverviewDashboard() {
    const { data, isLoading, error } = db.useQuery({
        familyMembers: {
            $: { order: { order: 'asc' } },
            allowanceEnvelopes: {},
        },
        unitDefinitions: {},
        chores: {
            assignees: {},
            assignments: {
                familyMember: {},
            },
            completions: {
                completedBy: {},
            },
            taskSeries: {
                tasks: {
                    parentTask: {},
                    responseFields: {},
                    updates: {
                        actor: {},
                        affectedPerson: {},
                        gradeType: {},
                        responseFieldValues: { field: {} },
                    },
                },
                familyMember: {},
            },
        },
        calendarItems: {
            pertainsTo: {},
        },
    });

    const todayUtc = useMemo(() => localDateToUTC(new Date()), []);
    const todayKey = useMemo(() => formatDateKeyUTC(todayUtc), [todayUtc]);

    const snapshot = useMemo(() => {
        const familyMembers = ((data?.familyMembers || []) as unknown as FamilyMember[]).filter((member) => !!member?.id);
        const unitDefinitions = (data?.unitDefinitions || []) as UnitDefinition[];
        const chores = (data?.chores || []) as unknown as ChoreRecord[];
        const calendarItems = (data?.calendarItems || []) as unknown as CalendarItem[];

        const choreDateRange: Date[] = [];
        for (let offset = -OVERDUE_LOOKBACK_DAYS; offset <= CHORE_LOOKAHEAD_DAYS; offset += 1) {
            choreDateRange.push(addUtcDays(todayUtc, offset));
        }

        const xpByMember = calculateDailyXP(chores as any, familyMembers as any, todayUtc);

        const choreMapByMember = new Map<string, Map<string, ChorePreview>>();
        const taskSeriesMapByMember = new Map<string, Map<string, TaskSeriesPreview>>();
        const memberStatMap = new Map<
            string,
            {
                choresDueToday: number;
                choresOverdue: number;
                choresCompletedToday: number;
                taskSeriesDueSoon: number;
            }
        >();

        familyMembers.forEach((member) => {
            choreMapByMember.set(member.id, new Map());
            taskSeriesMapByMember.set(member.id, new Map());
            memberStatMap.set(member.id, {
                choresDueToday: 0,
                choresOverdue: 0,
                choresCompletedToday: 0,
                taskSeriesDueSoon: 0,
            });
        });

        chores.forEach((chore) => {
            choreDateRange.forEach((dueDate) => {
                const assignedMembers = getAssignedMembersForChoreOnDate(chore as any, dueDate);
                if (!assignedMembers.length) return;

                const assignedIds = new Set(assignedMembers.map((member) => member.id));
                const dueDateKey = formatDateKeyUTC(dueDate);
                const completionsOnDate = getCompletedChoreCompletionsForDate(chore as any, dueDate) as ChoreCompletion[];
                const firstCompleterId = completionMemberId(completionsOnDate.find((completion) => completionMemberId(completion)));

                assignedMembers.forEach((assignedMember) => {
                    const memberId = assignedMember.id;
                    if (!memberStatMap.has(memberId)) return;

                    const memberStats = memberStatMap.get(memberId)!;
                    const memberCompletion = getMemberCompletionForDate(chore as any, memberId, dueDate);
                    const isCompleted = !!memberCompletion?.completed;

                    if (dueDateKey === todayKey && isCompleted) {
                        memberStats.choresCompletedToday += 1;
                    }

                    const claimedByOther = !!(chore.isUpForGrabs && firstCompleterId && firstCompleterId !== memberId);
                    if (isCompleted || claimedByOther) return;

                    const diff = dayDiff(todayUtc, dueDate);
                    if (diff === 0) memberStats.choresDueToday += 1;
                    if (diff < 0) memberStats.choresOverdue += 1;

                    const previewKey = `${chore.id}:${dueDateKey}`;
                    const memberChoreMap = choreMapByMember.get(memberId);
                    if (!memberChoreMap || memberChoreMap.has(previewKey)) return;

                    memberChoreMap.set(previewKey, {
                        key: previewKey,
                        title: chore.title || 'Untitled chore',
                        description: chore.description || null,
                        dueDate,
                        dueLabel: buildDueLabel(dueDate, todayUtc),
                        weight: Number(chore.weight || 0),
                        isUpForGrabs: !!chore.isUpForGrabs,
                    });
                });

                chore.taskSeries?.forEach((series) => {
                    const allTasks = [...(series.tasks || [])].sort((left, right) => (left.order || 0) - (right.order || 0));
                    if (!allTasks.length) return;

                    const owner = firstRef(series.familyMember);
                    const targetMemberIds = owner?.id ? (assignedIds.has(owner.id) ? [owner.id] : []) : Array.from(assignedIds);
                    if (!targetMemberIds.length) return;

                    if (dayDiff(todayUtc, dueDate) < 0 || dayDiff(todayUtc, dueDate) > TASK_SERIES_LOOKAHEAD_DAYS) return;

                    const scheduledTasks = getTasksForDate(
                        allTasks,
                        chore.rrule || null,
                        chore.startDate,
                        dueDate,
                        series.startDate || null,
                        chore.exdates || null
                    );
                    if (!scheduledTasks.length) return;

                    const scheduledIds = new Set(scheduledTasks.map((task) => task.id));
                    const actionableTasks = scheduledTasks.filter((task) => !hasScheduledChildren(task.id, scheduledIds, allTasks));
                    const incompleteTasks = actionableTasks.filter((task) => !task.isCompleted);
                    if (!incompleteTasks.length) return;

                    targetMemberIds.forEach((memberId) => {
                        const memberTaskMap = taskSeriesMapByMember.get(memberId);
                        const memberStats = memberStatMap.get(memberId);
                        if (!memberTaskMap || !memberStats) return;

                        const dueSoon = dayDiff(todayUtc, dueDate) <= 2;
                        if (dueSoon) {
                            memberStats.taskSeriesDueSoon += incompleteTasks.length;
                        }

                        const previewKey = `${series.id}:${memberId}:${formatDateKeyUTC(dueDate)}`;
                        if (memberTaskMap.has(previewKey)) return;

                        memberTaskMap.set(previewKey, {
                            key: previewKey,
                            seriesName: series.name || 'Task series',
                            choreTitle: chore.title || 'Untitled chore',
                            dueDate,
                            dueLabel: buildDueLabel(dueDate, todayUtc),
                            openCount: incompleteTasks.length,
                            previewTasks: incompleteTasks
                                .slice(0, 2)
                                .map((task) => task.text)
                                .filter(Boolean),
                        });
                    });
                });
            });
        });

        const calendarPreview = calendarItems
            .map((item) => {
                const { startsAt, endsAt, label } = buildCalendarLabel(item);
                return {
                    id: item.id,
                    title: item.title,
                    description: item.description || null,
                    startsAt,
                    endsAt,
                    isAllDay: item.isAllDay,
                    timeLabel: label,
                } satisfies CalendarPreview;
            })
            .filter((item) => item.endsAt.getTime() >= todayUtc.getTime())
            .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())
            .slice(0, 8);

        const memberSnapshots: MemberSnapshot[] = familyMembers.map((member) => {
            const memberStats = memberStatMap.get(member.id)!;
            const memberXp = xpByMember[member.id] || { current: 0, possible: 0 };

            const nextChores = Array.from(choreMapByMember.get(member.id)?.values() || [])
                .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())
                .slice(0, MAX_CHORE_PREVIEW);

            const nextTaskSeries = Array.from(taskSeriesMapByMember.get(member.id)?.values() || [])
                .sort((left, right) => left.dueDate.getTime() - right.dueDate.getTime())
                .slice(0, MAX_TASK_SERIES_PREVIEW);

            return {
                member,
                financeLabel: buildMemberBalanceLabel(member, unitDefinitions),
                xpCurrent: memberXp.current || 0,
                xpPossible: memberXp.possible || 0,
                choresDueToday: memberStats.choresDueToday,
                choresOverdue: memberStats.choresOverdue,
                choresCompletedToday: memberStats.choresCompletedToday,
                taskSeriesDueSoon: memberStats.taskSeriesDueSoon,
                nextChores,
                nextTaskSeries,
            };
        });

        const familySummary = {
            memberCount: familyMembers.length,
            choresDueToday: memberSnapshots.reduce((sum, member) => sum + member.choresDueToday, 0),
            choresOverdue: memberSnapshots.reduce((sum, member) => sum + member.choresOverdue, 0),
            taskSeriesDueSoon: memberSnapshots.reduce((sum, member) => sum + member.taskSeriesDueSoon, 0),
            calendarItemsUpcoming: calendarPreview.length,
        };

        return {
            memberSnapshots,
            familySummary,
            calendarPreview,
            generatedAt: new Date(),
        };
    }, [data, todayKey, todayUtc]);

    const memberGrid = useMemo(() => {
        const count = snapshot.memberSnapshots.length;
        if (count === 0) {
            return { columns: 1, rows: 1 };
        }

        let columns = 2;
        if (count <= 4) columns = 2;
        else if (count <= 6) columns = 3;
        else if (count <= 8) columns = 4;
        else if (count <= 10) columns = 5;
        else columns = 6;

        return {
            columns,
            rows: Math.max(1, Math.ceil(count / columns)),
        };
    }, [snapshot.memberSnapshots.length]);

    // Response/grading dashboard data
    const responseStats = useMemo(() => {
        const chores = (data?.chores || []) as any[];
        const allTasks: any[] = [];
        for (const chore of chores) {
            for (const series of chore.taskSeries || []) {
                for (const task of series.tasks || []) {
                    allTasks.push(task);
                }
            }
        }

        // Needs review count (tasks in needs_review workflow state)
        const needsReviewCount = allTasks.filter((task) =>
            (task as any).workflowState === 'needs_review'
        ).length;

        // Recently graded tasks (max 5)
        const recentlyGraded: Array<{ taskText: string; grade: string; gradedAt: number }> = [];
        for (const task of allTasks) {
            const updates = (task as any).updates || [];
            const gradedUpdate = updates
                .filter((u: any) => !u.isDraft && !u.gradeIsProvisional && u.gradeDisplayValue)
                .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))[0];
            if (!gradedUpdate) continue;
            recentlyGraded.push({
                taskText: task.text || 'Task',
                grade: gradedUpdate.gradeDisplayValue || String(gradedUpdate.gradeNumericValue),
                gradedAt: gradedUpdate.createdAt || 0,
            });
        }
        recentlyGraded.sort((a, b) => b.gradedAt - a.gradedAt);

        return {
            needsReviewCount,
            recentlyGraded: recentlyGraded.slice(0, 5),
        };
    }, [data?.chores]);

    const featuredPassage = useMemo(() => {
        if (BEATITUDES_ESV.length === 0) return null;
        const index = todayUtc.getUTCDate() % BEATITUDES_ESV.length;
        return BEATITUDES_ESV[index];
    }, [todayUtc]);

    if (isLoading) {
        return (
            <div className="h-full w-full overflow-auto bg-gradient-to-br from-slate-50 via-white to-amber-50/60">
                <div className="mx-auto w-full max-w-[1700px] px-4 py-8 sm:px-6 lg:px-10">
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
                        <p className="text-sm text-slate-600">Loading dashboard data...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-full w-full overflow-auto bg-gradient-to-br from-slate-50 via-white to-amber-50/60">
                <div className="mx-auto w-full max-w-[1700px] px-4 py-8 sm:px-6 lg:px-10">
                    <div className="rounded-2xl border border-red-200 bg-red-50/70 p-8 shadow-sm">
                        <p className="text-sm font-medium text-red-700">Dashboard failed to load.</p>
                        <p className="mt-2 text-sm text-red-600">{error.message}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_#fefce8_0%,_#f8fafc_40%,_#ffffff_100%)]">
            <div className="mx-auto flex h-full w-full max-w-[1880px] flex-col gap-3 px-3 py-3 sm:px-4">
                <section className="grid shrink-0 gap-3 lg:grid-cols-[1.35fr,1fr,1fr]">
                    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Family Dashboard</p>
                                </div>
                                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">What&apos;s Next</h1>
                                <p className="text-xs text-slate-600">
                                    {snapshot.generatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
                                <Link href="/chores" className="rounded-full border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-100">
                                    Chores
                                </Link>
                                <Link href="/tasks" className="rounded-full border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-100">
                                    Tasks
                                </Link>
                                <Link href="/calendar" className="rounded-full border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-100">
                                    Calendar
                                </Link>
                                <Link href="/familyMemberDetail" className="rounded-full border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-100">
                                    Finance
                                </Link>
                            </div>
                        </div>

                        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-slate-500">People</p>
                                <p className="text-xl font-semibold text-slate-900">{snapshot.familySummary.memberCount}</p>
                                <p className="text-[10px] text-slate-500">{snapshot.familySummary.calendarItemsUpcoming} upcoming events</p>
                            </div>
                            <div className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-blue-700">Chores today</p>
                                <p className="text-xl font-semibold text-blue-900">{snapshot.familySummary.choresDueToday}</p>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-amber-700">Overdue</p>
                                <p className="text-xl font-semibold text-amber-900">{snapshot.familySummary.choresOverdue}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-emerald-700">Tasks soon</p>
                                <p className="text-xl font-semibold text-emerald-900">{snapshot.familySummary.taskSeriesDueSoon}</p>
                            </div>
                        </div>
                    </div>

                    <section className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Shared Calendar
                        </div>
                        {snapshot.calendarPreview.length === 0 ? (
                            <p className="mt-2 text-xs text-slate-500">No upcoming calendar items.</p>
                        ) : (
                            <ul className="mt-2 space-y-1.5">
                                {snapshot.calendarPreview.slice(0, 4).map((item) => (
                                    <li key={`global-calendar-${item.id}`} className="rounded-md border border-slate-200 bg-slate-50/70 px-2 py-1.5">
                                        <p className="truncate text-xs font-semibold text-slate-900">{item.title}</p>
                                        <p className="text-[11px] text-slate-600">{item.timeLabel}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <aside className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-100/70 p-3 shadow-sm">
                        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                            <Sparkles className="h-3.5 w-3.5" />
                            Current Passage
                        </div>
                        <p className="mt-1 text-sm font-semibold text-amber-950">The Beatitudes (Matthew 5, ESV)</p>
                        {featuredPassage ? (
                            <p className="mt-1.5 text-sm leading-5 text-amber-950 font-serif">
                                <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">{featuredPassage.verse}</span>
                                {featuredPassage.text}
                            </p>
                        ) : null}
                    </aside>
                </section>

                {(responseStats.needsReviewCount > 0 || responseStats.recentlyGraded.length > 0) && (
                    <section className="grid shrink-0 gap-2.5 sm:grid-cols-2">
                        {responseStats.needsReviewCount > 0 && (
                            <div className="rounded-xl border border-violet-200 bg-white/95 p-3 shadow-sm">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                                        Needs Review
                                    </div>
                                    <span className="text-xl font-semibold text-violet-900">{responseStats.needsReviewCount}</span>
                                </div>
                                <p className="mt-1 text-xs text-slate-600">
                                    {responseStats.needsReviewCount} task{responseStats.needsReviewCount !== 1 ? 's have' : ' has'} submitted responses awaiting review.
                                </p>
                                <Link href="/task-series" className="mt-2 inline-block rounded-full border border-violet-200 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50">
                                    Review now
                                </Link>
                            </div>
                        )}
                        {responseStats.recentlyGraded.length > 0 && (
                            <div className="rounded-xl border border-emerald-200 bg-white/95 p-3 shadow-sm">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                                    Recently Graded
                                </div>
                                <ul className="mt-2 space-y-1.5">
                                    {responseStats.recentlyGraded.map((item, i) => (
                                        <li key={i} className="flex items-center justify-between gap-2 text-xs">
                                            <span className="truncate text-slate-700">{item.taskText}</span>
                                            <span className="shrink-0 font-semibold text-emerald-700">{item.grade}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </section>
                )}

                {snapshot.memberSnapshots.length === 0 ? (
                    <section className="flex min-h-0 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
                        <p className="text-sm text-slate-500">No family members found yet.</p>
                    </section>
                ) : (
                    <section
                        className="grid min-h-0 flex-1 gap-2.5"
                        style={{
                            gridTemplateColumns: `repeat(${memberGrid.columns}, minmax(0, 1fr))`,
                            gridTemplateRows: `repeat(${memberGrid.rows}, minmax(0, 1fr))`,
                        }}
                    >
                        {snapshot.memberSnapshots.map((snapshotByMember) => {
                            const photoUrl =
                                snapshotByMember.member.photoUrls?.['320'] ||
                                snapshotByMember.member.photoUrls?.['1200'] ||
                                snapshotByMember.member.photoUrls?.['64'] ||
                                undefined;

                            const nextChore = snapshotByMember.nextChores[0];
                            const nextTask = snapshotByMember.nextTaskSeries[0];

                            return (
                                <article key={snapshotByMember.member.id} className="flex min-h-0 h-full flex-col gap-2 rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-sm">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Avatar className="h-8 w-8 border border-slate-200">
                                                {photoUrl ? <AvatarImage src={photoUrl} alt={snapshotByMember.member.name} /> : null}
                                                <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-700">
                                                    {toInitials(snapshotByMember.member.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-slate-900">{snapshotByMember.member.name}</p>
                                                <p className="text-[10px] uppercase tracking-wide text-slate-500">{snapshotByMember.member.role || 'member'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase tracking-wide text-slate-500">XP</p>
                                            <p className="text-xs font-semibold text-slate-900">
                                                {snapshotByMember.xpCurrent}/{snapshotByMember.xpPossible}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="rounded-md border border-slate-200 bg-slate-50/70 px-2 py-1">
                                        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                            <Wallet2 className="h-3 w-3" />
                                            Finance
                                        </div>
                                        <p className="truncate text-xs text-slate-800">{snapshotByMember.financeLabel}</p>
                                    </div>

                                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                                        <div className="rounded-md border border-slate-200 px-1.5 py-1">
                                            <p className="uppercase tracking-wide text-slate-500">Due</p>
                                            <p className="text-sm font-semibold text-slate-900">{snapshotByMember.choresDueToday}</p>
                                        </div>
                                        <div className="rounded-md border border-slate-200 px-1.5 py-1">
                                            <p className="uppercase tracking-wide text-slate-500">Over</p>
                                            <p className="text-sm font-semibold text-amber-700">{snapshotByMember.choresOverdue}</p>
                                        </div>
                                        <div className="rounded-md border border-slate-200 px-1.5 py-1">
                                            <p className="uppercase tracking-wide text-slate-500">Tasks</p>
                                            <p className="text-sm font-semibold text-blue-700">{snapshotByMember.taskSeriesDueSoon}</p>
                                        </div>
                                    </div>

                                    <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
                                        <section className="rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1.5">
                                            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Next chore
                                            </div>
                                            {nextChore ? (
                                                <>
                                                    <p className="mt-1 truncate text-xs font-semibold text-slate-900">{nextChore.title}</p>
                                                    <p className="text-[10px] text-slate-600">{nextChore.dueLabel}</p>
                                                </>
                                            ) : (
                                                <p className="mt-1 text-[11px] text-slate-500">No pending chore</p>
                                            )}
                                        </section>

                                        <section className="rounded-md border border-slate-200 bg-slate-50/60 px-2 py-1.5">
                                            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                                                <ListTodo className="h-3 w-3" />
                                                Next task
                                            </div>
                                            {nextTask ? (
                                                <>
                                                    <p className="mt-1 truncate text-xs font-semibold text-slate-900">{nextTask.seriesName}</p>
                                                    <p className="text-[10px] text-slate-600">{nextTask.dueLabel}</p>
                                                </>
                                            ) : (
                                                <p className="mt-1 text-[11px] text-slate-500">No queued task</p>
                                            )}
                                        </section>
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                )}
            </div>
        </div>
    );
}
