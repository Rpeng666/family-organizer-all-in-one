import 'server-only';

import { randomUUID } from 'crypto';
import { discoverAppleCalendars, fetchCalendarCollectionMetadata, fetchCalendarEvents } from '@/lib/apple-caldav/client';
import { isIgnoredAppleCalendarDisplayName } from '@/lib/apple-caldav/calendar-filter';
import {
    APPLE_CALDAV_PROVIDER,
    getCalendarSyncActivePollMs,
    getCalendarSyncDiscoveryRefreshMs,
    getCalendarSyncLockTtlMs,
    getCalendarSyncWindow,
    getDefaultRepairScanIntervalHours,
    getDefaultSyncWindowFutureDays,
    getDefaultSyncWindowPastDays,
} from '@/lib/apple-caldav/config';
import { decryptCalendarCredential, encryptCalendarCredential } from '@/lib/apple-caldav/crypto';
import { parseCalendarResource } from '@/lib/apple-caldav/ics';
import { buildInstantCalendarItemPayload } from '@/lib/apple-caldav/mapper';
import { getAppleCalendarSyncPollPlan } from '@/lib/apple-caldav/polling';
import {
    acquireCalendarSyncLock,
    createSyncRun,
    getCalendarSyncAccount,
    listCalendarSyncAccounts,
    listCalendarSyncCalendars,
    listRecentSyncRuns,
    markImportedCalendarItemsDeletedByRemoteUrls,
    releaseCalendarSyncLock,
    replaceCalendarSyncCalendars,
    updateSyncRun,
    upsertCalendarSyncAccount,
    upsertImportedCalendarItems,
} from '@/lib/apple-caldav/repository';

export function shouldForceRepair(calendar: any, account: any, trigger: string | undefined, now: Date) {
    if (trigger === 'repair') return true;
    const intervalHours = account.repairScanIntervalHours || getDefaultRepairScanIntervalHours();
    if (!calendar.lastSuccessfulSyncAt) return true;
    const lastSuccessfulMs = new Date(calendar.lastSuccessfulSyncAt).getTime();
    if (Number.isNaN(lastSuccessfulMs)) return true;
    return now.getTime() - lastSuccessfulMs >= intervalHours * 60 * 60 * 1000;
}

function mergeDiscoveredCalendars(account: any, existingCalendars: any[], discoveredCalendars: any[], nowIso: string) {
    const existingByRemoteId = new Map(existingCalendars.map((calendar: any) => [calendar.remoteCalendarId, calendar]));
    const selectedIds = new Set(
        Array.isArray(account.selectedCalendarIds) && account.selectedCalendarIds.length > 0
            ? account.selectedCalendarIds
            : existingCalendars.filter((calendar: any) => calendar.isEnabled).map((calendar: any) => calendar.remoteCalendarId)
    );

    const merged = discoveredCalendars.map((calendar: any) => {
        const existing = existingByRemoteId.get(calendar.remoteCalendarId);
        return {
            ...existing,
            ...calendar,
            accountId: account.id,
            createdAt: existing?.createdAt || nowIso,
            isEnabled: selectedIds.has(calendar.remoteCalendarId) && account.status === 'active',
            lastCtag: calendar.ctag || existing?.lastCtag || '',
            lastSeenAt: nowIso,
            lastSuccessfulSyncAt: existing?.lastSuccessfulSyncAt || '',
            lastSyncToken: calendar.syncToken || existing?.lastSyncToken || '',
            updatedAt: nowIso,
        };
    });

    for (const existing of existingCalendars) {
        if (merged.some((calendar: any) => calendar.remoteCalendarId === existing.remoteCalendarId)) continue;
        merged.push({
            ...existing,
            isEnabled: false,
            updatedAt: nowIso,
        });
    }

    return merged;
}

function persistableCalendarRows(calendars: any[]) {
    return calendars;
}

