'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { CALENDAR_SYNC_PARENT_TOKEN_HEADER } from '@/lib/calendar-sync-constants';
import { getCachedToken } from '@/lib/instant-principal-storage';

interface SyncCalendarRow {
    id?: string;
    remoteCalendarId: string;
    displayName: string;
    isEnabled?: boolean;
}

interface SyncStatus {
    configured: boolean;
    serverNow?: string;
    account: null | {
        id: string;
        status?: string;
        username?: string;
        accountLabel?: string;
        lastAttemptedSyncAt?: string;
        lastSuccessfulSyncAt?: string;
        lastErrorAt?: string;
        lastErrorMessage?: string;
    };
    calendars: SyncCalendarRow[];
    lastRun: null | {
        status?: string;
        errorMessage?: string;
        startedAt?: string;
        finishedAt?: string;
        trigger?: string;
    };
    polling: null | {
        due?: boolean;
        lastSuccessfulPollAt?: string;
        nextPollAt?: string;
        nextPollInMs?: number;
        pollIntervalMs?: number;
        pollReason?: string;
        quietStreak?: number;
        failureStreak?: number;
    };
}

function isPollingHeartbeatOverdue(polling: SyncStatus['polling'], nowMs = Date.now()) {
    if (!polling?.lastSuccessfulPollAt) return false;
    const lastPollMs = new Date(polling.lastSuccessfulPollAt).getTime();
    if (Number.isNaN(lastPollMs)) return false;

    const nextPollMs = new Date(polling.nextPollAt || '').getTime();
    if (!Number.isNaN(nextPollMs)) {
        return nowMs > nextPollMs + 60_000;
    }

    const intervalMs = Math.max(15_000, Number(polling.pollIntervalMs) || 0);
    return nowMs - lastPollMs > intervalMs + 60_000;
}

function formatRelativeDate(value: string | undefined | null, nowMs = Date.now()) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    const diffMs = date.getTime() - nowMs;
    const absMs = Math.abs(diffMs);
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (absMs < 60_000) return rtf.format(Math.round(diffMs / 1000), 'second');
    if (absMs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), 'minute');
    if (absMs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
    return rtf.format(Math.round(diffMs / 86_400_000), 'day');
}

function formatDateWithRelative(value: string | undefined | null, nowMs = Date.now()) {
    if (!value) return 'Never';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return `${date.toLocaleString()} (${formatRelativeDate(value, nowMs)})`;
}

function formatDurationMs(value: number | undefined | null) {
    if (!value || value <= 0) return 'Right away';
    if (value < 60_000) return `${Math.round(value / 1000)}s`;
    if (value < 3_600_000) return `${Math.round(value / 60_000)}m`;
    if (value < 86_400_000) return `${Math.round(value / 3_600_000)}h`;
    return `${Math.round(value / 86_400_000)}d`;
}

function pollReasonLabel(value: string | undefined) {
    switch (value) {
        case 'recent_changes':
            return 'Active polling after recent changes';
        case 'idle_backoff':
            return 'Light backoff while calendars stay quiet';
        case 'idle_backoff_deep':
            return 'Deep backoff while calendars stay quiet';
        case 'error_backoff':
            return 'Retry backoff after recent errors';
        case 'first_run':
            return 'Waiting for the first poll';
        case 'manual':
            return 'Manual sync requested';
        case 'repair':
            return 'Repair scan requested';
        default:
            return 'Standard polling cadence';
    }
}

function runTriggerLabel(value: string | undefined) {
    switch (value) {
        case 'manual':
            return 'Manual sync';
        case 'repair':
            return 'Sync and rewrite';
        case 'cron':
            return 'Background sync';
        default:
            return 'Sync run';
    }
}

async function parseJson(response: Response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(body?.message || body?.error || `Request failed (${response.status})`);
        (error as any).status = response.status;
        (error as any).reason = body?.reason;
        (error as any).data = body;
        throw error;
    }
    return body;
}

function calendarSyncHeaders(extraHeaders?: Record<string, string>) {
    const parentToken = getCachedToken('parent');
    return {
        ...(extraHeaders || {}),
        ...(parentToken ? { [CALENDAR_SYNC_PARENT_TOKEN_HEADER]: parentToken } : {}),
    };
}

