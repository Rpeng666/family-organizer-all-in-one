import { getServerUrl } from './server-url';
import { getActiveMemberPrincipalToken, getDeviceSessionToken, getParentPrincipalToken } from './device-session-store';
import { CALENDAR_SYNC_PARENT_TOKEN_HEADER } from '../../../lib/calendar-sync-constants';

export function getApiBaseUrl() {
  return getServerUrl();
}

export function getMobileFileContentUrl(fileKey) {
  return `${getApiBaseUrl()}/api/mobile/files/content/${encodeURIComponent(fileKey)}`;
}

async function authHeaders() {
  const token = await getDeviceSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parentPrincipalHeaders() {
  const token = await getParentPrincipalToken();
  return token ? { [CALENDAR_SYNC_PARENT_TOKEN_HEADER]: token } : {};
}

async function memberPrincipalHeaders() {
  const token = await getActiveMemberPrincipalToken();
  return token ? { 'X-Instant-Auth-Token': token } : {};
}

async function parseJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function getMobileMessageServerTime() {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/server-time`, {
    method: 'GET',
    headers: {
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
  });
  return parseJson(response);
}

export async function mobileDeviceActivate({ accessKey, platform = 'ios', deviceName, appVersion }) {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/device-activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessKey, platform, deviceName, appVersion }),
  });
  return parseJson(response);
}

export async function refreshMobileDeviceSession() {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/device-session/refresh`, {
    method: 'POST',
    headers: {
      ...(await authHeaders()),
    },
  });
  return parseJson(response);
}

export async function revokeMobileDeviceSession() {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/device-session/revoke`, {
    method: 'POST',
    headers: {
      ...(await authHeaders()),
    },
  });
  return parseJson(response);
}

export async function getFamilyMembersRoster() {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/family-members`, {
    headers: {
      ...(await authHeaders()),
    },
  });
  return parseJson(response);
}

export async function getKidInstantToken() {
  throw new Error('getKidInstantToken is no longer supported; use getMemberInstantToken instead.');
}

export async function getMemberInstantToken({ familyMemberId, pin }) {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/instant-auth-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify({ familyMemberId, pin }),
  });
  return parseJson(response);
}

export async function getSharedKidInstantToken() {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/instant-auth-kid-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify({}),
  });
  return parseJson(response);
}

export async function getParentInstantToken({ familyMemberId, pin }) {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/instant-auth-parent-token`, {
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    method: 'POST',
    body: JSON.stringify({ familyMemberId, pin }),
  });
  return parseJson(response);
}

export async function getMobileFilesList() {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/files`, {
    headers: {
      ...(await authHeaders()),
    },
  });
  return parseJson(response);
}

export async function getPresignedFileUrl(fileKey) {
  const response = await fetch(
    `${getApiBaseUrl()}/api/mobile/files/${encodeURIComponent(fileKey)}`,
    { headers: await authHeaders() }
  );
  const data = await parseJson(response);
  return data.url;
}

export async function createMobilePresignedUpload({ filename, contentType, scope = 'task-attachment' }) {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/files/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify({ filename, contentType, scope }),
  });
  return parseJson(response);
}

export async function finalizeMobileUploadedAttachment(payload) {
  const response = await fetch(`${getApiBaseUrl()}/api/mobile/files/finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function getAppleCalendarSyncStatus() {
  const response = await fetch(`${getApiBaseUrl()}/api/calendar-sync/apple/status`, {
    headers: {
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
      ...(await parentPrincipalHeaders()),
    },
  });
  return parseJson(response);
}

export async function connectAppleCalendarSync({ username, appSpecificPassword, accountLabel }) {
  const response = await fetch(`${getApiBaseUrl()}/api/calendar-sync/apple/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
      ...(await parentPrincipalHeaders()),
    },
    body: JSON.stringify({ username, appSpecificPassword, accountLabel }),
  });
  return parseJson(response);
}

export async function updateAppleCalendarSyncSettings(payload) {
  const response = await fetch(`${getApiBaseUrl()}/api/calendar-sync/apple/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
      ...(await parentPrincipalHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function runAppleCalendarSync(payload = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/calendar-sync/apple/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
      ...(await parentPrincipalHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function bootstrapMobileMessages() {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify({}),
  });
  return parseJson(response);
}

export async function createMobileMessageThread(payload) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/threads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function ensureMobileLinkedThread({ linkedDomain, linkedEntityId, title }) {
  return createMobileMessageThread({
    threadType: 'linked',
    linkedDomain,
    linkedEntityId,
    title,
  });
}

export async function sendMobileMessage(payload) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function editMobileMessage(messageId, payload) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/messages/${encodeURIComponent(messageId)}/edit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function removeMobileMessage(messageId, payload = {}) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/messages/${encodeURIComponent(messageId)}/remove`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function toggleMobileReaction(messageId, emoji) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/messages/${encodeURIComponent(messageId)}/reactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify({ emoji }),
  });
  return parseJson(response);
}

export async function acknowledgeMobileMessage(messageId, kind = 'acknowledged') {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/messages/${encodeURIComponent(messageId)}/acknowledge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify({ kind }),
  });
  return parseJson(response);
}

export async function markMobileThreadRead(threadId, lastReadMessageId) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/threads/${encodeURIComponent(threadId)}/read`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify({ threadId, lastReadMessageId }),
  });
  return parseJson(response);
}

export async function updateMobileThreadPreferences(threadId, payload) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/threads/${encodeURIComponent(threadId)}/preferences`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}

export async function joinMobileThreadWatch(threadId) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/threads/${encodeURIComponent(threadId)}/watch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify({}),
  });
  return parseJson(response);
}

export async function leaveMobileThreadWatch(threadId) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/threads/${encodeURIComponent(threadId)}/watch`, {
    method: 'DELETE',
    headers: {
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
  });
  return parseJson(response);
}

export async function registerMobilePushDevice(payload) {
  const response = await fetch(`${getApiBaseUrl()}/api/messages/push-devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(await memberPrincipalHeaders()),
    },
    body: JSON.stringify(payload),
  });
  return parseJson(response);
}
