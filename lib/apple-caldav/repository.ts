import 'server-only';

import { id } from '@instantdb/admin';
import { RRule } from 'rrule';
import { buildCalendarHistoryMetadata, buildCalendarHistorySnapshot } from '@/lib/calendar-history';
import { getInstantAdminDb } from '@/lib/instant-admin';
import { buildHistoryEventTransactions } from '@/lib/history-events';

const INSTANT_TRANSACTION_BATCH_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

function asArray<T>(value: T[] | undefined | null) {
    return Array.isArray(value) ? value : [];
}

function timestampMs(value: string | undefined | null) {
    const parsed = new Date(value || '').getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
}

function compareCalendarSyncCalendarRows(left: any, right: any) {
    const enabledDiff = Number(Boolean(right?.isEnabled)) - Number(Boolean(left?.isEnabled));
    if (enabledDiff !== 0) return enabledDiff;

    const remoteUrlDiff = Number(Boolean(right?.remoteUrl)) - Number(Boolean(left?.remoteUrl));
    if (remoteUrlDiff !== 0) return remoteUrlDiff;

    const lastSuccessfulDiff = timestampMs(right?.lastSuccessfulSyncAt) - timestampMs(left?.lastSuccessfulSyncAt);
    if (lastSuccessfulDiff !== 0) return lastSuccessfulDiff;

    const updatedDiff = timestampMs(right?.updatedAt) - timestampMs(left?.updatedAt);
    if (updatedDiff !== 0) return updatedDiff;

    const createdDiff = timestampMs(right?.createdAt) - timestampMs(left?.createdAt);
    if (createdDiff !== 0) return createdDiff;

    return String(left?.id || '').localeCompare(String(right?.id || ''));
}

export function dedupeCalendarSyncCalendarRows(rows: any[]) {
    const grouped = new Map<string, any[]>();
    for (const row of rows) {
        const key = String(row?.remoteCalendarId || '').trim();
        if (!key) continue;
        const list = grouped.get(key) || [];
        list.push(row);
        grouped.set(key, list);
    }

    return Array.from(grouped.values())
        .map((group) => [...group].sort(compareCalendarSyncCalendarRows)[0])
        .sort((left, right) => String(left?.displayName || '').localeCompare(String(right?.displayName || '')));
}

export function chunkForInstantTransact<T>(items: T[], batchSize = INSTANT_TRANSACTION_BATCH_SIZE) {
    const size = Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : INSTANT_TRANSACTION_BATCH_SIZE;
    const batches: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        batches.push(items.slice(index, index + size));
    }
    return batches;
}

async function transactInBatches(db: any, txs: any[]) {
    for (const batch of chunkForInstantTransact(txs)) {
        await db.transact(batch);
    }
}

export async function listCalendarSyncAccounts() {
    const db = getInstantAdminDb();
    const result = await db.query({ calendarSyncAccounts: {} });
    return asArray(result.calendarSyncAccounts);
}

export async function getCalendarSyncAccount(accountId: string) {
    const accounts = (await listCalendarSyncAccounts()) as any[];
    return accounts.find((account: any) => account.id === accountId) || null;
}

export async function listCalendarSyncCalendars(accountId: string) {
    const db = getInstantAdminDb();
    const result = await db.query({
        calendarSyncCalendars: {
            $: {
                where: { accountId },
            },
        },
    });
    return dedupeCalendarSyncCalendarRows(asArray(result.calendarSyncCalendars));
}

export async function upsertCalendarSyncAccount(input: any) {
    const db = getInstantAdminDb();
    const existing = input.id
        ? { id: input.id }
        : (await listCalendarSyncAccounts()).find((account: any) => account.provider === input.provider);
    const accountId = existing?.id || id();
    await db.transact([db.tx.calendarSyncAccounts[accountId].update(input)]);
    return accountId;
}

