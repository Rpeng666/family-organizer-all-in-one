import { useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import { registerMobilePushDevice } from '../lib/api-client';
import { useFamilyAuth } from './FamilyAuthProvider';
import { useInstantPrincipal } from './InstantPrincipalProvider';

// Expo Go removed remote push notification support in SDK 53.
// Skip all push registration when running inside Expo Go.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

function getExpoProjectId() {
  return (
    Constants?.easConfig?.projectId ||
    Constants?.expoConfig?.extra?.eas?.projectId ||
    null
  );
}

export function PushRegistrationBridge() {
  const { currentUser } = useFamilyAuth();
  const { instantReady, principalType } = useInstantPrincipal();
  const lastRegisteredRef = useRef('');

  useEffect(() => {
    if (IS_EXPO_GO) return;
    if (!currentUser?.id || !instantReady) return;

    let cancelled = false;

    async function registerPushToken() {
      const Notifications = await import('expo-notifications');
      const existingPermission = await Notifications.getPermissionsAsync();
      let permissionStatus = existingPermission.status;
      if (permissionStatus !== 'granted') {
        const requestedPermission = await Notifications.requestPermissionsAsync();
        permissionStatus = requestedPermission.status;
      }

      if (permissionStatus !== 'granted') return;

      const projectId = getExpoProjectId();
      const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      const expoToken = tokenResponse?.data || '';
      if (!expoToken) return;

      const registrationKey = `${currentUser.id}:${expoToken}:${principalType}`;
      if (lastRegisteredRef.current === registrationKey) return;

      await registerMobilePushDevice({ token: expoToken, platform: 'expo', isEnabled: true });

      if (!cancelled) {
        lastRegisteredRef.current = registrationKey;
      }
    }

    void registerPushToken().catch((error) => {
      console.warn('Push registration skipped', error);
    });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, instantReady, principalType]);

  return null;
}
