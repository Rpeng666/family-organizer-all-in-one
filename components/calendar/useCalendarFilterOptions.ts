'use client';

import { useMemo } from 'react';
import { db } from '@/lib/db';

export interface CalendarFilterFamilyMember {
    id: string;
    name?: string | null;
}

export interface CalendarFilterChoreOption {
    id: string;
    title?: string | null;
}

export interface CalendarFilterTagOption {
    id: string;
    name?: string | null;
}

export const useCalendarFilterOptions = () => {
    const query = db.useQuery({
        familyMembers: {
            $: {
                order: {
                    order: 'asc',
                },
            },
        },
        chores: {},
        calendarTags: {},
    });

    const familyMembers = useMemo(
        () =>
            (((query.data?.familyMembers as CalendarFilterFamilyMember[]) || []).filter(
                (member) => Boolean(member?.id)
            )),
        [query.data?.familyMembers]
    );

    const familyMemberIds = useMemo(() => familyMembers.map((member) => member.id), [familyMembers]);

    const chores = useMemo(
        () =>
            (((query.data?.chores as CalendarFilterChoreOption[]) || [])
                .filter((chore) => Boolean(chore?.id))
                .sort((left, right) => {
                    const leftTitle = String(left?.title || '').trim() || 'Untitled chore';
                    const rightTitle = String(right?.title || '').trim() || 'Untitled chore';
                    return leftTitle.localeCompare(rightTitle);
                })),
        [query.data?.chores]
    );

    const choreIds = useMemo(() => chores.map((chore) => chore.id), [chores]);
    const tags = useMemo(
        () =>
            (((query.data?.calendarTags as CalendarFilterTagOption[]) || [])
                .filter((tag) => Boolean(tag?.id))
                .sort((left, right) => {
                    const leftName = String(left?.name || '').trim() || 'Untitled tag';
                    const rightName = String(right?.name || '').trim() || 'Untitled tag';
                    return leftName.localeCompare(rightName);
                })),
        [query.data?.calendarTags]
    );
    const tagIds = useMemo(() => tags.map((tag) => tag.id), [tags]);

    return {
        ...query,
        familyMembers,
        familyMemberIds,
        chores,
        choreIds,
        tags,
        tagIds,
    };
};
