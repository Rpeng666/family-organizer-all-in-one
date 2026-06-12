'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import FamilyChoreTracker from '@/components/ChoresTracker';
import { OpenLinkedThreadButton } from '@/components/messages/OpenLinkedThreadButton';

export default function TasksPage() {
    const searchParams = useSearchParams();

    return (
        <div className="space-y-4 p-4">
            <div className="flex justify-end">
                <OpenLinkedThreadButton linkedDomain="tasks" linkedEntityId="tasks-board" title="Tasks Board" />
            </div>
            <FamilyChoreTracker
                pageMode="tasks"
                initialSelectedMember={searchParams.get('member')}
                initialSelectedDate={searchParams.get('date')}
                focusedChoreId={searchParams.get('choreId')}
            />
        </div>
    );
}
