'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import HistoryPage from '@/components/history/HistoryPage';

export default function FamilyHistoryPage() {
    const searchParams = useSearchParams();

    return (
        <HistoryPage
            initialSelectedMember={searchParams.get('member')}
            initialDomain={searchParams.get('domain')}
            initialTaskSeriesId={searchParams.get('taskSeriesId')}
        />
    );
}
