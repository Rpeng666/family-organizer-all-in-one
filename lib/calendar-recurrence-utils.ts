import { addDays, addMilliseconds, differenceInCalendarMonths, format, parseISO } from 'date-fns';

export type RecurrenceExceptionMode = 'date' | 'range';

export interface StoredRecurrenceExceptionRow {
    mode: RecurrenceExceptionMode;
    date: string;
    rangeStart: string;
    rangeEnd: string;
}

const RRULE_WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const RRULE_WEEKDAY_TOKEN_PATTERN = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i;

export const normalizeRruleString = (value: string) => String(value || '').trim().replace(/^RRULE:/i, '');

export const parseRecurrenceDateToken = (token: string): Date | null => {
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
};

export const splitDateTokens = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    return [];
};

export const collectRecurrenceLineTokens = (lines: unknown, prefix: 'RDATE' | 'EXDATE'): string[] => {
    if (!Array.isArray(lines)) return [];

    const tokens: string[] = [];
    for (const line of lines) {
        if (typeof line !== 'string') continue;
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (!trimmed.toUpperCase().startsWith(prefix)) continue;

        const separatorIndex = trimmed.indexOf(':');
        if (separatorIndex < 0) continue;

        const valuePart = trimmed.slice(separatorIndex + 1);
        tokens.push(...valuePart.split(',').map((entry) => entry.trim()).filter(Boolean));
    }

    return tokens;
};

