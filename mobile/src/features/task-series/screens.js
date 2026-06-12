import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { id, tx } from '@instantdb/react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { radii, shadows, spacing, withAlpha } from '../../theme/tokens';
import { useAppTheme } from '../../theme/ThemeProvider';
import { useAppSession } from '../../providers/AppProviders';
import { useParentActionGate } from '../../hooks/useParentActionGate';
import { SubscreenScaffold, ParentAccessNotice } from '../../components/SubscreenScaffold';
import { AttachmentPreviewModal } from '../../components/AttachmentPreviewModal';
import {
  captureCameraImage,
  captureCameraVideo,
  createRecordedAudioAttachment,
  pickAttachmentDocuments,
  pickLibraryMedia,
  uploadPendingAttachments,
} from '../../lib/attachments';
import { RichTextHtmlEditor } from './RichTextHtmlEditor';
import { clearTaskUpdateDraft, loadTaskUpdateDraft, saveTaskUpdateDraft } from './drafts';
import { buildTaskUpdateTransactions, buildClearNotedTransactions, buildNotedTransactions, validateUpdateSubmission } from '../../../../lib/task-update-mutations';
import {
  getTaskHistoryEntries,
  getLatestTaskResponseThread,
  getTaskResponseSubmissions,
  getTaskUpdateActorName,
  getTaskUpdateAffectedName,
  getTaskUpdateFeedbackReplies,
  getTaskUpdateReplyToId,
  getTaskStatusLabel,
  getTaskWorkflowState,
  getTaskProgressPlaceholder,
  isActionableTask,
  isTaskDone,
  sortTaskUpdates,
  taskUpdateHasMeaningfulFeedbackContent,
  taskUpdateHasStateTransition,
} from '../../../../lib/task-progress';
import { buildTaskBinEntries, groupByAttention, sortTaskBinEntries } from '../../../../lib/task-bins';
import { formatGradeDisplay } from '../../../../lib/grade-utils';
import { computeSeriesGrade } from '../../../../lib/task-response-aggregation';
import { RESPONSE_FIELD_TYPE_LABELS } from '../../../../lib/task-response-types';
import { getTaskUpdateStateLabel, getTaskUpdateVisibleStates, TASK_UPDATE_ALL_STATES } from '../../../../lib/task-update-ui';
import {
  areTodayTasksFinished,
  buildCatchUpTransactions,
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

function formatDateLabel(value) {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTaskDateLabel(value) {
  if (!value) return '';
  return parseDateKey(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimestamp(value) {
  if (!value) return '';
  const parsed = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString();
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveField(field) {
  if (!field) return null;
  if (Array.isArray(field)) return field[0] || null;
  return field;
}

function resolveGradeType(entry) {
  const raw = entry?.gradeType;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw;
}

function buildTaskStatusOptions(task, isParentReviewer) {
  if (isParentReviewer) return TASK_UPDATE_ALL_STATES.slice();
  return getTaskUpdateVisibleStates(getTaskWorkflowState(task), {
    isReviewMode: isParentReviewer,
  });
}

function getDefaultParentPanelMode(currentState, canShowFeedbackMode) {
  if (!canShowFeedbackMode) return 'response';
  return currentState === 'in_progress' || currentState === 'not_started' ? 'response' : 'feedback';
}

function buildSeriesStatus(series, infoMap, today) {
  const cached = infoMap.statusCache.get(series.id);
  if (cached) return cached;

  const info = infoMap.baseMap.get(series.id);
  if (!info) {
    infoMap.statusCache.set(series.id, 'draft');
    return 'draft';
  }

  const allCompleted = info.totalTasks > 0 && info.completedTasks === info.totalTasks;
  let status = 'draft';

  if (!info.hasAssignee || !info.hasScheduledActivity) {
    status = 'draft';
  } else {
    let dependencyBlocking = false;
    if (info.dependsOnSeriesId) {
      dependencyBlocking = buildSeriesStatus({ id: info.dependsOnSeriesId }, infoMap, today) !== 'archived';
    }

    if (allCompleted) {
      status = !info.lastScheduledDate || info.lastScheduledDate <= today ? 'archived' : 'in_progress';
    } else if (dependencyBlocking) {
      status = 'pending';
    } else if (info.effectiveStartDate && info.effectiveStartDate > today) {
      status = 'pending';
    } else {
      status = 'in_progress';
    }
  }

  infoMap.statusCache.set(series.id, status);
  return status;
}

function buildManagerItems(seriesList) {
  const today = new Date();
  const baseMap = new Map();
  const statusCache = new Map();

  for (const series of seriesList) {
    const tasks = (series.tasks || []).slice();
    const actionableTasks = tasks.filter((task) => isActionableTask(task, tasks));
    const totalTasks = actionableTasks.length;
    const completedTasks = actionableTasks.filter((task) => isTaskDone(task)).length;
    const activity = firstRef(series.scheduledActivity);
    const owner = firstRef(series.familyMember);

    const effectiveStartDate = series.startDate
      ? new Date(series.startDate)
      : activity?.startDate
      ? new Date(activity.startDate)
      : null;
    const lastScheduledDate = series.targetEndDate
      ? new Date(series.targetEndDate)
      : activity?.endDate
      ? new Date(activity.endDate)
      : null;

    baseMap.set(series.id, {
      totalTasks,
      completedTasks,
      hasAssignee: !!owner?.id,
      hasScheduledActivity: !!activity?.id,
      effectiveStartDate,
      lastScheduledDate,
      dependsOnSeriesId: series.dependsOnSeriesId || null,
    });
  }

  const infoMap = { baseMap, statusCache };

  return seriesList
    .map((series) => {
      const info = baseMap.get(series.id) || {};
      const tasks = (series.tasks || []).slice();
      const totalBlocks = countTaskDayBlocks(tasks);
      const completedBlocks = countCompletedTaskDayBlocks(tasks);
      const pullForwardCount = Number(series.pullForwardCount || 0);
      const activity = firstRef(series.scheduledActivity);
      const schedule =
        activity?.rrule || activity?.startDate
          ? {
              startDate: toDateKey(activity?.startDate || today),
              rruleString: activity?.rrule || null,
              seriesStartDate: series.startDate ? toDateKey(series.startDate) : null,
              exdates: Array.isArray(activity?.exdates) ? activity.exdates : [],
            }
          : null;
      const plannedEnd = series.plannedEndDate
        ? toDateKey(series.plannedEndDate)
        : schedule
        ? computePlannedEndDate(schedule, totalBlocks)
        : null;
      const liveEnd = schedule
        ? computeLiveProjectedEndDate(schedule, totalBlocks, completedBlocks, pullForwardCount)
        : null;
      const drift = schedule ? computeScheduleDrift(plannedEnd, liveEnd, schedule) : { status: 'on_target', days: 0, label: 'On target' };
      const seriesGrade = computeSeriesGrade(series.tasks || []);

      return {
        series,
        status: buildSeriesStatus(series, infoMap, today),
        totalTasks: info.totalTasks || 0,
        completedTasks: info.completedTasks || 0,
        totalBlocks,
        completedBlocks,
        pullForwardCount,
        drift,
        plannedEnd,
        liveEnd,
        seriesGrade,
      };
    })
    .sort((left, right) => {
      const leftTime = left.series?.updatedAt ? new Date(left.series.updatedAt).getTime() : 0;
      const rightTime = right.series?.updatedAt ? new Date(right.series.updatedAt).getTime() : 0;
      return rightTime - leftTime;
    });
}

function buildMemberOverviewItems(seriesList, memberId) {
  const today = new Date();
  const todayKey = toDateKey(today);

  return seriesList
    .filter((series) => {
      const owner = firstRef(series.familyMember);
      return owner?.id === memberId;
    })
    .map((series) => {
      const tasks = (series.tasks || []).slice().sort((left, right) => (left.order || 0) - (right.order || 0));
      const activity = firstRef(series.scheduledActivity);
      const actionableTasks = tasks.filter((task) => isActionableTask(task, tasks));
      const totalTasks = actionableTasks.length;
      const completedTasks = actionableTasks.filter((task) => isTaskDone(task)).length;
      const totalBlocks = countTaskDayBlocks(tasks);
      const completedBlocks = countCompletedTaskDayBlocks(tasks);
      const pullForwardCount = Number(series.pullForwardCount || 0);
      const schedule =
        activity?.startDate || activity?.rrule
          ? {
              startDate: toDateKey(activity?.startDate || todayKey),
              rruleString: activity?.rrule || null,
              seriesStartDate: series.startDate ? toDateKey(series.startDate) : null,
              exdates: Array.isArray(activity?.exdates) ? activity.exdates : [],
            }
          : null;
      const todayTasks = schedule
        ? getTasksForDate(
            tasks,
            schedule.rruleString,
            schedule.startDate,
            today,
            schedule.seriesStartDate,
            schedule.exdates,
            pullForwardCount
          )
        : [];
      const canPull = canPullForward(series.workAheadAllowed, tasks, pullForwardCount);
      const nextPullDate = schedule && canPull ? getNextPullableDate(schedule, tasks, pullForwardCount) : null;
      const plannedEnd = series.plannedEndDate
        ? toDateKey(series.plannedEndDate)
        : schedule
        ? computePlannedEndDate(schedule, totalBlocks)
        : null;
      const liveEnd = schedule
        ? computeLiveProjectedEndDate(schedule, totalBlocks, completedBlocks, pullForwardCount)
        : null;
      const drift = schedule ? computeScheduleDrift(plannedEnd, liveEnd, schedule) : { status: 'on_target', days: 0, label: 'On target' };
      const effectiveStartDate = series.startDate ? new Date(series.startDate) : activity?.startDate ? new Date(activity.startDate) : null;
      const allDone = totalTasks > 0 && completedTasks === totalTasks;
      const isFuture = effectiveStartDate && effectiveStartDate > today;
      const hasDependency = !!series.dependsOnSeriesId;
      let status = 'active_now';
      if (allDone) status = 'finished';
      else if (isFuture || hasDependency) status = 'future';

      return {
        series,
        totalTasks,
        completedTasks,
        totalBlocks,
        completedBlocks,
        pullForwardCount,
        todayTasks,
        todayTasksFinished: areTodayTasksFinished(todayTasks),
        canPull,
        nextPullDate,
        drift,
        schedule,
        plannedEnd,
        liveEnd,
        status,
      };
    })
    .sort((left, right) => {
      const order = { active_now: 0, future: 1, finished: 2 };
      return order[left.status] - order[right.status];
    });
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
    splitCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panelElevated,
      padding: spacing.md,
      gap: spacing.sm,
      flex: 1,
    },
    sectionTitle: {
      color: colors.ink,
      fontWeight: '800',
      fontSize: 16,
    },
    eyebrow: {
      color: colors.inkMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    body: {
      color: colors.inkMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    between: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    pill: {
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillText: {
      fontSize: 11,
      fontWeight: '800',
    },
    chipRow: {
      gap: spacing.sm,
    },
    chip: {
      minHeight: 36,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipActive: {
      borderColor: withAlpha(colors.accentMore, 0.28),
      backgroundColor: withAlpha(colors.accentMore, 0.12),
    },
    chipText: {
      color: colors.inkMuted,
      fontWeight: '800',
      fontSize: 12,
    },
    chipTextActive: {
      color: colors.accentMore,
    },
    button: {
      minHeight: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: withAlpha(colors.accentMore, 0.22),
      backgroundColor: colors.panel,
    },
    buttonPrimary: {
      backgroundColor: colors.accentMore,
      borderColor: colors.accentMore,
    },
    buttonDanger: {
      backgroundColor: withAlpha(colors.danger, 0.12),
      borderColor: withAlpha(colors.danger, 0.28),
    },
    buttonText: {
      color: colors.ink,
      fontWeight: '800',
      fontSize: 13,
    },
    buttonTextPrimary: {
      color: colors.onAccent,
    },
    buttonTextDanger: {
      color: colors.danger,
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
    input: {
      minHeight: 42,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      color: colors.ink,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 14,
    },
    textArea: {
      minHeight: 108,
      textAlignVertical: 'top',
    },
    taskRow: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      padding: spacing.md,
      gap: spacing.sm,
    },
    taskTitle: {
      color: colors.ink,
      fontSize: 15,
      fontWeight: '800',
    },
    taskMeta: {
      color: colors.inkMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    taskActionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    attachmentRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    attachmentChip: {
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panelElevated,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    attachmentChipText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: '700',
    },
    mutedBox: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      borderStyle: 'dashed',
      backgroundColor: withAlpha(colors.ink, 0.03),
      padding: spacing.md,
    },
    mutedText: {
      color: colors.inkMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    historyCard: {
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.panel,
      padding: spacing.md,
      gap: spacing.xs,
    },
    divider: {
      height: 1,
      backgroundColor: colors.line,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
    },
    gridItem: {
      flexBasis: '48%',
      minWidth: 220,
      flexGrow: 1,
    },
    tinyLabel: {
      color: colors.inkMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    tinyValue: {
      color: colors.ink,
      fontSize: 14,
      fontWeight: '700',
    },
  });
}

function StatusPill({ colors, label, tone = 'neutral' }) {
  const toneStyles =
    tone === 'success'
      ? { bg: withAlpha(colors.success, 0.12), border: withAlpha(colors.success, 0.26), text: colors.success }
      : tone === 'warning'
      ? { bg: withAlpha(colors.warning, 0.12), border: withAlpha(colors.warning, 0.26), text: colors.warning }
      : tone === 'danger'
      ? { bg: withAlpha(colors.danger, 0.12), border: withAlpha(colors.danger, 0.26), text: colors.danger }
      : tone === 'accent'
      ? { bg: withAlpha(colors.accentMore, 0.12), border: withAlpha(colors.accentMore, 0.26), text: colors.accentMore }
      : { bg: colors.panel, border: colors.line, text: colors.inkMuted };

  return (
    <View style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: toneStyles.border, backgroundColor: toneStyles.bg, paddingHorizontal: spacing.sm, paddingVertical: 4 }}>
      <Text style={{ color: toneStyles.text, fontSize: 11, fontWeight: '800' }}>{label}</Text>
    </View>
  );
}

function AttachmentChips({ attachments, onOpen }) {
  if (!attachments?.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {attachments.map((attachment) => (
        <Pressable
          key={attachment.id || attachment.url}
          accessibilityRole="button"
          accessibilityLabel={`Open ${attachment.name || 'attachment'}`}
          onPress={() => onOpen?.(attachment)}
          style={{
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: '#d7d2ca',
            backgroundColor: '#fff',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.xs,
          }}
        >
          <Text style={{ color: '#221d15', fontSize: 12, fontWeight: '700' }}>{attachment.name || 'Attachment'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ResponseFieldValueSummary({ entry, colors, onOpenAttachment }) {
  const values = (entry?.responseFieldValues || []).filter((value) => {
    const hasRichText = !!stripHtml(value.richTextContent);
    const hasFile = !!value.fileUrl;
    return hasRichText || hasFile;
  });

  if (values.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      {values.map((value, index) => {
        const field = resolveField(value.field);
        const label = field?.label || 'Response';
        return (
          <View key={value.id || `${label}-${index}`} style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md, gap: spacing.xs }}>
            <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{label}</Text>
            {stripHtml(value.richTextContent) ? (
              <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 18 }}>{stripHtml(value.richTextContent)}</Text>
            ) : null}
            {value.fileUrl ? (
              <AttachmentChips
                attachments={[
                  {
                    id: value.id || `response-${index}`,
                    name: value.fileName || 'Response file',
                    type: value.fileType || '',
                    url: value.fileUrl,
                    thumbnailUrl: value.thumbnailUrl || null,
                  },
                ]}
                onOpen={onOpenAttachment}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function FeedbackReplies({ replies, colors, onOpenAttachment }) {
  const visibleReplies = getTaskUpdateFeedbackReplies(replies);
  if (!visibleReplies.length) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      {visibleReplies.map((reply) => {
        const gradeType = resolveGradeType(reply);
        const gradeLabel =
          reply.gradeNumericValue != null
            ? gradeType
              ? formatGradeDisplay(reply.gradeNumericValue, gradeType)
              : reply.gradeDisplayValue || String(reply.gradeNumericValue)
            : reply.gradeDisplayValue || '';
        const hasStateTransition = taskUpdateHasStateTransition(reply);
        const fromState = reply.fromState ? getTaskStatusLabel(reply.fromState) : null;
        const toState = reply.toState ? getTaskStatusLabel(reply.toState) : null;

        return (
          <View key={reply.id} style={{ borderRadius: radii.md, borderWidth: 1, borderColor: withAlpha(colors.accentMore, 0.24), backgroundColor: withAlpha(colors.accentMore, 0.08), padding: spacing.md, gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {getTaskUpdateActorName(reply) ? <Text style={{ color: colors.accentMore, fontSize: 12, fontWeight: '800' }}>{getTaskUpdateActorName(reply)}</Text> : null}
              {reply.createdAt ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>{formatTimestamp(reply.createdAt)}</Text> : null}
            </View>
            {hasStateTransition && toState ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, alignItems: 'center' }}>
                <StatusPill
                  colors={colors}
                  label={toState}
                  tone={reply.toState === 'done' ? 'success' : reply.toState === 'needs_review' ? 'warning' : reply.toState === 'blocked' ? 'danger' : reply.toState === 'in_progress' ? 'accent' : 'neutral'}
                />
                {fromState && fromState !== toState ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>from {fromState}</Text> : null}
              </View>
            ) : null}
            {gradeLabel ? <Text style={{ color: colors.success, fontSize: 13, fontWeight: '800' }}>Grade: {gradeLabel}</Text> : null}
            {reply.note ? <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 18 }}>{reply.note}</Text> : null}
            <AttachmentChips attachments={reply.attachments || []} onOpen={onOpenAttachment} />
          </View>
        );
      })}
    </View>
  );
}

function UpdateHistoryList({ task, colors, onOpenAttachment }) {
  const updates = getTaskHistoryEntries(task?.updates || []);
  const updatesById = new Map((task?.updates || []).map((entry) => [entry.id, entry]));
  if (!updates.length) {
    return (
      <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', backgroundColor: withAlpha(colors.ink, 0.03), padding: spacing.md }}>
        <Text style={{ color: colors.inkMuted, fontSize: 12 }}>No saved task updates yet.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {updates.map((entry) => {
        const gradeType = resolveGradeType(entry);
        const gradeLabel =
          entry.gradeNumericValue != null
            ? gradeType
              ? formatGradeDisplay(entry.gradeNumericValue, gradeType)
              : entry.gradeDisplayValue || String(entry.gradeNumericValue)
            : entry.gradeDisplayValue || '';
        const replyToId = getTaskUpdateReplyToId(entry);
        const replyTarget = replyToId ? updatesById.get(replyToId) || null : null;
        const replyTargetActorName = getTaskUpdateActorName(replyTarget);
        const isStatusOnlyReply = !!replyToId && !taskUpdateHasMeaningfulFeedbackContent(entry);
        const fromState = entry.fromState ? getTaskStatusLabel(entry.fromState) : null;
        const toState = entry.toState ? getTaskStatusLabel(entry.toState) : getTaskStatusLabel('not_started');
        return (
          <View key={entry.id} style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md, gap: spacing.xs }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {replyToId && !isStatusOnlyReply ? <StatusPill colors={colors} label="Feedback" tone="accent" /> : null}
              <StatusPill colors={colors} label={toState} tone={entry.toState === 'done' ? 'success' : entry.toState === 'needs_review' ? 'warning' : entry.toState === 'blocked' ? 'danger' : entry.toState === 'in_progress' ? 'accent' : 'neutral'} />
              {fromState && toState && fromState !== toState ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>from {fromState}</Text> : null}
              {getTaskUpdateActorName(entry) ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>by {getTaskUpdateActorName(entry)}</Text> : null}
              {getTaskUpdateAffectedName(entry) && getTaskUpdateAffectedName(entry) !== getTaskUpdateActorName(entry) ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>for {getTaskUpdateAffectedName(entry)}</Text> : null}
              {replyTargetActorName && !isStatusOnlyReply ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>on {replyTargetActorName}'s response</Text> : null}
              {entry.createdAt ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>{formatTimestamp(entry.createdAt)}</Text> : null}
            </View>
            {gradeLabel ? <Text style={{ color: colors.success, fontSize: 13, fontWeight: '800' }}>Grade: {gradeLabel}</Text> : null}
            {entry.note ? <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 18 }}>{entry.note}</Text> : null}
            <ResponseFieldValueSummary entry={entry} colors={colors} onOpenAttachment={onOpenAttachment} />
            <AttachmentChips attachments={entry.attachments || []} onOpen={onOpenAttachment} />
            {!replyToId ? <FeedbackReplies replies={entry.replies} colors={colors} onOpenAttachment={onOpenAttachment} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function FieldFileButtons({ type, onPickDocument, onPickLibrary, onCapturePhoto, onCaptureVideo }) {
  const buttons = [];
  if (type === 'photo') {
    buttons.push({ key: 'library', label: 'Library', onPress: onPickLibrary });
    buttons.push({ key: 'camera', label: 'Camera', onPress: onCapturePhoto });
  } else if (type === 'video') {
    buttons.push({ key: 'library', label: 'Library', onPress: onPickLibrary });
    buttons.push({ key: 'camera', label: 'Video', onPress: onCaptureVideo });
  } else {
    buttons.push({ key: 'files', label: 'Choose File', onPress: onPickDocument });
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {buttons.map((button) => (
        <Pressable
          key={button.key}
          accessibilityRole="button"
          accessibilityLabel={button.label}
          onPress={() => {
            void button.onPress?.();
          }}
          style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: '#d7d2ca', backgroundColor: '#fff', paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
        >
          <Text style={{ color: '#221d15', fontSize: 12, fontWeight: '700' }}>{button.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function TaskResponseFieldInputCard({ field, value, colors, onChangeValue, onOpenAttachment }) {
  async function uploadFieldFiles(files) {
    if (!files?.length) return;
    const uploaded = await uploadPendingAttachments(files, id);
    const attachment = uploaded[0];
    if (!attachment) return;

    onChangeValue(field.id, {
      fieldId: field.id,
      existingValueId: value?.existingValueId || null,
      richTextContent: value?.richTextContent || null,
      fileUrl: attachment.url,
      fileName: attachment.name,
      fileType: attachment.type,
      fileSizeBytes: attachment.sizeBytes ?? null,
      thumbnailUrl: attachment.thumbnailUrl || null,
    });
  }

  async function pickDocument() {
    const files = await pickAttachmentDocuments();
    await uploadFieldFiles(files.slice(0, 1));
  }

  async function pickLibrary() {
    const files = await pickLibraryMedia();
    const filtered = files.filter((file) => {
      if (field.type === 'photo') return file.kind === 'image';
      if (field.type === 'video') return file.kind === 'video';
      return true;
    });
    await uploadFieldFiles(filtered.slice(0, 1));
  }

  async function capturePhoto() {
    const files = await captureCameraImage();
    await uploadFieldFiles(files.slice(0, 1));
  }

  async function captureVideo() {
    const files = await captureCameraVideo();
    await uploadFieldFiles(files.slice(0, 1));
  }

  return (
    <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md, gap: spacing.sm }}>
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '800' }}>
          {field.label || 'Response'}
          {field.required ? ' *' : ''}
        </Text>
        {field.description ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>{field.description}</Text> : null}
      </View>
      {field.type === 'rich_text' ? (
        <RichTextHtmlEditor
          value={value?.richTextContent || ''}
          onChange={(content) =>
            onChangeValue(field.id, {
              fieldId: field.id,
              existingValueId: value?.existingValueId || null,
              richTextContent: content,
              fileUrl: value?.fileUrl || null,
              fileName: value?.fileName || null,
              fileType: value?.fileType || null,
            })
          }
        />
      ) : value?.fileUrl ? (
        <View style={{ gap: spacing.sm }}>
          <AttachmentChips
            attachments={[
              {
                id: value.existingValueId || field.id,
                name: value.fileName || RESPONSE_FIELD_TYPE_LABELS[field.type] || 'Response file',
                type: value.fileType || '',
                url: value.fileUrl,
                thumbnailUrl: value.thumbnailUrl || null,
              },
            ]}
            onOpen={onOpenAttachment}
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <FieldFileButtons
              type={field.type}
              onPickDocument={pickDocument}
              onPickLibrary={pickLibrary}
              onCapturePhoto={capturePhoto}
              onCaptureVideo={captureVideo}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Clear ${field.label}`}
              onPress={() =>
                onChangeValue(field.id, {
                  fieldId: field.id,
                  existingValueId: value?.existingValueId || null,
                  richTextContent: value?.richTextContent || null,
                  fileUrl: null,
                  fileName: null,
                  fileType: null,
                  thumbnailUrl: null,
                })
              }
              style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: withAlpha(colors.danger, 0.28), backgroundColor: withAlpha(colors.danger, 0.08), paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
            >
              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <FieldFileButtons
          type={field.type}
          onPickDocument={pickDocument}
          onPickLibrary={pickLibrary}
          onCapturePhoto={capturePhoto}
          onCaptureVideo={captureVideo}
        />
      )}
    </View>
  );
}

function TaskUpdateComposerCard({
  db,
  task,
  series,
  chore,
  allTasks,
  selectedDateKey,
  currentUser,
  gradeTypes,
  colors,
  onSaved,
}) {
  const isParentReviewer = currentUser?.role === 'parent';
  const owner = firstRef(series?.familyMember);
  const currentState = getTaskWorkflowState(task);
  const submissions = useMemo(() => getTaskResponseSubmissions(task?.updates || []), [task?.updates]);
  const canShowFeedbackMode = isParentReviewer && submissions.length > 0;
  const [parentPanelMode, setParentPanelMode] = useState(getDefaultParentPanelMode(currentState, canShowFeedbackMode));
  const reviewMode = canShowFeedbackMode && parentPanelMode === 'feedback';
  const [selectedSubmissionIndex, setSelectedSubmissionIndex] = useState(0);
  const [noteMode, setNoteMode] = useState('feedback');
  const [selectedState, setSelectedState] = useState(getTaskWorkflowState(task));
  const [note, setNote] = useState('');
  const [showGrade, setShowGrade] = useState(false);
  const [gradeValue, setGradeValue] = useState('');
  const [selectedGradeTypeId, setSelectedGradeTypeId] = useState(gradeTypes?.[0]?.id || null);
  const [fieldValues, setFieldValues] = useState({});
  const [files, setFiles] = useState([]);
  const [restoreTiming, setRestoreTiming] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const draftTimerRef = useRef(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioRecorderState = useAudioRecorderState(audioRecorder, 200);
  const latestUpdate = useMemo(() => sortTaskUpdates((task?.updates || []).filter((entry) => !entry.isDraft))[0] || null, [task?.updates]);
  const selectedSubmission = reviewMode ? submissions[selectedSubmissionIndex] || null : null;

  useEffect(() => {
    setParentPanelMode(getDefaultParentPanelMode(currentState, canShowFeedbackMode));
  }, [task?.id, currentState, canShowFeedbackMode]);

  useEffect(() => {
    if (selectedSubmissionIndex < submissions.length) return;
    setSelectedSubmissionIndex(0);
  }, [selectedSubmissionIndex, submissions.length]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateDraft() {
      const draft = await loadTaskUpdateDraft(task?.id);
      if (cancelled || !draft) return;
      if (draft.selectedState) setSelectedState(draft.selectedState);
      if (typeof draft.note === 'string') setNote(draft.note);
      if (typeof draft.gradeValue === 'string') setGradeValue(draft.gradeValue);
      if (draft.selectedGradeTypeId) setSelectedGradeTypeId(draft.selectedGradeTypeId);
      setShowGrade(!!draft.showGrade);
      if (draft.noteMode) setNoteMode(draft.noteMode);
      if (draft.fieldValues && typeof draft.fieldValues === 'object') {
        setFieldValues((current) => ({
          ...current,
          ...draft.fieldValues,
        }));
      }
    }

    setSelectedState(getTaskWorkflowState(task));
    setNote('');
    setShowGrade(false);
    setGradeValue('');
    setSelectedGradeTypeId(gradeTypes?.[0]?.id || null);
    setNoteMode('feedback');
    setParentPanelMode(getDefaultParentPanelMode(getTaskWorkflowState(task), isParentReviewer && submissions.length > 0));
    setFiles([]);
    setRestoreTiming(null);
    setSelectedSubmissionIndex(0);

    const sourceEntry = latestUpdate;
    const initialValues = {};
    for (const value of sourceEntry?.responseFieldValues || []) {
      const field = resolveField(value.field);
      if (!field?.id) continue;
      initialValues[field.id] = {
        fieldId: field.id,
        existingValueId: value.id,
        richTextContent: value.richTextContent || null,
        fileUrl: value.fileUrl || null,
        fileName: value.fileName || null,
        fileType: value.fileType || null,
        thumbnailUrl: value.thumbnailUrl || null,
      };
    }
    setFieldValues(initialValues);
    void hydrateDraft();

    return () => {
      cancelled = true;
    };
  }, [gradeTypes, isParentReviewer, latestUpdate, submissions.length, task]);

  useEffect(() => {
    const hasDraftContent =
      (note || '').trim().length > 0 ||
      selectedState !== getTaskWorkflowState(task) ||
      showGrade ||
      (gradeValue || '').trim().length > 0 ||
      Object.values(fieldValues).some((value) => !!stripHtml(value?.richTextContent) || !!value?.fileUrl);

    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }

    if (!hasDraftContent) {
      void clearTaskUpdateDraft(task?.id);
      return undefined;
    }

    draftTimerRef.current = setTimeout(() => {
      void saveTaskUpdateDraft(task?.id, {
        selectedState,
        note,
        showGrade,
        gradeValue,
        selectedGradeTypeId,
        noteMode,
        fieldValues,
        savedAt: Date.now(),
      });
    }, 600);

    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [fieldValues, gradeValue, note, noteMode, selectedGradeTypeId, selectedState, showGrade, task]);

  const selectedGradeType = (gradeTypes || []).find((gradeType) => gradeType.id === selectedGradeTypeId) || null;
  const filledFieldIds = useMemo(() => {
    const ids = new Set();
    Object.values(fieldValues).forEach((value) => {
      const hasRichText = !!stripHtml(value.richTextContent);
      const hasFile = !!value.fileUrl;
      if (hasRichText || hasFile) ids.add(value.fieldId);
    });
    return ids;
  }, [fieldValues]);

  const validation = useMemo(
    () =>
      validateUpdateSubmission({
        toState: selectedState,
        requiredResponseFields: (task?.responseFields || []).filter((field) => field.required),
        filledFieldIds,
        isParentReviewingExistingSubmission: isParentReviewer,
      }),
    [filledFieldIds, isParentReviewer, selectedState, task?.responseFields]
  );

  async function pickEvidenceFiles() {
    const picked = await pickAttachmentDocuments();
    if (picked.length) {
      setFiles((current) => [...current, ...picked]);
    }
  }

  async function pickEvidenceLibrary() {
    const picked = await pickLibraryMedia();
    if (picked.length) {
      setFiles((current) => [...current, ...picked]);
    }
  }

  async function captureEvidencePhoto() {
    const picked = await captureCameraImage();
    if (picked.length) {
      setFiles((current) => [...current, ...picked]);
    }
  }

  async function captureEvidenceVideo() {
    const picked = await captureCameraVideo();
    if (picked.length) {
      setFiles((current) => [...current, ...picked]);
    }
  }

  async function toggleAudioRecording() {
    if (audioRecorderState.isRecording) {
      try {
        await audioRecorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        const recordedFile = createRecordedAudioAttachment({
          uri: audioRecorder.uri || audioRecorderState.uri,
          durationMillis: audioRecorderState.durationMillis,
        });
        if (recordedFile?.uri) {
          setFiles((current) => [...current, recordedFile]);
        }
      } catch (error) {
        Alert.alert('Unable to stop recording', error?.message || 'Please try again.');
      }
      return;
    }

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone required', 'Allow microphone access to record audio evidence.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
    } catch (error) {
      Alert.alert('Unable to record audio', error?.message || 'Please try again.');
    }
  }

  async function handleSubmit() {
    if (!currentUser?.id) {
      Alert.alert('Login required', 'Choose a family member before updating task status.');
      return;
    }
    if (validation && !validation.valid) {
      return;
    }

    const nextState = validation?.routedState || selectedState;
    const replyToUpdateId =
      reviewMode && noteMode === 'feedback' && selectedSubmission?.update?.id
        ? selectedSubmission.update.id
        : null;

    const grade =
      showGrade && selectedGradeType && Number.isFinite(Number(gradeValue))
        ? {
            numericValue: Number(gradeValue),
            displayValue: gradeValue,
            gradeTypeId: selectedGradeType.id,
            isProvisional: false,
          }
        : null;

    setIsSaving(true);
    try {
      const attachments = files.length ? await uploadPendingAttachments(files, id) : [];
      const { transactions } = buildTaskUpdateTransactions({
        tx,
        createId: id,
        taskId: task.id,
        allTasks,
        nextState,
        selectedDateKey,
        note: note.trim() || undefined,
        actorFamilyMemberId: currentUser.id,
        affectedFamilyMemberId: owner?.id || currentUser.id,
        restoreTiming,
        schedule: chore
          ? {
              startDate: chore.startDate,
              rrule: chore.rrule || null,
              exdates: chore.exdates || null,
            }
          : null,
        referenceDate: parseDateKey(selectedDateKey),
        attachments,
        responseFieldValues: Object.values(fieldValues),
        grade,
        taskSeriesId: series?.id || null,
        choreId: chore?.id || null,
        replyToUpdateId,
      });

      await db.transact(transactions);
    } catch (error) {
      try {
        // Use the shared db from session if available.
        await onSaved?.(error);
      } catch {
        // no-op
      }
      Alert.alert('Unable to update task', error?.message || 'Please try again.');
      setIsSaving(false);
      return;
    }

    await clearTaskUpdateDraft(task.id);
    setFiles([]);
    setNote('');
    setShowGrade(false);
    setGradeValue('');
    setRestoreTiming(null);
    onSaved?.();
    setIsSaving(false);
  }

  function onChangeFieldValue(fieldId, nextValue) {
    setFieldValues((current) => ({
      ...current,
      [fieldId]: nextValue,
    }));
  }

  const latestResponseThread = getLatestTaskResponseThread(task);
  const ownerName = owner?.name || 'Task owner';

  return (
    <View style={{ gap: spacing.md }}>
      {canShowFeedbackMode ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[
            { key: 'response', label: 'Submit response' },
            { key: 'feedback', label: 'Feedback on previous response' },
          ].map((mode) => {
            const active = parentPanelMode === mode.key;
            return (
              <Pressable
                key={mode.key}
                accessibilityRole="button"
                accessibilityLabel={mode.label}
                onPress={() => setParentPanelMode(mode.key)}
                style={{ flex: 1, borderRadius: radii.pill, borderWidth: 1, borderColor: active ? colors.accentMore : colors.line, backgroundColor: active ? colors.accentMore : colors.panel, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' }}
              >
                <Text style={{ color: active ? colors.onAccent : colors.inkMuted, fontWeight: '800', fontSize: 12 }}>{mode.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {reviewMode ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {['feedback', 'general'].map((mode) => {
              const active = noteMode === mode;
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="button"
                  accessibilityLabel={mode === 'feedback' ? 'Feedback on a response' : 'General task update'}
                  onPress={() => setNoteMode(mode)}
                  style={{ flex: 1, borderRadius: radii.pill, borderWidth: 1, borderColor: active ? colors.accentMore : colors.line, backgroundColor: active ? colors.accentMore : colors.panel, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center' }}
                >
                  <Text style={{ color: active ? colors.onAccent : colors.inkMuted, fontWeight: '800', fontSize: 12 }}>
                    {mode === 'feedback' ? 'Feedback on a response' : 'General task update'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {noteMode === 'feedback' && selectedSubmission ? (
            <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: withAlpha(colors.accentMore, 0.24), backgroundColor: withAlpha(colors.accentMore, 0.06), padding: spacing.md, gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.accentMore, fontSize: 12, fontWeight: '800' }}>
                    {`${getTaskUpdateActorName(selectedSubmission.update) || ownerName}'s response`}
                  </Text>
                  {selectedSubmission.update.createdAt ? <Text style={{ color: colors.inkMuted, fontSize: 12 }}>{formatTimestamp(selectedSubmission.update.createdAt)}</Text> : null}
                </View>
                {submissions.length > 1 ? (
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <Pressable onPress={() => setSelectedSubmissionIndex((index) => Math.max(0, index - 1))} style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
                      <Text style={{ color: colors.accentMore, fontWeight: '800' }}>Prev</Text>
                    </Pressable>
                    <Pressable onPress={() => setSelectedSubmissionIndex((index) => Math.min(submissions.length - 1, index + 1))} style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
                      <Text style={{ color: colors.accentMore, fontWeight: '800' }}>Next</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {selectedSubmission.update.note ? <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 18 }}>{selectedSubmission.update.note}</Text> : null}
              <ResponseFieldValueSummary entry={selectedSubmission.update} colors={colors} onOpenAttachment={setPreviewAttachment} />
              <AttachmentChips attachments={selectedSubmission.update.attachments || []} onOpen={setPreviewAttachment} />
              <FeedbackReplies replies={selectedSubmission.update.replies} colors={colors} onOpenAttachment={setPreviewAttachment} />
            </View>
          ) : null}
        </View>
      ) : latestResponseThread ? (
        <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: withAlpha(colors.accentMore, 0.24), backgroundColor: withAlpha(colors.accentMore, 0.06), padding: spacing.md, gap: spacing.sm }}>
          <Text style={{ color: colors.accentMore, fontSize: 12, fontWeight: '800' }}>Latest response</Text>
          {latestResponseThread.submission.note ? <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 18 }}>{latestResponseThread.submission.note}</Text> : null}
          <ResponseFieldValueSummary entry={latestResponseThread.submission} colors={colors} onOpenAttachment={setPreviewAttachment} />
          <FeedbackReplies replies={latestResponseThread.feedbackReplies} colors={colors} onOpenAttachment={setPreviewAttachment} />
        </View>
      ) : null}

      {(reviewMode ? noteMode === 'general' : true) && (task.responseFields || []).length ? (
        <View style={{ gap: spacing.sm }}>
          {(task.responseFields || []).slice().sort((left, right) => (left.order || 0) - (right.order || 0)).map((field) => (
            <TaskResponseFieldInputCard
              key={field.id}
              field={field}
              value={fieldValues[field.id]}
              colors={colors}
              onChangeValue={onChangeFieldValue}
              onOpenAttachment={setPreviewAttachment}
            />
          ))}
        </View>
      ) : null}

      {reviewMode ? (
        <TextInput
          multiline
          value={note}
          onChangeText={setNote}
          placeholder={noteMode === 'feedback' ? 'Add feedback for this response…' : getTaskProgressPlaceholder(selectedState)}
          placeholderTextColor={withAlpha(colors.ink, 0.34)}
          style={{
            minHeight: 110,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.panel,
            color: colors.ink,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            textAlignVertical: 'top',
          }}
        />
      ) : (
        <TextInput
          multiline
          value={note}
          onChangeText={setNote}
          placeholder={getTaskProgressPlaceholder(selectedState)}
          placeholderTextColor={withAlpha(colors.ink, 0.34)}
          style={{
            minHeight: 110,
            borderRadius: radii.md,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.panel,
            color: colors.ink,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            textAlignVertical: 'top',
          }}
        />
      )}

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {buildTaskStatusOptions(task, isParentReviewer).map((state) => {
            const active = selectedState === state;
            const stateLabel = getTaskUpdateStateLabel(currentState, state, {
              isReviewMode: reviewMode,
            });
            return (
              <Pressable
                key={state}
                accessibilityRole="button"
                accessibilityLabel={`Set task state to ${stateLabel}`}
                onPress={() => setSelectedState(state)}
                style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: active ? colors.accentMore : colors.line, backgroundColor: active ? colors.accentMore : colors.panel, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
              >
                <Text style={{ color: active ? colors.onAccent : colors.inkMuted, fontSize: 12, fontWeight: '800' }}>{stateLabel}</Text>
              </Pressable>
            );
          })}
          {isParentReviewer && gradeTypes?.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showGrade ? 'Hide grade input' : 'Add grade'}
              onPress={() => setShowGrade((current) => !current)}
              style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: withAlpha(colors.success, 0.28), backgroundColor: withAlpha(colors.success, showGrade ? 0.18 : 0.08), paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
            >
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: '800' }}>{showGrade ? 'Hide grade' : 'Add grade'}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {showGrade && selectedGradeType ? (
        <View style={{ gap: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: withAlpha(colors.success, 0.26), backgroundColor: withAlpha(colors.success, 0.08), padding: spacing.md }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {(gradeTypes || []).map((gradeType) => {
              const active = selectedGradeTypeId === gradeType.id;
              return (
                <Pressable
                  key={gradeType.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${gradeType.name}`}
                  onPress={() => setSelectedGradeTypeId(gradeType.id)}
                  style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: active ? colors.success : colors.line, backgroundColor: active ? colors.success : colors.panel, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
                >
                  <Text style={{ color: active ? colors.onAccent : colors.inkMuted, fontSize: 12, fontWeight: '800' }}>{gradeType.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <TextInput
            value={gradeValue}
            onChangeText={setGradeValue}
            keyboardType="numeric"
            placeholder={`${selectedGradeType.lowValue}–${selectedGradeType.highValue}`}
            placeholderTextColor={withAlpha(colors.ink, 0.34)}
            style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, color: colors.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}
          />
        </View>
      ) : null}

      {(currentState === 'blocked' || currentState === 'skipped' || currentState === 'needs_review') ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Restore Timing</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {[
              { key: 'now', label: 'Restore now' },
              { key: 'next_scheduled', label: 'Next scheduled day' },
            ].map((option) => {
              const active = restoreTiming === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  onPress={() => setRestoreTiming(option.key)}
                  style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: active ? colors.warning : colors.line, backgroundColor: active ? withAlpha(colors.warning, 0.16) : colors.panel, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
                >
                  <Text style={{ color: active ? colors.warning : colors.inkMuted, fontSize: 12, fontWeight: '800' }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text style={{ color: colors.inkMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Evidence</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
          {[
            { key: 'files', label: 'Files', onPress: pickEvidenceFiles },
            { key: 'library', label: 'Library', onPress: pickEvidenceLibrary },
            { key: 'photo', label: 'Photo', onPress: captureEvidencePhoto },
            { key: 'video', label: 'Video', onPress: captureEvidenceVideo },
            { key: 'audio', label: audioRecorderState.isRecording ? `Stop ${Math.round((audioRecorderState.durationMillis || 0) / 1000)}s` : 'Audio', onPress: toggleAudioRecording },
          ].map((action) => (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              accessibilityLabel={`Add ${action.label}`}
              onPress={() => {
                void action.onPress?.();
              }}
              style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
            >
              <Text style={{ color: colors.inkMuted, fontSize: 12, fontWeight: '800' }}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {files.length ? (
          <View style={{ gap: spacing.sm }}>
            {files.map((file, index) => (
              <View key={`${file.name}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{file.name}</Text>
                  <Text style={{ color: colors.inkMuted, fontSize: 12 }}>{file.kind || 'file'}</Text>
                </View>
                <Pressable onPress={() => setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))}>
                  <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed', backgroundColor: withAlpha(colors.ink, 0.03), padding: spacing.md }}>
            <Text style={{ color: colors.inkMuted, fontSize: 12 }}>Attach photos, documents, audio, or video for this update.</Text>
          </View>
        )}
      </View>

      {validation && !validation.valid ? (
        <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: withAlpha(colors.warning, 0.28), backgroundColor: withAlpha(colors.warning, 0.08), padding: spacing.md }}>
          <Text style={{ color: colors.warning, fontSize: 12, lineHeight: 17 }}>{validation.message}</Text>
        </View>
      ) : null}
      {validation?.routedState ? (
        <View style={{ borderRadius: radii.md, borderWidth: 1, borderColor: withAlpha(colors.accentMore, 0.28), backgroundColor: withAlpha(colors.accentMore, 0.08), padding: spacing.md }}>
          <Text style={{ color: colors.accentMore, fontSize: 12, lineHeight: 17 }}>{validation.message}</Text>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save task update"
        disabled={isSaving || audioRecorderState.isRecording || Boolean(validation && !validation.valid)}
        onPress={() => {
          void handleSubmit();
        }}
        style={{ borderRadius: radii.pill, borderWidth: 1, borderColor: colors.accentMore, backgroundColor: colors.accentMore, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'center', justifyContent: 'center', opacity: isSaving || audioRecorderState.isRecording || (validation && !validation.valid) ? 0.5 : 1 }}
      >
        <Text style={{ color: colors.onAccent, fontSize: 13, fontWeight: '800' }}>
          {audioRecorderState.isRecording ? 'Stop recording first' : isSaving ? 'Saving…' : `Submit as ${getTaskStatusLabel(validation?.routedState || selectedState)}`}
        </Text>
      </Pressable>

      <AttachmentPreviewModal attachment={previewAttachment} visible={!!previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </View>
  );
}

export function TaskSeriesTaskScreen() {
  const params = useLocalSearchParams();
  const taskId = firstParam(params.taskId);
  const seriesId = firstParam(params.seriesId);
  const choreId = firstParam(params.choreId);
  const selectedDateKey = toDateKey(firstParam(params.date));
  const reviewMode = firstParam(params.review) === '1';
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
          gradeTypes: {
            $: { order: { createdAt: 'asc' } },
          },
        }
      : null
  );

  const context = useMemo(() => {
    const chores = query.data?.chores || [];
    for (const chore of chores) {
      if (choreId && chore.id !== choreId) continue;
      for (const series of chore.taskSeries || []) {
        if (seriesId && series.id !== seriesId) continue;
        const task = (series.tasks || []).find((candidate) => candidate.id === taskId);
        if (task) {
          return {
            chore,
            series,
            task,
            allTasks: (series.tasks || []).slice().sort((left, right) => (left.order || 0) - (right.order || 0)),
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
      <SubscreenScaffold title="Task" subtitle="The selected task could not be found." accent={colors.accentMore}>
        <View style={styles.card}>
          <Text style={styles.body}>Pick a task from the dashboard, review queue, or task-series manager and try again.</Text>
        </View>
      </SubscreenScaffold>
    );
  }

  const latestUpdate = sortTaskUpdates((context.task.updates || []).filter((entry) => !entry.isDraft))[0] || null;

  return (
    <SubscreenScaffold
      title={context.task.text || 'Task'}
      subtitle={context.series?.name ? `${context.series.name} • ${context.chore?.title || 'Task series'}` : context.chore?.title || 'Task details'}
      accent={colors.accentMore}
      statusChips={[
        { label: getTaskStatusLabel(getTaskWorkflowState(context.task)), tone: 'neutral' },
        reviewMode ? { label: 'Review mode', tone: 'accent' } : null,
        owner?.name ? { label: owner.name, tone: 'accent' } : { label: principalType === 'parent' ? 'Parent mode' : 'Kid mode', tone: 'neutral' },
      ].filter(Boolean)}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          <View style={[styles.gridItem, width < 960 && { flexBasis: '100%' }]}>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>Overview</Text>
              <Text style={styles.sectionTitle}>{context.task.text || 'Task'}</Text>
              {context.task.notes ? <Text style={styles.body}>{context.task.notes}</Text> : null}
              <View style={styles.grid}>
                <View style={styles.gridItem}>
                  <Text style={styles.tinyLabel}>Current State</Text>
                  <Text style={styles.tinyValue}>{getTaskStatusLabel(getTaskWorkflowState(context.task))}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.tinyLabel}>For Date</Text>
                  <Text style={styles.tinyValue}>{formatTaskDateLabel(selectedDateKey) || formatDateLabel(selectedDateKey)}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.tinyLabel}>Owner</Text>
                  <Text style={styles.tinyValue}>{owner?.name || currentUser?.name || 'Unknown'}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.tinyLabel}>Current Block</Text>
                  <Text style={styles.tinyValue}>{scheduledTasks.filter((task) => !task.isDayBreak).length} active tasks</Text>
                </View>
              </View>
              {latestUpdate?.note ? (
                <View style={styles.mutedBox}>
                  <Text style={styles.eyebrow}>Latest Activity</Text>
                  <Text style={[styles.body, { color: colors.ink }]}>{latestUpdate.note}</Text>
                </View>
              ) : null}
              <View style={styles.taskActionRow}>
                <Pressable
                  onPress={() =>
                    openTaskSeriesChecklist({
                      seriesId: context.series.id,
                      choreId: context.chore.id,
                      date: selectedDateKey,
                      memberId: owner?.id || '',
                    })
                  }
                  style={styles.button}
                >
                  <Text style={styles.buttonText}>Checklist</Text>
                </Pressable>
                <Pressable onPress={() => openTaskHistory({ seriesId: context.series.id, taskId: context.task.id, title: context.task.text || 'Task History' })} style={styles.button}>
                  <Text style={styles.buttonText}>History</Text>
                </Pressable>
                <Pressable onPress={() => void openTaskSeriesDiscussion({ seriesId: context.series.id, seriesName: context.series.name })} style={styles.button}>
                  <Text style={styles.buttonText}>Discussion</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>Task Update</Text>
              <Text style={styles.sectionTitle}>Respond, review, and grade</Text>
              <TaskUpdateComposerCard
                task={context.task}
                series={context.series}
                chore={context.chore}
                allTasks={context.allTasks}
                selectedDateKey={selectedDateKey}
                currentUser={{ ...currentUser, db }}
                gradeTypes={query.data?.gradeTypes || []}
                colors={colors}
                db={db}
                onSaved={() => {
                  Alert.alert('Task updated', 'The task update was saved.');
                }}
              />
            </View>
          </View>
          <View style={[styles.gridItem, width < 960 && { flexBasis: '100%' }]}>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>Reference</Text>
              <Text style={styles.sectionTitle}>Instructions and files</Text>
              {context.task.notes ? <Text style={styles.body}>{context.task.notes}</Text> : <Text style={styles.body}>No saved task notes yet.</Text>}
              <AttachmentChips attachments={context.task.attachments || []} onOpen={setPreviewAttachment} />
            </View>
            <View style={styles.card}>
              <Text style={styles.eyebrow}>History</Text>
              <Text style={styles.sectionTitle}>Updates, responses, and feedback</Text>
              <UpdateHistoryList task={context.task} colors={colors} onOpenAttachment={setPreviewAttachment} />
            </View>
          </View>
        </View>
      </ScrollView>
      <AttachmentPreviewModal attachment={previewAttachment} visible={!!previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </SubscreenScaffold>
  );
}

export function TaskSeriesMemberOverviewScreen() {
  const params = useLocalSearchParams();
  const memberId = firstParam(params.memberId);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
          familyMembers: {},
        }
      : null
  );

  const selectedMemberId = memberId || currentUser?.id || familyMembers?.[0]?.id || '';
  const todayKey = toDateKey(new Date());
  const memberName = (query.data?.familyMembers || familyMembers || []).find((member) => member.id === selectedMemberId)?.name || currentUser?.name || 'Member';
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
    setUndoState({
      seriesId: item.series.id,
      historyEventId: result.historyEventId,
      pullForwardCount: item.pullForwardCount + 1,
    });
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
    <SubscreenScaffold
      title={`${memberName}'s Task Series`}
      subtitle="Active, future, and finished task-series progress."
      accent={colors.accentDashboard}
      statusChips={[{ label: memberName, tone: 'accent' }]}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {undoState ? (
          <View style={styles.card}>
            <Text style={styles.body}>Tasks pulled forward.</Text>
            <Pressable testID="task-series-member-undo-pull" onPress={() => void handleUndo()} style={[styles.button, styles.buttonPrimary]}>
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Undo</Text>
            </Pressable>
          </View>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {[
            ['active_now', 'Active'],
            ['future', 'Future'],
            ['finished', 'Finished'],
            ['all', 'All'],
          ].map(([key, label]) => {
            const active = filter === key;
            return (
              <Pressable key={key} onPress={() => setFilter(key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {filteredItems.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>No task series match this filter.</Text>
          </View>
        ) : (
          filteredItems.map((item) => (
            <View key={item.series.id} style={styles.card}>
              <View style={styles.between}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{item.series.name || 'Untitled series'}</Text>
                  <Text style={styles.body}>
                    {firstRef(item.series.scheduledActivity)?.title || 'Task series'}
                    {item.nextPullDate ? ` • Next ${formatTaskDateLabel(item.nextPullDate)}` : ''}
                  </Text>
                </View>
                <StatusPill
                  colors={colors}
                  label={item.drift.label}
                  tone={item.drift.status === 'behind' ? 'warning' : item.drift.status === 'ahead' ? 'accent' : 'success'}
                />
              </View>
              <View style={styles.between}>
                <Text style={styles.tinyLabel}>Tasks {item.completedTasks}/{item.totalTasks}</Text>
                <Text style={styles.tinyLabel}>Days {item.completedBlocks}/{item.totalBlocks}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.max(8, item.totalTasks ? (item.completedTasks / item.totalTasks) * 100 : 8)}%` }]} />
              </View>
              {item.todayTasks.length ? (
                <View style={{ gap: spacing.sm }}>
                  <Text style={styles.eyebrow}>Current Tasks</Text>
                  {item.todayTasks.map((task) => (
                    <Pressable
                      key={task.id}
                      onPress={() =>
                        router.push({
                          pathname: '/task-series/task',
                          params: {
                            taskId: task.id,
                            seriesId: item.series.id,
                            choreId: firstRef(item.series.scheduledActivity)?.id || '',
                            date: toDateKey(new Date()),
                          },
                        })
                      }
                      style={styles.taskRow}
                    >
                      <View style={styles.between}>
                        <Text style={styles.taskTitle}>{task.text}</Text>
                        <Text style={styles.taskMeta}>{getTaskStatusLabel(getTaskWorkflowState(task))}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.taskActionRow}>
                <Pressable
                  testID={`task-series-member-open-checklist-${item.series.id}`}
                  onPress={() =>
                    openTaskSeriesChecklist({
                      seriesId: item.series.id,
                      choreId: firstRef(item.series.scheduledActivity)?.id || '',
                      date: todayKey,
                      memberId: selectedMemberId,
                    })
                  }
                  style={styles.button}
                >
                  <Text style={styles.buttonText}>Open Checklist</Text>
                </Pressable>
                <Pressable
                  testID={`task-series-member-open-history-${item.series.id}`}
                  onPress={() => openTaskHistory({ seriesId: item.series.id, title: item.series.name || 'Task Series History' })}
                  style={styles.button}
                >
                  <Text style={styles.buttonText}>History</Text>
                </Pressable>
                <Pressable
                  testID={`task-series-member-open-discussion-${item.series.id}`}
                  onPress={() => void openTaskSeriesDiscussion({ seriesId: item.series.id, seriesName: item.series.name })}
                  style={styles.button}
                >
                  <Text style={styles.buttonText}>Discussion</Text>
                </Pressable>
                {item.todayTasksFinished && item.canPull && item.nextPullDate ? (
                  <Pressable onPress={() => void handlePullForward(item)} style={[styles.button, styles.buttonPrimary]}>
                    <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Pull Forward</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SubscreenScaffold>
  );
}

export function TaskSeriesReviewScreen() {
  const params = useLocalSearchParams();
  const preselectedSeriesId = firstParam(params.seriesId);
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const { requireParentAction } = useParentActionGate();
  const { db, currentUser, isAuthenticated, instantReady, principalType } = useAppSession();
  const [view, setView] = useState(preselectedSeriesId ? 'all' : 'attention');
  const [filters, setFilters] = useState({
    status: 'all',
    familyMemberId: 'all',
    taskSeriesId: preselectedSeriesId || 'all',
    showNoted: false,
  });
  const sortMode = 'status';
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  const query = db.useQuery(
    isAuthenticated && instantReady && principalType === 'parent'
      ? {
          tasks: {
            updates: {
              actor: {},
              affectedPerson: {},
              responseFieldValues: { field: {} },
              gradeType: {},
              attachments: {},
              replyTo: {},
              replies: {
                actor: {},
                affectedPerson: {},
                attachments: {},
                gradeType: {},
              },
            },
            taskSeries: {
              familyMember: {},
              scheduledActivity: {},
            },
            responseFields: {},
          },
          familyMembers: {},
          taskSeries: {},
          gradeTypes: {},
        }
      : null
  );

  const effectiveFilters = view === 'all' ? { ...filters, showNoted: true } : filters;
  const entries = sortTaskBinEntries(buildTaskBinEntries(query.data?.tasks || [], effectiveFilters, toDateKey(new Date())), sortMode);
  const groups = groupByAttention(entries);
  const visibleEntries = view === 'attention' ? groups.needsAttention : groups.all;

  useEffect(() => {
    if (!isWide) return;
    if (!visibleEntries.length) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !visibleEntries.some((entry) => entry.task.id === selectedTaskId)) {
      setSelectedTaskId(visibleEntries[0].task.id);
    }
  }, [isWide, selectedTaskId, visibleEntries]);

  if (principalType !== 'parent') {
    return (
      <SubscreenScaffold title="Task Review" subtitle="Parent mode is required for the review queue." accent={colors.accentMore}>
        <ParentAccessNotice
          body="Log in as a parent to review task responses, grade work, and manage overdue items."
          onContinue={() =>
            requireParentAction({
              actionId: 'task-series:review',
              actionLabel: 'Task Review',
              payload: { href: '/more/task-series/review' },
              returnPath: '/more/task-series/review',
            })
          }
        />
      </SubscreenScaffold>
    );
  }

  async function handleNote(taskId, mode) {
    if (mode === 'clear') {
      await db.transact(buildClearNotedTransactions({ tx, taskId }));
      return;
    }

    if (mode === 'forever') {
      await db.transact(buildNotedTransactions({ tx, taskId, indefinitely: true }));
      return;
    }

    Alert.prompt?.(
      'Note until date',
      'Enter a YYYY-MM-DD date.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (value) => {
            const dateKey = toDateKey(value || new Date());
            await db.transact(buildNotedTransactions({ tx, taskId, notedUntilDate: dateKey, indefinitely: false }));
          },
        },
      ],
      'plain-text',
      toDateKey(new Date(Date.now() + 86400000))
    );
  }

  return (
    <SubscreenScaffold
      title="Task Review"
      subtitle="Needs attention, review, and grading."
      accent={colors.accentMore}
      statusChips={[
        { label: view === 'attention' ? `Needs attention ${groups.needsAttention.length}` : `All tasks ${groups.all.length}`, tone: 'accent' },
      ]}
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {[
            ['attention', 'Needs Attention'],
            ['all', 'All Tasks'],
          ].map(([key, label]) => {
            const active = view === key;
            return (
              <Pressable key={key} onPress={() => setView(key)} style={[styles.chip, active && styles.chipActive, { flex: 1 }]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {['all', 'needs_review', 'blocked', 'in_progress', 'not_started', 'skipped', 'done'].map((status) => {
            const active = filters.status === status;
            return (
              <Pressable key={status} onPress={() => setFilters((current) => ({ ...current, status }))} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{status === 'all' ? 'All' : getTaskStatusLabel(status)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable onPress={() => setFilters((current) => ({ ...current, familyMemberId: 'all' }))} style={[styles.chip, filters.familyMemberId === 'all' && styles.chipActive]}>
            <Text style={[styles.chipText, filters.familyMemberId === 'all' && styles.chipTextActive]}>All Members</Text>
          </Pressable>
          {(query.data?.familyMembers || []).map((member) => {
            const active = filters.familyMemberId === member.id;
            return (
              <Pressable key={member.id} onPress={() => setFilters((current) => ({ ...current, familyMemberId: member.id }))} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{member.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable onPress={() => setFilters((current) => ({ ...current, taskSeriesId: 'all' }))} style={[styles.chip, filters.taskSeriesId === 'all' && styles.chipActive]}>
            <Text style={[styles.chipText, filters.taskSeriesId === 'all' && styles.chipTextActive]}>All Series</Text>
          </Pressable>
          {(query.data?.taskSeries || []).map((series) => {
            const active = filters.taskSeriesId === series.id;
            return (
              <Pressable key={series.id} onPress={() => setFilters((current) => ({ ...current, taskSeriesId: series.id }))} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{series.name || 'Untitled series'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {view === 'attention' ? (
          <Pressable onPress={() => setFilters((current) => ({ ...current, showNoted: !current.showNoted }))} style={[styles.chip, filters.showNoted && styles.chipActive]}>
            <Text style={[styles.chipText, filters.showNoted && styles.chipTextActive]}>{filters.showNoted ? 'Hide noted tasks' : 'Show noted tasks'}</Text>
          </Pressable>
        ) : null}
        {visibleEntries.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>No review tasks match the current filters.</Text>
          </View>
        ) : isWide ? (
          <View style={styles.splitRow}>
            <View style={styles.listColumn}>
              {visibleEntries.map((entry) => {
                const series = firstRef(entry.task.taskSeries);
                const owner = firstRef(series?.familyMember);
                return (
                  <Pressable
                    key={entry.task.id}
                    onPress={() => setSelectedTaskId(entry.task.id)}
                    style={[
                      styles.card,
                      selectedTaskId === entry.task.id && {
                        borderColor: colors.accentMore,
                        backgroundColor: withAlpha(colors.accentMore, 0.06),
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.row}>
                        <StatusPill colors={colors} label={getTaskStatusLabel(getTaskWorkflowState(entry.task))} tone={entry.lateness ? 'warning' : 'neutral'} />
                        {entry.isNoted ? <StatusPill colors={colors} label="Noted" tone="accent" /> : null}
                      </View>
                      <Text style={styles.sectionTitle}>{entry.task.text}</Text>
                      <Text style={styles.body}>
                        {series?.name || 'Task series'}
                        {owner?.name ? ` • ${owner.name}` : ''}
                        {entry.lateness?.label ? ` • ${entry.lateness.label}` : ''}
                      </Text>
                      {entry.latestUpdate?.note ? <Text style={styles.body}>{entry.latestUpdate.note}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.sideColumn}>
              {(() => {
                const selectedEntry = visibleEntries.find((entry) => entry.task.id === selectedTaskId) || visibleEntries[0];
                if (!selectedEntry) return null;
                const series = firstRef(selectedEntry.task.taskSeries);
                const owner = firstRef(series?.familyMember);
                const activity = firstRef(series?.scheduledActivity);
                const seriesTasks = (query.data?.tasks || []).filter((task) => firstRef(task.taskSeries)?.id === series?.id);
                return (
                  <>
                    <View style={styles.card}>
                      <Text style={styles.eyebrow}>Selected review</Text>
                      <Text style={styles.sectionTitle}>{selectedEntry.task.text}</Text>
                      <Text style={styles.body}>
                        {series?.name || 'Task series'}
                        {owner?.name ? ` • ${owner.name}` : ''}
                        {selectedEntry.lateness?.label ? ` • ${selectedEntry.lateness.label}` : ''}
                      </Text>
                      <View style={styles.taskActionRow}>
                        <Pressable
                          testID={`task-series-review-open-${selectedEntry.task.id}`}
                          onPress={() =>
                            router.push({
                              pathname: '/task-series/task',
                              params: {
                                taskId: selectedEntry.task.id,
                                seriesId: series?.id || '',
                                choreId: activity?.id || '',
                                date: selectedEntry.latestUpdate?.scheduledForDate || toDateKey(new Date()),
                                review: '1',
                              },
                            })
                          }
                          style={styles.button}
                        >
                          <Text style={styles.buttonText}>Open full screen</Text>
                        </Pressable>
                        {selectedEntry.isNoted ? (
                          <Pressable testID={`task-series-review-clear-note-${selectedEntry.task.id}`} onPress={() => void handleNote(selectedEntry.task.id, 'clear')} style={styles.button}>
                            <Text style={styles.buttonText}>Un-note</Text>
                          </Pressable>
                        ) : (
                          <>
                            <Pressable testID={`task-series-review-note-until-${selectedEntry.task.id}`} onPress={() => void handleNote(selectedEntry.task.id, 'until')} style={styles.button}>
                              <Text style={styles.buttonText}>Note until</Text>
                            </Pressable>
                            <Pressable testID={`task-series-review-note-forever-${selectedEntry.task.id}`} onPress={() => void handleNote(selectedEntry.task.id, 'forever')} style={styles.button}>
                              <Text style={styles.buttonText}>Note forever</Text>
                            </Pressable>
                          </>
                        )}
                      </View>
                    </View>
                    <View style={styles.card}>
                      <Text style={styles.eyebrow}>Review update</Text>
                      <TaskUpdateComposerCard
                        db={db}
                        task={selectedEntry.task}
                        series={series}
                        chore={activity}
                        allTasks={seriesTasks}
                        selectedDateKey={selectedEntry.latestUpdate?.scheduledForDate || toDateKey(new Date())}
                        currentUser={{ ...currentUser, db }}
                        gradeTypes={query.data?.gradeTypes || []}
                        colors={colors}
                        onSaved={() => {}}
                      />
                    </View>
                    <View style={styles.card}>
                      <Text style={styles.eyebrow}>History</Text>
                      <UpdateHistoryList task={selectedEntry.task} colors={colors} onOpenAttachment={setPreviewAttachment} />
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        ) : (
          visibleEntries.map((entry) => {
            const series = firstRef(entry.task.taskSeries);
            const owner = firstRef(series?.familyMember);
            const activity = firstRef(series?.scheduledActivity);
            return (
              <View key={entry.task.id} style={styles.card}>
                <View style={styles.between}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.row}>
                      <StatusPill colors={colors} label={getTaskStatusLabel(getTaskWorkflowState(entry.task))} tone={entry.lateness ? 'warning' : 'neutral'} />
                      {entry.isNoted ? <StatusPill colors={colors} label="Noted" tone="accent" /> : null}
                    </View>
                    <Text style={styles.sectionTitle}>{entry.task.text}</Text>
                    <Text style={styles.body}>
                      {series?.name || 'Task series'}
                      {owner?.name ? ` • ${owner.name}` : ''}
                      {entry.lateness?.label ? ` • ${entry.lateness.label}` : ''}
                    </Text>
                    {entry.latestUpdate?.note ? <Text style={styles.body}>{entry.latestUpdate.note}</Text> : null}
                  </View>
                </View>
                <View style={styles.taskActionRow}>
                  <Pressable
                    testID={`task-series-review-open-${entry.task.id}`}
                    onPress={() =>
                      router.push({
                        pathname: '/task-series/task',
                        params: {
                          taskId: entry.task.id,
                          seriesId: series?.id || '',
                          choreId: activity?.id || '',
                          date: entry.latestUpdate?.scheduledForDate || toDateKey(new Date()),
                          review: '1',
                        },
                      })
                    }
                    style={[styles.button, styles.buttonPrimary]}
                  >
                    <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Review</Text>
                  </Pressable>
                  {entry.isNoted ? (
                    <Pressable testID={`task-series-review-clear-note-${entry.task.id}`} onPress={() => void handleNote(entry.task.id, 'clear')} style={styles.button}>
                      <Text style={styles.buttonText}>Un-note</Text>
                    </Pressable>
                  ) : (
                    <>
                      <Pressable testID={`task-series-review-note-until-${entry.task.id}`} onPress={() => void handleNote(entry.task.id, 'until')} style={styles.button}>
                        <Text style={styles.buttonText}>Note until date</Text>
                      </Pressable>
                      <Pressable testID={`task-series-review-note-forever-${entry.task.id}`} onPress={() => void handleNote(entry.task.id, 'forever')} style={styles.button}>
                        <Text style={styles.buttonText}>Note forever</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
      <AttachmentPreviewModal attachment={previewAttachment} visible={!!previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </SubscreenScaffold>
  );
}

export function TaskSeriesManagerScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const { requireParentAction } = useParentActionGate();
  const { db, currentUser, isAuthenticated, instantReady, principalType } = useAppSession();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);

  const query = db.useQuery(
    isAuthenticated && instantReady && principalType === 'parent'
      ? {
          taskSeries: {
            tasks: {
              responseFields: {},
              updates: {
                actor: {},
                affectedPerson: {},
                responseFieldValues: { field: {} },
                gradeType: {},
                attachments: {},
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
        }
      : null
  );

  const items = buildManagerItems(query.data?.taskSeries || []);
  const filteredItems = statusFilter === 'all' ? items : items.filter((item) => item.status === statusFilter);
  const selectedSet = new Set(selectedIds);

  useEffect(() => {
    if (!isWide) return;
    if (!filteredItems.length) {
      setSelectedSeriesId(null);
      return;
    }
    if (!selectedSeriesId || !filteredItems.some((item) => item.series.id === selectedSeriesId)) {
      setSelectedSeriesId(filteredItems[0].series.id);
    }
  }, [filteredItems, isWide, selectedSeriesId]);

  if (principalType !== 'parent') {
    return (
      <SubscreenScaffold title="Task Series" subtitle="Parent mode is required for the task-series manager." accent={colors.accentMore}>
        <ParentAccessNotice
          body="Log in as a parent to manage series, review progress, and edit task plans."
          onContinue={() =>
            requireParentAction({
              actionId: 'task-series:manager',
              actionLabel: 'Task Series Manager',
              payload: { href: '/more/task-series' },
              returnPath: '/more/task-series',
            })
          }
        />
      </SubscreenScaffold>
    );
  }

  async function handleDelete(idsToDelete) {
    if (!idsToDelete.length) return;
    const targetSeries = (query.data?.taskSeries || []).filter((series) => idsToDelete.includes(series.id));
    const transactions = [];
    for (const series of targetSeries) {
      transactions.push(tx.taskSeries[series.id].delete());
      for (const task of series.tasks || []) {
        transactions.push(tx.tasks[task.id].delete());
      }
    }
    await db.transact(transactions);
    setSelectedIds([]);
  }

  async function handleDuplicate(item) {
    const series = item.series;
    const newSeriesId = id();
    const now = new Date();
    const transactions = [
      tx.taskSeries[newSeriesId].update({
        name: series.name ? `${series.name} (copy)` : 'Untitled series (copy)',
        description: series.description || '',
        startDate: series.startDate ? new Date(series.startDate) : undefined,
        targetEndDate: series.targetEndDate ? new Date(series.targetEndDate) : undefined,
        workAheadAllowed: series.workAheadAllowed ?? undefined,
        createdAt: now,
        updatedAt: now,
      }),
    ];

    for (const task of (series.tasks || []).slice().sort((left, right) => (left.order || 0) - (right.order || 0))) {
      const nextTaskId = id();
      transactions.push(
        tx.tasks[nextTaskId].update({
          text: task.text,
          order: task.order,
          isDayBreak: task.isDayBreak,
          indentationLevel: task.indentationLevel ?? 0,
          notes: task.notes ?? undefined,
          specificTime: task.specificTime ?? undefined,
          overrideWorkAhead: task.overrideWorkAhead ?? undefined,
          weight: task.weight ?? undefined,
          isCompleted: false,
          completedAt: null,
          completedOnDate: null,
          workflowState: 'not_started',
          lastActiveState: 'not_started',
          deferredUntilDate: null,
          createdAt: now,
          updatedAt: now,
        }),
        tx.taskSeries[newSeriesId].link({ tasks: nextTaskId })
      );
    }

    await db.transact(transactions);
    router.push(`/more/task-series/${newSeriesId}`);
  }

  async function handleCatchUp(item) {
    const activity = firstRef(item.series.scheduledActivity);
    if (!activity?.rrule || !item.liveEnd) return;
    const transactions = buildCatchUpTransactions({
      tx,
      seriesId: item.series.id,
      newPlannedEndDate: item.liveEnd,
      currentDayBreakCount: item.totalBlocks,
      actorFamilyMemberId: currentUser?.id || null,
      choreId: activity.id || null,
    });
    await db.transact(transactions);
  }

  return (
    <SubscreenScaffold
      title="Task Series"
      subtitle="Manager, review queue, and series editing."
      accent={colors.accentMore}
      action={
        <View style={styles.row}>
          <Pressable testID="task-series-manager-review" onPress={() => router.push('/more/task-series/review')} style={styles.button}>
            <Text style={styles.buttonText}>Review</Text>
          </Pressable>
          <Pressable testID="task-series-manager-new" onPress={() => router.push('/more/task-series/new')} style={[styles.button, styles.buttonPrimary]}>
            <Text style={[styles.buttonText, styles.buttonTextPrimary]}>New</Text>
          </Pressable>
        </View>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {['all', 'draft', 'pending', 'in_progress', 'archived'].map((status) => {
            const active = statusFilter === status;
            return (
              <Pressable key={status} onPress={() => setStatusFilter(status)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {status === 'all' ? 'All' : status === 'in_progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {filteredItems.length ? (
          <Pressable
            onPress={() => setSelectedIds(selectedIds.length === filteredItems.length ? [] : filteredItems.map((item) => item.series.id))}
            style={[styles.chip, selectedIds.length === filteredItems.length && styles.chipActive]}
          >
            <Text style={[styles.chipText, selectedIds.length === filteredItems.length && styles.chipTextActive]}>
              {selectedIds.length === filteredItems.length ? 'Clear selection' : 'Select all'}
            </Text>
          </Pressable>
        ) : null}
        {selectedIds.length ? (
          <View style={styles.card}>
            <Text style={styles.body}>{selectedIds.length} selected</Text>
            <Pressable
              onPress={() =>
                Alert.alert('Delete task series?', `Delete ${selectedIds.length} selected series?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => void handleDelete(selectedIds) },
                ])
              }
              style={[styles.button, styles.buttonDanger]}
            >
              <Text style={[styles.buttonText, styles.buttonTextDanger]}>Delete Selected</Text>
            </Pressable>
          </View>
        ) : null}
        {filteredItems.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.body}>No task series match this filter.</Text>
          </View>
        ) : isWide ? (
          <View style={styles.splitRow}>
            <View style={styles.listColumn}>
              {filteredItems.map((item) => {
                const selected = selectedSeriesId === item.series.id;
                return (
                  <Pressable
                    key={item.series.id}
                    onPress={() => setSelectedSeriesId(item.series.id)}
                    onLongPress={() =>
                      setSelectedIds((current) =>
                        current.includes(item.series.id) ? current.filter((idValue) => idValue !== item.series.id) : [...current, item.series.id]
                      )
                    }
                    style={[styles.card, selected && { borderColor: colors.accentMore, backgroundColor: withAlpha(colors.accentMore, 0.06) }]}
                  >
                    <View style={styles.between}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <View style={styles.row}>
                          <StatusPill colors={colors} label={item.status === 'in_progress' ? 'In Progress' : item.status.charAt(0).toUpperCase() + item.status.slice(1)} tone={item.status === 'archived' ? 'success' : item.status === 'pending' ? 'warning' : item.status === 'draft' ? 'neutral' : 'accent'} />
                          <StatusPill colors={colors} label={item.drift.label} tone={item.drift.status === 'behind' ? 'warning' : item.drift.status === 'ahead' ? 'accent' : 'success'} />
                        </View>
                        <Text style={styles.sectionTitle}>{item.series.name || 'Untitled series'}</Text>
                        <Text style={styles.body}>{firstRef(item.series.familyMember)?.name || 'Unassigned'}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.sideColumn}>
              {(() => {
                const item = filteredItems.find((entry) => entry.series.id === selectedSeriesId) || filteredItems[0];
                if (!item) return null;
                return (
                  <>
                    <View style={styles.card}>
                      <View style={styles.row}>
                        <StatusPill colors={colors} label={item.status === 'in_progress' ? 'In Progress' : item.status.charAt(0).toUpperCase() + item.status.slice(1)} tone={item.status === 'archived' ? 'success' : item.status === 'pending' ? 'warning' : item.status === 'draft' ? 'neutral' : 'accent'} />
                        <StatusPill colors={colors} label={item.drift.label} tone={item.drift.status === 'behind' ? 'warning' : item.drift.status === 'ahead' ? 'accent' : 'success'} />
                      </View>
                      <Text style={styles.sectionTitle}>{item.series.name || 'Untitled series'}</Text>
                      {item.series.description ? <Text style={styles.body}>{item.series.description}</Text> : null}
                      <Text style={styles.body}>
                        {firstRef(item.series.familyMember)?.name || 'Unassigned'}
                        {firstRef(item.series.scheduledActivity)?.title ? ` • ${firstRef(item.series.scheduledActivity).title}` : ''}
                      </Text>
                      <Text style={styles.body}>
                        Tasks {item.completedTasks}/{item.totalTasks} • Days {item.completedBlocks}/{item.totalBlocks}
                      </Text>
                      <View style={styles.progressTrack}>
                        <View style={[styles.progressFill, { width: `${Math.max(8, item.totalTasks ? (item.completedTasks / item.totalTasks) * 100 : 8)}%` }]} />
                      </View>
                      {item.seriesGrade?.gradedCount ? (
                        <Text style={styles.body}>
                          Grade {item.seriesGrade.gradeType ? formatGradeDisplay(item.seriesGrade.average, item.seriesGrade.gradeType) : item.seriesGrade.average.toFixed(1)}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.card}>
                      <Text style={styles.eyebrow}>Actions</Text>
                      <View style={styles.taskActionRow}>
                        <Pressable
                          testID={`task-series-manager-open-checklist-${item.series.id}`}
                          onPress={() =>
                            openTaskSeriesChecklist({
                              seriesId: item.series.id,
                              choreId: firstRef(item.series.scheduledActivity)?.id || '',
                              date: toDateKey(new Date()),
                              memberId: firstRef(item.series.familyMember)?.id || '',
                            })
                          }
                          style={styles.button}
                        >
                          <Text style={styles.buttonText}>Checklist</Text>
                        </Pressable>
                        <Pressable testID={`task-series-manager-edit-${item.series.id}`} onPress={() => router.push(`/more/task-series/${item.series.id}`)} style={styles.button}>
                          <Text style={styles.buttonText}>Edit</Text>
                        </Pressable>
                        <Pressable testID={`task-series-manager-review-${item.series.id}`} onPress={() => router.push({ pathname: '/more/task-series/review', params: { seriesId: item.series.id } })} style={styles.button}>
                          <Text style={styles.buttonText}>Review</Text>
                        </Pressable>
                        <Pressable testID={`task-series-manager-history-${item.series.id}`} onPress={() => openTaskHistory({ seriesId: item.series.id, title: item.series.name || 'Task Series History' })} style={styles.button}>
                          <Text style={styles.buttonText}>History</Text>
                        </Pressable>
                        <Pressable testID={`task-series-manager-discussion-${item.series.id}`} onPress={() => void openTaskSeriesDiscussion({ seriesId: item.series.id, seriesName: item.series.name })} style={styles.button}>
                          <Text style={styles.buttonText}>Discussion</Text>
                        </Pressable>
                        {item.drift.status === 'behind' && item.liveEnd ? (
                          <Pressable onPress={() => void handleCatchUp(item)} style={styles.button}>
                            <Text style={styles.buttonText}>Catch Up</Text>
                          </Pressable>
                        ) : null}
                        <Pressable testID={`task-series-manager-duplicate-${item.series.id}`} onPress={() => void handleDuplicate(item)} style={styles.button}>
                          <Text style={styles.buttonText}>Duplicate</Text>
                        </Pressable>
                        <Pressable
                          testID={`task-series-manager-delete-${item.series.id}`}
                          onPress={() =>
                            Alert.alert('Delete task series?', `Delete ${item.series.name || 'this series'} and all its tasks?`, [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Delete', style: 'destructive', onPress: () => void handleDelete([item.series.id]) },
                            ])
                          }
                          style={[styles.button, styles.buttonDanger]}
                        >
                          <Text style={[styles.buttonText, styles.buttonTextDanger]}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        ) : (
          filteredItems.map((item) => {
            const selected = selectedSet.has(item.series.id);
            return (
              <Pressable
                key={item.series.id}
                onPress={() => router.push(`/more/task-series/${item.series.id}`)}
                onLongPress={() =>
                  setSelectedIds((current) =>
                    current.includes(item.series.id) ? current.filter((idValue) => idValue !== item.series.id) : [...current, item.series.id]
                  )
                }
                style={[styles.card, selected && { borderColor: colors.accentMore, backgroundColor: withAlpha(colors.accentMore, 0.06) }]}
              >
                <View style={styles.between}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.row}>
                      <StatusPill colors={colors} label={item.status === 'in_progress' ? 'In Progress' : item.status.charAt(0).toUpperCase() + item.status.slice(1)} tone={item.status === 'archived' ? 'success' : item.status === 'pending' ? 'warning' : item.status === 'draft' ? 'neutral' : 'accent'} />
                      <StatusPill colors={colors} label={item.drift.label} tone={item.drift.status === 'behind' ? 'warning' : item.drift.status === 'ahead' ? 'accent' : 'success'} />
                    </View>
                    <Text style={styles.sectionTitle}>{item.series.name || 'Untitled series'}</Text>
                    {item.series.description ? <Text style={styles.body}>{item.series.description}</Text> : null}
                    <Text style={styles.body}>
                      {firstRef(item.series.familyMember)?.name || 'Unassigned'}
                      {firstRef(item.series.scheduledActivity)?.title ? ` • ${firstRef(item.series.scheduledActivity).title}` : ''}
                    </Text>
                  </View>
                </View>
                <View style={styles.between}>
                  <Text style={styles.tinyLabel}>Tasks {item.completedTasks}/{item.totalTasks}</Text>
                  <Text style={styles.tinyLabel}>Days {item.completedBlocks}/{item.totalBlocks}</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.max(8, item.totalTasks ? (item.completedTasks / item.totalTasks) * 100 : 8)}%` }]} />
                </View>
                {item.seriesGrade?.gradedCount ? (
                  <Text style={styles.body}>
                    Grade {item.seriesGrade.gradeType ? formatGradeDisplay(item.seriesGrade.average, item.seriesGrade.gradeType) : item.seriesGrade.average.toFixed(1)}
                    {` • ${item.seriesGrade.gradedCount}/${item.seriesGrade.totalGradable} graded`}
                  </Text>
                ) : null}
                <View style={styles.taskActionRow}>
                <Pressable
                  testID={`task-series-manager-open-checklist-${item.series.id}`}
                  onPress={() =>
                    openTaskSeriesChecklist({
                        seriesId: item.series.id,
                        choreId: firstRef(item.series.scheduledActivity)?.id || '',
                        date: toDateKey(new Date()),
                        memberId: firstRef(item.series.familyMember)?.id || '',
                      })
                    }
                    style={styles.button}
                  >
                    <Text style={styles.buttonText}>Checklist</Text>
                  </Pressable>
                  <Pressable testID={`task-series-manager-edit-${item.series.id}`} onPress={() => router.push(`/more/task-series/${item.series.id}`)} style={styles.button}>
                    <Text style={styles.buttonText}>Edit</Text>
                  </Pressable>
                  <Pressable testID={`task-series-manager-review-${item.series.id}`} onPress={() => router.push({ pathname: '/more/task-series/review', params: { seriesId: item.series.id } })} style={styles.button}>
                    <Text style={styles.buttonText}>Review</Text>
                  </Pressable>
                  <Pressable testID={`task-series-manager-history-${item.series.id}`} onPress={() => openTaskHistory({ seriesId: item.series.id, title: item.series.name || 'Task Series History' })} style={styles.button}>
                    <Text style={styles.buttonText}>History</Text>
                  </Pressable>
                  <Pressable testID={`task-series-manager-discussion-${item.series.id}`} onPress={() => void openTaskSeriesDiscussion({ seriesId: item.series.id, seriesName: item.series.name })} style={styles.button}>
                    <Text style={styles.buttonText}>Discussion</Text>
                  </Pressable>
                  {item.drift.status === 'behind' && item.liveEnd ? (
                    <Pressable onPress={() => void handleCatchUp(item)} style={styles.button}>
                      <Text style={styles.buttonText}>Catch Up</Text>
                    </Pressable>
                  ) : null}
                  <Pressable testID={`task-series-manager-duplicate-${item.series.id}`} onPress={() => void handleDuplicate(item)} style={styles.button}>
                    <Text style={styles.buttonText}>Duplicate</Text>
                  </Pressable>
                  <Pressable
                    testID={`task-series-manager-delete-${item.series.id}`}
                    onPress={() =>
                      Alert.alert('Delete task series?', `Delete ${item.series.name || 'this series'} and all its tasks?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => void handleDelete([item.series.id]) },
                      ])
                    }
                    style={[styles.button, styles.buttonDanger]}
                  >
                    <Text style={[styles.buttonText, styles.buttonTextDanger]}>Delete</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SubscreenScaffold>
  );
}
