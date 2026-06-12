import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getDeviceSessionToken, setDeviceSessionToken } from '../lib/device-session-store';
import { refreshMobileDeviceSession } from '../lib/api-client';
import { recordDiagnostic } from '../lib/diagnostics';
import { buildDeviceAuthIssue, deriveDeviceAuthIssueFromError } from '../lib/device-auth-issue';

const DeviceSessionContext = createContext(null);
const BOOTSTRAP_TOKEN_READ_MAX_ATTEMPTS = 3;
const BOOTSTRAP_TOKEN_READ_RETRY_BASE_MS = 180;

export function DeviceSessionProvider({ children }) {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [deviceSessionToken, setTokenState] = useState(null);
  const [activationRequired, setActivationRequired] = useState(true);
  const [activationIssue, setActivationIssue] = useState(null);
  const [networkValidated, setNetworkValidated] = useState(false);
  const refreshInFlightRef = useRef(false);
  const hasLaunchValidationRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapDeviceSessionToken() {
      let token = null;
      let lastError = null;

      for (let attempt = 1; attempt <= BOOTSTRAP_TOKEN_READ_MAX_ATTEMPTS; attempt += 1) {
        try {
          token = await getDeviceSessionToken();
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < BOOTSTRAP_TOKEN_READ_MAX_ATTEMPTS) {
            await new Promise((resolve) => {
              setTimeout(resolve, BOOTSTRAP_TOKEN_READ_RETRY_BASE_MS * attempt);
            });
          }
        }
      }

      if (!isMounted) return;

      if (lastError) {
        console.warn('[DeviceSessionProvider] Failed to read device session token during bootstrap.', lastError);
      }

      setTokenState(token);
      setActivationRequired(!token);
      setNetworkValidated(!token);
      recordDiagnostic('device_session_bootstrap', 'resolved', {
        hasToken: Boolean(token),
        hadError: Boolean(lastError),
      });
      if (token) {
        setActivationIssue(null);
      } else if (lastError) {
        setActivationIssue(
          buildDeviceAuthIssue({
            code: 'local_token_read_failed',
            source: 'device_session_bootstrap',
            details: String(lastError?.message || ''),
          })
        );
      } else {
        setActivationIssue(null);
      }
      setIsBootstrapping(false);
    }

    void bootstrapDeviceSessionToken();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!deviceSessionToken) {
      hasLaunchValidationRef.current = false;
      return;
    }

    let isMounted = true;

    async function refreshDeviceSession(source) {
      if (refreshInFlightRef.current) return;

      refreshInFlightRef.current = true;
      recordDiagnostic('device_session_refresh', 'start', { source });
      try {
        const refreshed = await refreshMobileDeviceSession();
        if (!isMounted) return;

        if (refreshed?.deviceSessionToken) {
          await setDeviceSessionToken(refreshed.deviceSessionToken);
          if (!isMounted) return;
          setTokenState(refreshed.deviceSessionToken);
          setActivationRequired(false);
          setActivationIssue(null);
          setNetworkValidated(true);
          recordDiagnostic('device_session_refresh', 'success', {
            source,
            hasToken: Boolean(refreshed.deviceSessionToken),
          });
        }
      } catch (error) {
        if (!isMounted) return;
        if (error?.status === 401) {
          await setDeviceSessionToken(null);
          if (!isMounted) return;
          setTokenState(null);
          setActivationRequired(true);
          setNetworkValidated(true);
          setActivationIssue(
            deriveDeviceAuthIssueFromError(
              error,
              source === 'launch'
                ? 'device_session_launch_validation'
                : 'device_session_refresh'
            )
          );
          recordDiagnostic('device_session_refresh', 'unauthorized', {
            source,
            status: error?.status || null,
          });
          return;
        }
        recordDiagnostic('device_session_refresh', 'error', {
          source,
          status: error?.status || null,
          message: error?.message || 'unknown',
        });
        // Keep the existing token on transient failures. The backend will reject stale tokens and the UI can re-activate.
      } finally {
        refreshInFlightRef.current = false;
      }
    }

    if (!hasLaunchValidationRef.current) {
      hasLaunchValidationRef.current = true;
      void refreshDeviceSession('launch');
    }

    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      await refreshDeviceSession('resume');
    });

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [deviceSessionToken]);

  const value = useMemo(
    () => ({
      isBootstrapping,
      activationRequired,
      deviceSessionToken,
      activationIssue,
      networkValidated,
      async completeActivation(token) {
        await setDeviceSessionToken(token);
        setTokenState(token);
        setActivationRequired(false);
        setActivationIssue(null);
        setNetworkValidated(false);
        hasLaunchValidationRef.current = true;
      },
      async clearDeviceSession(options = {}) {
        const issue = options?.issue || null;
        await setDeviceSessionToken(null);
        setTokenState(null);
        setActivationRequired(true);
        setActivationIssue(issue);
        setNetworkValidated(false);
      },
      clearActivationIssue() {
        setActivationIssue(null);
      },
    }),
    [activationIssue, activationRequired, deviceSessionToken, isBootstrapping, networkValidated]
  );

  return <DeviceSessionContext.Provider value={value}>{children}</DeviceSessionContext.Provider>;
}

export function useDeviceSession() {
  const value = useContext(DeviceSessionContext);
  if (!value) {
    throw new Error('useDeviceSession must be used inside DeviceSessionProvider');
  }
  return value;
}
