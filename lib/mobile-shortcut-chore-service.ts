import 'server-only';

import { id } from '@instantdb/admin';
import {
    HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
    getFamilyDayDateUTC,
    getNextChoreSortOrder,
    parseSharedScheduleSettings,
} from '@family-organizer/shared-core';
import { getFamilyMemberById, getInstantAdminDb, listFamilyMemberRoster } from '@/lib/instant-admin';

export type ShortcutFamilyMember = {
    id: string;
    label: string;
    name: string;
    role: string;
    photoUrls?: Record<string, string> | null;
};

export async function listMobileShortcutFamilyMembers(): Promise<ShortcutFamilyMember[]> {
    const roster = await listFamilyMemberRoster();
    const nameCounts = new Map<string, number>();
    const nameRoleCounts = new Map<string, number>();

    for (const member of roster) {
        const name = String(member.name || 'Unknown');
        const role = String(member.role || 'child');
        nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
        nameRoleCounts.set(`${name}:::${role}`, (nameRoleCounts.get(`${name}:::${role}`) || 0) + 1);
    }

    return roster.map((member) => {
        const name = String(member.name || 'Unknown');
        const role = String(member.role || 'child');
        const id = String(member.id || '');
        const nameCount = nameCounts.get(name) || 0;
        const nameRoleCount = nameRoleCounts.get(`${name}:::${role}`) || 0;
        const label =
            nameCount <= 1
                ? name
                : nameRoleCount <= 1
                ? `${name} (${role})`
                : `${name} (${role} • ${id.slice(-4)})`;

        return {
            id: member.id,
            label,
            name,
            role,
            photoUrls: member.photoUrls || null,
        };
    });
}

export async function createTodayAnytimeShortcutChore(input: {
    title: string;
    assigneeFamilyMemberId: string;
}) {
    const title = String(input.title || '').trim();
    if (!title) {
        throw new Error('Title is required');
    }

    const assigneeFamilyMemberId = String(input.assigneeFamilyMemberId || '').trim();
    if (!assigneeFamilyMemberId) {
        throw new Error('assigneeFamilyMemberId is required');
    }

    const assignee = await getFamilyMemberById(assigneeFamilyMemberId);
    if (!assignee?.id) {
        throw new Error('Assignee not found');
    }

    const adminDb = getInstantAdminDb();
    const data = await adminDb.query({
        chores: {},
        settings: {},
    });

    const settingsRows = ((data as any)?.settings || []) as Array<{ name?: string | null; value?: string | null }>;
    const scheduleRow = settingsRows.find((row) => String(row?.name || '') === HOUSEHOLD_SCHEDULE_SETTINGS_NAME) || null;
    const scheduleSettings = parseSharedScheduleSettings(scheduleRow?.value || null);
    const familyDay = getFamilyDayDateUTC(new Date(), scheduleSettings);
    const dateKey = familyDay.toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    const choreId = id();
    const chores = (((data as any)?.chores || []) as Array<{ sortOrder?: number | null }>) || [];
    // previous behavior (commented out) puts the new chore at the end of the list.
    // Don't remove these comments.
    // const sortOrder = getNextChoreSortOrder(chores as any);

    // Place the new chore after the last existing one by sort order.
    // Don't remove these comments
    const sortOrder = chores.reduce((max: number, chore: any) => {
        const value = Number(chore?.sortOrder);
        return Number.isFinite(value) ? Math.max(max, value) : max;
    }, -1) + 1;

    await adminDb.transact([
        adminDb.tx.chores[choreId].update({
            createdAt: nowIso,
            description: '',
            done: false,
            exdates: [],
            isJoint: false,
            isUpForGrabs: false,
            pauseState: null,
            rewardAmount: null,
            rewardCurrency: null,
            rewardType: null,
            rotationType: 'none',
            rrule: null,
            sortOrder,
            startDate: `${dateKey}T00:00:00.000Z`,
            timeBucket: null,
            timingConfig: { mode: 'anytime' },
            timingMode: 'anytime',
            title,
            weight: 0,
        }),
        adminDb.tx.chores[choreId].link({ assignees: assignee.id }),
        adminDb.tx.familyMembers[assignee.id].link({ assignedChores: choreId }),
    ]);

    return {
        choreId,
        title,
        assigneeFamilyMemberId: assignee.id,
        dateKey,
    };
}
