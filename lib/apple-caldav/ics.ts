import 'server-only';

import ICAL from 'ical.js';

function formatYmd(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatYmdUtc(date: Date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function buildIsoLike(value: any) {
    if (!value) return '';
    if (typeof value.toJSDate === 'function') {
        return value.toJSDate().toISOString();
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    return String(value);
}

function recurrenceKey(value: any) {
    if (!value) return '';
    if (typeof value.toString === 'function') return value.toString();
    return buildIsoLike(value);
}

function timeZoneOf(event: any, fallback: string) {
    const startProperty = event?.component?.getFirstProperty?.('dtstart');
    const tzidParameter = typeof startProperty?.getParameter === 'function' ? startProperty.getParameter('tzid') : '';
    const zoneTzid = event?.startDate?.zone?.tzid || '';
    return (zoneTzid && zoneTzid !== 'floating' ? zoneTzid : '') || tzidParameter || event?.component?.getFirstPropertyValue('tzid') || fallback || 'UTC';
}

function toJsDate(value: any) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toJSDate === 'function') return value.toJSDate();
    return null;
}

function dateOnlyPartsOf(value: any) {
    if (!value) return null;
    if (
        typeof value.year === 'number' &&
        typeof value.month === 'number' &&
        typeof value.day === 'number'
    ) {
        return {
            year: value.year,
            month: value.month,
            day: value.day,
        };
    }

    const date = toJsDate(value);
    if (!date) return null;
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
    };
}

function addDaysUtc(parts: { year: number; month: number; day: number }, days: number) {
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    date.setUTCDate(date.getUTCDate() + days);
    return date;
}

function zonedDatePartsOf(date: Date, timeZone: string) {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        const parts = formatter.formatToParts(date);
        const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return {
            year: Number(lookup.year),
            month: Number(lookup.month),
            day: Number(lookup.day),
        };
    } catch {
        return {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
        };
    }
}

function buildParticipant(value: any) {
    if (!value) return null;
    const params = typeof value.getParameter === 'function' ? value : null;
    const raw = typeof value.getFirstValue === 'function' ? value.getFirstValue() : '';
    const address = typeof raw === 'string' ? raw.replace(/^mailto:/i, '') : '';
    return {
        calendarUserAddress: raw || '',
        email: address,
        name: params?.getParameter('cn') || '',
        partstat: params?.getParameter('partstat') || '',
        role: params?.getParameter('role') || '',
        rsvp: params?.getParameter('rsvp') || '',
    };
}

function buildAlarm(alarmComponent: any) {
    if (!alarmComponent) return null;
    return {
        action: alarmComponent.getFirstPropertyValue('action') || '',
        description: alarmComponent.getFirstPropertyValue('description') || '',
        trigger: buildIsoLike(alarmComponent.getFirstPropertyValue('trigger')),
    };
}

function toDateRange(event: any, occurrenceValue: any, timeZone: string) {
    const startValue = toJsDate(occurrenceValue) || event.startDate?.toJSDate?.() || null;
    if (!startValue) return null;
    const durationMs = Math.max(0, (event.endDate?.toJSDate?.()?.getTime?.() || startValue.getTime()) - (event.startDate?.toJSDate?.()?.getTime?.() || startValue.getTime()));
    const endValue = new Date(startValue.getTime() + durationMs);
    const isAllDay = !!event.startDate?.isDate;

    if (isAllDay) {
        const startParts = dateOnlyPartsOf(occurrenceValue || event.startDate);
        if (!startParts) return null;
        const durationDays = Math.max(1, Math.round(durationMs / (24 * 60 * 60 * 1000)) || 1);
        const endDate = addDaysUtc(startParts, durationDays);
        return {
            isAllDay: true,
            startDate: `${startParts.year}-${String(startParts.month).padStart(2, '0')}-${String(startParts.day).padStart(2, '0')}`,
            endDate: formatYmdUtc(endDate),
            year: startParts.year,
            month: startParts.month,
            dayOfMonth: startParts.day,
        };
    }

    const zoned = zonedDatePartsOf(startValue, timeZone || 'UTC');

    return {
        isAllDay: false,
        startDate: startValue.toISOString(),
        endDate: endValue.toISOString(),
        year: zoned.year,
        month: zoned.month,
        dayOfMonth: zoned.day,
    };
}

