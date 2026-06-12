import { addDays, format, parseISO } from 'date-fns';

export type RepeatMode = 'never' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom' | 'rrule';
export type CustomUnit = 'day' | 'week' | 'month' | 'year';
export type MonthPatternMode = 'days' | 'week';
export type RepeatEndMode = 'forever' | 'until' | 'count';
export type WeekdayToken = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'DAY' | 'WEEKDAY' | 'WEEKEND';
export type RecurrenceExceptionMode = 'date' | 'range';

export interface RecurrenceExceptionRow {
    rowId: string;
    mode: RecurrenceExceptionMode;
    date: string;
    rangeStart: string;
    rangeEnd: string;
}

export interface StoredRecurrenceExceptionRow {
    mode: RecurrenceExceptionMode;
    date: string;
    rangeStart: string;
    rangeEnd: string;
}

export interface RecurrenceUiState {
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

export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
export const WEEKDAY_CHIPS = [
    { code: 'SU', label: 'Sunday' },
    { code: 'MO', label: 'Monday' },
    { code: 'TU', label: 'Tuesday' },
    { code: 'WE', label: 'Wednesday' },
    { code: 'TH', label: 'Thursday' },
    { code: 'FR', label: 'Friday' },
    { code: 'SA', label: 'Saturday' },
] as const;
export const MONTH_OPTIONS = [
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
export const MONTH_DAY_CHOICES = [...Array.from({ length: 31 }, (_value, index) => index + 1), -1];

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
const SUPPORTED_RRULE_KEYS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'COUNT', 'UNTIL', 'BYSETPOS']);

export function clampRecurrenceNumber(value: number, min: number, max: number) {
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

export function sortWeekdayCodes(codes: string[]): string[] {
    const order = new Map<string, number>(WEEKDAY_CODES.map((code, index) => [code, index]));
    return Array.from(new Set(codes.filter((code) => WEEKDAY_CODES.includes(code as any)))).sort((left, right) => {
        return (order.get(left) ?? 999) - (order.get(right) ?? 999);
    });
}

export function sortMonthDays(dayValues: number[]): number[] {
    const unique = Array.from(
        new Set(dayValues.map((entry) => Math.trunc(entry)).filter((entry) => entry === -1 || (entry >= 1 && entry <= 31)))
    );
    return unique.sort((left, right) => {
        if (left === -1) return 1;
        if (right === -1) return -1;
        return left - right;
    });
}

export function sortMonthNumbers(monthValues: number[]): number[] {
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

export function getDefaultRecurrenceUiState(startDateValue: string): RecurrenceUiState {
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

export function parseRecurrenceUiStateFromRrule(rrule: string | undefined, startDateValue: string): RecurrenceUiState {
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
        return {
            ...asCustom,
            customUnit: 'week',
            customWeekDays: sortWeekdayCodes(bydayValues.length > 0 ? bydayValues : [weekdayCodeFromDate(startDateValue)]),
        };
    }

    if (freq === 'MONTHLY') {
        if (bymonthValues.length > 0) return { ...next, mode: 'rrule', unsupportedRrule: true };

        if (bymonthdayValues.length > 0 && bydayValues.length === 0) {
            return {
                ...asCustom,
                customUnit: 'month',
                customMonthMode: 'days',
                customMonthDays: sortMonthDays(bymonthdayValues),
            };
        }

        const pattern = decodeWeekPattern(bydayValues, bysetposValue);
        if (!pattern) return { ...next, mode: 'rrule', unsupportedRrule: true };
        return {
            ...asCustom,
            customUnit: 'month',
            customMonthMode: 'week',
            customMonthOrdinal: pattern.ordinal,
            customMonthWeekday: pattern.token,
        };
    }

    if (freq === 'YEARLY') {
        const normalizedMonths = sortMonthNumbers(bymonthValues.length > 0 ? bymonthValues : [monthOfDate(startDateValue)]);
        if (bymonthdayValues.length > 0 && bydayValues.length === 0) {
            return {
                ...asCustom,
                customUnit: 'year',
                customYearMonths: normalizedMonths,
                customYearUseWeekday: false,
            };
        }

        if (bydayValues.length > 0) {
            const pattern = decodeWeekPattern(bydayValues, bysetposValue);
            if (!pattern) return { ...next, mode: 'rrule', unsupportedRrule: true };
            return {
                ...asCustom,
                customUnit: 'year',
                customYearMonths: normalizedMonths,
                customYearUseWeekday: true,
                customYearOrdinal: pattern.ordinal,
                customYearWeekday: pattern.token,
            };
        }

        return {
            ...asCustom,
            customUnit: 'year',
            customYearMonths: normalizedMonths,
        };
    }

    return { ...next, mode: 'rrule', unsupportedRrule: true };
}

export function serializeRecurrenceToRrule(state: RecurrenceUiState, startDateValue: string): string {
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

export function recurrenceSummary(state: RecurrenceUiState, startDateValue: string): string {
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

export function normalizeRrule(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return trimmed.toUpperCase().startsWith('RRULE:') ? trimmed : `RRULE:${trimmed}`;
}

function parseCsvList(value: string): string[] {
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
}

export function parseExdateTokenToDateOnly(token: string): string | null {
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

export function collectRecurrenceLineTokens(lines: unknown, prefix: 'RDATE' | 'EXDATE'): string[] {
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

export function normalizeDateOnlyList(values: string[]): string[] {
    return Array.from(
        new Set(
            values
                .map((entry) => parseExdateTokenToDateOnly(entry))
                .filter(Boolean) as string[]
        )
    ).sort((left, right) => left.localeCompare(right));
}

export function buildDateListFromRows(rows: RecurrenceExceptionRow[]): string[] {
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

export function normalizeStoredRecurrenceExceptionRows(value: unknown): StoredRecurrenceExceptionRow[] {
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

export function serializeRecurrenceExceptionRows(rows: RecurrenceExceptionRow[]): StoredRecurrenceExceptionRow[] {
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

export function parseRecurrenceDateToken(token: string): Date | null {
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

export function capRruleBeforeOccurrence(rruleValue: string, occurrenceStart: Date, isAllDay: boolean): string {
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

export function normalizeRecurrenceTokens(tokens: string[]): string[] {
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

export function buildRecurrenceLines(rrule: string, rdates: string[], exdates: string[]): string[] {
    const lines: string[] = [];
    if (rrule) lines.push(rrule);
    if (rdates.length > 0) lines.push(`RDATE:${rdates.join(',')}`);
    if (exdates.length > 0) lines.push(`EXDATE:${exdates.join(',')}`);
    return lines;
}