const parseDateOnlyToken = (token: string): string | null => {
    const trimmed = token.trim();
    if (!trimmed) return null;

    const hyphenDateMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (hyphenDateMatch) {
        const parsed = parseISO(`${hyphenDateMatch[1]}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : hyphenDateMatch[1];
    }

    const compactDateMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})/);
    if (compactDateMatch) {
        const normalized = `${compactDateMatch[1]}-${compactDateMatch[2]}-${compactDateMatch[3]}`;
        const parsed = parseISO(`${normalized}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? null : normalized;
    }

    const parsed = parseISO(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return format(parsed, 'yyyy-MM-dd');
};

const formatIcsDateTimeUtc = (value: Date) => {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    const hours = String(value.getUTCHours()).padStart(2, '0');
    const minutes = String(value.getUTCMinutes()).padStart(2, '0');
    const seconds = String(value.getUTCSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

export const capRruleBeforeOccurrence = (rruleValue: string, occurrenceStart: Date, isAllDay: boolean) => {
    const normalized = normalizeRruleString(rruleValue);
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
};

export const normalizeRecurrenceTokens = (tokens: string[]) => {
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
};

export const partitionRecurrenceTokensByBoundary = (tokens: string[], boundary: Date, isAllDay: boolean) => {
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
};

export const buildRecurrenceLines = (rrule: string, rdates: string[], exdates: string[]) => {
    const lines: string[] = [];
    if (rrule) lines.push(rrule);
    if (rdates.length > 0) lines.push(`RDATE:${rdates.join(',')}`);
    if (exdates.length > 0) lines.push(`EXDATE:${exdates.join(',')}`);
    return lines;
};

const shiftWeekdayCode = (code: string, deltaDays: number) => {
    const index = RRULE_WEEKDAY_CODES.indexOf(code as (typeof RRULE_WEEKDAY_CODES)[number]);
    if (index < 0) return code;
    const normalizedDelta = ((deltaDays % 7) + 7) % 7;
    return RRULE_WEEKDAY_CODES[(index + normalizedDelta) % RRULE_WEEKDAY_CODES.length];
};

const getOrdinalWithinMonth = (value: Date, preferLast: boolean) => {
    if (preferLast) {
        const nextWeekSameWeekday = addDays(value, 7);
        if (nextWeekSameWeekday.getMonth() !== value.getMonth()) {
            return -1;
        }
    }
    return Math.ceil(value.getDate() / 7);
};

const wrapMonthNumber = (value: number) => ((((value - 1) % 12) + 12) % 12) + 1;

const shiftMonthDayValue = (rawValue: number, dayDelta: number, destinationDate: Date) => {
    if (!Number.isFinite(rawValue)) return rawValue;
    if (rawValue === -1) return destinationDate.getDate();
    return Math.min(31, Math.max(1, Math.trunc(rawValue + dayDelta)));
};

export const shiftRecurrenceTokenByDuration = (token: string, deltaMs: number, preferDateOnly: boolean) => {
    const parsed = parseRecurrenceDateToken(token);
    if (!parsed || deltaMs === 0) return token;

    const shifted = addMilliseconds(parsed, deltaMs);
    if (/^\d{8}$/.test(token.trim())) return format(shifted, 'yyyyMMdd');
    if (/^\d{8}T\d{6}Z$/i.test(token.trim())) return formatIcsDateTimeUtc(shifted);
    if (/^\d{8}T\d{6}$/i.test(token.trim())) return format(shifted, "yyyyMMdd'T'HHmmss");
    if (preferDateOnly || /^\d{4}-\d{2}-\d{2}$/.test(token.trim())) return format(shifted, 'yyyy-MM-dd');
    if (token.includes('T') || token.includes('Z')) return shifted.toISOString();
    return format(shifted, 'yyyy-MM-dd');
};

export const shiftRecurrenceTokenByDays = (token: string, dayDelta: number, preferDateOnly: boolean) =>
    shiftRecurrenceTokenByDuration(token, dayDelta * 24 * 60 * 60 * 1000, preferDateOnly);

export const shiftStoredRecurrenceRowsByDays = (rows: StoredRecurrenceExceptionRow[], dayDelta: number) => {
    if (dayDelta === 0) return rows;
    return rows.map((row) => ({
        ...row,
        date: shiftRecurrenceTokenByDays(row.date, dayDelta, true),
        rangeStart: shiftRecurrenceTokenByDays(row.rangeStart, dayDelta, true),
        rangeEnd: shiftRecurrenceTokenByDays(row.rangeEnd, dayDelta, true),
    }));
};

export const shiftRruleForSeriesMove = (rruleValue: string, sourceStart: Date, destinationStart: Date) => {
    const normalized = normalizeRruleString(rruleValue);
    if (!normalized) return '';

    const rawParts = normalized
        .replace(/^RRULE:/i, '')
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean);
    if (rawParts.length === 0) return normalized;

    const partMap = new Map<string, string>();
    for (const part of rawParts) {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) continue;
        const key = part.slice(0, separatorIndex).trim().toUpperCase();
        const value = part.slice(separatorIndex + 1).trim();
        if (!key || !value) continue;
        partMap.set(key, value);
    }

    const weekdayDelta = destinationStart.getDay() - sourceStart.getDay();
    const dayOfMonthDelta = destinationStart.getDate() - sourceStart.getDate();
    const monthDelta = differenceInCalendarMonths(destinationStart, sourceStart);
    const freq = String(partMap.get('FREQ') || '').toUpperCase();
    const bydayValue = partMap.get('BYDAY');
    const bysetposValue = partMap.get('BYSETPOS');
    const bymonthdayValue = partMap.get('BYMONTHDAY');
    const bymonthValue = partMap.get('BYMONTH');

    if (bydayValue) {
        const tokens = bydayValue.split(',').map((entry) => entry.trim().toUpperCase()).filter(Boolean);
        const parsedTokens = tokens
            .map((token) => {
                const match = token.match(RRULE_WEEKDAY_TOKEN_PATTERN);
                if (!match) return null;
                return { ordinal: match[1] || '', weekday: match[2].toUpperCase() };
            })
            .filter(Boolean) as Array<{ ordinal: string; weekday: string }>;

        if (parsedTokens.length === tokens.length && tokens.length > 0) {
            if ((freq === 'MONTHLY' || freq === 'YEARLY') && (bysetposValue || parsedTokens.some((entry) => entry.ordinal))) {
                const destinationWeekday = RRULE_WEEKDAY_CODES[destinationStart.getDay()];
                if (bysetposValue) {
                    const parsedBysetpos = Number(bysetposValue);
                    const nextOrdinal = getOrdinalWithinMonth(destinationStart, parsedBysetpos === -1);
                    partMap.set('BYDAY', destinationWeekday);
                    partMap.set('BYSETPOS', String(nextOrdinal));
                } else {
                    const sourceOrdinal = Number(parsedTokens[0]?.ordinal || '1');
                    const nextOrdinal = getOrdinalWithinMonth(destinationStart, sourceOrdinal === -1);
                    partMap.set('BYDAY', `${nextOrdinal === -1 ? '-1' : String(nextOrdinal)}${destinationWeekday}`);
                }
            } else if (weekdayDelta !== 0) {
                partMap.set('BYDAY', parsedTokens.map((entry) => `${entry.ordinal}${shiftWeekdayCode(entry.weekday, weekdayDelta)}`).join(','));
            }
        }
    }

    if (bymonthdayValue && (freq === 'MONTHLY' || freq === 'YEARLY')) {
        const shiftedMonthDays = bymonthdayValue
            .split(',')
            .map((entry) => Number(entry.trim()))
            .filter((entry) => Number.isFinite(entry))
            .map((entry) => shiftMonthDayValue(entry, dayOfMonthDelta, destinationStart))
            .filter((entry, index, all) => all.indexOf(entry) === index)
            .sort((left, right) => {
                if (left === -1) return 1;
                if (right === -1) return -1;
                return left - right;
            });
        if (shiftedMonthDays.length > 0) {
            partMap.set('BYMONTHDAY', shiftedMonthDays.join(','));
        }
    }

    if (bymonthValue && monthDelta !== 0) {
        const shiftedMonths = bymonthValue
            .split(',')
            .map((entry) => Number(entry.trim()))
            .filter((entry) => Number.isFinite(entry))
            .map((entry) => wrapMonthNumber(entry + monthDelta))
            .filter((entry, index, all) => all.indexOf(entry) === index)
            .sort((left, right) => left - right);
        if (shiftedMonths.length > 0) {
            partMap.set('BYMONTH', shiftedMonths.join(','));
        }
    }

    const rebuiltParts = rawParts.map((part) => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex < 0) return part;
        const key = part.slice(0, separatorIndex).trim().toUpperCase();
        const nextValue = partMap.get(key);
        return nextValue ? `${key}=${nextValue}` : part;
    });

    return `RRULE:${rebuiltParts.join(';')}`;
};

