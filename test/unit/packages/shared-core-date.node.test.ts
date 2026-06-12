import { describe, expect, it } from 'vitest';
import { localDateToUTC, toUTCDate } from '@family-organizer/shared-core';

describe('shared-core date helpers', () => {
    describe('toUTCDate', () => {
        it('accepts a Date object and strips to UTC midnight', () => {
            const result = toUTCDate(new Date('2026-03-15T14:30:00Z'));
            expect(result.getTime()).toBe(Date.UTC(2026, 2, 15));
        });

        it('accepts a date string', () => {
            const result = toUTCDate('2026-03-15');
            expect(result.getTime()).toBe(Date.UTC(2026, 2, 15));
        });

        it('accepts a timestamp number', () => {
            const ts = Date.UTC(2026, 2, 15, 18, 0, 0);
            const result = toUTCDate(ts);
            expect(result.getTime()).toBe(Date.UTC(2026, 2, 15));
        });
    });

    describe('localDateToUTC', () => {
        it('converts a date to UTC midnight using local date components', () => {
            const input = new Date(2026, 2, 15, 14, 30, 0); // March 15, 2026 2:30 PM local
            const result = localDateToUTC(input);

            expect(result.getUTCFullYear()).toBe(2026);
            expect(result.getUTCMonth()).toBe(2);
            expect(result.getUTCDate()).toBe(15);
            expect(result.getUTCHours()).toBe(0);
            expect(result.getUTCMinutes()).toBe(0);
            expect(result.getUTCSeconds()).toBe(0);
        });

        it('uses local date components (getFullYear/getMonth/getDate)', () => {
            const utcMidnight = new Date(Date.UTC(2026, 2, 15, 0, 0, 0));
            const result = localDateToUTC(utcMidnight);

            // Result should equal Date.UTC(local year, local month, local date)
            expect(result.getTime()).toBe(
                Date.UTC(utcMidnight.getFullYear(), utcMidnight.getMonth(), utcMidnight.getDate())
            );
        });

        it('differs from toUTCDate which uses getUTC* methods', () => {
            // toUTCDate: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
            // localDateToUTC: Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
            const isoDate = new Date('2026-03-15T00:00:00Z');
            const fromLocal = localDateToUTC(isoDate);
            const fromUTC = toUTCDate(isoDate);

            // toUTCDate always extracts the UTC date components
            expect(fromUTC.getTime()).toBe(Date.UTC(2026, 2, 15));

            // localDateToUTC extracts LOCAL date components
            expect(fromLocal.getTime()).toBe(
                Date.UTC(isoDate.getFullYear(), isoDate.getMonth(), isoDate.getDate())
            );
        });

        it('handles year boundary correctly', () => {
            const newYearsEve = new Date(2026, 11, 31, 23, 59, 59); // Dec 31, 2026 local
            const result = localDateToUTC(newYearsEve);

            expect(result.getUTCFullYear()).toBe(2026);
            expect(result.getUTCMonth()).toBe(11);
            expect(result.getUTCDate()).toBe(31);
            expect(result.getUTCHours()).toBe(0);
        });
    });
});
