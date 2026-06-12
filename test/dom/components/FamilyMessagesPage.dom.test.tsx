// @vitest-environment jsdom

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advanceTimeByAsync, freezeTime } from '@/test/utils/fake-clock';

const familyMessagesMocks = vi.hoisted(() => ({
    currentUser: {
        id: 'member-1',
        name: 'Alex',
        role: 'child',
    },
    routerReplace: vi.fn(),
    toast: vi.fn(),
    useQuery: vi.fn(),
    typingSetActive: vi.fn(),
    bootstrapMessages: vi.fn(),
    getMessageServerTime: vi.fn(),
    createThread: vi.fn(),
    sendMessage: vi.fn(),
    editMessage: vi.fn(),
    removeMessage: vi.fn(),
    toggleReaction: vi.fn(),
    acknowledge: vi.fn(),
    markRead: vi.fn(),
    updateThreadPreferences: vi.fn(),
    joinThreadWatch: vi.fn(),
    leaveThreadWatch: vi.fn(),
    uploadFilesToS3: vi.fn(),
}));

vi.mock('@instantdb/react', () => ({
    id: vi.fn(() => 'optimistic-id'),
    tx: {
        familyMembers: new Proxy(
            {},
            {
                get() {
                    return {
                        update: vi.fn(() => ({ op: 'update-family-member' })),
                    };
                },
            }
        ),
    },
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({
        replace: familyMessagesMocks.routerReplace,
    }),
    useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/components/AuthProvider', () => ({
    useAuth: () => ({
        currentUser: familyMessagesMocks.currentUser,
    }),
}));

vi.mock('@/components/ui/use-toast', () => ({
    useToast: () => ({
        toast: familyMessagesMocks.toast,
    }),
}));

vi.mock('@/components/ui/button', () => ({
    Button: ({ children, type = 'button', ...props }: any) => (
        <button type={type} {...props}>
            {children}
        </button>
    ),
}));

vi.mock('@/components/ui/input', () => ({
    Input: (props: any) => <input {...props} />,
}));

vi.mock('@/components/ui/scroll-area', () => ({
    ScrollArea: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@/components/attachments/AttachmentCollection', () => ({
    AttachmentCollection: ({ attachments }: any) => <div>{attachments?.length || 0} attachments</div>,
}));

vi.mock('@/lib/file-uploads', () => ({
    uploadFilesToS3: familyMessagesMocks.uploadFilesToS3,
}));

vi.mock('@/lib/message-client', () => ({
    acknowledge: familyMessagesMocks.acknowledge,
    bootstrapMessages: familyMessagesMocks.bootstrapMessages,
    createThread: familyMessagesMocks.createThread,
    editMessage: familyMessagesMocks.editMessage,
    getMessageServerTime: familyMessagesMocks.getMessageServerTime,
    joinThreadWatch: familyMessagesMocks.joinThreadWatch,
    leaveThreadWatch: familyMessagesMocks.leaveThreadWatch,
    markRead: familyMessagesMocks.markRead,
    removeMessage: familyMessagesMocks.removeMessage,
    sendMessage: familyMessagesMocks.sendMessage,
    toggleReaction: familyMessagesMocks.toggleReaction,
    updateThreadPreferences: familyMessagesMocks.updateThreadPreferences,
}));

vi.mock('@/lib/db', () => ({
    db: {
        useQuery: familyMessagesMocks.useQuery,
        room: vi.fn(() => 'message-room'),
        rooms: {
            usePresence: vi.fn(() => ({ peers: {} })),
            useSyncPresence: vi.fn(),
            useTypingIndicator: vi.fn(() => ({
                active: [],
                setActive: familyMessagesMocks.typingSetActive,
            })),
        },
    },
}));

import FamilyMessagesPage from '@/components/messages/FamilyMessagesPage';

