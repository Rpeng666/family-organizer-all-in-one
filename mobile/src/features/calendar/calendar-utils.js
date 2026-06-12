import {
  dedupeCalendarTagRecords,
} from '../../../../lib/calendar-tags';

const _NepaliDateMod = require('nepali-date-converter');
const NepaliDate = _NepaliDateMod.default || _NepaliDateMod;

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DEVANAGARI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
export const NEPALI_MONTHS_COMMON_DEVANAGARI = ['वैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कात्तिक', 'मंसिर', 'पुष', 'माघ', 'फागुन', 'चैत'];
export const DEFAULT_EVENT_STATUS = 'confirmed';

export function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function startOfWeekSunday(date) {
  const base = startOfDay(date);
  return addDays(base, -base.getDay());
}

export function formatYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toDevanagariDigits(value) {
  return String(value).replace(/\d/g, (digit) => DEVANAGARI_DIGITS[Number(digit)] || digit);
}

export function parseYmdLocal(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }
  return startOfDay(date);
}

export function parseTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function getLocalTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function shouldRetryLegacyCalendarMutation(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('permission denied') || message.includes('mutation failed') || message.includes('attrs');
}

export function combineLocalDateAndTime(dateValue, timeValue) {
  const date = parseYmdLocal(dateValue);
  const time = parseTime(timeValue);
  if (!date || !time) return null;
  const next = new Date(date);
  next.setHours(time.hours, time.minutes, 0, 0);
  return next;
}

