import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { E, SP, R } from '../../theme/E';
import { useAppSession } from '../../providers/AppProviders';
import { AttachmentPreviewModal } from '../../components/AttachmentPreviewModal';
import { getTaskStatusLabel, getTaskWorkflowState, sortTaskUpdates } from '../../../../lib/task-progress';
import { getTasksForDate } from '../../../../lib/task-scheduler';
import {
  AttachmentChips,
  StatusPill,
  TaskUpdateComposerCard,
  UpdateHistoryList,
} from './screen-components';
import {
  firstParam,
  firstRef,
  formatDateLabel,
  formatTaskDateLabel,
  parseDateKey,
  toDateKey,
} from './screen-utils';
import { openTaskHistory, openTaskSeriesChecklist, openTaskSeriesDiscussion } from './navigation';

export function TaskSeriesTaskScreen() {
  const params = useLocalSearchParams();
  const taskId = firstParam(params.taskId);
  const seriesId = firstParam(params.seriesId);
  const choreId = firstParam(params.choreId);
  const selectedDateKey = toDateKey(firstParam(params.date));
  const reviewMode = firstParam(params.review) === '1';
  const { width } = useWindowDimensions();
  const { db, currentUser, isAuthenticated, instantReady, principalType } = useAppSession();
  const [previewAttachment, setPreviewAttachment] = useState(null);

  const query = db.useQuery(
    isAuthenticated && instantReady
      ? {
          chores: {
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
                  replies: {
                    actor: {},
                    affectedPerson: {},
                    attachments: {},
                    gradeType: {},
                  },
                },
              },
              familyMember: {},
              scheduledActivity: {},
            },
          },
          gradeTypes: { $: { order: { createdAt: 'asc' } } },
        }
      : null
  );

  const context = useMemo(() => {
    const chores = query.data?.chores || [];
    for (const chore of chores) {
      if (choreId && chore.id !== choreId) continue;
      for (const series of chore.taskSeries || []) {
        if (seriesId && series.id !== seriesId) continue;
        const task = (series.tasks || []).find((t) => t.id === taskId);
        if (task) {
          return {
            chore,
            series,
            task,
            allTasks: (series.tasks || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)),
          };
        }
      }
    }
    return null;
  }, [choreId, query.data?.chores, seriesId, taskId]);

  const owner = firstRef(context?.series?.familyMember);
  const scheduledTasks = useMemo(() => {
    if (!context?.series || !context?.chore) return [];
    return getTasksForDate(
      context.allTasks,
      context.chore.rrule || null,
      context.chore.startDate,
      parseDateKey(selectedDateKey),
      context.series.startDate || null,
      context.chore.exdates || null,
      context.series.pullForwardCount || 0
    );
  }, [context, selectedDateKey]);

  if (!context?.task) {
    return (
      <SafeAreaView style={s.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
            <View style={s.chevronLeft} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Task</Text>
            <Text style={s.headerSub}>The selected task could not be found.</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.card}>
            <Text style={s.body}>Pick a task from the dashboard, review queue, or task-series manager and try again.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const latestUpdate = sortTaskUpdates((context.task.updates || []).filter((e) => !e.isDraft))[0] || null;

  const statusChips = [
    { label: getTaskStatusLabel(getTaskWorkflowState(context.task)), tone: 'neutral' },
    reviewMode ? { label: 'Review mode', tone: 'accent' } : null,
    owner?.name ? { label: owner.name, tone: 'accent' } : { label: principalType === 'parent' ? 'Parent mode' : 'Kid mode', tone: 'neutral' },
  ].filter(Boolean);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <View style={s.chevronLeft} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{context.task.text || 'Task'}</Text>
          <Text style={s.headerSub} numberOfLines={1}>
            {context.series?.name ? `${context.series.name} · ${context.chore?.title || 'Task series'}` : context.chore?.title || 'Task details'}
          </Text>
        </View>
      </View>
      {statusChips.length ? (
        <View style={s.chipBar}>
          {statusChips.map((chip, i) => <StatusPill key={i} label={chip.label} tone={chip.tone} />)}
        </View>
      ) : null}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
        <View style={[s.grid, width >= 960 && s.gridWide]}>
          {/* Left column */}
          <View style={[s.gridItem, width < 960 && s.gridItemFull]}>
            <View style={s.card}>
              <Text style={s.eyebrow}>Overview</Text>
              <Text style={s.sectionTitle}>{context.task.text || 'Task'}</Text>
              {context.task.notes ? <Text style={s.body}>{context.task.notes}</Text> : null}
              <View style={s.grid}>
                <View style={s.gridItem}>
                  <Text style={s.tinyLabel}>Current State</Text>
                  <Text style={s.tinyValue}>{getTaskStatusLabel(getTaskWorkflowState(context.task))}</Text>
                </View>
                <View style={s.gridItem}>
                  <Text style={s.tinyLabel}>For Date</Text>
                  <Text style={s.tinyValue}>{formatTaskDateLabel(selectedDateKey) || formatDateLabel(selectedDateKey)}</Text>
                </View>
                <View style={s.gridItem}>
                  <Text style={s.tinyLabel}>Owner</Text>
                  <Text style={s.tinyValue}>{owner?.name || currentUser?.name || 'Unknown'}</Text>
                </View>
                <View style={s.gridItem}>
                  <Text style={s.tinyLabel}>Current Block</Text>
                  <Text style={s.tinyValue}>{scheduledTasks.filter((t) => !t.isDayBreak).length} active tasks</Text>
                </View>
              </View>
              {latestUpdate?.note ? (
                <View style={s.mutedBox}>
                  <Text style={s.eyebrow}>Latest Activity</Text>
                  <Text style={[s.body, { color: E.ink }]}>{latestUpdate.note}</Text>
                </View>
              ) : null}
              <View style={s.actionRow}>
                <Pressable onPress={() => openTaskSeriesChecklist({ seriesId: context.series.id, choreId: context.chore.id, date: selectedDateKey, memberId: owner?.id || '' })} style={s.btn}>
                  <Text style={s.btnText}>Checklist</Text>
                </Pressable>
                <Pressable onPress={() => openTaskHistory({ seriesId: context.series.id, taskId: context.task.id, title: context.task.text || 'Task History' })} style={s.btn}>
                  <Text style={s.btnText}>History</Text>
                </Pressable>
                <Pressable onPress={() => void openTaskSeriesDiscussion({ seriesId: context.series.id, seriesName: context.series.name })} style={s.btn}>
                  <Text style={s.btnText}>Discussion</Text>
                </Pressable>
              </View>
            </View>
            <View style={s.card}>
              <Text style={s.eyebrow}>Task Update</Text>
              <Text style={s.sectionTitle}>Respond, review, and grade</Text>
              <TaskUpdateComposerCard
                task={context.task}
                series={context.series}
                chore={context.chore}
                allTasks={context.allTasks}
                selectedDateKey={selectedDateKey}
                currentUser={{ ...currentUser, db }}
                gradeTypes={query.data?.gradeTypes || []}
                db={db}
                onSaved={() => { Alert.alert('Task updated', 'The task update was saved.'); }}
              />
            </View>
          </View>

          {/* Right column */}
          <View style={[s.gridItem, width < 960 && s.gridItemFull]}>
            <View style={s.card}>
              <Text style={s.eyebrow}>Reference</Text>
              <Text style={s.sectionTitle}>Instructions and files</Text>
              {context.task.notes ? <Text style={s.body}>{context.task.notes}</Text> : <Text style={s.body}>No saved task notes yet.</Text>}
              <AttachmentChips attachments={context.task.attachments || []} onOpen={setPreviewAttachment} />
            </View>
            <View style={s.card}>
              <Text style={s.eyebrow}>History</Text>
              <Text style={s.sectionTitle}>Updates, responses, and feedback</Text>
              <UpdateHistoryList task={context.task} onOpenAttachment={setPreviewAttachment} />
            </View>
          </View>
        </View>
      </ScrollView>
      <AttachmentPreviewModal attachment={previewAttachment} visible={!!previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:         { flex: 1, backgroundColor: E.bg },
  header:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP.md, paddingTop: SP.sm, paddingBottom: SP.sm, gap: SP.sm, backgroundColor: E.bg, borderBottomWidth: 1, borderBottomColor: E.borderLight },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  chevronLeft:  { width: 9, height: 9, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: E.inkSub, transform: [{ rotate: '45deg' }] },
  headerTitle:  { fontFamily: 'serif', color: E.ink, fontWeight: '700', fontSize: 17, lineHeight: 22 },
  headerSub:    { color: E.inkMuted, fontSize: 12, fontWeight: '300' },
  chipBar:      { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, paddingHorizontal: SP.md, paddingVertical: SP.xs, backgroundColor: E.bg },

  content:    { gap: SP.md, padding: SP.md, paddingBottom: SP.xxl },
  card:       { borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.sm },
  mutedBox:   { borderRadius: R.sm, borderWidth: 1, borderColor: E.borderLight, borderStyle: 'dashed', backgroundColor: E.bgDeep, padding: SP.md, gap: SP.xs },
  actionRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: SP.sm },

  eyebrow:      { color: E.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  sectionTitle: { color: E.ink, fontWeight: '800', fontSize: 16 },
  body:         { color: E.inkMuted, fontSize: 13, lineHeight: 18 },
  tinyLabel:    { color: E.inkMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  tinyValue:    { color: E.ink, fontSize: 14, fontWeight: '700' },

  btn:       { minHeight: 40, paddingHorizontal: SP.md, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: E.border, backgroundColor: E.surface },
  btnText:   { color: E.ink, fontWeight: '800', fontSize: 13 },

  grid:         { gap: SP.md },
  gridWide:     { flexDirection: 'row', alignItems: 'flex-start' },
  gridItem:     { flexBasis: '48%', minWidth: 220, flexGrow: 1, gap: SP.md },
  gridItemFull: { flexBasis: '100%' },
});