export default function AppleCalendarSyncSettings() {
    const { toast } = useToast();
    const [status, setStatus] = useState<SyncStatus | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [relativeNowMs, setRelativeNowMs] = useState(() => Date.now());
    const [serverNowAnchor, setServerNowAnchor] = useState(() => ({
        serverNowMs: Date.now(),
        clientReceivedMs: Date.now(),
    }));
    const [isEditingCredentials, setIsEditingCredentials] = useState(false);
    const [credentialsDirty, setCredentialsDirty] = useState(false);
    const [calendarSelectionDirty, setCalendarSelectionDirty] = useState(false);
    const [isSavingCalendarSelection, setIsSavingCalendarSelection] = useState(false);
    const [savedSelectedCalendarIds, setSavedSelectedCalendarIds] = useState<string[]>([]);
    const credentialsDirtyRef = useRef(false);
    const calendarSelectionDirtyRef = useRef(false);
    const calendarSelectionSaveSeqRef = useRef(0);
    const [form, setForm] = useState({
        username: '',
        appSpecificPassword: '',
        accountLabel: 'Apple Calendar',
        selectedCalendarIds: [] as string[],
    });

    const selectedCount = form.selectedCalendarIds.length;
    const savedSelectedCalendarIdsKey = useMemo(
        () => [...savedSelectedCalendarIds].sort().join('|'),
        [savedSelectedCalendarIds]
    );
    const formSelectedCalendarIdsKey = useMemo(
        () => [...form.selectedCalendarIds].sort().join('|'),
        [form.selectedCalendarIds]
    );
    const calendars = useMemo(() => {
        const seen = new Set<string>();
        return (status?.calendars || [])
            .filter((calendar) => {
                const key = String(calendar.remoteCalendarId || '').trim();
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .sort((left, right) => {
                const selectedDiff = Number(form.selectedCalendarIds.includes(right.remoteCalendarId)) - Number(form.selectedCalendarIds.includes(left.remoteCalendarId));
                if (selectedDiff !== 0) return selectedDiff;
                return String(left.displayName || '').localeCompare(String(right.displayName || ''));
            });
    }, [form.selectedCalendarIds, status?.calendars]);

    const loadStatus = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
        if (!silent) {
            setIsLoading(true);
        }
        try {
            const nextStatus = await parseJson(await fetch('/api/calendar-sync/apple/status', {
                cache: 'no-store',
                headers: calendarSyncHeaders(),
            }));
            const serverNowMs = new Date(nextStatus?.serverNow || '').getTime();
            if (Number.isFinite(serverNowMs)) {
                setServerNowAnchor({
                    serverNowMs,
                    clientReceivedMs: Date.now(),
                });
            }
            setStatus(nextStatus);
            const nextSelectedCalendarIds = (nextStatus?.calendars || [])
                .filter((calendar: SyncCalendarRow) => calendar.isEnabled)
                .map((calendar: SyncCalendarRow) => calendar.remoteCalendarId);
            if (!calendarSelectionDirtyRef.current) {
                setSavedSelectedCalendarIds(nextSelectedCalendarIds);
            }
            setForm((current) => ({
                ...current,
                username: silent && credentialsDirtyRef.current ? current.username : (nextStatus?.account?.username || current.username),
                accountLabel: silent && credentialsDirtyRef.current ? current.accountLabel : (nextStatus?.account?.accountLabel || current.accountLabel),
                selectedCalendarIds: silent && calendarSelectionDirtyRef.current ? current.selectedCalendarIds : nextSelectedCalendarIds,
            }));
        } catch (error: any) {
            if (!silent) {
                toast({
                    title: 'Unable to load Apple Calendar sync',
                    description: error?.message || 'Please try again.',
                    variant: 'destructive',
                });
            }
        } finally {
            if (!silent) {
                setIsLoading(false);
            }
        }
    }, [toast]);

    useEffect(() => {
        credentialsDirtyRef.current = credentialsDirty;
    }, [credentialsDirty]);

    useEffect(() => {
        calendarSelectionDirtyRef.current = calendarSelectionDirty;
    }, [calendarSelectionDirty]);

    useEffect(() => {
        void loadStatus();
        const intervalId = window.setInterval(() => {
            void loadStatus({ silent: true });
        }, 15_000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [loadStatus]);

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setRelativeNowMs(Date.now());
        }, 30_000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);

    const referenceNowMs = useMemo(() => {
        if (!Number.isFinite(serverNowAnchor.serverNowMs)) return relativeNowMs;
        return serverNowAnchor.serverNowMs + Math.max(0, relativeNowMs - serverNowAnchor.clientReceivedMs);
    }, [relativeNowMs, serverNowAnchor.clientReceivedMs, serverNowAnchor.serverNowMs]);

    useEffect(() => {
        if (!status?.configured) {
            setIsEditingCredentials(true);
            setCredentialsDirty(false);
            setCalendarSelectionDirty(false);
            setSavedSelectedCalendarIds([]);
        }
    }, [status?.configured]);

    const syncSummary = useMemo(() => {
        if (!status?.configured) {
            return {
                tone: 'bg-slate-100 text-slate-700',
                label: 'Not connected',
                body: 'Connect Apple Calendar to start importing events.',
            };
        }
        if (isPending) {
            return {
                tone: 'bg-amber-100 text-amber-700',
                label: 'Working',
                body: 'Refreshing status or running a sync now.',
            };
        }
        if (status?.lastRun?.status === 'running') {
            return {
                tone: 'bg-sky-100 text-sky-700',
                label: 'Sync in progress',
                body: 'The server is currently processing Apple calendar changes.',
            };
        }
        if (status?.lastRun?.status === 'failed' || status?.account?.lastErrorMessage) {
            return {
                tone: 'bg-rose-100 text-rose-700',
                label: 'Needs attention',
                body: status?.account?.lastErrorMessage || status?.lastRun?.errorMessage || 'The most recent sync failed.',
            };
        }
        if (isPollingHeartbeatOverdue(status?.polling, referenceNowMs)) {
            return {
                tone: 'bg-amber-100 text-amber-700',
                label: 'Polling overdue',
                body: 'The background poller has not checked in on schedule. Near-real-time sync only works while the worker or cron is running.',
            };
        }
        if (status?.polling?.pollReason === 'error_backoff') {
            return {
                tone: 'bg-amber-100 text-amber-700',
                label: 'Retry backoff',
                body: 'Polling is active, but the server is spacing checks out after recent errors.',
            };
        }
        if (status?.polling?.pollReason?.startsWith('idle_backoff')) {
            return {
                tone: 'bg-emerald-100 text-emerald-700',
                label: 'Healthy',
                body: 'Polling is healthy and backing off because Apple calendars have been quiet.',
            };
        }
        return {
            tone: 'bg-emerald-100 text-emerald-700',
            label: 'Healthy',
            body: 'Polling is healthy and ready to pick up new Apple changes quickly.',
        };
    }, [
        isPending,
        status?.account?.lastErrorMessage,
        status?.configured,
        status?.lastRun?.errorMessage,
        status?.lastRun?.status,
        status?.polling,
        status?.polling?.pollReason,
        referenceNowMs,
    ]);

    async function handleConnect() {
        startTransition(async () => {
            try {
                await parseJson(
                    await fetch('/api/calendar-sync/apple/connect', {
                        method: 'POST',
                        headers: calendarSyncHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            username: form.username,
                            appSpecificPassword: form.appSpecificPassword,
                            accountLabel: form.accountLabel,
                        }),
                    })
                );
                setForm((current) => ({ ...current, appSpecificPassword: '' }));
                setIsEditingCredentials(false);
                setCredentialsDirty(false);
                setCalendarSelectionDirty(false);
                await loadStatus();
                toast({ title: 'Apple Calendar credentials saved' });
            } catch (error: any) {
                toast({
                    title: 'Connection failed',
                    description: error?.message || 'Please check your Apple ID and app-specific password.',
                    variant: 'destructive',
                });
            }
        });
    }

    async function handleSaveCalendars() {
        if (!status?.account?.id) return;
        startTransition(async () => {
            try {
                const selectedCalendarIds = [...form.selectedCalendarIds];
                await parseJson(
                    await fetch('/api/calendar-sync/apple/settings', {
                        method: 'POST',
                        headers: calendarSyncHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            accountId: status.account?.id,
                            selectedCalendarIds,
                            enabled: true,
                        }),
                    })
                );
                setCalendarSelectionDirty(false);
                setSavedSelectedCalendarIds(selectedCalendarIds);
                setStatus((current) => {
                    if (!current) return current;
                    return {
                        ...current,
                        calendars: (current.calendars || []).map((calendar) => ({
                            ...calendar,
                            isEnabled: selectedCalendarIds.includes(calendar.remoteCalendarId),
                        })),
                    };
                });
                toast({ title: 'Calendar selection saved' });
                void loadStatus({ silent: true });
            } catch (error: any) {
                toast({
                    title: 'Could not save calendars',
                    description: error?.message || 'Please try again.',
                    variant: 'destructive',
                });
            }
        });
    }

    const persistCalendarSelection = useCallback((selectedCalendarIds: string[]) => {
        if (!status?.account?.id) return;
        const saveSeq = calendarSelectionSaveSeqRef.current + 1;
        calendarSelectionSaveSeqRef.current = saveSeq;
        setIsSavingCalendarSelection(true);
        setCalendarSelectionDirty(true);
        void (async () => {
            try {
                await parseJson(
                    await fetch('/api/calendar-sync/apple/settings', {
                        method: 'POST',
                        headers: calendarSyncHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            accountId: status.account?.id,
                            selectedCalendarIds,
                            enabled: true,
                        }),
                    })
                );
                if (calendarSelectionSaveSeqRef.current !== saveSeq) return;
                setSavedSelectedCalendarIds(selectedCalendarIds);
                setCalendarSelectionDirty(false);
                setStatus((current) => {
                    if (!current) return current;
                    return {
                        ...current,
                        calendars: (current.calendars || []).map((calendar) => ({
                            ...calendar,
                            isEnabled: selectedCalendarIds.includes(calendar.remoteCalendarId),
                        })),
                    };
                });
                void loadStatus({ silent: true });
            } catch (error: any) {
                if (calendarSelectionSaveSeqRef.current !== saveSeq) return;
                toast({
                    title: 'Could not save calendars',
                    description: error?.message || 'Please try again.',
                    variant: 'destructive',
                });
            } finally {
                if (calendarSelectionSaveSeqRef.current === saveSeq) {
                    setIsSavingCalendarSelection(false);
                }
            }
        })();
    }, [loadStatus, status?.account?.id, toast]);

    async function handleRunSync(trigger: 'manual' | 'repair') {
        if (!status?.account?.id) return;
        startTransition(async () => {
            try {
                const result = await parseJson(
                    await fetch('/api/calendar-sync/apple/run', {
                        method: 'POST',
                        headers: calendarSyncHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({
                            accountId: status.account.id,
                            trigger,
                        }),
                    })
                );
                const completedAtIso = result?.finishedAt || result?.checkedAt || new Date().toISOString();
                const completedAtMs = new Date(completedAtIso).getTime();
                if (Number.isFinite(completedAtMs)) {
                    setServerNowAnchor({
                        serverNowMs: completedAtMs,
                        clientReceivedMs: Date.now(),
                    });
                }
                setStatus((current) => {
                    if (!current?.account) return current;
                    return {
                        ...current,
                        serverNow: completedAtIso,
                        account: {
                            ...current.account,
                            lastAttemptedSyncAt: completedAtIso,
                            lastSuccessfulSyncAt: result?.skipped ? current.account.lastSuccessfulSyncAt : completedAtIso,
                            lastErrorAt: result?.skipped ? current.account.lastErrorAt : '',
                            lastErrorMessage: result?.skipped ? current.account.lastErrorMessage : '',
                        },
                        lastRun: result?.skipped
                            ? current.lastRun
                            : {
                                ...(current.lastRun || {}),
                                status: 'success',
                                errorMessage: '',
                                finishedAt: completedAtIso,
                                startedAt: completedAtIso,
                            },
                        polling: current.polling
                            ? {
                                ...current.polling,
                                lastSuccessfulPollAt: completedAtIso,
                                nextPollAt: result?.nextPollAt || current.polling.nextPollAt,
                                nextPollInMs: typeof result?.nextPollInMs === 'number' ? result.nextPollInMs : current.polling.nextPollInMs,
                                pollIntervalMs: typeof result?.pollIntervalMs === 'number' ? result.pollIntervalMs : current.polling.pollIntervalMs,
                                pollReason: result?.pollReason || current.polling.pollReason,
                            }
                            : current.polling,
                    };
                });
                window.setTimeout(() => {
                    void loadStatus({ silent: true });
                }, 2_000);

                const summary = result?.skipped
                    ? 'No sync work was needed.'
                    : `${Number(result?.eventsCreated || 0)} created, ${Number(result?.eventsUpdated || 0)} updated, ${Number(result?.eventsMarkedDeleted || 0)} removed`;
                toast({
                    title: result?.skipped
                        ? trigger === 'repair'
                            ? 'Apple Calendar rewrite check finished'
                            : 'Apple Calendar check finished'
                        : trigger === 'repair'
                            ? 'Apple Calendar rewrite finished'
                            : 'Apple Calendar sync finished',
                    description: summary,
                });
            } catch (error: any) {
                toast({
                    title: trigger === 'repair' ? 'Sync and rewrite failed' : 'Sync failed',
                    description: error?.message || 'Please try again.',
                    variant: 'destructive',
                });
            }
        });
    }

    return (
        <Card className="border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50">
            <CardHeader>
                <CardTitle>Apple Calendar Sync</CardTitle>
                <CardDescription>
                    Import Apple Calendar events into Family Organizer. Apple-synced events are editable and deletable locally for now, while the server keeps polling Apple in the background.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={() => void loadStatus()} disabled={isLoading || isPending}>
                        {isLoading ? 'Refreshing...' : 'Refresh Status'}
                    </Button>
                    {status?.configured ? (
                        <Button type="button" variant="outline" onClick={() => setIsEditingCredentials((current) => !current)} disabled={isPending}>
                            {isEditingCredentials ? 'Hide Credentials' : 'Update Credentials'}
                        </Button>
                    ) : null}
                    <Button type="button" variant="secondary" onClick={() => void handleRunSync('manual')} disabled={isPending || !status?.account?.id}>
                        Sync Now
                    </Button>
                    <Button type="button" onClick={() => void handleRunSync('repair')} disabled={isPending || !status?.account?.id}>
                        Sync and Rewrite
                    </Button>
                </div>

                {(!status?.configured || isEditingCredentials) ? (
                    <div className="space-y-4 rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">
                                {status?.configured ? 'Update Apple credentials' : 'Connect Apple Calendar'}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                                The app only needs these again if you are connecting the first time or replacing a changed Apple ID/app-specific password.
                            </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="apple-calendar-username">Apple ID Email</Label>
                                <Input
                                    id="apple-calendar-username"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    value={form.username}
                                    onChange={(event) => {
                                        setCredentialsDirty(true);
                                        setForm((current) => ({ ...current, username: event.target.value }));
                                    }}
                                    placeholder="parent@example.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="apple-calendar-password">App-Specific Password</Label>
                                <Input
                                    id="apple-calendar-password"
                                    type="password"
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                    value={form.appSpecificPassword}
                                    onChange={(event) => {
                                        setCredentialsDirty(true);
                                        setForm((current) => ({ ...current, appSpecificPassword: event.target.value }));
                                    }}
                                    placeholder="xxxx-xxxx-xxxx-xxxx"
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {status?.configured ? (
                                <Button type="button" variant="outline" onClick={() => {
                                    setCredentialsDirty(false);
                                    setIsEditingCredentials(false);
                                    void loadStatus({ silent: true });
                                }} disabled={isPending}>
                                    Cancel
                                </Button>
                            ) : null}
                            <Button type="button" onClick={() => void handleConnect()} disabled={isPending}>
                                {status?.configured ? 'Save New Credentials' : 'Connect Apple Calendar'}
                            </Button>
                        </div>
                    </div>
                ) : null}

                <div className="rounded-xl border border-orange-200 bg-white/80 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">
                                {status?.configured ? `Connected as ${status?.account?.username || 'Apple account'}` : 'Not connected yet'}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">{syncSummary.body}</p>
                            <p className="mt-2 text-xs text-slate-500">
                                `Refresh Status` just reloads this panel from the server. `Sync Now` asks the server to run an immediate incremental sync. `Sync and Rewrite` forces a full repair pass and rewrites imported rows if needed.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className={`rounded-full px-3 py-1 text-xs font-semibold ${syncSummary.tone}`}>
                                {syncSummary.label}
                            </div>
                            <div className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                                {selectedCount} calendar{selectedCount === 1 ? '' : 's'} selected
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Last successful sync</p>
                            <p className="mt-2 text-sm font-medium text-slate-900">{formatDateWithRelative(status?.account?.lastSuccessfulSyncAt, referenceNowMs)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Last completed check</p>
                            <p className="mt-2 text-sm font-medium text-slate-900">{formatDateWithRelative(status?.polling?.lastSuccessfulPollAt, referenceNowMs)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Next poll</p>
                            <p className="mt-2 text-sm font-medium text-slate-900">
                                {status?.configured ? formatDateWithRelative(status?.polling?.nextPollAt, referenceNowMs) : 'Waiting for connection'}
                            </p>
                            {status?.polling?.nextPollInMs != null ? (
                                <p className="mt-1 text-xs text-slate-500">About {formatDurationMs(status.polling.nextPollInMs)}</p>
                            ) : null}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Polling mode</p>
                            <p className="mt-2 text-sm font-medium text-slate-900">{pollReasonLabel(status?.polling?.pollReason)}</p>
                            {status?.polling?.pollIntervalMs ? (
                                <p className="mt-1 text-xs text-slate-500">Current interval: {formatDurationMs(status.polling.pollIntervalMs)}</p>
                            ) : null}
                        </div>
                    </div>
                    {status?.lastRun ? (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Last run</p>
                            <p className="mt-2 text-sm font-medium capitalize text-slate-900">
                                {runTriggerLabel(status.lastRun.trigger)}
                                {status.lastRun.finishedAt ? ` • ${formatDateWithRelative(status.lastRun.finishedAt, referenceNowMs)}` : ''}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                {status.lastRun.status === 'success' ? 'Finished successfully' : status.lastRun.status || 'Unknown status'}
                            </p>
                            {status?.account?.lastErrorAt ? (
                                <p className="mt-1 text-xs text-slate-500">Last error seen {formatDateWithRelative(status.account.lastErrorAt, referenceNowMs)}</p>
                            ) : null}
                        </div>
                    ) : null}
                    {status?.lastRun?.errorMessage ? (
                        <p className="mt-3 text-sm font-medium text-rose-600">{status.lastRun.errorMessage}</p>
                    ) : null}
                    <p className="mt-3 text-xs text-slate-500">
                        Background polling only updates when the server worker or cron is hitting the Apple sync route. Quiet calendars also back off to a slower cadence between checks.
                    </p>
                </div>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-slate-900">Imported Calendars</h3>
                        <p className="text-sm text-slate-600">Choose which Apple calendars appear in Family Organizer. Changes save automatically. Apple names are shown exactly as Apple sends them so similar calendars can still be told apart.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {calendars.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-sm text-slate-600">
                                Connect Apple Calendar first to discover calendars you can import.
                            </div>
                        ) : (
                            calendars.map((calendar) => {
                                const checked = form.selectedCalendarIds.includes(calendar.remoteCalendarId);
                                return (
                                    <label
                                        key={calendar.id || calendar.remoteCalendarId}
                                        title={calendar.displayName}
                                        className={`inline-flex max-w-full items-center gap-3 rounded-full border px-4 py-2 text-sm ${
                                            checked
                                                ? 'border-orange-300 bg-orange-100 text-orange-950'
                                                : 'border-slate-200 bg-white text-slate-700'
                                        }`}
                                    >
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={(nextChecked) => {
                                                setCalendarSelectionDirty(true);
                                                setForm((current) => ({
                                                    ...current,
                                                    selectedCalendarIds: nextChecked
                                                        ? [...current.selectedCalendarIds, calendar.remoteCalendarId]
                                                        : current.selectedCalendarIds.filter((item) => item !== calendar.remoteCalendarId),
                                                }));
                                            }}
                                        />
                                        <span className="truncate font-medium">{calendar.displayName}</span>
                                    </label>
                                );
                            })
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <p>{selectedCount} selected</p>
                        <p>{isSavingCalendarSelection ? 'Saving…' : calendarSelectionDirty ? 'Waiting to save…' : 'Saved'}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
