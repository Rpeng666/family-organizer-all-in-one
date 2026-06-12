import { router } from 'expo-router';
import { ensureMobileLinkedThread } from '../../lib/api-client';

export function buildTaskSeriesDiscussionEntityId(seriesId) {
  return `task-series:${seriesId}`;
}

export function buildTaskHistoryParams({ seriesId, taskId = '', title = '' }) {
  return {
    seriesId: seriesId || '',
    taskId,
    title,
  };
}

export function openTaskSeriesChecklist({ seriesId, choreId = '', date = '', memberId = '' }) {
  router.push({
    pathname: '/task-series/series',
    params: {
      seriesId: seriesId || '',
      choreId,
      date,
      memberId,
    },
  });
}

export function openTaskHistory(params) {
  router.push({
    pathname: '/task-series/history',
    params: buildTaskHistoryParams(params),
  });
}

export async function openTaskSeriesDiscussion({ seriesId, seriesName }) {
  if (!seriesId) return null;

  const result = await ensureMobileLinkedThread({
    linkedDomain: 'tasks',
    linkedEntityId: buildTaskSeriesDiscussionEntityId(seriesId),
    title: seriesName ? `${seriesName} Discussion` : 'Task Series Discussion',
  });

  const threadId = result?.thread?.id || result?.id || null;
  if (threadId) {
    router.push({
      pathname: '/messages',
      params: { threadId },
    });
  }

  return result?.thread || null;
}
