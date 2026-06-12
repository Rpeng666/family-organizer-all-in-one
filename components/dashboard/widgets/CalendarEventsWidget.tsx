'use client';

import React, { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { db } from '@/lib/db';
import { buildCalendarPreviews, type DashboardCalendarItem } from '@/lib/dashboard-utils';
import type { WidgetProps } from './types';
import { registerWidget } from './widget-store';
import WidgetShell from './WidgetShell';

function CalendarEventsWidget({ memberId, todayUtc }: WidgetProps) {
    const { data } = db.useQuery({
        calendarItems: { pertainsTo: {} },
    });

    const calendarPreviews = useMemo(
        () => buildCalendarPreviews(
            (data?.calendarItems || []) as unknown as DashboardCalendarItem[],
            todayUtc,
            memberId,
            10
        ),
        [data?.calendarItems, todayUtc, memberId]
    );

    return (
        <WidgetShell meta={CALENDAR_EVENTS_META}>
            {calendarPreviews.length === 0 ? (
                <p className="text-sm text-slate-500">No upcoming events.</p>
            ) : (
                <ul className="space-y-1.5">
                    {calendarPreviews.map((item) => (
                        <li key={item.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                                <p className="text-[11px] text-slate-600">{item.timeLabel}</p>
                            </div>
                            {item.isFamilyWide && (
                                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-slate-500">
                                    Family
                                </span>
                            )}
                            {item.isAllDay && !item.isFamilyWide && (
                                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-semibold uppercase text-blue-600">
                                    All day
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </WidgetShell>
    );
}

const CALENDAR_EVENTS_META = {
    id: 'calendar-events',
    label: 'Calendar',
    icon: CalendarDays,
    defaultSize: { colSpan: 1 as const },
    defaultEnabled: true,
    defaultOrder: 3,
    description: 'Upcoming calendar events for you and the family',
};

registerWidget({ meta: CALENDAR_EVENTS_META, component: CalendarEventsWidget });
