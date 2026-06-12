import { beforeEach, describe, expect, it, vi } from 'vitest';
import { freezeTime } from '@/test/utils/fake-clock';

const messagingServiceMocks = vi.hoisted(() => {
    const state = {
        message: null as any,
        membership: null as any,
    };

    const query = vi.fn(async (request: any) => {
        if (request?.messages) {
            return {
                messages: state.message ? [state.message] : [],
            };
        }
        if (request?.messageThreadMembers) {
            return {
                messageThreadMembers: state.membership ? [state.membership] : [],
            };
        }
        return {};
    });

    const transact = vi.fn(async (operations: any[]) => {
        for (const operation of operations || []) {
            if (operation?.entity === 'messages' && operation.type === 'update' && state.message?.id === operation.id) {
                state.message = {
                    ...state.message,
                    ...operation.payload,
                };
            }
            if (operation?.entity === 'messageReactions' && operation.type === 'update' && state.message?.id === operation.payload?.messageId) {
                state.message = {
                    ...state.message,
                    reactions: [...(state.message.reactions || []), { ...operation.payload, id: operation.id }],
                };
            }
            if (operation?.entity === 'messageReactions' && operation.type === 'delete') {
                state.message = {
                    ...state.message,
                    reactions: (state.message.reactions || []).filter((reaction: any) => reaction.id !== operation.id),
                };
            }
        }
    });

    const txMessages = new Proxy(
        {},
        {
            get(_target, key) {
                return {
                    update(payload: Record<string, unknown>) {
                        return {
                            entity: 'messages',
                            id: String(key),
                            type: 'update',
                            payload,
                        };
                    },
                    link(payload: Record<string, unknown>) {
                        return {
                            entity: 'messages',
                            id: String(key),
                            type: 'link',
                            payload,
                        };
                    },
                };
            },
        }
    );

    const txMessageReactions = new Proxy(
        {},
        {
            get(_target, key) {
                return {
                    update(payload: Record<string, unknown>) {
                        return {
                            entity: 'messageReactions',
                            id: String(key),
                            type: 'update',
                            payload,
                        };
                    },
                    delete() {
                        return {
                            entity: 'messageReactions',
                            id: String(key),
                            type: 'delete',
                        };
                    },
                };
            },
        }
    );

    const txFamilyMembers = new Proxy(
        {},
        {
            get() {
                return {
                    link(payload: Record<string, unknown>) {
                        return {
                            entity: 'familyMembers',
                            type: 'link',
                            payload,
                        };
                    },
                };
            },
        }
    );

    const getInstantAdminDb = vi.fn(() => ({
        query,
        transact,
        tx: {
            messages: txMessages,
            messageReactions: txMessageReactions,
            familyMembers: txFamilyMembers,
        },
    }));

    return {
        state,
        query,
        transact,
        getInstantAdminDb,
    };
});

vi.mock('@/lib/instant-admin', () => ({
    getInstantAdminDb: messagingServiceMocks.getInstantAdminDb,
}));

describe('messaging-service', () => {
    beforeEach(() => {
        vi.resetModules();
        freezeTime('2026-03-15T10:03:00.000Z');
        messagingServiceMocks.state.message = null;
        messagingServiceMocks.state.membership = null;
        messagingServiceMocks.query.mockClear();
        messagingServiceMocks.transact.mockClear();
        messagingServiceMocks.getInstantAdminDb.mockClear();
    });

    it('lets the author edit a message while the server edit window is still open', async () => {
        messagingServiceMocks.state.message = {
            id: 'message-1',
            authorFamilyMemberId: 'member-1',
            body: 'Original',
            editableUntil: '2026-03-15T10:05:00.000Z',
        };

        const { editThreadMessage } = await import('@/lib/messaging-service');
        const result = await editThreadMessage(
            { id: 'member-1', role: 'child' },
            { messageId: 'message-1', body: ' Updated body ' }
        );

        expect(messagingServiceMocks.transact).toHaveBeenCalledTimes(1);
        expect(messagingServiceMocks.state.message.body).toBe('Updated body');
        expect(messagingServiceMocks.state.message.editedAt).toBe('2026-03-15T10:03:00.000Z');
        expect(messagingServiceMocks.state.message.updatedAt).toBe('2026-03-15T10:03:00.000Z');
        expect(result?.body).toBe('Updated body');
    });

    it('rejects edits after the server edit window expires', async () => {
        freezeTime('2026-03-15T10:06:00.000Z');
        messagingServiceMocks.state.message = {
            id: 'message-1',
            authorFamilyMemberId: 'member-1',
            body: 'Original',
            editableUntil: '2026-03-15T10:05:00.000Z',
        };

        const { editThreadMessage } = await import('@/lib/messaging-service');

        await expect(
            editThreadMessage({ id: 'member-1', role: 'child' }, { messageId: 'message-1', body: 'Too late' })
        ).rejects.toThrow('This message can no longer be edited');

        expect(messagingServiceMocks.transact).not.toHaveBeenCalled();
    });

    it('still lets a parent remove a message after the author window expires', async () => {
        freezeTime('2026-03-15T10:06:00.000Z');
        messagingServiceMocks.state.message = {
            id: 'message-1',
            authorFamilyMemberId: 'child-1',
            body: 'Please remove me',
            editableUntil: '2026-03-15T10:05:00.000Z',
            deletedAt: null,
        };

        const { removeThreadMessage } = await import('@/lib/messaging-service');
        const result = await removeThreadMessage(
            { id: 'parent-1', role: 'parent' },
            { messageId: 'message-1' }
        );

        expect(messagingServiceMocks.transact).toHaveBeenCalledTimes(1);
        expect(messagingServiceMocks.state.message.body).toBe('');
        expect(messagingServiceMocks.state.message.deletedAt).toBe('2026-03-15T10:06:00.000Z');
        expect(messagingServiceMocks.state.message.removedReason).toBe('Removed by parent');
        expect(result?.removedReason).toBe('Removed by parent');
    });

    it('toggles a reaction on and off using the existing message reactions snapshot', async () => {
        messagingServiceMocks.state.membership = {
            id: 'membership-1',
            threadId: 'thread-1',
            familyMemberId: 'member-1',
        };
        messagingServiceMocks.state.message = {
            id: 'message-1',
            thread: [{ id: 'thread-1', members: [{ familyMemberId: 'member-1' }] }],
            reactions: [],
        };

        const { toggleMessageReaction } = await import('@/lib/messaging-service');

        const added = await toggleMessageReaction(
            { id: 'member-1', role: 'child' },
            { messageId: 'message-1', emoji: '🔥' }
        );

        expect(added).toMatchObject({ active: true });
        expect(messagingServiceMocks.state.message.reactions).toHaveLength(1);
        expect(messagingServiceMocks.state.message.reactions[0].emoji).toBe('🔥');

        messagingServiceMocks.state.message = {
            ...messagingServiceMocks.state.message,
            reactions: [
                {
                    id: added.reactionId,
                    emoji: '🔥',
                    reactionKey: `reaction:message-1:member-1:🔥`,
                },
            ],
        };

        const removed = await toggleMessageReaction(
            { id: 'member-1', role: 'child' },
            { messageId: 'message-1', emoji: '🔥' }
        );

        expect(removed).toMatchObject({ active: false, reactionId: added.reactionId });
        expect(messagingServiceMocks.state.message.reactions).toHaveLength(0);
    });
});
