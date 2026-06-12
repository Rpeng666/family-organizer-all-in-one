'use client';

import React, { useMemo } from 'react';
import { parseISO, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { recurrenceSummary, parseRecurrenceUiStateFromRrule } from '@/lib/recurrence';

interface FamilyMember {
    id: string;
    name?: string | null;
}

interface CalendarTag {
    id?: string;
    name: string;
    normalizedName?: string;
}

interface CalendarAlarm {
    action?: string;
    triggerAt?: string;
    triggerOffsetMinutesBeforeStart?: number;
    triggerOffsetSeconds?: number;
    triggerType?: string;
    repeatCount?: number;
    repeatDurationMinutes?: number;
    repeatUntilAcknowledged?: boolean;
    [key: string]: any;
}

interface CalendarItem {
    id: string;
    title: string;
    description?: string | null;
    startDate: string;
    endDate: string;
    isAllDay: boolean;
    pertainsTo?: FamilyMember[];
    tags?: CalendarTag[];
    alarms?: CalendarAlarm[] | null;
    createdAt?: string;
    dtStamp?: string;
    eventType?: string;
    exdates?: string[];
    lastModified?: string;
    location?: string;
    recurrenceId?: string;
    recurrenceIdRange?: string;
    recurrenceLines?: string[];
    recurringEventId?: string;
    rdates?: string[];
    rrule?: string;
    sequence?: number;
    status?: string;
    timeZone?: string;
    transparency?: string;
    travelDurationAfterMinutes?: number;
    travelDurationBeforeMinutes?: number;
    uid?: string;
    updatedAt?: string;
    visibility?: string;
    sourceCalendarName?: string;
    sourceExternalId?: string;
    sourceRemoteUrl?: string;
    [key: string]: any;
}

interface CalendarEventDetailDialogProps {
    event: CalendarItem | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onEdit: () => void;
}

function getLocalTimeZone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
        return 'UTC';
    }
}

function formatHumanDate(value: Date, timeZone?: string): string {
    return new Intl.DateTimeFormat(undefined, {
        timeZone: timeZone || getLocalTimeZone(),
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(value);
}

function formatClock(value: Date, timeZone?: string): string {
    return new Intl.DateTimeFormat(undefined, {
        timeZone: timeZone || getLocalTimeZone(),
        hour: 'numeric',
        minute: '2-digit',
    })
        .format(value)
        .replace(/\s?(AM|PM)$/i, (match) => match.toLowerCase());
}

function getTimeZoneShortLabel(value: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'short',
    }).formatToParts(value);
    return parts.find((part) => part.type === 'timeZoneName')?.value || timeZone;
}

function formatDateTimeCompact(value?: string | null): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function humanJoin(items: string[]): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
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

function getRecurrenceDetail(event: CalendarItem) {
    const rruleStr = String(event.rrule || '').trim();
    const startDateToken = (event.startDate || '').slice(0, 10);

    if (!rruleStr) {
        return { summary: 'Does not repeat', repeatEnd: 'One-time event' };
    }

    try {
        const recurrenceState = parseRecurrenceUiStateFromRrule(rruleStr, startDateToken);
        let repeatEnd = 'Repeats forever';
        if (recurrenceState.repeatEndMode === 'until' && recurrenceState.repeatEndUntil) {
            const untilDate = parseISO(`${recurrenceState.repeatEndUntil}T00:00:00`);
            repeatEnd = `Ends on ${formatHumanDate(untilDate)}`;
        } else if (recurrenceState.repeatEndMode === 'count') {
            repeatEnd = `${recurrenceState.repeatEndCount} total occurrences`;
        }

        return {
            summary: recurrenceSummary(recurrenceState, startDateToken),
            repeatEnd,
        };
    } catch {
        return { summary: 'Custom repeat rule', repeatEnd: 'Advanced recurrence' };
    }
}