function eventToNormalized(event: any, options: {
    accountId: string;
    calendarId: string;
    calendarName: string;
    href: string;
    etag: string;
    ctag?: string;
    occurrenceDate?: Date | null;
    fallbackTimeZone?: string;
    sourceExternalId: string;
    recurringEventId?: string;
}) {
    const effectiveTimeZone = timeZoneOf(event, options.fallbackTimeZone || 'UTC');
    const range = toDateRange(event, options.occurrenceDate || null, effectiveTimeZone);
    if (!range) return null;
    const recurrenceIdValue = event.recurrenceId ? recurrenceKey(event.recurrenceId) : '';
    const rrule = event.component.getFirstPropertyValue('rrule');
    const exdateProps = event.component.getAllProperties('exdate') || [];
    const rdateProps = event.component.getAllProperties('rdate') || [];
    const organizerProp = event.component.getFirstProperty('organizer');
    const attendeeProps = event.component.getAllProperties('attendee') || [];
    const alarms = (event.component.getAllSubcomponents('valarm') || []).map(buildAlarm).filter(Boolean);

    const normalizedRrule = rrule ? `RRULE:${rrule.toString()}` : '';
    const exdates = exdateProps.flatMap((prop: any) => (prop.getValues?.() || []).map(recurrenceKey)).filter(Boolean);
    const rdates = rdateProps.flatMap((prop: any) => (prop.getValues?.() || []).map(recurrenceKey)).filter(Boolean);
    const recurrenceLines = [
        ...(normalizedRrule ? [normalizedRrule] : []),
        ...(rdates.length ? [`RDATE:${rdates.join(',')}`] : []),
        ...(exdates.length ? [`EXDATE:${exdates.join(',')}`] : []),
    ];
    return {
        ...range,
        title: event.summary || 'Untitled event',
        description: event.description || '',
        uid: options.sourceExternalId,
        status: String(event.component.getFirstPropertyValue('status') || 'confirmed').toLowerCase(),
        sequence: Number(event.component.getFirstPropertyValue('sequence') || 0),
        dtStamp: buildIsoLike(event.component.getFirstPropertyValue('dtstamp')),
        createdAt: buildIsoLike(event.component.getFirstPropertyValue('created')),
        lastModified: buildIsoLike(event.component.getFirstPropertyValue('last-modified')),
        location: event.location || '',
        url: event.url || '',
        timeZone: effectiveTimeZone,
        organizer: buildParticipant(organizerProp),
        attendees: attendeeProps.map(buildParticipant).filter(Boolean),
        alarms,
        rrule: normalizedRrule,
        rdates,
        exdates,
        recurrenceLines,
        recurrenceId: recurrenceIdValue,
        recurringEventId: options.recurringEventId || '',
        recurrenceIdRange: '',
        eventType: 'default',
        visibility: 'default',
        transparency: event.component.getFirstPropertyValue('transp') === 'TRANSPARENT' ? 'transparent' : range.isAllDay ? 'transparent' : 'opaque',
        xProps: {
            appleUid: event.uid || '',
            categories: event.component.getFirstPropertyValue('categories') || [],
            class: event.component.getFirstPropertyValue('class') || '',
        },
        sourceExternalId: options.sourceExternalId,
        sourceRemoteUrl: options.href,
        sourceRemoteEtag: options.etag,
        sourceRemoteCtag: options.ctag || '',
        sourceCalendarId: options.calendarId,
        sourceCalendarName: options.calendarName,
        sourceAccountKey: options.accountId,
        sourceType: 'apple-caldav',
        sourceSyncStatus: String(event.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED' ? 'cancelled' : 'active',
        sourceReadOnly: true,
    };
}

function buildOccurrenceSourceExternalId(accountId: string, calendarId: string, uid: string, recurrenceId: string) {
    return `apple:${accountId}:${calendarId}:${uid}:${recurrenceId || 'single'}`;
}

function buildMasterSourceExternalId(accountId: string, calendarId: string, uid: string) {
    return `apple:${accountId}:${calendarId}:${uid}:master`;
}

export function parseCalendarResource(input: {
    accountId: string;
    calendarId: string;
    calendarName: string;
    href: string;
    etag: string;
    ctag?: string;
    ics: string;
    rangeStart: Date;
    rangeEnd: Date;
    fallbackTimeZone?: string;
}) {
    const component = new ICAL.Component(ICAL.parse(input.ics));
    const vevents = component.getAllSubcomponents('vevent') || [];
    const grouped = new Map<string, any[]>();

    for (const subcomponent of vevents) {
        const event = new ICAL.Event(subcomponent);
        const uid = event.uid || input.href;
        const list = grouped.get(uid) || [];
        list.push(event);
        grouped.set(uid, list);
    }

    const normalized = [];

    for (const [uid, entries] of Array.from(grouped.entries())) {
        const master = entries.find((event) => !event.recurrenceId) || entries[0];
        const overrides = new Map<string, any>();
        for (const entry of entries) {
            if (!entry.recurrenceId) continue;
            overrides.set(recurrenceKey(entry.recurrenceId), entry);
        }

        if (!master.isRecurring()) {
            const singleSourceKey = buildOccurrenceSourceExternalId(input.accountId, input.calendarId, uid, '');
            const single = eventToNormalized(master, {
                accountId: input.accountId,
                calendarId: input.calendarId,
                calendarName: input.calendarName,
                href: input.href,
                etag: input.etag,
                ctag: input.ctag,
                fallbackTimeZone: input.fallbackTimeZone,
                sourceExternalId: singleSourceKey,
            });
            if (single) normalized.push(single);
            continue;
        }
        const masterSourceExternalId = buildMasterSourceExternalId(input.accountId, input.calendarId, uid);
        const normalizedMaster = eventToNormalized(master, {
            accountId: input.accountId,
            calendarId: input.calendarId,
            calendarName: input.calendarName,
            href: input.href,
            etag: input.etag,
            ctag: input.ctag,
            fallbackTimeZone: input.fallbackTimeZone,
            sourceExternalId: masterSourceExternalId,
        });
        if (normalizedMaster) {
            normalized.push({
                ...normalizedMaster,
                recurrenceId: '',
                recurringEventId: '',
            });
        }

        for (const [key, override] of Array.from(overrides.entries())) {
            const normalizedOverride = eventToNormalized(override, {
                accountId: input.accountId,
                calendarId: input.calendarId,
                calendarName: input.calendarName,
                href: input.href,
                etag: input.etag,
                ctag: input.ctag,
                fallbackTimeZone: input.fallbackTimeZone,
                sourceExternalId: buildOccurrenceSourceExternalId(input.accountId, input.calendarId, uid, key),
                recurringEventId: masterSourceExternalId,
            });
            if (!normalizedOverride) continue;
            normalized.push({
                ...normalizedOverride,
                rrule: '',
                rdates: [],
                exdates: [],
                recurrenceLines: [],
                recurrenceId: key,
            });
        }
    }

    return normalized;
}

export function hashNormalizedEvent(value: Record<string, unknown>) {
    return JSON.stringify(value);
}
