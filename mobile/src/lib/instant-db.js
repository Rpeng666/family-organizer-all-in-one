import { init } from '@instantdb/react-native';
import schema from '../../../instant.schema';
import { ensureInstantMmkvMigration } from './instant-mmkv-store';

// Lazy initialization: db starts as null and is set by initInstantDb().
// The ServerUrlGate in _layout.js calls initInstantDb() with config fetched
// from the server before any providers mount, so db is always ready by the
// time InstantPrincipalProvider and FamilyAuthProvider render.
export let db = null;
let activeConfig = null;

/**
 * Initialize the InstantDB client with a server-provided app ID.
 * Must be called exactly once before any provider that uses `db` mounts.
 *
 * Falls back to env vars if no arguments are provided (for backwards compat).
 */
export async function initInstantDb({ appId, apiURI, websocketURI } = {}, options = {}) {
  if (db && !options?.force) return db;

  const resolvedAppId =
    appId ||
    process.env.EXPO_PUBLIC_INSTANT_APP_ID ||
    process.env.NEXT_PUBLIC_INSTANT_APP_ID;

  if (!resolvedAppId) {
    throw new Error('initInstantDb requires an appId (pass it or set EXPO_PUBLIC_INSTANT_APP_ID)');
  }

  const resolvedApiURI = apiURI || process.env.EXPO_PUBLIC_INSTANT_API_URI || process.env.NEXT_PUBLIC_INSTANT_API_URI;
  const resolvedWsURI = websocketURI || process.env.EXPO_PUBLIC_INSTANT_WEBSOCKET_URI || process.env.NEXT_PUBLIC_INSTANT_WEBSOCKET_URI;
  const connectionConfig = resolvedApiURI && resolvedWsURI ? { apiURI: resolvedApiURI, websocketURI: resolvedWsURI } : {};
  const Store = await ensureInstantMmkvMigration(resolvedAppId);

  if (db && typeof db.shutdown === 'function' && options?.force) {
    try {
      db.shutdown();
    } catch {
      // Best-effort shutdown for explicit rebootstrap only.
    }
  }

  db = init({
    appId: resolvedAppId,
    schema,
    ...(Store ? { Store } : {}),
    ...connectionConfig,
  });
  activeConfig = {
    appId: resolvedAppId,
    ...(resolvedApiURI ? { apiURI: resolvedApiURI } : {}),
    ...(resolvedWsURI ? { websocketURI: resolvedWsURI } : {}),
  };
  return db;
}

export function getInstantDbConfig() {
  return activeConfig;
}

export function resetInstantDb() {
  if (db && typeof db.shutdown === 'function') {
    try {
      db.shutdown();
    } catch {
      // Best-effort only.
    }
  }
  db = null;
  activeConfig = null;
}