function lastDiscoveryAtMs(calendars: any[]) {
    return calendars.reduce((latest: number, calendar: any) => {
        const value = new Date(calendar?.lastSeenAt || '').getTime();
        if (Number.isNaN(value)) return latest;
        return Math.max(latest, value);
    }, 0);
}

function latestTimestampIso(...values: Array<string | undefined | null>) {
    let bestIso = '';
    let bestMs = 0;
    for (const value of values) {
        const parsed = new Date(value || '').getTime();
        if (Number.isNaN(parsed) || parsed < bestMs) continue;
        bestMs = parsed;
        bestIso = value || '';
    }
    return bestIso;
}

export function shouldRefreshAppleCalendarDiscovery(input: {
    account: any;
    calendars: any[];
    now?: Date;
    discoveryRefreshMs?: number;
}) {
    const account = input.account || {};
    const calendars = Array.isArray(input.calendars) ? input.calendars : [];

    if (!account.appleCalendarHomeUrl) {
        return { refresh: true, reason: 'missing_calendar_home_url' as const };
    }
    if (calendars.length === 0) {
        return { refresh: true, reason: 'no_cached_calendars' as const };
    }
    if (calendars.some((calendar: any) => calendar.isEnabled && !calendar.remoteUrl)) {
        return { refresh: true, reason: 'missing_calendar_url' as const };
    }

    const latestDiscoveryMs = lastDiscoveryAtMs(calendars);
    if (latestDiscoveryMs <= 0) {
        return { refresh: true, reason: 'missing_discovery_timestamp' as const };
    }

    const nowMs = (input.now || new Date()).getTime();
    const discoveryRefreshMs = input.discoveryRefreshMs || getCalendarSyncDiscoveryRefreshMs();
    if (nowMs - latestDiscoveryMs >= discoveryRefreshMs) {
        return { refresh: true, reason: 'stale_cached_discovery' as const };
    }

    return { refresh: false, reason: 'fresh_cached_discovery' as const };
}

async function recordAppleCalendarPollHeartbeat(account: any, atIso: string) {
    await upsertCalendarSyncAccount({
        ...account,
        lastAttemptedSyncAt: atIso,
        updatedAt: atIso,
    });
}

export function deriveSelectedCalendarIdsForConnect(input: {
    existingAccount?: any;
    existingCalendars?: any[];
}) {
    const existingAccount = input.existingAccount || null;
    const existingCalendars = Array.isArray(input.existingCalendars) ? input.existingCalendars : [];

    if (Array.isArray(existingAccount?.selectedCalendarIds)) {
        return existingAccount.selectedCalendarIds.map(String).filter(Boolean);
    }

    return existingCalendars
        .filter((calendar: any) => calendar.isEnabled)
        .map((calendar: any) => String(calendar.remoteCalendarId || '').trim())
        .filter(Boolean);
}

export async function connectAppleCalendarAccount(input: { username: string; appSpecificPassword: string; accountLabel?: string }) {
    const discovery = await discoverAppleCalendars({
        username: input.username,
        password: input.appSpecificPassword,
    });
    const encrypted = encryptCalendarCredential(input.appSpecificPassword);
    const nowIso = new Date().toISOString();
    const existingAccounts = (await listCalendarSyncAccounts()) as any[];
    const existingAccount = existingAccounts.find((entry: any) => entry.provider === APPLE_CALDAV_PROVIDER) || null;
    const existingCalendars = existingAccount ? ((await listCalendarSyncCalendars(existingAccount.id)) as any[]) : [];
    const selectedCalendarIds = deriveSelectedCalendarIdsForConnect({
        existingAccount,
        existingCalendars,
    });
    const accountId = await upsertCalendarSyncAccount({
        accountLabel: input.accountLabel || 'Apple Calendar',
        appleCalendarHomeUrl: discovery.calendarHomeUrl,
        applePrincipalUrl: discovery.principalUrl,
        createdAt: existingAccount?.createdAt || nowIso,
        passwordCiphertext: encrypted.ciphertext,
        passwordKeyVersion: encrypted.keyVersion,
        provider: APPLE_CALDAV_PROVIDER,
        repairScanIntervalHours: getDefaultRepairScanIntervalHours(),
        selectedCalendarIds,
        status: 'active',
        syncWindowFutureDays: getDefaultSyncWindowFutureDays(),
        syncWindowPastDays: getDefaultSyncWindowPastDays(),
        updatedAt: nowIso,
        username: input.username,
    });
    const calendars = mergeDiscoveredCalendars({
        id: accountId,
        selectedCalendarIds,
        status: 'active',
    }, existingCalendars, discovery.calendars, nowIso);
    await replaceCalendarSyncCalendars(accountId, persistableCalendarRows(calendars));
    return {
        accountId,
        discovery,
    };
}

