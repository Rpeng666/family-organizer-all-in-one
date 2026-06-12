import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AvatarPhotoImage } from '../src/components/AvatarPhotoImage';
import { useAppSession } from '../src/providers/AppProviders';
import { clearPendingParentAction, getPendingParentAction } from '../src/lib/session-prefs';
import { useBootstrap } from './_layout';
import { E, SP, R, T, EButton, EDivider } from '../src/theme/E';

const PIN_PAD_LAYOUT = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'delete'],
];
const MAX_PIN_LENGTH = 6;

function automationMemberKey(member) {
  const source = member?.name || member?.id || 'unknown';
  return String(source).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function deviceCanLoadRoster(instantReady, bootstrapStatus, isAuthenticated) {
  if (isAuthenticated) return false;
  return instantReady && bootstrapStatus !== 'waiting_for_device';
}

// ─── Seal illustration ────────────────────────────────────────────────────────
function SealMark({ size = 64 }) {
  const half = size / 2;
  const inner = size * 0.58;
  const innerHalf = inner / 2;
  const dot = size * 0.1;
  return (
    <View style={{ width: size, height: size, borderRadius: half, borderWidth: 1, borderColor: E.accent, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: inner, height: inner, borderRadius: innerHalf, borderWidth: 1, borderColor: E.border, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: E.accent }} />
      </View>
    </View>
  );
}

export default function LockScreen() {
  const { rebootstrap } = useBootstrap();
  const {
    db,
    activationRequired,
    canQueryFamilyData,
    familyMembers: sessionFamilyMembers,
    isAuthenticated,
    instantReady,
    bootstrapStatus,
    bootstrapError,
    retryBootstrap,
    principalType,
    canUseCachedParentPrincipal,
    isParentSessionSharedDevice,
    isOnline,
    signInFamilyMember,
    login,
  } = useAppSession();

  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [parentSharedDevice, setParentSharedDevice] = useState(isParentSessionSharedDevice);
  const [pendingParentAction, setPendingParentActionState] = useState(null);
  const [pendingParentActionLoaded, setPendingParentActionLoaded] = useState(false);
  const [redirectTarget, setRedirectTarget] = useState('');
  const [lastKnownFamilyMembers, setLastKnownFamilyMembers] = useState([]);
  const hardwarePinInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function loadPendingAction() {
      const pending = await getPendingParentAction();
      if (!cancelled) { setPendingParentActionState(pending); setPendingParentActionLoaded(true); }
    }
    void loadPendingAction();
    return () => { cancelled = true; };
  }, []);

  const rosterQuery = db?.useQuery?.(
    activationRequired || !canQueryFamilyData || !deviceCanLoadRoster(instantReady, bootstrapStatus, isAuthenticated)
      ? null
      : { familyMembers: { $: { order: { order: 'asc' } } } }
  ) || { data: null, isLoading: false, error: null };

  const liveFamilyMembers = useMemo(() => {
    const src = Array.isArray(sessionFamilyMembers) && sessionFamilyMembers.length > 0
      ? sessionFamilyMembers
      : rosterQuery.data?.familyMembers || [];
    return src.map((m) => ({ ...m, hasPin: Boolean(m?.pinHash) }));
  }, [rosterQuery.data?.familyMembers, sessionFamilyMembers]);

  const familyMembersError = rosterQuery.error;
  const hasRosterResult = Array.isArray(rosterQuery.data?.familyMembers);

  const familyMembers = useMemo(() => {
    if (liveFamilyMembers.length > 0) return liveFamilyMembers;
    if (!familyMembersError && lastKnownFamilyMembers.length > 0) return lastKnownFamilyMembers;
    return liveFamilyMembers;
  }, [familyMembersError, lastKnownFamilyMembers, liveFamilyMembers]);

  const familyMembersLoading =
    familyMembers.length === 0 && !familyMembersError && !activationRequired && !canQueryFamilyData && !isAuthenticated && bootstrapStatus !== 'error'
      ? true
      : familyMembers.length === 0 && !familyMembersError && !activationRequired && canQueryFamilyData &&
        deviceCanLoadRoster(instantReady, bootstrapStatus, isAuthenticated) && (rosterQuery.isLoading || !hasRosterResult);

  useEffect(() => {
    if (activationRequired) { setLastKnownFamilyMembers([]); return; }
    if (liveFamilyMembers.length > 0) setLastKnownFamilyMembers(liveFamilyMembers);
  }, [activationRequired, liveFamilyMembers]);

  const selectedMember = useMemo(() => familyMembers.find((m) => m.id === selectedMemberId) || null, [familyMembers, selectedMemberId]);
  const isParentSelection = selectedMember?.role === 'parent';
  const parentPinCanBeSkipped = isParentSelection && canUseCachedParentPrincipal && principalType === 'parent';
  const pinEntryRequired = isParentSelection || Boolean(selectedMember?.hasPin);
  const pinSlots = Math.max(4, Math.min(MAX_PIN_LENGTH, Math.max(pin.length, 4)));

  const focusHardwarePinInput = useCallback(() => {
    if (!selectedMember) return;
    hardwarePinInputRef.current?.focus?.();
  }, [selectedMember]);

  const pendingRedirect = activationRequired
    ? '/activate'
    : redirectTarget && pendingParentActionLoaded && isAuthenticated ? redirectTarget
    : isAuthenticated && pendingParentActionLoaded && !pendingParentAction ? '/dashboard'
    : '';

  useEffect(() => { if (pendingRedirect) router.replace(pendingRedirect); }, [pendingRedirect]);

  useEffect(() => {
    if (activationRequired || instantReady || bootstrapStatus === 'signing_in') return;
    const t = setTimeout(() => {
      if (bootstrapStatus === 'error') { retryBootstrap(); return; }
      void rebootstrap().catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [activationRequired, bootstrapStatus, instantReady, rebootstrap, retryBootstrap]);

  useEffect(() => {
    if (!selectedMember) return;
    const t = setTimeout(() => focusHardwarePinInput(), 40);
    return () => clearTimeout(t);
  }, [focusHardwarePinInput, selectedMember]);

  async function handleCancelPendingParentAction() {
    const returnPath = pendingParentAction?.returnPath || '/dashboard';
    await clearPendingParentAction();
    setPendingParentActionState(null);
    setPendingParentActionLoaded(true);
    setSelectedMemberId(null);
    setPin(''); setError(''); setRedirectTarget('');
    router.replace(returnPath);
  }

  function appendPinDigit(digit) {
    if (!pinEntryRequired || submitting) return;
    setError('');
    setPin((c) => c.length >= MAX_PIN_LENGTH ? c : `${c}${digit}`);
  }
  function clearPin() { if (!pinEntryRequired || submitting) return; setError(''); setPin(''); }
  function deletePinDigit() { if (!pinEntryRequired || submitting) return; setError(''); setPin((c) => c.slice(0, -1)); }

  function handleBackAction() {
    if (pendingParentAction) { void handleCancelPendingParentAction(); return; }
    setSelectedMemberId(null); setPin(''); setError('');
  }

  function handleHardwareInputChange(v) {
    if (!pinEntryRequired || submitting) return;
    setError('');
    setPin(String(v || '').replace(/\D+/g, '').slice(0, MAX_PIN_LENGTH));
  }

  function handleHardwareKeyPress(event) {
    if (!selectedMember || submitting) return;
    const key = event?.nativeEvent?.key;
    if (!key) return;
    if (/^\d$/.test(key)) { appendPinDigit(key); return; }
    if (key === 'Backspace') { deletePinDigit(); return; }
    if (key === 'Enter' || key === 'Return') { void handleMemberConfirm(); return; }
    if (key === 'Escape') handleBackAction();
  }

  async function handleMemberConfirm() {
    if (!selectedMember || submitting) return;
    setSubmitting(true); setError('');
    try {
      if (pendingParentAction && selectedMember.role !== 'parent')
        throw new Error('Parent login is required to continue this action.');
      if (selectedMember.role === 'parent') {
        if (!parentPinCanBeSkipped && !pin.trim()) throw new Error('Parent PIN is required');
        if (!parentPinCanBeSkipped && !isOnline) throw new Error('Parent mode requires internet access');
        await signInFamilyMember({ familyMemberId: selectedMember.id, pin: pin.trim(), sharedDevice: parentSharedDevice });
        await login(selectedMember);
        if (pendingParentAction) {
          const targetPath = pendingParentAction.returnPath || '/dashboard';
          setRedirectTarget(`${targetPath}?resumeParentAction=1&resumeActionId=${encodeURIComponent(pendingParentAction.actionId)}&resumeNonce=${Date.now()}`);
          return;
        }
        setRedirectTarget('/dashboard');
        return;
      }
      await signInFamilyMember({ familyMemberId: selectedMember.id, pin: pin.trim() });
      await login(selectedMember);
      setRedirectTarget('/dashboard');
    } catch (e) {
      setError(e?.message || 'Unable to log in');
      setPin('');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectMember(member) {
    setSelectedMemberId(member.id);
    setPin(''); setError('');
    setParentSharedDevice(isParentSessionSharedDevice);
  }

  // ─── Loading / redirect splash ──────────────────────────────────────────────
  if (pendingRedirect) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.centerFill}>
          <SealMark />
          <ActivityIndicator size="small" color={E.accent} style={{ marginTop: SP.md }} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── PIN / member detail ─────────────────────────────────────────────────────
  if (selectedMember) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <TextInput
          ref={hardwarePinInputRef}
          value={pinEntryRequired ? pin : ''}
          onChangeText={handleHardwareInputChange}
          onKeyPress={handleHardwareKeyPress}
          onSubmitEditing={() => { void handleMemberConfirm(); }}
          autoFocus
          blurOnSubmit={false}
          caretHidden
          contextMenuHidden
          keyboardType="number-pad"
          returnKeyType="go"
          showSoftInputOnFocus={false}
          style={s.hiddenInput}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        <ScrollView contentContainerStyle={s.detailContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {/* Member header */}
          <View style={s.memberHeader}>
            <Pressable onPress={handleBackAction} style={s.backLink} accessibilityRole="button">
              <Text style={s.backLinkText}>← {pendingParentAction ? 'Cancel' : 'Back'}</Text>
            </Pressable>
            <AvatarPhotoImage
              photoUrls={selectedMember.photoUrls}
              preferredSize="320"
              style={s.detailAvatar}
              fallback={
                <View style={s.detailAvatarFallback}>
                  <Text style={s.detailAvatarLetter}>{(selectedMember.name || '?').slice(0, 1).toUpperCase()}</Text>
                </View>
              }
            />
            <Text style={s.detailName}>{selectedMember.name}</Text>
            <Text style={s.detailRole}>{isParentSelection ? 'Parent' : 'Family member'}</Text>
          </View>

          {/* Shared device mode (parents only) */}
          {isParentSelection ? (
            <View style={s.sharedCard}>
              <View style={s.sharedRow}>
                <Text style={s.sharedTitle}>Shared device mode</Text>
                <Switch
                  testID="parent-shared-device-switch"
                  accessibilityLabel="Shared device mode"
                  value={parentSharedDevice}
                  onValueChange={setParentSharedDevice}
                  thumbColor={E.surface}
                  trackColor={{ false: E.border, true: E.accentDeep }}
                />
              </View>
              <Text style={s.sharedBody}>Parent access auto-demotes after inactivity when enabled.</Text>
            </View>
          ) : null}

          {/* PIN section */}
          <View style={s.pinBlock} onTouchStart={focusHardwarePinInput}>
            <Text style={[T.label, s.pinLabel]}>
              {isParentSelection
                ? parentPinCanBeSkipped ? 'PARENT PIN (OPTIONAL)' : 'PARENT PIN'
                : selectedMember.hasPin ? 'PIN' : 'NO PIN REQUIRED'}
            </Text>

            {pinEntryRequired ? (
              <>
                <View style={s.pinDotsRow}>
                  {Array.from({ length: pinSlots }).map((_, i) => (
                    <View key={i} style={[s.pinDot, i < pin.length && s.pinDotFilled]} />
                  ))}
                </View>
                <Text style={[T.caption, s.pinHint]}>
                  {pin.length > 0
                    ? `${pin.length} digit${pin.length === 1 ? '' : 's'} entered`
                    : parentPinCanBeSkipped
                    ? 'PIN can be skipped on this device'
                    : 'Use the number pad below'}
                </Text>
              </>
            ) : (
              <Text style={[T.caption, s.pinHint]}>No PIN is set for this member.</Text>
            )}
          </View>

          {/* Number pad */}
          {pinEntryRequired ? (
            <View style={s.pinPad}>
              {PIN_PAD_LAYOUT.map((row, ri) => (
                <View key={ri} style={s.pinRow}>
                  {row.map((val) => {
                    if (val === 'clear') return (
                      <Pressable key="clear" testID="pin-key-clear" accessibilityRole="button" accessibilityLabel="Clear PIN"
                        style={({ pressed }) => [s.pinKey, s.pinKeyUtil, pressed && s.pinKeyPressed]}
                        onPress={clearPin}>
                        <Text style={[s.pinKeyText, s.pinKeyUtilText]}>Clear</Text>
                      </Pressable>
                    );
                    if (val === 'delete') return (
                      <Pressable key="delete" testID="pin-key-delete" accessibilityRole="button" accessibilityLabel="Delete digit"
                        style={({ pressed }) => [s.pinKey, s.pinKeyUtil, pressed && s.pinKeyPressed]}
                        onPress={deletePinDigit}>
                        <Text style={[s.pinKeyText, s.pinKeyUtilText]}>⌫</Text>
                      </Pressable>
                    );
                    return (
                      <Pressable key={val} testID={`pin-key-${val}`} accessibilityRole="button" accessibilityLabel={`PIN digit ${val}`}
                        style={({ pressed }) => [s.pinKey, pressed && s.pinKeyPressed]}
                        onPress={() => appendPinDigit(val)}>
                        <Text style={s.pinKeyText}>{val}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : null}

          {!isOnline && isParentSelection && !parentPinCanBeSkipped
            ? <Text style={s.warnText}>Internet is required for parent elevation.</Text>
            : null}
          {error ? <Text testID="lock-error-message" style={s.errorText}>{error}</Text> : null}

          <EButton
            label={submitting ? 'Working…' : pinEntryRequired ? 'Unlock' : 'Continue'}
            onPress={() => { void handleMemberConfirm(); }}
            disabled={submitting}
            style={s.actionBtn}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── Member grid ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
      <ScrollView contentContainerStyle={s.gridContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.gridHeader}>
          <SealMark />
          <Text style={[T.h1, s.gridTitle]}>
            {instantReady
              ? pendingParentAction ? 'Parent login required.' : 'Who\'s using\nthe app?'
              : 'Connecting…'}
          </Text>
          {pendingParentAction?.actionLabel ? (
            <Text style={[T.body, s.gridSubtitle]}>
              Parent login needed to continue: {pendingParentAction.actionLabel}
            </Text>
          ) : null}
        </View>

        {/* Loading / error states */}
        {(!canQueryFamilyData || !instantReady) && familyMembers.length === 0 ? (
          <View style={s.statusCard}>
            <ActivityIndicator size="small" color={E.accent} />
            <Text style={[T.caption, { marginTop: SP.sm, textAlign: 'center' }]}>
              {bootstrapStatus === 'error'
                ? bootstrapError?.message || 'Unable to connect to family data.'
                : 'Restoring family data…'}
            </Text>
            {(bootstrapStatus === 'error' || bootstrapError) ? (
              <Pressable testID="lock-retry-connection-button" accessibilityRole="button" onPress={retryBootstrap} style={s.retryBtn}>
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : familyMembersLoading ? (
          <View style={s.statusCard}>
            <ActivityIndicator size="small" color={E.accent} />
            <Text style={[T.caption, { marginTop: SP.sm }]}>Loading family members…</Text>
          </View>
        ) : familyMembersError ? (
          <View style={s.statusCard}>
            <Text style={[T.h3, { marginBottom: SP.xs }]}>Couldn't load members</Text>
            <Text style={T.caption}>{familyMembersError.message || 'Please try again.'}</Text>
            <Pressable testID="lock-retry-members-button" accessibilityRole="button" onPress={retryBootstrap} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Pending parent action banner */}
            {pendingParentAction ? (
              <View style={s.pendingCard}>
                <Text style={s.pendingTitle}>Parent login required</Text>
                <Text style={s.pendingBody}>
                  {pendingParentAction.actionLabel
                    ? `Log in as a parent to continue: ${pendingParentAction.actionLabel}.`
                    : 'Log in as a parent to continue this action.'}
                </Text>
                <Pressable testID="lock-cancel-parent-action" accessibilityRole="button"
                  onPress={() => { void handleCancelPendingParentAction(); }} style={s.pendingCancel}>
                  <Text style={s.pendingCancelText}>Cancel and go back</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Member cards */}
            <View style={s.grid}>
              {familyMembers.map((member) => {
                const isParent = member.role === 'parent';
                return (
                  <Pressable
                    key={member.id}
                    testID={`member-card-${automationMemberKey(member)}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${member.name || 'family member'}`}
                    style={({ pressed }) => [s.memberCard, isParent && s.memberCardParent, pressed && s.memberCardPressed]}
                    onPress={() => handleSelectMember(member)}
                  >
                    <AvatarPhotoImage
                      photoUrls={member.photoUrls}
                      preferredSize="320"
                      style={s.avatar}
                      fallback={
                        <View style={[s.avatarFallback, isParent && s.avatarFallbackParent]}>
                          <Text style={s.avatarLetter}>{(member.name || '?').slice(0, 1).toUpperCase()}</Text>
                        </View>
                      }
                    />
                    <Text style={s.memberName}>{member.name}</Text>
                    <Text style={s.memberSub}>
                      {isParent ? 'Parent' : member.hasPin ? 'PIN required' : 'Tap to enter'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {familyMembers.length === 0 ? (
              <View style={s.statusCard}>
                <Text style={T.caption}>No family members found.</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: E.bg },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Grid / roster
  gridContent: { paddingHorizontal: SP.md, paddingTop: SP.xl, paddingBottom: SP.xxl },
  gridHeader: { alignItems: 'center', marginBottom: SP.xl, gap: SP.sm },
  gridTitle: { textAlign: 'center', marginTop: SP.sm },
  gridSubtitle: { textAlign: 'center', maxWidth: 280 },

  statusCard: {
    backgroundColor: E.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: E.border,
    padding: SP.md,
    alignItems: 'center',
    gap: SP.xs,
  },

  pendingCard: {
    backgroundColor: E.warnBg,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: E.warnBorder,
    padding: SP.md,
    gap: SP.xs,
    marginBottom: SP.md,
  },
  pendingTitle: { fontSize: 13, fontWeight: '600', color: E.warn },
  pendingBody: { fontSize: 13, lineHeight: 19, fontWeight: '300', color: E.warn, opacity: 0.85 },
  pendingCancel: { alignSelf: 'flex-start', marginTop: SP.xs },
  pendingCancelText: { fontSize: 13, color: E.warn, fontWeight: '500', textDecorationLine: 'underline' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },
  memberCard: {
    width: '48%',
    backgroundColor: E.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: E.border,
    padding: SP.md,
    alignItems: 'center',
    gap: SP.xs,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  memberCardParent: { borderColor: E.accent, backgroundColor: '#FAF7F2' },
  memberCardPressed: { opacity: 0.65 },
  avatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: E.border },
  avatarFallback: { width: 72, height: 72, borderRadius: 36, backgroundColor: E.bgDeep, borderWidth: 2, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  avatarFallbackParent: { backgroundColor: '#F0EAE0' },
  avatarLetter: { fontFamily: 'serif', fontSize: 26, fontWeight: '700', color: E.ink },
  memberName: { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink, textAlign: 'center' },
  memberSub: { fontSize: 11, color: E.inkMuted, textAlign: 'center', letterSpacing: 0.3 },

  retryBtn: { marginTop: SP.sm, paddingHorizontal: SP.md, paddingVertical: SP.xs, borderRadius: R.pill, borderWidth: 1, borderColor: E.border },
  retryText: { fontSize: 13, color: E.inkSub, fontWeight: '500' },

  // Detail / PIN view
  detailContent: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.xxl },
  backLink: { alignSelf: 'flex-start', paddingVertical: SP.xs, marginBottom: SP.md },
  backLinkText: { fontSize: 14, color: E.inkSub, fontWeight: '400' },
  memberHeader: { alignItems: 'center', gap: SP.sm, marginBottom: SP.lg },
  detailAvatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: E.border },
  detailAvatarFallback: { width: 88, height: 88, borderRadius: 44, backgroundColor: E.bgDeep, borderWidth: 2, borderColor: E.border, alignItems: 'center', justifyContent: 'center' },
  detailAvatarLetter: { fontFamily: 'serif', fontSize: 32, fontWeight: '700', color: E.ink },
  detailName: { fontFamily: 'serif', fontSize: 26, fontWeight: '700', color: E.ink },
  detailRole: { fontSize: 12, color: E.inkMuted, letterSpacing: 1, textTransform: 'uppercase' },

  sharedCard: { backgroundColor: E.surface, borderRadius: R.md, borderWidth: 1, borderColor: E.border, padding: SP.sm, gap: SP.xs, marginBottom: SP.md },
  sharedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sharedTitle: { fontSize: 13, fontWeight: '600', color: E.inkSub, flex: 1 },
  sharedBody: { fontSize: 12, color: E.inkMuted, lineHeight: 17, fontWeight: '300' },

  pinBlock: { marginBottom: SP.md, alignItems: 'center', gap: SP.sm },
  pinLabel: { textTransform: 'uppercase', textAlign: 'center' },
  pinDotsRow: { flexDirection: 'row', gap: SP.sm, justifyContent: 'center', paddingVertical: SP.sm },
  pinDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface },
  pinDotFilled: { backgroundColor: E.ink, borderColor: E.ink },
  pinHint: { textAlign: 'center' },

  pinPad: { gap: SP.xs, marginBottom: SP.md },
  pinRow: { flexDirection: 'row', gap: SP.xs },
  pinKey: {
    flex: 1, height: 62, borderRadius: R.md, borderWidth: 1, borderColor: E.border,
    backgroundColor: E.surface, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  pinKeyUtil: { backgroundColor: E.bgDeep },
  pinKeyPressed: { opacity: 0.55 },
  pinKeyText: { fontFamily: 'serif', fontSize: 24, fontWeight: '600', color: E.ink },
  pinKeyUtilText: { fontFamily: undefined, fontSize: 15, fontWeight: '500', color: E.inkSub },

  warnText: { fontSize: 13, color: E.warn, textAlign: 'center', marginBottom: SP.sm },
  errorText: { fontSize: 13, color: E.danger, textAlign: 'center', marginBottom: SP.sm },
  actionBtn: { marginTop: SP.sm },
});
