import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { db } from '../lib/instant-db';
import { getMemberInstantToken, getSharedKidInstantToken } from '../lib/api-client';
import {
  getActiveMemberPrincipalToken,
  getKidPrincipalToken,
  setActiveMemberPrincipalToken,
  setKidPrincipalToken,
  setParentPrincipalToken,
} from '../lib/device-session-store';
import { deriveDeviceAuthIssueFromError } from '../lib/device-auth-issue';
import { useDeviceSession } from './DeviceSessionProvider';
import {
  DEFAULT_PARENT_SHARED_DEVICE,
  clearCurrentFamilyMemberId,
  clearParentLastActivityAt,
  clearParentSharedDeviceMode,
  clearPreferredPrincipal,
  clearPrincipalPrefs,
  getParentLastActivityAt,
  getParentSharedDeviceIdleTimeoutMs,
  getParentSharedDeviceMode,
  getPreferredPrincipal,
  getParentUnlocked,
  setCurrentFamilyMemberId,
  setParentLastActivityAt,
  setParentSharedDeviceMode,
  setParentUnlocked,
  setPreferredPrincipal,
} from '../lib/session-prefs';
import { recordDiagnostic } from '../lib/diagnostics';

export const InstantPrincipalContext = createContext(null);

async function safeSignOutInstant() {
  try {
    if (typeof db.auth?.signOut === 'function') {
      await db.auth.signOut();
    }
  } catch {
    // Best-effort only.
  }
}

