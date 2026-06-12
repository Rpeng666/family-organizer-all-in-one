'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AttachmentCollection } from '@/components/attachments/AttachmentCollection';
import { TaskFeedbackReplies, TaskResponseFieldValuesList } from '@/components/task-updates/TaskUpdateThread';
import {
    collapseCalendarHistoryEvents,
    getCalendarHistoryDetail,
    getCalendarHistoryHeadline,
    HISTORY_CALENDAR_INLINE_DETAILS_MAX,
} from '@/lib/calendar-history';
import {
    getHistoryActorKey,
    getHistoryActorLabel,
    getHistoryAffectedMemberIds,
    getLinkedMessage,
    HISTORY_ACTOR_APPLE_SYNC,
    HISTORY_DOMAIN_LABELS,
    type HistoryEventLike,
    type HistoryFilterMode,
    toggleFilterMode,
} from '@/lib/history-events';
import {
    getTaskUpdateActorId,
    getTaskUpdateReplyToId,
    isTaskUpdateReply,
    taskUpdateHasMeaningfulFeedbackContent,
    taskUpdateHasMeaningfulResponseContent,
    type TaskUpdateLike,
} from '@/lib/task-progress';
import { cn } from '@/lib/utils';

type HistoryPageProps = {
    initialSelectedMember?: string | null;
    initialDomain?: string | null;
    initialTaskSeriesId?: string | null;
};

type HistoryDisplayEntry = {
    key: string;
    representative: HistoryEventLike;
    events: HistoryEventLike[];
    inlineEvents: HistoryEventLike[];
    hasOverflowDetails: boolean;
    isCollapsedCalendarGroup: boolean;
    summary: string;
    detailText: string | null;
};

type TaskHistoryUpdateRecord = {
    taskId: string;
    update: TaskUpdateLike;
};

function cycleFilter(map: Record<string, HistoryFilterMode>, key: string) {
    return {
        ...map,
        [key]: toggleFilterMode(map[key] || 'off'),
    };
}

function matchesFilterGroup(filterModes: Record<string, HistoryFilterMode>, eventKeys: string[]) {
    const keys = Array.from(new Set(eventKeys.filter(Boolean)));
    const includeKeys = Object.entries(filterModes)
        .filter(([, mode]) => mode === 'include')
        .map(([key]) => key);
    const excludeKeys = Object.entries(filterModes)
        .filter(([, mode]) => mode === 'exclude')
        .map(([key]) => key);

    if (includeKeys.length > 0 && !includeKeys.some((key) => keys.includes(key))) {
        return false;
    }
    if (excludeKeys.some((key) => keys.includes(key))) {
        return false;
    }
    return true;
}

function formatOccurredAt(value?: string | null) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';

    return parsed.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function filterButtonClass(mode: HistoryFilterMode) {
    if (mode === 'include') {
        return 'border-sky-300/60 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
    }
    if (mode === 'exclude') {
        return 'border-rose-300/60 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300';
    }
    return 'border-border/60 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground';
}

function sortHistoryEventsChronologically(events: HistoryEventLike[]) {
    return events
        .slice()
        .sort((left, right) => new Date(String(left.occurredAt || '')).getTime() - new Date(String(right.occurredAt || '')).getTime());
}

function getFinanceDescriptionLine(event: HistoryEventLike | null | undefined) {
    if (event?.domain !== 'finance') return null;

    const actionType = String(event.actionType || '');
    if (actionType !== 'envelope_deposit' && actionType !== 'envelope_withdrawal') {
        return null;
    }

    const description = typeof event.metadata?.description === 'string' ? event.metadata.description.trim() : '';
    if (!description) return null;
    if ((actionType === 'envelope_deposit' && /^deposit$/i.test(description)) || (actionType === 'envelope_withdrawal' && /^withdrawal$/i.test(description))) {
        return null;
    }

    return description;
}

