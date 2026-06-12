import { beforeEach, describe, expect, it, vi } from 'vitest';

const asyncStorageState = new Map<string, string>();
const getDeviceSessionToken = vi.fn();

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        async getItem(key: string) {
            return asyncStorageState.has(key) ? asyncStorageState.get(key)! : null;
        },
        async setItem(key: string, value: string) {
            asyncStorageState.set(key, value);
        },
        async multiRemove(keys: string[]) {
            keys.forEach((key) => asyncStorageState.delete(key));
        },
    },
}));

vi.mock('expo-constants', () => ({
    default: {
        expoConfig: {
            extra: {},
        },
    },
}));

vi.mock('../../../mobile/src/lib/device-session-store.js', () => ({
    getDeviceSessionToken,
}));

describe('mobile server-url cache helpers', () => {
    beforeEach(() => {
        asyncStorageState.clear();
        getDeviceSessionToken.mockReset();
        getDeviceSessionToken.mockResolvedValue('device-token');
        vi.resetModules();
        vi.stubGlobal('__DEV__', true);
    });

    it('returns cached config when refresh fails', async () => {
        asyncStorageState.set(
            'familyOrganizer.serverConfig',
            JSON.stringify({ instantAppId: 'cached-app', instantApiURI: 'https://cached.example/api' }),
        );
        asyncStorageState.set('familyOrganizer.serverUrl', 'https://cached.example');
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('offline');
        }));

        const module = await import('../../../mobile/src/lib/server-url.js');
        expect(await module.preloadServerConfig()).toEqual({
            instantAppId: 'cached-app',
            instantApiURI: 'https://cached.example/api',
        });
        expect(await module.refreshServerConfig()).toEqual({
            instantAppId: 'cached-app',
            instantApiURI: 'https://cached.example/api',
        });
    });

    it('updates cached config after a successful network refresh', async () => {
        asyncStorageState.set('familyOrganizer.serverUrl', 'https://fresh.example');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({
                ok: true,
                async json() {
                    return {
                        instantAppId: 'fresh-app',
                        instantApiURI: 'https://fresh.example/api',
                    };
                },
            })),
        );

        const module = await import('../../../mobile/src/lib/server-url.js');
        expect(await module.refreshServerConfig()).toEqual({
            instantAppId: 'fresh-app',
            instantApiURI: 'https://fresh.example/api',
        });
        expect(asyncStorageState.get('familyOrganizer.serverConfig')).toBe(
            JSON.stringify({
                instantAppId: 'fresh-app',
                instantApiURI: 'https://fresh.example/api',
            }),
        );
    });
});
