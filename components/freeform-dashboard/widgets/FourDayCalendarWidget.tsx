'use client';

import React, { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { registerFreeformWidget } from '@/lib/freeform-dashboard/freeform-widget-registry';
import type { FreeformWidgetProps } from '@/lib/freeform-dashboard/types';
import Calendar from '@/components/Calendar';
import { useWidgetScale } from '@/lib/freeform-dashboard/widget-scale';

function FourDayCalendarWidget({ config, width, height }: FreeformWidgetProps) {
    const { scale } = useWidgetScale();
    const dayCount = typeof config.dayCount === 'number' ? config.dayCount : 4;
    const showChores = typeof config.showChores === 'boolean' ? config.showChores : false;
    const memberIds = Array.isArray(config.memberIds) ? (config.memberIds as string[]) : undefined;
    const everyoneSelected = memberIds === undefined || memberIds.length === 0;

    const currentDate = useMemo(() => new Date(), []);

    return (
        <div className="h-full w-full overflow-hidden">
            <Calendar
                currentDate={currentDate}
                viewMode="day"
                dayVisibleDays={dayCount}
                dayRowCount={1}
                dayHourHeight={Math.round(48 * scale)}
                dayFontScale={0.7 * scale}
                dayBufferDays={7}
                showChores={showChores}
                commandBusEnabled={false}
                showGregorianDays
                everyoneSelected={everyoneSelected}
                selectedMemberIds={memberIds}
                style={{ height: '100%' }}
            />
        </div>
    );
}

registerFreeformWidget({
    meta: {
        type: 'four-day-calendar',
        label: 'Day Calendar',
        icon: CalendarDays,
        description: 'Day view calendar with events and optional chore overlay',
        minWidth: 300,
        minHeight: 250,
        defaultWidth: 600,
        defaultHeight: 400,
        allowMultiple: false,
        configFields: [
            { key: 'dayCount', label: 'Days to show', type: 'number', min: 1, max: 7 },
            { key: 'showChores', label: 'Show chores', type: 'boolean' },
            { key: 'memberIds', label: 'Filter by members', type: 'family-members' },
        ],
    },
    component: FourDayCalendarWidget,
});

export default FourDayCalendarWidget;
