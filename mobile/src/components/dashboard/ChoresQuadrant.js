import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { E, SP, R } from '../../theme/E';
import { completionKey } from '../../lib/dashboard-utils';

export function ChoresQuadrant({ incompleteChores, completedChores, choresLoading, viewedMember, selectedDateKey, pendingCompletionKeys, onToggleCompletion, style }) {
  return (
    <View style={[s.card, style]}>
      <Pressable accessibilityRole="button" onPress={() => router.push('/chores')} style={s.header}>
        <Text style={s.title}>Chores</Text>
        <Text style={s.meta}>
          {incompleteChores.length > 0 ? `${incompleteChores.length} left` : completedChores.length > 0 ? 'All done' : ''}
        </Text>
        <Text style={s.arrow}>›</Text>
      </Pressable>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {choresLoading ? (
          <Text style={s.empty}>Loading…</Text>
        ) : incompleteChores.length === 0 && completedChores.length === 0 ? (
          <Text style={s.empty}>No chores today</Text>
        ) : (
          <>
            {incompleteChores.map((row, i) => {
              const pKey = completionKey(row.chore.id, viewedMember.id, selectedDateKey);
              const isBusy = pendingCompletionKeys.has(pKey);
              const blocked = !!row.chore.isUpForGrabs && !!row.upForGrabsCompletedById && row.upForGrabsCompletedById !== viewedMember.id && !row.isDone;
              return (
                <View key={`c-${row.chore.id}`} style={[s.row, i > 0 && s.rowTop]}>
                  <Pressable
                    testID={`q-chore-toggle-${row.chore.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Complete ${row.chore.title}`}
                    disabled={isBusy || blocked}
                    onPress={() => { void onToggleCompletion(row.chore, viewedMember.id); }}
                    style={[s.checkBtn, (isBusy || blocked) && s.checkBtnDim]}
                  >
                    <View style={s.checkEmpty} />
                  </Pressable>
                  <View style={s.rowCopy}>
                    <Text style={s.rowTitle} numberOfLines={1}>{row.chore.title || 'Untitled'}</Text>
                    {row.chore.isUpForGrabs ? <Text style={s.rowSub}>Up for grabs</Text> : null}
                  </View>
                </View>
              );
            })}

            {completedChores.length > 0 ? (
              <>
                <Text style={s.sectionLabel}>Finished</Text>
                {completedChores.map((row, i) => {
                  const pKey = completionKey(row.chore.id, viewedMember.id, selectedDateKey);
                  const isBusy = pendingCompletionKeys.has(pKey);
                  return (
                    <View key={`cd-${row.chore.id}`} style={[s.row, i > 0 && s.rowTop]}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Undo ${row.chore.title}`}
                        disabled={isBusy}
                        onPress={() => { void onToggleCompletion(row.chore, viewedMember.id); }}
                        style={s.checkBtn}
                      >
                        <View style={s.checkFilled} />
                      </Pressable>
                      <Text style={[s.rowTitle, s.rowTitleDone]} numberOfLines={1}>{row.chore.title || 'Untitled'}</Text>
                    </View>
                  );
                })}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: E.surface, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP.sm, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: E.borderLight, gap: 6 },
  title: { fontFamily: 'serif', fontSize: 14, fontWeight: '700', color: E.ink, flex: 1 },
  meta: { fontSize: 11, color: E.inkMuted, fontWeight: '400' },
  arrow: { fontSize: 18, color: E.border, lineHeight: 20 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SP.sm, paddingBottom: SP.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  rowTop: { borderTopWidth: 1, borderTopColor: E.borderLight },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 13, fontWeight: '500', color: E.ink },
  rowTitleDone: { color: E.inkMuted, textDecorationLine: 'line-through' },
  rowSub: { fontSize: 10, color: E.inkMuted, marginTop: 2 },
  checkBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  checkBtnDim: { opacity: 0.4 },
  checkEmpty: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: E.accent },
  checkFilled: { width: 16, height: 16, borderRadius: 8, backgroundColor: E.accentDeep, borderWidth: 1, borderColor: E.accentDeep },
  sectionLabel: { fontSize: 9, letterSpacing: 1.4, color: E.inkMuted, textTransform: 'uppercase', marginTop: SP.sm, marginBottom: 2 },
  empty: { fontSize: 12, color: E.inkMuted, paddingVertical: SP.md, textAlign: 'center', fontWeight: '300' },
});
