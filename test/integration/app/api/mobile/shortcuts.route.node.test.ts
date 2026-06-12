import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const shortcutRouteMocks = vi.hoisted(() => ({
    authorizeMobileShortcutToken: vi.fn(),
    createTodayAnytimeShortcutChore: vi.fn(),
    listMobileShortcutFamilyMembers: vi.fn(),
}));

vi.mock('@/lib/mobile-shortcut-tokens', () => ({
    MOBILE_SHORTCUT_CHORE_CAPABILITY: 'shortcut_chore_quick_create_v1',
    MOBILE_SHORTCUT_TOKEN_HEADER: 'x-family-shortcut-token',
    authorizeMobileShortcutToken: shortcutRouteMocks.authorizeMobileShortcutToken,
}));

vi.mock('@/lib/mobile-shortcut-chore-service', () => ({
    createTodayAnytimeShortcutChore: shortcutRouteMocks.createTodayAnytimeShortcutChore,
    listMobileShortcutFamilyMembers: shortcutRouteMocks.listMobileShortcutFamilyMembers,
}));

import { GET as getShortcutFamilyMembers } from '@/app/api/mobile/shortcuts/family-members/route';
import { POST as createShortcutChore } from '@/app/api/mobile/shortcuts/chore-create/route';

describe('mobile shortcut roster + chore routes', () => {
    beforeEach(() => {
        shortcutRouteMocks.authorizeMobileShortcutToken.mockResolvedValue({
            ok: true,
            record: { id: 'token-1' },
            token: 'fost_test_token',
        });
        shortcutRouteMocks.listMobileShortcutFamilyMembers.mockResolvedValue([
            { id: 'fm-1', label: 'Judah', name: 'Judah', role: 'child', photoUrls: null },
        ]);
        shortcutRouteMocks.createTodayAnytimeShortcutChore.mockResolvedValue({
            choreId: 'chore-1',
            title: 'Clean room',
            assigneeFamilyMemberId: 'fm-1',
            dateKey: '2026-03-22',
        });
    });

    it('returns 401 when roster refresh uses an invalid shortcut token', async () => {
        shortcutRouteMocks.authorizeMobileShortcutToken.mockResolvedValue({ ok: false, reason: 'invalid' });

        const response = await getShortcutFamilyMembers(
            new NextRequest('http://localhost:3000/api/mobile/shortcuts/family-members', {
                headers: { 'x-family-shortcut-token': 'bad' },
            })
        );

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized shortcut', reason: 'invalid' });
    });

    it('returns the current family roster for a valid shortcut token', async () => {
        const response = await getShortcutFamilyMembers(
            new NextRequest('http://localhost:3000/api/mobile/shortcuts/family-members', {
                headers: { 'x-family-shortcut-token': 'fost_test_token' },
            })
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            familyMembers: [{ id: 'fm-1', label: 'Judah', name: 'Judah', role: 'child', photoUrls: null }],
        });
        expect(shortcutRouteMocks.authorizeMobileShortcutToken).toHaveBeenCalledWith({
            token: 'fost_test_token',
            capability: 'shortcut_chore_quick_create_v1',
        });
    });

    it('returns 401 when chore creation uses an invalid shortcut token', async () => {
        shortcutRouteMocks.authorizeMobileShortcutToken.mockResolvedValue({ ok: false, reason: 'revoked' });

        const response = await createShortcutChore(
            new NextRequest('http://localhost:3000/api/mobile/shortcuts/chore-create', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-family-shortcut-token': 'revoked',
                },
                body: JSON.stringify({ title: 'Clean room', assigneeFamilyMemberId: 'fm-1' }),
            })
        );

        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ error: 'Unauthorized shortcut', reason: 'revoked' });
    });

    it('rejects malformed chore creation request bodies', async () => {
        const response = await createShortcutChore(
            new NextRequest('http://localhost:3000/api/mobile/shortcuts/chore-create', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-family-shortcut-token': 'fost_test_token',
                },
                body: 'not-json',
            })
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: 'Invalid request body' });
    });

    it('maps helper errors to client-facing create responses', async () => {
        shortcutRouteMocks.createTodayAnytimeShortcutChore.mockRejectedValue(new Error('Assignee not found'));

        const response = await createShortcutChore(
            new NextRequest('http://localhost:3000/api/mobile/shortcuts/chore-create', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-family-shortcut-token': 'fost_test_token',
                },
                body: JSON.stringify({ title: 'Clean room', assigneeFamilyMemberId: 'missing' }),
            })
        );

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: 'Assignee not found' });
    });

    it('creates a today/anytime chore for a valid shortcut token', async () => {
        const response = await createShortcutChore(
            new NextRequest('http://localhost:3000/api/mobile/shortcuts/chore-create', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-family-shortcut-token': 'fost_test_token',
                },
                body: JSON.stringify({ title: 'Clean room', assigneeFamilyMemberId: 'fm-1' }),
            })
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            choreId: 'chore-1',
            title: 'Clean room',
            assigneeFamilyMemberId: 'fm-1',
            dateKey: '2026-03-22',
        });
        expect(shortcutRouteMocks.createTodayAnytimeShortcutChore).toHaveBeenCalledWith({
            title: 'Clean room',
            assigneeFamilyMemberId: 'fm-1',
        });
    });
});
