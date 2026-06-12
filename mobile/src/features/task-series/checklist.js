import React, { useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { id, tx } from '@instantdb/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { radii, shadows, spacing, withAlpha } from '../../theme/tokens';
import { useAppTheme } from '../../theme/ThemeProvider';
import { useAppSession } from '../../providers/AppProviders';
import { SubscreenScaffold } from '../../components/SubscreenScaffold';
import { AttachmentPreviewModal } from '../../components/AttachmentPreviewModal';
import { getPresignedFileUrl } from '../../lib/api-client';
import { buildTaskUpdateTransactions } from '../../../../lib/task-update-mutations';
import {
  getBucketedTasks,
  getLatestTaskResponseThread,
  getLatestTaskUpdate,
  getTaskChildProgressPercent,
  getTaskLastActiveState,
  getTaskStatusLabel,
  getTaskUpdateActorName,
  getTaskUpdateReplyToId,
  getTaskWorkflowState,
  isTaskDone,
  taskUpdateHasMeaningfulFeedbackContent,
} from '../../../../lib/task-progress';
import {
  areTodayTasksFinished,
  buildPullForwardTransactions,
  buildUndoPullForwardTransactions,
  canPullForward,
  computeLiveProjectedEndDate,
  computePlannedEndDate,
  computeScheduleDrift,
  countCompletedTaskDayBlocks,
  countTaskDayBlocks,
  getNextPullableDate,
} from '../../../../lib/task-series-schedule';
import { getTasksForDate } from '../../../../lib/task-scheduler';
import { openTaskHistory, openTaskSeriesChecklist, openTaskSeriesDiscussion } from './navigation';

function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

function firstRef(value) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

function toDateKey(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function parseDateKey(value) {
  return new Date(`${toDateKey(value)}T00:00:00Z`);
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getResponsePreview(entry) {
  if (entry?.note) return entry.note;

  for (const value of entry?.responseFieldValues || []) {
    const richText = stripHtml(value?.richTextContent);
    if (richText) return richText;
    if (value?.fileName) return value.fileName;
    if (value?.fileUrl) return 'Attached file';
  }

  return null;
}

function getTaskParentId(task) {
  if (!task?.parentTask) return null;
  if (Array.isArray(task.parentTask)) return task.parentTask[0]?.id || null;
  return task.parentTask.id || null;
}

function hasScheduledChildren(parentId, scheduledIds, allTasks) {
  return allTasks.some((task) => getTaskParentId(task) === parentId && scheduledIds.has(task.id));
}

function buildVisibleTaskNodes(scheduledTasks, allTasks) {
  if (!scheduledTasks?.length) return [];
  const visibleMap = new Map();
  scheduledTasks.forEach((task) => visibleMap.set(task.id, task));

  scheduledTasks.forEach((task) => {
    let current = task;
    let depth = 0;
    let parentId = getTaskParentId(current);
    while (parentId && depth < 10) {
      if (visibleMap.has(parentId)) break;
      const parent = allTasks.find((candidate) => candidate.id === parentId);
      if (!parent) break;
      visibleMap.set(parent.id, parent);
      current = parent;
      parentId = getTaskParentId(current);
      depth += 1;
    }
  });

  return Array.from(visibleMap.values()).sort((left, right) => (left.order || 0) - (right.order || 0));
}

function buildTaskLinks(task) {
  const links = [];
  const seen = new Set();
  const urlPattern = /\b((?:https?:\/\/|[a-z][a-z0-9+.-]*:\/\/)[^\s<>"')]+)/gi;

  function pushLink(label, url, kind = 'external', extra = {}) {
    if (!url || seen.has(url)) return;
    seen.add(url);
    links.push({ key: `${kind}:${url}`, label, url, kind, ...extra });
  }

  [task?.text, task?.notes].forEach((value) => {
    if (!value) return;
    const matches = String(value).match(urlPattern) || [];
    matches.forEach((match, index) => {
      pushLink(index === 0 ? 'Open link' : `Open link ${index + 1}`, match, 'external');
    });
  });

  (task?.attachments || []).forEach((attachment) => {
    if (!attachment?.url) return;
    const key = String(attachment.url);
    const isFullUrl = /^https?:\/\//i.test(key);
    pushLink(attachment.name || 'Attachment', key, 'attachment', {
      attachment,
      s3Key: isFullUrl ? null : key,
    });
  });

  return links;
}

async function openTaskLink(link) {
  try {
    let resolvedUrl = link.url;
    if (link.s3Key) {
      resolvedUrl = await getPresignedFileUrl(link.s3Key);
    }
    await Linking.openURL(resolvedUrl);
  } catch (error) {
    Alert.alert('Unable to open link', error?.message || 'Please try again.');
  }
}

function createStyles(colors) {
  return StyleSheet.create({
    content: {
      gap: spacing.md,
      paddingBottom: spacing.xxl,
    },
    card: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panelElevated,
      padding: spacing.md,
      gap: spacing.sm,
      ...shadows.card,
    },
    splitRow: {
      flexDirection: 'row',
      gap: spacing.md,
      alignItems: 'flex-start',
    },
    listColumn: {
      flex: 1.35,
      gap: spacing.md,
    },
    sideColumn: {
      flex: 0.85,
      gap: spacing.md,
    },
    title: {
      color: colors.ink,
      fontSize: 16,
      fontWeight: '800',
    },
    body: {
      color: colors.inkMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    eyebrow: {
      color: colors.inkMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    badge: {
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      alignSelf: 'flex-start',
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '800',
    },
    taskRow: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      padding: spacing.md,
      gap: spacing.sm,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    button: {
      minHeight: 38,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonPrimary: {
      backgroundColor: colors.accentMore,
      borderColor: colors.accentMore,
    },
    buttonText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: '800',
    },
    buttonTextPrimary: {
      color: colors.onAccent,
    },
    progressTrack: {
      height: 8,
      borderRadius: radii.pill,
      backgroundColor: withAlpha(colors.ink, 0.08),
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: radii.pill,
      backgroundColor: colors.accentMore,
    },
    linkRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    linkChip: {
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panelElevated,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    linkText: {
      color: colors.ink,
      fontSize: 11,
      fontWeight: '700',
    },
    bucketSection: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: withAlpha(colors.ink, 0.03),
      padding: spacing.md,
      gap: spacing.sm,
    },
    divider: {
      height: 1,
      backgroundColor: colors.line,
    },
  });
}

function StatusBadge({ colors, state, emphasis = false }) {
  const tone =
    state === 'done'
      ? { bg: withAlpha(colors.success, 0.12), border: withAlpha(colors.success, 0.28), text: colors.success }
      : state === 'needs_review'
      ? { bg: withAlpha(colors.warning, 0.12), border: withAlpha(colors.warning, 0.28), text: colors.warning }
      : state === 'blocked'
      ? { bg: withAlpha(colors.danger, 0.12), border: withAlpha(colors.danger, 0.28), text: colors.danger }
      : emphasis
      ? { bg: withAlpha(colors.accentMore, 0.12), border: withAlpha(colors.accentMore, 0.28), text: colors.accentMore }
      : { bg: colors.panel, border: colors.line, text: colors.inkMuted };

  return (
    <View style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: tone.border, backgroundColor: tone.bg, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
      <Text style={{ color: tone.text, fontSize: 11, fontWeight: '800' }}>{getTaskStatusLabel(state)}</Text>
    </View>
  );
}

function TaskFeedbackSummary({ task, colors }) {
  const thread = getLatestTaskResponseThread(task);
  if (!thread) return null;

  const latestFeedback = thread.feedbackReplies[thread.feedbackReplies.length - 1];
  const responsePreview = getResponsePreview(thread.submission);
  const feedbackPreview =
    latestFeedback?.note ||
    (latestFeedback?.gradeDisplayValue ? `Grade: ${latestFeedback.gradeDisplayValue}` : null);
  return (
    <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: withAlpha(colors.accentMore, 0.24), backgroundColor: withAlpha(colors.accentMore, 0.06), padding: spacing.md, gap: spacing.xs }}>
      <Text style={{ color: colors.accentMore, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Latest response</Text>
      {responsePreview ? <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 17 }}>{responsePreview}</Text> : null}
      {feedbackPreview ? <Text style={{ color: colors.inkMuted, fontSize: 12, lineHeight: 17 }}>{feedbackPreview}</Text> : null}
    </View>
  );
}

function SeriesHistorySummary({ colors, latestUpdate, selectedDateLabel }) {
  if (!latestUpdate) {
    return (
      <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', padding: spacing.md }}>
        <Text style={{ color: colors.inkMuted, fontSize: 12 }}>No updates have been saved yet for this series.</Text>
      </View>
    );
  }

  return (
    <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md, gap: spacing.xs }}>
      <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Latest activity</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '700' }}>{getTaskStatusLabel(latestUpdate.toState || 'not_started')}</Text>
        {getTaskUpdateActorName(latestUpdate) ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>by {getTaskUpdateActorName(latestUpdate)}</Text> : null}
        {selectedDateLabel ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>for {selectedDateLabel}</Text> : null}
      </View>
      {latestUpdate.note ? <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 17 }}>{latestUpdate.note}</Text> : null}
    </View>
  );
}