function installQueryMocks(
    messageOverrides: Record<string, any> = {},
    options: {
        membershipRows?: any[];
        threads?: any[];
        familyMembers?: any[];
        messages?: any[];
    } = {}
) {
    const membershipRows = options.membershipRows || [
        {
            id: 'membership-1',
            familyMemberId: 'member-1',
            threadId: 'thread-1',
            memberRole: 'member',
            notificationLevel: 'all',
            isArchived: false,
            isPinned: false,
            lastReadAt: '2026-03-15T10:01:00.000Z',
        },
    ];

    const threads = options.threads || [
        {
            id: 'thread-1',
            title: 'Family',
            threadType: 'family',
            latestMessageAt: '2026-03-15T10:02:00.000Z',
            latestMessagePreview: 'Hello from the server',
            members: [
                {
                    familyMember: [{ id: 'member-1', name: 'Alex' }],
                },
            ],
        },
    ];

    const messages = options.messages || [
        {
            id: 'message-1',
            threadId: 'thread-1',
            body: 'Hello from the server',
            createdAt: '2026-03-15T10:00:00.000Z',
            editableUntil: '2026-03-15T10:05:00.000Z',
            authorFamilyMemberId: 'member-1',
            deletedAt: null,
            removedReason: null,
            attachments: [],
            author: { id: 'member-1', name: 'Alex' },
            reactions: [],
            acknowledgements: [],
            replyTo: null,
            ...messageOverrides,
        },
    ];

    const familyMembers = options.familyMembers || [
        { id: 'member-1', name: 'Alex', role: 'child' },
        { id: 'member-2', name: 'Pat', role: 'parent' },
    ];

    familyMessagesMocks.useQuery.mockImplementation((query: any) => {
        if (!query) {
            return { data: {}, isLoading: false, error: null };
        }
        if (query.messageThreadMembers) {
            return {
                data: { messageThreadMembers: membershipRows },
                isLoading: false,
                error: null,
            };
        }
        if (query.messageThreads) {
            return {
                data: { messageThreads: threads },
                isLoading: false,
                error: null,
            };
        }
        if (query.messages) {
            return {
                data: { messages },
                isLoading: false,
                error: null,
            };
        }
        if (query.familyMembers) {
            return {
                data: {
                    familyMembers,
                },
                isLoading: false,
                error: null,
            };
        }
        return { data: {}, isLoading: false, error: null };
    });
}

async function flushMessagingPage() {
    await act(async () => {
        await advanceTimeByAsync(0);
        await advanceTimeByAsync(0);
    });
}

function hasExactText(text: string) {
    return (_content: string, node: Element | null) => node?.textContent === text;
}

