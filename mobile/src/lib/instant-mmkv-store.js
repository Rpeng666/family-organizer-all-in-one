import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGACY_STORE_VERSION = 5;
const STORE_NAMES = ['kv', 'querySubs', 'syncSubs'];
const MIGRATION_PREFIX = 'familyOrganizer.instantMmkvMigration.';
let mmkvModuleLoaderOverride = null;

export function buildInstantMmkvStoreId(appId, storeName) {
  return `instant-${appId}-${storeName}`;
}

export function buildLegacyInstantStoragePrefix(appId, storeName) {
  return `instant_${appId}_${LEGACY_STORE_VERSION}_${storeName}_`;
}

export function __setInstantMmkvModuleLoaderForTests(loader) {
  mmkvModuleLoaderOverride = loader;
}

function getMigrationKey(appId) {
  return `${MIGRATION_PREFIX}${appId}`;
}

export async function loadMmkvModules() {
  if (mmkvModuleLoaderOverride) {
    return mmkvModuleLoaderOverride();
  }
  const InstantMmkvStore = require('@instantdb/react-native-mmkv').default;
  const { createMMKV } = require('react-native-mmkv');
  return { InstantMmkvStore, createMMKV };
}

export async function ensureInstantMmkvMigration(appId) {
  if (!appId) return null;

  const { InstantMmkvStore, createMMKV } = await loadMmkvModules();
  const migrationKey = getMigrationKey(appId);
  const migrationState = await AsyncStorage.getItem(migrationKey);

  if (migrationState === 'done' || migrationState === 'failed') {
    return InstantMmkvStore;
  }

  try {
    const allKeys = await AsyncStorage.getAllKeys();

    for (const storeName of STORE_NAMES) {
      const prefix = buildLegacyInstantStoragePrefix(appId, storeName);
      const legacyKeys = allKeys.filter((key) => key.startsWith(prefix));
      if (legacyKeys.length === 0) continue;

      const store = createMMKV({
        id: buildInstantMmkvStoreId(appId, storeName),
        readOnly: false,
        mode: 'multi-process',
      });
      const entries = await AsyncStorage.multiGet(legacyKeys);

      for (const [legacyKey, rawValue] of entries) {
        if (rawValue == null) continue;
        store.set(legacyKey.slice(prefix.length), rawValue);
      }
    }

    await AsyncStorage.setItem(migrationKey, 'done');
  } catch (error) {
    console.warn('[instant-mmkv-store] Failed to migrate legacy Instant cache; continuing with a cold cache rebuild.', error);
    await AsyncStorage.setItem(migrationKey, 'failed');
  }

  return InstantMmkvStore;
}