export function TaskSeriesChecklistScreen() {
  const params = useLocalSearchParams();
  const seriesId = firstParam(params.seriesId);
  const choreId = firstParam(params.choreId);
  const dateKey = toDateKey(firstParam(params.date));
  const memberId = firstParam(params.memberId);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const { db, currentUser, familyMembers, isAuthenticated, instantReady } = useAppSession();
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [undoState, setUndoState] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const selectedDate = useMemo(() => parseDateKey(dateKey), [dateKey]);

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
          gradeTypes: {},
          familyMembers: {},
        }
      : null
  );

  const context = useMemo(() => {
    const chores = query.data?.chores || [];
    for (const chore of chores) {
      if (choreId && chore.id !== choreId) continue;
      for (const series of chore.taskSeries || []) {
        if (series.id !== seriesId) continue;
        const owner = firstRef(series.familyMember);
        if (memberId && owner?.id && owner.id !== memberId) continue;
        const allTasks = (series.tasks || []).slice().sort((left, right) => (left.order || 0) - (right.order || 0));
        const scheduledTasks = getTasksForDate(
          allTasks,
          chore.rrule || null,
          chore.startDate,
          selectedDate,
          series.startDate || null,
          chore.exdates || null,
          series.pullForwardCount || 0
        );
        const activeTasks = scheduledTasks.filter((task) => !isTaskDone(task));
        const scheduledIds = new Set(activeTasks.map((task) => task.id));
        const visibleNodes = buildVisibleTaskNodes(activeTasks, allTasks);
        const bucketed = {
          blocked: getBucketedTasks(allTasks, 'blocked'),
          needs_review: getBucketedTasks(allTasks, 'needs_review'),
          skipped: getBucketedTasks(allTasks, 'skipped'),
          done: getBucketedTasks(allTasks, 'done'),
        };
        return {
          chore,
          series,
          allTasks,
          scheduledTasks,
          activeTasks,
          scheduledIds,
          visibleNodes,
          bucketed,
        };
      }
    }
    return null;
  }, [choreId, memberId, query.data?.chores, seriesId, selectedDate]);

  const owner = firstRef(context?.series?.familyMember) || (query.data?.familyMembers || familyMembers || []).find((member) => member.id === memberId) || null;
  const selectedTask =
    (selectedTaskId && context?.allTasks?.find((task) => task.id === selectedTaskId)) ||
    context?.visibleNodes?.find((task) => !hasScheduledChildren(task.id, context.scheduledIds, context.allTasks)) ||
    context?.activeTasks?.find((task) => !task.isDayBreak) ||
    null;

  async function applyTaskUpdate(task, nextState, extra = {}) {
    if (!currentUser?.id || !context) {
      Alert.alert('Login required', 'Choose a family member before updating task status.');
      return;
    }

    const { transactions } = buildTaskUpdateTransactions({
      tx,
      createId: id,
      taskId: task.id,
      allTasks: context.allTasks,
      nextState,
      selectedDateKey: dateKey,
      actorFamilyMemberId: currentUser.id,
      affectedFamilyMemberId: owner?.id || currentUser.id,
      taskSeriesId: context.series.id,
      choreId: context.chore.id,
      schedule: {
        startDate: context.chore.startDate,
        rrule: context.chore.rrule || null,
        exdates: context.chore.exdates || null,
      },
      referenceDate: selectedDate,
      ...extra,
    });

    if (!transactions.length) return;
    await db.transact(transactions);
  }

  async function handlePullForward() {
    if (!context?.series) return;
    const nextPullDate = getNextPullableDate(
      {
        startDate: toDateKey(context.chore.startDate || selectedDate),
        rruleString: context.chore.rrule || null,
        seriesStartDate: context.series.startDate ? toDateKey(context.series.startDate) : null,
        exdates: Array.isArray(context.chore.exdates) ? context.chore.exdates : [],
      },
      context.allTasks,
      context.series.pullForwardCount || 0
    );
    if (!nextPullDate) return;

    const result = buildPullForwardTransactions({
      tx,
      seriesId: context.series.id,
      currentPullForwardCount: context.series.pullForwardCount || 0,
      actorFamilyMemberId: currentUser?.id || null,
      choreId: context.chore.id || null,
      originalScheduledDate: nextPullDate,
    });
    await db.transact(result.transactions);
    setUndoState({
      seriesId: context.series.id,
      historyEventId: result.historyEventId,
      currentPullForwardCount: (context.series.pullForwardCount || 0) + 1,
    });
  }

  async function handleUndo() {
    if (!undoState) return;
    await db.transact(
      buildUndoPullForwardTransactions({
        tx,
        seriesId: undoState.seriesId,
        currentPullForwardCount: undoState.currentPullForwardCount,
        historyEventId: undoState.historyEventId,
      })
    );
    setUndoState(null);
  }

  if (!context) {
    return (
      <SubscreenScaffold title="Task Series" subtitle="The selected series could not be found." accent={colors.accentMore}>
        <View style={styles.card}>
          <Text style={styles.body}>Open a task series from the dashboard, manager, or member overview and try again.</Text>
        </View>
      </SubscreenScaffold>
    );
  }

  const totalBlocks = countTaskDayBlocks(context.allTasks);
  const completedBlocks = countCompletedTaskDayBlocks(context.allTasks);
  const pullForwardCount = context.series.pullForwardCount || 0;
  const schedule = {
    startDate: toDateKey(context.chore.startDate || selectedDate),
    rruleString: context.chore.rrule || null,
    seriesStartDate: context.series.startDate ? toDateKey(context.series.startDate) : null,
    exdates: Array.isArray(context.chore.exdates) ? context.chore.exdates : [],
  };
  const plannedEnd = context.series.plannedEndDate ? toDateKey(context.series.plannedEndDate) : computePlannedEndDate(schedule, totalBlocks);
  const liveEnd = computeLiveProjectedEndDate(schedule, totalBlocks, completedBlocks, pullForwardCount);
  const drift = computeScheduleDrift(plannedEnd, liveEnd, schedule);
  const canPull = canPullForward(context.series.workAheadAllowed, context.allTasks, pullForwardCount);
  const nextPullDate = canPull ? getNextPullableDate(schedule, context.allTasks, pullForwardCount) : null;
  const latestUpdate = context.allTasks.flatMap((task) => task.updates || []).filter((entry) => !entry.isDraft).sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())[0] || null;

  function renderTaskRow(task, bucketState = null) {
    const currentState = getTaskWorkflowState(task);
    const latestEntry = getLatestTaskUpdate(task);
    const latestEntryIsThreadedFeedback =
      !!latestEntry &&
      !!getTaskUpdateReplyToId(latestEntry) &&
      taskUpdateHasMeaningfulFeedbackContent(latestEntry);
    const links = buildTaskLinks(task);
    const hasChildren = hasScheduledChildren(task.id, context.scheduledIds, context.allTasks);
    const isHeader = hasChildren || (task.isDayBreak ? false : !context.scheduledIds.has(task.id));
    const indent = (task.indentationLevel || 0) * 14;

    if (isHeader) {
      const progressPercent = getTaskChildProgressPercent(task.id, context.allTasks);
      return (
        <View key={task.id} style={[styles.taskRow, { marginLeft: indent }]}>
          <Text style={styles.title}>{task.text}</Text>
          {typeof progressPercent === 'number' ? <Text style={styles.body}>{progressPercent}% complete</Text> : null}
          {task.notes ? <Text style={styles.body}>{task.notes}</Text> : null}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/task-series/task',
                  params: {
                    taskId: task.id,
                    seriesId: context.series.id,
                    choreId: context.chore.id,
                    date: dateKey,
                  },
                })
              }
              style={styles.button}
            >
              <Text style={styles.buttonText}>Open</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View key={task.id} style={[styles.taskRow, { marginLeft: indent }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, alignItems: 'center' }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.title}>{task.text}</Text>
            {!latestEntryIsThreadedFeedback && latestEntry?.note ? <Text style={styles.body}>{latestEntry.note}</Text> : task.notes ? <Text style={styles.body}>{task.notes}</Text> : null}
          </View>
          <StatusBadge colors={colors} state={bucketState || currentState} emphasis={bucketState === 'needs_review'} />
        </View>
        {isWide ? (
          <Pressable onPress={() => setSelectedTaskId(task.id)} style={styles.button}>
            <Text style={styles.buttonText}>Select</Text>
          </Pressable>
        ) : null}
        {links.length ? (
          <View style={styles.linkRow}>
            {links.map((link) => (
              <Pressable key={link.key} onPress={() => { if (link.kind === 'attachment') setPreviewAttachment(link.attachment); else void openTaskLink(link); }} style={styles.linkChip}>
                <Text style={styles.linkText}>{link.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <TaskFeedbackSummary task={task} colors={colors} />
        <View style={styles.actionRow}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/task-series/task',
                params: {
                  taskId: task.id,
                  seriesId: context.series.id,
                  choreId: context.chore.id,
                  date: dateKey,
                  review: bucketState === 'needs_review' ? '1' : '',
                },
              })
            }
            style={styles.button}
          >
            <Text style={styles.buttonText}>Open</Text>
          </Pressable>
          {currentState === 'not_started' ? (
            <Pressable onPress={() => void applyTaskUpdate(task, 'in_progress')} style={styles.button}>
              <Text style={styles.buttonText}>Start</Text>
            </Pressable>
          ) : null}
          {bucketState === 'done' ? (
            <Pressable onPress={() => void applyTaskUpdate(task, getTaskLastActiveState(task))} style={styles.button}>
              <Text style={styles.buttonText}>Undo</Text>
            </Pressable>
          ) : currentState === 'blocked' || currentState === 'skipped' || currentState === 'needs_review' ? (
            <Pressable onPress={() => void applyTaskUpdate(task, getTaskLastActiveState(task), { restoreTiming: 'now' })} style={styles.button}>
              <Text style={styles.buttonText}>Restore</Text>
            </Pressable>
          ) : null}
          {currentState !== 'done' && currentState !== 'needs_review' ? (
            <Pressable onPress={() => void applyTaskUpdate(task, 'done')} style={[styles.button, styles.buttonPrimary]}>
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Done</Text>
            </Pressable>
          ) : null}
          {bucketState === 'needs_review' && currentUser?.role === 'parent' ? (
            <Pressable onPress={() => void applyTaskUpdate(task, 'done')} style={[styles.button, styles.buttonPrimary]}>
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Approve</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const sidePane = (
    <View style={styles.sideColumn}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Overview</Text>
        <Text style={styles.title}>{context.series.name || 'Untitled series'}</Text>
        <Text style={styles.body}>
          {owner?.name || 'Unassigned'}
          {context.chore?.title ? ` • ${context.chore.title}` : ''}
          {dateKey ? ` • ${parseDateKey(dateKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          <StatusBadge colors={colors} state={drift.status === 'behind' ? 'needs_review' : drift.status === 'ahead' ? 'in_progress' : 'done'} />
          {nextPullDate ? <Text style={styles.body}>Next {nextPullDate}</Text> : null}
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(8, totalBlocks ? (completedBlocks / totalBlocks) * 100 : 8)}%` }]} />
        </View>
        <Text style={styles.body}>
          Days {completedBlocks}/{totalBlocks}
          {plannedEnd ? ` • Planned ${plannedEnd}` : ''}
          {liveEnd ? ` • Projected ${liveEnd}` : ''}
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Actions</Text>
        <View style={styles.actionRow}>
          <Pressable onPress={() => openTaskSeriesChecklist({ seriesId: context.series.id, choreId: context.chore.id, date: dateKey, memberId: owner?.id || '' })} style={styles.button}>
            <Text style={styles.buttonText}>Refresh</Text>
          </Pressable>
          <Pressable onPress={() => void openTaskSeriesDiscussion({ seriesId: context.series.id, seriesName: context.series.name })} style={styles.button}>
            <Text style={styles.buttonText}>Discussion</Text>
          </Pressable>
          <Pressable onPress={() => openTaskHistory({ seriesId: context.series.id, title: context.series.name || 'Task Series History' })} style={styles.button}>
            <Text style={styles.buttonText}>History</Text>
          </Pressable>
          {currentUser?.role === 'parent' ? (
            <Pressable onPress={() => router.push(`/more/task-series/${context.series.id}`)} style={styles.button}>
              <Text style={styles.buttonText}>Edit</Text>
            </Pressable>
          ) : null}
          {currentUser?.role === 'parent' ? (
            <Pressable onPress={() => router.push({ pathname: '/more/task-series/review', params: { seriesId: context.series.id } })} style={styles.button}>
              <Text style={styles.buttonText}>Review Queue</Text>
            </Pressable>
          ) : null}
          {canPull && nextPullDate && areTodayTasksFinished(context.scheduledTasks.filter((task) => !task.isDayBreak)) ? (
            <Pressable onPress={() => void handlePullForward()} style={[styles.button, styles.buttonPrimary]}>
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Pull Forward</Text>
            </Pressable>
          ) : null}
          {undoState ? (
            <Pressable onPress={() => void handleUndo()} style={styles.button}>
              <Text style={styles.buttonText}>Undo Pull</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Latest activity</Text>
        <SeriesHistorySummary colors={colors} latestUpdate={latestUpdate} selectedDateLabel={dateKey} />
      </View>
      {selectedTask ? (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Selected task</Text>
          <Text style={styles.title}>{selectedTask.text}</Text>
          {selectedTask.notes ? <Text style={styles.body}>{selectedTask.notes}</Text> : null}
          <View style={styles.actionRow}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/task-series/task',
                  params: {
                    taskId: selectedTask.id,
                    seriesId: context.series.id,
                    choreId: context.chore.id,
                    date: dateKey,
                  },
                })
              }
              style={[styles.button, styles.buttonPrimary]}
            >
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Open Task</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );

  const listPane = (
    <View style={styles.listColumn}>
      {context.visibleNodes.length ? (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Active work</Text>
          <View style={{ gap: spacing.sm }}>
            {context.visibleNodes.map((task) => renderTaskRow(task))}
          </View>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.body}>No active tasks are scheduled right now.</Text>
        </View>
      )}

      {['blocked', 'needs_review', 'skipped', 'done'].map((bucketKey) => {
        const tasksForState = context.bucketed[bucketKey] || [];
        if (!tasksForState.length) return null;
        return (
          <View key={bucketKey} style={styles.bucketSection}>
            <Text style={styles.title}>{getTaskStatusLabel(bucketKey)}</Text>
            {tasksForState.map((task) => renderTaskRow(task, bucketKey))}
          </View>
        );
      })}
    </View>
  );

  return (
    <SubscreenScaffold
      title={context.series.name || 'Task Series'}
      subtitle={`${owner?.name || 'Member'} • ${context.chore?.title || 'Checklist'} • ${parseDateKey(dateKey).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
      accent={colors.accentMore}
      statusChips={[
        { label: context.activeTasks.length ? `${context.activeTasks.length} active` : 'No active tasks', tone: context.activeTasks.length ? 'accent' : 'neutral' },
        { label: drift.label, tone: drift.status === 'behind' ? 'warning' : drift.status === 'ahead' ? 'accent' : 'success' },
      ]}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {isWide ? <View style={styles.splitRow}>{listPane}{sidePane}</View> : (<>{sidePane}{listPane}</>)}
      </ScrollView>
      <AttachmentPreviewModal attachment={previewAttachment} visible={!!previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </SubscreenScaffold>
  );
}

export function TaskSeriesHistoryScreen() {
  const params = useLocalSearchParams();
  const seriesId = firstParam(params.seriesId);
  const taskId = firstParam(params.taskId);
  const title = firstParam(params.title);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { db, isAuthenticated, instantReady } = useAppSession();
  const [previewAttachment, setPreviewAttachment] = useState(null);

  const query = db.useQuery(
    isAuthenticated && instantReady
      ? {
          historyEvents: {
            $: {
              order: { occurredAt: 'desc' },
              limit: 200,
            },
            actor: {},
            affectedFamilyMembers: {},
            attachments: {},
            message: {
              author: {},
              attachments: {},
            },
          },
        }
      : null
  );

  const events = useMemo(
    () =>
      (query.data?.historyEvents || []).filter((event) => {
        if (taskId) {
          return event.taskId === taskId;
        }
        if (seriesId) {
          return event.taskSeriesId === seriesId;
        }
        return false;
      }),
    [query.data?.historyEvents, seriesId, taskId]
  );

  return (
    <SubscreenScaffold
      title={title || 'Task History'}
      subtitle={taskId ? 'Task-level update history' : 'Series-level task history'}
      accent={colors.accentMore}
      statusChips={[{ label: `${events.length} events`, tone: 'accent' }]}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {!events.length ? (
          <View style={styles.card}>
            <Text style={styles.body}>No history events match this task or series yet.</Text>
          </View>
        ) : (
          events.map((event) => (
            <View key={event.id} style={styles.card}>
              <Text style={styles.eyebrow}>{event.domain || 'tasks'}</Text>
              <Text style={styles.title}>{event.summary || 'History event'}</Text>
              <Text style={styles.body}>
                {event.actor?.[0]?.name ? `by ${event.actor[0].name}` : ''}
                {event.occurredAt ? `${event.actor?.[0]?.name ? ' • ' : ''}${new Date(event.occurredAt).toLocaleString()}` : ''}
              </Text>
              {event.metadata ? (
                <Text style={styles.body}>{JSON.stringify(event.metadata)}</Text>
              ) : null}
              {(event.attachments || []).length ? (
                <View style={styles.linkRow}>
                  {(event.attachments || []).map((attachment) => (
                    <Pressable key={attachment.id} onPress={() => setPreviewAttachment(attachment)} style={styles.linkChip}>
                      <Text style={styles.linkText}>{attachment.name || 'Attachment'}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
      <AttachmentPreviewModal attachment={previewAttachment} visible={!!previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </SubscreenScaffold>
  );
}
