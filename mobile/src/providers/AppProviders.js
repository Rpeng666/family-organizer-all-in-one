import React, { useMemo } from 'react';
import { View } from 'react-native';
import { db } from '../lib/instant-db';
import { DeviceSessionProvider, useDeviceSession } from './DeviceSessionProvider';
import { NetworkStatusProvider, useNetworkStatus } from './NetworkStatusProvider';
import { InstantPrincipalProvider, InstantPrincipalContext, useInstantPrincipal } from './InstantPrincipalProvider';
import { FamilyAuthProvider, FamilyAuthContext, useFamilyAuth } from './FamilyAuthProvider';
import { PushRegistrationBridge } from './PushRegistrationBridge';
import { MessageNotificationBridge } from './MessageNotificationBridge';

const NOOP = () => {};
const NOOP_ASYNC = async () => {};

function InteractionCapture({ children }) {
  const { recordParentActivity } = useInstantPrincipal();

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        recordParentActivity();
        return false;
      }}
    >
      {children}
    </View>
  );
}

/**
 * Stub providers used when InstantDB is not yet initialized (first launch,
 * before the server URL is configured). Provides the same contexts so that
 * useInstantPrincipal() and useFamilyAuth() hooks work everywhere without
 * violating the Rules of Hooks.
 */
function StubInstantProviders({ children }) {
  const stubPrincipal = useMemo(() => ({
    bootstrapStatus: 'waiting_for_device',
    bootstrapError: null,
    principalType: 'unknown',
    isSwitchingPrincipal: false,
    parentUnlocked: false,
    isParentSessionSharedDevice: false,
    hasCachedParentPrincipal: false,
    canRenderCachedData: false,
    canQueryFamilyData: false,
    hasFamilyPrincipal: false,
    instantReady: false,
    networkValidated: false,
    connectionStatus: null,
    db: null,
    ensureKidPrincipal: NOOP_ASYNC,
    elevateParentPrincipal: NOOP_ASYNC,
    demoteParentPrincipal: NOOP_ASYNC,
    signInFamilyMember: NOOP_ASYNC,
    recordParentActivity: NOOP,
    clearPrincipalState: NOOP_ASYNC,
    retryBootstrap: NOOP,
  }), []);

  const stubFamily = useMemo(() => ({
    familyMembers: [],
    currentUser: null,
    isRestoringSelection: false,
    isAuthenticated: false,
    login: NOOP_ASYNC,
    lock: NOOP_ASYNC,
    clearFamilySessionState: NOOP_ASYNC,
  }), []);

  return (
    <InstantPrincipalContext.Provider value={stubPrincipal}>
      <FamilyAuthContext.Provider value={stubFamily}>
        {children}
      </FamilyAuthContext.Provider>
    </InstantPrincipalContext.Provider>
  );
}

function InstantProviders({ children }) {
  return (
    <InstantPrincipalProvider>
      <FamilyAuthProvider>
        <PushRegistrationBridge />
        <MessageNotificationBridge />
        <InteractionCapture>{children}</InteractionCapture>
      </FamilyAuthProvider>
    </InstantPrincipalProvider>
  );
}

export function AppProviders({ children }) {
  const hasDb = db != null;

  return (
    <DeviceSessionProvider>
      <NetworkStatusProvider>
        {hasDb ? (
          <InstantProviders>{children}</InstantProviders>
        ) : (
          <StubInstantProviders>{children}</StubInstantProviders>
        )}
      </NetworkStatusProvider>
    </DeviceSessionProvider>
  );
}

export function useAppSession() {
  const device = useDeviceSession();
  const network = useNetworkStatus();
  const principal = useInstantPrincipal();
  const family = useFamilyAuth();

  const principalBootstrapping =
    !device.activationRequired &&
    db != null &&
    !principal.canRenderCachedData &&
    (principal.bootstrapStatus === 'signing_in' ||
      principal.bootstrapStatus === 'restoring_session' ||
      (principal.bootstrapStatus === 'waiting_for_device' && !!device.deviceSessionToken));

  const isBootstrapping =
    device.isBootstrapping ||
    principalBootstrapping ||
    family.isRestoringSelection;

  return {
    ...device,
    ...network,
    ...principal,
    ...family,
    isBootstrapping,
    isParentMode: principal.principalType === 'parent',
    async resetDeviceSession() {
      await family.clearFamilySessionState();
      await principal.clearPrincipalState();
      await device.clearDeviceSession();
    },
  };
}
