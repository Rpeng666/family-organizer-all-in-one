import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { E, SP, R } from '../../theme/E';

export function CalendarQuadrant({ calendarEvents, style }) {
  return (
    <View style={[s.card, style]}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/calendar')} style={s.header}>
        <Text style={s.title}>Calendar</Text>
        {calendarEvents.length > 0 ? <Text style={s.meta}>{calendarEvents.length} upcoming</Text> : null}
        <Text style={s.arrow}>›</Text>
      </Pressable>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {calendarEvents.length === 0 ? (
          <Text style={s.empty}>Nothing coming up</Text>
        ) : (
          calendarEvents.map((event, i) => (
            <Pressable
              key={`qc-${event.id}`}
              accessibilityRole="button"
              onPress={() => router.push('/calendar')}
              style={[s.row, i > 0 && s.rowTop]}
            >
              <View style={s.tickMark} />
              <View style={s.rowCopy}>
                <Text style={s.rowTitle} numberOfLines={1}>{event.title}</Text>
                <Text style={s.rowSub}>{event.timeLabel}{event.isFamilyWide ? ' · Family' : ''}</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: E.surface, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: E.borderLight, gap: 6 },
  title: { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink, flex: 1 },
  meta: { fontSize: 11, color: E.inkMuted },
  arrow: { fontSize: 18, color: E.border, lineHeight: 20 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SP.sm, paddingBottom: SP.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 9 },
  rowTop: { borderTopWidth: 1, borderTopColor: E.borderLight },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: '500', color: E.ink },
  rowSub: { fontSize: 11, color: E.inkMuted, fontWeight: '300', marginTop: 1 },
  tickMark: { width: 2, height: 32, borderRadius: 1, backgroundColor: E.accent, marginTop: 2, flexShrink: 0 },
  empty: { fontSize: 12, color: E.inkMuted, paddingVertical: SP.md, textAlign: 'center', fontWeight: '300' },
});
