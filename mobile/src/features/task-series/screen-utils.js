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
import { isActionableTask, isTaskDone, getTaskWorkflowState, getTaskUpdateVisibleStates } from '../../../../lib/task-progress';
import { TASK_UPDATE_ALL_STATES } from '../../../../lib/task-update-ui';
import { computeSeriesGrade } from '../../../../lib/task-response-aggregation';

export function firstParam(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function firstRef(value) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] || null : value;
}

export function toDateKey(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

export function parseDateKey(value) {
  return new Date(`${toDateKey(value)}T00:00:00Z`);
}

export function formatDateLabel(value) {
  if (!value) return 'No date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No date';
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTaskDateLabel(value) {
  if (!value) return '';
  return parseDateKey(value).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatTimestamp(value) {
  if (!value) return '';
  const parsed = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString();
}

export function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveField(field) {
  if (!field) return null;
  if (Array.isArray(field)) return field[0] || null;
  return field;
}

export function resolveGradeType(entry) {
  const raw = entry?.gradeType;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] || null;
  return raw;
}

export function buildTaskStatusOptions(task, isParentReviewer) {
  if (isParentReviewer) return TASK_UPDATE_ALL_STATES.slice();
  return getTaskUpdateVisibleStates(getTaskWorkflowState(task), {
    isReviewMode: isParentReviewer,
  });
}

export function getDefaultParentPanelMode(currentState, canShowFeedbackMode) {
  if (!canShowFeedbackMode) return 'response';
  return currentState === 'in_progress' || currentState === 'not_started' ? 'response' : 'feedback';
}

export function buildSeriesStatus(series, infoMap, today) {
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

export function buildManagerItems(seriesList) {
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
      const drift = schedule
        ? computeScheduleDrift(plannedEnd, liveEnd, schedule)
        : { status: 'on_target', days: 0, label: 'On target' };
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

export function buildMemberOverviewItems(seriesList, memberId) {
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
      const drift = schedule
        ? computeScheduleDrift(plannedEnd, liveEnd, schedule)
        : { status: 'on_target', days: 0, label: 'On target' };
      const effectiveStartDate = series.startDate
        ? new Date(series.startDate)
        : activity?.startDate
        ? new Date(activity.startDate)
        : null;
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
