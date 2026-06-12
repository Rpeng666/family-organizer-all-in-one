'use client';

import type {
    AcknowledgeMessageRequest,
    CreateThreadRequest,
    EditMessageRequest,
    MarkReadRequest,
    SendMessageRequest,
    ThreadPreferencesRequest,
    ToggleReactionRequest,
} from '@/lib/messaging-types';
import { getCachedMemberToken } from '@/lib/instant-principal-storage';

const INSTANT_AUTH_TOKEN_HEADER = 'x-instant-auth-token';

async function parseJson(response: Response) {
    const payload = await response.json().catch(() => ({}));
    console.info('[message-client] response', {
        ok: response.ok,
        status: response.status,
        payload,
        url: response.url,
    });
    if (!response.ok) {
        throw new Error(payload?.error || `Request failed (${response.status})`);
    }
    return payload;
}

function messageAuthHeaders() {
    const token = getCachedMemberToken();
    return token
        ? {
              [INSTANT_AUTH_TOKEN_HEADER]: token,
          }
        : {};
}

async function postJson(path: string, body: unknown) {
    console.info('[message-client] request:start', { path, body });
    const response = await fetch(path, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            ...messageAuthHeaders(),
        },
        body: JSON.stringify(body),
    });
    console.info('[message-client] request:sent', { path });
    return parseJson(response);
}

export async function getMessageServerTime() {
    const response = await fetch('/api/messages/server-time', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
            ...messageAuthHeaders(),
        },
    });
    return parseJson(response);
}

export function bootstrapMessages() {
    return postJson('/api/messages/bootstrap', {});
}

export function createThread(request: CreateThreadRequest) {
    return postJson('/api/messages/threads', request);
}

export function sendMessage(request: SendMessageRequest) {
    return postJson('/api/messages/messages', request);
}

export function editMessage(request: EditMessageRequest) {
    return postJson(`/api/messages/messages/${encodeURIComponent(request.messageId)}/edit`, {
        body: request.body,
    });
}

export function removeMessage(messageId: string, reason?: string) {
    return postJson(`/api/messages/messages/${encodeURIComponent(messageId)}/remove`, {
        reason: reason || null,
    });
}

export function toggleReaction(request: ToggleReactionRequest) {
    return postJson(`/api/messages/messages/${encodeURIComponent(request.messageId)}/reactions`, {
        emoji: request.emoji,
    });
}

export function acknowledge(request: AcknowledgeMessageRequest) {
    return postJson(`/api/messages/messages/${encodeURIComponent(request.messageId)}/acknowledge`, request);
}

export function markRead(request: MarkReadRequest) {
    return postJson(`/api/messages/threads/${encodeURIComponent(request.threadId)}/read`, request);
}

export function updateThreadPreferences(request: ThreadPreferencesRequest) {
    return postJson(`/api/messages/threads/${encodeURIComponent(request.threadId)}/preferences`, request);
}

export function joinThreadWatch(threadId: string) {
    return postJson(`/api/messages/threads/${encodeURIComponent(threadId)}/watch`, {});
}

export async function leaveThreadWatch(threadId: string) {
    const response = await fetch(`/api/messages/threads/${encodeURIComponent(threadId)}/watch`, {
        method: 'DELETE',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
            ...messageAuthHeaders(),
        },
    });
    return parseJson(response);
}
