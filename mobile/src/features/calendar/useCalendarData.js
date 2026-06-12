import { useMemo } from 'react';
import {
  normalizeCalendarItem,
  shouldHideImportedEvent,
  compareEvents,
  eventOccursOnDay,
  formatYmd,
  getMonthWhereConditions,
  addDays,
  startOfMonth,
} from './calendar-utils';
import {
  dedupeCalendarTagRecords,
  sortCalendarTagRecords,
} from '../../../../lib/calendar-tags';

/**
 * Compute the month-based where conditions for a query window centered on anchorDate.
 * Covers 3 months: the month before, the anchor month, and the month after.
 */
function buildQueryWindowConditions(anchorDate) {
  const months = [];
  for (let offset = -1; offset <= 1; offset++) {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + offset, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  // Dedupe (in case anchorDate is near year boundary)
  const seen = new Set();
  const unique = [];
  for (const m of months) {
    const key = `${m.year}-${m.month}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(m);
    }
  }

  // Group by year for efficient $in queries
  const byYear = new Map();
  for (const m of unique) {
    const existing = byYear.get(m.year) || [];
    existing.push(m.month);
    byYear.set(m.year, existing);
  }

  return Array.from(byYear.entries()).map(([year, monthList]) => ({
    year,
    month: { $in: monthList.sort((a, b) => a - b) },
  }));
}

/**
 * Hook that manages the InstantDB calendar query, normalization, and day-keyed indexing.
 *
 * @param {Object} params
 * @param {Object} params.db - InstantDB client instance
 * @param {boolean} params.isAuthenticated
 * @param {boolean} params.instantReady
 * @param {Date} params.anchorDate - The focal date for the query window
 * @param {Date[]} [params.visibleDays] - Optional array of visible days for eventsByDayKey computation
 */
export function useCalendarData({ db, isAuthenticated, instantReady, anchorDate, visibleDays }) {
  const whereConditions = useMemo(
    () => buildQueryWindowConditions(anchorDate),
    [anchorDate.getFullYear(), anchorDate.getMonth()]
  );

  const queryEnabled = isAuthenticated && instantReady;

  const calendarQuery = db.useQuery(
    queryEnabled
      ? {
          calendarItems: {
            tags: {},
            pertainsTo: {},
            $: {
              where:
                whereConditions.length <= 1
                  ? whereConditions[0] || {}
                  : { or: whereConditions },
            },
          },
          calendarTags: {},
          familyMembers: {},
        }
      : null
  );

  const calendarItems = useMemo(
    () =>
      (calendarQuery.data?.calendarItems || [])
        .map(normalizeCalendarItem)
        .filter((item) => !shouldHideImportedEvent(item))
        .sort(compareEvents),
    [calendarQuery.data?.calendarItems]
  );

  const familyMembers = useMemo(
    () => calendarQuery.data?.familyMembers || [],
    [calendarQuery.data?.familyMembers]
  );

  const eventsByDayKey = useMemo(() => {
    if (!visibleDays || visibleDays.length === 0) return new Map();
    const map = new Map();
    for (const day of visibleDays) {
      const key = formatYmd(day);
      const events = calendarItems.filter((event) => eventOccursOnDay(event, day));
      map.set(key, events.sort(compareEvents));
    }
    return map;
  }, [calendarItems, visibleDays]);

  const availableCalendarTags = useMemo(
    () => sortCalendarTagRecords(dedupeCalendarTagRecords(calendarQuery.data?.calendarTags || [])),
    [calendarQuery.data?.calendarTags]
  );

  return {
    calendarItems,
    eventsByDayKey,
    familyMembers,
    availableCalendarTags,
    isLoading: calendarQuery.isLoading,
    error: calendarQuery.error,
  };
}