export async function getAppleCalendarSyncStatus() {
    const serverNow = new Date().toISOString();
    const accounts = (await listCalendarSyncAccounts()) as any[];
    const account = accounts.find((entry: any) => entry.provider === APPLE_CALDAV_PROVIDER) || null;
    if (!account) {
        return {
            configured: false,
            serverNow,
            account: null,
            calendars: [],
            lastRun: null,
            polling: null,
        };
    }
    const calendars = (await listCalendarSyncCalendars(account.id)).filter((calendar: any) => !isIgnoredAppleCalendarDisplayName(calendar.displayName));
    const runs = await listRecentSyncRuns(account.id, 10);
    const pollPlan = getAppleCalendarSyncPollPlan({
        trigger: 'cron',
        recentRuns: runs,
        now: new Date(),
    });
    return {
        configured: true,
        serverNow,
        account,
        calendars,
        lastRun: runs[0] || null,
        polling: {
            due: pollPlan.due,
            lastSuccessfulPollAt: latestTimestampIso(account.lastAttemptedSyncAt, account.lastSuccessfulSyncAt),
            nextPollAt: pollPlan.nextPollAt,
            nextPollInMs: pollPlan.nextPollInMs,
            pollIntervalMs: pollPlan.intervalMs,
            pollReason: pollPlan.reason,
            quietStreak: pollPlan.quietStreak,
            failureStreak: pollPlan.failureStreak,
        },
    };
}

export async function updateAppleCalendarSyncSettings(input: {
    accountId: string;
    selectedCalendarIds: string[];
    enabled: boolean;
    syncWindowPastDays?: number;
    syncWindowFutureDays?: number;
}) {
    const account = await getCalendarSyncAccount(input.accountId) as any;
    if (!account) {
        throw new Error('Calendar sync account not found');
    }

    const allCalendars = (await listCalendarSyncCalendars(input.accountId)) as any[];
    const selected = new Set(input.selectedCalendarIds || []);
    const nowIso = new Date().toISOString();

    await upsertCalendarSyncAccount({
        ...account,
        status: input.enabled ? 'active' : 'disabled',
        selectedCalendarIds: Array.from(selected),
        syncWindowPastDays: input.syncWindowPastDays || account.syncWindowPastDays || getDefaultSyncWindowPastDays(),
        syncWindowFutureDays: input.syncWindowFutureDays || account.syncWindowFutureDays || getDefaultSyncWindowFutureDays(),
        updatedAt: nowIso,
    });

    await replaceCalendarSyncCalendars(
        input.accountId,
        allCalendars.map((calendar: any) => ({
            ...calendar,
            isEnabled: selected.has(calendar.remoteCalendarId) && input.enabled,
            updatedAt: nowIso,
        }))
    );
}

