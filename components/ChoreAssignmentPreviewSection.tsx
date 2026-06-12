'use client';

import React from 'react';
import ChoreCalendarView from '@/components/ChoreCalendarView';

interface ChoreAssignmentPreviewSectionProps {
    chore: any;
    anchorDate?: Date;
    title?: string;
    description?: string;
}

export default function ChoreAssignmentPreviewSection({
    chore,
    anchorDate,
    title = 'Assignment Preview',
    description = 'Scroll through scheduled dates to see who was assigned and whether each occurrence was completed.',
}: ChoreAssignmentPreviewSectionProps) {
    if (!chore?.startDate) return null;

    return (
        <section className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="space-y-1">
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-600">{description}</p>
            </div>
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <ChoreCalendarView chore={chore} anchorDate={anchorDate} />
            </div>
        </section>
    );
}
