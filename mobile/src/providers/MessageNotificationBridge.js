import React, { useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { db } from '../lib/instant-db';
import { useFamilyAuth } from './FamilyAuthProvider';
import {
  nextDigestAt,
  normalizeDigestMode,
  normalizeDigestWindowMinutes,
  shouldQueueDigest,
} from '../../../lib/message-notification-preferences';
import { createMessageServerTimeAnchor, getMessageServerNowMs, getMonotonicNowMs } from '../../../lib/message-server-time';
import { getMobileMessageServerTime } from '../lib/api-client';

// Expo Go removed remote + local push notification support in SDK 53.
// Skip all notification scheduling when running inside Expo Go.
const IS_EXPO_GO = Constants.appOwnership === 'expo';

function queueKey(memberId) {
  return `familyOrganizer.messageDigestQueue.${memberId}`;
}

async function readQueue(memberId) {
  try {
    const raw = await AsyncStorage.getItem(queueKey(memberId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(memberId, queue) {
  try {
    await AsyncStorage.setItem(queueKey(memberId), JSON.stringify(queue));
  } catch {
    // best-effort
  }
}

function summarizeDigest(queue) {
  const titles = Array.from(new Set(queue.map((item) => item.title).filter(Boolean)));
  if (queue.length === 1) {
    return queue[0].body || `New message in ${queue[0].title}`;
  }
  if (titles.length === 1) {
    return `${queue.length} new messages in ${titles[0]}`;
  }
  return `${queue.length} new messages across ${titles.length} threads`;
}

async function showLocalNotification(title, body) {
  if (IS_EXPO_GO) return;
  const Notifications = await import('expo-notifications');
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: 'default' },
    trigger: null,
  });
}

export function MessageNotificationBridge() {
  const { currentUser, isAuthenticated } = useFamilyAuth();
  const seenThreadActivityRef = useRef({});
  const [serverNowAnchor, setServerNowAnchor] = React.useState(null);

  const membershipQuery = db.useQuery(
    isAuthenticated && currentUser
      ? { messageThreadMembers: {} }
      : null
  );

  const threads = useMemo(() => {
    const memberships = membershipQuery.data?.messageThreadMembers || [];
    return memberships
      .map((membership) => (membership?.threadId ? { id: membership.threadId, latestMessageAt: membership.lastReadAt || '', latestMessageAuthorId: null, latestMessagePreview: '', title: 'Message thread', membership } : null))
      .filter(Boolean);
  }, [membershipQuery.data?.messageThreadMembers]);

  useEffect(() => {
    if (!currentUser?.id) {
      setServerNowAnchor(null);
      return;
    }

    let cancelled = false;

    async function syncServerNow() {
      try {
        const response = await getMobileMessageServerTime();
        const nextAnchor = createMessageServerTimeAnchor(response?.serverNow);
        if (!cancelled && nextAnchor) {
          setServerNowAnchor(nextAnchor);
        }
      } catch (error) {
        console.error('Unable to sync mobile message server time', error);
      }
    }

    void syncServerNow();
    const intervalId = setInterval(() => { void syncServerNow(); }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const intervalId = setInterval(() => {
      void (async () => {
        const queue = await readQueue(currentUser.id);
        if (!queue.length) return;
        const nowMs = getMessageServerNowMs(serverNowAnchor, getMonotonicNowMs());
        const due = queue.filter((item) => new Date(item.dueAt).getTime() <= nowMs);
        if (!due.length) return;
        const remaining = queue.filter((item) => new Date(item.dueAt).getTime() > nowMs);
        await writeQueue(currentUser.id, remaining);
        await showLocalNotification('Family message digest', summarizeDigest(due));
      })();
    }, 30_000);

    return () => clearInterval(intervalId);
  }, [currentUser?.id, serverNowAnchor]);

  useEffect(() => {
    if (!currentUser?.id) return;

    const digestMode = normalizeDigestMode(currentUser.messageDigestMode);
    const digestWindowMinutes = normalizeDigestWindowMinutes(currentUser.messageDigestWindowMinutes);

    threads.forEach((thread) => {
      const latestMessageAt = thread.latestMessageAt || '';
      if (!latestMessageAt) return;

      const previousLatest = seenThreadActivityRef.current[thread.id];
      seenThreadActivityRef.current[thread.id] = latestMessageAt;

      if (!previousLatest) return;
      if (previousLatest === latestMessageAt) return;
      if (thread.latestMessageAuthorId === currentUser.id) return;

      const title = thread.title || 'Family message';
      const body = thread.latestMessagePreview || 'New message';
      const now = new Date(getMessageServerNowMs(serverNowAnchor, getMonotonicNowMs()));

      if (shouldQueueDigest(currentUser, now) || digestMode === 'digest') {
        void (async () => {
          const queue = await readQueue(currentUser.id);
          const dueAt = nextDigestAt(
            { ...currentUser, messageDigestMode: digestMode, messageDigestWindowMinutes: digestWindowMinutes },
            now
          );
          queue.push({ threadId: thread.id, title, body, occurredAt: latestMessageAt, dueAt: dueAt.toISOString() });
          await writeQueue(currentUser.id, queue);
        })();
        return;
      }

      void showLocalNotification(title, body);
    });
  }, [
    currentUser,
    currentUser?.id,
    currentUser?.messageDigestMode,
    currentUser?.messageDigestWindowMinutes,
    currentUser?.messageQuietHoursEnabled,
    currentUser?.messageQuietHoursEnd,
    currentUser?.messageQuietHoursStart,
    serverNowAnchor,
    threads,
  ]);

  return null;
}
