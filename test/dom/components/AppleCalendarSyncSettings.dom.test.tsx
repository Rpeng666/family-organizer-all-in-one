// @vitest-environment jsdom

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppleCalendarSyncSettings from '@/components/AppleCalendarSyncSettings';
import { CALENDAR_SYNC_PARENT_TOKEN_HEADER } from '@/lib/calendar-sync-constants';
import { PARENT_TOKEN_CACHE_KEY } from '@/lib/instant-principal-storage';

const toastSpy = vi.fn();

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: toastSpy,
    }),
}));

describe('AppleCalendarSyncSettings', () => {
    beforeEach(() => {
        toastSpy.mockReset();
        window.localStorage.setItem(PARENT_TOKEN_CACHE_KEY, 'parent-token');
        vi.stubGlobal(
            'fetch',
            vi.fn()
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            configured: true,
                            serverNow: '2026-03-10T12:01:00.000Z',
                            account: {
                                id: 'acct_1',
                                username: 'parent@example.com',
                                lastAttemptedSyncAt: '2026-03-10T12:01:00.000Z',
                                lastSuccessfulSyncAt: '2026-03-10T12:00:00.000Z',
                            },
                            calendars: [{ id: 'cal_1', remoteCalendarId: 'home', displayName: 'Home', isEnabled: true }],
                            lastRun: { status: 'success', finishedAt: '2026-03-10T12:00:00.000Z' },
                            polling: {
                                lastSuccessfulPollAt: '2026-03-10T12:01:00.000Z',
                                nextPollAt: '2026-03-10T12:01:15.000Z',
                                nextPollInMs: 15_000,
                                pollIntervalMs: 15_000,
                                pollReason: 'recent_changes',
                            },
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    )
                )
                .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            configured: true,
                            serverNow: '2026-03-10T12:05:00.000Z',
                            account: {
                                id: 'acct_1',
                                username: 'parent@example.com',
                                lastAttemptedSyncAt: '2026-03-10T12:05:00.000Z',
                                lastSuccessfulSyncAt: '2026-03-10T12:05:00.000Z',
                            },
                            calendars: [{ id: 'cal_1', remoteCalendarId: 'home', displayName: 'Home', isEnabled: true }],
                            lastRun: { status: 'success', finishedAt: '2026-03-10T12:05:00.000Z' },
                            polling: {
                                lastSuccessfulPollAt: '2026-03-10T12:05:00.000Z',
                                nextPollAt: '2026-03-10T12:05:15.000Z',
                                nextPollInMs: 15_000,
                                pollIntervalMs: 15_000,
                                pollReason: 'recent_changes',
                            },
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    )
                )
                .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            configured: true,
                            serverNow: '2026-03-10T12:07:00.000Z',
                            account: {
                                id: 'acct_1',
                                username: 'parent@example.com',
                                lastAttemptedSyncAt: '2026-03-10T12:07:00.000Z',
                                lastSuccessfulSyncAt: '2026-03-10T12:07:00.000Z',
                            },
                            calendars: [{ id: 'cal_1', remoteCalendarId: 'home', displayName: 'Home', isEnabled: true }],
                            lastRun: { status: 'success', finishedAt: '2026-03-10T12:07:00.000Z' },
                            polling: {
                                lastSuccessfulPollAt: '2026-03-10T12:07:00.000Z',
                                nextPollAt: '2026-03-10T12:07:15.000Z',
                                nextPollInMs: 15_000,
                                pollIntervalMs: 15_000,
                                pollReason: 'repair',
                            },
                        }),
                        { status: 200, headers: { 'Content-Type': 'application/json' } }
                    )
                )
        );
    });

    it('loads status and can trigger both normal and rewrite sync actions', async () => {
        const user = userEvent.setup();
        render(<AppleCalendarSyncSettings />);

        await screen.findByText(/Connected as parent@example.com/i);
        expect(screen.getByText(/Last completed check/i)).toBeInTheDocument();
        expect(screen.getByText(/Polling mode/i)).toBeInTheDocument();
        expect(global.fetch).toHaveBeenNthCalledWith(
            1,
            '/api/calendar-sync/apple/status',
            expect.objectContaining({
                cache: 'no-store',
                headers: expect.objectContaining({
                    [CALENDAR_SYNC_PARENT_TOKEN_HEADER]: 'parent-token',
                }),
            })
        );
        await user.click(screen.getByRole('button', { name: /sync now/i }));

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/calendar-sync/apple/run',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        [CALENDAR_SYNC_PARENT_TOKEN_HEADER]: 'parent-token',
                    }),
                })
            );
        });

        const runCallsAfterManual = (global.fetch as any).mock.calls.filter((call: any[]) => call[0] === '/api/calendar-sync/apple/run');
        const manualRequest = runCallsAfterManual[0][1];
        expect(JSON.parse(manualRequest.body)).toMatchObject({ trigger: 'manual' });

        await user.click(screen.getByRole('button', { name: /sync and rewrite/i }));

        await waitFor(() => {
            const runCalls = (global.fetch as any).mock.calls.filter((call: any[]) => call[0] === '/api/calendar-sync/apple/run');
            expect(runCalls).toHaveLength(2);
        });

        const runCallsAfterRepair = (global.fetch as any).mock.calls.filter((call: any[]) => call[0] === '/api/calendar-sync/apple/run');
        const repairRequest = runCallsAfterRepair[1][1];
        expect(JSON.parse(repairRequest.body)).toMatchObject({ trigger: 'repair' });
    });

});
