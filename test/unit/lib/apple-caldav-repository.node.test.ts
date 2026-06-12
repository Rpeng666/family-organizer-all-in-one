import { describe, expect, it } from 'vitest';

describe('apple caldav repository helpers', () => {
    it('dedupes discovered calendars by remote id and keeps the best row', async () => {
        const { dedupeCalendarSyncCalendarRows } = await import('@/lib/apple-caldav/repository');
        const rows = dedupeCalendarSyncCalendarRows([
            {
                id: 'old-home',
                remoteCalendarId: 'home',
                displayName: 'Home',
                isEnabled: false,
                updatedAt: '2026-03-10T08:00:00.000Z',
            },
            {
                id: 'new-home',
                remoteCalendarId: 'home',
                displayName: 'Home',
                isEnabled: true,
                remoteUrl: 'https://caldav.icloud.com/home/',
                updatedAt: '2026-03-10T09:00:00.000Z',
            },
            {
                id: 'work',
                remoteCalendarId: 'work',
                displayName: 'Work',
                isEnabled: true,
                updatedAt: '2026-03-10T09:30:00.000Z',
            },
        ]);

        expect(rows).toHaveLength(2);
        expect(rows.find((row) => row.remoteCalendarId === 'home')?.id).toBe('new-home');
        expect(rows.map((row) => row.remoteCalendarId)).toEqual(['home', 'work']);
    });

    it('excludes stale disabled calendars from the desired remote-id set used for cleanup', async () => {
        const desiredRemoteIds = new Set(
            [
                { remoteCalendarId: 'home' },
                { remoteCalendarId: 'family-current' },
            ]
                .map((calendar) => String(calendar?.remoteCalendarId || '').trim())
                .filter(Boolean)
        );

        expect(desiredRemoteIds.has('home')).toBe(true);
        expect(desiredRemoteIds.has('family-current')).toBe(true);
        expect(desiredRemoteIds.has('family-stale')).toBe(false);
    });

    it('chunks large transaction sets into smaller Instant batches', async () => {
        const { chunkForInstantTransact } = await import('@/lib/apple-caldav/repository');
        const batches = chunkForInstantTransact(Array.from({ length: 123 }, (_, index) => index), 50);

        expect(batches).toHaveLength(3);
        expect(batches.map((batch) => batch.length)).toEqual([50, 50, 23]);
    });

    it('only treats imported rows inside the sync window as deletion candidates', async () => {
        const { calendarItemIntersectsWindow } = await import('@/lib/apple-caldav/repository');
        const rangeStart = new Date('2026-03-01T00:00:00.000Z');
        const rangeEnd = new Date('2026-03-31T23:59:59.999Z');

        expect(
            calendarItemIntersectsWindow(
                { startDate: '2026-03-10T13:00:00.000Z', endDate: '2026-03-10T14:00:00.000Z' },
                rangeStart,
                rangeEnd
            )
        ).toBe(true);

        expect(
            calendarItemIntersectsWindow(
                { startDate: '2027-05-10T13:00:00.000Z', endDate: '2027-05-10T14:00:00.000Z' },
                rangeStart,
                rangeEnd
            )
        ).toBe(false);
    });

    it('treats recurring master rows as in-window when they still generate occurrences inside the sync window', async () => {
        const { calendarItemIntersectsWindow } = await import('@/lib/apple-caldav/repository');
        const rangeStart = new Date('2026-03-01T00:00:00.000Z');
        const rangeEnd = new Date('2026-03-31T23:59:59.999Z');

        expect(
            calendarItemIntersectsWindow(
                {
                    startDate: '2026-01-06',
                    endDate: '2026-01-07',
                    isAllDay: true,
                    rrule: 'RRULE:FREQ=WEEKLY;BYDAY=TU',
                },
                rangeStart,
                rangeEnd
            )
        ).toBe(true);
    });

    it('detects stale imported rows when an incremental Apple resource update drops an override', async () => {
        const { listIncrementalStaleImportedItems } = await import('@/lib/apple-caldav/repository');

        const staleItems = listIncrementalStaleImportedItems({
            existingItems: [
                {
                    id: 'evt-master',
                    sourceExternalId: 'apple:acct_1:cal_1:weekly-study:master',
                    sourceRemoteUrl: 'https://caldav.icloud.com/12345/calendars/home/weekly-study.ics',
                    sourceSyncStatus: 'active',
                },
                {
                    id: 'evt-override',
                    sourceExternalId: 'apple:acct_1:cal_1:weekly-study:20260317T120000Z',
                    sourceRemoteUrl: 'https://caldav.icloud.com/12345/calendars/home/weekly-study.ics',
                    sourceSyncStatus: 'active',
                },
            ],
            nextItems: [
                {
                    sourceExternalId: 'apple:acct_1:cal_1:weekly-study:master',
                    sourceRemoteUrl: 'https://caldav.icloud.com/12345/calendars/home/weekly-study.ics',
                },
            ],
        });

        expect(staleItems.map((item) => item.id)).toEqual(['evt-override']);
    });

    it('keeps tagged imported rows soft-deletable during repair passes so local tags can survive a reimport', async () => {
        const { shouldHardDeleteImportedCalendarItem } = await import('@/lib/apple-caldav/repository');

        expect(
            shouldHardDeleteImportedCalendarItem({
                hardDeleteMissingRows: true,
                item: {
                    id: 'evt-untagged',
                    tags: [],
                },
            })
        ).toBe(true);

        expect(
            shouldHardDeleteImportedCalendarItem({
                hardDeleteMissingRows: true,
                item: {
                    id: 'evt-tagged',
                    tags: [{ id: 'tag-school', name: 'School' }],
                },
            })
        ).toBe(false);
    });
});
