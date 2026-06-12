import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'familyOrganizer.taskUpdateDraft.';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function getTaskUpdateDraftKey(taskId) {
  return `${PREFIX}${taskId}`;
}

export async function loadTaskUpdateDraft(taskId) {
  if (!taskId) return null;

  try {
    const raw = await AsyncStorage.getItem(getTaskUpdateDraftKey(taskId));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      await AsyncStorage.removeItem(getTaskUpdateDraftKey(taskId));
      return null;
    }

    if (!Number.isFinite(parsed.savedAt) || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(getTaskUpdateDraftKey(taskId));
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function saveTaskUpdateDraft(taskId, draft) {
  if (!taskId || !draft || typeof draft !== 'object') return;

  try {
    await AsyncStorage.setItem(
      getTaskUpdateDraftKey(taskId),
      JSON.stringify({
        ...draft,
        savedAt: Number.isFinite(draft.savedAt) ? draft.savedAt : Date.now(),
      })
    );
  } catch {
    // Best-effort local persistence.
  }
}

export async function clearTaskUpdateDraft(taskId) {
  if (!taskId) return;

  try {
    await AsyncStorage.removeItem(getTaskUpdateDraftKey(taskId));
  } catch {
    // Ignore storage cleanup failures.
  }
}
