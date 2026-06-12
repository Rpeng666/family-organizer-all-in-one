import { beforeEach, describe, expect, it, vi } from 'vitest';

const asyncStorageState = new Map<string, string>();
const mmkvStoreState = new Map<string, Map<string, string>>();
const createMMKV = vi.fn(({ id }: { id: string }) => {
    let store = mmkvStoreState.get(id);
    if (!store) {
        store = new Map<string, string>();
        mmkvStoreState.set(id, store);
    }

    return {
        set(key: string, value: string) {
            store!.set(key, value);
        },
    };
});

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        async getItem(key: string) {
            return asyncStorageState.has(key) ? asyncStorageState.get(key)! : null;
        },
        async setItem(key: string, value: string) {
            asyncStorageState.set(key, value);
        },
        async getAllKeys() {
            return Array.from(asyncStorageState.keys());
        },
        async multiGet(keys: string[]) {
            return keys.map((key) => [key, asyncStorageState.has(key) ? asyncStorageState.get(key)! : null]);
        },
    },
}));

import * as instantMmkvStore from '../../../mobile/src/lib/instant-mmkv-store.js';

describe('instant MMKV migration', () => {
    beforeEach(() => {
        asyncStorageState.clear();
        mmkvStoreState.clear();
        createMMKV.mockClear();
        instantMmkvStore.__setInstantMmkvModuleLoaderForTests(async () => ({
            InstantMmkvStore: class MockInstantMmkvStore {},
            createMMKV,
        }));
    });

    it('migrates legacy AsyncStorage keys into MMKV and marks completion', async () => {
        asyncStorageState.set(
            `${instantMmkvStore.buildLegacyInstantStoragePrefix('app-1', 'kv')}session`,
            JSON.stringify({ token: 'abc' }),
        );

        await instantMmkvStore.ensureInstantMmkvMigration('app-1');

        expect(mmkvStoreState.get(instantMmkvStore.buildInstantMmkvStoreId('app-1', 'kv'))?.get('session')).toBe(
            JSON.stringify({ token: 'abc' }),
        );
        expect(asyncStorageState.get('familyOrganizer.instantMmkvMigration.app-1')).toBe('done');
    });

    it('is idempotent after the first successful migration', async () => {
        asyncStorageState.set(
            `${instantMmkvStore.buildLegacyInstantStoragePrefix('app-2', 'querySubs')}thread-list`,
            JSON.stringify(['a', 'b']),
        );

        await instantMmkvStore.ensureInstantMmkvMigration('app-2');
        await instantMmkvStore.ensureInstantMmkvMigration('app-2');

        expect(createMMKV).toHaveBeenCalledTimes(1);
    });
});
