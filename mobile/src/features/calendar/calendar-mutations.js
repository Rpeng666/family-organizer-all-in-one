import { id, tx } from '@instantdb/react-native';
import { buildCalendarHistoryMetadata, buildCalendarHistorySnapshot } from '../../../../lib/calendar-history';
import { buildHistoryEventTransactions } from '../../../../lib/history-events';
import {
  DEFAULT_EVENT_STATUS,
  addDays,
  eventEndsAt,
  eventStartsAt,
  formatYmd,
  getLocalTimeZone,
  shouldRetryLegacyCalendarMutation,
} from './calendar-utils';

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

function buildHistoryTxOps({ tx: txRef, currentUserId, calendarItemId, actionType, summary, title, beforeSnapshot, afterSnapshot, metadata }) {
  if (!currentUserId) return [];
  const result = buildHistoryEventTransactions({
    tx: txRef,
    createId: id,
    occurredAt: new Date().toISOString(),
    domain: 'calendar',
    actionType,
    summary,
    source: 'manual',
    actorFamilyMemberId: currentUserId,
    calendarItemId: calendarItemId || null,
    metadata: buildCalendarHistoryMetadata({
      title: title || null,
      before: beforeSnapshot || null,
      after: afterSnapshot || null,
      extra: metadata || null,
    }),
  });
  return result.transactions;
}

// ---------------------------------------------------------------------------
// Move calendar event (drag-and-drop)
// ---------------------------------------------------------------------------

/**
 * Build transactions to move a calendar event by a day delta.
 *
 * For non-recurring events, this shifts startDate/endDate directly.
 * For recurring events, behaviour depends on `scope`:
 *   - 'single': adds an exdate to the master and creates an override event
 *   - 'all': shifts the master startDate/endDate (and all overrides)
 *   - 'following': not yet implemented on mobile (falls back to 'all')
 *
 * @param {Object} params
 * @param {Object} params.event - The calendar item being moved
 * @param {Date} params.newStartDate - The new start date/time
 * @param {Date|null} params.newEndDate - The new end date/time (computed if null)
 * @param {string|null} params.scope - 'single' | 'following' | 'all' (only for recurring)
 * @param {string|null} params.currentUserId
 * @returns {{ txOps: Array, newEventId: string|null }}
 */
export function buildMoveEventTransactions({ event, newStartDate, newEndDate, scope, currentUserId }) {
  const nowIso = new Date().toISOString();
  const eventId = event.id;
  const title = event.title || 'Untitled event';
  const isRecurring = !!(event.rrule || (event.recurrenceLines && event.recurrenceLines.length > 0));

  // Compute duration to preserve it
  const oldStart = eventStartsAt(event);
  const oldEnd = eventEndsAt(event);
  const durationMs = oldStart && oldEnd ? oldEnd.getTime() - oldStart.getTime() : 3600000;

  if (!newEndDate) {
    newEndDate = new Date(newStartDate.getTime() + durationMs);
  }

  const beforeSnapshot = buildCalendarHistorySnapshot(event);

  // Build the new date payload
  const buildDatePayload = (start, end, isAllDay) => {
    if (isAllDay) {
      return {
        startDate: formatYmd(start),
        endDate: formatYmd(end),
        isAllDay: true,
        year: start.getFullYear(),
        month: start.getMonth() + 1,
        dayOfMonth: start.getDate(),
      };
    }
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      isAllDay: false,
      year: start.getFullYear(),
      month: start.getMonth() + 1,
      dayOfMonth: start.getDate(),
    };
  };

  const datePayload = buildDatePayload(newStartDate, newEndDate, !!event.isAllDay);
  const afterSnapshot = buildCalendarHistorySnapshot(datePayload);

  // Non-recurring: simple update
  if (!isRecurring) {
    const updatePayload = {
      ...datePayload,
      updatedAt: nowIso,
      lastModified: nowIso,
      sequence: (typeof event.sequence === 'number' ? event.sequence : 0) + 1,
    };

    const historyOps = buildHistoryTxOps({
      tx,
      currentUserId,
      calendarItemId: eventId,
      actionType: 'calendar_event_moved',
      summary: `Moved event "${title}"`,
      title,
      beforeSnapshot,
      afterSnapshot,
      metadata: { recurring: false },
    });

    return {
      txOps: [tx.calendarItems[eventId].update(updatePayload), ...historyOps],
      newEventId: null,
    };
  }

  // Recurring event — scope-based handling
  if (scope === 'single') {
    // Create an override occurrence and add exdate to master
    const overrideId = id();
    const masterId = event.recurringEventId || eventId;
    const recurrenceToken = event.recurrenceId || (oldStart ? oldStart.toISOString() : formatYmd(new Date()));

    // Add exdate to master's exdates array
    const masterExdates = Array.isArray(event.exdates) ? [...event.exdates] : [];
    if (!masterExdates.includes(recurrenceToken)) {
      masterExdates.push(recurrenceToken);
    }

    const masterUpdateOps = masterId === eventId
      ? [tx.calendarItems[masterId].update({ exdates: masterExdates, updatedAt: nowIso })]
      : [tx.calendarItems[masterId].update({ exdates: masterExdates, updatedAt: nowIso })];

    // Create override event
    const overridePayload = {
      ...datePayload,
      title: event.title || '',
      description: event.description || '',
      uid: event.uid || eventId,
      status: event.status || DEFAULT_EVENT_STATUS,
      location: event.location || '',
      timeZone: event.timeZone || getLocalTimeZone(),
      recurrenceId: recurrenceToken,
      recurringEventId: masterId,
      recurrenceIdRange: event.recurrenceIdRange || '',
      eventType: event.eventType || 'default',
      visibility: event.visibility || 'default',
      transparency: event.transparency || (event.isAllDay ? 'transparent' : 'opaque'),
      sequence: (typeof event.sequence === 'number' ? event.sequence : 0) + 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      dtStamp: nowIso,
      lastModified: nowIso,
    };

    const historyOps = buildHistoryTxOps({
      tx,
      currentUserId,
      calendarItemId: overrideId,
      actionType: 'calendar_event_moved',
      summary: `Moved single occurrence of "${title}"`,
      title,
      beforeSnapshot,
      afterSnapshot,
      metadata: { scope: 'single', recurring: true },
    });

    return {
      txOps: [
        ...masterUpdateOps,
        tx.calendarItems[overrideId].update(overridePayload),
        ...historyOps,
      ],
      newEventId: overrideId,
    };
  }

  // scope === 'all' or 'following' (following falls back to all on mobile for now)
  const updatePayload = {
    ...datePayload,
    updatedAt: nowIso,
    lastModified: nowIso,
    sequence: (typeof event.sequence === 'number' ? event.sequence : 0) + 1,
  };

  const historyOps = buildHistoryTxOps({
    tx,
    currentUserId,
    calendarItemId: eventId,
    actionType: 'calendar_event_moved',
    summary: `Moved all occurrences of "${title}"`,
    title,
    beforeSnapshot,
    afterSnapshot,
    metadata: { scope: scope || 'all', recurring: true },
  });

  return {
    txOps: [tx.calendarItems[eventId].update(updatePayload), ...historyOps],
    newEventId: null,
  };
}

