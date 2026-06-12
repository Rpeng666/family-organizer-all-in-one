import 'server-only';

type ParentElevationRateLimitEntry = {
    firstFailureAtMs: number;
    failureCount: number;
    blockedUntilMs: number;
};

type ParentElevationRateLimitDecision =
    | { allowed: true }
    | { allowed: false; retryAfterMs: number };

const attempts = new Map<string, ParentElevationRateLimitEntry>();

const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_BASE_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 5 * 60 * 1000;
const DEFAULT_FREE_FAILURES = 3;

function getPositiveIntEnv(name: string, fallback: number) {
    const raw = process.env[name];
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getRateLimitConfig() {
    return {
        windowMs: getPositiveIntEnv('PARENT_ELEVATION_RATE_LIMIT_WINDOW_MS', DEFAULT_WINDOW_MS),
        baseBackoffMs: getPositiveIntEnv('PARENT_ELEVATION_RATE_LIMIT_BASE_BACKOFF_MS', DEFAULT_BASE_BACKOFF_MS),
        maxBackoffMs: getPositiveIntEnv('PARENT_ELEVATION_RATE_LIMIT_MAX_BACKOFF_MS', DEFAULT_MAX_BACKOFF_MS),
        freeFailures: getPositiveIntEnv('PARENT_ELEVATION_RATE_LIMIT_FREE_FAILURES', DEFAULT_FREE_FAILURES),
    };
}

function pruneIfExpired(key: string, nowMs: number, windowMs: number) {
    const existing = attempts.get(key);
    if (!existing) return null;

    if (nowMs - existing.firstFailureAtMs > windowMs && existing.blockedUntilMs <= nowMs) {
        attempts.delete(key);
        return null;
    }

    return existing;
}

export function getParentElevationRateLimitKey(input: { familyMemberId: string; ip?: string | null }) {
    const ip = (input.ip || 'unknown').split(',')[0]?.trim() || 'unknown';
    return `${ip}::${input.familyMemberId}`;
}

export function checkParentElevationRateLimit(key: string, nowMs = Date.now()): ParentElevationRateLimitDecision {
    const { windowMs } = getRateLimitConfig();
    const entry = pruneIfExpired(key, nowMs, windowMs);
    if (!entry) return { allowed: true };

    if (entry.blockedUntilMs > nowMs) {
        return {
            allowed: false,
            retryAfterMs: Math.max(1, entry.blockedUntilMs - nowMs),
        };
    }

    return { allowed: true };
}

export function recordParentElevationFailure(key: string, nowMs = Date.now()) {
    const config = getRateLimitConfig();
    const existing = pruneIfExpired(key, nowMs, config.windowMs);

    const firstFailureAtMs = existing?.firstFailureAtMs ?? nowMs;
    const failureCount = (existing?.failureCount ?? 0) + 1;
    const penaltyFailures = Math.max(0, failureCount - config.freeFailures);
    const backoffMs =
        penaltyFailures === 0 ? 0 : Math.min(config.maxBackoffMs, config.baseBackoffMs * 2 ** (penaltyFailures - 1));

    const nextEntry: ParentElevationRateLimitEntry = {
        firstFailureAtMs,
        failureCount,
        blockedUntilMs: Math.max(existing?.blockedUntilMs ?? 0, nowMs + backoffMs),
    };
    attempts.set(key, nextEntry);

    return nextEntry;
}

export function clearParentElevationRateLimit(key: string) {
    attempts.delete(key);
}

export function __resetParentElevationRateLimitForTests() {
    attempts.clear();
}