describe('FamilyMessagesPage', () => {
    beforeEach(() => {
        freezeTime('2026-03-15T11:30:00.000Z');
        vi.spyOn(console, 'info').mockImplementation(() => {});
        familyMessagesMocks.currentUser.id = 'member-1';
        familyMessagesMocks.currentUser.name = 'Alex';
        familyMessagesMocks.currentUser.role = 'child';
        familyMessagesMocks.routerReplace.mockReset();
        familyMessagesMocks.toast.mockReset();
        familyMessagesMocks.useQuery.mockReset();
        familyMessagesMocks.typingSetActive.mockReset();
        familyMessagesMocks.bootstrapMessages.mockReset();
        familyMessagesMocks.getMessageServerTime.mockReset();
        familyMessagesMocks.createThread.mockReset();
        familyMessagesMocks.sendMessage.mockReset();
        familyMessagesMocks.editMessage.mockReset();
        familyMessagesMocks.removeMessage.mockReset();
        familyMessagesMocks.toggleReaction.mockReset();
        familyMessagesMocks.acknowledge.mockReset();
        familyMessagesMocks.markRead.mockReset();
        familyMessagesMocks.updateThreadPreferences.mockReset();
        familyMessagesMocks.joinThreadWatch.mockReset();
        familyMessagesMocks.leaveThreadWatch.mockReset();
        familyMessagesMocks.uploadFilesToS3.mockReset();

        familyMessagesMocks.bootstrapMessages.mockResolvedValue({});
        familyMessagesMocks.createThread.mockResolvedValue({});
        familyMessagesMocks.sendMessage.mockResolvedValue({});
        familyMessagesMocks.editMessage.mockResolvedValue({});
        familyMessagesMocks.removeMessage.mockResolvedValue({});
        familyMessagesMocks.toggleReaction.mockResolvedValue({});
        familyMessagesMocks.acknowledge.mockResolvedValue({});
        familyMessagesMocks.markRead.mockResolvedValue({});
        familyMessagesMocks.updateThreadPreferences.mockResolvedValue({});
        familyMessagesMocks.joinThreadWatch.mockResolvedValue({});
        familyMessagesMocks.leaveThreadWatch.mockResolvedValue({});
        familyMessagesMocks.uploadFilesToS3.mockResolvedValue([]);
        installQueryMocks();
    });

    it('shows Edit for your own message when the server clock says the edit window is still open', async () => {
        familyMessagesMocks.getMessageServerTime.mockResolvedValue({
            serverNow: '2026-03-15T10:04:00.000Z',
        });

        render(<FamilyMessagesPage />);
        await flushMessagingPage();

        expect(screen.getAllByText('Hello from the server').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('hides Edit after the server clock says the edit window has expired, even if the client clock is behind', async () => {
        freezeTime('2026-03-15T10:04:00.000Z');
        familyMessagesMocks.getMessageServerTime.mockResolvedValue({
            serverNow: '2026-03-15T10:06:00.000Z',
        });

        render(<FamilyMessagesPage />);
        await flushMessagingPage();

        expect(screen.getAllByText('Hello from the server').length).toBeGreaterThan(0);
        expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    });

    it('keeps long thread previews constrained inside the thread card layout', async () => {
        const longPreview = 'This is a very long thread preview that should stay clamped inside the card instead of pushing the badges or timestamp out of place.';
        familyMessagesMocks.getMessageServerTime.mockResolvedValue({
            serverNow: '2026-03-15T10:04:00.000Z',
        });
        installQueryMocks({
            body: 'Short body',
        });
        familyMessagesMocks.useQuery.mockImplementation((query: any) => {
            if (!query) {
                return { data: {}, isLoading: false, error: null };
            }
            if (query.messageThreadMembers) {
                return {
                    data: {
                        messageThreadMembers: [
                            {
                                id: 'membership-1',
                                familyMemberId: 'member-1',
                                threadId: 'thread-1',
                                memberRole: 'member',
                                notificationLevel: 'all',
                                isArchived: false,
                                isPinned: false,
                                lastReadAt: '2026-03-15T10:01:00.000Z',
                            },
                        ],
                    },
                    isLoading: false,
                    error: null,
                };
            }
            if (query.messageThreads) {
                return {
                    data: {
                        messageThreads: [
                            {
                                id: 'thread-1',
                                title: 'Boys',
                                threadType: 'group',
                                latestMessageAt: '2026-03-15T10:02:00.000Z',
                                latestMessagePreview: longPreview,
                                members: [{ familyMember: [{ id: 'member-1', name: 'Alex' }] }],
                            },
                        ],
                    },
                    isLoading: false,
                    error: null,
                };
            }
            if (query.messages) {
                return {
                    data: {
                        messages: [
                            {
                                id: 'message-1',
                                threadId: 'thread-1',
                                body: 'Short body',
                                createdAt: '2026-03-15T10:00:00.000Z',
                                editableUntil: '2026-03-15T10:05:00.000Z',
                                authorFamilyMemberId: 'member-1',
                                deletedAt: null,
                                removedReason: null,
                                attachments: [],
                                author: { id: 'member-1', name: 'Alex' },
                                reactions: [],
                                acknowledgements: [],
                                replyTo: null,
                            },
                        ],
                    },
                    isLoading: false,
                    error: null,
                };
            }
            if (query.familyMembers) {
                return {
                    data: {
                        familyMembers: [
                            { id: 'member-1', name: 'Alex', role: 'child' },
                            { id: 'member-2', name: 'Pat', role: 'parent' },
                        ],
                    },
                    isLoading: false,
                    error: null,
                };
            }
            return { data: {}, isLoading: false, error: null };
        });

        render(<FamilyMessagesPage />);
        await flushMessagingPage();

        expect(screen.getByText(longPreview)).toHaveClass('line-clamp-2');
        expect(screen.getByText(longPreview)).toHaveClass('break-words');
    });

    it('shows a quoted reply preview while composing', async () => {
        familyMessagesMocks.getMessageServerTime.mockResolvedValue({
            serverNow: '2026-03-15T10:04:00.000Z',
        });

        render(<FamilyMessagesPage />);
        await flushMessagingPage();

        fireEvent.click(screen.getByRole('button', { name: 'Reply' }));

        expect(screen.getByText(hasExactText('Replying to Alex'))).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    });

    it('requests nested reply data and renders quoted reply context on sent messages', async () => {
        familyMessagesMocks.getMessageServerTime.mockResolvedValue({
            serverNow: '2026-03-15T10:04:00.000Z',
        });
        installQueryMocks({
            id: 'message-2',
            body: 'Following up here',
            replyTo: {
                id: 'message-1',
                body: 'Original context from Pat',
                createdAt: '2026-03-15T09:59:00.000Z',
                authorFamilyMemberId: 'member-2',
                author: { id: 'member-2', name: 'Pat' },
                attachments: [],
                deletedAt: null,
            },
        });

        render(<FamilyMessagesPage />);
        await flushMessagingPage();

        const messageQueryCall = familyMessagesMocks.useQuery.mock.calls.find(([query]) => query?.messages);
        expect(messageQueryCall?.[0]?.messages?.replyTo).toEqual({
            author: {},
            attachments: {},
        });
        expect(screen.getByText(hasExactText('Reply to Pat'))).toBeInTheDocument();
        expect(screen.getByText('Original context from Pat')).toBeInTheDocument();
    });

    it('subscribes to reactions and calls the reaction toggle handler when an emoji is pressed', async () => {
        familyMessagesMocks.getMessageServerTime.mockResolvedValue({
            serverNow: '2026-03-15T10:04:00.000Z',
        });

        render(<FamilyMessagesPage />);
        await flushMessagingPage();

        const messageQueryCall = familyMessagesMocks.useQuery.mock.calls.find(([query]) => query?.messages);
        expect(messageQueryCall?.[0]?.messages?.reactions).toEqual({
            familyMember: {},
        });

        fireEvent.click(screen.getByRole('button', { name: '👍' }));

        expect(familyMessagesMocks.toggleReaction).toHaveBeenCalledWith({ messageId: 'message-1', emoji: '👍' });
    });

    it('shows member names for named groups and visually marks overseen threads', async () => {
        familyMessagesMocks.currentUser.id = 'member-2';
        familyMessagesMocks.currentUser.name = 'Pat';
        familyMessagesMocks.currentUser.role = 'parent';
        familyMessagesMocks.getMessageServerTime.mockResolvedValue({
            serverNow: '2026-03-15T10:04:00.000Z',
        });
        installQueryMocks(
            {},
            {
                membershipRows: [],
                threads: [
                    {
                        id: 'thread-1',
                        title: 'Boys',
                        threadType: 'group',
                        latestMessageAt: '2026-03-15T10:02:00.000Z',
                        latestMessagePreview: 'Plans for the weekend',
                        members: [
                            { familyMember: [{ id: 'member-1', name: 'Alex' }] },
                            { familyMember: [{ id: 'member-3', name: 'Sam' }] },
                        ],
                    },
                ],
                familyMembers: [
                    { id: 'member-1', name: 'Alex', role: 'child' },
                    { id: 'member-2', name: 'Pat', role: 'parent' },
                    { id: 'member-3', name: 'Sam', role: 'child' },
                ],
            }
        );

        render(<FamilyMessagesPage />);
        await flushMessagingPage();
        fireEvent.click(screen.getByRole('button', { name: 'Inbox' }));
        await flushMessagingPage();

        const threadCard = screen.getByRole('button', { name: /boys/i });
        expect(screen.getAllByText('Alex, Sam').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Oversee').length).toBeGreaterThan(0);
        expect(threadCard).toHaveClass('border-violet-300');
        expect(screen.getByText('Viewing as parent oversight')).toBeInTheDocument();
    });
});
