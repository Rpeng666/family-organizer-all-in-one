'use client';

import React, { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import MiniInfiniteCalendar from '@/components/MiniInfiniteCalendar';
import type { WidgetProps } from './types';
import { registerWidget } from './widget-store';

function MiniCalendarWidget({ memberId, todayUtc }: WidgetProps) {
    // Compute the start of the week containing today so today appears on the first row
    const initialTopDate = useMemo(() => {
        const d = new Date(todayUtc);
        const day = d.getDay(); // 0=Sun
        d.setDate(d.getDate() - day);
        return d;
    }, [todayUtc]);

    return (
        // Fixed height prevents ResizeObserver ↔ grid layout thrashing loop.
        // No WidgetShell — the calendar already has its own border/styling.
        <div className="overflow-hidden rounded-xl" style={{ height: 'clamp(280px, 45vh, 560px)' }}>
            <MiniInfiniteCalendar
                initialTopDate={initialTopDate}
                numWeeks={5}
                showChores={true}
                selectedMemberIds={[memberId]}
                eventFontScale={0.75}
            />
        </div>
    );
}

const MINI_CALENDAR_META = {
    id: 'mini-calendar',
    label: 'Calendar',
    icon: Calendar,
    defaultSize: { colSpan: 2 as const },
    defaultEnabled: true,
    defaultOrder: 4,
    description: 'Mini monthly calendar view',
};

registerWidget({ meta: MINI_CALENDAR_META, component: MiniCalendarWidget });
