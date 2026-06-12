// app/task-series/[seriesId]/page.tsx
'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import TaskSeriesEditor from '@/components/task-series/TaskSeriesEditor';
import { ParentGate } from '@/components/auth/ParentGate';
import { OpenLinkedThreadButton } from '@/components/messages/OpenLinkedThreadButton';

export default function TaskSeriesDetailPage() {
    const params = useParams();
    const router = useRouter();
    const seriesId = params?.seriesId as string | undefined;

    if (!seriesId) {
        return <div className="p-4 text-sm text-red-600">Missing series id.</div>;
    }

    return (
        <ParentGate>
            <div className="space-y-4 p-4">
                <div className="flex justify-end">
                    <OpenLinkedThreadButton linkedDomain="tasks" linkedEntityId={`task-series:${seriesId}`} title="Task Series Discussion" />
                </div>
                <TaskSeriesEditor db={db} initialSeriesId={seriesId} onClose={() => router.push('/task-series')} />
            </div>
        </ParentGate>
    );
}