export async function replaceCalendarSyncCalendars(accountId: string, calendars: any[]) {
    const db = getInstantAdminDb();
    const rawExistingResult = await db.query({
        calendarSyncCalendars: {
            $: {
                where: { accountId },
            },
        },
    });
    const rawExisting = asArray(rawExistingResult.calendarSyncCalendars) as any[];
    const groupedExisting = new Map<string, any[]>();
    for (const item of rawExisting) {
        const key = String(item?.remoteCalendarId || '').trim();
        const list = groupedExisting.get(key) || [];
        list.push(item);
        groupedExisting.set(key, list);
    }

    const existingByRemoteId = new Map<string, any>();
    const duplicateIdsToDelete: string[] = [];
    const desiredRemoteIds = new Set(
        calendars
            .map((calendar) => String(calendar?.remoteCalendarId || '').trim())
            .filter(Boolean)
    );
    for (const [remoteCalendarId, group] of Array.from(groupedExisting.entries())) {
        const ranked = [...group].sort(compareCalendarSyncCalendarRows);
        existingByRemoteId.set(remoteCalendarId, ranked[0]);
        duplicateIdsToDelete.push(...ranked.slice(1).map((item: any) => item.id));
    }
    const txs = calendars.map((calendar) => {
        const current = existingByRemoteId.get(calendar.remoteCalendarId);
        return db.tx.calendarSyncCalendars[current?.id || id()].update({
            accountId,
            ...calendar,
        });
    });
    const staleDisabledIdsToDelete = Array.from(existingByRemoteId.values())
        .filter((item: any) => !desiredRemoteIds.has(String(item?.remoteCalendarId || '').trim()) && !item?.isEnabled)
        .map((item: any) => item.id);
    txs.push(...duplicateIdsToDelete.map((rowId) => db.tx.calendarSyncCalendars[rowId].delete()));
    txs.push(...staleDisabledIdsToDelete.map((rowId) => db.tx.calendarSyncCalendars[rowId].delete()));
    if (txs.length > 0) {
        await transactInBatches(db, txs);
    }
}

export async function createSyncRun(input: any) {
    const db = getInstantAdminDb();
    const runId = id();
    await db.transact([db.tx.calendarSyncRuns[runId].update(input)]);
    return runId;
}

export async function updateSyncRun(runId: string, patch: any) {
    const db = getInstantAdminDb();
    await db.transact([db.tx.calendarSyncRuns[runId].update(patch)]);
}

export async function listRecentSyncRuns(accountId: string, limit = 20) {
    const db = getInstantAdminDb();
    const result = await db.query({
        calendarSyncRuns: {
            $: {
                where: { accountId },
                order: { startedAt: 'desc' },
                limit,
            },
        },
    });
    return asArray(result.calendarSyncRuns);
}

export async function acquireCalendarSyncLock(lockKey: string, owner: string, expiresAtIso: string) {
    const db = getInstantAdminDb();
    const result = await db.query({
        calendarSyncLocks: {
            $: {
                where: { key: lockKey },
            },
        },
    });
    const existing = (asArray(result.calendarSyncLocks) as any[])[0] || null;
    if (existing && new Date(existing.expiresAt).getTime() > Date.now()) {
        return { acquired: false, lockId: existing.id };
    }
    const lockId = existing?.id || id();
    await db.transact([db.tx.calendarSyncLocks[lockId].update({ key: lockKey, owner, expiresAt: expiresAtIso, createdAt: existing?.createdAt || new Date().toISOString() })]);
    return { acquired: true, lockId };
}

export async function releaseCalendarSyncLock(lockId: string) {
    const db = getInstantAdminDb();
    await db.transact([db.tx.calendarSyncLocks[lockId].delete()]);
}

export async function listImportedCalendarItems(accountId: string, calendarId: string) {
    const db = getInstantAdminDb();
    const result = await db.query({
        calendarItems: {
            tags: {},
            $: {
                where: {
                    sourceAccountKey: accountId,
                    sourceCalendarId: calendarId,
                },
            },
        },
    });
    return asArray(result.calendarItems);
}

function parseDateValue(value: string) {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return new Date(`${value}T00:00:00.000Z`);
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function normalizeRruleString(value: unknown) {
    return String(value || '').trim().replace(/^RRULE:/i, '');
}

function parseRecurrenceDateToken(token: string) {
    const trimmed = String(token || '').trim();
    if (!trimmed) return null;

    const dateOnlyMatch = trimmed.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
    if (dateOnlyMatch) {
        return parseDateValue(`${dateOnlyMatch[1]}-${dateOnlyMatch[2]}-${dateOnlyMatch[3]}`);
    }

    const utcDateTimeMatch = trimmed.match(/^(\d{8}T\d{6}Z)$/i);
    if (utcDateTimeMatch) {
        const compact = utcDateTimeMatch[1].toUpperCase();
        return parseDateValue(
            `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}.000Z`
        );
    }

    const compactDateTimeMatch = trimmed.match(/^(\d{8}T\d{6})$/i);
    if (compactDateTimeMatch) {
        const compact = compactDateTimeMatch[1];
        return parseDateValue(
            `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}`
        );
    }

    return parseDateValue(trimmed);
}

function splitDateTokens(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map((entry) => entry.trim()).filter(Boolean);
    }
    return [];
}

