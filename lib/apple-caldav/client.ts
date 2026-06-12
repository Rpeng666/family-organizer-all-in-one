import 'server-only';

import { XMLParser } from 'fast-xml-parser';
import { APPLE_CALDAV_BASE_URL } from '@/lib/apple-caldav/config';
import { isIgnoredAppleCalendarDisplayName } from '@/lib/apple-caldav/calendar-filter';

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    removeNSPrefix: true,
    trimValues: true,
});

function asArray(value: any) {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function textOf(value: any): string {
    if (typeof value === 'string') return value.trim();
    if (value && typeof value['#text'] === 'string') return value['#text'].trim();
    return '';
}

function allResponses(multistatus: any) {
    return asArray(multistatus?.response);
}

function propstatsOf(response: any) {
    return asArray(response?.propstat);
}

function getResponseProperty(response: any, propertyName: string) {
    for (const propstat of propstatsOf(response)) {
        const status = textOf(propstat?.status);
        if (status && !status.includes(' 200 ')) continue;
        const prop = propstat?.prop || {};
        if (prop[propertyName] != null) {
            return prop[propertyName];
        }
    }
    return undefined;
}

function hrefOf(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (Array.isArray(value)) {
        for (const entry of value) {
            const href = hrefOf(entry);
            if (href) return href;
        }
        return '';
    }
    if (typeof value === 'object') {
        if (value.href != null) return hrefOf(value.href);
        if (value['#text'] != null) return hrefOf(value['#text']);
    }
    return '';
}

function statusesOf(response: any) {
    return [
        textOf(response?.status),
        ...propstatsOf(response).map((propstat: any) => textOf(propstat?.status)),
    ].filter(Boolean);
}

function responseHasStatus(response: any, code: number) {
    return statusesOf(response).some((status) => status.includes(` ${code} `));
}

function syncTokenOf(multistatus: any) {
    return textOf(multistatus?.['sync-token']);
}

async function caldavRequest(url: string, input: {
    method: string;
    username: string;
    password: string;
    body?: string;
    depth?: '0' | '1' | 'infinity';
    headers?: Record<string, string>;
}) {
    const response = await fetch(url, {
        method: input.method,
        headers: {
            Authorization: `Basic ${Buffer.from(`${input.username}:${input.password}`).toString('base64')}`,
            Depth: input.depth || '0',
            'Content-Type': 'application/xml; charset=utf-8',
            Prefer: 'return-minimal',
            ...(input.headers || {}),
        },
        body: input.body,
        redirect: 'follow',
        cache: 'no-store',
    });

    if (!response.ok && response.status !== 207) {
        const body = await response.text().catch(() => '');
        const error = new Error(`CalDAV request failed (${response.status})`);
        (error as any).status = response.status;
        (error as any).body = body.slice(0, 400);
        throw error;
    }

    return response;
}

function buildAbsoluteUrl(baseUrl: string, href: string) {
    try {
        return new URL(href, baseUrl).toString();
    } catch {
        return href;
    }
}

async function getPrincipalUrl(input: { username: string; password: string }) {
    const principalResponse = await caldavRequest(APPLE_CALDAV_BASE_URL, {
        method: 'PROPFIND',
        username: input.username,
        password: input.password,
        depth: '0',
        body: `<?xml version="1.0" encoding="utf-8" ?>
            <d:propfind xmlns:d="DAV:">
              <d:prop>
                <d:current-user-principal />
              </d:prop>
            </d:propfind>`,
    });

    const principalText = await principalResponse.text();
    const principalDoc = xmlParser.parse(principalText);
    const principalEntry = allResponses(principalDoc.multistatus)[0] || {};
    const principalUrl = buildAbsoluteUrl(
        principalResponse.url,
        hrefOf(getResponseProperty(principalEntry, 'current-user-principal'))
    );

    if (!principalUrl) {
        throw new Error('Apple Calendar principal discovery did not return a principal URL');
    }

    return principalUrl;
}

async function getCalendarHomeUrl(input: { username: string; password: string; principalUrl: string }) {
    const homeResponse = await caldavRequest(input.principalUrl, {
        method: 'PROPFIND',
        username: input.username,
        password: input.password,
        depth: '0',
        body: `<?xml version="1.0" encoding="utf-8" ?>
            <d:propfind xmlns:d="DAV:" xmlns:cd="urn:ietf:params:xml:ns:caldav">
              <d:prop>
                <cd:calendar-home-set />
              </d:prop>
            </d:propfind>`,
    });
    const homeText = await homeResponse.text();
    const homeDoc = xmlParser.parse(homeText);
    const homeEntry = allResponses(homeDoc.multistatus)[0] || {};
    const homeUrl = buildAbsoluteUrl(
        homeResponse.url,
        hrefOf(getResponseProperty(homeEntry, 'calendar-home-set'))
    );
    if (!homeUrl) {
        throw new Error('Apple Calendar discovery did not return a calendar home URL');
    }
    return homeUrl;
}

async function listCalendarsAtHome(input: { username: string; password: string; calendarHomeUrl: string }) {
    const calendarsResponse = await caldavRequest(input.calendarHomeUrl, {
        method: 'PROPFIND',
        username: input.username,
        password: input.password,
        depth: '1',
        body: `<?xml version="1.0" encoding="utf-8" ?>
            <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:cd="urn:ietf:params:xml:ns:caldav" xmlns:ical="http://apple.com/ns/ical/">
              <d:prop>
                <d:displayname />
                <cs:getctag />
                <cd:supported-calendar-component-set />
                <cd:calendar-description />
                <cd:calendar-timezone />
                <ical:calendar-color />
                <d:resourcetype />
                <d:sync-token />
              </d:prop>
            </d:propfind>`,
    });
    const calendarsText = await calendarsResponse.text();
    const calendarsDoc = xmlParser.parse(calendarsText);
    const calendars = allResponses(calendarsDoc.multistatus)
        .map((entry) => {
            const resourceType = getResponseProperty(entry, 'resourcetype') || {};
            if (!('calendar' in resourceType)) return null;
            const href = textOf(entry.href);
            return {
                remoteCalendarId: href.replace(/\/+$/, '').split('/').pop() || href,
                remoteUrl: buildAbsoluteUrl(calendarsResponse.url, href),
                displayName: textOf(getResponseProperty(entry, 'displayname')) || 'Apple Calendar',
                color: textOf(getResponseProperty(entry, 'calendar-color')) || '',
                description: textOf(getResponseProperty(entry, 'calendar-description')) || '',
                timeZone: textOf(getResponseProperty(entry, 'calendar-timezone')) || '',
                ctag: textOf(getResponseProperty(entry, 'getctag')) || '',
                syncToken: textOf(getResponseProperty(entry, 'sync-token')) || '',
            };
        })
        .filter(Boolean)
        .filter((calendar: any) => !isIgnoredAppleCalendarDisplayName(calendar.displayName));

    return calendars;
}

export async function fetchCalendarCollectionMetadata(input: {
    username: string;
    password: string;
    calendarUrl: string;
}) {
    const response = await caldavRequest(input.calendarUrl, {
        method: 'PROPFIND',
        username: input.username,
        password: input.password,
        depth: '0',
        body: `<?xml version="1.0" encoding="utf-8" ?>
            <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:cd="urn:ietf:params:xml:ns:caldav" xmlns:ical="http://apple.com/ns/ical/">
              <d:prop>
                <d:displayname />
                <cs:getctag />
                <d:sync-token />
                <cd:calendar-description />
                <cd:calendar-timezone />
                <ical:calendar-color />
              </d:prop>
            </d:propfind>`,
    });
    const text = await response.text();
    const parsed = xmlParser.parse(text);
    const multistatus = parsed.multistatus || {};
    const entry = allResponses(multistatus)[0] || {};

    return {
        remoteUrl: response.url || input.calendarUrl,
        displayName: textOf(getResponseProperty(entry, 'displayname')) || '',
        color: textOf(getResponseProperty(entry, 'calendar-color')) || '',
        description: textOf(getResponseProperty(entry, 'calendar-description')) || '',
        timeZone: textOf(getResponseProperty(entry, 'calendar-timezone')) || '',
        ctag: textOf(getResponseProperty(entry, 'getctag')) || '',
        syncToken: textOf(getResponseProperty(entry, 'sync-token')) || '',
    };
}

async function calendarMultiGet(input: {
    username: string;
    password: string;
    calendarUrl: string;
    hrefs: string[];
}) {
    if (input.hrefs.length === 0) return [];

    const response = await caldavRequest(input.calendarUrl, {
        method: 'REPORT',
        username: input.username,
        password: input.password,
        depth: '1',
        body: `<?xml version="1.0" encoding="utf-8" ?>
            <c:calendar-multiget xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:prop>
                <d:getetag />
                <c:calendar-data />
              </d:prop>
              ${input.hrefs.map((href) => `<d:href>${href}</d:href>`).join('')}
            </c:calendar-multiget>`,
    });

    const body = await response.text();
    const parsed = xmlParser.parse(body);
    const multistatus = parsed.multistatus || {};
    const baseUrl = response.url || input.calendarUrl;

    return allResponses(multistatus)
        .map((entry) => ({
            href: buildAbsoluteUrl(baseUrl, textOf(entry.href)),
            etag: textOf(getResponseProperty(entry, 'getetag')) || '',
            ics: textOf(getResponseProperty(entry, 'calendar-data')) || '',
        }))
        .filter((entry) => entry.href && entry.ics);
}

export async function discoverAppleCalendars(input: {
    username: string;
    password: string;
    principalUrl?: string;
    calendarHomeUrl?: string;
}) {
    if (input.calendarHomeUrl) {
        try {
            const calendars = await listCalendarsAtHome({
                username: input.username,
                password: input.password,
                calendarHomeUrl: input.calendarHomeUrl,
            });
            return {
                principalUrl: input.principalUrl || '',
                calendarHomeUrl: input.calendarHomeUrl,
                calendars,
            };
        } catch (error: any) {
            if (error?.status === 401 || error?.status === 403) {
                throw error;
            }
        }
    }

    let principalUrl = input.principalUrl || '';
    if (principalUrl) {
        try {
            const calendarHomeUrl = await getCalendarHomeUrl({
                username: input.username,
                password: input.password,
                principalUrl,
            });
            const calendars = await listCalendarsAtHome({
                username: input.username,
                password: input.password,
                calendarHomeUrl,
            });
            return {
                principalUrl,
                calendarHomeUrl,
                calendars,
            };
        } catch (error: any) {
            if (error?.status === 401 || error?.status === 403) {
                throw error;
            }
        }
    }

    principalUrl = await getPrincipalUrl(input);
    const calendarHomeUrl = await getCalendarHomeUrl({
        username: input.username,
        password: input.password,
        principalUrl,
    });
    const calendars = await listCalendarsAtHome({
        username: input.username,
        password: input.password,
        calendarHomeUrl,
    });

    return {
        principalUrl,
        calendarHomeUrl,
        calendars,
    };
}

export async function fetchCalendarEvents(input: {
    username: string;
    password: string;
    calendarUrl: string;
    rangeStartIso: string;
    rangeEndIso: string;
    syncToken?: string;
}) {
    if (input.syncToken) {
        try {
            const response = await caldavRequest(input.calendarUrl, {
                method: 'REPORT',
                username: input.username,
                password: input.password,
                depth: '1',
                body: `<?xml version="1.0" encoding="utf-8" ?>
                    <d:sync-collection xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
                      <d:sync-token>${input.syncToken}</d:sync-token>
                      <d:sync-level>1</d:sync-level>
                      <d:prop>
                        <d:getetag />
                        <c:calendar-data />
                      </d:prop>
                    </d:sync-collection>`,
            });
            const body = await response.text();
            const parsed = xmlParser.parse(body);
            const multistatus = parsed.multistatus || {};
            const events = [];
            const deletedHrefs = [];
            const hrefsNeedingMultiget: string[] = [];
            const baseUrl = response.url || input.calendarUrl;

            for (const entry of allResponses(multistatus)) {
                const rawHref = textOf(entry.href);
                const href = buildAbsoluteUrl(baseUrl, rawHref);
                if (!href) continue;
                if (responseHasStatus(entry, 404)) {
                    deletedHrefs.push(href);
                    continue;
                }
                const ics = textOf(getResponseProperty(entry, 'calendar-data')) || '';
                if (!ics) {
                    if (rawHref) {
                        hrefsNeedingMultiget.push(rawHref);
                    }
                    continue;
                }
                events.push({
                    href,
                    etag: textOf(getResponseProperty(entry, 'getetag')) || '',
                    ics,
                });
            }

            if (hrefsNeedingMultiget.length > 0) {
                const multigetEvents = await calendarMultiGet({
                    username: input.username,
                    password: input.password,
                    calendarUrl: input.calendarUrl,
                    hrefs: hrefsNeedingMultiget,
                });
                events.push(...multigetEvents);
            }

            return {
                mode: 'incremental' as const,
                events,
                deletedHrefs,
                nextSyncToken: syncTokenOf(multistatus) || input.syncToken,
            };
        } catch (error: any) {
            if (error?.status === 403 || error?.status === 409) {
                error.code = 'invalid_sync_token';
            }
            throw error;
        }
    }

    const response = await caldavRequest(input.calendarUrl, {
        method: 'REPORT',
        username: input.username,
        password: input.password,
        depth: '1',
        body: `<?xml version="1.0" encoding="utf-8" ?>
            <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:prop>
                <d:getetag />
                <c:calendar-data />
              </d:prop>
              <c:filter>
                <c:comp-filter name="VCALENDAR">
                  <c:comp-filter name="VEVENT">
                    <c:time-range start="${input.rangeStartIso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}" end="${input.rangeEndIso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}" />
                  </c:comp-filter>
                </c:comp-filter>
              </c:filter>
            </c:calendar-query>`,
    });
    const body = await response.text();
    const parsed = xmlParser.parse(body);
    const multistatus = parsed.multistatus || {};
    const baseUrl = response.url || input.calendarUrl;

    return {
        mode: 'full' as const,
        events: allResponses(multistatus).map((entry) => ({
            href: buildAbsoluteUrl(baseUrl, textOf(entry.href)),
            etag: textOf(getResponseProperty(entry, 'getetag')) || '',
            ics: textOf(getResponseProperty(entry, 'calendar-data')) || '',
        })).filter((entry) => entry.ics),
        deletedHrefs: [],
        nextSyncToken: '',
    };
}