function describeAlarms(alarms?: CalendarAlarm[] | null): string[] {
    if (!alarms || alarms.length === 0) return [];
    return alarms.map((alarm) => {
        if (alarm.triggerType === 'relative' || alarm.triggerOffsetMinutesBeforeStart != null) {
            const minutes = alarm.triggerOffsetMinutesBeforeStart ?? 0;
            if (minutes > 0) return `${minutes} minute${minutes === 1 ? '' : 's'} before start`;
            if (minutes === 0) return 'At start time';
            return `${Math.abs(minutes)} minute${Math.abs(minutes) === 1 ? '' : 's'} after start`;
        }
        if (alarm.triggerAt) return `At ${formatDateTimeCompact(alarm.triggerAt)}`;
        return 'Alert enabled';
    });
}

function describeTravelBuffers(event: CalendarItem): string[] {
    const lines: string[] = [];
    const before = event.travelDurationBeforeMinutes;
    const after = event.travelDurationAfterMinutes;
    if (before != null && Number.isFinite(before) && before > 0) {
        lines.push(`${before} min travel time before`);
    }
    if (after != null && Number.isFinite(after) && after > 0) {
        lines.push(`${after} min travel time after`);
    }
    return lines;
}

export default function CalendarEventDetailDialog({ event, open, onOpenChange, onEdit }: CalendarEventDetailDialogProps) {
    const detail = useMemo(() => {
        if (!event) return null;

        const localTz = getLocalTimeZone();
        const eventTz = event.timeZone || localTz;
        const startParsed = parseISO(event.startDate);
        const endParsed = parseISO(event.endDate);
        const startValid = !Number.isNaN(startParsed.getTime());
        const endValid = !Number.isNaN(endParsed.getTime());

        // Date display
        let dateDisplay = '';
        if (startValid) {
            const sameDay = endValid && startParsed.toISOString().slice(0, 10) === endParsed.toISOString().slice(0, 10);
            dateDisplay = sameDay || !endValid
                ? formatHumanDate(startParsed, localTz)
                : `${formatHumanDate(startParsed, localTz)} \u2013 ${formatHumanDate(endParsed, localTz)}`;
        }

        // Time display
        let timeDisplay = '';
        let timeDisplayAlt = '';
        if (!event.isAllDay && startValid && endValid) {
            timeDisplay = `${formatClock(startParsed, localTz)} \u2013 ${formatClock(endParsed, localTz)}`;
            if (eventTz !== localTz) {
                timeDisplayAlt = `${formatClock(startParsed, eventTz)} \u2013 ${formatClock(endParsed, eventTz)} (${getTimeZoneShortLabel(startParsed, eventTz)})`;
            }
        }

        // Members
        const members = (Array.isArray(event.pertainsTo) ? event.pertainsTo : []).filter((m) => m?.id);
        const memberNames = members.map((m) => m.name || 'Unknown member');

        // Tags
        const tags = (Array.isArray(event.tags) ? event.tags : []).filter((t) => t?.name);

        // Recurrence
        const recurrence = getRecurrenceDetail(event);
        const exdateCount = Array.isArray(event.exdates) ? event.exdates.length : 0;
        const rdateCount = Array.isArray(event.rdates) ? event.rdates.length : 0;

        // Alarms and travel
        const alarmDescriptions = describeAlarms(event.alarms);
        const travelDescriptions = describeTravelBuffers(event);

        // Status
        const status = String(event.status || 'confirmed').toLowerCase();
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);

        // Source info
        const sourceCalendar = String(event.sourceCalendarName || '').trim();
        const hasSourceInfo = Boolean(sourceCalendar || event.sourceExternalId || event.sourceRemoteUrl);

        // Advanced metadata
        const advancedMeta: { label: string; value: string }[] = [];
        if (event.uid) advancedMeta.push({ label: 'UID', value: event.uid });
        if (event.createdAt) advancedMeta.push({ label: 'Created', value: formatDateTimeCompact(event.createdAt) });
        if (event.updatedAt) advancedMeta.push({ label: 'Updated', value: formatDateTimeCompact(event.updatedAt) });
        if (event.lastModified) advancedMeta.push({ label: 'Last modified', value: formatDateTimeCompact(event.lastModified) });
        if (event.dtStamp) advancedMeta.push({ label: 'Timestamp', value: formatDateTimeCompact(event.dtStamp) });
        if (event.sequence != null) advancedMeta.push({ label: 'Sequence', value: String(event.sequence) });
        if (event.visibility) advancedMeta.push({ label: 'Visibility', value: event.visibility });
        if (event.transparency) advancedMeta.push({ label: 'Transparency', value: event.transparency });
        if (event.eventType) advancedMeta.push({ label: 'Event type', value: event.eventType });
        if (event.recurrenceId) advancedMeta.push({ label: 'Recurrence ID', value: event.recurrenceId });
        if (event.recurringEventId) advancedMeta.push({ label: 'Series parent', value: event.recurringEventId });
        if (event.sourceExternalId) advancedMeta.push({ label: 'External ID', value: event.sourceExternalId });

        return {
            dateDisplay,
            timeDisplay,
            timeDisplayAlt,
            members,
            memberNames,
            tags,
            recurrence,
            exdateCount,
            rdateCount,
            alarmDescriptions,
            travelDescriptions,
            statusLabel,
            status,
            sourceCalendar,
            hasSourceInfo,
            advancedMeta,
            eventTz,
            localTz,
        };
    }, [event]);

    if (!event || !detail) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[860px]">
                <DialogHeader className="pr-10">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-3">
                            <div>
                                <DialogTitle className="text-2xl font-semibold text-slate-950">
                                    {event.title || 'Untitled event'}
                                </DialogTitle>
                                <DialogDescription className="mt-2 text-sm text-slate-600">
                                    {detail.dateDisplay}
                                </DialogDescription>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {event.isAllDay ? (
                                    <Badge variant="outline">All day</Badge>
                                ) : detail.timeDisplay ? (
                                    <Badge variant="outline">{detail.timeDisplay}</Badge>
                                ) : null}
                                <Badge
                                    className={
                                        detail.status === 'tentative'
                                            ? 'bg-amber-100 text-amber-800'
                                            : detail.status === 'cancelled'
                                              ? 'bg-rose-100 text-rose-800'
                                              : 'bg-emerald-100 text-emerald-800'
                                    }
                                >
                                    {detail.statusLabel}
                                </Badge>
                                {detail.recurrence.summary !== 'Does not repeat' ? (
                                    <Badge variant="outline">{detail.recurrence.summary}</Badge>
                                ) : null}
                                {detail.sourceCalendar ? (
                                    <Badge className="bg-sky-100 text-sky-800">{detail.sourceCalendar}</Badge>
                                ) : null}
                                {detail.tags.map((tag) => (
                                    <Badge key={tag.name} className="bg-indigo-100 text-indigo-800">
                                        {tag.name}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                            <Button type="button" onClick={onEdit}>
                                Edit Event
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
                    {/* Summary strip */}
                    <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl border border-white bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Date</div>
                                <div className="mt-2 text-sm font-medium text-slate-900">
                                    {detail.dateDisplay || 'Unknown'}
                                </div>
                            </div>
                            <div className="rounded-xl border border-white bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time</div>
                                <div className="mt-2 text-sm font-medium text-slate-900">
                                    {event.isAllDay ? 'All day' : detail.timeDisplay || 'Not set'}
                                </div>
                                {detail.timeDisplayAlt ? (
                                    <div className="mt-1 text-xs text-slate-500">{detail.timeDisplayAlt}</div>
                                ) : null}
                            </div>
                            <div className="rounded-xl border border-white bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pertains to</div>
                                <div className="mt-2 text-sm font-medium text-slate-900">
                                    {detail.memberNames.length > 0 ? humanJoin(detail.memberNames) : 'Everyone'}
                                </div>
                            </div>
                            <div className="rounded-xl border border-white bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alerts</div>
                                <div className="mt-2 text-sm font-medium text-slate-900">
                                    {detail.alarmDescriptions.length > 0 ? detail.alarmDescriptions[0] : 'None'}
                                    {detail.alarmDescriptions.length > 1 ? ` (+${detail.alarmDescriptions.length - 1} more)` : ''}
                                </div>
                            </div>
                        </div>
                    </section>

                    <div className="grid gap-4 md:grid-cols-[1.25fr,0.95fr]">
                        <div className="space-y-4">
                            {/* Description */}
                            {event.description ? (
                                <Section title="Description">
                                    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{event.description}</p>
                                </Section>
                            ) : null}

                            {/* Location & meeting info */}
                            {event.location ? (
                                <Section title="Location">
                                    <p className="text-sm text-slate-700">{event.location}</p>
                                </Section>
                            ) : null}

                            {/* Travel buffers */}
                            {detail.travelDescriptions.length > 0 ? (
                                <Section title="Travel Time">
                                    {detail.travelDescriptions.map((line) => (
                                        <p key={line} className="text-sm text-slate-700">{line}</p>
                                    ))}
                                </Section>
                            ) : null}

                            {/* Alarms (full list if more than one) */}
                            {detail.alarmDescriptions.length > 1 ? (
                                <Section title="Alerts">
                                    <div className="space-y-2">
                                        {detail.alarmDescriptions.map((desc, i) => (
                                            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm text-slate-700">
                                                {desc}
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            ) : null}

                            {/* Source info */}
                            {detail.hasSourceInfo ? (
                                <Section title="Source">
                                    {detail.sourceCalendar ? (
                                        <MetaRow label="Calendar" value={detail.sourceCalendar} />
                                    ) : null}
                                    {event.sourceRemoteUrl ? (
                                        <MetaRow label="Remote URL" value={event.sourceRemoteUrl} />
                                    ) : null}
                                </Section>
                            ) : null}

                            {/* Advanced metadata (collapsible) */}
                            {detail.advancedMeta.length > 0 ? (
                                <details className="group">
                                    <summary className="cursor-pointer rounded-xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm">
                                        Advanced Metadata
                                        <span className="ml-2 text-xs text-slate-400 group-open:hidden">{detail.advancedMeta.length} fields</span>
                                    </summary>
                                    <div className="mt-1 rounded-b-xl border border-t-0 border-slate-200 bg-white/90 p-4 shadow-sm">
                                        {detail.advancedMeta.map((meta) => (
                                            <MetaRow key={meta.label} label={meta.label} value={<span className="break-all font-mono text-xs">{meta.value}</span>} />
                                        ))}
                                    </div>
                                </details>
                            ) : null}
                        </div>

                        <div className="space-y-4">
                            {/* Schedule */}
                            <Section title="Schedule">
                                <MetaRow label="Repeats" value={detail.recurrence.summary} />
                                <MetaRow label="Repeat end" value={detail.recurrence.repeatEnd} />
                                {detail.exdateCount > 0 ? (
                                    <MetaRow label="Exception dates" value={`${detail.exdateCount} skipped`} />
                                ) : null}
                                {detail.rdateCount > 0 ? (
                                    <MetaRow label="Extra dates" value={`${detail.rdateCount} added`} />
                                ) : null}
                                {detail.eventTz !== detail.localTz ? (
                                    <MetaRow label="Time zone" value={detail.eventTz} />
                                ) : null}
                            </Section>

                            {/* Members */}
                            {detail.members.length > 0 ? (
                                <Section title="Pertains To">
                                    <div className="space-y-2">
                                        {detail.members.map((member) => (
                                            <div key={member.id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm font-medium text-slate-900">
                                                {member.name || 'Unknown member'}
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            ) : null}

                            {/* Tags */}
                            {detail.tags.length > 0 ? (
                                <Section title="Tags">
                                    <div className="flex flex-wrap gap-2">
                                        {detail.tags.map((tag) => (
                                            <Badge key={tag.name} className="bg-indigo-100 text-indigo-800">
                                                {tag.name}
                                            </Badge>
                                        ))}
                                    </div>
                                </Section>
                            ) : null}

                            {/* Status details */}
                            <Section title="Event Details">
                                <MetaRow label="Status" value={detail.statusLabel} />
                                {event.location ? <MetaRow label="Location" value={event.location} /> : null}
                                {detail.alarmDescriptions.length > 0 ? (
                                    <MetaRow label="Alerts" value={detail.alarmDescriptions.join(', ')} />
                                ) : (
                                    <MetaRow label="Alerts" value="None" />
                                )}
                                {detail.travelDescriptions.length > 0 ? (
                                    <MetaRow label="Travel" value={detail.travelDescriptions.join(', ')} />
                                ) : null}
                            </Section>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