function collectRecurrenceLineTokens(lines: unknown, prefix: 'RDATE' | 'EXDATE'): string[] {
    if (!Array.isArray(lines)) return [];

    const tokens: string[] = [];
    for (const line of lines) {
        if (typeof line !== 'string') continue;
        const trimmed = line.trim();
        if (!trimmed || !trimmed.toUpperCase().startsWith(prefix)) continue;

        const separatorIndex = trimmed.indexOf(':');
        if (separatorIndex < 0) continue;

        tokens.push(
            ...trimmed
                .slice(separatorIndex + 1)
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean)
        );
    }

    return tokens;
}

function buildRecurringOccurrenceStarts(item: any, rangeStart: Date, rangeEnd: Date) {
    const normalizedRule = normalizeRruleString(item?.rrule);
    const start = parseDateValue(item?.startDate);
    const end = parseDateValue(item?.endDate);
    if (!start || !end || !normalizedRule) return [];

    const durationMs = Math.max(0, end.getTime() - start.getTime());
    const searchStart = new Date(rangeStart.getTime() - Math.min(durationMs, 366 * DAY_MS));

    try {
        const ruleOptions = RRule.parseString(normalizedRule);
        const recurrenceDtStart = item?.isAllDay
            ? new Date(Date.UTC(
                start.getUTCFullYear(),
                start.getUTCMonth(),
                start.getUTCDate(),
                start.getUTCHours(),
                start.getUTCMinutes(),
                start.getUTCSeconds(),
                start.getUTCMilliseconds()
            ))
            : start;
        const rule = new RRule({
            ...ruleOptions,
            dtstart: recurrenceDtStart,
        });
        return rule.between(searchStart, rangeEnd, true);
    } catch {
        return [];
    }
}

function recurringCalendarItemIntersectsWindow(item: any, rangeStart: Date, rangeEnd: Date) {
    const start = parseDateValue(item?.startDate);
    const end = parseDateValue(item?.endDate);
    if (!start || !end) return false;

    const durationMs = Math.max(0, end.getTime() - start.getTime());
    const exdateTokens = [
        ...splitDateTokens(item?.exdates),
        ...collectRecurrenceLineTokens(item?.recurrenceLines, 'EXDATE'),
    ];
    const rdateTokens = [
        ...splitDateTokens(item?.rdates),
        ...collectRecurrenceLineTokens(item?.recurrenceLines, 'RDATE'),
    ];
    const excludedDayKeys = new Set<string>();
    const excludedExactTimes = new Set<number>();

    for (const token of exdateTokens) {
        const parsed = parseRecurrenceDateToken(token);
        if (!parsed) continue;
        excludedDayKeys.add(parsed.toISOString().slice(0, 10));
        excludedExactTimes.add(parsed.getTime());
    }

    const occurrenceStarts = [
        ...buildRecurringOccurrenceStarts(item, rangeStart, rangeEnd),
        ...(rdateTokens.map(parseRecurrenceDateToken).filter(Boolean) as Date[]),
    ];
    const seenOccurrenceKeys = new Set<string>();

    for (const occurrenceStart of occurrenceStarts) {
        const occurrenceKey = item?.isAllDay
            ? occurrenceStart.toISOString().slice(0, 10)
            : occurrenceStart.toISOString();
        if (seenOccurrenceKeys.has(occurrenceKey)) continue;
        seenOccurrenceKeys.add(occurrenceKey);

        if (item?.isAllDay) {
            if (excludedDayKeys.has(occurrenceKey)) continue;
        } else if (excludedExactTimes.has(occurrenceStart.getTime())) {
            continue;
        }

        const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
        if (occurrenceStart < rangeEnd && occurrenceEnd > rangeStart) {
            return true;
        }
    }

    return false;
}

export function calendarItemIntersectsWindow(item: any, rangeStart: Date, rangeEnd: Date) {
    const start = parseDateValue(item.startDate);
    const end = parseDateValue(item.endDate);
    if (!start || !end) return false;
    if (start < rangeEnd && end > rangeStart) return true;
    if (String(item?.recurringEventId || '').trim()) return false;
    if (!normalizeRruleString(item?.rrule) && splitDateTokens(item?.rdates).length === 0 && collectRecurrenceLineTokens(item?.recurrenceLines, 'RDATE').length === 0) {
        return false;
    }
    return recurringCalendarItemIntersectsWindow(item, rangeStart, rangeEnd);
}

