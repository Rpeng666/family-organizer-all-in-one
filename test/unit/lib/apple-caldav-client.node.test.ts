import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('apple caldav client', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="utf-8"?>
                <d:multistatus xmlns:d="DAV:">
                  <d:response>
                    <d:href>/</d:href>
                    <d:propstat>
                      <d:prop>
                        <d:current-user-principal><d:href>/12345/principal/</d:href></d:current-user-principal>
                      </d:prop>
                      <d:status>HTTP/1.1 200 OK</d:status>
                    </d:propstat>
                  </d:response>
                </d:multistatus>`, { status: 207 }))
            .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="utf-8"?>
                <d:multistatus xmlns:d="DAV:" xmlns:cd="urn:ietf:params:xml:ns:caldav">
                  <d:response>
                    <d:href>/12345/principal/</d:href>
                    <d:propstat>
                      <d:prop>
                        <cd:calendar-home-set><d:href>/12345/calendars/</d:href></cd:calendar-home-set>
                      </d:prop>
                      <d:status>HTTP/1.1 200 OK</d:status>
                    </d:propstat>
                  </d:response>
                </d:multistatus>`, { status: 207 }))
            .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="utf-8"?>
                <d:multistatus xmlns:d="DAV:" xmlns:cd="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
                  <d:response>
                    <d:href>/12345/calendars/home/</d:href>
                    <d:propstat>
                      <d:prop>
                        <d:displayname>Home</d:displayname>
                        <d:resourcetype><d:collection /><cd:calendar /></d:resourcetype>
                        <cs:getctag>tag-1</cs:getctag>
                        <d:sync-token>sync-1</d:sync-token>
                      </d:prop>
                      <d:status>HTTP/1.1 200 OK</d:status>
                    </d:propstat>
                  </d:response>
                </d:multistatus>`, { status: 207 }))
        );
    });

    it('reads principal and calendar-home hrefs from the prop payloads', async () => {
        const { discoverAppleCalendars } = await import('@/lib/apple-caldav/client');
        const result = await discoverAppleCalendars({ username: 'parent@example.com', password: 'app-password' });

        expect(result.principalUrl).toContain('/12345/principal/');
        expect(result.calendarHomeUrl).toContain('/12345/calendars/');
        expect(result.calendars[0].remoteCalendarId).toBe('home');
        expect(result.calendars[0].displayName).toBe('Home');
    });

    it('filters out warning-suffixed ghost calendars from discovery results', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="utf-8"?>
                <d:multistatus xmlns:d="DAV:" xmlns:cd="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
                  <d:response>
                    <d:href>/12345/calendars/fam/</d:href>
                    <d:propstat>
                      <d:prop>
                        <d:displayname>Fam</d:displayname>
                        <d:resourcetype><d:collection /><cd:calendar /></d:resourcetype>
                        <cs:getctag>tag-fam</cs:getctag>
                        <d:sync-token>sync-fam</d:sync-token>
                      </d:prop>
                      <d:status>HTTP/1.1 200 OK</d:status>
                    </d:propstat>
                  </d:response>
                  <d:response>
                    <d:href>/12345/calendars/family-warning/</d:href>
                    <d:propstat>
                      <d:prop>
                        <d:displayname>Family ⚠️</d:displayname>
                        <d:resourcetype><d:collection /><cd:calendar /></d:resourcetype>
                        <cs:getctag>tag-warning</cs:getctag>
                        <d:sync-token>sync-warning</d:sync-token>
                      </d:prop>
                      <d:status>HTTP/1.1 200 OK</d:status>
                    </d:propstat>
                  </d:response>
                </d:multistatus>`, { status: 207 }));
        vi.stubGlobal('fetch', fetchMock);

        const { discoverAppleCalendars } = await import('@/lib/apple-caldav/client');
        const result = await discoverAppleCalendars({
            username: 'parent@example.com',
            password: 'app-password',
            principalUrl: 'https://caldav.icloud.com/12345/principal/',
            calendarHomeUrl: 'https://caldav.icloud.com/12345/calendars/',
        });

        expect(result.calendars.map((calendar) => calendar.displayName)).toEqual(['Fam']);
    });

    it('reuses a cached calendar-home URL for lightweight metadata refreshes', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="utf-8"?>
            <d:multistatus xmlns:d="DAV:" xmlns:cd="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
              <d:response>
                <d:href>/12345/calendars/home/</d:href>
                <d:propstat>
                  <d:prop>
                    <d:displayname>Home</d:displayname>
                    <d:resourcetype><d:collection /><cd:calendar /></d:resourcetype>
                    <cs:getctag>tag-2</cs:getctag>
                    <d:sync-token>sync-2</d:sync-token>
                  </d:prop>
                  <d:status>HTTP/1.1 200 OK</d:status>
                </d:propstat>
              </d:response>
            </d:multistatus>`, { status: 207 }));
        vi.stubGlobal('fetch', fetchMock);

        const { discoverAppleCalendars } = await import('@/lib/apple-caldav/client');
        const result = await discoverAppleCalendars({
            username: 'parent@example.com',
            password: 'app-password',
            principalUrl: 'https://caldav.icloud.com/12345/principal/',
            calendarHomeUrl: 'https://caldav.icloud.com/12345/calendars/',
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.principalUrl).toBe('https://caldav.icloud.com/12345/principal/');
        expect(result.calendarHomeUrl).toBe('https://caldav.icloud.com/12345/calendars/');
        expect(result.calendars[0].remoteCalendarId).toBe('home');
    });

    it('reads calendar collection metadata for ctag/sync-token sanity checks', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="utf-8"?>
            <d:multistatus xmlns:d="DAV:" xmlns:cd="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
              <d:response>
                <d:href>/12345/calendars/home/</d:href>
                <d:propstat>
                  <d:prop>
                    <d:displayname>Home</d:displayname>
                    <cs:getctag>tag-2</cs:getctag>
                    <d:sync-token>sync-2</d:sync-token>
                  </d:prop>
                  <d:status>HTTP/1.1 200 OK</d:status>
                </d:propstat>
              </d:response>
            </d:multistatus>`, { status: 207 })));

        const { fetchCalendarCollectionMetadata } = await import('@/lib/apple-caldav/client');
        const result = await fetchCalendarCollectionMetadata({
            username: 'parent@example.com',
            password: 'app-password',
            calendarUrl: 'https://caldav.icloud.com/12345/calendars/home/',
        });

        expect(result.displayName).toBe('Home');
        expect(result.ctag).toBe('tag-2');
        expect(result.syncToken).toBe('sync-2');
    });

    it('parses sync-token deltas and deleted hrefs from sync-collection responses', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="utf-8"?>
            <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
              <d:response>
                <d:href>/12345/calendars/home/event.ics</d:href>
                <d:propstat>
                  <d:prop>
                    <d:getetag>"etag-1"</d:getetag>
                    <c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
DTSTART:20260310T120000Z
DTEND:20260310T130000Z
SUMMARY:Test
END:VEVENT
END:VCALENDAR</c:calendar-data>
                  </d:prop>
                  <d:status>HTTP/1.1 200 OK</d:status>
                </d:propstat>
              </d:response>
              <d:response>
                <d:href>/12345/calendars/home/deleted.ics</d:href>
                <d:status>HTTP/1.1 404 Not Found</d:status>
              </d:response>
              <d:sync-token>sync-2</d:sync-token>
            </d:multistatus>`, { status: 207 })));

        const { fetchCalendarEvents } = await import('@/lib/apple-caldav/client');
        const result = await fetchCalendarEvents({
            username: 'parent@example.com',
            password: 'app-password',
            calendarUrl: 'https://caldav.icloud.com/12345/calendars/home/',
            rangeStartIso: '2026-03-01T00:00:00.000Z',
            rangeEndIso: '2026-03-31T23:59:59.999Z',
            syncToken: 'sync-1',
        });

        expect(result.mode).toBe('incremental');
        expect(result.events).toHaveLength(1);
        expect(result.events[0].href).toBe('https://caldav.icloud.com/12345/calendars/home/event.ics');
        expect(result.deletedHrefs).toEqual([
            'https://caldav.icloud.com/12345/calendars/home/deleted.ics',
        ]);
        expect(result.nextSyncToken).toBe('sync-2');
    });

    it('falls back to calendar-multiget when sync-collection returns changed hrefs without calendar-data', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="utf-8"?>
                <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
                  <d:response>
                    <d:href>/12345/calendars/home/event.ics</d:href>
                    <d:propstat>
                      <d:prop>
                        <d:getetag>"etag-1"</d:getetag>
                      </d:prop>
                      <d:status>HTTP/1.1 200 OK</d:status>
                    </d:propstat>
                  </d:response>
                  <d:sync-token>sync-2</d:sync-token>
                </d:multistatus>`, { status: 207 }))
            .mockResolvedValueOnce(new Response(`<?xml version="1.0" encoding="utf-8"?>
                <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
                  <d:response>
                    <d:href>/12345/calendars/home/event.ics</d:href>
                    <d:propstat>
                      <d:prop>
                        <d:getetag>"etag-1"</d:getetag>
                        <c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
UID:test-1
DTSTART:20260310T120000Z
DTEND:20260310T130000Z
SUMMARY:Test
END:VEVENT
END:VCALENDAR</c:calendar-data>
                      </d:prop>
                      <d:status>HTTP/1.1 200 OK</d:status>
                    </d:propstat>
                  </d:response>
                </d:multistatus>`, { status: 207 }));
        vi.stubGlobal('fetch', fetchMock);

        const { fetchCalendarEvents } = await import('@/lib/apple-caldav/client');
        const result = await fetchCalendarEvents({
            username: 'parent@example.com',
            password: 'app-password',
            calendarUrl: 'https://caldav.icloud.com/12345/calendars/home/',
            rangeStartIso: '2026-03-01T00:00:00.000Z',
            rangeEndIso: '2026-03-31T23:59:59.999Z',
            syncToken: 'sync-1',
        });

        expect(result.mode).toBe('incremental');
        expect(result.events).toHaveLength(1);
        expect(result.events[0].href).toBe('https://caldav.icloud.com/12345/calendars/home/event.ics');
        expect(result.nextSyncToken).toBe('sync-2');
        const multigetRequest = fetchMock.mock.calls[1];
        expect(multigetRequest[1]?.body).toContain('<d:href>/12345/calendars/home/event.ics</d:href>');
    });

    it('flags invalid sync tokens so the sync engine can fall back to a full scan', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('invalid sync token', { status: 409 })));

        const { fetchCalendarEvents } = await import('@/lib/apple-caldav/client');

        await expect(fetchCalendarEvents({
            username: 'parent@example.com',
            password: 'app-password',
            calendarUrl: 'https://caldav.icloud.com/12345/calendars/home/',
            rangeStartIso: '2026-03-01T00:00:00.000Z',
            rangeEndIso: '2026-03-31T23:59:59.999Z',
            syncToken: 'stale-token',
        })).rejects.toMatchObject({ code: 'invalid_sync_token' });
    });
});
