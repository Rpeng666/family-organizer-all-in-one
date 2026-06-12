import { describe, expect, it } from 'vitest';

describe('apple caldav ics normalization', () => {
    it('indexes timed events by the event timezone instead of the server local timezone', async () => {
        const { parseCalendarResource } = await import('@/lib/apple-caldav/ics');
        const result = parseCalendarResource({
            accountId: 'acct_1',
            calendarId: 'cal_1',
            calendarName: 'Home',
            href: 'https://example.com/event.ics',
            etag: 'etag-1',
            ics: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:tz-test
DTSTART;TZID=America/New_York:20260310T233000
DTEND;TZID=America/New_York:20260311T003000
SUMMARY:Late night
END:VEVENT
END:VCALENDAR`,
            rangeStart: new Date('2026-03-01T00:00:00.000Z'),
            rangeEnd: new Date('2026-03-31T23:59:59.999Z'),
            fallbackTimeZone: 'UTC',
        });

        expect(result).toHaveLength(1);
        expect(result[0].year).toBe(2026);
        expect(result[0].month).toBe(3);
        expect(result[0].dayOfMonth).toBe(10);
        expect(result[0].timeZone).toBe('America/New_York');
    });

    it('uses a per-import unique uid while preserving the raw Apple uid in xProps', async () => {
        const { parseCalendarResource } = await import('@/lib/apple-caldav/ics');
        const result = parseCalendarResource({
            accountId: 'acct_1',
            calendarId: 'cal_1',
            calendarName: 'Home',
            href: 'https://example.com/event.ics',
            etag: 'etag-1',
            ics: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:shared-apple-uid
DTSTART:20260310T120000Z
DTEND:20260310T130000Z
SUMMARY:Imported event
END:VEVENT
END:VCALENDAR`,
            rangeStart: new Date('2026-03-01T00:00:00.000Z'),
            rangeEnd: new Date('2026-03-31T23:59:59.999Z'),
            fallbackTimeZone: 'UTC',
        });

        expect(result).toHaveLength(1);
        expect(result[0].sourceExternalId).toBe('apple:acct_1:cal_1:shared-apple-uid:single');
        expect(result[0].uid).toBe(result[0].sourceExternalId);
        expect(result[0].xProps?.appleUid).toBe('shared-apple-uid');
    });

    it('imports recurring Apple events as one master row plus detached overrides only', async () => {
        const { parseCalendarResource } = await import('@/lib/apple-caldav/ics');
        const result = parseCalendarResource({
            accountId: 'acct_1',
            calendarId: 'cal_1',
            calendarName: 'Home',
            href: 'https://example.com/weekly.ics',
            etag: 'etag-weekly',
            ics: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:weekly-study
DTSTART:20260310T120000Z
DTEND:20260310T130000Z
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Bible study
END:VEVENT
END:VCALENDAR`,
            rangeStart: new Date('2026-03-01T00:00:00.000Z'),
            rangeEnd: new Date('2026-03-31T23:59:59.999Z'),
            fallbackTimeZone: 'UTC',
        });

        expect(result).toHaveLength(1);
        expect(result[0].sourceExternalId).toBe('apple:acct_1:cal_1:weekly-study:master');
        expect(result[0].rrule).toBe('RRULE:FREQ=WEEKLY;COUNT=3');
        expect(result[0].recurrenceLines).toContain('RRULE:FREQ=WEEKLY;COUNT=3');
        expect(result[0].recurringEventId).toBe('');
        expect(result[0].recurrenceId).toBe('');
    });

    it('imports detached recurring overrides as single-instance rows linked to the recurring master source id', async () => {
        const { parseCalendarResource } = await import('@/lib/apple-caldav/ics');
        const result = parseCalendarResource({
            accountId: 'acct_1',
            calendarId: 'cal_1',
            calendarName: 'Home',
            href: 'https://example.com/weekly-override.ics',
            etag: 'etag-weekly-override',
            ics: `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:weekly-study
DTSTART:20260310T120000Z
DTEND:20260310T130000Z
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Bible study
END:VEVENT
BEGIN:VEVENT
UID:weekly-study
RECURRENCE-ID:20260317T120000Z
DTSTART:20260317T150000Z
DTEND:20260317T160000Z
SUMMARY:Bible study moved
END:VEVENT
END:VCALENDAR`,
            rangeStart: new Date('2026-03-01T00:00:00.000Z'),
            rangeEnd: new Date('2026-03-31T23:59:59.999Z'),
            fallbackTimeZone: 'UTC',
        });

        expect(result).toHaveLength(2);
        const master = result.find((entry) => entry.rrule);
        const override = result.find((entry) => entry.recurrenceId);

        expect(master?.sourceExternalId).toBe('apple:acct_1:cal_1:weekly-study:master');
        expect(override?.sourceExternalId).toBe('apple:acct_1:cal_1:weekly-study:2026-03-17T12:00:00Z');
        expect(override?.recurringEventId).toBe('apple:acct_1:cal_1:weekly-study:master');
        expect(override?.rrule).toBe('');
        expect(override?.recurrenceLines).toEqual([]);
        expect(override?.title).toBe('Bible study moved');
    });
});
