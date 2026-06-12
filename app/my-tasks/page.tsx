// app/my-tasks/page.tsx
'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/db';
import MyTaskSeriesOverview from '@/components/task-series/MyTaskSeriesOverview';

export default function MyTasksPage() {
    const searchParams = useSearchParams();

    return (
        <div className="space-y-4 p-4">
            <MyTaskSeriesOverview
                db={db}
                initialMemberId={searchParams.get('member')}
            />
        </div>
    );
}