export function eventStartsAt(event) {
  if (!event) return null;
  if (event.isAllDay) return parseYmdLocal(event.startDate);
  const parsed = new Date(event.startDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function eventEndsAt(event) {
  if (!event) return null;
  if (event.isAllDay) return parseYmdLocal(event.endDate);
  const parsed = new Date(event.endDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function eventOccursOnDay(event, day) {
  const dayStart = startOfDay(day);
  const nextDay = addDays(dayStart, 1);
  const start = eventStartsAt(event);
  const end = eventEndsAt(event);
  if (!start || !end) return false;
  return start < nextDay && end > dayStart;
}

export function compareEvents(a, b) {
  if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
  const aStart = eventStartsAt(a)?.getTime() || 0;
  const bStart = eventStartsAt(b)?.getTime() || 0;
  if (aStart !== bStart) return aStart - bStart;
  return (a.title || '').localeCompare(b.title || '');
}

export function formatMonthTitle(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function formatDayTitle(date) {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatClockTime(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatEventRangeLabel(event) {
  if (event.isAllDay) {
    const start = parseYmdLocal(event.startDate);
    const endExclusive = parseYmdLocal(event.endDate);
    if (!start || !endExclusive) return 'All day';
    const endInclusive = addDays(endExclusive, -1);
    if (formatYmd(start) === formatYmd(endInclusive)) return 'All day';
    return `All day · ${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${endInclusive.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }

  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Timed event';

  const sameDay = formatYmd(start) === formatYmd(end);
  if (sameDay) return `${formatClockTime(start)} - ${formatClockTime(end)}`;
  return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${formatClockTime(start)} - ${end.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${formatClockTime(end)}`;
}

export function getBikramDayMeta(date) {
  try {
    const nepali = new NepaliDate(date);
    return {
      year: nepali.getYear(),
      monthIndex: nepali.getMonth(),
      day: nepali.getDate(),
      monthNameDevanagari: NEPALI_MONTHS_COMMON_DEVANAGARI[nepali.getMonth()] || '',
    };
  } catch {
    return null;
  }
}

export function getGregorianMonthShort(date) {
  return date.toLocaleDateString(undefined, { month: 'short' });
}

export function buildMonthGrid(viewMonth) {
  const monthStart = startOfMonth(viewMonth);
  const gridStart = startOfWeekSunday(monthStart);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return { monthStart, gridStart, days, weeks };
}

export function getMonthWhereConditions(days) {
  const byYear = new Map();
  for (const day of days) {
    const year = day.getFullYear();
    const month = day.getMonth() + 1;
    const months = byYear.get(year) || new Set();
    months.add(month);
    byYear.set(year, months);
  }

  return Array.from(byYear.entries()).map(([year, months]) => ({
    year,
    month: { $in: Array.from(months).sort((a, b) => a - b) },
  }));
}

export function buildInitialForm(date = new Date()) {
  const start = startOfDay(date);
  const end = new Date(start);
  end.setHours(11, 0, 0, 0);
  const startTimed = new Date(start);
  startTimed.setHours(10, 0, 0, 0);
  return {
    title: '',
    description: '',
    isAllDay: true,
    startDate: formatYmd(start),
    endDate: formatYmd(start),
    startTime: `${String(startTimed.getHours()).padStart(2, '0')}:${String(startTimed.getMinutes()).padStart(2, '0')}`,
    endTime: `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
    status: DEFAULT_EVENT_STATUS,
    location: '',
    timeZone: getLocalTimeZone(),
    rrule: '',
    rdates: [],
    exdates: [],
    recurrenceLines: [],
    recurrenceId: '',
    recurringEventId: '',
    recurrenceIdRange: '',
    travelDurationBeforeMinutes: null,
    travelDurationAfterMinutes: null,
    alarms: [],
    eventType: 'default',
    visibility: 'default',
    transparency: 'transparent',
    uid: '',
    sequence: 0,
    createdAt: '',
    updatedAt: '',
    dtStamp: '',
    lastModified: '',
    tags: [],
    tagDraft: '',
  };
}

export function formFromEvent(event) {
  if (!event) return buildInitialForm(new Date());

  if (event.isAllDay) {
    const start = parseYmdLocal(event.startDate) || new Date();
    const endExclusive = parseYmdLocal(event.endDate) || addDays(start, 1);
    const endInclusive = addDays(endExclusive, -1);
    return {
      title: event.title || '',
      description: event.description || '',
      isAllDay: true,
      startDate: formatYmd(start),
      endDate: formatYmd(endInclusive),
      startTime: '10:00',
      endTime: '11:00',
      status: event.status || DEFAULT_EVENT_STATUS,
      location: event.location || '',
      timeZone: event.timeZone || getLocalTimeZone(),
      rrule: event.rrule || '',
      rdates: Array.isArray(event.rdates) ? event.rdates : [],
      exdates: Array.isArray(event.exdates) ? event.exdates : [],
      recurrenceLines: Array.isArray(event.recurrenceLines) ? event.recurrenceLines : [],
      recurrenceId: event.recurrenceId || '',
      recurringEventId: event.recurringEventId || '',
      recurrenceIdRange: event.recurrenceIdRange || '',
      travelDurationBeforeMinutes:
        typeof event.travelDurationBeforeMinutes === 'number' ? event.travelDurationBeforeMinutes : null,
      travelDurationAfterMinutes:
        typeof event.travelDurationAfterMinutes === 'number' ? event.travelDurationAfterMinutes : null,
      alarms: Array.isArray(event.alarms) ? event.alarms : [],
      eventType: event.eventType || 'default',
      visibility: event.visibility || 'default',
      transparency: event.transparency || 'transparent',
      uid: event.uid || '',
      sequence: typeof event.sequence === 'number' ? event.sequence : 0,
      createdAt: event.createdAt || '',
      updatedAt: event.updatedAt || '',
      dtStamp: event.dtStamp || '',
      lastModified: event.lastModified || '',
      tags: dedupeCalendarTagRecords(event.tags || []),
      tagDraft: '',
    };
  }

  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  return {
    title: event.title || '',
    description: event.description || '',
    isAllDay: false,
    startDate: Number.isNaN(start.getTime()) ? formatYmd(new Date()) : formatYmd(start),
    endDate: Number.isNaN(end.getTime()) ? formatYmd(new Date()) : formatYmd(end),
    startTime: Number.isNaN(start.getTime())
      ? '10:00'
      : `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
    endTime: Number.isNaN(end.getTime())
      ? '11:00'
      : `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`,
    status: event.status || DEFAULT_EVENT_STATUS,
    location: event.location || '',
    timeZone: event.timeZone || getLocalTimeZone(),
    rrule: event.rrule || '',
    rdates: Array.isArray(event.rdates) ? event.rdates : [],
    exdates: Array.isArray(event.exdates) ? event.exdates : [],
    recurrenceLines: Array.isArray(event.recurrenceLines) ? event.recurrenceLines : [],
    recurrenceId: event.recurrenceId || '',
    recurringEventId: event.recurringEventId || '',
    recurrenceIdRange: event.recurrenceIdRange || '',
    travelDurationBeforeMinutes:
      typeof event.travelDurationBeforeMinutes === 'number' ? event.travelDurationBeforeMinutes : null,
    travelDurationAfterMinutes:
      typeof event.travelDurationAfterMinutes === 'number' ? event.travelDurationAfterMinutes : null,
    alarms: Array.isArray(event.alarms) ? event.alarms : [],
    eventType: event.eventType || 'default',
    visibility: event.visibility || 'default',
    transparency: event.transparency || (event.isAllDay ? 'transparent' : 'opaque'),
    uid: event.uid || '',
    sequence: typeof event.sequence === 'number' ? event.sequence : 0,
    createdAt: event.createdAt || '',
    updatedAt: event.updatedAt || '',
    dtStamp: event.dtStamp || '',
    lastModified: event.lastModified || '',
    tags: dedupeCalendarTagRecords(event.tags || []),
    tagDraft: '',
  };
}

export function normalizeCalendarItem(item) {
  return {
    id: item.id,
    title: item.title || '',
    description: item.description || '',
    startDate: item.startDate,
    endDate: item.endDate,
    isAllDay: !!item.isAllDay,
    year: item.year,
    month: item.month,
    dayOfMonth: item.dayOfMonth,
    status: item.status || DEFAULT_EVENT_STATUS,
    location: item.location || '',
    timeZone: item.timeZone || '',
    rrule: item.rrule || '',
    rdates: Array.isArray(item.rdates) ? item.rdates : [],
    exdates: Array.isArray(item.exdates) ? item.exdates : [],
    recurrenceLines: Array.isArray(item.recurrenceLines) ? item.recurrenceLines : [],
    recurrenceId: item.recurrenceId || '',
    recurringEventId: item.recurringEventId || '',
    recurrenceIdRange: item.recurrenceIdRange || '',
    travelDurationBeforeMinutes:
      typeof item.travelDurationBeforeMinutes === 'number' ? item.travelDurationBeforeMinutes : null,
    travelDurationAfterMinutes:
      typeof item.travelDurationAfterMinutes === 'number' ? item.travelDurationAfterMinutes : null,
    alarms: Array.isArray(item.alarms) ? item.alarms : [],
    eventType: item.eventType || 'default',
    visibility: item.visibility || 'default',
    transparency: item.transparency || (item.isAllDay ? 'transparent' : 'opaque'),
    uid: item.uid || '',
    sequence: typeof item.sequence === 'number' ? item.sequence : 0,
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || '',
    dtStamp: item.dtStamp || '',
    lastModified: item.lastModified || '',
    sourceType: item.sourceType || 'manual',
    sourceCalendarName: item.sourceCalendarName || '',
    sourceReadOnly: !!item.sourceReadOnly,
    sourceSyncStatus: item.sourceSyncStatus || '',
    tags: dedupeCalendarTagRecords(item.tags || []),
    pertainsTo: item.pertainsTo || [],
  };
}

export function isImportedEvent(event) {
  return !!event?.sourceReadOnly || event?.sourceType === 'apple-caldav';
}

export function shouldHideImportedEvent(event) {
  if (!isImportedEvent(event) || event?.sourceType !== 'apple-caldav') return false;

  const sourceSyncStatus = String(event?.sourceSyncStatus || '').trim().toLowerCase();
  if (sourceSyncStatus && sourceSyncStatus !== 'active') return true;

  return String(event?.status || '').trim().toLowerCase() === 'cancelled';
}

export function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Compute bikram samvat metadata for an array of days.
 * Returns a Map<dayKey, bikramMeta>.
 */
export function computeBikramMetaByDayKey(days) {
  const map = new Map();
  let previousBikram = null;
  let previousGregorian = null;

  for (const day of days) {
    const dayKey = formatYmd(day);
    const currentBikram = getBikramDayMeta(day);
    const gregorianMonthChanged =
      !previousGregorian ||
      previousGregorian.getMonth() !== day.getMonth() ||
      previousGregorian.getFullYear() !== day.getFullYear();

    if (!currentBikram) {
      map.set(dayKey, null);
      previousGregorian = day;
      continue;
    }

    const bikramMonthChanged =
      !previousBikram ||
      previousBikram.monthIndex !== currentBikram.monthIndex ||
      previousBikram.year !== currentBikram.year;

    map.set(dayKey, {
      ...currentBikram,
      dayLabelDevanagari: toDevanagariDigits(currentBikram.day),
      showBsMonthTransition: bikramMonthChanged,
      showGregorianMonthTransition: gregorianMonthChanged,
      gregorianMonthShort: getGregorianMonthShort(day),
    });

    previousBikram = currentBikram;
    previousGregorian = day;
  }

  return map;
}
