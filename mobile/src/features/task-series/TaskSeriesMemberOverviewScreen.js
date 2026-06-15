import React, { useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { tx } from '@instantdb/react-native';
import { useLocalSearchParams } from 'expo-router';
import { E, SP, R } from '../../theme/E';
import { useAppSession } from '../../providers/AppProviders';
import { getTaskStatusLabel, getTaskWorkflowState } from '../../../../lib/task-progress';
import { buildPullForwardTransactions, buildUndoPullForwardTransactions } from '../../../../lib/task-series-schedule';
import { StatusPill } from './screen-components';
import {
  firstParam,
  firstRef,
  formatTaskDateLabel,
  toDateKey,
  buildMemberOverviewItems,
} from './screen-utils';
import { openTaskHistory, openTaskSeriesChecklist, openTaskSeriesDiscussion } from './navigation';

export function TaskSeriesMemberOverviewScreen() {
  const params = useLocalSearchParams();
  const memberId = firstParam(params.memberId);
  const { db, currentUser, familyMembers, isAuthenticated, instantReady } = useAppSession();
  const [filter, setFilter] = useState('active_now');
  const [undoState, setUndoState] = useState(null);

  const query = db.useQuery(
    isAuthenticated && instantReady
      ? {
          taskSeries: {
            tasks: {
              parentTask: {},
              attachments: {},
              responseFields: {},
              updates: {
                actor: {},
                affectedPerson: {},
                attachments: {},
                responseFieldValues: { field: {} },
                gradeType: {},
                replyTo: {},
                replies: { actor: {}, affectedPerson: {}, attachments: {}, gradeType: {} },
              },
            },
            familyMember: {},
            scheduledActivity: {},
          },
          familyMembers: {},
        }
      : null
  );

  const selectedMemberId = memberId || currentUser?.id || familyMembers?.[0]?.id || '';
  const todayKey = toDateKey(new Date());
  const memberName =
    (query.data?.familyMembers || familyMembers || []).find((m) => m.id === selectedMemberId)?.name ||
    currentUser?.name ||
    'Member';
  const overviewItems = buildMemberOverviewItems(query.data?.taskSeries || [], selectedMemberId);
  const filteredItems = filter === 'all' ? overviewItems : overviewItems.filter((item) => item.status === filter);

  async function handlePullForward(item) {
    if (!item.nextPullDate) return;
    const result = buildPullForwardTransactions({
      tx,
      seriesId: item.series.id,
      currentPullForwardCount: item.pullForwardCount,
      actorFamilyMemberId: currentUser?.id || null,
      choreId: firstRef(item.series.scheduledActivity)?.id || null,
      originalScheduledDate: item.nextPullDate,
    });
    await db.transact(result.transactions);
    setUndoState({ seriesId: item.series.id, historyEventId: result.historyEventId, pullForwardCount: item.pullForwardCount + 1 });
  }

  async function handleUndo() {
    if (!undoState) return;
    const txs = buildUndoPullForwardTransactions({
      tx,
      seriesId: undoState.seriesId,
      currentPullForwardCount: undoState.pullForwardCount,
      historyEventId: undoState.historyEventId,
    });
    await db.transact(txs);
    setUndoState(null);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <View style={s.chevronLeft} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{memberName}'s Task Series</Text>
          <Text style={s.headerSub}>Active, future, and finished task-series progress.</Text>
        </View>
      </View>
      <View style={s.chipBar}>
        <StatusPill label={memberName} tone="accent" />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        {undoState ? (
          <View style={s.card}>
            <Text style={s.body}>Tasks pulled forward.</Text>
            <Pressable testID="task-series-member-undo-pull" onPress={() => void handleUndo()} style={[s.btn, s.btnPrimary]}>
              <Text style={[s.btnText, s.btnTextPrimary]}>Undo</Text>
            </Pressable>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
          {[['active_now', 'Active'], ['future', 'Future'], ['finished', 'Finished'], ['all', 'All']].map(([key, label]) => {
            const active = filter === key;
            return (
              <Pressable key={key} onPress={() => setFilter(key)} style={[s.chip, active && s.chipActive]}>
                <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {filteredItems.length === 0 ? (
          <View style={s.card}>
            <Text style={s.body}>No task series match this filter.</Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <View key={item.series.id} style={s.card}>
              <View style={s.between}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionTitle}>{item.series.name || 'Untitled series'}</Text>
                  <Text style={s.body}>
                    {firstRef(item.series.scheduledActivity)?.title || 'Task series'}
                    {item.nextPullDate ? ` · Next ${formatTaskDateLabel(item.nextPullDate)}` : ''}
                  </Text>
                </View>
                <StatusPill
                  label={item.drift.label}
                  tone={item.drift.status === 'behind' ? 'warning' : item.drift.status === 'ahead' ? 'accent' : 'success'}
                />
              </View>

              <View style={s.between}>
                <Text style={s.tinyLabel}>Tasks {item.completedTasks}/{item.totalTasks}</Text>
                <Text style={s.tinyLabel}>Days {item.completedBlocks}/{item.totalBlocks}</Text>
              </View>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${Math.max(8, item.totalTasks ? (item.completedTasks / item.totalTasks) * 100 : 8)}%` }]} />
              </View>

              {item.todayTasks.length ? (
                <View style={{ gap: SP.sm }}>
                  <Text style={s.eyebrow}>Current Tasks</Text>
                  {item.todayTasks.map((task) => (
                    <Pressable
                      key={task.id}
                      onPress={() => router.push({
                        pathname: '/task-series/task',
                        params: { taskId: task.id, seriesId: item.series.id, choreId: firstRef(item.series.scheduledActivity)?.id || '', date: toDateKey(new Date()) },
                      })}
                      style={s.taskRow}
                    >
                      <View style={s.between}>
                        <Text style={s.taskTitle}>{task.text}</Text>
                        <Text style={s.taskMeta}>{getTaskStatusLabel(getTaskWorkflowState(task))}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={s.actionRow}>
                <Pressable
                  testID={`task-series-member-open-checklist-${item.series.id}`}
                  onPress={() => openTaskSeriesChecklist({ seriesId: item.series.id, choreId: firstRef(item.series.scheduledActivity)?.id || '', date: todayKey, memberId: selectedMemberId })}
                  style={s.btn}
                >
                  <Text style={s.btnText}>Open Checklist</Text>
                </Pressable>
                <Pressable
                  testID={`task-series-member-open-history-${item.series.id}`}
                  onPress={() => openTaskHistory({ seriesId: item.series.id, title: item.series.name || 'Task Series History' })}
                  style={s.btn}
                >
                  <Text style={s.btnText}>History</Text>
                </Pressable>
                <Pressable
                  testID={`task-series-member-open-discussion-${item.series.id}`}
                  onPress={() => void openTaskSeriesDiscussion({ seriesId: item.series.id, seriesName: item.series.name })}
                  style={s.btn}
                >
                  <Text style={s.btnText}>Discussion</Text>
                </Pressable>
                {item.todayTasksFinished && item.canPull && item.nextPullDate ? (
                  <Pressable onPress={() => void handlePullForward(item)} style={[s.btn, s.btnPrimary]}>
                    <Text style={[s.btnText, s.btnTextPrimary]}>Pull Forward</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:        { flex: 1, backgroundColor: E.bg },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP.md, paddingTop: SP.sm, paddingBottom: SP.sm, gap: SP.sm, backgroundColor: E.bg, borderBottomWidth: 1, borderBottomColor: E.borderLight },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  chevronLeft: { width: 9, height: 9, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: E.inkSub, transform: [{ rotate: '45deg' }] },
  headerTitle: { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 17, lineHeight: 22 },
  headerSub:   { color: E.inkMuted, fontSize: 12, fontWeight: '300' },
  chipBar:     { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, paddingHorizontal: SP.md, paddingVertical: SP.xs, backgroundColor: E.bg },

  content:  { gap: SP.md, padding: SP.md, paddingBottom: SP.xxl },
  card:     { borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.sm },
  between:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  actionRow:{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },

  eyebrow:      { color: E.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionTitle: { color: E.ink, fontWeight: '800', fontSize: 16 },
  body:         { color: E.inkMuted, fontSize: 13, lineHeight: 18 },
  tinyLabel:    { color: E.inkMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  chipRow:       { gap: SP.sm },
  chip:          { minHeight: 36, paddingHorizontal: SP.md, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, alignItems: 'center', justifyContent: 'center' },
  chipActive:    { borderColor: E.accent, backgroundColor: E.bgDeep },
  chipText:      { color: E.inkMuted, fontWeight: '800', fontSize: 12 },
  chipTextActive:{ color: E.ink },

  progressTrack: { height: 8, borderRadius: R.pill, backgroundColor: E.bgDeep, overflow: 'hidden' },
  progressFill:  { height: '100%', borderRadius: R.pill, backgroundColor: E.accent },

  taskRow:   { borderRadius: R.sm, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, padding: SP.sm, gap: SP.xs },
  taskTitle: { color: E.ink, fontSize: 15, fontWeight: '800', flex: 1 },
  taskMeta:  { color: E.inkMuted, fontSize: 12 },

  btn:            { minHeight: 40, paddingHorizontal: SP.md, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: E.border, backgroundColor: E.surface },
  btnPrimary:     { backgroundColor: E.ink, borderColor: E.ink },
  btnText:        { color: E.ink, fontWeight: '800', fontSize: 13 },
  btnTextPrimary: { color: E.white },
});
