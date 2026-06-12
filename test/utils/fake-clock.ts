import { vi } from 'vitest';

export type FakeClockInput = Date | string | number;

function toDate(input: FakeClockInput) {
    return input instanceof Date ? input : new Date(input);
}

export function freezeTime(input: FakeClockInput) {
    const date = toDate(input);
    vi.useFakeTimers();
    vi.setSystemTime(date);
    return date;
}

export function restoreTime() {
    vi.useRealTimers();
}

export function advanceTimeBy(ms: number) {
    vi.advanceTimersByTime(ms);
}

export async function advanceTimeByAsync(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
}

export async function withFrozenTime<T>(input: FakeClockInput, fn: () => T | Promise<T>) {
    freezeTime(input);
    try {
        return await fn();
    } finally {
        restoreTime();
    }
}
