'use client';

import FamilyChoreTracker from '@/components/ChoresTracker';
import { OpenLinkedThreadButton } from '@/components/messages/OpenLinkedThreadButton';

export default function ChoresPage() {
    return (
        <div className="space-y-4 p-4">
            <div className="flex justify-end">
                <OpenLinkedThreadButton linkedDomain="chores" linkedEntityId="chores-board" title="Chores Board" />
            </div>
            <FamilyChoreTracker />
        </div>
    );
}
