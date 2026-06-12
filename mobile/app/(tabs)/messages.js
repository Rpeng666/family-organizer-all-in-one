import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { tx } from '@instantdb/react-native';
import { AttachmentPreviewModal } from '../../src/components/AttachmentPreviewModal';
import { useAppSession } from '../../src/providers/AppProviders';
import { E, SP, R } from '../../src/theme/E';
import { db } from '../../src/lib/instant-db';
import {
  acknowledgeMobileMessage,
  bootstrapMobileMessages,
  createMobileMessageThread,
  editMobileMessage,
  getMobileMessageServerTime,
  joinMobileThreadWatch,
  leaveMobileThreadWatch,
  markMobileThreadRead,
  removeMobileMessage,
  sendMobileMessage,
  toggleMobileReaction,
  updateMobileThreadPreferences,
} from '../../src/lib/api-client';
import { useLocalSearchParams } from 'expo-router';
import { createMessageServerTimeAnchor, getMessageServerNowMs, getMonotonicNowMs } from '../../../lib/message-server-time';
import {
  captureCameraImage,
  captureCameraVideo,
  pickAttachmentDocuments,
  pickLibraryMedia,
  uploadPendingAttachments,
} from '../../src/lib/attachments';
import { getThreadDisplayName, getThreadMembersSummary, getThreadPreviewText, getThreadTypeLabel, isParentOverseeingThread } from '../../../lib/message-thread-display';
import { shouldBootstrapMessageRepair } from '../../src/lib/message-bootstrap';

function formatMessageTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getAuthorName(message, familyMemberNamesById) {
  const author = Array.isArray(message.author) ? message.author[0] : message.author;
  if (author?.name) return author.name;
  if (message.authorFamilyMemberId) return familyMemberNamesById.get(message.authorFamilyMemberId) || 'Unknown';
  return 'Unknown';
}

function getReplyTo(replyTo) {
  if (!replyTo) return null;
  return Array.isArray(replyTo) ? replyTo[0] || null : replyTo;
}

function getReplyPreviewText(message) {
  if (message?.deletedAt) {
    return message.removedReason || 'Original message removed';
  }
  const body = String(message?.body || '').trim();
  if (body) return body;
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (attachments.length === 1) {
    return `Attachment: ${attachments[0]?.name || 'Attachment'}`;
  }
  if (attachments.length > 1) {
    return `${attachments.length} attachments`;
  }
  return 'Message';
}

function getDraftKey(threadId) {
  return threadId ? `familyOrganizer.messageDraft.${threadId}` : '';
}

