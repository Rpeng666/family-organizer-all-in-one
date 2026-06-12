import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'familyOrganizer.';

const KEYS = {
  currentFamilyMemberId: `${PREFIX}currentFamilyMemberId`,
  parentUnlocked: `${PREFIX}parentUnlocked`,
  parentSharedDevice: `${PREFIX}parentSharedDevice`,
  parentLastActivityAt: `${PREFIX}parentLastActivityAt`,
  preferredPrincipal: `${PREFIX}preferredPrincipal`,
  pendingParentAction: `${PREFIX}pendingParentAction`,
  localThemeName: `${PREFIX}localThemeName`,
};

export const DEFAULT_PARENT_SHARED_DEVICE = true;
export const DEFAULT_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function readEnvNumber(...candidates) {
  for (const value of candidates) {
    if (!value) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

async function getItem(key) {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function setItem(key, value) {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Best-effort persistence; auth correctness does not rely solely on local prefs.
  }
}

async function removeItem(key) {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Best-effort cleanup.
  }
}

export function getParentSharedDeviceIdleTimeoutMs() {
  return (
    readEnvNumber(
      process.env.EXPO_PUBLIC_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS,
      process.env.NEXT_PUBLIC_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS
    ) || DEFAULT_PARENT_SHARED_DEVICE_IDLE_TIMEOUT_MS
  );
}

export async function getCurrentFamilyMemberId() {
  return getItem(KEYS.currentFamilyMemberId);
}

export async function setCurrentFamilyMemberId(memberId) {
  if (!memberId) {
    await removeItem(KEYS.currentFamilyMemberId);
    return;
  }
  await setItem(KEYS.currentFamilyMemberId, String(memberId));
}

export async function clearCurrentFamilyMemberId() {
  await removeItem(KEYS.currentFamilyMemberId);
}

export async function getParentUnlocked() {
  return (await getItem(KEYS.parentUnlocked)) === 'true';
}

export async function setParentUnlocked(value) {
  if (value) {
    await setItem(KEYS.parentUnlocked, 'true');
  } else {
    await removeItem(KEYS.parentUnlocked);
  }
}

export async function getParentSharedDeviceMode() {
  const value = await getItem(KEYS.parentSharedDevice);
  if (value == null) return DEFAULT_PARENT_SHARED_DEVICE;
  return value === 'true';
}

export async function setParentSharedDeviceMode(value) {
  await setItem(KEYS.parentSharedDevice, value ? 'true' : 'false');
}

export async function clearParentSharedDeviceMode() {
  await removeItem(KEYS.parentSharedDevice);
}

export async function getParentLastActivityAt() {
  const raw = await getItem(KEYS.parentLastActivityAt);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function setParentLastActivityAt(timestampMs) {
  await setItem(KEYS.parentLastActivityAt, String(timestampMs));
}

export async function clearParentLastActivityAt() {
  await removeItem(KEYS.parentLastActivityAt);
}

export async function getPreferredPrincipal() {
  const value = await getItem(KEYS.preferredPrincipal);
  if (value === 'kid' || value === 'parent') return value;
  return 'unknown';
}

export async function setPreferredPrincipal(principalType) {
  if (principalType !== 'kid' && principalType !== 'parent') return;
  await setItem(KEYS.preferredPrincipal, principalType);
}

export async function clearPreferredPrincipal() {
  await removeItem(KEYS.preferredPrincipal);
}

export async function getPendingParentAction() {
  const raw = await getItem(KEYS.pendingParentAction);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      await removeItem(KEYS.pendingParentAction);
      return null;
    }

    if (typeof parsed.actionId !== 'string' || !parsed.actionId.trim()) {
      await removeItem(KEYS.pendingParentAction);
      return null;
    }

    if (typeof parsed.returnPath !== 'string' || !parsed.returnPath.trim()) {
      await removeItem(KEYS.pendingParentAction);
      return null;
    }

    return {
      actionId: parsed.actionId,
      actionLabel: typeof parsed.actionLabel === 'string' ? parsed.actionLabel : '',
      returnPath: parsed.returnPath,
      payload: parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : {},
      createdAt: Number.isFinite(parsed.createdAt) ? parsed.createdAt : Date.now(),
    };
  } catch {
    await removeItem(KEYS.pendingParentAction);
    return null;
  }
}

export async function setPendingParentAction(action) {
  if (!action || typeof action !== 'object') return;

  const actionId = typeof action.actionId === 'string' ? action.actionId.trim() : '';
  const returnPath = typeof action.returnPath === 'string' ? action.returnPath.trim() : '';
  if (!actionId || !returnPath) return;

  const normalized = {
    actionId,
    actionLabel: typeof action.actionLabel === 'string' ? action.actionLabel : '',
    returnPath,
    payload: action.payload && typeof action.payload === 'object' ? action.payload : {},
    createdAt: Number.isFinite(action.createdAt) ? action.createdAt : Date.now(),
  };

  await setItem(KEYS.pendingParentAction, JSON.stringify(normalized));
}

export async function clearPendingParentAction() {
  await removeItem(KEYS.pendingParentAction);
}

export async function getLocalThemeName() {
  const value = await getItem(KEYS.localThemeName);
  if (value === 'classic' || value === 'bright' || value === 'paper' || value === 'dark') return value;
  return 'classic';
}

export async function setLocalThemeName(themeName) {
  if (themeName !== 'classic' && themeName !== 'bright' && themeName !== 'paper' && themeName !== 'dark') return;
  await setItem(KEYS.localThemeName, themeName);
}

export async function clearPrincipalPrefs() {
  try {
    await AsyncStorage.multiRemove([
      KEYS.parentUnlocked,
      KEYS.parentSharedDevice,
      KEYS.parentLastActivityAt,
      KEYS.preferredPrincipal,
      KEYS.pendingParentAction,
    ]);
  } catch {
    await Promise.all([
      removeItem(KEYS.parentUnlocked),
      removeItem(KEYS.parentSharedDevice),
      removeItem(KEYS.parentLastActivityAt),
      removeItem(KEYS.preferredPrincipal),
      removeItem(KEYS.pendingParentAction),
    ]);
  }
}
