'use client';

import React, { useMemo } from 'react';
import NepaliDate from 'nepali-date-converter';
import Calendar from '@/components/Calendar';

export interface MiniInfiniteCalendarBsDateValue {
    year: number;
    monthIndex: number;
    day: number;
}

export interface MiniInfiniteCalendarProps {
    initialTopDate?: Date;
    initialTopBsDate?: MiniInfiniteCalendarBsDateValue;
    numWeeks?: number;
    className?: string;
    style?: React.CSSProperties;
    showGregorianDays?: boolean;
    showBsDays?: boolean;
    showChores?: boolean;
    everyoneSelected?: boolean;
    selectedMemberIds?: string[];
    selectedChoreIds?: string[];
    selectedTagIds?: string[];
    eventFontScale?: number;
}

export default function MiniInfiniteCalendar({
    initialTopDate,
    initialTopBsDate,
    numWeeks = 6,
    className,
    style,
    showGregorianDays = true,
    showBsDays = true,
    showChores,
    everyoneSelected,
    selectedMemberIds,
    selectedChoreIds,
    selectedTagIds,
    eventFontScale,
}: MiniInfiniteCalendarProps) {
    const currentDate = useMemo(() => {
        if (initialTopBsDate) {
            return new NepaliDate(initialTopBsDate.year, initialTopBsDate.monthIndex, initialTopBsDate.day).toJsDate();
        }

        return initialTopDate ?? new Date();
    }, [initialTopBsDate, initialTopDate]);

    return (
        <Calendar
            currentDate={currentDate}
            numWeeks={numWeeks}
            displayBS={showBsDays}
            variant="miniInfinite"
            className={className}
            style={style}
            showGregorianDays={showGregorianDays}
            showBsDays={showBsDays}
            showChores={showChores}
            everyoneSelected={everyoneSelected}
            selectedMemberIds={selectedMemberIds}
            selectedChoreIds={selectedChoreIds}
            selectedTagIds={selectedTagIds}
            eventFontScale={eventFontScale}
            commandBusEnabled={false}
        />
    );
}