export async function runAppleCalendarSync(input: { accountId?: string; trigger?: string }) {
    const status = await getAppleCalendarSyncStatus();
    const account = (input.accountId
        ? await getCalendarSyncAccount(input.accountId)
        : status.account) as any;
    const requestAtIso = new Date().toISOString();

    if (!account) {
        throw new Error('Apple Calendar sync is not configured');
    }
    if (account.status !== 'active') {
        await recordAppleCalendarPollHeartbeat(account, requestAtIso);
        return {
            checkedAt: requestAtIso,
            skipped: true,
            reason: 'disabled',
            pollIntervalMs: getCalendarSyncActivePollMs(),
        };
    }

    const recentRuns = await listRecentSyncRuns(account.id, 10);
    const preRunPollPlan = getAppleCalendarSyncPollPlan({
        trigger: input.trigger,
        recentRuns,
        now: new Date(),
    });
    if (!preRunPollPlan.due) {
        await recordAppleCalendarPollHeartbeat(account, requestAtIso);
        return {
            checkedAt: requestAtIso,
            skipped: true,
            reason: 'not_due',
            nextPollAt: preRunPollPlan.nextPollAt,
            nextPollInMs: preRunPollPlan.nextPollInMs,
            pollIntervalMs: preRunPollPlan.intervalMs,
            pollReason: preRunPollPlan.reason,
            quietStreak: preRunPollPlan.quietStreak,
            failureStreak: preRunPollPlan.failureStreak,
        };
    }

    const lockKey = `calendar-sync:apple:${account.id}`;
    const owner = randomUUID();
    const lock = await acquireCalendarSyncLock(lockKey, owner, new Date(Date.now() + getCalendarSyncLockTtlMs()).toISOString());
    if (!lock.acquired) {
        await recordAppleCalendarPollHeartbeat(account, requestAtIso);
        return { checkedAt: requestAtIso, skipped: true, reason: 'already_running' };
    }

    const startedAt = new Date();
    const runId = await createSyncRun({
        accountId: account.id,
        provider: APPLE_CALDAV_PROVIDER,
        status: 'running',
        trigger: input.trigger || 'manual',
        startedAt: startedAt.toISOString(),
    });

    try {
        const password = decryptCalendarCredential(account.passwordCiphertext);
        const now = new Date();
        const nowIso = now.toISOString();
        const window = getCalendarSyncWindow(
            now,
            account.syncWindowPastDays || getDefaultSyncWindowPastDays(),
            account.syncWindowFutureDays || getDefaultSyncWindowFutureDays()
        );
        const existingCalendars = ((await listCalendarSyncCalendars(account.id)) as any[]).filter((calendar: any) => !isIgnoredAppleCalendarDisplayName(calendar.displayName));
        const discoveryPlan = shouldRefreshAppleCalendarDiscovery({
            account,
            calendars: existingCalendars,
            now,
        });
        let discovery = {
            principalUrl: account.applePrincipalUrl || '',
            calendarHomeUrl: account.appleCalendarHomeUrl || '',
            calendars: existingCalendars,
        };
        let calendars = existingCalendars.map((calendar: any) => ({ ...calendar }));

        if (discoveryPlan.refresh) {
            discovery = await discoverAppleCalendars({
                username: account.username,
                password,
                principalUrl: account.applePrincipalUrl || '',
                calendarHomeUrl: account.appleCalendarHomeUrl || '',
            });
            calendars = mergeDiscoveredCalendars(account, existingCalendars, discovery.calendars, nowIso);
            await replaceCalendarSyncCalendars(account.id, persistableCalendarRows(calendars));
        }

        let remoteEventsFetched = 0;
        let eventsCreated = 0;
        let eventsUpdated = 0;
        let eventsUnchanged = 0;
        let eventsCancelled = 0;
        let eventsMarkedDeleted = 0;

        for (const calendar of calendars.filter((entry: any) => entry.isEnabled && entry.remoteUrl && !isIgnoredAppleCalendarDisplayName(entry.displayName))) {
            try {
                const forceRepair = shouldForceRepair(calendar, account, input.trigger, now);

                let remoteEventsResult;
                let collectionMetadata: any = null;
                const shouldUseIncremental = !forceRepair && Boolean(calendar.lastSyncToken);
                try {
                    remoteEventsResult = await fetchCalendarEvents({
                        username: account.username,
                        password,
                        calendarUrl: calendar.remoteUrl,
                        rangeStartIso: window.rangeStartIso,
                        rangeEndIso: window.rangeEndIso,
                        syncToken: shouldUseIncremental ? calendar.lastSyncToken : '',
                    });
                    if (shouldUseIncremental && remoteEventsResult.events.length === 0 && remoteEventsResult.deletedHrefs.length === 0) {
                        collectionMetadata = await fetchCalendarCollectionMetadata({
                            username: account.username,
                            password,
                            calendarUrl: calendar.remoteUrl,
                        });
                        const ctagChanged =
                            Boolean(collectionMetadata?.ctag) &&
                            String(collectionMetadata.ctag) !== String(calendar.lastCtag || '');
                        const syncTokenChanged =
                            Boolean(collectionMetadata?.syncToken) &&
                            String(collectionMetadata.syncToken) !== String(calendar.lastSyncToken || '');

                        if (ctagChanged || syncTokenChanged) {
                            remoteEventsResult = await fetchCalendarEvents({
                                username: account.username,
                                password,
                                calendarUrl: calendar.remoteUrl,
                                rangeStartIso: window.rangeStartIso,
                                rangeEndIso: window.rangeEndIso,
                            });
                        }
                    }
                } catch (error: any) {
                    if (error?.code !== 'invalid_sync_token') {
                        throw error;
                    }
                    remoteEventsResult = await fetchCalendarEvents({
                        username: account.username,
                        password,
                        calendarUrl: calendar.remoteUrl,
                        rangeStartIso: window.rangeStartIso,
                        rangeEndIso: window.rangeEndIso,
                    });
                }

                remoteEventsFetched += remoteEventsResult.events.length;
                const seenSourceExternalIds = new Set<string>();
                const normalizedItems = remoteEventsResult.events.flatMap((remoteEvent: any) => {
                    const parsed = parseCalendarResource({
                        accountId: account.id,
                        calendarId: calendar.remoteCalendarId,
                        calendarName: calendar.displayName,
                        href: remoteEvent.href,
                        etag: remoteEvent.etag,
                        ctag: calendar.lastCtag || '',
                        ics: remoteEvent.ics,
                        rangeStart: window.rangeStart,
                        rangeEnd: window.rangeEnd,
                        fallbackTimeZone: calendar.timeZone,
                    });
                    return parsed.map((entry: any) => {
                        const payload = buildInstantCalendarItemPayload(entry, nowIso);
                        seenSourceExternalIds.add(payload.sourceExternalId);
                        return payload;
                    });
                });

                const stats = await upsertImportedCalendarItems({
                    accountId: account.id,
                    calendarId: calendar.remoteCalendarId,
                    calendarName: calendar.displayName,
                    ctag: calendar.lastCtag || '',
                    items: normalizedItems,
                    seenSourceExternalIds,
                    nowIso,
                    rangeStart: window.rangeStart,
                    rangeEnd: window.rangeEnd,
                    markMissingAsDeleted: remoteEventsResult.mode === 'full',
                    hardDeleteMissingRows: input.trigger === 'repair',
                });
                eventsCreated += stats.eventsCreated;
                eventsUpdated += stats.eventsUpdated;
                eventsUnchanged += stats.eventsUnchanged;
                eventsCancelled += stats.eventsCancelled;
                eventsMarkedDeleted += stats.eventsMarkedDeleted;

                if (remoteEventsResult.deletedHrefs.length > 0) {
                    const deletedStats = await markImportedCalendarItemsDeletedByRemoteUrls({
                        accountId: account.id,
                        calendarId: calendar.remoteCalendarId,
                        remoteUrls: remoteEventsResult.deletedHrefs,
                        nowIso,
                    });
                    eventsMarkedDeleted += deletedStats.eventsMarkedDeleted;
                }

                calendar.lastSuccessfulSyncAt = nowIso;
                calendar.lastSyncToken = remoteEventsResult.nextSyncToken || collectionMetadata?.syncToken || calendar.lastSyncToken || '';
                calendar.lastCtag = collectionMetadata?.ctag || calendar.lastCtag || '';
                calendar.updatedAt = nowIso;
            } catch (error: any) {
                const detail = [
                    `Apple calendar "${calendar.displayName || calendar.remoteCalendarId}"`,
                    `(${calendar.remoteCalendarId})`,
                ].join(' ');
                throw new Error(`Failed syncing ${detail}: ${error?.message || 'Unknown error'}`);
            }
        }

        await replaceCalendarSyncCalendars(account.id, persistableCalendarRows(calendars));

        const finishedAtIso = new Date().toISOString();
        await updateSyncRun(runId, {
            calendarsProcessed: calendars.filter((entry: any) => entry.isEnabled).length,
            durationMs: Date.now() - startedAt.getTime(),
            eventsCancelled,
            eventsCreated,
            eventsMarkedDeleted,
            eventsUnchanged,
            eventsUpdated,
            finishedAt: finishedAtIso,
            remoteEventsFetched,
            status: 'success',
        });
        await upsertCalendarSyncAccount({
            ...account,
            appleCalendarHomeUrl: discovery.calendarHomeUrl || account.appleCalendarHomeUrl || '',
            applePrincipalUrl: discovery.principalUrl || account.applePrincipalUrl || '',
            lastAttemptedSyncAt: finishedAtIso,
            lastErrorAt: '',
            lastErrorCode: '',
            lastErrorMessage: '',
            lastSuccessfulSyncAt: finishedAtIso,
            updatedAt: finishedAtIso,
        });

        const nextPollPlan = getAppleCalendarSyncPollPlan({
            trigger: 'cron',
            recentRuns: [{
                status: 'success',
                startedAt: startedAt.toISOString(),
                finishedAt: finishedAtIso,
                eventsCreated,
                eventsUpdated,
                eventsCancelled,
                eventsMarkedDeleted,
            }, ...recentRuns],
            now: new Date(finishedAtIso),
        });

        return {
            skipped: false,
            runId,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAtIso,
            status: 'success',
            calendarsProcessed: calendars.filter((entry: any) => entry.isEnabled).length,
            remoteEventsFetched,
            eventsCreated,
            eventsUpdated,
            eventsUnchanged,
            eventsCancelled,
            eventsMarkedDeleted,
            nextPollAt: nextPollPlan.nextPollAt,
            nextPollInMs: nextPollPlan.nextPollInMs,
            pollIntervalMs: nextPollPlan.intervalMs,
            pollReason: nextPollPlan.reason,
        };
    } catch (error: any) {
        const finishedAtIso = new Date().toISOString();
        await updateSyncRun(runId, {
            durationMs: Date.now() - startedAt.getTime(),
            errorCode: String(error?.status || 'sync_failed'),
            errorMessage: String(error?.message || 'Sync failed'),
            finishedAt: finishedAtIso,
            status: 'failed',
        });
        await upsertCalendarSyncAccount({
            ...account,
            appleCalendarHomeUrl: account.appleCalendarHomeUrl || '',
            applePrincipalUrl: account.applePrincipalUrl || '',
            lastAttemptedSyncAt: finishedAtIso,
            lastErrorAt: finishedAtIso,
            lastErrorCode: String(error?.status || 'sync_failed'),
            lastErrorMessage: String(error?.message || 'Sync failed'),
            updatedAt: finishedAtIso,
        });
        throw error;
    } finally {
        await releaseCalendarSyncLock(lock.lockId);
    }
}