export default function MessagesTab() {
  const searchParams = useLocalSearchParams();
  const initialThreadId = useMemo(() => {
    const value = searchParams.threadId;
    return Array.isArray(value) ? value[0] : value;
  }, [searchParams.threadId]);
  const { currentUser, isAuthenticated, instantReady, isOnline } = useAppSession();
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [threadSearch, setThreadSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [composerImportance, setComposerImportance] = useState('normal');
  const [pendingFiles, setPendingFiles] = useState([]);
  const [replyToMessageId, setReplyToMessageId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingBody, setEditingBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isOverseeMode, setIsOverseeMode] = useState(false);
  const [showNotificationPrefs, setShowNotificationPrefs] = useState(false);
  const [creationMode, setCreationMode] = useState(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
  const [newThreadTitle, setNewThreadTitle] = useState('');
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [optimisticThreadsById, setOptimisticThreadsById] = useState({});
  const [relativeNowMs, setRelativeNowMs] = useState(() => getMonotonicNowMs());
  const [serverNowAnchor, setServerNowAnchor] = useState(null);
  const [hasAttemptedBootstrap, setHasAttemptedBootstrap] = useState(false);

  const membershipsQuery = db.useQuery(
    isAuthenticated && instantReady
      ? {
          messageThreadMembers: {
          },
        }
      : null
  );

  const threadsQuery = db.useQuery(
    isAuthenticated && instantReady && currentUser?.role === 'parent' && isOverseeMode
      ? {
          messageThreads: {
            $: {
              order: {
                latestMessageAt: 'desc',
              },
            },
          },
        }
      : null
  );

  const visibleThreadsQuery = db.useQuery(
    isAuthenticated && instantReady
      ? {
          messageThreads: {
          },
        }
      : null
  );

  const messagesQuery = db.useQuery(
    isAuthenticated && instantReady && selectedThreadId
      ? {
          messages: {
            $: {
              where: {
                threadId: selectedThreadId,
              },
              order: {
                createdAt: 'asc',
              },
            },
            attachments: {},
            author: {},
            reactions: {
              familyMember: {},
            },
            acknowledgements: {
              familyMember: {},
            },
            replyTo: {
              author: {},
              attachments: {},
            },
          },
        }
      : null
  );

  const familyMembersQuery = db.useQuery(
    isAuthenticated && instantReady
      ? {
          familyMembers: {
            $: {
              order: {
                order: 'asc',
              },
            },
          },
        }
      : null
  );

  const familyMembers = useMemo(() => familyMembersQuery.data?.familyMembers || [], [familyMembersQuery.data?.familyMembers]);
  const familyMemberNamesById = useMemo(() => new Map(familyMembers.map((member) => [member.id, member.name || 'Unknown'])), [familyMembers]);
  const membershipRows = useMemo(() => membershipsQuery.data?.messageThreadMembers || [], [membershipsQuery.data?.messageThreadMembers]);
  const overseenThreads = useMemo(() => threadsQuery.data?.messageThreads || [], [threadsQuery.data?.messageThreads]);
  const visibleThreads = useMemo(() => visibleThreadsQuery.data?.messageThreads || [], [visibleThreadsQuery.data?.messageThreads]);

  const threads = useMemo(() => {
    const map = new Map();
    const membershipMap = new Map();

    membershipRows.forEach((membership) => {
      if (!membership?.threadId) return;
      membershipMap.set(membership.threadId, membership);
    });

    visibleThreads.forEach((thread) => {
      map.set(thread.id, {
        ...thread,
        membership: membershipMap.get(thread.id) || map.get(thread.id)?.membership || null,
      });
    });

    if (currentUser?.role === 'parent' && isOverseeMode) {
      overseenThreads.forEach((thread) => {
        map.set(thread.id, {
          ...thread,
          membership: membershipMap.get(thread.id) || null,
        });
      });
    }

    Object.values(optimisticThreadsById).forEach((thread) => {
      if (!thread?.id) return;
      map.set(thread.id, {
        ...thread,
        membership: membershipMap.get(thread.id) || thread.membership || null,
      });
    });

    return Array.from(map.values())
      .filter((thread) => {
        if (thread.membership?.isArchived) return false;
        if (currentUser?.role === 'parent' && !isOverseeMode && !thread.membership && !optimisticThreadsById[thread.id]) {
          return false;
        }
        const query = threadSearch.trim().toLowerCase();
        if (!query) return true;
        const haystack = [
          thread.title || '',
          thread.latestMessagePreview || '',
          ...(thread.members || []).map((membership) => {
            const member = Array.isArray(membership.familyMember) ? membership.familyMember[0] : membership.familyMember;
            return member?.name || '';
          }),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((left, right) => {
        const leftPinned = left.membership?.isPinned ? 1 : 0;
        const rightPinned = right.membership?.isPinned ? 1 : 0;
        if (leftPinned !== rightPinned) return rightPinned - leftPinned;
        const leftTime = left.latestMessageAt ? new Date(left.latestMessageAt).getTime() : 0;
        const rightTime = right.latestMessageAt ? new Date(right.latestMessageAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [currentUser?.role, isOverseeMode, membershipRows, optimisticThreadsById, overseenThreads, threadSearch, visibleThreads]);

  const selectedThread = useMemo(() => threads.find((thread) => thread.id === selectedThreadId) || null, [selectedThreadId, threads]);
  const selectedMembership = selectedThread?.membership || null;
  const selectedThreadDisplayName = useMemo(
    () => (selectedThread ? getThreadDisplayName(selectedThread, familyMemberNamesById, currentUser?.id || '') : null),
    [currentUser?.id, familyMemberNamesById, selectedThread]
  );
  const selectedThreadMemberSummary = useMemo(
    () => (selectedThread ? getThreadMembersSummary(selectedThread, familyMemberNamesById, currentUser?.id || '') : null),
    [currentUser?.id, familyMemberNamesById, selectedThread]
  );
  const selectedThreadIsOverseen = useMemo(
    () => (selectedThread ? isParentOverseeingThread(selectedThread, currentUser?.role) : false),
    [currentUser?.role, selectedThread]
  );
  const messages = useMemo(() => {
    const rows = messagesQuery.data?.messages || [];
    const query = messageSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((message) => `${message.body || ''} ${getAuthorName(message, familyMemberNamesById)}`.toLowerCase().includes(query));
  }, [familyMemberNamesById, messageSearch, messagesQuery.data?.messages]);
  const availableParticipants = useMemo(() => familyMembers.filter((member) => member.id !== currentUser?.id), [currentUser?.id, familyMembers]);
  const replyTarget = useMemo(() => messages.find((message) => message.id === replyToMessageId) || null, [messages, replyToMessageId]);
  const threadRoom = useMemo(() => db.room('messageThreads', selectedThreadId || '_idle'), [selectedThreadId]);
  const threadPresence = db.rooms.usePresence(threadRoom, {
    initialPresence: {
      activeThread: Boolean(selectedThreadId),
      avatarUrl: currentUser?.photoUrls?.['64'] || currentUser?.photoUrls?.['320'] || '',
      composer: false,
      familyMemberId: currentUser?.id || '_idle',
      name: currentUser?.name || 'Guest',
    },
    keys: ['activeThread', 'composer', 'familyMemberId', 'name'],
  });
  db.rooms.useSyncPresence(
    threadRoom,
    {
      activeThread: Boolean(selectedThreadId),
      avatarUrl: currentUser?.photoUrls?.['64'] || currentUser?.photoUrls?.['320'] || '',
      familyMemberId: currentUser?.id || '_idle',
      name: currentUser?.name || 'Guest',
    },
    [currentUser?.id, currentUser?.name, currentUser?.photoUrls?.['64'], selectedThreadId]
  );
  const typingIndicator = db.rooms.useTypingIndicator(threadRoom, 'composer', {
    timeout: 1500,
    stopOnEnter: false,
  });
  const typingPeers = useMemo(
    () => (typingIndicator.active || []).filter((peer) => peer?.familyMemberId && peer.familyMemberId !== currentUser?.id),
    [currentUser?.id, typingIndicator.active]
  );
  const presentPeers = useMemo(
    () => Object.values(threadPresence.peers || {}).filter((peer) => peer?.familyMemberId && peer.familyMemberId !== currentUser?.id),
    [currentUser?.id, threadPresence.peers]
  );
  const referenceNowMs = useMemo(() => getMessageServerNowMs(serverNowAnchor, relativeNowMs), [relativeNowMs, serverNowAnchor]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !shouldBootstrapMessageRepair({
        isOnline,
        isLoadingThreads: visibleThreadsQuery.isLoading,
        threads: visibleThreads,
        currentUserRole: currentUser?.role,
        hasAttemptedBootstrap,
      })
    ) {
      return;
    }

    setHasAttemptedBootstrap(true);
    void bootstrapMobileMessages().catch((error) => {
      console.error('Unable to bootstrap mobile messages', error);
    });
  }, [currentUser?.role, hasAttemptedBootstrap, isAuthenticated, isOnline, visibleThreads, visibleThreadsQuery.isLoading]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setRelativeNowMs(getMonotonicNowMs());
    }, 15_000);

    return () => clearInterval(intervalId);
  }, []);

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
    const intervalId = setInterval(() => {
      void syncServerNow();
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (initialThreadId) {
      setSelectedThreadId(initialThreadId);
    }
  }, [initialThreadId]);

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0) {
      setSelectedThreadId(threads[0].id);
    }
  }, [initialThreadId, selectedThreadId, threads]);

  useEffect(() => {
    const draftKey = getDraftKey(selectedThreadId);
    if (!draftKey) {
      setComposerBody('');
      return;
    }
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    void AsyncStorage.getItem(draftKey).then((value) => {
      setComposerBody(value || '');
    });
    setPendingFiles([]);
    setReplyToMessageId(null);
    setEditingMessageId(null);
    setEditingBody('');
    setComposerImportance('normal');
  }, [selectedThreadId]);

  useEffect(() => {
    const draftKey = getDraftKey(selectedThreadId);
    if (!draftKey) return;
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (!composerBody.trim()) {
      void AsyncStorage.removeItem(draftKey);
      return;
    }
    void AsyncStorage.setItem(draftKey, composerBody);
  }, [composerBody, selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId || !messages.length || !selectedMembership) return;
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.id) return;
    void markMobileThreadRead(selectedThreadId, lastMessage.id).catch((error) => {
      console.error('Unable to mark mobile thread as read', error);
    });
  }, [messages, selectedMembership, selectedThreadId]);

  async function handleCreateThread() {
    if (!creationMode) return;
    try {
      const payload = {
        threadType: creationMode,
        participantIds: creationMode === 'direct' ? selectedParticipantIds.slice(0, 1) : selectedParticipantIds,
        title: creationMode === 'group' ? newThreadTitle : undefined,
      };
      const result = await createMobileMessageThread(payload);
      const threadId = result?.thread?.id;
      if (threadId) {
        setOptimisticThreadsById((current) => ({
          ...current,
          [threadId]: result.thread,
        }));
        setSelectedThreadId(threadId);
      }
      setCreationMode(null);
      setSelectedParticipantIds([]);
      setNewThreadTitle('');
    } catch (error) {
      Alert.alert('Unable to create thread', error?.message || 'Please try again.');
    }
  }

  async function handleSendMessage() {
    if (!selectedThreadId) return;
    if (!composerBody.trim() && pendingFiles.length === 0) return;

    setIsSending(true);
    try {
      const attachments = pendingFiles.length ? await uploadPendingAttachments(pendingFiles, () => `${Date.now()}-${Math.random()}`) : [];
      await sendMobileMessage({
        threadId: selectedThreadId,
        body: composerBody,
        attachments,
        replyToMessageId,
        importance: composerImportance,
        clientNonce: `${currentUser?.id || 'member'}:${Date.now()}`,
      });
      setComposerBody('');
      setPendingFiles([]);
      setReplyToMessageId(null);
      setComposerImportance('normal');
      typingIndicator.setActive(false);
    } catch (error) {
      Alert.alert('Unable to send message', error?.message || 'Please try again.');
    } finally {
      setIsSending(false);
    }
  }

  async function saveNotificationPrefs(patch) {
    if (!currentUser?.id) return;
    try {
      await db.transact([tx.familyMembers[currentUser.id].update(patch)]);
    } catch (error) {
      Alert.alert('Unable to save notification preferences', error?.message || 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={E.bg} />

      {!selectedThread ? (
        <View style={s.listPane}>
          {/* Header */}
          <View style={s.listHeader}>
            <Text style={s.listTitle}>Messages</Text>
            <View style={s.listHeaderActions}>
              <Pressable style={s.headerBtn} onPress={() => setShowNotificationPrefs(true)}>
                <Text style={s.headerBtnText}>Notify</Text>
              </Pressable>
              {currentUser?.role === 'parent' ? (
                <Pressable style={[s.headerBtn, isOverseeMode && s.headerBtnActive]} onPress={() => setIsOverseeMode((v) => !v)}>
                  <Text style={[s.headerBtnText, isOverseeMode && s.headerBtnTextActive]}>{isOverseeMode ? 'Oversee' : 'Inbox'}</Text>
                </Pressable>
              ) : null}
              <Pressable style={s.headerBtn} onPress={() => setCreationMode('direct')}>
                <Text style={s.headerBtnText}>+ New</Text>
              </Pressable>
            </View>
          </View>

          <TextInput
            value={threadSearch}
            onChangeText={setThreadSearch}
            placeholder="Search threads"
            placeholderTextColor={E.inkMuted}
            style={s.searchInput}
          />

          {creationMode ? (
            <View style={s.composeCard}>
              <Text style={s.composeTitle}>{creationMode === 'direct' ? 'Direct message' : 'New group thread'}</Text>
              {creationMode === 'group' ? (
                <TextInput
                  value={newThreadTitle}
                  onChangeText={setNewThreadTitle}
                  placeholder="Group title"
                  placeholderTextColor={E.inkMuted}
                  style={s.searchInput}
                />
              ) : null}
              <ScrollView style={s.memberPicker} contentContainerStyle={s.memberPickerContent}>
                {availableParticipants.map((member) => {
                  const checked = selectedParticipantIds.includes(member.id);
                  return (
                    <Pressable
                      key={member.id}
                      style={[s.memberRow, checked && s.memberRowActive]}
                      onPress={() => {
                        if (creationMode === 'direct') {
                          setSelectedParticipantIds([member.id]);
                          return;
                        }
                        setSelectedParticipantIds((curr) =>
                          curr.includes(member.id) ? curr.filter((id) => id !== member.id) : [...curr, member.id]
                        );
                      }}
                    >
                      <Text style={[s.memberRowText, checked && s.memberRowTextActive]}>{member.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={s.rowActions}>
                <Pressable style={s.ghostBtn} onPress={() => { setCreationMode(null); setSelectedParticipantIds([]); setNewThreadTitle(''); }}>
                  <Text style={s.ghostBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={s.primaryBtn} onPress={handleCreateThread}>
                  <Text style={s.primaryBtnText}>Create</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={s.quickRow}>
              <Pressable style={s.quickBtn} onPress={() => setSelectedThreadId('00000000-0000-4000-8000-000000000001')}>
                <Text style={s.quickBtnText}>Family</Text>
              </Pressable>
              {currentUser?.role === 'parent' ? (
                <Pressable style={s.quickBtn} onPress={() => setSelectedThreadId('00000000-0000-4000-8000-000000000002')}>
                  <Text style={s.quickBtnText}>Parents</Text>
                </Pressable>
              ) : null}
              <Pressable style={s.quickBtn} onPress={() => setCreationMode('group')}>
                <Text style={s.quickBtnText}>Group</Text>
              </Pressable>
            </View>
          )}

          <ScrollView contentContainerStyle={s.threadList}>
            {threads.map((thread) => {
              const unread =
                thread.latestMessageAt &&
                (!thread.membership?.lastReadAt || new Date(thread.latestMessageAt).getTime() > new Date(thread.membership.lastReadAt).getTime());
              const displayName = getThreadDisplayName(thread, familyMemberNamesById, currentUser?.id || '');
              const memberSummary = getThreadMembersSummary(thread, familyMemberNamesById, currentUser?.id || '');
              const previewText = getThreadPreviewText(thread);
              const isOverseen = isParentOverseeingThread(thread, currentUser?.role);
              return (
                <Pressable key={thread.id} style={[s.threadCard, isOverseen && s.threadCardOverseen]} onPress={() => setSelectedThreadId(thread.id)}>
                  <View style={s.threadHead}>
                    <Text style={s.threadTitle} numberOfLines={1}>{displayName}</Text>
                    <View style={s.threadBadges}>
                      {isOverseen ? <Text style={s.overseeTag}>Oversee</Text> : null}
                      {unread ? <View style={s.unreadDot} /> : null}
                    </View>
                  </View>
                  {memberSummary ? <Text style={s.threadMembers} numberOfLines={1}>{memberSummary}</Text> : null}
                  <Text style={s.threadPreview} numberOfLines={2}>{previewText}</Text>
                  <View style={s.threadMeta}>
                    <Text style={s.threadMetaText}>{getThreadTypeLabel(thread)}</Text>
                    <Text style={s.threadMetaText}>{formatMessageTime(thread.latestMessageAt)}</Text>
                  </View>
                </Pressable>
              );
            })}

            {!threads.length && membershipsQuery.isLoading ? (
              <View style={s.centerCard}>
                <ActivityIndicator size="small" color={E.accent} />
                <Text style={s.centerText}>Loading threads…</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      ) : (
        <View style={s.threadPane}>
          {/* Thread top bar */}
          <View style={s.threadTopBar}>
            <Pressable style={s.backBtn} onPress={() => setSelectedThreadId(null)}>
              <View style={s.backChevron} />
              <Text style={s.backBtnText}>Back</Text>
            </Pressable>
            <View style={s.threadTopBarActions}>
              {currentUser?.role === 'parent' && isOverseeMode && !selectedMembership ? (
                <Pressable style={s.quickBtn} onPress={async () => {
                  try { await joinMobileThreadWatch(selectedThread.id); }
                  catch (error) { Alert.alert('Unable to join thread', error?.message || 'Please try again.'); }
                }}>
                  <Text style={s.quickBtnText}>Join</Text>
                </Pressable>
              ) : null}
              {selectedMembership?.memberRole === 'watcher' ? (
                <Pressable style={s.quickBtn} onPress={async () => {
                  try { await leaveMobileThreadWatch(selectedThread.id); setSelectedThreadId(null); }
                  catch (error) { Alert.alert('Unable to leave', error?.message || 'Please try again.'); }
                }}>
                  <Text style={s.quickBtnText}>Leave</Text>
                </Pressable>
              ) : null}
              {selectedMembership ? (
                <Pressable style={s.quickBtn} onPress={async () => {
                  try { await updateMobileThreadPreferences(selectedThread.id, { isPinned: !selectedMembership.isPinned }); }
                  catch (error) { Alert.alert('Unable to update', error?.message || 'Please try again.'); }
                }}>
                  <Text style={s.quickBtnText}>{selectedMembership.isPinned ? 'Unpin' : 'Pin'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {presentPeers.length > 0 ? (
            <Text style={s.presenceText}>Online: {presentPeers.map((p) => p.name || 'Unknown').join(', ')}</Text>
          ) : null}
          {typingPeers.length > 0 ? (
            <Text style={s.typingText}>
              {typingPeers.length === 1
                ? `${typingPeers[0].name} is typing…`
                : `${typingPeers[0].name} and ${typingPeers.length - 1} others are typing…`}
            </Text>
          ) : null}
          {selectedThreadIsOverseen ? (
            <View style={s.overseeNotice}>
              <Text style={s.overseeNoticeTitle}>Viewing as parent oversight</Text>
              <Text style={s.overseeNoticeText}>You can read this thread as a non-participant.</Text>
            </View>
          ) : null}

          <TextInput
            value={messageSearch}
            onChangeText={setMessageSearch}
            placeholder="Search this thread"
            placeholderTextColor={E.inkMuted}
            style={s.searchInput}
          />

          <ScrollView style={s.messagesPane} contentContainerStyle={s.messagesContent}>
            {messages.map((message) => {
              const isOwn = currentUser?.id === message.authorFamilyMemberId;
              const editableUntilMs = message.editableUntil ? new Date(message.editableUntil).getTime() : 0;
              const canEdit = isOwn && editableUntilMs > referenceNowMs && !message.deletedAt;
              const canDelete = (isOwn && editableUntilMs > referenceNowMs) || currentUser?.role === 'parent';
              const isEditing = editingMessageId === message.id;
              const replyTo = getReplyTo(message.replyTo);
              return (
                <View key={message.id} style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
                  <View style={s.bubbleMeta}>
                    <Text style={[s.bubbleAuthor, isOwn && s.bubbleAuthorOwn]}>{getAuthorName(message, familyMemberNamesById)}</Text>
                    <Text style={[s.bubbleTime, isOwn && s.bubbleTimeOwn]}>{formatMessageTime(message.createdAt)}</Text>
                  </View>

                  {replyTo ? (
                    <View style={[s.replyCard, isOwn && s.replyCardOwn]}>
                      <Text style={s.replyLabel}>↩ {getAuthorName(replyTo, familyMemberNamesById)}</Text>
                      <Text style={s.replyText} numberOfLines={2}>{getReplyPreviewText(replyTo)}</Text>
                    </View>
                  ) : null}

                  {isEditing ? (
                    <View style={s.editWrap}>
                      <TextInput value={editingBody} onChangeText={setEditingBody} multiline style={s.messageInput} />
                      <View style={s.rowActions}>
                        <Pressable style={s.ghostBtn} onPress={() => { setEditingMessageId(null); setEditingBody(''); }}>
                          <Text style={s.ghostBtnText}>Cancel</Text>
                        </Pressable>
                        <Pressable style={s.primaryBtn} onPress={async () => {
                          try { await editMobileMessage(message.id, { body: editingBody }); setEditingMessageId(null); setEditingBody(''); }
                          catch (error) { Alert.alert('Unable to edit', error?.message || 'Please try again.'); }
                        }}>
                          <Text style={s.primaryBtnText}>Save</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : message.deletedAt ? (
                    <Text style={[s.messageBody, s.messageDeleted]}>{message.removedReason || 'Message removed'}</Text>
                  ) : (
                    <>
                      {message.body ? <Text style={[s.messageBody, isOwn && s.messageBodyOwn]}>{message.body}</Text> : null}
                      {(message.attachments || []).map((attachment) => (
                        <Pressable key={attachment.id} style={s.attachmentPill} onPress={() => setAttachmentPreview(attachment)}>
                          <Text style={s.attachmentPillText}>{attachment.name}</Text>
                        </Pressable>
                      ))}
                    </>
                  )}

                  <View style={s.reactionsRow}>
                    {['👍', '❤️', '😂'].map((emoji) => (
                      <Pressable
                        key={`${message.id}-${emoji}`}
                        style={s.reactionBtn}
                        onPress={() => { void toggleMobileReaction(message.id, emoji).catch((error) => { Alert.alert('Unable to react', error?.message || 'Please try again.'); }); }}
                      >
                        <Text style={s.reactionBtnText}>
                          {emoji} {(message.reactions || []).filter((r) => r.emoji === emoji).length || ''}
                        </Text>
                      </Pressable>
                    ))}
                    <View style={{ flex: 1 }} />
                    <Pressable style={s.inlineAction} onPress={() => setReplyToMessageId(message.id)}>
                      <Text style={s.inlineActionText}>Reply</Text>
                    </Pressable>
                    {canEdit ? (
                      <Pressable style={s.inlineAction} onPress={() => { setEditingMessageId(message.id); setEditingBody(message.body || ''); }}>
                        <Text style={s.inlineActionText}>Edit</Text>
                      </Pressable>
                    ) : null}
                    {canDelete ? (
                      <Pressable style={s.inlineAction} onPress={() => { void removeMobileMessage(message.id).catch((error) => { Alert.alert('Unable to remove', error?.message || 'Please try again.'); }); }}>
                        <Text style={s.inlineActionText}>Remove</Text>
                      </Pressable>
                    ) : null}
                    {message.importance === 'needs_ack' ? (
                      <Pressable style={s.inlineAction} onPress={() => { void acknowledgeMobileMessage(message.id, 'acknowledged').catch((error) => { Alert.alert('Unable to acknowledge', error?.message || 'Please try again.'); }); }}>
                        <Text style={s.inlineActionText}>
                          {message.acknowledgements?.length ? `${message.acknowledgements.length} ack` : 'Acknowledge'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {replyTarget ? (
            <View style={s.replyBanner}>
              <View style={{ flex: 1 }}>
                <Text style={s.replyBannerLabel}>Replying to {getAuthorName(replyTarget, familyMemberNamesById)}</Text>
                <Text style={s.replyBannerText} numberOfLines={2}>{getReplyPreviewText(replyTarget)}</Text>
              </View>
              <Pressable onPress={() => setReplyToMessageId(null)}>
                <Text style={s.inlineActionText}>Clear</Text>
              </Pressable>
            </View>
          ) : null}

          {selectedMembership || !(currentUser?.role === 'parent' && isOverseeMode) ? (
            <View style={s.composerCard}>
              {currentUser?.role === 'parent' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.importanceRow}>
                  {['normal', 'urgent', 'announcement', 'needs_ack'].map((importance) => (
                    <Pressable
                      key={importance}
                      style={[s.quickBtn, composerImportance === importance && s.quickBtnActive]}
                      onPress={() => setComposerImportance(importance)}
                    >
                      <Text style={[s.quickBtnText, composerImportance === importance && s.quickBtnTextActive]}>{importance}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              <TextInput
                value={composerBody}
                onChangeText={(value) => { setComposerBody(value); typingIndicator.setActive(Boolean(value)); }}
                placeholder="Write a message"
                placeholderTextColor={E.inkMuted}
                multiline
                onBlur={() => typingIndicator.setActive(false)}
                style={s.composerInput}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pendingFilesRow}>
                {pendingFiles.map((file, index) => (
                  <Pressable key={`${file.name}-${index}`} style={s.attachmentPill} onPress={() => setPendingFiles((curr) => curr.filter((_, i) => i !== index))}>
                    <Text style={s.attachmentPillText}>{file.name} ×</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={s.rowActions}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pickersRow}>
                  {[
                    { label: 'Docs', fn: pickAttachmentDocuments },
                    { label: 'Library', fn: pickLibraryMedia },
                    { label: 'Photo', fn: captureCameraImage },
                    { label: 'Video', fn: captureCameraVideo },
                  ].map(({ label, fn }) => (
                    <Pressable key={label} style={s.quickBtn} onPress={async () => {
                      try { const files = await fn(); setPendingFiles((curr) => [...curr, ...files]); }
                      catch (error) { Alert.alert(`Unable to add ${label.toLowerCase()}`, error?.message || 'Please try again.'); }
                    }}>
                      <Text style={s.quickBtnText}>{label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Pressable style={[s.primaryBtn, isSending && s.primaryBtnDisabled]} onPress={handleSendMessage}>
                  <Text style={s.primaryBtnText}>{isSending ? 'Sending…' : 'Send'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={s.noticeCard}>
              <Text style={s.noticeText}>Join this thread to reply from oversee mode.</Text>
            </View>
          )}
        </View>
      )}

      <AttachmentPreviewModal attachment={attachmentPreview} visible={!!attachmentPreview} onClose={() => setAttachmentPreview(null)} />

      {/* Notification prefs modal */}
      <Modal visible={showNotificationPrefs} transparent animationType="fade" onRequestClose={() => setShowNotificationPrefs(false)}>
        <View style={s.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowNotificationPrefs(false)} />
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Notification preferences</Text>
            <View style={s.modalRow}>
              <Text style={s.modalLabel}>Quiet hours</Text>
              <Switch
                value={Boolean(currentUser?.messageQuietHoursEnabled)}
                onValueChange={(value) => { void saveNotificationPrefs({ messageQuietHoursEnabled: value }); }}
                trackColor={{ false: E.border, true: E.ok }}
                thumbColor={E.white}
              />
            </View>
            <View style={s.modalSplitRow}>
              <View style={s.modalField}>
                <Text style={s.modalFieldLabel}>Start</Text>
                <TextInput
                  value={currentUser?.messageQuietHoursStart || '22:00'}
                  onChangeText={(value) => { void saveNotificationPrefs({ messageQuietHoursStart: value }); }}
                  placeholder="22:00"
                  placeholderTextColor={E.inkMuted}
                  style={s.modalInput}
                />
              </View>
              <View style={s.modalField}>
                <Text style={s.modalFieldLabel}>End</Text>
                <TextInput
                  value={currentUser?.messageQuietHoursEnd || '07:00'}
                  onChangeText={(value) => { void saveNotificationPrefs({ messageQuietHoursEnd: value }); }}
                  placeholder="07:00"
                  placeholderTextColor={E.inkMuted}
                  style={s.modalInput}
                />
              </View>
            </View>
            <Text style={s.modalFieldLabel}>Delivery</Text>
            <View style={s.quickRow}>
              {['immediate', 'digest'].map((mode) => (
                <Pressable
                  key={mode}
                  style={[s.quickBtn, (currentUser?.messageDigestMode || 'immediate') === mode && s.quickBtnActive]}
                  onPress={() => { void saveNotificationPrefs({ messageDigestMode: mode }); }}
                >
                  <Text style={[s.quickBtnText, (currentUser?.messageDigestMode || 'immediate') === mode && s.quickBtnTextActive]}>{mode}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.modalFieldLabel}>Digest every (minutes)</Text>
            <TextInput
              value={String(currentUser?.messageDigestWindowMinutes ?? 30)}
              keyboardType="number-pad"
              onChangeText={(value) => { void saveNotificationPrefs({ messageDigestWindowMinutes: Number(value || 30) }); }}
              placeholder="30"
              placeholderTextColor={E.inkMuted}
              style={s.modalInput}
            />
            <Pressable style={[s.primaryBtn, { alignSelf: 'flex-end' }]} onPress={() => setShowNotificationPrefs(false)}>
              <Text style={s.primaryBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: E.bg },

  // List pane
  listPane:        { flex: 1, backgroundColor: E.bg },
  listHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP.md, paddingTop: SP.md, paddingBottom: SP.sm, gap: SP.sm },
  listTitle:       { fontFamily: 'serif', fontSize: 28, fontWeight: '700', color: E.ink },
  listHeaderActions: { flexDirection: 'row', gap: SP.xs },
  headerBtn:       { borderWidth: 1, borderColor: E.border, borderRadius: R.pill, backgroundColor: E.bgDeep, paddingHorizontal: SP.sm, paddingVertical: 6 },
  headerBtnActive: { borderColor: E.ink, backgroundColor: E.ink },
  headerBtnText:   { fontSize: 12, fontWeight: '500', color: E.inkSub },
  headerBtnTextActive: { color: E.white },

  searchInput: {
    marginHorizontal: SP.md,
    minHeight: 42,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: E.border,
    backgroundColor: E.bgDeep,
    color: E.ink,
    paddingHorizontal: SP.sm,
    paddingVertical: SP.xs,
    fontSize: 14,
  },

  // Quick row
  quickRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: SP.xs, paddingHorizontal: SP.md },
  quickBtn:      { minHeight: 34, paddingHorizontal: SP.sm, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  quickBtnActive:{ borderColor: E.ink, backgroundColor: E.ink },
  quickBtnText:  { fontSize: 12, fontWeight: '500', color: E.inkSub },
  quickBtnTextActive: { color: E.white },

  // Compose card
  composeCard:         { marginHorizontal: SP.md, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.sm },
  composeTitle:        { fontFamily: 'serif', fontSize: 16, fontWeight: '700', color: E.ink },
  memberPicker:        { maxHeight: 200 },
  memberPickerContent: { gap: SP.xs },
  memberRow:           { paddingVertical: 10, paddingHorizontal: SP.sm, borderRadius: R.md },
  memberRowActive:     { backgroundColor: E.bgDeep },
  memberRowText:       { fontSize: 14, color: E.inkSub, fontWeight: '400' },
  memberRowTextActive: { color: E.ink, fontWeight: '600' },

  // Thread list
  threadList:          { gap: SP.sm, paddingHorizontal: SP.md, paddingTop: SP.sm, paddingBottom: 80 },
  threadCard:          { borderRadius: R.lg, borderWidth: 1, borderColor: E.border, backgroundColor: E.surface, padding: SP.md, gap: SP.xs },
  threadCardOverseen:  { borderColor: E.accentDeep, backgroundColor: E.bgDeep },
  threadHead:          { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SP.sm },
  threadTitle:         { fontFamily: 'serif', fontSize: 15, fontWeight: '700', color: E.ink, flex: 1 },
  threadBadges:        { flexDirection: 'row', alignItems: 'center', gap: 5 },
  overseeTag:          { fontSize: 9, fontWeight: '600', color: E.accentDeep, borderWidth: 1, borderColor: E.accentDeep, borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 2 },
  unreadDot:           { width: 7, height: 7, borderRadius: 4, backgroundColor: E.ink },
  threadMembers:       { fontSize: 11, color: E.inkMuted, fontWeight: '300' },
  threadPreview:       { fontSize: 13, color: E.inkSub, fontWeight: '300', lineHeight: 18 },
  threadMeta:          { flexDirection: 'row', justifyContent: 'space-between', gap: SP.sm },
  threadMetaText:      { fontSize: 10, color: E.inkMuted, fontWeight: '400' },

  centerCard:  { alignItems: 'center', gap: SP.sm, padding: SP.lg },
  centerText:  { fontSize: 13, color: E.inkMuted, fontWeight: '300' },

  // Thread pane
  threadPane:   { flex: 1, backgroundColor: E.bg },
  threadTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP.md, paddingVertical: SP.sm, borderBottomWidth: 1, borderBottomColor: E.borderLight, gap: SP.sm },
  threadTopBarActions: { flexDirection: 'row', gap: SP.xs },
  backBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backChevron:  { width: 7, height: 7, borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderColor: E.inkSub, transform: [{ rotate: '45deg' }] },
  backBtnText:  { fontSize: 14, color: E.inkSub, fontWeight: '500' },

  presenceText: { fontSize: 11, color: E.ok, paddingHorizontal: SP.md, paddingTop: 4, fontWeight: '400' },
  typingText:   { fontSize: 11, color: E.inkMuted, paddingHorizontal: SP.md, fontStyle: 'italic', fontWeight: '300' },

  overseeNotice:      { marginHorizontal: SP.md, borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, padding: SP.sm, gap: 3 },
  overseeNoticeTitle: { fontFamily: 'serif', fontSize: 13, fontWeight: '700', color: E.ink },
  overseeNoticeText:  { fontSize: 12, color: E.inkMuted, fontWeight: '300' },

  // Messages
  messagesPane:    { flex: 1 },
  messagesContent: { paddingHorizontal: SP.md, paddingTop: SP.sm, paddingBottom: SP.lg, gap: SP.sm },

  bubble:         { maxWidth: '85%', gap: 4 },
  bubbleOwn:      { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleOther:    { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubbleMeta:     { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bubbleAuthor:   { fontSize: 11, color: E.inkMuted, fontWeight: '500' },
  bubbleAuthorOwn:{ color: E.inkMuted },
  bubbleTime:     { fontSize: 10, color: E.inkMuted, fontWeight: '300' },
  bubbleTimeOwn:  { color: E.inkMuted },

  replyCard:     { borderLeftWidth: 2, borderLeftColor: E.border, paddingLeft: SP.xs, marginBottom: 2, gap: 1 },
  replyCardOwn:  { borderLeftColor: E.accentDeep },
  replyLabel:    { fontSize: 10, color: E.inkMuted, fontWeight: '500' },
  replyText:     { fontSize: 12, color: E.inkMuted, fontWeight: '300', lineHeight: 16 },

  messageBody:    { fontSize: 14, color: E.ink, lineHeight: 20, backgroundColor: E.surface, borderRadius: R.md, borderWidth: 1, borderColor: E.borderLight, paddingHorizontal: SP.sm, paddingVertical: SP.xs },
  messageBodyOwn: { backgroundColor: E.ink, color: E.white, borderColor: E.ink },
  messageDeleted: { fontSize: 13, color: E.inkMuted, fontStyle: 'italic', fontWeight: '300', backgroundColor: 'transparent', borderWidth: 0 },

  attachmentPill:     { borderWidth: 1, borderColor: E.border, borderRadius: R.pill, backgroundColor: E.bgDeep, paddingHorizontal: SP.sm, paddingVertical: 5, marginTop: 2 },
  attachmentPillText: { fontSize: 12, color: E.inkSub, fontWeight: '400' },

  editWrap:   { gap: SP.xs },
  messageInput: { minHeight: 80, borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bgDeep, padding: SP.sm, color: E.ink, fontSize: 14, textAlignVertical: 'top' },

  reactionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  reactionBtn:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill, borderWidth: 1, borderColor: E.borderLight, backgroundColor: E.bgDeep },
  reactionBtnText: { fontSize: 12 },
  inlineAction:     { paddingHorizontal: 6, paddingVertical: 3 },
  inlineActionText: { fontSize: 11, color: E.inkMuted, fontWeight: '400' },

  replyBanner:        { flexDirection: 'row', alignItems: 'center', gap: SP.sm, paddingHorizontal: SP.md, paddingVertical: SP.xs, borderTopWidth: 1, borderTopColor: E.borderLight, backgroundColor: E.bgDeep },
  replyBannerLabel:   { fontSize: 11, color: E.inkSub, fontWeight: '500' },
  replyBannerText:    { fontSize: 12, color: E.inkMuted, fontWeight: '300', lineHeight: 16 },

  // Composer
  composerCard:     { borderTopWidth: 1, borderTopColor: E.borderLight, backgroundColor: E.bg, paddingHorizontal: SP.md, paddingTop: SP.sm, paddingBottom: SP.md, gap: SP.sm },
  importanceRow:    { gap: SP.xs, paddingBottom: 2 },
  composerInput:    { minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bgDeep, padding: SP.sm, color: E.ink, fontSize: 14, textAlignVertical: 'top' },
  pendingFilesRow:  { gap: SP.xs },
  pickersRow:       { gap: SP.xs, flex: 1 },

  rowActions:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  ghostBtn:     { minHeight: 36, paddingHorizontal: SP.md, borderRadius: R.pill, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, alignItems: 'center', justifyContent: 'center' },
  ghostBtnText: { fontSize: 13, color: E.inkSub, fontWeight: '400' },
  primaryBtn:        { minHeight: 36, paddingHorizontal: SP.md, borderRadius: R.pill, backgroundColor: E.ink, borderWidth: 1, borderColor: E.ink, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled:{ opacity: 0.4 },
  primaryBtnText:    { fontSize: 13, color: E.white, fontWeight: '600' },

  noticeCard: { margin: SP.md, borderRadius: R.md, borderWidth: 1, borderColor: E.border, backgroundColor: E.bgDeep, padding: SP.md, alignItems: 'center' },
  noticeText: { fontSize: 13, color: E.inkMuted, fontWeight: '300' },

  // Notification prefs modal
  modalOverlay:   { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(17,17,17,0.25)', paddingHorizontal: SP.lg },
  modalCard:      { backgroundColor: E.bg, borderRadius: R.lg, borderWidth: 1, borderColor: E.border, padding: SP.lg, gap: SP.md, width: '100%' },
  modalTitle:     { fontFamily: 'serif', fontSize: 20, fontWeight: '700', color: E.ink },
  modalRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SP.sm },
  modalLabel:     { fontSize: 14, color: E.ink, fontWeight: '400' },
  modalSplitRow:  { flexDirection: 'row', gap: SP.sm },
  modalField:     { flex: 1, gap: 4 },
  modalFieldLabel:{ fontSize: 10, color: E.inkMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  modalInput:     { borderWidth: 1, borderColor: E.border, borderRadius: R.md, backgroundColor: E.bgDeep, paddingHorizontal: SP.sm, paddingVertical: 9, color: E.ink, fontSize: 14 },
});