export function listIncrementalStaleImportedItems(input: {
    existingItems: any[];
    nextItems: any[];
}) {
    const seenSourceIdsByRemoteUrl = new Map<string, Set<string>>();

    for (const item of input.nextItems || []) {
        const remoteUrl = String(item?.sourceRemoteUrl || '').trim();
        const sourceExternalId = String(item?.sourceExternalId || '').trim();
        if (!remoteUrl || !sourceExternalId) continue;

        const seenSourceIds = seenSourceIdsByRemoteUrl.get(remoteUrl) || new Set<string>();
        seenSourceIds.add(sourceExternalId);
        seenSourceIdsByRemoteUrl.set(remoteUrl, seenSourceIds);
    }

    return (input.existingItems || []).filter((item: any) => {
        const remoteUrl = String(item?.sourceRemoteUrl || '').trim();
        const sourceExternalId = String(item?.sourceExternalId || '').trim();
        if (!remoteUrl || !sourceExternalId) return false;
        if (String(item?.sourceSyncStatus || '').trim().toLowerCase() === 'deleted-remote') return false;

        const seenSourceIds = seenSourceIdsByRemoteUrl.get(remoteUrl);
        if (!seenSourceIds) return false;
        return !seenSourceIds.has(sourceExternalId);
    });
}

export function shouldHardDeleteImportedCalendarItem(input: {
    item: any;
    hardDeleteMissingRows?: boolean;
}) {
    const hasLocalTags = Array.isArray(input.item?.tags) && input.item.tags.length > 0;
    return input.hardDeleteMissingRows === true && !hasLocalTags;
}