function getTaskUpdateOccurredAtIso(value: number | string | Date | null | undefined): string | null {
    if (!value) return null;
    const parsed = typeof value === 'number' ? new Date(value) : new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function getTaskUpdateLookupKey(taskId: string, occurredAt: string): string {
    return `${taskId}::${occurredAt}`;
}

export default function HistoryPage({
    initialSelectedMember = null,
    initialDomain = null,
    initialTaskSeriesId = null,
}: HistoryPageProps) {
    const [selectedMember, setSelectedMember] = useState<string | 'All'>(initialSelectedMember || 'All');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [queryLimit, setQueryLimit] = useState(200);
    const [domainFilters, setDomainFilters] = useState<Record<string, HistoryFilterMode>>({});
    const [actorFilters, setActorFilters] = useState<Record<string, HistoryFilterMode>>({});
    const [affectedFilters, setAffectedFilters] = useState<Record<string, HistoryFilterMode>>({});
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd] = useState('');
    const [taskSeriesFilterId, setTaskSeriesFilterId] = useState(initialTaskSeriesId || '');
    const [taskSeriesFilterMode, setTaskSeriesFilterMode] = useState<'include' | 'exclude'>('include');
    const [expandedDetailGroups, setExpandedDetailGroups] = useState<Record<string, boolean>>({});
    const [detailDialogGroupKey, setDetailDialogGroupKey] = useState<string | null>(null);

    const { data, isLoading, error } = db.useQuery({
        historyEvents: {
            $: {
                order: {
                    occurredAt: sortDirection,
                },
                limit: queryLimit,
            },
            actor: {},
            affectedFamilyMembers: {},
            attachments: {},
            message: {
                attachments: {},
                author: {},
            },
        },
        familyMembers: {
            $: {
                order: {
                    order: 'asc',
                },
            },
        },
        taskSeries: {
            familyMember: {},
        },
        tasks: {
            updates: {
                actor: {},
                affectedPerson: {},
                attachments: {},
                gradeType: {},
                replyTo: {},
                responseFieldValues: {
                    field: {},
                },
            },
        },
    });

    const familyMembers = useMemo(() => (data?.familyMembers as any[]) || [], [data?.familyMembers]);
    const taskSeriesList = useMemo(() => (data?.taskSeries as any[]) || [], [data?.taskSeries]);
    const tasks = useMemo(() => (data?.tasks as any[]) || [], [data?.tasks]);
    const historyEvents = useMemo(() => (data?.historyEvents as HistoryEventLike[]) || [], [data?.historyEvents]);
    const familyMemberNamesById = useMemo(
        () => new Map(familyMembers.map((member: any) => [member.id, member.name || 'Unknown'])),
        [familyMembers]
    );

    const taskUpdateRecords = useMemo<TaskHistoryUpdateRecord[]>(() => {
        const records: TaskHistoryUpdateRecord[] = [];
        for (const task of tasks) {
            for (const update of task.updates || []) {
                records.push({ taskId: task.id, update });
            }
        }
        return records;
    }, [tasks]);

    const taskUpdatesById = useMemo(() => {
        const lookup = new Map<string, TaskHistoryUpdateRecord>();
        for (const record of taskUpdateRecords) {
            if (record.update.id) {
                lookup.set(record.update.id, record);
            }
        }
        return lookup;
    }, [taskUpdateRecords]);

    const taskUpdatesByLookupKey = useMemo(() => {
        const lookup = new Map<string, TaskHistoryUpdateRecord[]>();
        for (const record of taskUpdateRecords) {
            const occurredAt = getTaskUpdateOccurredAtIso(record.update.createdAt);
            if (!occurredAt) continue;
            const key = getTaskUpdateLookupKey(record.taskId, occurredAt);
            lookup.set(key, [...(lookup.get(key) || []), record]);
        }
        return lookup;
    }, [taskUpdateRecords]);

    useEffect(() => {
        if (!initialDomain) return;
        setDomainFilters((prev) => ({
            ...prev,
            [initialDomain]: prev[initialDomain] === 'off' || !prev[initialDomain] ? 'include' : prev[initialDomain],
        }));
    }, [initialDomain]);

    const actorOptions = useMemo(() => {
        const options = familyMembers.map((member: any) => ({
            id: member.id,
            label: member.name || 'Unknown',
        }));

        if (historyEvents.some((event) => getHistoryActorKey(event) === HISTORY_ACTOR_APPLE_SYNC)) {
            options.push({
                id: HISTORY_ACTOR_APPLE_SYNC,
                label: 'Apple Sync',
            });
        }

        return options;
    }, [familyMembers, historyEvents]);

    const getTaskUpdateRecordForEvent = useCallback(
        (event: HistoryEventLike | null | undefined): TaskHistoryUpdateRecord | null => {
            if (!event?.taskId || event.domain !== 'tasks') return null;

            const metadataTaskUpdateId =
                typeof event.metadata?.taskUpdateId === 'string' && event.metadata.taskUpdateId.trim().length > 0
                    ? event.metadata.taskUpdateId
                    : null;
            if (metadataTaskUpdateId) {
                return taskUpdatesById.get(metadataTaskUpdateId) || null;
            }

            if (!event.occurredAt) return null;
            const candidates =
                taskUpdatesByLookupKey.get(getTaskUpdateLookupKey(event.taskId, event.occurredAt)) || [];
            if (candidates.length === 0) return null;
            if (candidates.length === 1) return candidates[0];

            const actorId = event.actorFamilyMemberId || null;
            if (actorId) {
                const matchedByActor = candidates.find((candidate) => getTaskUpdateActorId(candidate.update) === actorId);
                if (matchedByActor) return matchedByActor;
            }

            return candidates[0] || null;
        },
        [taskUpdatesById, taskUpdatesByLookupKey]
    );

    const filteredEvents = useMemo(() => {
        return historyEvents.filter((event) => {
            const actorKey = getHistoryActorKey(event);
            const affectedIds = getHistoryAffectedMemberIds(event);
            const linkedMessage = getLinkedMessage(event);

            if (selectedMember !== 'All') {
                const involvesSelectedMember = actorKey === selectedMember || affectedIds.includes(selectedMember);
                if (!involvesSelectedMember) {
                    return false;
                }
            }

            if (!matchesFilterGroup(domainFilters, [String(event.domain || '')])) {
                return false;
            }

            if (!matchesFilterGroup(actorFilters, actorKey ? [actorKey] : [])) {
                return false;
            }

            if (!matchesFilterGroup(affectedFilters, affectedIds)) {
                return false;
            }

            if (taskSeriesFilterId) {
                const matched = event.taskSeriesId === taskSeriesFilterId;
                if (taskSeriesFilterMode === 'include' && !matched) {
                    return false;
                }
                if (taskSeriesFilterMode === 'exclude' && matched) {
                    return false;
                }
            }

            const occurredAt = String(event.occurredAt || '');
            if (dateStart && occurredAt.slice(0, 10) < dateStart) {
                return false;
            }
            if (dateEnd && occurredAt.slice(0, 10) > dateEnd) {
                return false;
            }

            if (event.domain === 'messages' && !linkedMessage && !event.messageId) {
                return false;
            }

            return true;
        });
    }, [historyEvents, selectedMember, domainFilters, actorFilters, affectedFilters, taskSeriesFilterId, taskSeriesFilterMode, dateStart, dateEnd]);

    const historyDisplayEntries = useMemo<HistoryDisplayEntry[]>(() => {
        return collapseCalendarHistoryEvents(filteredEvents).map((group) => {
            const chronologicalEvents = sortHistoryEventsChronologically(group.events);
            const representative = group.events[0];
            const isCollapsedCalendarGroup = representative.domain === 'calendar' && group.events.length > 1;

            return {
                key: group.key,
                representative,
                events: chronologicalEvents,
                inlineEvents: chronologicalEvents.slice(0, HISTORY_CALENDAR_INLINE_DETAILS_MAX),
                hasOverflowDetails: chronologicalEvents.length > HISTORY_CALENDAR_INLINE_DETAILS_MAX,
                isCollapsedCalendarGroup,
                summary: representative.domain === 'calendar' ? getCalendarHistoryHeadline(group.events) : String(representative.summary || ''),
                detailText: representative.domain === 'calendar' ? getCalendarHistoryDetail(group.events) : null,
            };
        });
    }, [filteredEvents]);

    const detailDialogEntry = useMemo(
        () => historyDisplayEntries.find((entry) => entry.key === detailDialogGroupKey) || null,
        [detailDialogGroupKey, historyDisplayEntries]
    );

    const jumpToNow = () => {
        window.scrollTo({
            top: sortDirection === 'desc' ? 0 : document.body.scrollHeight,
            behavior: 'smooth',
        });
    };

    const clearFilters = () => {
        setDomainFilters(initialDomain ? { [initialDomain]: 'include' } : {});
        setActorFilters({});
        setAffectedFilters({});
        setDateStart('');
        setDateEnd('');
        setTaskSeriesFilterId(initialTaskSeriesId || '');
        setTaskSeriesFilterMode('include');
        setExpandedDetailGroups({});
        setDetailDialogGroupKey(null);
    };

    return (
        <div className="mx-auto w-full max-w-5xl px-4 md:px-6 py-8 space-y-6">

            {/* HERO */}
            <section className="rounded-3xl border border-border/60 bg-card px-6 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-1">Family Activity</p>
                        <h1
                            className="text-3xl text-foreground"
                            style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500, letterSpacing: '-0.02em' }}
                        >
                            Activity History
                        </h1>
                        <p className="mt-1.5 text-sm text-muted-foreground/60">
                            {historyDisplayEntries.length} events · unified family activity
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                        <Button type="button" variant="ghost" size="sm" className="rounded-full border border-border/60" onClick={jumpToNow}>
                            Jump to now
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="rounded-full border border-border/60" onClick={clearFilters}>
                            Clear filters
                        </Button>
                    </div>
                </div>

                {/* Member pills */}
                {familyMembers.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setSelectedMember('All')}
                            className={cn(
                                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-200',
                                selectedMember === 'All'
                                    ? 'border-foreground/20 bg-foreground text-background'
                                    : 'border-border/60 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
                            )}
                        >
                            All
                        </button>
                        {familyMembers.map((member: any) => {
                            const isActive = selectedMember === member.id;
                            const photoUrl = member.resizedPhotoUrls?.small ?? member.photoUrl ?? null;
                            return (
                                <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => setSelectedMember(member.id)}
                                    className={cn(
                                        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-200',
                                        isActive
                                            ? 'border-foreground/20 bg-foreground text-background'
                                            : 'border-border/60 bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground',
                                    )}
                                >
                                    <Avatar className="h-5 w-5 shrink-0">
                                        {photoUrl ? <AvatarImage src={photoUrl} alt={member.name} /> : null}
                                        <AvatarFallback className="text-[9px] bg-muted">
                                            {String(member.name || '?').slice(0, 1).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    {member.name}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Domain filter pills */}
                <div className="mt-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">Activity Types</p>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(HISTORY_DOMAIN_LABELS).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setDomainFilters((prev) => cycleFilter(prev, key))}
                                className={`rounded-full border px-3 py-1 text-sm transition-colors ${filterButtonClass(domainFilters[key] || 'off')}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {/* SECONDARY — More filters (collapsible) */}
            <details className="rounded-2xl border border-border/60 bg-card px-5 py-4">
                <summary className="cursor-pointer text-sm font-semibold text-foreground select-none">More filters</summary>
                <div className="mt-4 space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">Actor</p>
                            <div className="flex flex-wrap gap-2">
                                {actorOptions.map((actor) => (
                                    <button
                                        key={actor.id}
                                        type="button"
                                        onClick={() => setActorFilters((prev) => cycleFilter(prev, actor.id))}
                                        className={`rounded-full border px-3 py-1 text-sm transition-colors ${filterButtonClass(actorFilters[actor.id] || 'off')}`}
                                    >
                                        {actor.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">Affected People</p>
                            <div className="flex flex-wrap gap-2">
                                {familyMembers.map((member: any) => (
                                    <button
                                        key={member.id}
                                        type="button"
                                        onClick={() => setAffectedFilters((prev) => cycleFilter(prev, member.id))}
                                        className={`rounded-full border px-3 py-1 text-sm transition-colors ${filterButtonClass(affectedFilters[member.id] || 'off')}`}
                                    >
                                        {member.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">Task Series</p>
                            <select
                                value={taskSeriesFilterId}
                                onChange={(event) => setTaskSeriesFilterId(event.target.value)}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                            >
                                <option value="">All task series</option>
                                {taskSeriesList
                                    .slice()
                                    .sort((left: any, right: any) => String(left.name || '').localeCompare(String(right.name || '')))
                                    .map((series: any) => (
                                        <option key={series.id} value={series.id}>
                                            {series.name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">Series Mode</p>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setTaskSeriesFilterMode((prev) => (prev === 'include' ? 'exclude' : 'include'))}
                            >
                                {taskSeriesFilterMode === 'include' ? 'Include' : 'Exclude'}
                            </Button>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">Sort</p>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                            >
                                {sortDirection === 'desc' ? 'Newest first' : 'Oldest first'}
                            </Button>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">Start Date</p>
                            <input
                                type="date"
                                value={dateStart}
                                onChange={(event) => setDateStart(event.target.value)}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 mb-2">End Date</p>
                            <input
                                type="date"
                                value={dateEnd}
                                onChange={(event) => setDateEnd(event.target.value)}
                                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
                            />
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground/60">Click a filter pill repeatedly to cycle include, exclude, and off.</p>
                </div>
            </details>

            {/* PRIMARY — Feed */}
            {error ? (
                <div className="rounded-2xl border border-rose-300/60 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-800 dark:text-rose-300">
                    {error.message}
                </div>
            ) : null}
            {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading history...</div>
            ) : null}

            {!isLoading && historyDisplayEntries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
                    No history items match these filters.
                </div>
            ) : null}

            <div className="space-y-3">
                {historyDisplayEntries.map((entry) => {
                    const event = entry.representative;
                    const linkedMessage = getLinkedMessage(event);
                    const actorLabel = getHistoryActorLabel(event, familyMemberNamesById);
                    const affectedLabels = Array.from(
                        new Set(
                            entry.events
                                .flatMap((historyEvent) => getHistoryAffectedMemberIds(historyEvent))
                                .map((memberId) => familyMemberNamesById.get(memberId))
                                .filter(Boolean)
                        )
                    );
                    const messageAttachments = linkedMessage?.attachments || [];
                    const eventAttachments = event.attachments || [];
                    const financeDescriptionLine = getFinanceDescriptionLine(event);
                    const detailsNote =
                        entry.detailText || (typeof event.metadata?.note === 'string' ? event.metadata.note : null);
                    const isExpanded = Boolean(expandedDetailGroups[entry.key]);
                    const taskUpdateRecord = getTaskUpdateRecordForEvent(event);
                    const taskUpdate = taskUpdateRecord?.update || null;
                    const replyToId = getTaskUpdateReplyToId(taskUpdate);
                    const feedbackTarget = replyToId ? taskUpdatesById.get(replyToId)?.update || null : null;
                    const isTaskResponseEntry = Boolean(
                        taskUpdate &&
                            !isTaskUpdateReply(taskUpdate) &&
                            taskUpdateHasMeaningfulResponseContent(taskUpdate)
                    );
                    const isTaskFeedbackEntry = Boolean(
                        taskUpdate &&
                            isTaskUpdateReply(taskUpdate) &&
                            taskUpdateHasMeaningfulFeedbackContent(taskUpdate) &&
                            feedbackTarget &&
                            taskUpdateHasMeaningfulResponseContent(feedbackTarget)
                    );
                    const taskText =
                        typeof event.metadata?.taskText === 'string' && event.metadata.taskText.trim().length > 0
                            ? event.metadata.taskText.trim()
                            : 'Task';
                    const taskHistorySummary = isTaskFeedbackEntry
                        ? `${actorLabel || 'Someone'} left feedback on "${taskText}"`
                        : isTaskResponseEntry
                          ? `${actorLabel || 'Someone'} submitted a response for "${taskText}"`
                          : entry.summary;

                    return (
                        <div key={entry.key} className="rounded-3xl border border-border/60 bg-card p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span className="rounded-full border border-border/60 bg-secondary/60 px-2 py-0.5 font-semibold text-foreground">
                                    {HISTORY_DOMAIN_LABELS[(event.domain as keyof typeof HISTORY_DOMAIN_LABELS) || 'system'] || event.domain}
                                </span>
                                {event.source === 'apple_sync' ? (
                                    <span className="rounded-full border border-amber-300/60 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                        Apple Sync
                                    </span>
                                ) : null}
                                <span>{formatOccurredAt(event.occurredAt)}</span>
                            </div>

                            <div className="mt-3 text-base font-semibold text-foreground">{taskHistorySummary}</div>

                            {financeDescriptionLine ? (
                                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{financeDescriptionLine}</div>
                            ) : null}

                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                                {actorLabel ? <span>Actor: {actorLabel}</span> : null}
                                {affectedLabels.length > 0 ? <span>Affected: {affectedLabels.join(', ')}</span> : null}
                                {linkedMessage?.editedAt ? <span>Edited</span> : null}
                                {entry.isCollapsedCalendarGroup ? <span>{entry.events.length} quick changes combined</span> : null}
                            </div>

                            {isTaskResponseEntry && taskUpdate ? (
                                <div className="mt-3 rounded-2xl border border-sky-300/60 bg-sky-50/40 dark:bg-sky-950/20 p-3">
                                    {taskUpdate.note ? (
                                        <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                                            {taskUpdate.note}
                                        </div>
                                    ) : null}
                                    <TaskResponseFieldValuesList
                                        responseFieldValues={taskUpdate.responseFieldValues}
                                        className={taskUpdate.note ? 'mt-2' : undefined}
                                        itemClassName="border-sky-100 bg-card/80"
                                    />
                                    {taskUpdate.attachments && taskUpdate.attachments.length > 0 ? (
                                        <AttachmentCollection
                                            attachments={taskUpdate.attachments as any[]}
                                            className="mt-3"
                                            variant="compact"
                                        />
                                    ) : null}
                                </div>
                            ) : null}

                            {isTaskFeedbackEntry && taskUpdate && feedbackTarget ? (
                                <div className="mt-3 space-y-3">
                                    <div className="rounded-2xl border border-border/60 bg-secondary/40 p-3">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                                            Quoted response
                                        </div>
                                        {feedbackTarget.note ? (
                                            <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                                                {feedbackTarget.note}
                                            </div>
                                        ) : null}
                                        <TaskResponseFieldValuesList
                                            responseFieldValues={feedbackTarget.responseFieldValues}
                                            className={feedbackTarget.note ? 'mt-2' : 'mt-2'}
                                            itemClassName="border-border/60 bg-card"
                                        />
                                        {feedbackTarget.attachments && feedbackTarget.attachments.length > 0 ? (
                                            <AttachmentCollection
                                                attachments={feedbackTarget.attachments as any[]}
                                                className="mt-3"
                                                variant="compact"
                                            />
                                        ) : null}
                                    </div>

                                    <TaskFeedbackReplies replies={[taskUpdate]} tone="indigo" />
                                </div>
                            ) : null}

                            {!isTaskResponseEntry && !isTaskFeedbackEntry && linkedMessage?.body ? (
                                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{linkedMessage.body}</div>
                            ) : null}
                            {!isTaskResponseEntry && !isTaskFeedbackEntry && !linkedMessage?.body && detailsNote ? (
                                <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detailsNote}</div>
                            ) : null}

                            {entry.isCollapsedCalendarGroup ? (
                                <div className="mt-3 rounded-2xl border border-border/60 bg-secondary/40 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-xs text-muted-foreground">See the intermediate edits without losing the combined net change.</div>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setExpandedDetailGroups((current) => ({
                                                    ...current,
                                                    [entry.key]: !current[entry.key],
                                                }))
                                            }
                                            className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                                        >
                                            {isExpanded ? 'Hide details' : 'See details'}
                                        </button>
                                    </div>

                                    {isExpanded ? (
                                        <div className="mt-3 space-y-2">
                                            {entry.inlineEvents.map((detailEvent) => {
                                                const detailText = getCalendarHistoryDetail(detailEvent);
                                                return (
                                                    <div key={detailEvent.id} className="rounded-2xl border border-border/60 bg-card px-3 py-2.5">
                                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                            <span>{formatOccurredAt(detailEvent.occurredAt)}</span>
                                                            {detailEvent.source === 'apple_sync' ? <span>Apple Sync</span> : null}
                                                        </div>
                                                        <div className="mt-1 text-sm font-medium text-foreground">{detailEvent.summary}</div>
                                                        {detailText ? (
                                                            <div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detailText}</div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}

                                            {entry.hasOverflowDetails ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setDetailDialogGroupKey(entry.key)}
                                                    className="text-xs font-medium text-sky-700 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300"
                                                >
                                                    View all details
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}

                            {messageAttachments.length > 0 ? (
                                <AttachmentCollection attachments={messageAttachments} className="mt-3" variant="panel" />
                            ) : null}

                            {!isTaskResponseEntry && !isTaskFeedbackEntry && eventAttachments.length > 0 ? (
                                <AttachmentCollection attachments={eventAttachments} className="mt-3" variant="panel" />
                            ) : null}
                        </div>
                    );
                })}
            </div>

            {filteredEvents.length >= queryLimit ? (
                <div className="flex justify-center pb-8">
                    <Button type="button" variant="outline" onClick={() => setQueryLimit((prev) => prev + 200)}>
                        Load more
                    </Button>
                </div>
            ) : null}

            <Dialog open={Boolean(detailDialogEntry)} onOpenChange={(open) => setDetailDialogGroupKey(open ? detailDialogGroupKey : null)}>
                {detailDialogEntry ? (
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>{detailDialogEntry.summary}</DialogTitle>
                            <DialogDescription>Full detail for the collapsed calendar history changes.</DialogDescription>
                        </DialogHeader>

                        <div className="space-y-3">
                            {detailDialogEntry.events.map((detailEvent) => {
                                const detailText = getCalendarHistoryDetail(detailEvent);
                                return (
                                    <div key={detailEvent.id} className="rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3">
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <span>{formatOccurredAt(detailEvent.occurredAt)}</span>
                                            {detailEvent.source === 'apple_sync' ? <span>Apple Sync</span> : null}
                                        </div>
                                        <div className="mt-2 text-sm font-semibold text-foreground">{detailEvent.summary}</div>
                                        {detailText ? (
                                            <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{detailText}</div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </DialogContent>
                ) : null}
            </Dialog>
        </div>
    );
}
