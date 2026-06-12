'use client';

import React from 'react';
import Calendar from '@/components/Calendar';
import { OpenLinkedThreadButton } from '@/components/messages/OpenLinkedThreadButton';

export default function CalendarPage() {
    return (
        <div className="h-full min-h-0">
            <div className="flex items-center justify-end px-4 pt-4">
                <OpenLinkedThreadButton linkedDomain="calendar" linkedEntityId="calendar-board" title="Family Calendar" />
            </div>
            <Calendar currentDate={new Date()} numWeeks={10} displayBS={true} className="h-full min-h-0" />
        </div>
    );
}