export const normalizeStoredRecurrenceExceptionRows = (value: unknown): StoredRecurrenceExceptionRow[] => {
    if (!Array.isArray(value)) return [];

    const rows: StoredRecurrenceExceptionRow[] = [];
    for (const row of value) {
        if (!row || typeof row !== 'object') continue;
        const source = row as Record<string, unknown>;
        const mode = String(source.mode || '').toLowerCase();

        if (mode === 'range') {
            const start = parseDateOnlyToken(String(source.rangeStart || source.start || ''));
            const end = parseDateOnlyToken(String(source.rangeEnd || source.end || ''));
            if (!start || !end) continue;
            const [rangeStart, rangeEnd] = start.localeCompare(end) <= 0 ? [start, end] : [end, start];
            rows.push({ mode: 'range', date: rangeStart, rangeStart, rangeEnd });
            continue;
        }

        const date = parseDateOnlyToken(String(source.date || source.rangeStart || source.start || ''));
        if (!date) continue;
        rows.push({ mode: 'date', date, rangeStart: date, rangeEnd: date });
    }

    return rows;
};

export const splitRecurrenceRowsAtBoundary = (rows: StoredRecurrenceExceptionRow[], boundaryDateOnly: string) => {
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

        before.push({ mode: 'range', date: start, rangeStart: start, rangeEnd: dayBeforeBoundary });
        onOrAfter.push({ mode: 'range', date: boundaryDateOnly, rangeStart: boundaryDateOnly, rangeEnd: end });
    }

    return { before, onOrAfter };
};
