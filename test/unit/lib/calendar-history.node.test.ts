import { beforeEach, describe, expect, it } from 'vitest';
import {
    buildCalendarHistoryMetadata,
    buildCalendarHistorySnapshot,
    collapseCalendarHistoryEvents,
    getCalendarHistoryDetail,
    getCalendarHistoryHeadline,
} from '@/lib/calendar-history';
import { freezeTime } from '@/test/utils/fake-clock';

function makeEvent(overrides: Record<string, unknown> = {}) {
    const actionType = String(overrides.actionType || 'calendar_event_moved');
    const title = String(overrides.title || 'School');

    return {
        id: String(overrides.id || 'history-1'),
        domain: 'calendar',
        actionType,
        occurredAt: String(overrides.occurredAt || '2026-03-13T10:00:00.000Z'),
        summary:
            actionType === 'calendar_event_created'
                ? `Created event "${title}"`
                : actionType === 'calendar_event_updated'
                  ? `Updated event "${title}"`
                  : actionType === 'calendar_event_resized'
                    ? `Resized event "${title}"`
                    : actionType === 'calendar_event_deleted'
                      ? `Deleted event "${title}"`
                      : `Moved event "${title}"`,
        calendarItemId: String(overrides.calendarItemId || 'calendar-1'),
        source: String(overrides.source || 'manual'),
        actorFamilyMemberId: String(overrides.actorFamilyMemberId || 'member-1'),
        metadata:
            overrides.metadata ||
            buildCalendarHistoryMetadata({
                title,
                before: buildCalendarHistorySnapshot(
                    (overrides.before as {
                        startDate?: string;
                        endDate?: string;
                        isAllDay?: boolean;
                        timeZone?: string | null;
                    }) || null
                ),
                after: buildCalendarHistorySnapshot(
                    (overrides.after as {
                        startDate?: string;
                        endDate?: string;
                        isAllDay?: boolean;
                        timeZone?: string | null;
                    }) || null
                ),
            }),
        ...overrides,
    } as any;
}

describe('calendar-history helpers', () => {
    beforeEach(() => {
        freezeTime(new Date('2026-03-10T09:15:00.000Z'));
    });

    it('describes same-day timed moves with a time-only diff', () => {
        const detail = getCalendarHistoryDetail(
            makeEvent({
                before: {
                    startDate: '2026-03-13T14:00:00.000Z',
                    endDate: '2026-03-13T15:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
                after: {
                    startDate: '2026-03-13T16:00:00.000Z',
                    endDate: '2026-03-13T17:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
            })
        );

        expect(detail).toBe('From 2 pm to 4 pm');
    });

    it('describes cross-day timed moves with date-only wording when the clock stays the same', () => {
        const detail = getCalendarHistoryDetail(
            makeEvent({
                before: {
                    startDate: '2026-03-13T14:00:00.000Z',
                    endDate: '2026-03-13T16:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
                after: {
                    startDate: '2026-03-14T14:00:00.000Z',
                    endDate: '2026-03-14T16:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
            })
        );

        expect(detail).toBe('From Friday, March 13 to Saturday, March 14');
    });

    it('calls out end-only timing changes explicitly', () => {
        const detail = getCalendarHistoryDetail(
            makeEvent({
                actionType: 'calendar_event_resized',
                before: {
                    startDate: '2026-03-13T13:00:00.000Z',
                    endDate: '2026-03-13T14:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
                after: {
                    startDate: '2026-03-13T13:00:00.000Z',
                    endDate: '2026-03-13T14:15:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
            })
        );

        expect(detail).toBe('End time changed from 2 pm to 2:15 pm');
    });

    it('describes new event schedules with full range context', () => {
        const detail = getCalendarHistoryDetail(
            makeEvent({
                actionType: 'calendar_event_created',
                before: null,
                after: {
                    startDate: '2026-03-13T14:00:00.000Z',
                    endDate: '2026-03-13T16:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
            })
        );

        expect(detail).toBe('Scheduled for Friday, March 13 from 2 pm to 4 pm');
    });

    it('collapses quick create-and-edit bursts into a single visible group', () => {
        const groups = collapseCalendarHistoryEvents([
            makeEvent({
                id: 'history-3',
                actionType: 'calendar_event_moved',
                occurredAt: '2026-03-13T10:04:00.000Z',
                before: {
                    startDate: '2026-03-13T15:00:00.000Z',
                    endDate: '2026-03-13T17:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
                after: {
                    startDate: '2026-03-13T16:00:00.000Z',
                    endDate: '2026-03-13T18:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
            }),
            makeEvent({
                id: 'history-2',
                actionType: 'calendar_event_updated',
                occurredAt: '2026-03-13T10:02:00.000Z',
                before: {
                    startDate: '2026-03-13T14:00:00.000Z',
                    endDate: '2026-03-13T16:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
                after: {
                    startDate: '2026-03-13T15:00:00.000Z',
                    endDate: '2026-03-13T17:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
            }),
            makeEvent({
                id: 'history-1',
                actionType: 'calendar_event_created',
                occurredAt: '2026-03-13T10:00:00.000Z',
                before: null,
                after: {
                    startDate: '2026-03-13T14:00:00.000Z',
                    endDate: '2026-03-13T16:00:00.000Z',
                    isAllDay: false,
                    timeZone: 'UTC',
                },
            }),
        ]);

        expect(groups).toHaveLength(1);
        expect(getCalendarHistoryHeadline(groups[0].events)).toBe('Created event "School"');
        expect(getCalendarHistoryDetail(groups[0].events)).toBe('From 2 pm to 4 pm');
    });

    it('falls back to legacy flat before-and-after metadata for detail rows', () => {
        const detail = getCalendarHistoryDetail(
            makeEvent({
                metadata: {
                    title: 'School',
                    previousStartDate: '2026-03-13T14:50:00.000Z',
                    previousEndDate: '2026-03-13T17:00:00.000Z',
                    nextStartDate: '2026-03-13T19:00:00.000Z',
                    nextEndDate: '2026-03-13T21:10:00.000Z',
                    timeZone: 'UTC',
                },
            })
        );

        expect(detail).toBe('From 2:50 pm to 7 pm');
    });

    it('stops collapsing once the combined edit window exceeds an hour', () => {
        const groups = collapseCalendarHistoryEvents([
            makeEvent({ id: 'history-3', occurredAt: '2026-03-13T11:02:00.000Z' }),
            makeEvent({ id: 'history-2', occurredAt: '2026-03-13T10:04:00.000Z' }),
            makeEvent({ id: 'history-1', occurredAt: '2026-03-13T10:00:00.000Z' }),
        ]);

        expect(groups).toHaveLength(2);
        expect(groups[0].events).toHaveLength(1);
        expect(groups[1].events).toHaveLength(2);
    });
});