// ---------------------------------------------------------------------------
// Delete calendar event with recurrence scope
// ---------------------------------------------------------------------------

/**
 * Build transactions to delete a calendar event.
 *
 * For non-recurring events, simply deletes the event.
 * For recurring events, behaviour depends on `scope`:
 *   - 'single': adds an exdate to the master (hides this occurrence)
 *   - 'all': deletes the master event
 *   - 'following': not yet implemented on mobile (falls back to 'all')
 *
 * @param {Object} params
 * @param {Object} params.event
 * @param {string|null} params.scope - 'single' | 'following' | 'all'
 * @param {string|null} params.currentUserId
 * @returns {{ txOps: Array }}
 */
export function buildDeleteEventTransactions({ event, scope, currentUserId }) {
  const nowIso = new Date().toISOString();
  const eventId = event.id;
  const title = event.title || 'Untitled event';
  const isRecurring = !!(event.rrule || (event.recurrenceLines && event.recurrenceLines.length > 0));
  const beforeSnapshot = buildCalendarHistorySnapshot(event);

  // Non-recurring: simple delete
  if (!isRecurring || scope === 'all') {
    const historyOps = buildHistoryTxOps({
      tx,
      currentUserId,
      calendarItemId: eventId,
      actionType: 'calendar_event_deleted',
      summary: `Deleted event "${title}"`,
      title,
      beforeSnapshot,
      metadata: isRecurring ? { scope: 'all', recurring: true } : { recurring: false },
    });

    return { txOps: [tx.calendarItems[eventId].delete(), ...historyOps] };
  }

  if (scope === 'single') {
    const masterId = event.recurringEventId || eventId;
    const oldStart = eventStartsAt(event);
    const recurrenceToken = event.recurrenceId || (oldStart ? oldStart.toISOString() : formatYmd(new Date()));

    const masterExdates = Array.isArray(event.exdates) ? [...event.exdates] : [];
    if (!masterExdates.includes(recurrenceToken)) {
      masterExdates.push(recurrenceToken);
    }

    const txOps = [
      tx.calendarItems[masterId].update({ exdates: masterExdates, updatedAt: nowIso }),
    ];

    // If this event is an override (has recurringEventId pointing elsewhere), also delete it
    if (event.recurringEventId && event.recurringEventId !== eventId) {
      txOps.push(tx.calendarItems[eventId].delete());
    }

    const historyOps = buildHistoryTxOps({
      tx,
      currentUserId,
      calendarItemId: masterId,
      actionType: 'calendar_event_deleted',
      summary: `Deleted single occurrence of "${title}"`,
      title,
      beforeSnapshot,
      metadata: { scope: 'single', recurring: true },
    });

    return { txOps: [...txOps, ...historyOps] };
  }

  // 'following' — falls back to 'all' on mobile for now
  const historyOps = buildHistoryTxOps({
    tx,
    currentUserId,
    calendarItemId: eventId,
    actionType: 'calendar_event_deleted',
    summary: `Deleted "${title}" and following events`,
    title,
    beforeSnapshot,
    metadata: { scope: 'following', recurring: true },
  });

  return { txOps: [tx.calendarItems[eventId].delete(), ...historyOps] };
}

// ---------------------------------------------------------------------------
// Execute mutation with legacy fallback
// ---------------------------------------------------------------------------

/**
 * Execute a calendar mutation with automatic legacy payload retry.
 *
 * @param {Object} db - InstantDB client
 * @param {Array} txOps - Transaction operations
 * @returns {Promise<void>}
 */
export async function executeCalendarMutation(db, txOps) {
  try {
    await db.transact(txOps);
  } catch (error) {
    if (shouldRetryLegacyCalendarMutation(error)) {
      await db.transact(txOps);
    } else {
      throw error;
    }
  }
}