export async function upsertImportedCalendarItems(input: {
    accountId: string;
    calendarId: string;
    calendarName: string;
    ctag?: string;
    items: any[];
    seenSourceExternalIds: Set<string>;
    nowIso: string;
    rangeStart: Date;
    rangeEnd: Date;
    markMissingAsDeleted?: boolean;
    hardDeleteMissingRows?: boolean;
}) {
    const db = getInstantAdminDb();
    const existing = (await listImportedCalendarItems(input.accountId, input.calendarId)) as any[];
    const existingBySourceId = new Map(existing.map((item: any) => [item.sourceExternalId, item]));

    let eventsCreated = 0;
    let eventsUpdated = 0;
    let eventsUnchanged = 0;
    let eventsCancelled = 0;
    let eventsMarkedDeleted = 0;

    const txs = [];
    const deletedExistingItemIds = new Set<string>();
    const queueDeletedExistingItem = (existingItem: any) => {
        if (!existingItem?.id || deletedExistingItemIds.has(existingItem.id)) return;
        deletedExistingItemIds.add(existingItem.id);

        if (shouldHardDeleteImportedCalendarItem({ item: existingItem, hardDeleteMissingRows: input.hardDeleteMissingRows })) {
            txs.push(db.tx.calendarItems[existingItem.id].delete());
        } else {
            txs.push(db.tx.calendarItems[existingItem.id].update({
                sourceSyncStatus: 'deleted-remote',
                status: 'cancelled',
                sourceLastSeenAt: input.nowIso,
            }));
        }

        const historyEvent = buildHistoryEventTransactions({
            tx: db.tx,
            createId: id,
            occurredAt: input.nowIso,
            domain: 'calendar',
            actionType: 'calendar_event_deleted',
            summary: `Deleted event "${String(existingItem.title || 'Untitled event')}"`,
            source: 'apple_sync',
            calendarItemId: existingItem.id,
            metadata: buildCalendarHistoryMetadata({
                title: String(existingItem.title || 'Untitled event'),
                before: buildCalendarHistorySnapshot(existingItem),
                extra: {
                    sourceCalendarId: input.calendarId,
                    sourceAccountId: input.accountId,
                },
            }),
        });
        txs.push(...historyEvent.transactions);

        eventsMarkedDeleted += 1;
    };

    for (const item of input.items) {
        const existingItem = existingBySourceId.get(item.sourceExternalId);
        if (existingItem?.sourceRawHash === item.sourceRawHash) {
            eventsUnchanged += 1;
            txs.push(db.tx.calendarItems[existingItem.id].update({
                sourceLastSeenAt: input.nowIso,
                sourceRemoteEtag: item.sourceRemoteEtag,
                sourceRemoteCtag: input.ctag || item.sourceRemoteCtag || '',
                sourceCalendarName: input.calendarName,
                sourceSyncStatus: item.sourceSyncStatus,
                status: item.status,
            }));
            continue;
        }
        const targetItemId = existingItem?.id || id();
        txs.push(db.tx.calendarItems[targetItemId].update({
            ...item,
            sourceRemoteCtag: input.ctag || item.sourceRemoteCtag || '',
            sourceCalendarName: input.calendarName,
        }));
        const historyEvent = buildHistoryEventTransactions({
            tx: db.tx,
            createId: id,
            occurredAt: input.nowIso,
            domain: 'calendar',
            actionType: existingItem ? 'calendar_event_updated' : 'calendar_event_created',
            summary: `${existingItem ? 'Updated' : 'Imported'} event "${String(item.title || 'Untitled event')}"`,
            source: 'apple_sync',
            calendarItemId: targetItemId,
            metadata: buildCalendarHistoryMetadata({
                title: String(item.title || 'Untitled event'),
                before: buildCalendarHistorySnapshot(existingItem),
                after: buildCalendarHistorySnapshot(item),
                extra: {
                    sourceCalendarId: input.calendarId,
                    sourceAccountId: input.accountId,
                },
            }),
        });
        txs.push(...historyEvent.transactions);
        if (item.status === 'cancelled' || item.sourceSyncStatus === 'cancelled') {
            eventsCancelled += 1;
        }
        if (existingItem) eventsUpdated += 1;
        else eventsCreated += 1;
    }

    if (input.markMissingAsDeleted !== false) {
        for (const existingItem of existing) {
            if (input.seenSourceExternalIds.has(existingItem.sourceExternalId)) continue;
            if (existingItem.sourceSyncStatus === 'deleted-remote') continue;
            if (!calendarItemIntersectsWindow(existingItem, input.rangeStart, input.rangeEnd)) continue;
            queueDeletedExistingItem(existingItem);
        }
    } else {
        for (const existingItem of listIncrementalStaleImportedItems({
            existingItems: existing,
            nextItems: input.items,
        })) {
            queueDeletedExistingItem(existingItem);
        }
    }

    if (txs.length > 0) {
        await transactInBatches(db, txs);
    }

    return {
        eventsCreated,
        eventsUpdated,
        eventsUnchanged,
        eventsCancelled,
        eventsMarkedDeleted,
    };
}

export async function markImportedCalendarItemsDeletedByRemoteUrls(input: {
    accountId: string;
    calendarId: string;
    remoteUrls: string[];
    nowIso: string;
}) {
    if (input.remoteUrls.length === 0) {
        return { eventsMarkedDeleted: 0 };
    }

    const db = getInstantAdminDb();
    const existing = (await listImportedCalendarItems(input.accountId, input.calendarId)) as any[];
    const remoteUrlSet = new Set(input.remoteUrls);
    const targets = existing.filter((item: any) =>
        item.sourceRemoteUrl &&
        remoteUrlSet.has(item.sourceRemoteUrl) &&
        item.sourceSyncStatus !== 'deleted-remote'
    );

    if (targets.length === 0) {
        return { eventsMarkedDeleted: 0 };
    }

    await transactInBatches(
        db,
        targets.flatMap((item: any) => {
            const historyEvent = buildHistoryEventTransactions({
                tx: db.tx,
                createId: id,
                occurredAt: input.nowIso,
                domain: 'calendar',
                actionType: 'calendar_event_deleted',
                summary: `Deleted event "${String(item.title || 'Untitled event')}"`,
                source: 'apple_sync',
                calendarItemId: item.id,
                metadata: buildCalendarHistoryMetadata({
                    title: String(item.title || 'Untitled event'),
                    before: buildCalendarHistorySnapshot(item),
                    extra: {
                        sourceCalendarId: input.calendarId,
                        sourceAccountId: input.accountId,
                    },
                }),
            });

            return [
                db.tx.calendarItems[item.id].update({
                    sourceSyncStatus: 'deleted-remote',
                    status: 'cancelled',
                    sourceLastSeenAt: input.nowIso,
                }),
                ...historyEvent.transactions,
            ];
        })
    );

    return { eventsMarkedDeleted: targets.length };
}
