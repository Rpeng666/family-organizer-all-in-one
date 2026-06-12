import { RRule } from 'rrule';

export function toUTCDate(date: Date | string | number): Date {
    const d = new Date(date);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Convert a local date to UTC midnight using the LOCAL date components.
 * Use this to represent "today in the user's timezone" as a UTC date.
 *
 * Example: In Kathmandu (UTC+5:45) at midnight March 2 local time,
 * new Date() is March 1 ~18:15 UTC, but this returns March 2 00:00 UTC.
 */
export function localDateToUTC(date: Date): Date {
    return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function createRRuleWithStartDate(rruleString: string | null | undefined, startDateString: string | Date): RRule | null {
    if (!rruleString) return null;

    const startDate = toUTCDate(startDateString);
    const cleanRruleString = rruleString.replace(/^RRULE:/, '');

    try {
        const rruleOptions = RRule.parseString(cleanRruleString);
        return new RRule({
            ...rruleOptions,
            dtstart: startDate,
        });
    } catch {
        return null;
    }
}

