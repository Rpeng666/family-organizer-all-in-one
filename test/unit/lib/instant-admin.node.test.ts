import { beforeEach, describe, expect, it, vi } from 'vitest';

const instantAdminMocks = vi.hoisted(() => ({
    init: vi.fn(),
}));

vi.mock('@instantdb/admin', () => ({
    init: instantAdminMocks.init,
}));

const ORIGINAL_ENV = { ...process.env };

describe('lib/instant-admin', () => {
    beforeEach(() => {
        vi.resetModules();
        instantAdminMocks.init.mockReset();
        process.env = { ...ORIGINAL_ENV };
        delete process.env.INSTANT_KID_AUTH_EMAIL;
        delete process.env.INSTANT_PARENT_AUTH_EMAIL;
        delete process.env.INSTANT_KID_AUTH_ID;
        delete process.env.INSTANT_PARENT_AUTH_ID;
        delete process.env.INSTANT_FAMILY_AUTH_ID;
    });

    it('derives principal emails from IDs when explicit emails are not provided', async () => {
        process.env.INSTANT_KID_AUTH_ID = 'Kid Principal!';
        process.env.INSTANT_PARENT_AUTH_ID = 'Parent / Admin';

        const mod = await import('@/lib/instant-admin');

        expect(mod.getKidPrincipalAuthEmail()).toBe('kid-principal@family-organizer.local');
        expect(mod.getParentPrincipalAuthEmail()).toBe('parent-admin@family-organizer.local');
    });

    it('hashes parent PINs with sha256 (matching existing app behavior)', async () => {
        const mod = await import('@/lib/instant-admin');
        expect(mod.hashPinServer('1234')).toBe('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');
    });

    it('mints a principal token and stamps the Instant $users.type field', async () => {
        process.env.NEXT_PUBLIC_INSTANT_APP_ID = 'app_test';
        process.env.INSTANT_APP_ADMIN_TOKEN = 'admin_test';
        process.env.INSTANT_KID_AUTH_EMAIL = 'kid@family-organizer.local';

        const createToken = vi.fn().mockResolvedValue('kid-token');
        const getUser = vi.fn().mockResolvedValue({ id: 'user_1' });
        const update = vi.fn().mockReturnValue({ op: 'update-user-type' });
        const transact = vi.fn().mockResolvedValue(undefined);

        instantAdminMocks.init.mockReturnValue({
            auth: {
                createToken,
                getUser,
            },
            tx: {
                $users: {
                    user_1: { update },
                },
            },
            transact,
        } as any);

        const mod = await import('@/lib/instant-admin');
        const token = await mod.mintPrincipalToken('kid');

        expect(token).toBe('kid-token');
        expect(createToken).toHaveBeenCalledWith({ email: 'kid@family-organizer.local' });
        expect(getUser).toHaveBeenCalledWith({ email: 'kid@family-organizer.local' });
        expect(update).toHaveBeenCalledWith({ type: 'kid' });
        expect(transact).toHaveBeenCalledWith([{ op: 'update-user-type' }]);
    });
});
