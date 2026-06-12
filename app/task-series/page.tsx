// app/task-series/page.tsx
'use client';

import React from 'react';
import { db } from '@/lib/db';
import TaskSeriesManager from '@/components/task-series/TaskSeriesManager';
import { ParentGate } from '@/components/auth/ParentGate'; // +++ Added

export default function TaskSeriesPage() {
    return (
        <ParentGate>
            <TaskSeriesManager db={db} />
        </ParentGate>
    );
}
