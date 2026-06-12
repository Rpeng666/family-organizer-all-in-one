import { describe, expect, it } from 'vitest';
import {
    buildCalendarAgendaSections,
    buildCalendarOccurrenceKey,
    buildCalendarSearchableText,
    calendarItemMatchesPersistentFilters,
    calendarItemMatchesTextQuery,
    calendarItemMatchesTagExpression,
    calendarItemOverlapsDateRange,
    getClosestCalendarHitMinute,
    normalizeCalendarSearchQuery,
} from '@/lib/calendar-search';

describe('calendar-search helpers', () => {
    it('matches visual tag expressions with AND, OR, and exclude semantics', () => {
        const item = {
            id: 'evt-1',
            title: 'Field trip',
            startDate: '2026-03-15T09:00:00.000Z',
            endDate: '2026-03-15T10:00:00.000Z',
            isAllDay: false,
            tags: [
                { id: 'blue', name: 'Blue' },
                { id: 'green', name: 'Green' },
            ],
        };

        expect(
            calendarItemMatchesTagExpression(item, {
                anyOf: [['blue', 'green'], ['red']],
                exclude: ['yellow'],
            })
        ).toBe(true);
        expect(
            calendarItemMatchesTagExpression(item, {
                anyOf: [['blue', 'red']],
                exclude: [],
            })
        ).toBe(false);
        expect(
            calendarItemMatchesTagExpression(item, {
                anyOf: [['blue']],
                exclude: ['green'],
            })
        ).toBe(false);
    });

    it('treats before, after, and between ranges as inclusive', () => {
        const timedItem = {
            startDate: '2026-03-15T18:30:00',
            endDate: '2026-03-15T19:15:00',
            isAllDay: false,
        };
        const allDayItem = {
            startDate: '2026-03-10',
            endDate: '2026-03-13',
            isAllDay: true,
        };

        expect(calendarItemOverlapsDateRange(timedItem, { mode: 'before', startDate: '', endDate: '2026-03-15' })).toBe(true);
        expect(calendarItemOverlapsDateRange(timedItem, { mode: 'after', startDate: '2026-03-15', endDate: '' })).toBe(true);
        expect(calendarItemOverlapsDateRange(allDayItem, { mode: 'between', startDate: '2026-03-12', endDate: '2026-03-12' })).toBe(true);
        expect(calendarItemOverlapsDateRange(allDayItem, { mode: 'between', startDate: '2026-03-13', endDate: '2026-03-14' })).toBe(false);
    });

    it('builds searchable text from title, description, location, and tags', () => {
        const item = {
            title: 'School Pickup',
            description: 'Bring the science project',
            location: 'North gate',
            tags: [{ name: 'School' }, { name: 'Urgent' }],
        };

        expect(buildCalendarSearchableText(item)).toContain('school pickup');
        expect(buildCalendarSearchableText(item)).toContain('science project');
        expect(buildCalendarSearchableText(item)).toContain('north gate');
        expect(buildCalendarSearchableText(item)).toContain('urgent');
    });

    it('normalizes common punctuation variants for search matching', () => {
        const item = {
            title: 'Judah’s school pickup - Nepal',
            description: 'Don’t forget the passport',
            location: 'Mandy’s list',
            tags: [{ name: 'Travel' }],
        };

        expect(normalizeCalendarSearchQuery("Judah's school pickup - Nepal")).toBe(
            normalizeCalendarSearchQuery('Judah’s school pickup - Nepal')
        );
        expect(normalizeCalendarSearchQuery("Don't")).toBe(normalizeCalendarSearchQuery('Don’t'));
        expect(calendarItemMatchesTextQuery(item, "Judah's school pickup")).toBe(true);
        expect(calendarItemMatchesTextQuery(item, "Mandy's list")).toBe(true);
    });

    it('applies saved-search and exclusion filters together', () => {
        const baseFilters = {
            textQuery: '',
            dateRange: { mode: 'any' as const, startDate: '', endDate: '' },
            tagExpression: { anyOf: [], exclude: ['tag-school'] },
            savedSearches: [{ id: 'search-nepal', query: 'Nepal', label: 'Nepal' }],
            selectedSavedSearchIds: ['search-nepal'],
            excludedMemberIds: ['member-mandy'],
            excludedSavedSearchIds: [],
        };

        expect(
            calendarItemMatchesPersistentFilters(
                {
                    title: 'Nepal planning',
                    startDate: '2026-03-15T09:00:00.000Z',
                    endDate: '2026-03-15T10:00:00.000Z',
                    isAllDay: false,
                    pertainsTo: [{ id: 'member-judah' }],
                    tags: [{ id: 'tag-travel', name: 'Travel' }],
                },
                baseFilters
            )
        ).toBe(true);

        expect(
            calendarItemMatchesPersistentFilters(
                {
                    title: 'Nepal planning',
                    startDate: '2026-03-15T09:00:00.000Z',
                    endDate: '2026-03-15T10:00:00.000Z',
                    isAllDay: false,
                    pertainsTo: [{ id: 'member-judah' }, { id: 'member-mandy' }],
                    tags: [{ id: 'tag-travel', name: 'Travel' }],
                },
                baseFilters
            )
        ).toBe(false);

        expect(
            calendarItemMatchesPersistentFilters(
                {
                    title: 'Nepal school pickup',
                    startDate: '2026-03-15T09:00:00.000Z',
                    endDate: '2026-03-15T10:00:00.000Z',
                    isAllDay: false,
                    pertainsTo: [{ id: 'member-judah' }],
                    tags: [{ id: 'tag-school', name: 'School' }],
                },
                baseFilters
            )
        ).toBe(false);
    });

    it('groups agenda sections chronologically and filters them by live query', () => {
        const march15 = {
            id: 'evt-15',
            title: 'School pickup',
            startDate: '2026-03-15T14:00:00.000Z',
            endDate: '2026-03-15T14:30:00.000Z',
            isAllDay: false,
            __displayDate: '2026-03-15',
        };
        const march17 = {
            id: 'evt-17',
            title: 'Dentist',
            startDate: '2026-03-17T09:00:00.000Z',
            endDate: '2026-03-17T09:30:00.000Z',
            isAllDay: false,
            __displayDate: '2026-03-17',
        };

        const sections = buildCalendarAgendaSections(
            new Map([
                ['2026-03-17', [march17]],
                ['2026-03-15', [march15]],
            ]),
            { textQuery: 'dent' }
        );

        expect(sections).toHaveLength(1);
        expect(sections[0]?.dateKey).toBe('2026-03-17');
        expect(buildCalendarOccurrenceKey(sections[0]!.items[0]!)).toBe(buildCalendarOccurrenceKey(march17));
    });

    it('returns the closest timed minute for a visible day occurrence', () => {
        const sameDay = {
            startDate: '2026-03-15T18:30:00',
            endDate: '2026-03-15T19:15:00',
            isAllDay: false,
        };
        const overnight = {
            startDate: '2026-03-15T23:30:00',
            endDate: '2026-03-16T01:00:00',
            isAllDay: false,
        };

        expect(getClosestCalendarHitMinute(sameDay, '2026-03-15')).toBe(18 * 60 + 30);
        expect(getClosestCalendarHitMinute(overnight, '2026-03-16')).toBe(0);
    });
});
