import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_SESSION_TOKEN_KEY = 'familyOrganizer.deviceSessionToken';
const KID_PRINCIPAL_TOKEN_KEY = 'familyOrganizer.kidPrincipalToken';
const PARENT_PRINCIPAL_TOKEN_KEY = 'familyOrganizer.parentPrincipalToken';
const ACTIVE_MEMBER_PRINCIPAL_TOKEN_KEY = 'familyOrganizer.memberPrincipalToken';
const FALLBACK_PREFIX = 'familyOrganizer.secureFallback.';

function fallbackKey(key) {
  return `${FALLBACK_PREFIX}${key}`;
}

function isSecureStoreUnavailable(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('entitlement') ||
    message.includes('keychain') ||
    message.includes('required entitlement') ||
    error?.code === 'E_SECURESTORE_WRITE_ERROR' ||
    error?.code === 'E_SECURESTORE_READ_ERROR'
  );
}

function warnSecureStoreFallback(operation, key, error) {
  // Dev/XCUITest builds can lack keychain entitlements. We fallback so the app remains testable.
  console.warn(`[device-session-store] SecureStore ${operation} failed for ${key}; using AsyncStorage fallback.`, error);
}

async function secureGet(key) {
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value != null) return value;
  } catch (error) {
    if (!isSecureStoreUnavailable(error)) throw error;
    warnSecureStoreFallback('get', key, error);
  }

  return AsyncStorage.getItem(fallbackKey(key));
}

async function secureSet(key, value) {
  try {
    await SecureStore.setItemAsync(key, value);
    await AsyncStorage.removeItem(fallbackKey(key));
    return;
  } catch (error) {
    if (!isSecureStoreUnavailable(error)) throw error;
    warnSecureStoreFallback('set', key, error);
  }

  await AsyncStorage.setItem(fallbackKey(key), value);
}

async function secureDelete(key) {
  let secureError = null;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    secureError = error;
    if (!isSecureStoreUnavailable(error)) throw error;
    warnSecureStoreFallback('delete', key, error);
  }

  try {
    await AsyncStorage.removeItem(fallbackKey(key));
  } catch (fallbackError) {
    if (!secureError) {
      throw fallbackError;
    }
  }
}

export async function getDeviceSessionToken() {
  return secureGet(DEVICE_SESSION_TOKEN_KEY);
}

export async function setDeviceSessionToken(token) {
  if (!token) {
    await secureDelete(DEVICE_SESSION_TOKEN_KEY);
    return;
  }
  await secureSet(DEVICE_SESSION_TOKEN_KEY, token);
}

export async function getKidPrincipalToken() {
  return secureGet(KID_PRINCIPAL_TOKEN_KEY);
}

export async function setKidPrincipalToken(token) {
  if (!token) {
    await secureDelete(KID_PRINCIPAL_TOKEN_KEY);
    return;
  }
  await secureSet(KID_PRINCIPAL_TOKEN_KEY, token);
}

export async function getParentPrincipalToken() {
  return secureGet(PARENT_PRINCIPAL_TOKEN_KEY);
}

export async function setParentPrincipalToken(token) {
    if (!token) {
        await secureDelete(PARENT_PRINCIPAL_TOKEN_KEY);
        return;
  }
    await secureSet(PARENT_PRINCIPAL_TOKEN_KEY, token);
}

export async function getActiveMemberPrincipalToken() {
  return secureGet(ACTIVE_MEMBER_PRINCIPAL_TOKEN_KEY);
}

export async function setActiveMemberPrincipalToken(token) {
  if (!token) {
    await secureDelete(ACTIVE_MEMBER_PRINCIPAL_TOKEN_KEY);
    return;
  }
  await secureSet(ACTIVE_MEMBER_PRINCIPAL_TOKEN_KEY, token);
}

export async function clearPrincipalTokens() {
  await Promise.all([
    secureDelete(ACTIVE_MEMBER_PRINCIPAL_TOKEN_KEY),
    secureDelete(KID_PRINCIPAL_TOKEN_KEY),
    secureDelete(PARENT_PRINCIPAL_TOKEN_KEY),
  ]);
}
