const DEFAULT_BASE_POLL_MS = 15_000;
const DEFAULT_ERROR_POLL_MS = 30_000;
const DEFAULT_MAX_POLL_MS = 300_000;

function parsePositiveSecondsToMs(value, fallbackMs) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
    return Math.floor(parsed * 1000);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestamp() {
    return new Date().toISOString();
}

const baseUrl = process.env.APPLE_CALDAV_POLL_TARGET_URL || process.env.APPLE_CALDAV_SYNC_BASE_URL || 'http://localhost:3001';
const cronSecret = process.env.CALENDAR_SYNC_CRON_SECRET || '';
const basePollMs = parsePositiveSecondsToMs(process.env.APPLE_CALDAV_POLL_BASE_SECONDS, DEFAULT_BASE_POLL_MS);
const errorPollMs = parsePositiveSecondsToMs(process.env.APPLE_CALDAV_POLL_ERROR_SECONDS, DEFAULT_ERROR_POLL_MS);
const maxPollMs = parsePositiveSecondsToMs(process.env.APPLE_CALDAV_POLL_MAX_IDLE_SECONDS, DEFAULT_MAX_POLL_MS);
const endpoint = new URL('/api/calendar-sync/apple/run', baseUrl).toString();

let keepRunning = true;
process.on('SIGINT', () => {
    keepRunning = false;
});
process.on('SIGTERM', () => {
    keepRunning = false;
});

if (!cronSecret) {
    console.error('CALENDAR_SYNC_CRON_SECRET is required to run the Apple Calendar sync worker.');
    process.exit(1);
}

async function runTick() {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${cronSecret}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trigger: 'cron' }),
    });
    const data = await response.json().catch(() => ({}));
    return {
        ok: response.ok,
        status: response.status,
        data,
    };
}

async function main() {
    console.log(`[${timestamp()}] Apple Calendar sync worker started for ${endpoint}`);
    while (keepRunning) {
        try {
            const result = await runTick();
            const suggestedMs = result.ok ? Number(result.data?.nextPollInMs) : Number.NaN;
            const sleepMs = result.ok
                ? clamp(
                    Number.isFinite(suggestedMs) && suggestedMs > 0 ? suggestedMs : basePollMs,
                    basePollMs,
                    maxPollMs
                )
                : clamp(errorPollMs, basePollMs, maxPollMs);
            const label = result.ok
                ? result.data?.reason || (result.data?.skipped ? 'skipped' : 'synced')
                : result.data?.error || result.data?.message || 'request_failed';
            const logger = result.ok ? console.log : console.error;
            logger(`[${timestamp()}] Apple Calendar poll ${result.status} ${label} next=${sleepMs}ms`);
            await sleep(sleepMs);
        } catch (error) {
            console.error(`[${timestamp()}] Apple Calendar poll failed`, error);
            await sleep(clamp(errorPollMs, basePollMs, maxPollMs));
        }
    }
    console.log(`[${timestamp()}] Apple Calendar sync worker stopped`);
}

main().catch((error) => {
    console.error(`[${timestamp()}] Apple Calendar sync worker crashed`, error);
    process.exit(1);
});