export function InstantPrincipalProvider({ children }) {
  const { deviceSessionToken, clearDeviceSession, networkValidated: deviceNetworkValidated } = useDeviceSession();
  const auth = db.useAuth();
  const connectionStatus = db.useConnectionStatus();
  const [bootstrapStatus, setBootstrapStatus] = useState('waiting_for_device');
  const [bootstrapError, setBootstrapError] = useState(null);
  const [bootstrapVersion, setBootstrapVersion] = useState(0);
  const [principalValidated, setPrincipalValidated] = useState(false);
  const [principalType, setPrincipalType] = useState('unknown');
  const [isSwitchingPrincipal, setIsSwitchingPrincipal] = useState(false);
  const [parentUnlocked, setParentUnlockedState] = useState(false);
  const [isParentSessionSharedDevice, setIsParentSessionSharedDevice] = useState(DEFAULT_PARENT_SHARED_DEVICE);
  const [hasCachedParentPrincipal, setHasCachedParentPrincipal] = useState(false);
  const [isPrefsLoaded, setIsPrefsLoaded] = useState(false);
  const bootstrappedRef = useRef(false);
  const idleTimerRef = useRef(null);
  const lastParentActivityMsRef = useRef(Date.now());
  const lastParentPersistMsRef = useRef(0);
  const parentSharedDeviceIdleTimeoutMs = getParentSharedDeviceIdleTimeoutMs();

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const syncPrincipalFromUser = useCallback((user) => {
    if (!user) {
      setPrincipalType('unknown');
      setParentUnlockedState(false);
      setHasCachedParentPrincipal(false);
      setPrincipalValidated(false);
      return;
    }

    const nextPrincipalType = user.type === 'parent' ? 'parent' : 'kid';
    setPrincipalType(nextPrincipalType);
    setPrincipalValidated(true);
    if (nextPrincipalType === 'parent') {
      setParentUnlockedState(true);
      setHasCachedParentPrincipal(true);
    } else {
      setParentUnlockedState(false);
      setHasCachedParentPrincipal(false);
    }
  }, []);

  const clearPrincipalState = useCallback(async (options = {}) => {
    clearIdleTimer();
    bootstrappedRef.current = false;
    setBootstrapError(null);
    setBootstrapStatus(deviceSessionToken ? 'ready' : 'waiting_for_device');
    setPrincipalValidated(false);
    setPrincipalType('unknown');
    setParentUnlockedState(false);
    setHasCachedParentPrincipal(false);
    setIsParentSessionSharedDevice(DEFAULT_PARENT_SHARED_DEVICE);
    await setActiveMemberPrincipalToken(null);
    await setParentPrincipalToken(null);
    if (options.clearKidToken !== false) {
      await setKidPrincipalToken(null);
    }
    await clearCurrentFamilyMemberId();
    await clearPrincipalPrefs();
    await clearPreferredPrincipal();
    await clearParentSharedDeviceMode();
    if (options.signOut !== false) {
      await safeSignOutInstant();
    }
  }, [clearIdleTimer, deviceSessionToken]);

  const resetForUnauthorizedDevice = useCallback(async (error = null) => {
    await clearPrincipalState();
    await clearDeviceSession({ issue: deriveDeviceAuthIssueFromError(error, 'instant_principal') });
  }, [clearDeviceSession, clearPrincipalState]);

  const signIntoSharedKidPrincipal = useCallback(async ({ allowNetworkFetch = true } = {}) => {
    const applyKidPrincipal = async (token, { persist = false } = {}) => {
      await db.auth.signInWithToken(token);
      if (persist) {
        await setKidPrincipalToken(token);
      }
      await setParentPrincipalToken(null);
      await setParentUnlocked(false);
      await clearParentLastActivityAt();
      await setPreferredPrincipal('kid');
      setPrincipalType('kid');
      setPrincipalValidated(true);
      setParentUnlockedState(false);
      setHasCachedParentPrincipal(false);
      recordDiagnostic('principal_restore', persist ? 'shared_kid_network_success' : 'shared_kid_cached_success', {
        persist,
      });
      return true;
    };

    const cachedKidToken = await getKidPrincipalToken();
    if (cachedKidToken) {
      recordDiagnostic('principal_restore', 'shared_kid_cached_start', null);
      try {
        return await applyKidPrincipal(cachedKidToken);
      } catch (error) {
        if (error?.status === 401) {
          await setKidPrincipalToken(null);
          recordDiagnostic('principal_restore', 'shared_kid_cached_unauthorized', {
            status: error?.status || null,
          });
        } else {
          recordDiagnostic('principal_restore', 'shared_kid_cached_error', {
            status: error?.status || null,
            message: error?.message || 'unknown',
          });
          throw error;
        }
      }
    }

    if (!allowNetworkFetch) {
      recordDiagnostic('principal_restore', 'shared_kid_network_skipped', null);
      return false;
    }

    recordDiagnostic('principal_restore', 'shared_kid_network_start', null);
    const response = await getSharedKidInstantToken();
    return applyKidPrincipal(response.token, { persist: true });
  }, []);

  const signInFamilyMember = useCallback(async ({ familyMemberId, pin, sharedDevice } = {}) => {
    if (!deviceSessionToken) {
      throw new Error('Device activation is required');
    }
    if (!familyMemberId) {
      throw new Error('familyMemberId is required');
    }

    setIsSwitchingPrincipal(true);
    setBootstrapStatus('signing_in');
    recordDiagnostic('principal_sign_in', 'start', {
      familyMemberId,
    });
    try {
      const response = await getMemberInstantToken({ familyMemberId, pin });
      await db.auth.signInWithToken(response.token);
      await setActiveMemberPrincipalToken(response.token);
      await setCurrentFamilyMemberId(familyMemberId);

      const nextPrincipalType = response.principalType === 'parent' ? 'parent' : 'kid';
      const nextSharedMode =
        typeof sharedDevice === 'boolean' ? sharedDevice : await getParentSharedDeviceMode();
      await setParentSharedDeviceMode(nextSharedMode);
      setIsParentSessionSharedDevice(nextSharedMode);
      await setPreferredPrincipal(nextPrincipalType);

      if (nextPrincipalType === 'parent') {
        await setParentPrincipalToken(response.token);
        await setParentUnlocked(true);
        setParentUnlockedState(true);
        setHasCachedParentPrincipal(true);
        lastParentActivityMsRef.current = Date.now();
        await setParentLastActivityAt(lastParentActivityMsRef.current);
      } else {
        await setParentPrincipalToken(null);
        await setParentUnlocked(false);
        setParentUnlockedState(false);
        setHasCachedParentPrincipal(false);
        await clearParentLastActivityAt();
      }

      setPrincipalType(nextPrincipalType);
      setPrincipalValidated(true);
      bootstrappedRef.current = true;
      setBootstrapError(null);
      setBootstrapStatus('ready');
      recordDiagnostic('principal_sign_in', 'success', {
        familyMemberId,
        principalType: nextPrincipalType,
      });
    } catch (error) {
      if (error?.status === 401) {
        await resetForUnauthorizedDevice(error);
      }
      recordDiagnostic('principal_sign_in', 'error', {
        familyMemberId,
        status: error?.status || null,
        message: error?.message || 'unknown',
      });
      setBootstrapError(error);
      setBootstrapStatus('error');
      throw error;
    } finally {
      setIsSwitchingPrincipal(false);
    }
  }, [deviceSessionToken, resetForUnauthorizedDevice]);

  const ensureKidPrincipal = useCallback(async (opts = {}) => {
    setIsSwitchingPrincipal(true);
    setBootstrapStatus('signing_in');
    recordDiagnostic('principal_demote', 'start', {
      clearParentSession: Boolean(opts.clearParentSession),
    });
    try {
      setPrincipalValidated(false);
      setParentUnlockedState(false);
      setHasCachedParentPrincipal(false);
      await setActiveMemberPrincipalToken(null);
      await setParentPrincipalToken(null);
      await setPreferredPrincipal('kid');
      await setParentUnlocked(false);
      await clearParentLastActivityAt();
      if (opts.clearParentSession) {
        await clearParentSharedDeviceMode();
        setIsParentSessionSharedDevice(DEFAULT_PARENT_SHARED_DEVICE);
      }
      await signIntoSharedKidPrincipal();
      await clearCurrentFamilyMemberId();
      setBootstrapError(null);
      setBootstrapStatus('ready');
      recordDiagnostic('principal_demote', 'success', null);
    } finally {
      setIsSwitchingPrincipal(false);
    }
  }, [signIntoSharedKidPrincipal]);

  const elevateParentPrincipal = useCallback(async ({ familyMemberId, pin, sharedDevice }) => {
    await signInFamilyMember({ familyMemberId, pin, sharedDevice });
  }, [signInFamilyMember]);

  const demoteParentPrincipal = useCallback(async () => {
    await ensureKidPrincipal({ clearParentSession: true });
  }, [ensureKidPrincipal]);

  const retryBootstrap = useCallback(() => {
    bootstrappedRef.current = false;
    setBootstrapError(null);
    setPrincipalValidated(false);
    setBootstrapVersion((value) => value + 1);
  }, []);

  const recordParentActivity = useCallback(() => {
    if (principalType !== 'parent' || !parentUnlocked || !isParentSessionSharedDevice) return;

    const now = Date.now();
    lastParentActivityMsRef.current = now;
    if (now - lastParentPersistMsRef.current >= 5000) {
      lastParentPersistMsRef.current = now;
      void setParentLastActivityAt(now);
    }

    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      void ensureKidPrincipal({ clearParentSession: true }).catch((error) => {
        setBootstrapError(error);
        setBootstrapStatus('error');
      });
    }, parentSharedDeviceIdleTimeoutMs);
  }, [clearIdleTimer, ensureKidPrincipal, isParentSessionSharedDevice, parentSharedDeviceIdleTimeoutMs, parentUnlocked, principalType]);

  useEffect(() => {
    let cancelled = false;

    async function syncPrefs() {
      if (!deviceSessionToken) {
        if (!cancelled) {
          setIsPrefsLoaded(true);
        }
        return;
      }

      const [storedParentUnlocked, storedSharedMode, storedLastActivity, storedToken, storedPreferredPrincipal] = await Promise.all([
        getParentUnlocked(),
        getParentSharedDeviceMode(),
        getParentLastActivityAt(),
        getActiveMemberPrincipalToken(),
        getPreferredPrincipal(),
      ]);

      if (cancelled) return;

      setPrincipalType(storedPreferredPrincipal);
      setParentUnlockedState(storedParentUnlocked);
      setIsParentSessionSharedDevice(storedSharedMode);
      setHasCachedParentPrincipal(Boolean(storedParentUnlocked && storedToken));
      if (storedLastActivity) {
        lastParentActivityMsRef.current = storedLastActivity;
      }
      setIsPrefsLoaded(true);
    }

    setIsPrefsLoaded(false);
    void syncPrefs();

    return () => {
      cancelled = true;
    };
  }, [deviceSessionToken]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapPrincipal() {
      if (!deviceSessionToken) {
        clearIdleTimer();
        bootstrappedRef.current = false;
        setBootstrapStatus('waiting_for_device');
        setBootstrapError(null);
        setPrincipalValidated(false);
        setPrincipalType('unknown');
        recordDiagnostic('principal_restore', 'waiting_for_device', null);
        return;
      }

      if (!isPrefsLoaded) {
        return;
      }

      if (auth.user) {
        syncPrincipalFromUser(auth.user);
        setBootstrapStatus('ready');
        setBootstrapError(null);
        bootstrappedRef.current = true;
        recordDiagnostic('principal_restore', 'already_authenticated', {
          principalType: auth.user?.type || 'unknown',
        });
        return;
      }

      if (bootstrappedRef.current) {
        return;
      }

      bootstrappedRef.current = true;
      setBootstrapStatus('restoring_session');
      setBootstrapError(null);
      recordDiagnostic('principal_restore', 'start', null);

      const cachedMemberToken = await getActiveMemberPrincipalToken();
      if (cachedMemberToken) {
        recordDiagnostic('principal_restore', 'cached_member_start', null);
        try {
          await db.auth.signInWithToken(cachedMemberToken);
          if (!cancelled) {
            setPrincipalValidated(true);
            setBootstrapStatus('ready');
          }
          recordDiagnostic('principal_restore', 'cached_member_success', null);
          return;
        } catch (error) {
          if (error?.status === 401) {
            console.warn('Cached member session restore failed with 401; clearing active member token.', error);
            await setActiveMemberPrincipalToken(null);
            recordDiagnostic('principal_restore', 'cached_member_unauthorized', {
              status: error?.status || null,
            });
          } else {
            console.warn('Cached member session restore failed; keeping token for a later retry.', error);
            recordDiagnostic('principal_restore', 'cached_member_error', {
              status: error?.status || null,
              message: error?.message || 'unknown',
            });
            if (!cancelled) {
              setBootstrapError(error);
              setBootstrapStatus('ready');
            }
            bootstrappedRef.current = false;
            return;
          }
        }
      }

      try {
        await signIntoSharedKidPrincipal();
        if (!cancelled) {
          setPrincipalValidated(true);
          setBootstrapStatus('ready');
          setBootstrapError(null);
        }
      } catch (error) {
        if (error?.status === 401) {
          await resetForUnauthorizedDevice(error);
          return;
        }
        console.warn('Shared kid principal restore failed; keeping cached data available for a later retry.', error);
        recordDiagnostic('principal_restore', 'shared_kid_error', {
          status: error?.status || null,
          message: error?.message || 'unknown',
        });
        if (!cancelled) {
          setBootstrapError(error);
          setBootstrapStatus('ready');
        }
        bootstrappedRef.current = false;
      }
    }

    void bootstrapPrincipal();
    return () => {
      cancelled = true;
    };
  }, [
    auth.user,
    bootstrapVersion,
    clearIdleTimer,
    deviceSessionToken,
    isPrefsLoaded,
    resetForUnauthorizedDevice,
    signIntoSharedKidPrincipal,
    syncPrincipalFromUser,
  ]);

  useEffect(() => {
    if (principalType !== 'parent' || !parentUnlocked || !isParentSessionSharedDevice) {
      clearIdleTimer();
      return;
    }

    recordParentActivity();
    return clearIdleTimer;
  }, [clearIdleTimer, isParentSessionSharedDevice, parentUnlocked, principalType, recordParentActivity]);

  useEffect(() => {
    if (principalType !== 'parent' || !parentUnlocked || !isParentSessionSharedDevice) return undefined;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        recordParentActivity();
      }
    });

    return () => subscription.remove();
  }, [isParentSessionSharedDevice, parentUnlocked, principalType, recordParentActivity]);

  const canRenderCachedData = Boolean(deviceSessionToken && isPrefsLoaded);
  const hasFamilyPrincipal = auth.user?.type === 'kid' || auth.user?.type === 'parent';
  const canQueryFamilyData = Boolean(deviceSessionToken && hasFamilyPrincipal);
  const networkValidated = Boolean(deviceNetworkValidated && principalValidated);
  const instantReady = canRenderCachedData;

  const value = useMemo(() => ({
    auth,
    bootstrapStatus,
    bootstrapError,
    principalType,
    isSwitchingPrincipal,
    parentUnlocked,
    isParentSessionSharedDevice,
    hasCachedParentPrincipal,
    canRenderCachedData,
    canQueryFamilyData,
    hasFamilyPrincipal,
    instantReady,
    networkValidated,
    connectionStatus,
    db,
    ensureKidPrincipal,
    elevateParentPrincipal,
    demoteParentPrincipal,
    signInFamilyMember,
    recordParentActivity,
    clearPrincipalState,
    retryBootstrap,
    canUseCachedParentPrincipal: parentUnlocked && hasCachedParentPrincipal,
  }), [
    auth,
    bootstrapError,
    bootstrapStatus,
    canRenderCachedData,
    canQueryFamilyData,
    clearPrincipalState,
    connectionStatus,
    demoteParentPrincipal,
    deviceNetworkValidated,
    elevateParentPrincipal,
    ensureKidPrincipal,
    hasCachedParentPrincipal,
    hasFamilyPrincipal,
    instantReady,
    isParentSessionSharedDevice,
    isSwitchingPrincipal,
    networkValidated,
    parentUnlocked,
    principalValidated,
    principalType,
    recordParentActivity,
    retryBootstrap,
    signInFamilyMember,
  ]);

  return <InstantPrincipalContext.Provider value={value}>{children}</InstantPrincipalContext.Provider>;
}

export function useInstantPrincipal() {
  const value = useContext(InstantPrincipalContext);
  if (!value) {
    throw new Error('useInstantPrincipal must be used inside InstantPrincipalProvider');
  }
  return value;
}
