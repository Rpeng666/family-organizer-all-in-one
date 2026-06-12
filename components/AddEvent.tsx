'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tx, id } from '@instantdb/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format, addHours, addDays, parse, parseISO } from 'date-fns';
import { RecurrenceScopeDialog, type RecurrenceEditScope, type RecurrenceSeriesScopeMode } from '@/components/RecurrenceScopeDialog';
import { useOptionalAuth } from '@/components/AuthProvider';
import { db } from '@/lib/db';
import { buildCalendarHistoryMetadata, buildCalendarHistorySnapshot } from '@/lib/calendar-history';
import { buildHistoryEventTransactions } from '@/lib/history-events';
import {
    dedupeCalendarTagRecords,
    normalizeCalendarTagKey,
    normalizeCalendarTagName,
    sortCalendarTagRecords,
    splitCalendarTagDraft,
} from '@/lib/calendar-tags';
import { EventRecurrenceEditor } from '@/components/calendar/EventRecurrenceEditor';
import { EventAlarmFields } from '@/components/calendar/EventAlarmFields';
import { EventTagsEditor } from '@/components/calendar/EventTagsEditor';

interface FamilyMember {
    id: string;
    name?: string | null;
}

interface CalendarTag {
    id?: string;
    name: string;
    normalizedName?: string;
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
    [key: string]: any;
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

export interface CalendarDraftSelection {
    start: Date;
    end: Date;
    isAllDay: boolean;
}

interface AddEventFormProps {
    selectedDate: Date | null;
    selectedEvent: CalendarItem | null;
    initialDraft?: CalendarDraftSelection | null;
    allCalendarItems?: CalendarItem[];
    onClose: () => void;
    defaultStartTime?: string;
    onOptimisticUpsert?: (item: CalendarItem) => (() => void) | void;
}

// RENAMED: Changed from FormData to EventFormData to avoid conflict with built-in Browser FormData
interface EventFormData {
    id: string;
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    isAllDay: boolean;
    status: string;
    location: string;
    timeZone: string;
    rrule: string;
    rdatesCsv: string;
    exdatesCsv: string;
    recurrenceId: string;
    recurringEventId: string;
    recurrenceIdRange: string;
    travelDurationBeforeMinutes: string;
    travelDurationAfterMinutes: string;
    alarmEnabled: boolean;
    alarmAction: string;
    alarmTriggerMode: string;
    alarmTriggerMinutesBefore: string;
    alarmTriggerAt: string;
    alarmRepeatCount: string;
    alarmRepeatDurationMinutes: string;
    alarmRepeatUntilAcknowledged: boolean;
}

function buildCreateDraftSourceKey(selectedDate: Date | null, initialDraft: CalendarDraftSelection | null) {
    if (initialDraft?.start && initialDraft?.end) {
        return `draft:${initialDraft.start.toISOString()}:${initialDraft.end.toISOString()}:${initialDraft.isAllDay ? 'all-day' : 'timed'}`;
    }
    if (selectedDate) {
        return `date:${selectedDate.toISOString()}`;
    }
    return 'create:none';
}

function buildCreateEventFormData(
    selectedDate: Date | null,
    initialDraft: CalendarDraftSelection | null,
    defaultStartTime: string
): EventFormData {
    const draftStart = initialDraft?.start ?? selectedDate ?? new Date();
    const isDraftAllDay = initialDraft ? Boolean(initialDraft.isAllDay) : true;
    const draftEnd = initialDraft?.end ?? (isDraftAllDay ? addDays(startOfDayDate(draftStart), 1) : addHours(draftStart, 1));
    const formattedDate = format(draftStart, 'yyyy-MM-dd');
    const startDateTime = isDraftAllDay ? parse(defaultStartTime, 'HH:mm', draftStart) : draftStart;
    const endDateTime = isDraftAllDay ? addHours(parse(defaultStartTime, 'HH:mm', draftStart), 1) : draftEnd;
    const formattedEndDate = isDraftAllDay ? format(addDays(draftEnd, -1), 'yyyy-MM-dd') : format(draftEnd, 'yyyy-MM-dd');

    return {
        id: '',
        title: '',
        description: '',
        startDate: formattedDate,
        endDate: formattedEndDate,
        startTime: format(startDateTime, 'HH:mm'),
        endTime: format(endDateTime, 'HH:mm'),
        isAllDay: isDraftAllDay,
        status: DEFAULT_EVENT_STATUS,
        location: '',
        timeZone: getLocalTimeZone(),
        rrule: '',
        rdatesCsv: '',
        exdatesCsv: '',
        recurrenceId: '',
        recurringEventId: '',
        recurrenceIdRange: '',
        travelDurationBeforeMinutes: '',
        travelDurationAfterMinutes: '',
        alarmEnabled: false,
        alarmAction: DEFAULT_ALARM_ACTION,
        alarmTriggerMode: DEFAULT_ALARM_TRIGGER_MODE,
        alarmTriggerMinutesBefore: '15',
        alarmTriggerAt: '',
        alarmRepeatCount: '',
        alarmRepeatDurationMinutes: '',
        alarmRepeatUntilAcknowledged: false,
    };
}

const DEFAULT_EVENT_STATUS = 'confirmed';
const DEFAULT_ALARM_ACTION = 'display';
const DEFAULT_ALARM_TRIGGER_MODE = 'relative';

const MEMBER_GRID_MAX_HEIGHT_PX = 176; // Tailwind max-h-44
const MEMBER_GRID_GAP_PX = 8; // Tailwind gap-2
const MEMBER_GRID_ROW_HEIGHT_PX = 40;
const MEMBER_GRID_CHROME_WIDTH_PX = 56; // checkbox + internal padding + spacing
const MEMBER_GRID_TEXT_FONT = "500 14px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial";

type RepeatMode = 'never' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom' | 'rrule';
type CustomUnit = 'day' | 'week' | 'month' | 'year';
type MonthPatternMode = 'days' | 'week';
type RepeatEndMode = 'forever' | 'until' | 'count';
type WeekdayToken = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'DAY' | 'WEEKDAY' | 'WEEKEND';
type RecurrenceExceptionMode = 'date' | 'range';
interface RecurrenceExceptionRow {
    rowId: string;
    mode: RecurrenceExceptionMode;
    date: string;
    rangeStart: string;
    rangeEnd: string;
}

interface StoredRecurrenceExceptionRow {
    mode: RecurrenceExceptionMode;
    date: string;
    rangeStart: string;
    rangeEnd: string;
}

interface RecurrenceUiState {
    mode: RepeatMode;
    customInterval: number;
    customUnit: CustomUnit;
    customWeekDays: string[];
    customMonthMode: MonthPatternMode;
    customMonthDays: number[];
    customMonthOrdinal: number;
    customMonthWeekday: WeekdayToken;
    customYearMonths: number[];
    customYearUseWeekday: boolean;
    customYearOrdinal: number;
    customYearWeekday: WeekdayToken;
    repeatEndMode: RepeatEndMode;
    repeatEndUntil: string;
    repeatEndCount: number;
    advancedRrule: string;
    customExpanded: boolean;
    unsupportedRrule: boolean;
}

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const WEEKDAY_CHIPS = [
    { code: 'SU', label: 'Sunday' },
    { code: 'MO', label: 'Monday' },
    { code: 'TU', label: 'Tuesday' },
    { code: 'WE', label: 'Wednesday' },
    { code: 'TH', label: 'Thursday' },
    { code: 'FR', label: 'Friday' },
    { code: 'SA', label: 'Saturday' },
] as const;
const WEEKDAY_GROUP_LABELS: Record<WeekdayToken, string> = {
    SU: 'Sunday',
    MO: 'Monday',
    TU: 'Tuesday',
    WE: 'Wednesday',
    TH: 'Thursday',
    FR: 'Friday',
    SA: 'Saturday',
    DAY: 'Day',
    WEEKDAY: 'Weekday',
    WEEKEND: 'Weekend Day',
};
const MONTH_OPTIONS = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
] as const;
const MONTH_DAY_CHOICES = [...Array.from({ length: 31 }, (_value, index) => index + 1), -1];
const SUPPORTED_RRULE_KEYS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'COUNT', 'UNTIL', 'BYSETPOS']);

