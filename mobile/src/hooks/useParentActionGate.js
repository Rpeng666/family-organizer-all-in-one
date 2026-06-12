import { useCallback } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { setPendingParentAction } from '../lib/session-prefs';
import { useAppSession } from '../providers/AppProviders';

export function useParentActionGate() {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, principalType } = useAppSession();

  const requireParentAction = useCallback(
    async ({ actionId, actionLabel, payload, returnPath }) => {
      if (isAuthenticated && principalType === 'parent') {
        return false;
      }

      await setPendingParentAction({
        actionId,
        actionLabel,
        payload: payload && typeof payload === 'object' ? payload : {},
        returnPath: returnPath || pathname || '/dashboard',
        createdAt: Date.now(),
      });

      router.push('/lock?intent=parent-action');
      return true;
    },
    [isAuthenticated, pathname, principalType, router]
  );

  return {
    requireParentAction,
    isParentReady: isAuthenticated && principalType === 'parent',
  };
}
