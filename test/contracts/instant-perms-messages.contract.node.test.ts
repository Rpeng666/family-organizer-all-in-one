import { describe, expect, it } from 'vitest';
import rules from '@/instant.perms';

describe('instant.perms message contract', () => {
    it('keeps every message namespace client read-only', () => {
        const perms = rules as any;

        for (const entityName of [
            'messages',
            'messageThreads',
            'messageThreadMembers',
            'messageAttachments',
            'messageAcknowledgements',
            'messageReactions',
            'pushDevices',
        ]) {
            expect(perms[entityName].allow.create, `${entityName} create should stay server-only`).toBe('false');
            expect(perms[entityName].allow.update, `${entityName} update should stay server-only`).toBe('false');
            expect(perms[entityName].allow.delete, `${entityName} delete should stay server-only`).toBe('false');
        }
    });

    it('limits thread and message reads to parents or thread participants', () => {
        const perms = rules as any;

        expect(perms.messageThreads.bind.canViewThread).toBe("isParent || authFamilyMemberId in data.ref('members.familyMember.id')");
        expect(perms.messageThreads.allow.view).toBe('canViewThread');

        expect(perms.messages.bind.canViewMessage).toBe("isParent || authFamilyMemberId in data.ref('thread.members.familyMember.id')");
        expect(perms.messages.allow.view).toBe('canViewMessage');

        expect(perms.messageThreadMembers.bind.canViewMembership).toBe(
            "isParent || authFamilyMemberId == data.familyMemberId || authFamilyMemberId in data.ref('thread.members.familyMember.id')"
        );
        expect(perms.messageThreadMembers.allow.view).toBe('canViewMembership');
    });

    it('inherits attachment, acknowledgement, and reaction visibility from the parent message thread', () => {
        const perms = rules as any;

        for (const entityName of ['messageAttachments', 'messageAcknowledgements', 'messageReactions']) {
            expect(perms[entityName].bind.canViewViaMessage, `${entityName} should inherit message membership visibility`).toBe(
                "isParent || authFamilyMemberId in data.ref('message.thread.members.familyMember.id')"
            );
            expect(perms[entityName].allow.view).toBe('canViewViaMessage');
        }
    });
});
