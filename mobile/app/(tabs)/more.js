import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { revokeMobileDeviceSession } from '../../src/lib/api-client';
import { useAppSession } from '../../src/providers/AppProviders';
import { clearPendingParentAction, getPendingParentAction } from '../../src/lib/session-prefs';
import { useParentActionGate } from '../../src/hooks/useParentActionGate';
import { E, SP, R, T } from '../../src/theme/E';

const MENU_ITEMS = [
  { key: 'taskSeries',           title: 'Task Series',           description: 'Manager, review queue, editor, and detail flow.',          status: 'Live',    href: '/more/task-series',           parentOnly: true },
  { key: 'familyMembers',        title: 'Family Members',        description: 'Roster, roles, PIN state, and profile snapshots.',          status: 'Live',    href: '/more/family-members',        parentOnly: true },
  { key: 'routineMarkers',       title: 'Routine Markers',       description: 'Household-wide milestone tracking.',                         status: 'Live',    href: '/more/routine-markers',       parentOnly: true },
  { key: 'allowanceDistribution',title: 'Allowance Distribution',description: 'Preview payout readiness before execution.',                status: 'Preview', href: '/more/allowance-distribution', parentOnly: true },
  { key: 'files',                title: 'Files',                 description: 'Browse and open uploaded files.',                            status: 'Live',    href: '/more/files',                 parentOnly: true },
  { key: 'devTools',             title: 'Dev Tools',             description: 'Session details and debug helpers.',                         status: 'Preview', href: '/more/dev-tools',             parentOnly: true },
];

