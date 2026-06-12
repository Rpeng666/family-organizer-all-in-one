'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { id, tx } from '@instantdb/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/components/AuthProvider';
import { db } from '@/lib/db';
import { uploadFilesToS3 } from '@/lib/file-uploads';
import {
    bootstrapMessages,
    createThread,
    getMessageServerTime,
    markRead,
    sendMessage,
} from '@/lib/message-client';
import {
    createMessageServerTimeAnchor,
    getMessageServerNowMs,
    getMonotonicNowMs,
    type MessageServerTimeAnchor,
} from '@/lib/message-server-time';
import { ThreadList } from './ThreadList';
import { MessageThread } from './MessageThread';
import { getDraftKey, sortThreads, getAuthorName } from './message-utils';
import { cn } from '@/lib/utils';
import type { MembershipRow, MessageRecord, ThreadRecord } from './message-types';

export default function FamilyMessagesPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { currentUser } = useAuth();

    // UI state
    const [threadSearch, setThreadSearch] = useState('');
    const [messageSearch, setMessageSearch] = useState('');
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [composerBody, setComposerBody] = useState('');
    const [composerImportance, setComposerImportance] = useState<'normal' | 'urgent' | 'announcement' | 'needs_ack'>('normal');
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [isSending, setIsSending] = useState(false);
    const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editingBody, setEditingBody] = useState('');
    const [isOverseeMode, setIsOverseeMode] = useState(false);
    const [creationMode, setCreationMode] = useState<'direct' | 'group' | null>(null);
    const [newThreadTitle, setNewThreadTitle] = useState('');
    const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
    const [isCreatingThread, setIsCreatingThread] = useState(false);
    const [browserNotificationPermission, setBrowserNotificationPermission] = useState<string>('default');
    const [showNotificationPrefs, setShowNotificationPrefs] = useState(false);
    const [optimisticThreadsById, setOptimisticThreadsById] = useState<Record<string, ThreadRecord>>({});
    const [optimisticMessages, setOptimisticMessages] = useState<MessageRecord[]>([]);
    const [relativeNowMs, setRelativeNowMs] = useState(() => getMonotonicNowMs());
    const [serverNowAnchor, setServerNowAnchor] = useState<MessageServerTimeAnchor | null>(null);

    const initialThreadId = searchParams.get('threadId');
    const hasAppliedInitialThread = useRef(false);
    const searchParamString = searchParams.toString();

    // ── Queries ────────────────────────────────────────────────────────────────

    const membershipQuery = (db as any).useQuery(
        currentUser ? { messageThreadMembers: {} } : (null as any)
    ) as any;

    const overseenThreadsQuery = (db as any).useQuery(
        currentUser?.role === 'parent' && isOverseeMode
            ? { messageThreads: { $: { order: { latestMessageAt: 'desc' } } } }
            : (null as any)
    ) as any;

    const visibleThreadsQuery = (db as any).useQuery(
        currentUser ? { messageThreads: {} } : (null as any)
    ) as any;

    const messagesQuery = (db as any).useQuery(
        currentUser && selectedThreadId
            ? {
                  messages: {
                      $: { where: { threadId: selectedThreadId }, order: { createdAt: 'asc' } },
                      attachments: {},
                      author: {},
                      reactions: { familyMember: {} },
                      acknowledgements: { familyMember: {} },
                      replyTo: { author: {}, attachments: {} },
                  },
              }
            : (null as any)
    ) as any;

    const familyMembersQuery = (db as any).useQuery(
        currentUser ? { familyMembers: { $: { order: { order: 'asc' } } } } : (null as any)
    ) as any;

    // ── Presence ───────────────────────────────────────────────────────────────

    const threadRoom = useMemo(
        () => (db as any).room('messageThreads', selectedThreadId || '_idle'),
        [selectedThreadId]
    );
    const threadPresence = (db as any).rooms.usePresence(threadRoom, {
        initialPresence: {
            activeThread: Boolean(selectedThreadId),
            avatarUrl: currentUser?.photoUrls?.['64'] || currentUser?.photoUrls?.['320'] || '',
            composer: false,
            familyMemberId: currentUser?.id || '_idle',
            name: currentUser?.name || 'Guest',
        },
        keys: ['activeThread', 'composer', 'familyMemberId', 'name'],
    }) as any;
    (db as any).rooms.useSyncPresence(
        threadRoom,
        {
            activeThread: Boolean(selectedThreadId),
            avatarUrl: currentUser?.photoUrls?.['64'] || currentUser?.photoUrls?.['320'] || '',
            familyMemberId: currentUser?.id || '_idle',
            name: currentUser?.name || 'Guest',
        },
        [currentUser?.id, currentUser?.name, currentUser?.photoUrls?.['64'], selectedThreadId]
    );
    const typingIndicator = (db as any).rooms.useTypingIndicator(threadRoom, 'composer', {
        timeout: 1500,
        stopOnEnter: false,
    }) as any;

    // ── Derived data ───────────────────────────────────────────────────────────

    const familyMembers = useMemo(
        () => (familyMembersQuery?.data?.familyMembers as any[]) || [],
        [familyMembersQuery?.data?.familyMembers]
    );
    const familyMemberNamesById = useMemo(
        () => new Map(familyMembers.map((m: any) => [m.id, m.name || 'Unknown'])),
        [familyMembers]
    );

    const threads = useMemo(() => {
        const memberships = ((membershipQuery?.data?.messageThreadMembers as unknown) as MembershipRow[]) || [];
        const membershipMap = new Map<string, MembershipRow>();
        const threadsById = new Map<string, ThreadRecord>();

        for (const membership of memberships) {
            if (!membership?.threadId) continue;
            membershipMap.set(membership.threadId, membership);
        }

        const visibleThreads = (visibleThreadsQuery?.data?.messageThreads as ThreadRecord[]) || [];
        for (const thread of visibleThreads) {
            if (!thread?.id) continue;
            threadsById.set(thread.id, {
                ...thread,
                membership: membershipMap.get(thread.id) || threadsById.get(thread.id)?.membership || null,
            });
        }

        if (currentUser?.role === 'parent' && isOverseeMode) {
            const overseenThreads = (overseenThreadsQuery?.data?.messageThreads as ThreadRecord[]) || [];
            for (const thread of overseenThreads) {
                threadsById.set(thread.id, { ...thread, membership: membershipMap.get(thread.id) || null });
            }
        }

        for (const thread of Object.values(optimisticThreadsById)) {
            if (!thread?.id) continue;
            threadsById.set(thread.id, {
                ...thread,
                membership: membershipMap.get(thread.id) || thread.membership || null,
            });
        }

        return sortThreads(Array.from(threadsById.values())).filter((thread) => {
            if (thread.membership?.isArchived) return false;
            if (
                currentUser?.role === 'parent' &&
                !isOverseeMode &&
                !thread.membership &&
                !optimisticThreadsById[thread.id]
            ) return false;
            const query = threadSearch.trim().toLowerCase();
            if (!query) return true;
            const haystack = [
                thread.title || '',
                thread.latestMessagePreview || '',
                ...(thread.members || []).map(
                    (m: any) => m?.familyMember?.[0]?.name || m?.familyMember?.name || ''
                ),
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(query);
        });
    }, [
        currentUser?.role,
        isOverseeMode,
        membershipQuery?.data?.messageThreadMembers,
        optimisticThreadsById,
        overseenThreadsQuery?.data?.messageThreads,
        threadSearch,
        visibleThreadsQuery?.data?.messageThreads,
    ]);

    const selectedThread = useMemo(
        () => threads.find((t) => t.id === selectedThreadId) || null,
        [selectedThreadId, threads]
    );
    const selectedThreadMembership = selectedThread?.membership || null;

    const messages = useMemo(() => {
        const serverMessages = ((messagesQuery?.data?.messages as MessageRecord[]) || []).filter((m) => {
            const query = messageSearch.trim().toLowerCase();
            if (!query) return true;
            return `${m.body || ''} ${getAuthorName(m, familyMemberNamesById)}`.toLowerCase().includes(query);
        });
        const serverMessageIds = new Set(serverMessages.map((m) => m.id));
        const pendingOptimistic = optimisticMessages.filter(
            (m) => m.threadId === selectedThreadId && !serverMessageIds.has(m.id)
        );
        return [...serverMessages, ...pendingOptimistic];
    }, [familyMemberNamesById, messageSearch, messagesQuery?.data?.messages, optimisticMessages, selectedThreadId]);

    const replyTarget = useMemo(
        () => messages.find((m) => m.id === replyToMessageId) || null,
        [messages, replyToMessageId]
    );
    const typingPeers = useMemo(
        () => (typingIndicator?.active || []).filter((p: any) => p?.familyMemberId && p.familyMemberId !== currentUser?.id),
        [currentUser?.id, typingIndicator?.active]
    );
    const presentPeers = useMemo(
        () => Object.values(threadPresence?.peers || {}).filter((p: any) => p?.familyMemberId && p.familyMemberId !== currentUser?.id),
        [currentUser?.id, threadPresence?.peers]
    );
    const referenceNowMs = useMemo(
        () => getMessageServerNowMs(serverNowAnchor, relativeNowMs),
        [relativeNowMs, serverNowAnchor]
    );
    const availableParticipants = useMemo(
        () => familyMembers.filter((m: any) => m.id !== currentUser?.id),
        [currentUser?.id, familyMembers]
    );
    const canComposeInThread = Boolean(
        currentUser &&
            selectedThread &&
            (selectedThreadMembership || !(currentUser.role === 'parent' && isOverseeMode))
    );
    const activeMessagesLoading = selectedThreadId ? messagesQuery?.isLoading : false;
    const activeMessagesError = selectedThreadId ? messagesQuery?.error : null;
    const latestRealMessageId = useMemo(() => {
        const real = (messagesQuery?.data?.messages as MessageRecord[]) || [];
        return real.length > 0 ? real[real.length - 1]?.id : null;
    }, [messagesQuery?.data?.messages]);

    // ── Effects ────────────────────────────────────────────────────────────────

    useEffect(() => { void bootstrapMessages().catch(console.error); }, []);

    useEffect(() => {
        const id = window.setInterval(() => setRelativeNowMs(getMonotonicNowMs()), 15_000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (!currentUser?.id) { setServerNowAnchor(null); return; }
        let cancelled = false;
        const sync = async () => {
            try {
                const response = await getMessageServerTime();
                const anchor = createMessageServerTimeAnchor(response?.serverNow);
                if (!cancelled && anchor) setServerNowAnchor(anchor);
            } catch {}
        };
        void sync();
        const timerId = window.setInterval(() => void sync(), 5 * 60 * 1000);
        return () => { cancelled = true; window.clearInterval(timerId); };
    }, [currentUser?.id]);

    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        setBrowserNotificationPermission(window.Notification.permission);
    }, []);

    useEffect(() => {
        if (!hasAppliedInitialThread.current && initialThreadId && threads.some((t) => t.id === initialThreadId)) {
            hasAppliedInitialThread.current = true;
            setSelectedThreadId(initialThreadId);
            return;
        }
        if (!selectedThreadId && threads.length > 0) setSelectedThreadId(threads[0].id);
    }, [initialThreadId, selectedThreadId, threads]);

    useEffect(() => {
        if (!selectedThreadId) return;
        const params = new URLSearchParams(searchParamString);
        params.set('threadId', selectedThreadId);
        router.replace(`/messages?${params.toString()}`, { scroll: false });
    }, [router, searchParamString, selectedThreadId]);

    useEffect(() => {
        const key = getDraftKey(selectedThreadId);
        if (!key) { setComposerBody(''); return; }
        setComposerBody(window.localStorage.getItem(key) || '');
        setPendingFiles([]);
        setReplyToMessageId(null);
        setEditingMessageId(null);
        setEditingBody('');
        setComposerImportance('normal');
    }, [selectedThreadId]);

    useEffect(() => {
        const key = getDraftKey(selectedThreadId);
        if (!key) return;
        if (!composerBody.trim()) { window.localStorage.removeItem(key); return; }
        window.localStorage.setItem(key, composerBody);
    }, [composerBody, selectedThreadId]);

    useEffect(() => {
        if (!selectedThreadId || !latestRealMessageId || !selectedThreadMembership) return;
        void markRead({ threadId: selectedThreadId, lastReadMessageId: latestRealMessageId }).catch(console.error);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latestRealMessageId, selectedThreadId]);

    // ── Handlers ───────────────────────────────────────────────────────────────

    const sendCurrentMessage = async () => {
        if (!currentUser || !selectedThreadId || !canComposeInThread) return;
        if (!composerBody.trim() && pendingFiles.length === 0) return;

        const body = composerBody;
        const importance = composerImportance;
        const replyToId = replyToMessageId;
        const files = pendingFiles;
        const clientTimestamp = new Date().toISOString();
        const optimisticId = id();

        if (body.trim()) {
            const optimistic: MessageRecord = {
                id: optimisticId,
                threadId: selectedThreadId,
                body,
                authorFamilyMemberId: currentUser.id,
                createdAt: clientTimestamp,
                updatedAt: clientTimestamp,
                importance,
                deletedAt: null,
                editedAt: null,
                editableUntil: null,
                removedReason: null,
                replyTo: replyTarget ? { ...replyTarget } : null,
                author: { id: currentUser.id, name: currentUser.name } as any,
                attachments: [],
                _optimistic: true,
            } as any;
            setOptimisticMessages((prev) => [...prev, optimistic]);
        }

        setComposerBody('');
        setPendingFiles([]);
        setReplyToMessageId(null);
        setComposerImportance('normal');
        typingIndicator?.setActive?.(false);
        window.localStorage.removeItem(getDraftKey(selectedThreadId));

        setIsSending(true);
        try {
            const attachments = files.length ? await uploadFilesToS3(files, id) : [];
            await sendMessage({
                threadId: selectedThreadId,
                body,
                attachments,
                replyToMessageId: replyToId,
                importance,
                clientNonce: `${currentUser.id}:${Date.now()}`,
                clientTimestamp,
            });
            setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        } catch (error: any) {
            setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticId));
            toast({ title: 'Message failed', description: error?.message || 'Please try again.', variant: 'destructive' });
        } finally {
            setIsSending(false);
        }
    };

    const saveNotificationPrefs = async (patch: Record<string, any>) => {
        if (!currentUser?.id) return;
        try {
            await db.transact([tx.familyMembers[currentUser.id].update(patch)]);
        } catch (error: any) {
            toast({ title: 'Unable to save notification preferences', description: error?.message || 'Please try again.', variant: 'destructive' });
        }
    };

    const handleCreateThread = async () => {
        if (!currentUser || !creationMode) return;
        setIsCreatingThread(true);
        try {
            const participantIds = creationMode === 'direct' ? selectedParticipantIds.slice(0, 1) : selectedParticipantIds;
            const result = await createThread({
                threadType: creationMode,
                participantIds,
                title: creationMode === 'group' ? newThreadTitle : undefined,
            });
            const threadId = result?.thread?.id;
            if (threadId) {
                setOptimisticThreadsById((prev) => ({ ...prev, [threadId]: result.thread }));
                setSelectedThreadId(threadId);
            }
            setCreationMode(null);
            setNewThreadTitle('');
            setSelectedParticipantIds([]);
        } catch (error: any) {
            toast({ title: 'Unable to create thread', description: error?.message || 'Please try again.', variant: 'destructive' });
        } finally {
            setIsCreatingThread(false);
        }
    };

    const openCanonicalThread = async (threadType: 'family' | 'parents_only') => {
        try {
            const result = await createThread({ threadType });
            const threadId = result?.thread?.id;
            if (threadId) {
                setOptimisticThreadsById((prev) => ({ ...prev, [threadId]: result.thread }));
                setSelectedThreadId(threadId);
            }
        } catch (error: any) {
            toast({
                title: `Unable to open ${threadType === 'family' ? 'family' : 'parents'} thread`,
                description: error?.message || 'Please try again.',
                variant: 'destructive',
            });
        }
    };

    const handleToggleParticipant = (memberId: string) => {
        if (creationMode === 'direct') {
            setSelectedParticipantIds([memberId]);
        } else {
            setSelectedParticipantIds((prev) =>
                prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
            );
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="h-full bg-background">
            <div className="mx-auto flex h-full max-w-7xl gap-5 p-4 md:p-6">
                {/* Thread list — full width on mobile when no thread open, sidebar on desktop */}
                <div className={cn(
                    'flex-shrink-0',
                    selectedThread ? 'hidden md:flex md:w-[clamp(280px,28%,360px)]' : 'flex w-full md:w-[clamp(280px,28%,360px)]',
                )}>
                    <ThreadList
                        threads={threads}
                        selectedThreadId={selectedThreadId}
                        currentUser={currentUser}
                        threadSearch={threadSearch}
                        isOverseeMode={isOverseeMode}
                        showNotificationPrefs={showNotificationPrefs}
                        browserNotificationPermission={browserNotificationPermission}
                        availableParticipants={availableParticipants}
                        creationMode={creationMode}
                        newThreadTitle={newThreadTitle}
                        selectedParticipantIds={selectedParticipantIds}
                        isCreatingThread={isCreatingThread}
                        familyMemberNamesById={familyMemberNamesById}
                        onSelectThread={setSelectedThreadId}
                        onThreadSearchChange={setThreadSearch}
                        onToggleOverseeMode={() => setIsOverseeMode((v) => !v)}
                        onToggleNotificationPrefs={() => setShowNotificationPrefs((v) => !v)}
                        onRequestNotifications={async () => {
                            const result = await window.Notification.requestPermission();
                            setBrowserNotificationPermission(result);
                        }}
                        onOpenCanonicalThread={openCanonicalThread}
                        onSetCreationMode={(mode) => {
                            setCreationMode(mode);
                            if (!mode) setSelectedParticipantIds([]);
                        }}
                        onNewThreadTitleChange={setNewThreadTitle}
                        onToggleParticipant={handleToggleParticipant}
                        onCreateThread={handleCreateThread}
                        onSaveNotificationPrefs={saveNotificationPrefs}
                    />
                </div>

                {/* Thread content — full width on mobile when open, flex-1 on desktop */}
                {selectedThread ? (
                    <MessageThread
                        thread={selectedThread}
                        messages={messages}
                        currentUser={currentUser}
                        familyMemberNamesById={familyMemberNamesById}
                        isOverseeMode={isOverseeMode}
                        messageSearch={messageSearch}
                        onMessageSearchChange={setMessageSearch}
                        presentPeers={presentPeers}
                        typingPeers={typingPeers}
                        referenceNowMs={referenceNowMs}
                        editingMessageId={editingMessageId}
                        editingBody={editingBody}
                        onEditStart={(id, body) => { setEditingMessageId(id); setEditingBody(body); }}
                        onEditCancel={() => { setEditingMessageId(null); setEditingBody(''); }}
                        onEditBodyChange={setEditingBody}
                        replyToMessageId={replyToMessageId}
                        onReply={setReplyToMessageId}
                        replyTarget={replyTarget}
                        onClearReply={() => setReplyToMessageId(null)}
                        composerBody={composerBody}
                        onComposerBodyChange={setComposerBody}
                        composerImportance={composerImportance}
                        onComposerImportanceChange={setComposerImportance}
                        pendingFiles={pendingFiles}
                        onAddFiles={(files) => setPendingFiles((prev) => [...prev, ...files])}
                        onRemoveFile={(index) => setPendingFiles((prev) => prev.filter((_, i) => i !== index))}
                        isSending={isSending}
                        canComposeInThread={canComposeInThread}
                        activeMessagesLoading={activeMessagesLoading}
                        activeMessagesError={activeMessagesError}
                        onSend={sendCurrentMessage}
                        onTypingBlur={() => typingIndicator?.inputProps?.onBlur?.()}
                        onTypingKeyDown={(e) => typingIndicator?.inputProps?.onKeyDown?.(e)}
                    />
                ) : (
                    <section className="hidden md:flex min-w-0 flex-1 items-center justify-center rounded-3xl border border-border/60 bg-card shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                        <p className="text-sm text-muted-foreground/60">Select a thread to start messaging.</p>
                    </section>
                )}
            </div>
        </div>
    );
}
