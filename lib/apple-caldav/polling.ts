import 'server-only';

import {
    getCalendarSyncActivePollMs,
    getCalendarSyncErrorPollMs,
    getCalendarSyncMaxErrorPollMs,
    getCalendarSyncMaxIdlePollMs,
} from '@/lib/apple-caldav/config';

function numeric(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function settledRuns(runs: any[]) {
    return runs.filter((run) => ['success', 'partial', 'failed'].includes(String(run?.status || '')));
}

function runFinishedAtMs(run: any) {
    const reference = run?.finishedAt || run?.startedAt || '';
    const value = new Date(reference).getTime();
    return Number.isNaN(value) ? null : value;
}

export function runHasMeaningfulChanges(run: any) {
    return (
        numeric(run?.eventsCreated) +
        numeric(run?.eventsUpdated) +
        numeric(run?.eventsCancelled) +
        numeric(run?.eventsMarkedDeleted)
    ) > 0;
}

function quietSuccessStreak(runs: any[]) {
    let streak = 0;
    for (const run of settledRuns(runs)) {
        if (run?.status !== 'success' || runHasMeaningfulChanges(run)) break;
        streak += 1;
    }
    return streak;
}

function failureStreak(runs: any[]) {
    let streak = 0;
    for (const run of settledRuns(runs)) {
        if (run?.status === 'success') break;
        streak += 1;
    }
    return streak;
}

export function getAppleCalendarSyncPollPlan(input: {
    trigger?: string;
    recentRuns?: any[];
    now?: Date;
    activePollMs?: number;
    maxIdlePollMs?: number;
    errorPollMs?: number;
    maxErrorPollMs?: number;
}) {
    const now = input.now || new Date();
    const nowMs = now.getTime();
    const runs = settledRuns(input.recentRuns || []);
    const activePollMs = input.activePollMs || getCalendarSyncActivePollMs();
    const maxIdlePollMs = input.maxIdlePollMs || getCalendarSyncMaxIdlePollMs();
    const errorPollMs = input.errorPollMs || getCalendarSyncErrorPollMs();
    const maxErrorPollMs = input.maxErrorPollMs || getCalendarSyncMaxErrorPollMs();

    if (input.trigger && input.trigger !== 'cron') {
        return {
            due: true,
            reason: input.trigger,
            intervalMs: activePollMs,
            nextPollAt: now.toISOString(),
            nextPollInMs: 0,
            quietStreak: 0,
            failureStreak: 0,
        };
    }

    const latest = runs[0];
    if (!latest) {
        return {
            due: true,
            reason: 'first_run',
            intervalMs: activePollMs,
            nextPollAt: now.toISOString(),
            nextPollInMs: 0,
            quietStreak: 0,
            failureStreak: 0,
        };
    }

    const latestFinishedAtMs = runFinishedAtMs(latest);
    if (latestFinishedAtMs == null) {
        return {
            due: true,
            reason: 'invalid_last_run',
            intervalMs: activePollMs,
            nextPollAt: now.toISOString(),
            nextPollInMs: 0,
            quietStreak: 0,
            failureStreak: 0,
        };
    }

    const failures = failureStreak(runs);
    const quiet = quietSuccessStreak(runs);

    let intervalMs = activePollMs;
    let reason = 'active';
    if (failures > 0) {
        intervalMs = Math.min(maxErrorPollMs, errorPollMs * 2 ** Math.max(0, failures - 1));
        reason = 'error_backoff';
    } else if (quiet > 0) {
        intervalMs = Math.min(maxIdlePollMs, activePollMs * 2 ** quiet);
        reason = quiet === 1 ? 'idle_backoff' : 'idle_backoff_deep';
    } else {
        reason = 'recent_changes';
    }

    const nextPollMs = latestFinishedAtMs + intervalMs;
    return {
        due: nowMs >= nextPollMs,
        reason,
        intervalMs,
        nextPollAt: new Date(nextPollMs).toISOString(),
        nextPollInMs: Math.max(0, nextPollMs - nowMs),
        quietStreak: quiet,
        failureStreak: failures,
    };
}