function clampRecurrenceNumber(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

function humanJoin(items: string[]): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function weekdayCodeFromDate(startDateValue: string) {
    const parsed = parseISO(`${startDateValue || format(new Date(), 'yyyy-MM-dd')}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return 'SU';
    return WEEKDAY_CODES[parsed.getDay()] || 'SU';
}

function dayOfMonthFromDate(startDateValue: string) {
    const parsed = parseISO(`${startDateValue || format(new Date(), 'yyyy-MM-dd')}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return 1;
    return parsed.getDate();
}

function monthOfDate(startDateValue: string) {
    const parsed = parseISO(`${startDateValue || format(new Date(), 'yyyy-MM-dd')}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return 1;
    return parsed.getMonth() + 1;
}

function ordinalSuffix(value: number): string {
    const absolute = Math.abs(value);
    const mod100 = absolute % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
    const mod10 = absolute % 10;
    if (mod10 === 1) return `${value}st`;
    if (mod10 === 2) return `${value}nd`;
    if (mod10 === 3) return `${value}rd`;
    return `${value}th`;
}

function ordinalLabel(value: number): string {
    if (value === -1) return 'last';
    return ordinalSuffix(value);
}

function singularOrPlural(unit: CustomUnit, count: number): string {
    const singular = unit;
    const plural = `${unit}s`;
    return count === 1 ? singular : plural;
}

function weekdayTokenLabel(token: WeekdayToken): string {
    return WEEKDAY_GROUP_LABELS[token] || token;
}

function sortWeekdayCodes(codes: string[]): string[] {
    const order = new Map<string, number>(WEEKDAY_CODES.map((code, index) => [code, index]));
    return Array.from(new Set(codes.filter((code) => WEEKDAY_CODES.includes(code as any)))).sort((left, right) => {
        return (order.get(left) ?? 999) - (order.get(right) ?? 999);
    });
}

function sortMonthDays(dayValues: number[]): number[] {
    const unique = Array.from(
        new Set(dayValues.map((entry) => Math.trunc(entry)).filter((entry) => entry === -1 || (entry >= 1 && entry <= 31)))
    );
    return unique.sort((left, right) => {
        if (left === -1) return 1;
        if (right === -1) return -1;
        return left - right;
    });
}

function sortMonthNumbers(monthValues: number[]): number[] {
    return Array.from(
        new Set(
            monthValues
                .map((entry) => Math.trunc(entry))
                .filter((entry) => Number.isFinite(entry) && entry >= 1 && entry <= 12)
        )
    ).sort((left, right) => left - right);
}

function shouldUseWeekdaysLabel(weekdays: string[]): boolean {
    return sameSet(weekdays, ['MO', 'TU', 'WE', 'TH', 'FR']);
}

function shouldUseWeekendsLabel(weekdays: string[]): boolean {
    return sameSet(weekdays, ['SU', 'SA']);
}

function weekdayTokenToByday(token: WeekdayToken): string[] {
    if (token === 'DAY') return [...WEEKDAY_CODES];
    if (token === 'WEEKDAY') return ['MO', 'TU', 'WE', 'TH', 'FR'];
    if (token === 'WEEKEND') return ['SU', 'SA'];
    return [token];
}

function splitRruleParts(rrule: string): Record<string, string> | null {
    const normalized = normalizeRrule(rrule);
    const raw = normalized.replace(/^RRULE:/i, '');
    if (!raw.trim()) return {};
    const result: Record<string, string> = {};
    const parts = raw.split(';').filter(Boolean);
    for (const part of parts) {
        const [rawKey, ...rawValueParts] = part.split('=');
        const key = String(rawKey || '').trim().toUpperCase();
        const value = rawValueParts.join('=').trim();
        if (!key || !value) return null;
        result[key] = value;
    }
    return result;
}

function parseIntList(value: string | undefined): number[] {
    if (!value) return [];
    return value
        .split(',')
        .map((item) => Number(item.trim()))
        .filter((numberValue) => Number.isFinite(numberValue))
        .map((numberValue) => Math.trunc(numberValue));
}

function parseBydayToken(token: string): { ordinal: number | null; day: string } | null {
    const match = token.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i);
    if (!match) return null;
    const rawOrdinal = match[1];
    const day = match[2].toUpperCase();
    if (!rawOrdinal) return { ordinal: null, day };
    const parsedOrdinal = Number(rawOrdinal);
    if (!Number.isFinite(parsedOrdinal)) return null;
    return { ordinal: Math.trunc(parsedOrdinal), day };
}

function sameSet(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return leftSorted.every((entry, index) => entry === rightSorted[index]);
}

function parseUntilToInputValue(value: string | undefined): string {
    if (!value) return '';
    const cleaned = value.replace(/[^0-9]/g, '');
    if (cleaned.length < 8) return '';
    const year = cleaned.slice(0, 4);
    const month = cleaned.slice(4, 6);
    const day = cleaned.slice(6, 8);
    if (!year || !month || !day) return '';
    return `${year}-${month}-${day}`;
}

function buildUntilToken(untilDate: string): string {
    const datePart = String(untilDate || '').replace(/-/g, '');
    if (!/^\d{8}$/.test(datePart)) return '';
    return `${datePart}T235959Z`;
}

function getDefaultRecurrenceUiState(startDateValue: string): RecurrenceUiState {
    return {
        mode: 'never',
        customInterval: 1,
        customUnit: 'day',
        customWeekDays: [weekdayCodeFromDate(startDateValue)],
        customMonthMode: 'days',
        customMonthDays: [dayOfMonthFromDate(startDateValue)],
        customMonthOrdinal: 1,
        customMonthWeekday: weekdayCodeFromDate(startDateValue) as WeekdayToken,
        customYearMonths: [monthOfDate(startDateValue)],
        customYearUseWeekday: false,
        customYearOrdinal: 1,
        customYearWeekday: weekdayCodeFromDate(startDateValue) as WeekdayToken,
        repeatEndMode: 'forever',
        repeatEndUntil: '',
        repeatEndCount: 1,
        advancedRrule: '',
        customExpanded: true,
        unsupportedRrule: false,
    };
}

function decodeWeekPattern(bydayValues: string[], bysetposValue?: number): { ordinal: number; token: WeekdayToken } | null {
    const parsed = bydayValues.map((entry) => parseBydayToken(entry)).filter(Boolean) as Array<{ ordinal: number | null; day: string }>;
    if (parsed.length === 0) return null;

    if (bysetposValue != null) {
        const ordinal = Math.trunc(bysetposValue);
        if (![1, 2, 3, 4, 5, -1].includes(ordinal)) return null;
        const plainDays = parsed.filter((entry) => entry.ordinal == null).map((entry) => entry.day);
        if (plainDays.length !== parsed.length) return null;
        if (sameSet(plainDays, ['MO', 'TU', 'WE', 'TH', 'FR'])) {
            return { ordinal, token: 'WEEKDAY' };
        }
        if (sameSet(plainDays, ['SU', 'SA'])) {
            return { ordinal, token: 'WEEKEND' };
        }
        if (sameSet(plainDays, [...WEEKDAY_CODES])) {
            return { ordinal, token: 'DAY' };
        }
        if (plainDays.length === 1 && WEEKDAY_CODES.includes(plainDays[0] as any)) {
            return { ordinal, token: plainDays[0] as WeekdayToken };
        }
        return null;
    }

    if (parsed.length === 1 && parsed[0].ordinal != null && [1, 2, 3, 4, 5, -1].includes(parsed[0].ordinal)) {
        return { ordinal: parsed[0].ordinal, token: parsed[0].day as WeekdayToken };
    }

    return null;
}

function parseRecurrenceUiStateFromRrule(rrule: string | undefined, startDateValue: string): RecurrenceUiState {
    const base = getDefaultRecurrenceUiState(startDateValue);
    if (!rrule || !rrule.trim()) return base;

    const normalized = normalizeRrule(rrule);
    const parts = splitRruleParts(normalized);
    if (!parts) {
        return { ...base, mode: 'rrule', advancedRrule: normalized, unsupportedRrule: true };
    }

    const keys = Object.keys(parts);
    if (keys.some((key) => !SUPPORTED_RRULE_KEYS.has(key))) {
        const maybeEnd = { ...base };
        if (parts.COUNT) {
            maybeEnd.repeatEndMode = 'count';
            maybeEnd.repeatEndCount = clampRecurrenceNumber(Number(parts.COUNT), 1, 1000);
        } else if (parts.UNTIL) {
            maybeEnd.repeatEndMode = 'until';
            maybeEnd.repeatEndUntil = parseUntilToInputValue(parts.UNTIL);
        }
        return { ...maybeEnd, mode: 'rrule', advancedRrule: normalized, unsupportedRrule: true };
    }

    const next = { ...base, advancedRrule: normalized };
    if (parts.COUNT) {
        next.repeatEndMode = 'count';
        next.repeatEndCount = clampRecurrenceNumber(Number(parts.COUNT), 1, 1000);
    } else if (parts.UNTIL) {
        next.repeatEndMode = 'until';
        next.repeatEndUntil = parseUntilToInputValue(parts.UNTIL);
    }

    const freq = String(parts.FREQ || '').toUpperCase();
    if (!freq) {
        return { ...next, mode: 'rrule', unsupportedRrule: true };
    }

    const interval = clampRecurrenceNumber(Number(parts.INTERVAL || 1), 1, 1000);
    const bydayValues = String(parts.BYDAY || '')
        .split(',')
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean);
    const bymonthdayValues = parseIntList(parts.BYMONTHDAY);
    const bymonthValues = parseIntList(parts.BYMONTH).filter((entry) => entry >= 1 && entry <= 12);
    const bysetposValue = parts.BYSETPOS ? Number(parts.BYSETPOS) : undefined;

    if (
        freq === 'DAILY' &&
        interval === 1 &&
        bydayValues.length === 0 &&
        bymonthdayValues.length === 0 &&
        bymonthValues.length === 0 &&
        bysetposValue == null
    ) {
        return { ...next, mode: 'daily' };
    }

    if (
        freq === 'WEEKLY' &&
        bymonthdayValues.length === 0 &&
        bymonthValues.length === 0 &&
        bysetposValue == null &&
        bydayValues.every((entry) => WEEKDAY_CODES.includes(entry as any))
    ) {
        if (interval === 1) {
            return { ...next, mode: 'weekly', customWeekDays: sortWeekdayCodes(bydayValues.length > 0 ? bydayValues : next.customWeekDays) };
        }
        if (interval === 2) {
            return { ...next, mode: 'biweekly', customWeekDays: sortWeekdayCodes(bydayValues.length > 0 ? bydayValues : next.customWeekDays) };
        }
    }

    if (
        freq === 'MONTHLY' &&
        interval === 1 &&
        bydayValues.length === 0 &&
        bymonthdayValues.length === 0 &&
        bymonthValues.length === 0 &&
        bysetposValue == null
    ) {
        return { ...next, mode: 'monthly' };
    }

    if (
        freq === 'YEARLY' &&
        interval === 1 &&
        bydayValues.length === 0 &&
        bymonthdayValues.length === 0 &&
        bymonthValues.length === 0 &&
        bysetposValue == null
    ) {
        return { ...next, mode: 'yearly' };
    }

    const asCustom = { ...next, mode: 'custom' as const, customInterval: interval, customExpanded: true };
    if (freq === 'DAILY') {
        return { ...asCustom, customUnit: 'day' };
    }

    if (freq === 'WEEKLY') {
        if (bymonthdayValues.length > 0 || bymonthValues.length > 0 || bysetposValue != null) {
            return { ...next, mode: 'rrule', unsupportedRrule: true };
        }
        if (bydayValues.some((entry) => !WEEKDAY_CODES.includes(entry as any))) {
            return { ...next, mode: 'rrule', unsupportedRrule: true };
        }
        return { ...asCustom, customUnit: 'week', customWeekDays: sortWeekdayCodes(bydayValues.length > 0 ? bydayValues : asCustom.customWeekDays) };
    }

    if (freq === 'MONTHLY') {
        if (bymonthValues.length > 0) return { ...next, mode: 'rrule', unsupportedRrule: true };

        if (bymonthdayValues.length > 0) {
            const validDays = bymonthdayValues.filter((value) => value === -1 || (value >= 1 && value <= 31));
            if (validDays.length === 0) return { ...next, mode: 'rrule', unsupportedRrule: true };
            return {
                ...asCustom,
                customUnit: 'month',
                customMonthMode: 'days',
                customMonthDays: sortMonthDays(validDays),
            };
        }

        if (bydayValues.length > 0) {
            const pattern = decodeWeekPattern(bydayValues, Number.isFinite(bysetposValue as number) ? (bysetposValue as number) : undefined);
            if (!pattern) return { ...next, mode: 'rrule', unsupportedRrule: true };
            return {
                ...asCustom,
                customUnit: 'month',
                customMonthMode: 'week',
                customMonthOrdinal: pattern.ordinal,
                customMonthWeekday: pattern.token,
            };
        }

        return { ...asCustom, customUnit: 'month' };
    }

    if (freq === 'YEARLY') {
        const monthlySelection = sortMonthNumbers(bymonthValues);
        const yearState = {
            ...asCustom,
            customUnit: 'year' as const,
            customYearMonths: monthlySelection.length > 0 ? monthlySelection : [monthOfDate(startDateValue)],
        };

        if (bydayValues.length === 0 && bymonthdayValues.length === 0 && bysetposValue == null) {
            return yearState;
        }

        if (bymonthdayValues.length === 1 && bydayValues.length === 0 && bysetposValue == null) {
            const monthDay = bymonthdayValues[0];
            if (monthDay === -1 || (monthDay >= 1 && monthDay <= 5)) {
                return {
                    ...yearState,
                    customYearUseWeekday: true,
                    customYearWeekday: 'DAY',
                    customYearOrdinal: monthDay,
                };
            }
        }

        const pattern = decodeWeekPattern(bydayValues, Number.isFinite(bysetposValue as number) ? (bysetposValue as number) : undefined);
        if (!pattern) {
            return { ...next, mode: 'rrule', unsupportedRrule: true };
        }

        return {
            ...yearState,
            customYearUseWeekday: true,
            customYearWeekday: pattern.token,
            customYearOrdinal: pattern.ordinal,
        };
    }

    return { ...next, mode: 'rrule', unsupportedRrule: true };
}

function serializeRecurrenceToRrule(state: RecurrenceUiState, startDateValue: string): string {
    const startWeekday = weekdayCodeFromDate(startDateValue);
    const startMonthDay = dayOfMonthFromDate(startDateValue);

    if (state.mode === 'never') return '';

    const applyRepeatEnd = (baseRrule: string): string => {
        const normalized = normalizeRrule(baseRrule);
        if (!normalized) return '';
        const parts = normalized.replace(/^RRULE:/i, '').split(';').filter(Boolean);
        const noEndParts = parts.filter((entry) => !entry.toUpperCase().startsWith('COUNT=') && !entry.toUpperCase().startsWith('UNTIL='));
        if (state.repeatEndMode === 'count') {
            noEndParts.push(`COUNT=${clampRecurrenceNumber(state.repeatEndCount, 1, 1000)}`);
        } else if (state.repeatEndMode === 'until') {
            const untilToken = buildUntilToken(state.repeatEndUntil);
            if (untilToken) {
                noEndParts.push(`UNTIL=${untilToken}`);
            }
        }
        return noEndParts.length > 0 ? `RRULE:${noEndParts.join(';')}` : '';
    };

    if (state.mode === 'rrule') {
        return applyRepeatEnd(state.advancedRrule);
    }

    let freq = '';
    let interval = 1;
    let byday: string[] = [];
    let bymonthday: number[] = [];
    let bymonth: number[] = [];
    let bysetpos: number | undefined;

    if (state.mode === 'daily') {
        freq = 'DAILY';
    } else if (state.mode === 'weekly') {
        freq = 'WEEKLY';
        byday = sortWeekdayCodes(state.customWeekDays.length > 0 ? state.customWeekDays : [startWeekday]);
    } else if (state.mode === 'biweekly') {
        freq = 'WEEKLY';
        interval = 2;
        byday = sortWeekdayCodes(state.customWeekDays.length > 0 ? state.customWeekDays : [startWeekday]);
    } else if (state.mode === 'monthly') {
        freq = 'MONTHLY';
    } else if (state.mode === 'yearly') {
        freq = 'YEARLY';
    } else if (state.mode === 'custom') {
        interval = clampRecurrenceNumber(state.customInterval, 1, 1000);
        if (state.customUnit === 'day') {
            freq = 'DAILY';
        } else if (state.customUnit === 'week') {
            freq = 'WEEKLY';
            byday = sortWeekdayCodes(state.customWeekDays.length > 0 ? state.customWeekDays : [startWeekday]);
        } else if (state.customUnit === 'month') {
            freq = 'MONTHLY';
            if (state.customMonthMode === 'days') {
                const days = state.customMonthDays.length > 0 ? state.customMonthDays : [startMonthDay];
                bymonthday = sortMonthDays(days);
            } else {
                const ordinal = [1, 2, 3, 4, 5, -1].includes(state.customMonthOrdinal) ? state.customMonthOrdinal : 1;
                if (state.customMonthWeekday === 'DAY') {
                    bymonthday = [ordinal === -1 ? -1 : ordinal];
                } else if (state.customMonthWeekday === 'WEEKDAY' || state.customMonthWeekday === 'WEEKEND') {
                    byday = weekdayTokenToByday(state.customMonthWeekday);
                    bysetpos = ordinal;
                } else {
                    byday = [`${ordinal === -1 ? '-1' : String(ordinal)}${state.customMonthWeekday}`];
                }
            }
        } else {
            freq = 'YEARLY';
            const yearMonths = sortMonthNumbers(state.customYearMonths);
            if (!(yearMonths.length === 1 && yearMonths[0] === monthOfDate(startDateValue))) {
                bymonth = yearMonths;
            }
            if (state.customYearUseWeekday) {
                const ordinal = [1, 2, 3, 4, 5, -1].includes(state.customYearOrdinal) ? state.customYearOrdinal : 1;
                if (state.customYearWeekday === 'DAY') {
                    bymonthday = [ordinal === -1 ? -1 : ordinal];
                } else if (state.customYearWeekday === 'WEEKDAY' || state.customYearWeekday === 'WEEKEND') {
                    byday = weekdayTokenToByday(state.customYearWeekday);
                    bysetpos = ordinal;
                } else {
                    byday = [`${ordinal === -1 ? '-1' : String(ordinal)}${state.customYearWeekday}`];
                }
            }
        }
    }

    if (!freq) return '';

    const parts: string[] = [`FREQ=${freq}`];
    if (interval > 1) {
        parts.push(`INTERVAL=${interval}`);
    }
    if (bymonth.length > 0) {
        parts.push(`BYMONTH=${bymonth.join(',')}`);
    }
    if (bymonthday.length > 0) {
        parts.push(`BYMONTHDAY=${bymonthday.join(',')}`);
    }
    if (byday.length > 0) {
        parts.push(`BYDAY=${byday.join(',')}`);
    }
    if (bysetpos != null) {
        parts.push(`BYSETPOS=${bysetpos}`);
    }

    return applyRepeatEnd(`RRULE:${parts.join(';')}`);
}

function recurrenceSummary(state: RecurrenceUiState, startDateValue: string): string {
    if (state.mode === 'never') return 'Never';
    if (state.mode === 'daily') return 'Every day';
    if (state.mode === 'monthly') return 'Every month';
    if (state.mode === 'yearly') return 'Every year';
    if (state.mode === 'rrule') return state.unsupportedRrule ? 'Custom RRULE string (advanced)' : 'Custom RRULE string';

    if (state.mode === 'weekly' || state.mode === 'biweekly') {
        const base = state.mode === 'weekly' ? 'Every week' : 'Every 2 weeks';
        const selectedDays = sortWeekdayCodes(state.customWeekDays.length > 0 ? state.customWeekDays : [weekdayCodeFromDate(startDateValue)]);
        if (shouldUseWeekdaysLabel(selectedDays)) {
            return `${base} on weekdays`;
        }
        if (shouldUseWeekendsLabel(selectedDays)) {
            return `${base} on weekends`;
        }
        const labels = selectedDays.map((entry) => weekdayTokenLabel(entry as WeekdayToken));
        return `${base} on ${humanJoin(labels)}`;
    }

    const interval = clampRecurrenceNumber(state.customInterval, 1, 1000);
    const base = interval === 1 ? `Every ${singularOrPlural(state.customUnit, 1)}` : `Every ${interval} ${singularOrPlural(state.customUnit, interval)}`;

    if (state.customUnit === 'day') return base;

    if (state.customUnit === 'week') {
        const selectedDays = sortWeekdayCodes(state.customWeekDays.length > 0 ? state.customWeekDays : [weekdayCodeFromDate(startDateValue)]);
        if (shouldUseWeekdaysLabel(selectedDays)) {
            return `${base} on weekdays`;
        }
        if (shouldUseWeekendsLabel(selectedDays)) {
            return `${base} on weekends`;
        }
        const labels = selectedDays.map((entry) => weekdayTokenLabel(entry as WeekdayToken));
        return `${base} on ${humanJoin(labels)}`;
    }

    if (state.customUnit === 'month') {
        if (state.customMonthMode === 'days') {
            const selectedDays = sortMonthDays(state.customMonthDays.length > 0 ? state.customMonthDays : [dayOfMonthFromDate(startDateValue)]);
            const dayLabels = selectedDays.map((entry) => (entry === -1 ? 'last day' : ordinalSuffix(entry)));
            return `${base} on the ${humanJoin(dayLabels)}`;
        }

        const ordinal = ordinalLabel(state.customMonthOrdinal);
        const weekday = state.customMonthWeekday;
        if (weekday === 'DAY') return `${base} on the ${ordinal} day of the month`;
        if (weekday === 'WEEKDAY') return `${base} on the ${ordinal} weekday of the month`;
        if (weekday === 'WEEKEND') return `${base} on the ${ordinal} weekend day of the month`;
        return `${base} on the ${ordinal} ${weekdayTokenLabel(weekday)} of the month`;
    }

    const startMonth = monthOfDate(startDateValue);
    const sortedMonths = sortMonthNumbers(state.customYearMonths);
    const includeMonthPhrase = !(sortedMonths.length === 1 && sortedMonths[0] === startMonth);
    const months = sortedMonths
        .map((monthNumber) => MONTH_OPTIONS.find((month) => month.value === monthNumber)?.label)
        .filter(Boolean) as string[];

    if (!state.customYearUseWeekday) {
        if (!includeMonthPhrase || months.length === 0) return base;
        return `${base} in ${humanJoin(months)}`;
    }

    const ordinal = ordinalLabel(state.customYearOrdinal);
    const weekday = state.customYearWeekday;
    if (!includeMonthPhrase || months.length === 0) {
        if (weekday === 'DAY') return `${base} on the ${ordinal} day`;
        if (weekday === 'WEEKDAY') return `${base} on the ${ordinal} weekday`;
        if (weekday === 'WEEKEND') return `${base} on the ${ordinal} weekend day`;
        return `${base} on the ${ordinal} ${weekdayTokenLabel(weekday)}`;
    }

    if (weekday === 'DAY') return `${base} on the ${ordinal} day of ${humanJoin(months)}`;
    if (weekday === 'WEEKDAY') return `${base} on the ${ordinal} weekday of ${humanJoin(months)}`;
    if (weekday === 'WEEKEND') return `${base} on the ${ordinal} weekend day of ${humanJoin(months)}`;
    return `${base} on the ${ordinal} ${weekdayTokenLabel(weekday)} of ${humanJoin(months)}`;
}

function getLocalTimeZone(): string {
    try {
        const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return resolved || 'UTC';
    } catch {
        return 'UTC';
    }
}

function isValidTimeZone(value: string) {
    try {
        Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
        return true;
    } catch {
        return false;
    }
}

function resolveTimeZone(value: string | null | undefined) {
    const trimmed = String(value || '').trim();
    if (trimmed && isValidTimeZone(trimmed)) {
        return trimmed;
    }
    return getLocalTimeZone();
}

function getDateTimePartsInTimeZone(value: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    const parts = formatter.formatToParts(value);
    const getPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);

    return {
        year: getPart('year'),
        month: getPart('month'),
        day: getPart('day'),
        hour: getPart('hour'),
        minute: getPart('minute'),
        second: getPart('second'),
    };
}

function formatDateInputInTimeZone(value: Date, timeZone: string) {
    const parts = getDateTimePartsInTimeZone(value, timeZone);
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatTimeInputInTimeZone(value: Date, timeZone: string) {
    const parts = getDateTimePartsInTimeZone(value, timeZone);
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function formatHumanDateInTimeZone(value: Date, timeZone: string) {
    return new Intl.DateTimeFormat(undefined, {
        timeZone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(value);
}

function formatClockInTimeZone(value: Date, timeZone: string) {
    return new Intl.DateTimeFormat(undefined, {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
    })
        .format(value)
        .replace(/\s?(AM|PM)$/i, (match) => match.toLowerCase());
}

function getTimeZoneShortLabel(value: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'short',
    }).formatToParts(value);
    return parts.find((part) => part.type === 'timeZoneName')?.value || timeZone;
}

function formatTimeRangeInTimeZone(start: Date, end: Date, timeZone: string, includeZoneLabel = false) {
    const timeRange = `from ${formatClockInTimeZone(start, timeZone)} to ${formatClockInTimeZone(end, timeZone)}`;
    if (!includeZoneLabel) {
        return timeRange;
    }
    return `${timeRange} (${getTimeZoneShortLabel(start, timeZone)})`;
}

function parseZonedDateTime(dateValue: string, timeValue: string, timeZone: string): Date | null {
    if (!dateValue || !timeValue) return null;
    const [year, month, day] = dateValue.split('-').map(Number);
    const [hour, minute] = timeValue.split(':').map(Number);
    if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day) ||
        !Number.isFinite(hour) ||
        !Number.isFinite(minute)
    ) {
        return null;
    }

    let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
    for (let index = 0; index < 4; index += 1) {
        const parts = getDateTimePartsInTimeZone(guess, timeZone);
        const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
        const actualUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
        const diffMs = desiredUtc - actualUtc;
        if (diffMs === 0) {
            return guess;
        }
        guess = new Date(guess.getTime() + diffMs);
    }

    return guess;
}

function summarizeRecurrenceForEvent(summary: string, mode: RepeatMode) {
    if (mode === 'never') return 'Does not repeat';
    if (mode === 'daily') return 'Repeats daily';
    if (mode === 'weekly') return 'Repeats weekly';
    if (mode === 'biweekly') return 'Repeats every 2 weeks';
    if (mode === 'monthly') return 'Repeats monthly';
    if (mode === 'yearly') return 'Repeats yearly';
    return `Repeats: ${summary}`;
}

function summarizeAlert(formData: EventFormData) {
    if (!formData.alarmEnabled) return 'No alerts';
    if (formData.alarmTriggerMode === 'relative') {
        const minutes = Number(formData.alarmTriggerMinutesBefore || 0);
        if (Number.isFinite(minutes) && minutes > 0) {
            return `Alert ${minutes} minute${minutes === 1 ? '' : 's'} before start`;
        }
        return 'Alert at start time';
    }
    return formData.alarmTriggerAt ? 'Alert at a specific date and time' : 'Alert enabled';
}

function startOfDayDate(value: Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function normalizeRrule(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.toUpperCase().startsWith('RRULE:') ? trimmed : `RRULE:${trimmed}`;
}

function getRecurringSeriesLinkKeys(masterEvent: CalendarItem | null | undefined): string[] {
    const keys: string[] = [];
    const pushKey = (value: unknown) => {
        const next = String(value || '').trim();
        if (!next || keys.includes(next)) return;
        keys.push(next);
    };

    pushKey(masterEvent?.id);
    pushKey((masterEvent as any)?.sourceExternalId);

    return keys;
}

function isRecurringChildOfMaster(item: CalendarItem | null | undefined, masterEvent: CalendarItem | null | undefined) {
    const parentId = String(item?.recurringEventId || '').trim();
    if (!parentId) return false;
    return getRecurringSeriesLinkKeys(masterEvent).includes(parentId);
}

function parseCsvList(value: string): string[] {
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseExdateTokenToDateOnly(token: string): string | null {
    const trimmed = token.trim();
    if (!trimmed) return null;

    const hyphenDateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (hyphenDateMatch) {
        const parsed = parseISO(`${hyphenDateMatch[1]}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : hyphenDateMatch[1];
    }

    const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})/);
    if (compactMatch) {
        const normalized = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
        const parsed = parseISO(`${normalized}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : normalized;
    }

    const parsed = parseISO(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, 'yyyy-MM-dd');
}

function collectRecurrenceLineTokens(lines: unknown, prefix: 'RDATE' | 'EXDATE'): string[] {
    if (!Array.isArray(lines)) return [];
    const results: string[] = [];

    for (const line of lines) {
        if (typeof line !== 'string') continue;
        const trimmed = line.trim();
        if (!trimmed.toUpperCase().startsWith(prefix)) continue;
        const splitIndex = trimmed.indexOf(':');
        if (splitIndex < 0) continue;
        results.push(...parseCsvList(trimmed.slice(splitIndex + 1)));
    }

    return results;
}

function normalizeDateOnlyList(values: string[]): string[] {
    return Array.from(
        new Set(
            values
                .map((entry) => parseExdateTokenToDateOnly(entry))
                .filter(Boolean) as string[]
        )
    ).sort((left, right) => left.localeCompare(right));
}

function buildDateListFromRows(rows: RecurrenceExceptionRow[]): string[] {
    const collected: string[] = [];

    for (const row of rows) {
        if (row.mode === 'date') {
            const normalized = parseExdateTokenToDateOnly(row.date);
            if (normalized) {
                collected.push(normalized);
            }
            continue;
        }

        const start = parseExdateTokenToDateOnly(row.rangeStart);
        const end = parseExdateTokenToDateOnly(row.rangeEnd);
        if (!start || !end) continue;

        const startDate = parseISO(`${start}T00:00:00`);
        const endDate = parseISO(`${end}T00:00:00`);
        if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) continue;

        const rangeStart = startDate.getTime() <= endDate.getTime() ? startDate : endDate;
        const rangeEnd = startDate.getTime() <= endDate.getTime() ? endDate : startDate;
        let cursor = rangeStart;

        while (cursor.getTime() <= rangeEnd.getTime()) {
            collected.push(format(cursor, 'yyyy-MM-dd'));
            cursor = addDays(cursor, 1);
        }
    }

    return normalizeDateOnlyList(collected);
}

function normalizeStoredRecurrenceExceptionRows(value: unknown): StoredRecurrenceExceptionRow[] {
    if (!Array.isArray(value)) return [];

    const rows: StoredRecurrenceExceptionRow[] = [];
    for (const row of value) {
        if (!row || typeof row !== 'object') continue;
        const source = row as Record<string, unknown>;
        const mode = String(source.mode || '').toLowerCase();

        if (mode === 'range') {
            const start = parseExdateTokenToDateOnly(String(source.rangeStart || source.start || ''));
            const end = parseExdateTokenToDateOnly(String(source.rangeEnd || source.end || ''));
            if (!start || !end) continue;
            const [rangeStart, rangeEnd] = start.localeCompare(end) <= 0 ? [start, end] : [end, start];
            rows.push({
                mode: 'range',
                date: rangeStart,
                rangeStart,
                rangeEnd,
            });
            continue;
        }

        const date = parseExdateTokenToDateOnly(String(source.date || source.rangeStart || source.start || ''));
        if (!date) continue;
        rows.push({
            mode: 'date',
            date,
            rangeStart: date,
            rangeEnd: date,
        });
    }

    return rows;
}

function serializeRecurrenceExceptionRows(rows: RecurrenceExceptionRow[]): StoredRecurrenceExceptionRow[] {
    const serialized: StoredRecurrenceExceptionRow[] = [];

    for (const row of rows) {
        if (row.mode === 'range') {
            const start = parseExdateTokenToDateOnly(row.rangeStart);
            const end = parseExdateTokenToDateOnly(row.rangeEnd);
            if (!start || !end) continue;
            const [rangeStart, rangeEnd] = start.localeCompare(end) <= 0 ? [start, end] : [end, start];
            serialized.push({
                mode: 'range',
                date: rangeStart,
                rangeStart,
                rangeEnd,
            });
            continue;
        }

        const date = parseExdateTokenToDateOnly(row.date);
        if (!date) continue;
        serialized.push({
            mode: 'date',
            date,
            rangeStart: date,
            rangeEnd: date,
        });
    }

    return serialized;
}

function parseOptionalInt(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    return Math.trunc(parsed);
}

function toDatetimeLocalValue(value?: string): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    const hour = String(parsed.getHours()).padStart(2, '0');
    const minute = String(parsed.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
}

function buildRecurrenceLines(rrule: string, rdates: string[], exdates: string[]): string[] {
    const lines: string[] = [];
    if (rrule) lines.push(rrule);
    if (rdates.length > 0) lines.push(`RDATE:${rdates.join(',')}`);
    if (exdates.length > 0) lines.push(`EXDATE:${exdates.join(',')}`);
    return lines;
}

function parseRecurrenceDateToken(token: string): Date | null {
    const trimmed = token.trim();
    if (!trimmed) return null;

    const compactDate = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compactDate) {
        const [, year, month, day] = compactDate;
        const parsed = parseISO(`${year}-${month}-${day}`);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const compactUtcDateTime = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (compactUtcDateTime) {
        const [, year, month, day, hours, minutes, seconds] = compactUtcDateTime;
        const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds)));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const compactLocalDateTime = trimmed.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (compactLocalDateTime) {
        const [, year, month, day, hours, minutes, seconds] = compactLocalDateTime;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds));
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const isoParsed = parseISO(trimmed);
    if (!Number.isNaN(isoParsed.getTime())) {
        return isoParsed;
    }

    const nativeParsed = new Date(trimmed);
    return Number.isNaN(nativeParsed.getTime()) ? null : nativeParsed;
}

function formatIcsDateTimeUtc(value: Date): string {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    const hours = String(value.getUTCHours()).padStart(2, '0');
    const minutes = String(value.getUTCMinutes()).padStart(2, '0');
    const seconds = String(value.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function capRruleBeforeOccurrence(rruleValue: string, occurrenceStart: Date, isAllDay: boolean): string {
    const normalized = normalizeRrule(rruleValue);
    if (!normalized) return '';

    const rawParts = normalized
        .replace(/^RRULE:/i, '')
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean);

    if (rawParts.length === 0) return normalized;

    const withoutEndParts = rawParts.filter((entry) => {
        const upper = entry.toUpperCase();
        return !upper.startsWith('COUNT=') && !upper.startsWith('UNTIL=');
    });
    if (withoutEndParts.length === 0) return normalized;

    const untilDate = isAllDay ? addDays(new Date(occurrenceStart), -1) : new Date(occurrenceStart.getTime() - 1000);
    const untilToken = isAllDay ? format(untilDate, 'yyyyMMdd') : formatIcsDateTimeUtc(untilDate);
    return `RRULE:${[...withoutEndParts, `UNTIL=${untilToken}`].join(';')}`;
}

function normalizeRecurrenceTokens(tokens: string[]): string[] {
    const deduped = Array.from(new Set(tokens.map((entry) => String(entry || '').trim()).filter(Boolean)));
    return deduped.sort((left, right) => {
        const leftDate = parseRecurrenceDateToken(left);
        const rightDate = parseRecurrenceDateToken(right);
        if (leftDate && rightDate) {
            const diff = leftDate.getTime() - rightDate.getTime();
            if (diff !== 0) return diff;
        }
        if (leftDate && !rightDate) return -1;
        if (!leftDate && rightDate) return 1;
        return left.localeCompare(right);
    });
}

function partitionRecurrenceTokensByBoundary(tokens: string[], boundary: Date, isAllDay: boolean): { before: string[]; onOrAfter: string[] } {
    const before: string[] = [];
    const onOrAfter: string[] = [];
    const boundaryTime = isAllDay ? parseISO(`${format(boundary, 'yyyy-MM-dd')}T00:00:00`).getTime() : boundary.getTime();

    for (const token of normalizeRecurrenceTokens(tokens)) {
        const parsed = parseRecurrenceDateToken(token);
        if (!parsed) {
            before.push(token);
            continue;
        }
        const tokenTime = isAllDay ? parseISO(`${format(parsed, 'yyyy-MM-dd')}T00:00:00`).getTime() : parsed.getTime();
        if (tokenTime < boundaryTime) {
            before.push(token);
        } else {
            onOrAfter.push(token);
        }
    }

    return {
        before: normalizeRecurrenceTokens(before),
        onOrAfter: normalizeRecurrenceTokens(onOrAfter),
    };
}

function splitRecurrenceRowsAtBoundary(rows: StoredRecurrenceExceptionRow[], boundaryDateOnly: string) {
    const before: StoredRecurrenceExceptionRow[] = [];
    const onOrAfter: StoredRecurrenceExceptionRow[] = [];

    for (const row of rows) {
        if (row.mode === 'date') {
            if (row.date.localeCompare(boundaryDateOnly) < 0) {
                before.push(row);
            } else {
                onOrAfter.push(row);
            }
            continue;
        }

        const start = row.rangeStart;
        const end = row.rangeEnd;
        if (end.localeCompare(boundaryDateOnly) < 0) {
            before.push(row);
            continue;
        }
        if (start.localeCompare(boundaryDateOnly) >= 0) {
            onOrAfter.push(row);
            continue;
        }

        const boundaryDate = parseISO(`${boundaryDateOnly}T00:00:00`);
        if (Number.isNaN(boundaryDate.getTime())) continue;
        const dayBeforeBoundary = format(addDays(boundaryDate, -1), 'yyyy-MM-dd');

        before.push({
            mode: 'range',
            date: start,
            rangeStart: start,
            rangeEnd: dayBeforeBoundary,
        });
        onOrAfter.push({
            mode: 'range',
            date: boundaryDateOnly,
            rangeStart: boundaryDateOnly,
            rangeEnd: end,
        });
    }

    return { before, onOrAfter };
}

function deriveAlarmDefaults(selectedEvent: CalendarItem | null) {
    const firstAlarm = Array.isArray(selectedEvent?.alarms) ? selectedEvent?.alarms?.[0] : null;
    if (!firstAlarm) {
        return {
            alarmEnabled: false,
            alarmAction: DEFAULT_ALARM_ACTION,
            alarmTriggerMode: DEFAULT_ALARM_TRIGGER_MODE,
            alarmTriggerMinutesBefore: '15',
            alarmTriggerAt: '',
            alarmRepeatCount: '',
            alarmRepeatDurationMinutes: '',
            alarmRepeatUntilAcknowledged: false,
        };
    }

    const normalizedAction = String(firstAlarm.action || DEFAULT_ALARM_ACTION).toLowerCase();
    const triggerOffsetMinutes =
        typeof firstAlarm.triggerOffsetMinutesBeforeStart === 'number'
            ? firstAlarm.triggerOffsetMinutesBeforeStart
            : typeof firstAlarm.triggerOffsetSeconds === 'number'
              ? Math.round(firstAlarm.triggerOffsetSeconds / 60)
              : 15;
    const absoluteTrigger = firstAlarm.triggerAt ? toDatetimeLocalValue(firstAlarm.triggerAt) : '';
    const triggerMode = firstAlarm.triggerAt || String(firstAlarm.triggerType || '').toLowerCase() === 'absolute' ? 'absolute' : 'relative';
    const repeatUntilAcknowledged = Boolean(firstAlarm.repeatUntilAcknowledged);

    return {
        alarmEnabled: true,
        alarmAction: repeatUntilAcknowledged
            ? 'audioUntilAck'
            : normalizedAction === 'audio'
              ? 'audio'
              : normalizedAction === 'display'
                ? 'display'
                : normalizedAction,
        alarmTriggerMode: triggerMode,
        alarmTriggerMinutesBefore: String(Math.max(0, triggerOffsetMinutes)),
        alarmTriggerAt: absoluteTrigger,
        alarmRepeatCount: firstAlarm.repeatCount != null ? String(firstAlarm.repeatCount) : '',
        alarmRepeatDurationMinutes: firstAlarm.repeatDurationMinutes != null ? String(firstAlarm.repeatDurationMinutes) : '',
        alarmRepeatUntilAcknowledged: repeatUntilAcknowledged,
    };
}

const AddEventForm = ({
    selectedDate,
    selectedEvent,
    initialDraft = null,
    allCalendarItems = [],
    onClose,
    defaultStartTime = '10:00',
    onOptimisticUpsert,
}: AddEventFormProps) => {
    const currentUser = useOptionalAuth()?.currentUser || null;
    const [formData, setFormData] = useState<EventFormData>(() => buildCreateEventFormData(selectedDate, initialDraft, defaultStartTime));
    const titleInputRef = useRef<HTMLInputElement>(null);
    const submitLockRef = useRef(false);
    const isMountedRef = useRef(true);
    const recurrenceExceptionIdRef = useRef(1);
    const recurrenceRdateIdRef = useRef(1);
    const recurrenceScopeResolverRef = useRef<((scope: RecurrenceEditScope) => void) | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [recurrenceUi, setRecurrenceUi] = useState<RecurrenceUiState>(() =>
        getDefaultRecurrenceUiState(buildCreateEventFormData(selectedDate, initialDraft, defaultStartTime).startDate)
    );
    const [exceptionsEnabled, setExceptionsEnabled] = useState(false);
    const [recurrenceExceptions, setRecurrenceExceptions] = useState<RecurrenceExceptionRow[]>([]);
    const [rdatesEnabled, setRdatesEnabled] = useState(false);
    const [recurrenceRdates, setRecurrenceRdates] = useState<RecurrenceExceptionRow[]>([]);
    const [selectedFamilyMemberIds, setSelectedFamilyMemberIds] = useState<string[]>([]);
    const [recurrenceScopeDialogOpen, setRecurrenceScopeDialogOpen] = useState(false);
    const [recurrenceScopeDialogAction, setRecurrenceScopeDialogAction] = useState<'edit' | 'drag' | 'delete'>('edit');
    const [recurrenceScopeDialogMode, setRecurrenceScopeDialogMode] = useState<RecurrenceSeriesScopeMode>('following');
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [selectedTags, setSelectedTags] = useState<CalendarTag[]>([]);
    const [tagDraft, setTagDraft] = useState('');
    const memberGridRef = useRef<HTMLDivElement>(null);
    const lastLoadedSourceRef = useRef(selectedEvent ? '' : buildCreateDraftSourceKey(selectedDate, initialDraft));
    const [memberGridWidth, setMemberGridWidth] = useState(0);
    const eventMetaQuery = db.useQuery({
        familyMembers: {
            $: {
                order: {
                    order: 'asc',
                },
            },
        },
        calendarTags: {},
    });
    const familyMembers = ((eventMetaQuery.data?.familyMembers as FamilyMember[]) || []).filter((member) => Boolean(member?.id));
    const availableCalendarTags = useMemo(
        () => sortCalendarTagRecords(dedupeCalendarTagRecords(eventMetaQuery.data?.calendarTags || [])),
        [eventMetaQuery.data?.calendarTags]
    );
    const availableCalendarTagByKey = useMemo(
        () => new Map(availableCalendarTags.map((tag) => [String(tag.normalizedName || normalizeCalendarTagKey(tag.name)), tag])),
        [availableCalendarTags]
    );
    const selectedMasterEvent = (((selectedEvent as any)?.__masterEvent as CalendarItem | undefined) || selectedEvent) ?? null;
    const selectedMasterRrule = normalizeRrule(String(selectedMasterEvent?.rrule || ''));
    const isImportedEvent = Boolean(
        selectedEvent &&
            (selectedEvent.sourceReadOnly || String(selectedEvent.sourceType || '').trim().toLowerCase() === 'apple-caldav')
    );
    const isSelectedRecurringOverride = Boolean(
        selectedEvent &&
            selectedMasterEvent &&
            selectedEvent.id !== selectedMasterEvent.id &&
            isRecurringChildOfMaster(selectedEvent, selectedMasterEvent) &&
            !normalizeRrule(String(selectedEvent.rrule || '')) &&
            selectedMasterRrule
    );

    const selectedFamilyMembersById = useMemo(() => {
        const byId = new Map<string, FamilyMember>();
        for (const member of familyMembers) {
            byId.set(member.id, member);
        }

        for (const member of selectedEvent?.pertainsTo || []) {
            if (!byId.has(member.id)) {
                byId.set(member.id, member);
            }
        }

        return byId;
    }, [familyMembers, selectedEvent]);
    const selectedTagKeys = useMemo(
        () => new Set(selectedTags.map((tag) => String(tag.normalizedName || normalizeCalendarTagKey(tag.name)).trim()).filter(Boolean)),
        [selectedTags]
    );
    const tagSuggestions = useMemo(() => {
        const draftKey = normalizeCalendarTagKey(tagDraft);
        return availableCalendarTags
            .filter((tag) => !selectedTagKeys.has(String(tag.normalizedName || normalizeCalendarTagKey(tag.name)).trim()))
            .filter((tag) => !draftKey || String(tag.normalizedName || '').includes(draftKey))
            .slice(0, 8);
    }, [availableCalendarTags, selectedTagKeys, tagDraft]);
    const appendCalendarHistoryTransactions = useCallback(
        (
            txOps: any[],
            input: {
                occurredAt: string;
                actionType: string;
                summary: string;
                calendarItemId?: string | null;
                affectedMemberIds?: Iterable<string>;
                title?: string;
                beforeSnapshot?: ReturnType<typeof buildCalendarHistorySnapshot>;
                afterSnapshot?: ReturnType<typeof buildCalendarHistorySnapshot>;
                metadata?: Record<string, unknown>;
            }
        ) => {
            if (!currentUser?.id) return txOps;
            const historyEvent = buildHistoryEventTransactions({
                tx,
                createId: id,
                occurredAt: input.occurredAt,
                domain: 'calendar',
                actionType: input.actionType,
                summary: input.summary,
                source: 'manual',
                actorFamilyMemberId: currentUser.id,
                affectedFamilyMemberIds: Array.from(new Set(Array.from(input.affectedMemberIds || []).filter(Boolean))),
                calendarItemId: input.calendarItemId || null,
                metadata: buildCalendarHistoryMetadata({
                    title: input.title || null,
                    before: input.beforeSnapshot || null,
                    after: input.afterSnapshot || null,
                    extra: input.metadata || null,
                }),
            });
            return [...txOps, ...historyEvent.transactions];
        },
        [currentUser?.id]
    );
    const canEditImportedTags = !isSubmitting;
    const detailsReadOnly = false;

    const recurrenceSummaryText = useMemo(
        () => recurrenceSummary(recurrenceUi, formData.startDate || format(new Date(), 'yyyy-MM-dd')),
        [formData.startDate, recurrenceUi]
    );
    const expandedExceptionDates = useMemo(
        () => (exceptionsEnabled ? buildDateListFromRows(recurrenceExceptions) : []),
        [exceptionsEnabled, recurrenceExceptions]
    );
    const exceptionsSummaryText = useMemo(() => {
        if (!exceptionsEnabled) return 'Off';
        const count = expandedExceptionDates.length;
        return count === 0 ? 'On' : `${count} excluded date${count === 1 ? '' : 's'}`;
    }, [exceptionsEnabled, expandedExceptionDates.length]);
    const expandedRdates = useMemo(
        () => (rdatesEnabled ? buildDateListFromRows(recurrenceRdates) : []),
        [rdatesEnabled, recurrenceRdates]
    );
    const rdatesSummaryText = useMemo(() => {
        if (!rdatesEnabled) return 'Off';
        const count = expandedRdates.length;
        return count === 0 ? 'On' : `${count} extra date${count === 1 ? '' : 's'}`;
    }, [rdatesEnabled, expandedRdates.length]);
    const repeatEndSummaryText = useMemo(() => {
        if (recurrenceUi.mode === 'never') return 'No end (does not repeat)';
        if (recurrenceUi.repeatEndMode === 'forever') return 'Repeat forever';
        if (recurrenceUi.repeatEndMode === 'count') {
            const count = clampRecurrenceNumber(recurrenceUi.repeatEndCount, 1, 1000);
            return `End after ${count} occurrence${count === 1 ? '' : 's'}`;
        }
        if (!recurrenceUi.repeatEndUntil) return 'Ends on a specific date';
        const parsed = parseISO(`${recurrenceUi.repeatEndUntil}T00:00:00`);
        return Number.isNaN(parsed.getTime())
            ? 'Ends on a specific date'
            : `Ends on ${parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }, [recurrenceUi]);
    const localTimeZone = useMemo(() => getLocalTimeZone(), []);
    const effectiveEventTimeZone = useMemo(() => resolveTimeZone(formData.timeZone), [formData.timeZone]);
    const summaryLines = useMemo(() => {
        const lines: string[] = [];
        const startInstant = formData.isAllDay
            ? parseISO(`${formData.startDate || format(new Date(), 'yyyy-MM-dd')}T00:00:00`)
            : parseZonedDateTime(formData.startDate, formData.startTime, effectiveEventTimeZone);
        const endInstant = formData.isAllDay
            ? parseISO(`${formData.endDate || formData.startDate || format(new Date(), 'yyyy-MM-dd')}T00:00:00`)
            : parseZonedDateTime(formData.endDate, formData.endTime, effectiveEventTimeZone);

        if (startInstant && !Number.isNaN(startInstant.getTime())) {
            const localDateEnd = endInstant && !Number.isNaN(endInstant.getTime()) ? endInstant : startInstant;
            const sameLocalDay = formatDateInputInTimeZone(startInstant, localTimeZone) === formatDateInputInTimeZone(localDateEnd, localTimeZone);
            lines.push(
                sameLocalDay
                    ? formatHumanDateInTimeZone(startInstant, localTimeZone)
                    : `${formatHumanDateInTimeZone(startInstant, localTimeZone)} - ${formatHumanDateInTimeZone(localDateEnd, localTimeZone)}`
            );
        }

        if (!formData.isAllDay && startInstant && endInstant && !Number.isNaN(startInstant.getTime()) && !Number.isNaN(endInstant.getTime())) {
            lines.push(formatTimeRangeInTimeZone(startInstant, endInstant, localTimeZone));
            if (effectiveEventTimeZone !== localTimeZone) {
                lines.push(formatTimeRangeInTimeZone(startInstant, endInstant, effectiveEventTimeZone, true));
            }
        } else if (formData.isAllDay) {
            lines.push('All day');
        }

        lines.push(summarizeRecurrenceForEvent(recurrenceSummaryText, recurrenceUi.mode));

        if (selectedFamilyMemberIds.length === 0) {
            lines.push('Pertains to everyone');
        } else {
            const names = selectedFamilyMemberIds
                .map((memberId) => selectedFamilyMembersById.get(memberId)?.name || 'Unknown member')
                .filter(Boolean);
            lines.push(`Pertains to ${humanJoin(names)}`);
        }

        lines.push(summarizeAlert(formData));
        return lines;
    }, [
        effectiveEventTimeZone,
        formData.alarmEnabled,
        formData.endDate,
        formData.endTime,
        formData.isAllDay,
        formData.startDate,
        formData.startTime,
        localTimeZone,
        recurrenceSummaryText,
        recurrenceUi.mode,
        selectedFamilyMemberIds,
        selectedFamilyMembersById,
    ]);

    const requestRecurrenceScope = useCallback(
        (action: 'edit' | 'drag' | 'delete', scopeMode: RecurrenceSeriesScopeMode = 'following') => {
        return new Promise<RecurrenceEditScope>((resolve) => {
            recurrenceScopeResolverRef.current = resolve;
            setRecurrenceScopeDialogAction(action);
            setRecurrenceScopeDialogMode(scopeMode);
            setRecurrenceScopeDialogOpen(true);
        });
        },
        []
    );

    const resolveRecurrenceScope = useCallback((scope: RecurrenceEditScope) => {
        setRecurrenceScopeDialogOpen(false);
        const resolver = recurrenceScopeResolverRef.current;
        recurrenceScopeResolverRef.current = null;
        resolver?.(scope);
    }, []);

    const isOriginalSeriesOccurrence = useCallback((item: CalendarItem, masterEvent: CalendarItem) => {
        const occurrenceReferenceToken =
            typeof item.recurrenceId === 'string' && item.recurrenceId.trim() ? item.recurrenceId : item.startDate;
        const occurrenceReferenceDate =
            parseRecurrenceDateToken(String(occurrenceReferenceToken || '')) || parseRecurrenceDateToken(String(item.startDate || ''));
        const masterStartDate = parseRecurrenceDateToken(String(masterEvent.startDate || ''));
        if (!occurrenceReferenceDate || !masterStartDate) return false;

        if (item.isAllDay || masterEvent.isAllDay) {
            return format(occurrenceReferenceDate, 'yyyy-MM-dd') === format(masterStartDate, 'yyyy-MM-dd');
        }

        return occurrenceReferenceDate.getTime() === masterStartDate.getTime();
    }, []);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            if (recurrenceScopeResolverRef.current) {
                recurrenceScopeResolverRef.current('cancel');
                recurrenceScopeResolverRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const gridElement = memberGridRef.current;
        if (!gridElement) return;

        const updateWidth = () => {
            setMemberGridWidth(gridElement.clientWidth);
        };

        updateWidth();
        const raf = window.requestAnimationFrame(updateWidth);

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(updateWidth);
            observer.observe(gridElement);

            return () => {
                window.cancelAnimationFrame(raf);
                observer.disconnect();
            };
        }

        window.addEventListener('resize', updateWidth);
        return () => {
            window.cancelAnimationFrame(raf);
            window.removeEventListener('resize', updateWidth);
        };
    }, [familyMembers.length]);

    const useThreeColumnMemberGrid = useMemo(() => {
        if (familyMembers.length < 3 || memberGridWidth <= 0 || typeof document === 'undefined') {
            return false;
        }

        const visibleRowsAtTwoWide = Math.max(1, Math.floor(MEMBER_GRID_MAX_HEIGHT_PX / MEMBER_GRID_ROW_HEIGHT_PX));
        const twoWideWouldScroll = Math.ceil(familyMembers.length / 2) > visibleRowsAtTwoWide;
        if (!twoWideWouldScroll) {
            return false;
        }

        const estimatedColumnWidth = (memberGridWidth - MEMBER_GRID_GAP_PX * 2) / 3;
        const maxTextWidth = estimatedColumnWidth - MEMBER_GRID_CHROME_WIDTH_PX;
        if (!Number.isFinite(maxTextWidth) || maxTextWidth <= 0) {
            return false;
        }

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
            return false;
        }
        context.font = MEMBER_GRID_TEXT_FONT;

        return familyMembers.every((member) => {
            const label = member.name || 'Unnamed member';
            return context.measureText(label).width <= maxTextWidth;
        });
    }, [familyMembers, memberGridWidth]);

    useEffect(() => {
        if ((!selectedDate && !initialDraft) || selectedEvent) {
            return;
        }

        const raf = window.requestAnimationFrame(() => {
            titleInputRef.current?.focus();
        });

        return () => {
            window.cancelAnimationFrame(raf);
        };
    }, [initialDraft, selectedDate, selectedEvent]);

    useEffect(() => {
        if (selectedEvent) {
            const selectedSourceKey = `event:${selectedEvent.id}:${String(selectedEvent.updatedAt || selectedEvent.lastModified || selectedEvent.startDate || '')}`;
            if (lastLoadedSourceRef.current === selectedSourceKey) {
                return;
            }
            lastLoadedSourceRef.current = selectedSourceKey;
            const recurrenceSourceEvent = isSelectedRecurringOverride && selectedMasterEvent ? selectedMasterEvent : selectedEvent;
            const eventTimeZone = resolveTimeZone(selectedEvent.timeZone || getLocalTimeZone());
            const startInstant = parseISO(selectedEvent.startDate);
            const endInstantForInputs = parseISO(selectedEvent.endDate);
            const startDate =
                selectedEvent.isAllDay || Number.isNaN(startInstant.getTime())
                    ? selectedEvent.startDate
                    : formatDateInputInTimeZone(startInstant, eventTimeZone);
            const exclusiveEndDate = selectedEvent.isAllDay ? parseISO(selectedEvent.endDate) : null;
            const endDate =
                selectedEvent.isAllDay && exclusiveEndDate && !Number.isNaN(exclusiveEndDate.getTime())
                    ? format(addDays(exclusiveEndDate, -1), 'yyyy-MM-dd')
                    : selectedEvent.isAllDay
                      ? selectedEvent.startDate
                      : Number.isNaN(endInstantForInputs.getTime())
                        ? format(parseISO(selectedEvent.endDate), 'yyyy-MM-dd')
                        : formatDateInputInTimeZone(endInstantForInputs, eventTimeZone);
            const startTime =
                selectedEvent.isAllDay || Number.isNaN(startInstant.getTime())
                    ? defaultStartTime
                    : formatTimeInputInTimeZone(startInstant, eventTimeZone);
            const endTime = selectedEvent.isAllDay
                ? format(addHours(parse(defaultStartTime, 'HH:mm', new Date()), 1), 'HH:mm')
                : Number.isNaN(endInstantForInputs.getTime())
                  ? format(parseISO(selectedEvent.endDate), 'HH:mm')
                  : formatTimeInputInTimeZone(endInstantForInputs, eventTimeZone);
            const alarmDefaults = deriveAlarmDefaults(selectedEvent);
            const loadedExdateTokens = normalizeDateOnlyList([
                ...(Array.isArray(recurrenceSourceEvent.exdates) ? recurrenceSourceEvent.exdates.map((entry) => String(entry)) : []),
                ...collectRecurrenceLineTokens(recurrenceSourceEvent.recurrenceLines, 'EXDATE'),
            ]);
            const loadedRdateTokens = normalizeDateOnlyList([
                ...(Array.isArray(recurrenceSourceEvent.rdates) ? recurrenceSourceEvent.rdates.map((entry) => String(entry)) : []),
                ...collectRecurrenceLineTokens(recurrenceSourceEvent.recurrenceLines, 'RDATE'),
            ]);
            const storedExceptionRows = normalizeStoredRecurrenceExceptionRows((recurrenceSourceEvent as any)?.xProps?.recurrenceExceptionRows);
            const exceptionRowsToRender =
                storedExceptionRows.length > 0
                    ? storedExceptionRows
                    : loadedExdateTokens.map((dateOnly) => ({
                          mode: 'date' as const,
                          date: dateOnly,
                          rangeStart: dateOnly,
                          rangeEnd: dateOnly,
                      }));
            const storedRdateRows = normalizeStoredRecurrenceExceptionRows((recurrenceSourceEvent as any)?.xProps?.recurrenceRdateRows);
            const rdateRowsToRender =
                storedRdateRows.length > 0
                    ? storedRdateRows
                    : loadedRdateTokens.map((dateOnly) => ({
                          mode: 'date' as const,
                          date: dateOnly,
                          rangeStart: dateOnly,
                          rangeEnd: dateOnly,
                      }));

            setFormData({
                id: selectedEvent.id,
                title: selectedEvent.title,
                description: selectedEvent.description || '',
                startDate,
                endDate,
                startTime,
                endTime,
                isAllDay: selectedEvent.isAllDay,
                status: String(selectedEvent.status || DEFAULT_EVENT_STATUS),
                location: String(selectedEvent.location || ''),
                timeZone: eventTimeZone,
                rrule: String(recurrenceSourceEvent.rrule || ''),
                rdatesCsv: Array.isArray(recurrenceSourceEvent.rdates) ? recurrenceSourceEvent.rdates.join(', ') : '',
                exdatesCsv: loadedExdateTokens.join(', '),
                recurrenceId: String(selectedEvent.recurrenceId || ''),
                recurringEventId: String(selectedEvent.recurringEventId || ''),
                recurrenceIdRange: String(selectedEvent.recurrenceIdRange || ''),
                travelDurationBeforeMinutes:
                    typeof selectedEvent.travelDurationBeforeMinutes === 'number' ? String(selectedEvent.travelDurationBeforeMinutes) : '',
                travelDurationAfterMinutes:
                    typeof selectedEvent.travelDurationAfterMinutes === 'number' ? String(selectedEvent.travelDurationAfterMinutes) : '',
                ...alarmDefaults,
            });
            const recurrenceSourceStartDate = recurrenceSourceEvent.isAllDay
                ? recurrenceSourceEvent.startDate
                : format(parseISO(recurrenceSourceEvent.startDate), 'yyyy-MM-dd');
            setRecurrenceUi(parseRecurrenceUiStateFromRrule(recurrenceSourceEvent.rrule || '', recurrenceSourceStartDate));
            recurrenceExceptionIdRef.current = Math.max(recurrenceExceptionIdRef.current, exceptionRowsToRender.length + 1);
            recurrenceRdateIdRef.current = Math.max(recurrenceRdateIdRef.current, rdateRowsToRender.length + 1);
            setExceptionsEnabled(exceptionRowsToRender.length > 0);
            setRecurrenceExceptions(
                exceptionRowsToRender.map((row, index) => ({
                    rowId: `recurrence-exception-loaded-${index + 1}`,
                    mode: row.mode,
                    date: row.date,
                    rangeStart: row.rangeStart,
                    rangeEnd: row.rangeEnd,
                }))
            );
            setRdatesEnabled(rdateRowsToRender.length > 0);
            setRecurrenceRdates(
                rdateRowsToRender.map((row, index) => ({
                    rowId: `recurrence-rdate-loaded-${index + 1}`,
                    mode: row.mode,
                    date: row.date,
                    rangeStart: row.rangeStart,
                    rangeEnd: row.rangeEnd,
                }))
            );
            setSelectedFamilyMemberIds((selectedEvent.pertainsTo || []).map((member) => member.id));
            setSelectedTags(sortCalendarTagRecords(dedupeCalendarTagRecords(selectedEvent.tags || [])));
            setTagDraft('');
        } else if (selectedDate || initialDraft) {
            const createSourceKey = buildCreateDraftSourceKey(selectedDate, initialDraft);
            if (lastLoadedSourceRef.current === createSourceKey) {
                return;
            }
            lastLoadedSourceRef.current = createSourceKey;
            const nextFormState = buildCreateEventFormData(selectedDate, initialDraft, defaultStartTime);
            setFormData(nextFormState);
            setRecurrenceUi(getDefaultRecurrenceUiState(nextFormState.startDate));
            recurrenceExceptionIdRef.current = 1;
            recurrenceRdateIdRef.current = 1;
            setExceptionsEnabled(false);
            setRecurrenceExceptions([]);
            setRdatesEnabled(false);
            setRecurrenceRdates([]);
            setSelectedFamilyMemberIds([]);
            setSelectedTags([]);
            setTagDraft('');
        }
    }, [defaultStartTime, initialDraft, isSelectedRecurringOverride, selectedDate, selectedEvent, selectedMasterEvent]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prevState) => {
            const newState = { ...prevState, [name]: value } as EventFormData;

            if (name === 'startTime' && !prevState.isAllDay) {
                const startDateTime = parse(value, 'HH:mm', new Date());
                const timeDiff = parse(prevState.endTime, 'HH:mm', new Date()).getTime() - parse(prevState.startTime, 'HH:mm', new Date()).getTime();
                const newEndTime = addHours(startDateTime, timeDiff / (60 * 60 * 1000));
                newState.endTime = format(newEndTime, 'HH:mm');
            }

            if (name === 'alarmAction' && value === 'audioUntilAck') {
                newState.alarmRepeatUntilAcknowledged = true;
            }

            return newState;
        });
    };

    const handleAllDayToggle = (checked: boolean) => {
        setFormData((prevState) => ({
            ...prevState,
            isAllDay: checked,
            endDate: checked ? prevState.startDate : prevState.endDate,
        }));
    };

    const handleBooleanFieldChange = (name: keyof EventFormData, checked: boolean) => {
        setFormData((prevState) => ({ ...prevState, [name]: checked }));
    };

    const handleFamilyMemberToggle = (memberId: string, checked: boolean | 'indeterminate') => {
        if (checked === 'indeterminate') {
            return;
        }

        setSelectedFamilyMemberIds((previous) => {
            if (checked) {
                return previous.includes(memberId) ? previous : [...previous, memberId];
            }
            return previous.filter((id) => id !== memberId);
        });
    };

    const addTags = useCallback((values: Array<CalendarTag | string>) => {
        setSelectedTags((previous) =>
            sortCalendarTagRecords(dedupeCalendarTagRecords([...(previous || []), ...values], availableCalendarTagByKey))
        );
        setTagDraft('');
    }, [availableCalendarTagByKey]);

    const handleTagDraftInput = useCallback((value: string) => {
        const { committed, remaining } = splitCalendarTagDraft(value);
        if (committed.length > 0) {
            setSelectedTags((previous) =>
                sortCalendarTagRecords(dedupeCalendarTagRecords([...(previous || []), ...committed], availableCalendarTagByKey))
            );
            setTagDraft(remaining);
            return;
        }

        setTagDraft(value);
    }, [availableCalendarTagByKey]);

    const handleAddTagDraft = useCallback(() => {
        const normalizedDraft = normalizeCalendarTagName(tagDraft);
        if (!normalizedDraft) {
            setTagDraft('');
            return;
        }

        addTags([normalizedDraft]);
    }, [addTags, tagDraft]);

    const handleRemoveTag = useCallback((tagKey: string) => {
        setSelectedTags((previous) =>
            previous.filter((tag) => String(tag.normalizedName || normalizeCalendarTagKey(tag.name)).trim() !== tagKey)
        );
    }, []);

    const makeDefaultExceptionRow = useCallback((defaultDate: string): RecurrenceExceptionRow => {
        const normalizedDefault = parseExdateTokenToDateOnly(defaultDate) || format(new Date(), 'yyyy-MM-dd');
        const nextId = recurrenceExceptionIdRef.current++;
        return {
            rowId: `recurrence-exception-${nextId}`,
            mode: 'date',
            date: normalizedDefault,
            rangeStart: normalizedDefault,
            rangeEnd: normalizedDefault,
        };
    }, []);

    const addExceptionRow = useCallback(() => {
        const fallbackDate = formData.startDate || format(new Date(), 'yyyy-MM-dd');
        setRecurrenceExceptions((prev) => [...prev, makeDefaultExceptionRow(fallbackDate)]);
    }, [formData.startDate, makeDefaultExceptionRow]);

    const removeExceptionRow = useCallback(
        (rowId: string) => {
            const hasRemainingRows = recurrenceExceptions.some((entry) => entry.rowId !== rowId);
            setRecurrenceExceptions((prev) => prev.filter((entry) => entry.rowId !== rowId));
            if (!hasRemainingRows) {
                setExceptionsEnabled(false);
            }
        },
        [recurrenceExceptions]
    );

    const makeDefaultRdateRow = useCallback((defaultDate: string): RecurrenceExceptionRow => {
        const normalizedDefault = parseExdateTokenToDateOnly(defaultDate) || format(new Date(), 'yyyy-MM-dd');
        const nextId = recurrenceRdateIdRef.current++;
        return {
            rowId: `recurrence-rdate-${nextId}`,
            mode: 'date',
            date: normalizedDefault,
            rangeStart: normalizedDefault,
            rangeEnd: normalizedDefault,
        };
    }, []);

    const addRdateRow = useCallback(() => {
        const fallbackDate = formData.startDate || format(new Date(), 'yyyy-MM-dd');
        setRecurrenceRdates((prev) => [...prev, makeDefaultRdateRow(fallbackDate)]);
    }, [formData.startDate, makeDefaultRdateRow]);

    const removeRdateRow = useCallback(
        (rowId: string) => {
            const hasRemainingRows = recurrenceRdates.some((entry) => entry.rowId !== rowId);
            setRecurrenceRdates((prev) => prev.filter((entry) => entry.rowId !== rowId));
            if (!hasRemainingRows) {
                setRdatesEnabled(false);
            }
        },
        [recurrenceRdates]
    );

    const toggleRdatesWidget = useCallback(() => {
        if (rdatesEnabled) {
            setRdatesEnabled(false);
            return;
        }

        setRdatesEnabled(true);
        setRecurrenceRdates((prev) => {
            if (prev.length > 0) return prev;
            const fallbackDate = formData.startDate || format(new Date(), 'yyyy-MM-dd');
            return [makeDefaultRdateRow(fallbackDate)];
        });
    }, [rdatesEnabled, formData.startDate, makeDefaultRdateRow]);

    const toggleExceptionsWidget = useCallback(() => {
        if (exceptionsEnabled) {
            setExceptionsEnabled(false);
            return;
        }

        setExceptionsEnabled(true);
        setRecurrenceExceptions((prev) => {
            if (prev.length > 0) return prev;
            const fallbackDate = formData.startDate || format(new Date(), 'yyyy-MM-dd');
            return [makeDefaultExceptionRow(fallbackDate)];
        });
    }, [exceptionsEnabled, formData.startDate, makeDefaultExceptionRow]);

    const handleDeleteByScope = useCallback(
        async (scope: RecurrenceEditScope) => {
            if (!selectedEvent) return;

            if (submitLockRef.current) return;
            submitLockRef.current = true;
            setIsSubmitting(true);
            const abortDelete = () => {
                submitLockRef.current = false;
                if (isMountedRef.current) {
                    setIsSubmitting(false);
                }
            };

            const nowIso = new Date().toISOString();
            const masterEvent = (((selectedEvent as any).__masterEvent as CalendarItem | undefined) || selectedEvent) as CalendarItem;
            const masterRrule = normalizeRrule(String(masterEvent?.rrule || ''));
            const masterId = String(masterEvent?.id || selectedEvent.id);
            const masterLinkKeys = getRecurringSeriesLinkKeys(masterEvent);
            const hasRecurringContext = Boolean(masterRrule || String(selectedEvent.recurringEventId || '').trim());
            const selectedAffectedIds = new Set((selectedEvent?.pertainsTo || []).map((member) => member.id));

            if (!hasRecurringContext) {
                try {
                    await db.transact(
                        appendCalendarHistoryTransactions([tx.calendarItems[selectedEvent.id].delete()], {
                            occurredAt: nowIso,
                            actionType: 'calendar_event_deleted',
                            summary: `Deleted event "${selectedEvent.title || 'Untitled event'}"`,
                            calendarItemId: selectedEvent.id,
                            affectedMemberIds: selectedAffectedIds,
                            title: selectedEvent.title || 'Untitled event',
                            beforeSnapshot: buildCalendarHistorySnapshot(selectedEvent),
                        })
                    );
                    onClose();
                } catch (error) {
                    console.error('Unable to delete event:', error);
                    window.alert('Unable to delete event. Please try again.');
                    abortDelete();
                    return;
                }

                submitLockRef.current = false;
                return;
            }

            const referenceTokenRaw = String((selectedEvent as any).recurrenceId || selectedEvent.startDate || '').trim();
            const referenceDate = parseRecurrenceDateToken(referenceTokenRaw) || parseRecurrenceDateToken(String(selectedEvent.startDate || ''));
            if (!referenceDate) {
                window.alert('Unable to identify the recurrence instance for deletion.');
                abortDelete();
                return;
            }
            const referenceToken = selectedEvent.isAllDay ? format(referenceDate, 'yyyy-MM-dd') : referenceDate.toISOString();
            const boundaryDateOnly = format(referenceDate, 'yyyy-MM-dd');

            if (!masterRrule) {
                if (scope !== 'single') {
                    window.alert('Unable to delete following events because the recurrence series was not found.');
                    abortDelete();
                    return;
                }
                try {
                    await db.transact(
                        appendCalendarHistoryTransactions([tx.calendarItems[selectedEvent.id].delete()], {
                            occurredAt: nowIso,
                            actionType: 'calendar_event_deleted',
                            summary: `Deleted event "${selectedEvent.title || 'Untitled event'}"`,
                            calendarItemId: selectedEvent.id,
                            affectedMemberIds: selectedAffectedIds,
                            title: selectedEvent.title || 'Untitled event',
                            beforeSnapshot: buildCalendarHistorySnapshot(selectedEvent),
                        })
                    );
                    onClose();
                } catch (error) {
                    console.error('Unable to delete recurrence override:', error);
                    window.alert('Unable to delete event. Please try again.');
                    abortDelete();
                    return;
                }
                submitLockRef.current = false;
                return;
            }

            const masterExdates = normalizeRecurrenceTokens([
                ...(Array.isArray(masterEvent.exdates) ? masterEvent.exdates.map((entry) => String(entry)) : []),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'EXDATE'),
            ]);
            const masterRdates = normalizeRecurrenceTokens([
                ...(Array.isArray(masterEvent.rdates) ? masterEvent.rdates.map((entry) => String(entry)) : []),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'RDATE'),
            ]);
            const masterSequence = typeof masterEvent.sequence === 'number' ? masterEvent.sequence : 0;
            const masterXProps =
                masterEvent.xProps && typeof masterEvent.xProps === 'object' && !Array.isArray(masterEvent.xProps)
                    ? { ...(masterEvent.xProps as Record<string, unknown>) }
                    : {};

            const txOps: any[] = [];
            const selectedIsOverride =
                selectedEvent.id !== masterId && isRecurringChildOfMaster(selectedEvent, masterEvent) && !normalizeRrule(String(selectedEvent.rrule || ''));
            const collectRelatedOverrideIds = (boundaryTime?: number) => {
                const overrideIds = new Set<string>();
                for (const candidate of allCalendarItems) {
                    const parentId = String(candidate.recurringEventId || '').trim();
                    if (!parentId || !masterLinkKeys.includes(parentId)) continue;

                    if (boundaryTime == null) {
                        overrideIds.add(candidate.id);
                        continue;
                    }

                    const recurrenceRefToken =
                        typeof candidate.recurrenceId === 'string' && candidate.recurrenceId.trim()
                            ? candidate.recurrenceId
                            : candidate.startDate;
                    const recurrenceRefDate = parseRecurrenceDateToken(String(recurrenceRefToken || ''));
                    if (!recurrenceRefDate) continue;
                    const recurrenceTime = candidate.isAllDay
                        ? parseISO(`${format(recurrenceRefDate, 'yyyy-MM-dd')}T00:00:00`).getTime()
                        : recurrenceRefDate.getTime();
                    if (recurrenceTime >= boundaryTime) {
                        overrideIds.add(candidate.id);
                    }
                }

                if (selectedIsOverride) {
                    overrideIds.add(selectedEvent.id);
                }

                return overrideIds;
            };

            if (scope === 'single') {
                const nextExdates = normalizeRecurrenceTokens([...masterExdates, referenceToken]);
                const nextExceptionRows = normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceExceptionRows);
                if (
                    !nextExceptionRows.some((row) =>
                        row.mode === 'date'
                            ? row.date === boundaryDateOnly
                            : row.rangeStart.localeCompare(boundaryDateOnly) <= 0 && row.rangeEnd.localeCompare(boundaryDateOnly) >= 0
                    )
                ) {
                    nextExceptionRows.push({
                        mode: 'date',
                        date: boundaryDateOnly,
                        rangeStart: boundaryDateOnly,
                        rangeEnd: boundaryDateOnly,
                    });
                }
                const nextMasterPatch = {
                    exdates: nextExdates,
                    recurrenceLines: buildRecurrenceLines(masterRrule, masterRdates, nextExdates),
                    updatedAt: nowIso,
                    dtStamp: nowIso,
                    lastModified: nowIso,
                    sequence: masterSequence + 1,
                    xProps: {
                        ...masterXProps,
                        recurrenceExceptionRows: nextExceptionRows,
                    },
                };
                txOps.push(tx.calendarItems[masterId].update(nextMasterPatch));
                if (selectedIsOverride) {
                    txOps.push(tx.calendarItems[selectedEvent.id].delete());
                }
            } else if (scope === 'all') {
                txOps.push(tx.calendarItems[masterId].delete());

                for (const overrideId of Array.from(collectRelatedOverrideIds())) {
                    txOps.push(tx.calendarItems[overrideId].delete());
                }
            } else {
                const boundaryTime = selectedEvent.isAllDay
                    ? parseISO(`${boundaryDateOnly}T00:00:00`).getTime()
                    : referenceDate.getTime();
                const masterStartReferenceDate = parseRecurrenceDateToken(String(masterEvent.startDate || ''));
                const masterStartTime = masterStartReferenceDate
                    ? selectedEvent.isAllDay
                        ? parseISO(`${format(masterStartReferenceDate, 'yyyy-MM-dd')}T00:00:00`).getTime()
                        : masterStartReferenceDate.getTime()
                    : Number.NaN;
                const deletingFromFirstOccurrence = Number.isFinite(masterStartTime) && boundaryTime <= masterStartTime;

                if (deletingFromFirstOccurrence) {
                    txOps.push(tx.calendarItems[masterId].delete());
                } else {
                    const cappedMasterRrule = capRruleBeforeOccurrence(masterRrule, referenceDate, selectedEvent.isAllDay);
                    const splitExdates = partitionRecurrenceTokensByBoundary(masterExdates, referenceDate, selectedEvent.isAllDay);
                    const splitRdates = partitionRecurrenceTokensByBoundary(masterRdates, referenceDate, selectedEvent.isAllDay);
                    const splitExceptionRows = splitRecurrenceRowsAtBoundary(
                        normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceExceptionRows),
                        boundaryDateOnly
                    );
                    const splitRdateRows = splitRecurrenceRowsAtBoundary(
                        normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceRdateRows),
                        boundaryDateOnly
                    );
                    const patchedMasterXProps = { ...masterXProps };
                    if (splitExceptionRows.before.length > 0) {
                        patchedMasterXProps.recurrenceExceptionRows = splitExceptionRows.before;
                    } else {
                        delete patchedMasterXProps.recurrenceExceptionRows;
                    }
                    if (splitRdateRows.before.length > 0) {
                        patchedMasterXProps.recurrenceRdateRows = splitRdateRows.before;
                    } else {
                        delete patchedMasterXProps.recurrenceRdateRows;
                    }

                    txOps.push(
                        tx.calendarItems[masterId].update({
                            rrule: cappedMasterRrule,
                            rdates: splitRdates.before,
                            exdates: splitExdates.before,
                            recurrenceLines: buildRecurrenceLines(cappedMasterRrule, splitRdates.before, splitExdates.before),
                            updatedAt: nowIso,
                            dtStamp: nowIso,
                            lastModified: nowIso,
                            sequence: masterSequence + 1,
                            xProps: patchedMasterXProps,
                        })
                    );
                }

                const overrideIds = deletingFromFirstOccurrence ? collectRelatedOverrideIds() : collectRelatedOverrideIds(boundaryTime);
                for (const overrideId of Array.from(overrideIds)) {
                    txOps.push(tx.calendarItems[overrideId].delete());
                }
            }

            try {
                await db.transact(
                    appendCalendarHistoryTransactions(txOps, {
                        occurredAt: nowIso,
                        actionType: 'calendar_event_deleted',
                        summary: `Deleted event "${selectedEvent.title || 'Untitled event'}"`,
                        calendarItemId: selectedEvent.id,
                        affectedMemberIds: selectedAffectedIds,
                        title: selectedEvent.title || 'Untitled event',
                        beforeSnapshot: buildCalendarHistorySnapshot(selectedEvent),
                    })
                );
                onClose();
            } catch (error) {
                console.error('Unable to delete recurring event:', error);
                window.alert('Unable to delete event. Please try again.');
                abortDelete();
                return;
            }

            submitLockRef.current = false;
        },
        [allCalendarItems, onClose, selectedEvent]
    );

    const handleDeleteClick = useCallback(async () => {
        if (!selectedEvent || isSubmitting) return;
        const masterEvent = (((selectedEvent as any).__masterEvent as CalendarItem | undefined) || selectedEvent) as CalendarItem;
        const masterRrule = normalizeRrule(String(masterEvent?.rrule || ''));
        const isRecurringContext = Boolean(masterRrule || String(selectedEvent.recurringEventId || '').trim());

        if (!isRecurringContext) {
            setDeleteConfirmOpen(true);
            return;
        }

        const scope = await requestRecurrenceScope(
            'delete',
            selectedEvent && masterEvent && isOriginalSeriesOccurrence(selectedEvent, masterEvent) ? 'all' : 'following'
        );
        if (scope === 'cancel') return;
        await handleDeleteByScope(scope);
    }, [handleDeleteByScope, isOriginalSeriesOccurrence, isSubmitting, requestRecurrenceScope, selectedEvent]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitLockRef.current) return;
        submitLockRef.current = true;
        setIsSubmitting(true);
        const abortSubmit = () => {
            submitLockRef.current = false;
            if (isMountedRef.current) {
                setIsSubmitting(false);
            }
        };
        const draftTagName = normalizeCalendarTagName(tagDraft);
        const nextTags = sortCalendarTagRecords(
            dedupeCalendarTagRecords(draftTagName ? [...selectedTags, draftTagName] : selectedTags, availableCalendarTagByKey)
        );
        if (draftTagName) {
            setSelectedTags(nextTags);
            setTagDraft('');
        }
        const buildTagTxOps = (targetEventId: string, previousTags: CalendarTag[], nowIso: string) => {
            const txOps: any[] = [];
            const previousTagIds = new Set(
                dedupeCalendarTagRecords(previousTags || [], availableCalendarTagByKey)
                    .map((tag) => availableCalendarTagByKey.get(String(tag.normalizedName || normalizeCalendarTagKey(tag.name)))?.id || tag.id || '')
                    .filter(Boolean)
            );
            const resolvedNextTags = nextTags.map((tag) => {
                const normalizedName = String(tag.normalizedName || normalizeCalendarTagKey(tag.name)).trim();
                const existingTag = availableCalendarTagByKey.get(normalizedName);
                const tagId = existingTag?.id || tag.id || id();

                if (!existingTag?.id && !tag.id) {
                    txOps.push(
                        tx.calendarTags[tagId].update({
                            createdAt: nowIso,
                            name: existingTag?.name || tag.name,
                            normalizedName,
                            updatedAt: nowIso,
                        })
                    );
                }

                return {
                    id: tagId,
                    name: existingTag?.name || tag.name,
                    normalizedName,
                };
            });
            const nextTagIds = new Set(resolvedNextTags.map((tag) => tag.id).filter(Boolean));

            for (const previousTagId of Array.from(previousTagIds)) {
                if (!nextTagIds.has(previousTagId)) {
                    txOps.push(tx.calendarItems[targetEventId].unlink({ tags: previousTagId }));
                }
            }

            for (const tag of resolvedNextTags) {
                if (tag.id && !previousTagIds.has(tag.id)) {
                    txOps.push(tx.calendarItems[targetEventId].link({ tags: tag.id }));
                }
            }

            return {
                optimisticTags: resolvedNextTags,
                txOps,
            };
        };
        let startDateObj, endDateObj;

        if (formData.isAllDay) {
            // For all-day events, use floating time (no timezone)
            startDateObj = parseISO(`${formData.startDate}T00:00:00`);
            endDateObj = parseISO(`${formData.endDate}T00:00:00`);
            endDateObj = addDays(endDateObj, 1); // End date is exclusive
        } else {
            // Timed event inputs are interpreted in the event's configured timezone.
            startDateObj = parseZonedDateTime(formData.startDate, formData.startTime, effectiveEventTimeZone);
            endDateObj = parseZonedDateTime(formData.endDate, formData.endTime, effectiveEventTimeZone);
        }

        if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime()) || endDateObj.getTime() <= startDateObj.getTime()) {
            abortSubmit();
            window.alert('Please provide a valid start/end date range.');
            return;
        }

        const eventId = formData.id || id();
        const nowIso = new Date().toISOString();
        const masterEvent = selectedMasterEvent;
        const masterRrule = selectedMasterRrule;
        const isOverrideEdit = Boolean(
            selectedEvent &&
                !normalizeRrule(String(selectedEvent.rrule || '')) &&
                String(selectedEvent.recurringEventId || '').trim()
        );
        const normalizedStatus = formData.status.trim().toLowerCase() || DEFAULT_EVENT_STATUS;
        const normalizedRrule = normalizeRrule(
            serializeRecurrenceToRrule(recurrenceUi, formData.startDate || format(new Date(), 'yyyy-MM-dd'))
        );
        const rdates = recurrenceUi.mode !== 'never' && rdatesEnabled ? expandedRdates : [];
        const storedRdateRows = recurrenceUi.mode !== 'never' && rdatesEnabled ? serializeRecurrenceExceptionRows(recurrenceRdates) : [];
        const exdates = recurrenceUi.mode !== 'never' && exceptionsEnabled ? expandedExceptionDates : [];
        const storedExceptionRows =
            recurrenceUi.mode !== 'never' && exceptionsEnabled ? serializeRecurrenceExceptionRows(recurrenceExceptions) : [];
        const recurrenceLines = buildRecurrenceLines(normalizedRrule, rdates, exdates);
        const sequenceBase = typeof selectedEvent?.sequence === 'number' ? selectedEvent.sequence : 0;
        const travelDurationBeforeMinutes = parseOptionalInt(formData.travelDurationBeforeMinutes);
        const travelDurationAfterMinutes = parseOptionalInt(formData.travelDurationAfterMinutes);
        const alarmTriggerAtIso = formData.alarmTriggerAt ? new Date(formData.alarmTriggerAt).toISOString() : '';
        const alarmAction = formData.alarmAction === 'audioUntilAck' ? 'audio' : formData.alarmAction;
        const alarmRepeatCount = parseOptionalInt(formData.alarmRepeatCount);
        const alarmRepeatDurationMinutes = parseOptionalInt(formData.alarmRepeatDurationMinutes);
        const alarmDefinitions = formData.alarmEnabled
            ? [
                  {
                      action: String(alarmAction || DEFAULT_ALARM_ACTION).toUpperCase(),
                      triggerType: formData.alarmTriggerMode,
                      triggerAt: formData.alarmTriggerMode === 'absolute' ? alarmTriggerAtIso : '',
                      triggerOffsetMinutesBeforeStart:
                          formData.alarmTriggerMode === 'relative' ? Math.max(0, parseOptionalInt(formData.alarmTriggerMinutesBefore) ?? 15) : 0,
                      repeatCount: alarmRepeatCount ?? 0,
                      repeatDurationMinutes: alarmRepeatDurationMinutes ?? 0,
                      repeatUntilAcknowledged:
                          Boolean(formData.alarmRepeatUntilAcknowledged) || formData.alarmAction === 'audioUntilAck',
                  },
              ]
            : [];

        const legacyEventData = {
            title: formData.title,
            description: formData.description,
            startDate: formData.isAllDay ? format(startDateObj, 'yyyy-MM-dd') : startDateObj.toISOString(),
            endDate: formData.isAllDay ? format(endDateObj, 'yyyy-MM-dd') : endDateObj.toISOString(),
            isAllDay: formData.isAllDay,
            year: startDateObj.getFullYear(),
            month: startDateObj.getMonth() + 1,
            dayOfMonth: startDateObj.getDate(),
        };

        const baseXProps =
            selectedEvent?.xProps && typeof selectedEvent.xProps === 'object' && !Array.isArray(selectedEvent.xProps)
                ? { ...(selectedEvent.xProps as Record<string, unknown>) }
                : {};
        if (storedExceptionRows.length > 0) {
            baseXProps.recurrenceExceptionRows = storedExceptionRows;
        } else {
            delete baseXProps.recurrenceExceptionRows;
        }
        if (storedRdateRows.length > 0) {
            baseXProps.recurrenceRdateRows = storedRdateRows;
        } else {
            delete baseXProps.recurrenceRdateRows;
        }
        const overrideBaseXProps = { ...baseXProps };
        delete overrideBaseXProps.recurrenceExceptionRows;
        delete overrideBaseXProps.recurrenceRdateRows;
        const preservedRecurrenceId = isOverrideEdit ? String(selectedEvent?.recurrenceId || '').trim() : formData.recurrenceId.trim();
        const preservedRecurringEventId = isOverrideEdit
            ? String(selectedEvent?.recurringEventId || '').trim()
            : formData.recurringEventId.trim();
        const preservedRecurrenceIdRange = isOverrideEdit
            ? String(selectedEvent?.recurrenceIdRange || '').trim()
            : formData.recurrenceIdRange.trim();

        const extendedEventPatch = {
            uid: selectedEvent?.uid || eventId,
            sequence: formData.id ? sequenceBase + 1 : sequenceBase,
            status: normalizedStatus,
            createdAt: selectedEvent?.createdAt || nowIso,
            updatedAt: nowIso,
            dtStamp: nowIso,
            lastModified: nowIso,
            location: formData.location.trim(),
            timeZone: formData.timeZone.trim() || getLocalTimeZone(),
            rrule: isOverrideEdit ? '' : normalizedRrule,
            rdates: isOverrideEdit ? [] : rdates,
            exdates: isOverrideEdit ? [] : exdates,
            recurrenceLines: isOverrideEdit ? [] : recurrenceLines,
            recurrenceId: preservedRecurrenceId,
            recurringEventId: preservedRecurringEventId,
            recurrenceIdRange: preservedRecurrenceIdRange,
            alarms: alarmDefinitions,
            eventType: String(selectedEvent?.eventType || 'default'),
            visibility: String(selectedEvent?.visibility || 'default'),
            transparency: String(selectedEvent?.transparency || (formData.isAllDay ? 'transparent' : 'opaque')),
            xProps: isOverrideEdit ? overrideBaseXProps : baseXProps,
            ...(travelDurationBeforeMinutes != null ? { travelDurationBeforeMinutes } : {}),
            ...(travelDurationAfterMinutes != null ? { travelDurationAfterMinutes } : {}),
        };
        const eventData = {
            ...legacyEventData,
            ...extendedEventPatch,
        };
        const isRecurringSeriesEdit = Boolean(formData.id && selectedEvent && masterEvent && masterRrule && !isOverrideEdit);
        const recurrenceReferenceTokenRaw =
            String((selectedEvent as any)?.recurrenceId || '').trim() || String(selectedEvent?.startDate || '').trim();
        const recurrenceReferenceDate = parseRecurrenceDateToken(recurrenceReferenceTokenRaw);
        const recurrenceBoundaryDateOnly = recurrenceReferenceDate ? format(recurrenceReferenceDate, 'yyyy-MM-dd') : '';

        let recurrenceScope: RecurrenceEditScope = 'following';
        if (isRecurringSeriesEdit) {
            recurrenceScope = await requestRecurrenceScope(
                'edit',
                selectedEvent && masterEvent && isOriginalSeriesOccurrence(selectedEvent, masterEvent) ? 'all' : 'following'
            );
            if (recurrenceScope === 'cancel') {
                abortSubmit();
                return;
            }
        }

        const rollbackOptimisticHandlers: Array<() => void> = [];
        const registerOptimistic = (item: CalendarItem) => {
            const rollback = onOptimisticUpsert?.(item);
            if (typeof rollback === 'function') {
                rollbackOptimisticHandlers.push(rollback);
            }
        };
        const rollbackAllOptimistic = () => {
            while (rollbackOptimisticHandlers.length > 0) {
                const rollback = rollbackOptimisticHandlers.pop();
                try {
                    rollback?.();
                } catch (error) {
                    console.error('Unable to rollback optimistic calendar save:', error);
                }
            }
        };

        const nextMemberIds = new Set(selectedFamilyMemberIds);
        const optimisticPertainsTo = Array.from(nextMemberIds).map((memberId) => ({
            id: memberId,
            name: selectedFamilyMembersById.get(memberId)?.name || null,
        }));
        const baseTagMutation = buildTagTxOps(eventId, selectedEvent?.tags || [], nowIso);

        const buildMemberDiffTxOps = (targetEventId: string, previousMemberIds: Set<string>, nextIds: Set<string>) => {
            const txOps: any[] = [];
            for (const memberId of Array.from(previousMemberIds)) {
                if (!nextIds.has(memberId)) {
                    txOps.push(tx.calendarItems[targetEventId].unlink({ pertainsTo: memberId }));
                }
            }
            for (const memberId of Array.from(nextIds)) {
                if (!previousMemberIds.has(memberId)) {
                    txOps.push(tx.calendarItems[targetEventId].link({ pertainsTo: memberId }));
                }
            }
            return txOps;
        };

        if (isRecurringSeriesEdit && recurrenceScope === 'single') {
            if (!masterEvent || !recurrenceReferenceDate) {
                abortSubmit();
                window.alert('Unable to identify this occurrence in the recurrence. Please try again.');
                return;
            }

            const masterExdateTokens = normalizeRecurrenceTokens([
                ...(Array.isArray(masterEvent.exdates) ? masterEvent.exdates.map((entry) => String(entry)) : []),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'EXDATE'),
            ]);
            const masterRdateTokens = normalizeRecurrenceTokens([
                ...(Array.isArray(masterEvent.rdates) ? masterEvent.rdates.map((entry) => String(entry)) : []),
                ...collectRecurrenceLineTokens(masterEvent.recurrenceLines, 'RDATE'),
            ]);
            const referenceToken = masterEvent.isAllDay ? format(recurrenceReferenceDate, 'yyyy-MM-dd') : recurrenceReferenceDate.toISOString();
            const nextMasterExdates = normalizeRecurrenceTokens([...masterExdateTokens, referenceToken]);
            const masterSequenceBase = typeof masterEvent.sequence === 'number' ? masterEvent.sequence : 0;
            const masterXProps =
                masterEvent.xProps && typeof masterEvent.xProps === 'object' && !Array.isArray(masterEvent.xProps)
                    ? { ...(masterEvent.xProps as Record<string, unknown>) }
                    : {};
            const existingMasterExceptionRows = normalizeStoredRecurrenceExceptionRows((masterXProps as any)?.recurrenceExceptionRows);
            const referenceDateOnly = format(recurrenceReferenceDate, 'yyyy-MM-dd');
            if (
                existingMasterExceptionRows.length > 0 &&
                !existingMasterExceptionRows.some((row) =>
                    row.mode === 'date'
                        ? row.date === referenceDateOnly
                        : row.rangeStart.localeCompare(referenceDateOnly) <= 0 && row.rangeEnd.localeCompare(referenceDateOnly) >= 0
                )
            ) {
                existingMasterExceptionRows.push({
                    mode: 'date',
                    date: referenceDateOnly,
                    rangeStart: referenceDateOnly,
                    rangeEnd: referenceDateOnly,
                });
                masterXProps.recurrenceExceptionRows = existingMasterExceptionRows;
            }

            const masterPatch = {
                exdates: nextMasterExdates,
                recurrenceLines: buildRecurrenceLines(masterRrule, masterRdateTokens, nextMasterExdates),
                updatedAt: nowIso,
                dtStamp: nowIso,
                lastModified: nowIso,
                sequence: masterSequenceBase + 1,
                xProps: masterXProps,
            };

            const overrideId = id();
            const overrideXProps = {
                ...(baseXProps || {}),
            } as Record<string, unknown>;
            delete overrideXProps.recurrenceExceptionRows;
            delete overrideXProps.recurrenceRdateRows;
            const overridePatch = {
                ...extendedEventPatch,
                uid: `${String(masterEvent.uid || masterEvent.id)}-${referenceToken}`,
                sequence: 0,
                createdAt: nowIso,
                updatedAt: nowIso,
                dtStamp: nowIso,
                lastModified: nowIso,
                rrule: '',
                rdates: [],
                exdates: [],
                recurrenceLines: [],
                recurrenceId: referenceToken,
                recurringEventId: String(masterEvent.id),
                recurrenceIdRange: '',
                xProps: overrideXProps,
            };
            const overrideData = {
                ...legacyEventData,
                ...overridePatch,
            };
            const overrideTagMutation = buildTagTxOps(overrideId, [], nowIso);

            registerOptimistic({
                ...masterEvent,
                ...masterPatch,
                id: masterEvent.id,
            } as CalendarItem);
            registerOptimistic({
                ...eventData,
                ...overrideData,
                id: overrideId,
                pertainsTo: optimisticPertainsTo,
                tags: overrideTagMutation.optimisticTags,
            } as CalendarItem);
            onClose();

            const txOps: any[] = [
                tx.calendarItems[masterEvent.id].update(masterPatch),
                tx.calendarItems[overrideId].update(overrideData),
                ...overrideTagMutation.txOps,
            ];
            for (const memberId of Array.from(nextMemberIds)) {
                txOps.push(tx.calendarItems[overrideId].link({ pertainsTo: memberId }));
            }

            try {
                await db.transact(
                    appendCalendarHistoryTransactions(txOps, {
                        occurredAt: nowIso,
                        actionType: 'calendar_event_updated',
                        summary: `Updated event "${formData.title || 'Untitled event'}"`,
                        calendarItemId: overrideId,
                        affectedMemberIds: nextMemberIds,
                        title: formData.title || 'Untitled event',
                        beforeSnapshot: buildCalendarHistorySnapshot(selectedEvent),
                        afterSnapshot: buildCalendarHistorySnapshot(overrideData),
                    })
                );
            } catch (error) {
                rollbackAllOptimistic();
                console.error('Unable to save single recurring exception:', error);
                window.alert('Unable to save event. Please try again.');
                abortSubmit();
                return;
            }

            submitLockRef.current = false;
            return;
        }

        if (isRecurringSeriesEdit && recurrenceScope === 'following' && masterEvent && recurrenceReferenceDate) {
            const masterStartDate = parseRecurrenceDateToken(masterEvent.startDate);
            const boundaryTime = masterEvent.isAllDay
                ? parseISO(`${format(recurrenceReferenceDate, 'yyyy-MM-dd')}T00:00:00`).getTime()
                : recurrenceReferenceDate.getTime();
            const masterStartTime = masterStartDate
                ? masterEvent.isAllDay
                    ? parseISO(`${format(masterStartDate, 'yyyy-MM-dd')}T00:00:00`).getTime()
                    : masterStartDate.getTime()
                : Number.NaN;
            const splittingAfterStart = Number.isFinite(masterStartTime) && boundaryTime > masterStartTime;

            if (splittingAfterStart) {
                const partitionedExdates = partitionRecurrenceTokensByBoundary(exdates, recurrenceReferenceDate, masterEvent.isAllDay);
                const partitionedRdates = partitionRecurrenceTokensByBoundary(rdates, recurrenceReferenceDate, masterEvent.isAllDay);
                const splitExceptionRows = splitRecurrenceRowsAtBoundary(storedExceptionRows, recurrenceBoundaryDateOnly);
                const splitRdateRows = splitRecurrenceRowsAtBoundary(storedRdateRows, recurrenceBoundaryDateOnly);
                const cappedMasterRrule = capRruleBeforeOccurrence(masterRrule, recurrenceReferenceDate, masterEvent.isAllDay);
                const masterSequenceBase = typeof masterEvent.sequence === 'number' ? masterEvent.sequence : 0;
                const masterXProps =
                    masterEvent.xProps && typeof masterEvent.xProps === 'object' && !Array.isArray(masterEvent.xProps)
                        ? { ...(masterEvent.xProps as Record<string, unknown>) }
                        : {};
                const oldSeriesXProps = { ...masterXProps };
                const newSeriesXProps = { ...masterXProps };
                if (splitExceptionRows.before.length > 0) {
                    oldSeriesXProps.recurrenceExceptionRows = splitExceptionRows.before;
                } else {
                    delete oldSeriesXProps.recurrenceExceptionRows;
                }
                if (splitExceptionRows.onOrAfter.length > 0) {
                    newSeriesXProps.recurrenceExceptionRows = splitExceptionRows.onOrAfter;
                } else {
                    delete newSeriesXProps.recurrenceExceptionRows;
                }
                if (splitRdateRows.before.length > 0) {
                    oldSeriesXProps.recurrenceRdateRows = splitRdateRows.before;
                } else {
                    delete oldSeriesXProps.recurrenceRdateRows;
                }
                if (splitRdateRows.onOrAfter.length > 0) {
                    newSeriesXProps.recurrenceRdateRows = splitRdateRows.onOrAfter;
                } else {
                    delete newSeriesXProps.recurrenceRdateRows;
                }

                const oldSeriesPatch = {
                    rrule: cappedMasterRrule,
                    rdates: partitionedRdates.before,
                    exdates: partitionedExdates.before,
                    recurrenceLines: buildRecurrenceLines(cappedMasterRrule, partitionedRdates.before, partitionedExdates.before),
                    updatedAt: nowIso,
                    dtStamp: nowIso,
                    lastModified: nowIso,
                    sequence: masterSequenceBase + 1,
                    xProps: oldSeriesXProps,
                };

                const newSeriesId = id();
                const newSeriesPatch = {
                    ...extendedEventPatch,
                    uid: `${String(masterEvent.uid || masterEvent.id)}-split-${newSeriesId}`,
                    sequence: 0,
                    createdAt: nowIso,
                    updatedAt: nowIso,
                    dtStamp: nowIso,
                    lastModified: nowIso,
                    rrule: normalizedRrule,
                    rdates: partitionedRdates.onOrAfter,
                    exdates: partitionedExdates.onOrAfter,
                    recurrenceLines: buildRecurrenceLines(normalizedRrule, partitionedRdates.onOrAfter, partitionedExdates.onOrAfter),
                    recurrenceId: '',
                    recurringEventId: '',
                    recurrenceIdRange: '',
                    xProps: newSeriesXProps,
                };
                const newSeriesData = {
                    ...legacyEventData,
                    ...newSeriesPatch,
                };
                const newSeriesTagMutation = buildTagTxOps(newSeriesId, [], nowIso);

                registerOptimistic({
                    ...masterEvent,
                    ...oldSeriesPatch,
                    id: masterEvent.id,
                } as CalendarItem);
                registerOptimistic({
                    ...eventData,
                    ...newSeriesData,
                    id: newSeriesId,
                    pertainsTo: optimisticPertainsTo,
                    tags: newSeriesTagMutation.optimisticTags,
                } as CalendarItem);
                onClose();

                const txOps: any[] = [
                    tx.calendarItems[masterEvent.id].update(oldSeriesPatch),
                    tx.calendarItems[newSeriesId].update(newSeriesData),
                    ...newSeriesTagMutation.txOps,
                ];
                for (const memberId of Array.from(nextMemberIds)) {
                    txOps.push(tx.calendarItems[newSeriesId].link({ pertainsTo: memberId }));
                }

                try {
                    await db.transact(
                        appendCalendarHistoryTransactions(txOps, {
                            occurredAt: nowIso,
                            actionType: 'calendar_event_updated',
                            summary: `Updated following events for "${formData.title || 'Untitled event'}"`,
                            calendarItemId: newSeriesId,
                            affectedMemberIds: nextMemberIds,
                            title: formData.title || 'Untitled event',
                            beforeSnapshot: buildCalendarHistorySnapshot(selectedEvent),
                            afterSnapshot: buildCalendarHistorySnapshot(newSeriesData),
                        })
                    );
                } catch (error) {
                    rollbackAllOptimistic();
                    console.error('Unable to split recurring event series:', error);
                    window.alert('Unable to save event. Please try again.');
                    abortSubmit();
                    return;
                }

                submitLockRef.current = false;
                return;
            }
        }

        const previousMemberIds = new Set((selectedEvent?.pertainsTo || []).map((member) => member.id));
        const buildTxOps = (payload: Record<string, any>) => {
            const txOps: any[] = [tx.calendarItems[eventId].update(payload)];
            return appendCalendarHistoryTransactions(
                [...txOps, ...buildMemberDiffTxOps(eventId, previousMemberIds, nextMemberIds), ...baseTagMutation.txOps],
                {
                    occurredAt: nowIso,
                    actionType: selectedEvent ? 'calendar_event_updated' : 'calendar_event_created',
                    summary: `${selectedEvent ? 'Updated' : 'Created'} event "${formData.title || 'Untitled event'}"`,
                    calendarItemId: eventId,
                    affectedMemberIds: nextMemberIds,
                    title: formData.title || 'Untitled event',
                    beforeSnapshot: buildCalendarHistorySnapshot(selectedEvent),
                    afterSnapshot: buildCalendarHistorySnapshot(payload),
                }
            );
        };

        registerOptimistic({
            id: eventId,
            ...eventData,
            pertainsTo: optimisticPertainsTo,
            tags: baseTagMutation.optimisticTags,
        } as CalendarItem);
        onClose();

        try {
            await db.transact(buildTxOps(eventData));
        } catch (error) {
            rollbackAllOptimistic();
            console.error('Unable to save event:', error);
            window.alert('Unable to save event. Please try again.');
            abortSubmit();
            return;
        }
        submitLockRef.current = false;
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <RecurrenceScopeDialog
                open={recurrenceScopeDialogOpen}
                action={recurrenceScopeDialogAction}
                scopeMode={recurrenceScopeDialogMode}
                onSelect={resolveRecurrenceScope}
            />
            <div>
                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                    <p className="text-base font-semibold text-slate-900">{formData.title.trim() || 'Untitled event'}</p>
                    <div className="mt-2 space-y-1">
                        {summaryLines.map((line) => (
                            <p key={line} className="text-sm text-slate-600">
                                {line}
                            </p>
                        ))}
                    </div>
                </div>
                <Label htmlFor="title">Title</Label>
                <Input
                    ref={titleInputRef}
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    required
                    disabled={detailsReadOnly || isSubmitting}
                />
            </div>
            <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    disabled={detailsReadOnly || isSubmitting}
                />
            </div>
            {isImportedEvent ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    Apple-synced events are fully editable here for now, including delete. Those changes stay local to Family Organizer until a future Apple sync rewrites them.
                </div>
            ) : null}
            <EventTagsEditor
                selectedTags={selectedTags}
                tagDraft={tagDraft}
                tagSuggestions={tagSuggestions}
                disabled={!canEditImportedTags}
                onTagDraftInput={handleTagDraftInput}
                onAddTagDraft={handleAddTagDraft}
                onRemoveTag={handleRemoveTag}
                onAddTags={addTags}
            />
            <fieldset disabled={detailsReadOnly || isSubmitting} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <Label htmlFor="status">Status</Label>
                    <select
                        id="status"
                        name="status"
                        value={formData.status}
                        onChange={handleChange}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="confirmed">Confirmed</option>
                        <option value="tentative">Tentative</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
                <div>
                    <Label htmlFor="timeZone">Time Zone</Label>
                    <Input id="timeZone" name="timeZone" value={formData.timeZone} onChange={handleChange} placeholder="America/New_York" />
                </div>
            </div>
            <div>
                <Label htmlFor="location">Location</Label>
                <Input id="location" name="location" value={formData.location} onChange={handleChange} placeholder="Address, room, or meeting URL" />
            </div>
            <div className="flex items-center space-x-2">
                <Switch id="isAllDay" checked={formData.isAllDay} onCheckedChange={handleAllDayToggle} />
                <Label htmlFor="isAllDay">All-day event</Label>
            </div>
            <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input type="date" id="startDate" name="startDate" value={formData.startDate} onChange={handleChange} required />
            </div>
            {!formData.isAllDay && (
                <div>
                    <Label htmlFor="startTime">Start Time</Label>
                    <Input type="time" id="startTime" name="startTime" value={formData.startTime} onChange={handleChange} required />
                </div>
            )}
            <div>
                <Label htmlFor="endDate">{formData.isAllDay ? 'End Date' : 'End Date (for multi-day support)'}</Label>
                <Input type="date" id="endDate" name="endDate" value={formData.endDate} onChange={handleChange} min={formData.startDate} required />
            </div>
            {!formData.isAllDay && (
                <div>
                    <Label htmlFor="endTime">End Time</Label>
                    <Input type="time" id="endTime" name="endTime" value={formData.endTime} onChange={handleChange} min={formData.startTime} required />
                </div>
            )}
            <EventRecurrenceEditor
                recurrenceUi={recurrenceUi}
                setRecurrenceUi={setRecurrenceUi}
                startDate={formData.startDate}
                recurrenceSummaryText={recurrenceSummaryText}
                repeatEndSummaryText={repeatEndSummaryText}
                rdatesEnabled={rdatesEnabled}
                rdatesSummaryText={rdatesSummaryText}
                recurrenceRdates={recurrenceRdates}
                setRecurrenceRdates={setRecurrenceRdates}
                exceptionsEnabled={exceptionsEnabled}
                exceptionsSummaryText={exceptionsSummaryText}
                recurrenceExceptions={recurrenceExceptions}
                setRecurrenceExceptions={setRecurrenceExceptions}
                onToggleRdates={toggleRdatesWidget}
                onToggleExceptions={toggleExceptionsWidget}
                onAddRdateRow={addRdateRow}
                onRemoveRdateRow={removeRdateRow}
                onAddExceptionRow={addExceptionRow}
                onRemoveExceptionRow={removeExceptionRow}
            />
            {/* hidden inputs consumed by handleSubmit */}
            <input type="hidden" name="rrule" value={serializeRecurrenceToRrule(recurrenceUi, formData.startDate || format(new Date(), 'yyyy-MM-dd'))} />
            <input type="hidden" name="rdatesCsv" value={recurrenceUi.mode !== 'never' && rdatesEnabled ? expandedRdates.join(', ') : ''} />
            <input type="hidden" name="exdatesCsv" value={recurrenceUi.mode !== 'never' && exceptionsEnabled ? expandedExceptionDates.join(', ') : ''} />
            <input type="hidden" name="recurrenceId" value={formData.recurrenceId} />
            <input type="hidden" name="recurringEventId" value={formData.recurringEventId} />
            <input type="hidden" name="recurrenceIdRange" value={formData.recurrenceIdRange} />
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Label>Recurrence Sync Metadata</Label>
                    <p className="text-xs text-muted-foreground">Optional advanced fields for recurrence exceptions and sync.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <Label htmlFor="recurrenceId">RECURRENCE-ID</Label>
                        <Input
                            id="recurrenceId"
                            name="recurrenceId"
                            value={formData.recurrenceId}
                            onChange={handleChange}
                            placeholder="2026-04-08T09:00:00Z"
                        />
                    </div>
                    <div>
                        <Label htmlFor="recurrenceIdRange">RECURRENCE-ID RANGE</Label>
                        <Input
                            id="recurrenceIdRange"
                            name="recurrenceIdRange"
                            value={formData.recurrenceIdRange}
                            onChange={handleChange}
                            placeholder="THISANDFUTURE"
                        />
                    </div>
                </div>
                <div>
                    <Label htmlFor="recurringEventId">Recurring Event ID (parent/master)</Label>
                    <Input
                        id="recurringEventId"
                        name="recurringEventId"
                        value={formData.recurringEventId}
                        onChange={handleChange}
                        placeholder="Master event id for recurrence exception rows"
                    />
                </div>
            </div>
            <EventAlarmFields
                travelDurationBeforeMinutes={formData.travelDurationBeforeMinutes}
                travelDurationAfterMinutes={formData.travelDurationAfterMinutes}
                alarmEnabled={formData.alarmEnabled}
                alarmAction={formData.alarmAction}
                alarmTriggerMode={formData.alarmTriggerMode}
                alarmTriggerMinutesBefore={formData.alarmTriggerMinutesBefore}
                alarmTriggerAt={formData.alarmTriggerAt}
                alarmRepeatCount={formData.alarmRepeatCount}
                alarmRepeatDurationMinutes={formData.alarmRepeatDurationMinutes}
                alarmRepeatUntilAcknowledged={formData.alarmRepeatUntilAcknowledged}
                onChange={handleChange}
                onBooleanChange={handleBooleanFieldChange}
            />
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Label>Pertains To</Label>
                    <p className="text-xs text-muted-foreground">Leave unselected to apply to everyone</p>
                </div>
                {eventMetaQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">Loading family members...</p>
                ) : eventMetaQuery.error ? (
                    <p className="text-xs text-destructive">Could not load family members.</p>
                ) : familyMembers.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No family members available yet.</p>
                ) : (
                    <div
                        ref={memberGridRef}
                        className={`grid max-h-44 grid-cols-1 gap-2 overflow-y-auto pr-1 ${useThreeColumnMemberGrid ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
                    >
                        {familyMembers.map((member) => {
                            const isChecked = selectedFamilyMemberIds.includes(member.id);
                            return (
                                <label
                                    key={member.id}
                                    htmlFor={`event-member-${member.id}`}
                                    className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                                        isChecked ? 'border-primary/40 bg-primary/10' : 'border-slate-200 bg-white hover:bg-slate-100'
                                    }`}
                                >
                                    <Checkbox
                                        id={`event-member-${member.id}`}
                                        checked={isChecked}
                                        onCheckedChange={(checked) => handleFamilyMemberToggle(member.id, checked)}
                                    />
                                    <span className="min-w-0 truncate">{member.name || 'Unnamed member'}</span>
                                </label>
                            );
                        })}
                    </div>
                )}

            <div className="flex flex-wrap gap-2">
                {selectedFamilyMemberIds.length === 0 ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
                            Everyone
                        </span>
                    ) : (
                        selectedFamilyMemberIds.map((memberId) => (
                            <span key={memberId} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                                {selectedFamilyMembersById.get(memberId)?.name || 'Unknown member'}
                            </span>
                        ))
                    )}
                </div>
            </div>
            </fieldset>
            <div className="flex items-center justify-between gap-3">
                <div>
                    {selectedEvent ? (
                        <Button type="button" variant="destructive" onClick={() => void handleDeleteClick()} disabled={isSubmitting}>
                            Delete Event
                        </Button>
                    ) : null}
                </div>
                <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Saving...' : formData.id ? 'Update' : 'Add'} Event
                    </Button>
                </div>
            </div>
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Event?</AlertDialogTitle>
                        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => {
                                setDeleteConfirmOpen(false);
                                void handleDeleteByScope('single');
                            }}
                            disabled={isSubmitting}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </form>
    );
};

export default AddEventForm;
