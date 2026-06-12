// app/task-series/new/page.tsx
'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import TaskSeriesEditor from '@/components/task-series/TaskSeriesEditor';
import { ParentGate } from '@/components/auth/ParentGate';

export default function NewTaskSeriesPage() {
    const router = useRouter();

    return (
        <ParentGate>
            <TaskSeriesEditor
                db={db}
                initialSeriesId={null} // tells editor: "this is a new series"
                onClose={() => router.push('/task-series')}
            />
        </ParentGate>
    );
}
