import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '../lib/instant-db';
import { recordDiagnostic } from '../lib/diagnostics';
import { useDeviceSession } from './DeviceSessionProvider';
import { useInstantPrincipal } from './InstantPrincipalProvider';
import { clearCurrentFamilyMemberId, getCurrentFamilyMemberId, setCurrentFamilyMemberId } from '../lib/session-prefs';

export const FamilyAuthContext = createContext(null);

function mapMember(member) {
  if (!member) return null;
  return {
    id: member.id,
    name: member.name,
    messageDigestMode: member.messageDigestMode,
    messageDigestWindowMinutes: member.messageDigestWindowMinutes,
    messageQuietHoursEnabled: member.messageQuietHoursEnabled,
    messageQuietHoursEnd: member.messageQuietHoursEnd,
    messageQuietHoursStart: member.messageQuietHoursStart,
    role: member.role,
    photoUrls: member.photoUrls,
    pinHash: member.pinHash,
    viewShowChoreDescriptions: member.viewShowChoreDescriptions,
    viewShowTaskDetails: member.viewShowTaskDetails,
  };
}

export function FamilyAuthProvider({ children }) {
  const { deviceSessionToken } = useDeviceSession();
  const { auth, canQueryFamilyData, canRenderCachedData, instantReady, principalType, ensureKidPrincipal } = useInstantPrincipal();
  const [isRestoringSelection, setIsRestoringSelection] = useState(true);
  const [lastSelectedMemberId, setLastSelectedMemberId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function restoreSelection() {
      if (!deviceSessionToken) {
        if (!cancelled) {
          setLastSelectedMemberId(null);
          setIsRestoringSelection(false);
        }
        return;
      }

      const storedId = await getCurrentFamilyMemberId();
      if (!cancelled) {
        setLastSelectedMemberId(storedId || null);
        setIsRestoringSelection(false);
      }
    }

    setIsRestoringSelection(true);
    void restoreSelection();

    return () => {
      cancelled = true;
    };
  }, [deviceSessionToken]);

  const familyQuery = db.useQuery(
    {
      familyMembers: {
        $: { order: { order: 'asc' } },
      },
    },
    {
      enabled: Boolean(deviceSessionToken && canQueryFamilyData),
    }
  );

  const familyMembers = useMemo(() => (familyQuery.data?.familyMembers || []).map(mapMember), [familyQuery.data?.familyMembers]);
  const authenticatedFamilyMemberId =
    auth.user && typeof auth.user.familyMemberId === 'string' ? String(auth.user.familyMemberId) : null;
  const currentFamilyMemberId = authenticatedFamilyMemberId || lastSelectedMemberId || null;
  const currentUser = useMemo(
    () => familyMembers.find((member) => member.id === currentFamilyMemberId) || null,
    [currentFamilyMemberId, familyMembers]
  );

  useEffect(() => {
    if (!canQueryFamilyData) return;
    if (familyQuery.error) {
      recordDiagnostic('family_roster', 'error', {
        message: familyQuery.error?.message || 'unknown',
      });
      return;
    }
    if (familyMembers.length > 0) {
      recordDiagnostic('family_roster', 'hydrated', {
        count: familyMembers.length,
      });
    }
  }, [canQueryFamilyData, familyMembers.length, familyQuery.error]);

  useEffect(() => {
    if (authenticatedFamilyMemberId) {
      void setCurrentFamilyMemberId(authenticatedFamilyMemberId);
      setLastSelectedMemberId(authenticatedFamilyMemberId);
    }
  }, [auth.user, authenticatedFamilyMemberId]);

  const login = useCallback(async (member) => {
    if (!member?.id) return;
    await setCurrentFamilyMemberId(member.id);
    setLastSelectedMemberId(member.id);
  }, []);

  const clearFamilySessionState = useCallback(async () => {
    await clearCurrentFamilyMemberId();
    setLastSelectedMemberId(null);
  }, []);

  const lock = useCallback(async () => {
    await clearFamilySessionState();
    await ensureKidPrincipal({ clearParentSession: true });
  }, [clearFamilySessionState, ensureKidPrincipal]);

  const value = useMemo(
    () => ({
      currentUser,
      currentUserId: currentFamilyMemberId,
      lastSelectedMemberId,
      isAuthenticated: !!currentUser && Boolean(deviceSessionToken && instantReady),
      canRenderCachedData,
      canQueryFamilyData,
      isRestoringSelection,
      familyMembers,
      familyMembersLoading: familyQuery.isLoading,
      familyMembersError: familyQuery.error,
      login,
      lock,
      clearFamilySessionState,
      principalType,
    }),
    [
      clearFamilySessionState,
      currentFamilyMemberId,
      currentUser,
      canQueryFamilyData,
      canRenderCachedData,
      deviceSessionToken,
      familyMembers,
      familyQuery.error,
      familyQuery.isLoading,
      instantReady,
      isRestoringSelection,
      lastSelectedMemberId,
      login,
      lock,
      principalType,
    ]
  );

  return <FamilyAuthContext.Provider value={value}>{children}</FamilyAuthContext.Provider>;
}

export function useFamilyAuth() {
  const value = useContext(FamilyAuthContext);
  if (!value) {
    throw new Error('useFamilyAuth must be used inside FamilyAuthProvider');
  }
  return value;
}
