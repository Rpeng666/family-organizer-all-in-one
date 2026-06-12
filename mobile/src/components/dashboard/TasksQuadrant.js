import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { E, SP, R } from '../../theme/E';
import { formatTaskStateLabel, firstRef } from '../../lib/dashboard-utils';
import { getLatestTaskUpdate, getTaskWorkflowState } from '../../../../lib/task-progress';

const STATE_COLOR = {
  done:         E.ok,
  needs_review: '#5A7AAA',
  blocked:      E.warn,
  skipped:      E.inkMuted,
};

export function TasksQuadrant({ taskSeriesCards, taskSeriesLoading, activeTaskCount, viewedMember, style }) {
  return (
    <View style={[s.card, style]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { memberId: viewedMember?.id || '' } })}
        style={s.header}
      >
        <Text style={s.title}>Tasks</Text>
        {activeTaskCount > 0 ? <Text style={s.meta}>{activeTaskCount} left</Text> : null}
        <Text style={s.arrow}>›</Text>
      </Pressable>

      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {taskSeriesLoading ? (
          <Text style={s.empty}>Loading…</Text>
        ) : taskSeriesCards.length === 0 ? (
          <Text style={s.empty}>No tasks today</Text>
        ) : (
          taskSeriesCards.map((card, ci) => {
            const rows = [];
            const seen = new Set();
            for (const task of card.scheduledTasks) {
              const parent = firstRef(task.parentTask);
              if (parent && !seen.has(parent.id)) { seen.add(parent.id); rows.push({ type: 'parent', task: parent }); }
              rows.push({ type: 'task', task, isSubtask: !!parent });
            }
            return (
              <View key={`qs-${card.id}`}>
                <View style={[s.seriesRow, ci > 0 && s.rowTop]}>
                  <Text style={s.seriesName} numberOfLines={1}>{card.series.name || 'Untitled'}</Text>
                  {card.incompleteCount > 0 ? <Text style={s.seriesCount}>{card.incompleteCount}</Text> : null}
                </View>
                {rows.length === 0 ? (
                  <Text style={s.emptyInline}>No scheduled tasks</Text>
                ) : (
                  rows.map((row, ri) => {
                    if (row.type === 'parent') {
                      return (
                        <View key={`p-${row.task.id}`} style={[s.row, s.rowTop]}>
                          <Text style={s.parentTitle} numberOfLines={1}>{row.task.text || 'Group'}</Text>
                        </View>
                      );
                    }
                    const state = getTaskWorkflowState(row.task);
                    const note = String(getLatestTaskUpdate(row.task)?.note || '').trim();
                    const stateColor = STATE_COLOR[state] || E.accentDeep;
                    return (
                      <Pressable
                        key={row.task.id || `t-${ci}-${ri}`}
                        accessibilityRole="button"
                        onPress={() => router.push({ pathname: '/(tabs)/tasks', params: { scrollToSeriesId: card.series.id, scrollToTaskId: row.task.id || '', memberId: viewedMember?.id || '' } })}
                        style={[s.row, s.rowTop, row.isSubtask && s.subtask]}
                      >
                        <View style={s.rowCopy}>
                          <View style={s.taskLine}>
                            <Text style={s.rowTitle} numberOfLines={1}>{row.task.text || 'Untitled'}</Text>
                            <Text style={[s.stateTag, { color: stateColor }]}>{formatTaskStateLabel(state)}</Text>
                          </View>
                          {note ? <Text style={s.rowSub} numberOfLines={1}>{note}</Text> : null}
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            );
          })
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
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8 },
  rowTop: { borderTopWidth: 1, borderTopColor: E.borderLight },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 12, fontWeight: '500', color: E.ink, flex: 1 },
  rowSub: { fontSize: 11, color: E.inkMuted, fontWeight: '300' },
  seriesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 7 },
  seriesName: { fontSize: 11, letterSpacing: 0.8, fontWeight: '600', color: E.inkSub, flex: 1 },
  seriesCount: { fontSize: 10, color: E.inkMuted, fontWeight: '500', marginLeft: 4, backgroundColor: E.bgDeep, paddingHorizontal: 6, paddingVertical: 2, borderRadius: R.pill, overflow: 'hidden' },
  parentTitle: { fontSize: 12, color: E.inkMuted, fontStyle: 'italic', flex: 1 },
  subtask: { paddingLeft: 14 },
  taskLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateTag: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: '600', flexShrink: 0 },
  empty: { fontSize: 12, color: E.inkMuted, paddingVertical: SP.md, textAlign: 'center', fontWeight: '300' },
  emptyInline: { fontSize: 11, color: E.inkMuted, paddingVertical: 6, fontWeight: '300' },
});
