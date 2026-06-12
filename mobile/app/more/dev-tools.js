import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, Share, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAppSession } from '../../src/providers/AppProviders';
import { clearDiagnosticsTimeline, formatDiagnosticDetails, getDiagnosticsTimeline, subscribeDiagnosticsTimeline } from '../../src/lib/diagnostics';
import { clearPendingParentAction } from '../../src/lib/session-prefs';
import { useParentActionGate } from '../../src/hooks/useParentActionGate';
import { E, SP, R } from '../../src/theme/E';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default function DevToolsScreen() {
  const searchParams = useLocalSearchParams();
  const { requireParentAction } = useParentActionGate();
  const [diagnostics, setDiagnostics] = useState(() => getDiagnosticsTimeline());
  const {
    currentUser,
    principalType,
    bootstrapStatus,
    canRenderCachedData,
    connectionStatus,
    networkValidated,
    deviceSessionToken,
    activationRequired,
    isOnline,
    isParentSessionSharedDevice,
    parentSharedDeviceIdleTimeoutMs,
  } = useAppSession();

  useEffect(() => {
    if (firstParam(searchParams.resumeParentAction) !== '1') return;
    if (principalType !== 'parent') return;
    void clearPendingParentAction();
  }, [principalType, searchParams.resumeParentAction]);

  useEffect(() => subscribeDiagnosticsTimeline(setDiagnostics), []);

  const recentDiagnostics = useMemo(
    () => diagnostics.slice().reverse().slice(0, 60),
    [diagnostics]
  );

  async function handoffToParent() {
    await requireParentAction({
      actionId: 'more:open:devTools',
      actionLabel: 'Dev Tools',
      payload: { href: '/more/dev-tools' },
      returnPath: '/more/dev-tools',
    });
  }

  if (principalType !== 'parent') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.header}>
          <Text style={s.title}>Dev Tools</Text>
        </View>
        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>Parent access required</Text>
          <Text style={s.noticeBody}>Log in as a parent to inspect current mobile session state and debug metadata.</Text>
          <Pressable style={s.primaryBtn} onPress={() => { void handoffToParent(); }}>
            <Text style={s.primaryBtnText}>Switch to parent</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />

      <View style={s.header}>
        <Text style={s.title}>Dev Tools</Text>
        <View style={s.statusRow}>
          <View style={[s.statusPill, isOnline ? s.pillOk : s.pillWarn]}>
            <Text style={[s.statusPillText, isOnline ? s.pillOkText : s.pillWarnText]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={[s.statusPill, principalType === 'parent' ? s.pillOk : s.statusPill]}>
            <Text style={[s.statusPillText, principalType === 'parent' ? s.pillOkText : {}]}>{principalType === 'parent' ? 'Parent mode' : 'Kid mode'}</Text>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {/* Session snapshot */}
        <View style={s.panel}>
          <Text style={s.panelTitle}>Session Snapshot</Text>
          {[
            ['Current member', currentUser?.name || 'None'],
            ['Activation required', activationRequired ? 'Yes' : 'No'],
            ['Device session', deviceSessionToken ? 'Present' : 'Missing'],
            ['Bootstrap', bootstrapStatus],
            ['Local cache', canRenderCachedData ? 'Renderable' : 'Waiting'],
            ['Network validation', networkValidated ? 'Validated' : 'Pending'],
            ['Connection', connectionStatus],
            ['Shared device mode', isParentSessionSharedDevice ? 'Enabled' : 'Disabled'],
            ['Idle timeout', `${Math.round(parentSharedDeviceIdleTimeoutMs / 60000)} min`],
          ].map(([label, value]) => (
            <View key={label} style={s.dataRow}>
              <Text style={s.dataLabel}>{label}</Text>
              <Text style={s.dataValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Diagnostics timeline */}
        <View style={s.panel}>
          <View style={s.panelHead}>
            <Text style={s.panelTitle}>Diagnostics Timeline</Text>
            <Text style={s.panelMeta}>{diagnostics.length} events</Text>
          </View>
          <View style={s.actionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share diagnostics timeline"
              style={s.actionBtn}
              onPress={() => Share.share({ message: JSON.stringify(diagnostics, null, 2), title: 'Family Organizer diagnostics' })}
            >
              <Text style={s.actionBtnText}>Share JSON</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear diagnostics timeline"
              style={s.actionBtn}
              onPress={() => { clearDiagnosticsTimeline(); setDiagnostics([]); }}
            >
              <Text style={s.actionBtnText}>Clear</Text>
            </Pressable>
          </View>

          {recentDiagnostics.length === 0 ? (
            <Text style={s.emptyText}>No diagnostics recorded yet.</Text>
          ) : (
            <ScrollView style={s.timeline} contentContainerStyle={s.timelineContent}>
              {recentDiagnostics.map((event, index) => (
                <View key={event.id || `${event.ts}-${index}`} style={s.eventRow}>
                  <View style={s.eventHead}>
                    <Text style={s.eventTitle}>{event.type} · {event.phase}</Text>
                    <Text style={s.eventTime}>
                      {new Date(event.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                    </Text>
                  </View>
                  {formatDiagnosticDetails(event.details) ? (
                    <Text style={s.eventDetails}>{formatDiagnosticDetails(event.details)}</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: E.bg },
  header: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.sm, gap: SP.xs },
  title:  { fontFamily: 'serif', fontSize: 28, fontWeight: '700', color: E.ink },

  statusRow:      { flexDirection: 'row', gap: SP.xs, flexWrap: 'wrap' },
  statusPill:     { borderWidth: 1, borderColor: E.border, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 4, backgroundColor: E.bgDeep },
  pillOk:         { borderColor: E.okBorder, backgroundColor: E.okBg },
  pillWarn:       { borderColor: E.warnBorder, backgroundColor: E.warnBg },
  statusPillText: { fontSize: 11, fontWeight: '500', color: E.inkSub },
  pillOkText:     { color: E.ok },
  pillWarnText:   { color: E.warn },

  content: { gap: SP.md, paddingHorizontal: SP.md, paddingBottom: SP.xl },

  noticeCard:     { margin: SP.md, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.lg, gap: SP.sm },
  noticeTitle:    { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: E.ink },
  noticeBody:     { fontSize: 14, color: E.inkSub, lineHeight: 20, fontWeight: '300' },
  primaryBtn:     { minHeight: 40, paddingHorizontal: SP.lg, borderRadius: R.pill, backgroundColor: E.ink, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' },
  primaryBtnText: { fontSize: 13, color: E.white, fontWeight: '600' },

  panel:    { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.sm },
  panelHead:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  panelTitle:{ fontFamily: 'serif', fontSize: 17, fontWeight: '700', color: E.ink },
  panelMeta: { fontSize: 11, color: E.inkMuted, fontWeight: '400' },

  dataRow:   { flexDirection: 'row', justifyContent: 'space-between', gap: SP.md, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: E.borderLight },
  dataLabel: { fontSize: 12, color: E.inkMuted, fontWeight: '400', flex: 1 },
  dataValue: { fontSize: 12, color: E.ink, fontWeight: '500', flexShrink: 1, textAlign: 'right' },

  actionRow: { flexDirection: 'row', gap: SP.xs },
  actionBtn:     { minHeight: 32, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: 12, fontWeight: '500', color: E.inkSub },

  emptyText: { fontSize: 12, color: E.inkMuted, fontWeight: '300' },

  timeline:        { maxHeight: 360 },
  timelineContent: { gap: SP.xs },

  eventRow:    { borderRadius: R.sm, borderWidth: 1, borderColor: E.borderLight, padding: SP.sm, gap: 3, backgroundColor: E.bgDeep },
  eventHead:   { flexDirection: 'row', justifyContent: 'space-between', gap: SP.sm },
  eventTitle:  { fontSize: 11, color: E.ink, fontWeight: '600', flex: 1 },
  eventTime:   { fontSize: 10, color: E.inkMuted, fontWeight: '300' },
  eventDetails:{ fontSize: 11, color: E.inkMuted, lineHeight: 16, fontWeight: '300' },
});