const MENU_ITEM_BY_KEY = Object.fromEntries(MENU_ITEMS.map((item) => [item.key, item]));

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function MoreTab() {
  const searchParams = useLocalSearchParams();
  const { requireParentAction } = useParentActionGate();
  const {
    resetDeviceSession, lock, currentUser, principalType,
    canRenderCachedData, connectionStatus, networkValidated,
    isOnline, bootstrapStatus, deviceSessionToken, isAuthenticated,
    recordParentActivity,
  } = useAppSession();
  const [resumePendingAction, setResumePendingAction] = useState(null);
  const [handledResumeNonce, setHandledResumeNonce] = useState('');

  async function handleResetDevice() {
    try { await revokeMobileDeviceSession(); } catch {}
    await resetDeviceSession();
    router.replace('/activate');
  }

  async function handleLockApp() {
    await lock();
    router.replace('/lock?intent=switch-user');
  }

  useEffect(() => {
    const shouldResume = firstParam(searchParams.resumeParentAction) === '1';
    const resumeNonce = String(firstParam(searchParams.resumeNonce) || '');
    if (!shouldResume || !resumeNonce || resumeNonce === handledResumeNonce) return;
    let cancelled = false;
    async function load() {
      const pending = await getPendingParentAction();
      if (cancelled) return;
      setHandledResumeNonce(resumeNonce);
      if (pending?.actionId?.startsWith('more:open:')) setResumePendingAction(pending);
    }
    void load();
    return () => { cancelled = true; };
  }, [handledResumeNonce, searchParams.resumeNonce, searchParams.resumeParentAction]);

  useEffect(() => {
    if (!resumePendingAction || !isAuthenticated || principalType !== 'parent') return;
    const key = resumePendingAction.actionId.replace('more:open:', '');
    const item = MENU_ITEM_BY_KEY[key];
    void (async () => {
      await clearPendingParentAction();
      setResumePendingAction(null);
      if (item?.href) router.push(item.href);
    })();
  }, [isAuthenticated, principalType, resumePendingAction]);

  async function handleMenuPress(item) {
    recordParentActivity();
    if (item.parentOnly && (!isAuthenticated || principalType !== 'parent')) {
      await requireParentAction({ actionId: `more:open:${item.key}`, actionLabel: item.title, payload: { href: item.href }, returnPath: '/more' });
      return;
    }
    if (item.href) router.push(item.href);
  }

  const isParent = principalType === 'parent';

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Page heading */}
        <View style={s.heading}>
          <Text style={s.headTitle}>More</Text>
          <View style={s.headMeta}>
            <View style={[s.modeDot, isParent ? s.modeDotParent : s.modeDotKid]} />
            <Text style={s.headMetaText}>{isParent ? 'Parent mode' : principalType === 'kid' ? 'Kid mode' : 'No principal'}</Text>
            <Text style={s.headMetaSep}>·</Text>
            <View style={[s.modeDot, isOnline ? s.modeDotOnline : s.modeDotOffline]} />
            <Text style={s.headMetaText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
        </View>

        {/* Status panel — compact, low weight */}
        <View style={s.statusPanel}>
          {[
            ['Member', currentUser?.name || '—'],
            ['Connection', connectionStatus || 'unknown'],
            ['Bootstrap', bootstrapStatus],
            ['Cache', canRenderCachedData ? 'Ready' : 'Waiting'],
            ['Network', networkValidated ? 'Validated' : 'Pending'],
            ['Session', deviceSessionToken ? 'Active' : 'Missing'],
          ].map(([label, value]) => (
            <View key={label} style={s.statusRow}>
              <Text style={s.statusLabel}>{label}</Text>
              <Text style={s.statusValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Menu items */}
        <View style={s.menuCard}>
          {MENU_ITEMS.map((item, i) => (
            <Pressable
              key={item.key}
              testID={`more-menu-${item.key}`}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              onPress={() => { void handleMenuPress(item); }}
              style={({ pressed }) => [s.menuRow, i > 0 && s.menuRowBorder, pressed && s.menuRowPressed]}
            >
              <View style={s.menuCopy}>
                <Text style={s.menuTitle}>{item.title}</Text>
                <Text style={s.menuDesc} numberOfLines={1}>{item.description}</Text>
              </View>
              <View style={s.menuRight}>
                {item.status === 'Preview' ? <Text style={s.previewTag}>Preview</Text> : null}
                <Text style={s.menuArrow}>›</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Action buttons */}
        <Pressable
          testID="more-lock-app-button"
          accessibilityRole="button"
          accessibilityLabel="Lock app"
          onPress={() => { void handleLockApp(); }}
          style={({ pressed }) => [s.actionBtn, pressed && s.actionBtnPressed]}
        >
          <Text style={s.actionText}>Lock app</Text>
        </Pressable>

        <Pressable
          testID="more-reset-device-button"
          accessibilityRole="button"
          accessibilityLabel="Reset this device and reactivate"
          onPress={handleResetDevice}
          style={({ pressed }) => [s.actionBtn, s.actionBtnDanger, pressed && s.actionBtnPressed]}
        >
          <Text style={[s.actionText, s.actionTextDanger]}>Reset device</Text>
        </Pressable>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: E.bg },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: SP.md, paddingTop: SP.lg, paddingBottom: SP.xxl, gap: SP.md },

  // Heading
  heading:      { gap: 6 },
  headTitle:    { fontFamily: 'serif', fontSize: 32, fontWeight: '700', color: E.ink, lineHeight: 36 },
  headMeta:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headMetaText: { fontSize: 12, color: E.inkMuted, fontWeight: '300' },
  headMetaSep:  { fontSize: 12, color: E.border },
  modeDot:      { width: 6, height: 6, borderRadius: 3 },
  modeDotParent:  { backgroundColor: E.accentDeep },
  modeDotKid:     { backgroundColor: E.inkMuted },
  modeDotOnline:  { backgroundColor: E.ok },
  modeDotOffline: { backgroundColor: E.warn },

  // Status panel
  statusPanel: {
    backgroundColor: E.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: E.border,
    paddingHorizontal: SP.md,
    paddingVertical: SP.sm,
    gap: 8,
  },
  statusRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 11, color: E.inkMuted, fontWeight: '300', letterSpacing: 0.2 },
  statusValue: { fontSize: 11, color: E.inkSub, fontWeight: '500' },

  // Menu card
  menuCard: {
    backgroundColor: E.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: E.border,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SP.md,
    paddingVertical: 16,
    gap: SP.sm,
  },
  menuRowBorder:   { borderTopWidth: 1, borderTopColor: E.borderLight },
  menuRowPressed:  { backgroundColor: E.bgDeep },
  menuCopy:        { flex: 1, gap: 3 },
  menuTitle:       { fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink },
  menuDesc:        { fontSize: 12, color: E.inkMuted, fontWeight: '300', lineHeight: 17 },
  menuRight:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuArrow:       { fontSize: 20, color: E.border, lineHeight: 22 },
  previewTag:      { fontSize: 9, letterSpacing: 1.2, textTransform: 'uppercase', color: E.accent, fontWeight: '500', borderWidth: 1, borderColor: E.accent, borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 2 },

  // Action buttons
  actionBtn: {
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: E.border,
    backgroundColor: E.surface,
    paddingVertical: 15,
    alignItems: 'center',
  },
  actionBtnDanger:  { borderColor: E.dangerBorder, backgroundColor: E.dangerBg },
  actionBtnPressed: { opacity: 0.6 },
  actionText:       { fontSize: 14, fontWeight: '500', color: E.inkSub },
  actionTextDanger: { color: E.danger },
});
