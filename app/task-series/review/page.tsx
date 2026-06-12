'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { ParentGate } from '@/components/auth/ParentGate';

const TaskBinsReview = dynamic(() =>
    import('@/components/task-series/TaskBinsReview').then((m) => m.TaskBinsReview),
    { ssr: false }
);

export default function TaskBinsReviewPage() {
    return (
        <ParentGate>
            <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><div className="text-sm text-slate-500">Loading...</div></div>}>
                <TaskBinsReview />
            </Suspense>
        </ParentGate>
    );
}
