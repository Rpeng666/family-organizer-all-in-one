import { describe, expect, it } from 'vitest';

describe('calendar tag helpers', () => {
    it('dedupes tags case-insensitively while preserving known ids', async () => {
        const { dedupeCalendarTagRecords } = await import('@/lib/calendar-tags');
        const existingByKey = new Map([
            ['school', { id: 'tag-school', name: 'School', normalizedName: 'school' }],
        ]);

        expect(
            dedupeCalendarTagRecords(
                [
                    { name: ' school ' },
                    { name: 'SCHOOL' },
                    { id: 'tag-birthday', name: 'Birthday', normalizedName: 'birthday' },
                ],
                existingByKey
            )
        ).toEqual([
            { id: 'tag-school', name: 'School', normalizedName: 'school' },
            { id: 'tag-birthday', name: 'Birthday', normalizedName: 'birthday' },
        ]);
    });

    it('splits comma-separated draft input and keeps the unfinished tail in the input', async () => {
        const { splitCalendarTagDraft } = await import('@/lib/calendar-tags');

        expect(splitCalendarTagDraft('School, Birthday, trav')).toEqual({
            committed: ['School', 'Birthday'],
            remaining: ' trav',
        });

        expect(splitCalendarTagDraft('Travel,\n')).toEqual({
            committed: ['Travel'],
            remaining: '',
        });
    });
});
