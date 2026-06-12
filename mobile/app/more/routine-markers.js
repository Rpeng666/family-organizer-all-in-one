import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { id, tx } from '@instantdb/react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
  SHARED_ROUTINE_MARKER_PRESETS,
  formatDateKeyUTC,
  getFamilyDayDateUTC,
  parseSharedScheduleSettings,
} from '@family-organizer/shared-core';
import { useAppSession } from '../../src/providers/AppProviders';
import { useParentActionGate } from '../../src/hooks/useParentActionGate';
import { clearPendingParentAction } from '../../src/lib/session-prefs';
import { E, SP, R } from '../../src/theme/E';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function formatMonthDay(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatLongDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

export default function RoutineMarkersScreen() {
  const searchParams = useLocalSearchParams();
  const { requireParentAction } = useParentActionGate();
  const {
    db,
    currentUser,
    principalType,
    isAuthenticated,
    instantReady,
    isOnline,
    connectionStatus,
  } = useAppSession();
  const [selectedDate, setSelectedDate] = useState(() => getFamilyDayDateUTC(new Date()));

  useEffect(() => {
    if (firstParam(searchParams.resumeParentAction) !== '1') return;
    if (principalType !== 'parent') return;
    void clearPendingParentAction();
  }, [principalType, searchParams.resumeParentAction]);

  async function handoffToParent() {
    await requireParentAction({
      actionId: 'more:open:routineMarkers',
      actionLabel: 'Routine Markers',
      payload: { href: '/more/routine-markers' },
      returnPath: '/more/routine-markers',
    });
  }

  const selectedDateKey = useMemo(() => formatDateKeyUTC(selectedDate), [selectedDate]);
  const dateStrip = useMemo(() => {
    return Array.from({ length: 7 }).map((_, index) => {
      const offset = index - 3;
      return new Date(selectedDate.getTime() + offset * 86400000);
    });
  }, [selectedDate]);

  const routineQuery = db.useQuery(
    isAuthenticated && instantReady
      ? {
          routineMarkerStatuses: {},
          settings: { $: { where: { name: HOUSEHOLD_SCHEDULE_SETTINGS_NAME } } },
        }
      : null
  );

  const routineMarkerStatuses = useMemo(
    () => routineQuery.data?.routineMarkerStatuses || [],
    [routineQuery.data?.routineMarkerStatuses]
  );
  const scheduleSettings = useMemo(
    () => parseSharedScheduleSettings(routineQuery.data?.settings?.[0]?.value || null),
    [routineQuery.data?.settings]
  );
  const routineMarkers = scheduleSettings?.routineMarkers || SHARED_ROUTINE_MARKER_PRESETS;
  const todayDateKey = formatDateKeyUTC(getFamilyDayDateUTC(new Date(), scheduleSettings));
  const canEditRoutineMarkers = selectedDateKey === todayDateKey;

  const routineMarkerStatusByKey = useMemo(() => {
    const next = new Map();
    for (const status of routineMarkerStatuses) {
      if (String(status?.date || '') !== selectedDateKey) continue;
      if (status?.markerKey) next.set(status.markerKey, status);
    }
    return next;
  }, [routineMarkerStatuses, selectedDateKey]);

  async function markRoutineMarkerHappened(markerKey) {
    if (!canEditRoutineMarkers) return;
    const recordKey = `${selectedDateKey}:${markerKey}`;
    const existing = routineMarkerStatuses.find((s) => String(s?.key || '') === recordKey);
    const timestamp = new Date().toISOString();
    try {
      if (existing?.id) {
        await db.transact([tx.routineMarkerStatuses[existing.id].update({
          startedAt: timestamp, completedAt: timestamp,
          startedById: currentUser?.id || null, completedById: currentUser?.id || null,
        })]);
      } else {
        await db.transact([tx.routineMarkerStatuses[id()].update({
          key: recordKey, markerKey, date: selectedDateKey,
          startedAt: timestamp, completedAt: timestamp,
          startedById: currentUser?.id || null, completedById: currentUser?.id || null,
        })]);
      }
    } catch (error) {
      Alert.alert('Unable to update marker', error?.message || 'Please try again.');
    }
  }

  async function clearRoutineMarkerStatus(markerKey) {
    if (!canEditRoutineMarkers) return;
    const recordKey = `${selectedDateKey}:${markerKey}`;
    const existing = routineMarkerStatuses.find((s) => String(s?.key || '') === recordKey);
    if (!existing?.id) return;
    try {
      await db.transact([tx.routineMarkerStatuses[existing.id].update({
        startedAt: null, completedAt: null, startedById: null, completedById: null,
      })]);
    } catch (error) {
      Alert.alert('Unable to reset marker', error?.message || 'Please try again.');
    }
  }

  if (principalType !== 'parent') {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.header}>
          <Text style={s.title}>Routine Markers</Text>
        </View>
        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>Parent access required</Text>
          <Text style={s.noticeBody}>Log in as a parent to review or update household routine markers.</Text>
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
        <View style={s.headerRow}>
          <Text style={s.title}>Routine Markers</Text>
          <View style={s.datePill}>
            <Text style={s.datePillText}>{formatMonthDay(selectedDate)}</Text>
          </View>
        </View>
        <View style={s.statusRow}>
          <View style={[s.statusPill, isOnline ? s.pillOk : s.pillWarn]}>
            <Text style={[s.statusPillText, isOnline ? s.pillOkText : s.pillWarnText]}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={[s.statusPill, canEditRoutineMarkers ? s.pillOk : s.statusPill]}>
            <Text style={[s.statusPillText, canEditRoutineMarkers ? s.pillOkText : {}]}>
              {canEditRoutineMarkers ? 'Today' : 'History view'}
            </Text>
          </View>
          {connectionStatus === 'authenticated' ? (
            <View style={[s.statusPill, s.pillOk]}>
              <Text style={[s.statusPillText, s.pillOkText]}>Connected</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {/* Date strip */}
        <View style={s.dateCard}>
          <Text style={s.sectionLabel}>Choose a date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.dateStrip}>
            {dateStrip.map((date) => {
              const dateKey = formatDateKeyUTC(date);
              const isSelected = dateKey === selectedDateKey;
              const isToday = dateKey === todayDateKey;
              return (
                <Pressable
                  key={date.toISOString()}
                  testID={`routine-markers-date-chip-${dateKey}`}
                  accessibilityRole="button"
                  accessibilityLabel={`View routine markers for ${formatLongDate(date)}`}
                  style={[s.dateChip, isSelected && s.dateChipActive]}
                  onPress={() => setSelectedDate(date)}
                >
                  <Text style={[s.dateChipDay, isSelected && s.dateChipTextActive]}>{formatDayLabel(date)}</Text>
                  <Text style={[s.dateChipNum, isSelected && s.dateChipTextActive]}>{formatMonthDay(date)}</Text>
                  {!isSelected && isToday ? <View style={s.todayDot} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Error / empty / marker cards */}
        {routineQuery.error ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>Couldn't load routine markers</Text>
            <Text style={s.emptyBody}>{routineQuery.error.message || 'Please try again.'}</Text>
          </View>
        ) : routineMarkers.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>No routine markers configured</Text>
            <Text style={s.emptyBody}>Add routine markers in the shared household schedule settings to manage them here.</Text>
          </View>
        ) : (
          routineMarkers.map((marker) => {
            const status = routineMarkerStatusByKey.get(marker.key);
            const isDone = Boolean(status?.completedAt);
            const completedLabel = status?.completedAt
              ? new Date(status.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              : status?.startedAt
              ? new Date(status.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
              : 'Not marked';

            return (
              <View key={marker.key} style={s.markerCard}>
                <View style={s.markerHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.markerTitle}>{marker.label}</Text>
                    <Text style={s.markerTime}>{marker.defaultTime || '--:--'}</Text>
                  </View>
                  <View style={[s.statePill, isDone ? s.readyPill : s.pendingPill]}>
                    <Text style={[s.statePillText, isDone ? s.readyText : s.pendingText]}>{isDone ? 'Done' : 'Open'}</Text>
                  </View>
                </View>

                <Text style={s.markerDetail}>Happened: {completedLabel}</Text>
                {!canEditRoutineMarkers ? (
                  <Text style={s.readOnlyHint}>Only today's markers can be edited from mobile.</Text>
                ) : null}

                <View style={s.markerActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark ${marker.label} happened`}
                    onPress={() => { void markRoutineMarkerHappened(marker.key); }}
                    disabled={!canEditRoutineMarkers}
                    style={[s.actionBtn, !canEditRoutineMarkers && s.btnDisabled]}
                  >
                    <Text style={s.actionBtnText}>Mark happened</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Reset ${marker.label}`}
                    onPress={() => { void clearRoutineMarkerStatus(marker.key); }}
                    disabled={!canEditRoutineMarkers}
                    style={[s.ghostBtn, !canEditRoutineMarkers && s.btnDisabled]}
                  >
                    <Text style={s.ghostBtnText}>Reset</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: E.bg },
  header: { paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.sm, gap: SP.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  title:  { fontFamily: 'serif', fontSize: 28, fontWeight: '700', color: E.ink },

  datePill:     { borderWidth: 1, borderColor: E.border, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 5, backgroundColor: E.bgDeep },
  datePillText: { fontSize: 13, fontWeight: '500', color: E.inkSub },

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

  // Date strip
  dateCard:    { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.sm },
  sectionLabel:{ fontSize: 10, color: E.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  dateStrip:   { gap: SP.xs, paddingVertical: 2 },
  dateChip:    { minWidth: 72, paddingHorizontal: SP.sm, paddingVertical: SP.xs, borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', position: 'relative' },
  dateChipActive:    { borderColor: E.ink, backgroundColor: E.ink },
  dateChipDay:       { fontSize: 10, color: E.inkMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateChipNum:       { fontSize: 13, color: E.ink, fontWeight: '600', marginTop: 2 },
  dateChipTextActive:{ color: E.white },
  todayDot:    { position: 'absolute', bottom: 5, width: 5, height: 5, borderRadius: R.pill, backgroundColor: E.accent },

  // Marker cards
  markerCard:    { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.sm },
  markerHead:    { flexDirection: 'row', alignItems: 'flex-start', gap: SP.sm },
  markerTitle:   { fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink },
  markerTime:    { fontSize: 11, color: E.inkMuted, fontWeight: '400', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  markerDetail:  { fontSize: 13, color: E.inkMuted, fontWeight: '300' },
  readOnlyHint:  { fontSize: 11, color: E.inkMuted, fontStyle: 'italic', fontWeight: '300' },

  statePill:   { borderWidth: 1, borderRadius: R.pill, paddingHorizontal: SP.sm, paddingVertical: 4 },
  readyPill:   { borderColor: E.okBorder, backgroundColor: E.okBg },
  pendingPill: { borderColor: E.warnBorder, backgroundColor: E.warnBg },
  statePillText:{ fontSize: 11, fontWeight: '600' },
  readyText:   { color: E.ok },
  pendingText: { color: E.warn },

  markerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs },
  actionBtn:     { minHeight: 36, paddingHorizontal: SP.md, borderRadius: R.pill, backgroundColor: E.ink, borderWidth: 1, borderColor: E.ink, alignItems: 'center', justifyContent: 'center' },
  actionBtnText: { fontSize: 12, color: E.white, fontWeight: '600' },
  ghostBtn:      { minHeight: 36, paddingHorizontal: SP.md, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText:  { fontSize: 12, color: E.inkSub, fontWeight: '400' },
  btnDisabled:   { opacity: 0.4 },

  emptyCard:  { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.lg, gap: SP.xs },
  emptyTitle: { fontFamily: 'serif', fontSize: 18, fontWeight: '700', color: E.ink },
  emptyBody:  { fontSize: 13, color: E.inkMuted, lineHeight: 18, fontWeight: '300' },
});
