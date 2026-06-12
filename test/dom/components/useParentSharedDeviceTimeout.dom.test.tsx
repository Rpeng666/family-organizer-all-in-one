// @vitest-environment jsdom

import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceTimeByAsync, freezeTime } from '@/test/utils/fake-clock';
import {
    PARENT_LAST_ACTIVITY_KEY,
    getParentLastActivityAt,
} from '@/lib/instant-principal-storage';
import { useParentSharedDeviceTimeout } from '@/components/auth/useParentSharedDeviceTimeout';

function Harness(props: {
    principalType: 'kid' | 'parent' | 'unknown';
    parentUnlocked: boolean;
    isParentSessionSharedDevice: boolean;
    parentSharedDeviceIdleTimeoutMs: number;
    onExpire: () => void;
}) {
    useParentSharedDeviceTimeout({
        principalType: props.principalType as any,
        parentUnlocked: props.parentUnlocked,
        isParentSessionSharedDevice: props.isParentSessionSharedDevice,
        parentSharedDeviceIdleTimeoutMs: props.parentSharedDeviceIdleTimeoutMs,
        expireParentMode: props.onExpire,
    });
    return null;
}

describe('useParentSharedDeviceTimeout', () => {
    beforeEach(() => {
        freezeTime(new Date('2026-02-26T12:00:00Z'));
        window.localStorage.clear();
    });

    it('does not schedule expiry when parent mode is not fully active on a shared device', async () => {
        const onExpire = vi.fn();

        render(
            <Harness
                principalType="kid"
                parentUnlocked={true}
                isParentSessionSharedDevice={true}
                parentSharedDeviceIdleTimeoutMs={1_000}
                onExpire={onExpire}
            />
        );

        await act(async () => {
            await advanceTimeByAsync(5_000);
        });

        expect(onExpire).not.toHaveBeenCalled();
    });

    it('expires immediately when the stored parent activity timestamp is already stale', async () => {
        const onExpire = vi.fn();
        const now = Date.now();
        window.localStorage.setItem(PARENT_LAST_ACTIVITY_KEY, String(now - 10_000));

        render(
            <Harness
                principalType="parent"
                parentUnlocked={true}
                isParentSessionSharedDevice={true}
                parentSharedDeviceIdleTimeoutMs={1_000}
                onExpire={onExpire}
            />
        );

        await act(async () => {
            await advanceTimeByAsync(0);
        });

        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('records activity and reschedules expiry based on the latest interaction time', async () => {
        const onExpire = vi.fn();
        const initialNow = Date.now();
        window.localStorage.setItem(PARENT_LAST_ACTIVITY_KEY, String(initialNow));

        render(
            <Harness
                principalType="parent"
                parentUnlocked={true}
                isParentSessionSharedDevice={true}
                parentSharedDeviceIdleTimeoutMs={1_000}
                onExpire={onExpire}
            />
        );

        await act(async () => {
            await advanceTimeByAsync(900);
        });
        expect(onExpire).not.toHaveBeenCalled();

        await act(async () => {
            window.dispatchEvent(new MouseEvent('mousemove'));
            await advanceTimeByAsync(0);
        });

        const updatedActivity = getParentLastActivityAt();
        expect(updatedActivity).not.toBeNull();
        expect(updatedActivity!).toBeGreaterThanOrEqual(initialNow + 900);

        await act(async () => {
            await advanceTimeByAsync(900);
        });
        expect(onExpire).not.toHaveBeenCalled();

        await act(async () => {
            await advanceTimeByAsync(150);
        });
        expect(onExpire).toHaveBeenCalledTimes(1);
    });
});
