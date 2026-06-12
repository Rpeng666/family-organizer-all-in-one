'use client';

import React from 'react';
import { format, getDate, getMonth } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import localFont from 'next/font/local';
import styles from '@/styles/Calendar.module.css';
import { DroppableDayCell } from '@/components/DroppableDayCell';
import { DraggableCalendarEvent, type CalendarItem } from '@/components/DraggableCalendarEvent';
import CalendarWeekSpanOverlay, {
    getWeekSpanReservedHeightData,
    type CalendarWeekSpanSegmentLike,
} from '@/components/CalendarWeekSpanOverlay';
import {
    NEPALI_MONTHS_COMMON_DEVANAGARI,
    NEPALI_MONTHS_COMMON_ROMAN,
} from '@/lib/calendar-display';

const ebGaramond = localFont({
    src: '../../public/fonts/EBGaramond-Regular.ttf',
    weight: '400',
    display: 'swap',
});

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarMonthlyGridProps {
    headerRef: React.RefObject<HTMLTableSectionElement>;
    weeks: Date[][];
    weekSpanLanesByWeek: Map<string, CalendarWeekSpanSegmentLike[][]>;
    effectiveShowGregorianCalendar: boolean;
    effectiveShowBsCalendar: boolean;
    showMonthlyBsInlineBreaks: boolean;
    dayItemsByDate: Map<string, CalendarItem[]>;
    onDayClick: (day: Date) => void;
    onDayDoubleClick: (day: Date) => void;
    onEventClick: (e: React.MouseEvent, item: CalendarItem) => void;
    onEventDoubleClick: (e: React.MouseEvent, item: CalendarItem) => void;
    isEventSelected: (item: CalendarItem) => boolean;
}

export function CalendarMonthlyGrid({
    headerRef,
    weeks,
    weekSpanLanesByWeek,
    effectiveShowGregorianCalendar,
    effectiveShowBsCalendar,
    showMonthlyBsInlineBreaks,
    dayItemsByDate,
    onDayClick,
    onDayDoubleClick,
    onEventClick,
    onEventDoubleClick,
    isEventSelected,
}: CalendarMonthlyGridProps) {
    let isYearSet = false;
    let shouldDisplayBothYears = false;
    let shouldDisplayYear = false;
    let shouldDisplayNepaliYear = true;

    return (
        <table className={styles.calendarTable}>
            <thead ref={headerRef} className={ebGaramond.className}>
                <tr>
                    {DAYS_OF_WEEK.map((day, index) => (
                        <th key={index} className={styles.headerCell}>
                            {day}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {weeks.map((week, weekIndex) => {
                    const weekKey = format(week[0], 'yyyy-MM-dd');
                    const weekSpanLanes = weekSpanLanesByWeek.get(weekKey) || [];
                    const { weekSpanReservedHeightsByCol, weekSpanReservedHeight } =
                        getWeekSpanReservedHeightData(weekSpanLanes);
                    const weekCellStyle =
                        weekSpanReservedHeight > 0
                            ? ({
                                  height: `calc(var(--calendar-day-cell-height, 120px) + ${weekSpanReservedHeight}px)`,
                              } as React.CSSProperties)
                            : undefined;

                    return (
                        <React.Fragment key={weekKey}>
                            <tr>
                                {week.map((day, dayIndex) => {
                                    const nepaliDate = new NepaliDate(day);
                                    const currentMonth = format(day, 'MMMM');
                                    const isFirstDayOfMonth = getDate(day) === 1;
                                    const isFirstWeekOfMonthButNotFirstDay =
                                        getDate(day) === 2 ||
                                        getDate(day) === 3 ||
                                        getDate(day) === 4 ||
                                        getDate(day) === 5 ||
                                        getDate(day) === 6 ||
                                        getDate(day) === 7;
                                    const isFirstDayOfYear = getDate(day) === 1 && getMonth(day) === 0;
                                    const year = format(day, 'yyyy');
                                    const nepaliYear = nepaliDate.format('YYYY');
                                    shouldDisplayBothYears = false;
                                    const dateStr = format(day, 'yyyy-MM-dd');
                                    const dayReservedHeight = weekSpanReservedHeightsByCol[dayIndex] || 0;

                                    const isFirstDayOfNepaliMonth = nepaliDate.getDate() === 1;
                                    const isFirstWeekOfNepaliMonthButNotFirstDay =
                                        nepaliDate.getDate() === 2 ||
                                        nepaliDate.getDate() === 3 ||
                                        nepaliDate.getDate() === 4 ||
                                        nepaliDate.getDate() === 5 ||
                                        nepaliDate.getDate() === 6 ||
                                        nepaliDate.getDate() === 7;
                                    const isFirstDayOfNepaliYear =
                                        nepaliDate.getDate() === 1 && nepaliDate.getMonth() === 0;

                                    shouldDisplayYear =
                                        effectiveShowGregorianCalendar &&
                                        ((!isYearSet && dayIndex === 0 && weekIndex === 0) || isFirstDayOfYear);
                                    if (shouldDisplayYear) {
                                        isYearSet = true;
                                    }

                                    shouldDisplayNepaliYear =
                                        showMonthlyBsInlineBreaks &&
                                        ((dayIndex === 0 && weekIndex === 0) || isFirstDayOfNepaliYear);

                                    if (
                                        effectiveShowGregorianCalendar &&
                                        showMonthlyBsInlineBreaks &&
                                        shouldDisplayYear &&
                                        shouldDisplayNepaliYear
                                    ) {
                                        shouldDisplayBothYears = true;
                                        shouldDisplayYear = false;
                                        shouldDisplayNepaliYear = false;
                                    }

                                    const displayMonthName = effectiveShowGregorianCalendar && isFirstDayOfMonth;
                                    const displayNepaliMonthName = showMonthlyBsInlineBreaks && isFirstDayOfNepaliMonth;
                                    const dayItems = dayItemsByDate.get(dateStr) || [];
                                    const dayLabelParts = [
                                        effectiveShowGregorianCalendar ? format(day, 'd') : '',
                                        effectiveShowBsCalendar ? nepaliDate.format('D', 'np') : '',
                                    ].filter(Boolean);

                                    return (
                                        <DroppableDayCell
                                            key={dateStr}
                                            day={day}
                                            dateStr={dateStr}
                                            onClick={onDayClick}
                                            onDoubleClick={onDayDoubleClick}
                                            style={weekCellStyle}
                                            className={`${styles.dayCell} ${
                                                effectiveShowGregorianCalendar && isFirstDayOfYear ? styles.firstDayOfYear : ''
                                            } ${
                                                effectiveShowGregorianCalendar && isFirstDayOfMonth ? styles.firstDayOfMonth : ''
                                            } ${
                                                effectiveShowGregorianCalendar && isFirstWeekOfMonthButNotFirstDay ? styles.firstWeekOfMonth : ''
                                            } ${
                                                showMonthlyBsInlineBreaks && isFirstDayOfNepaliYear ? styles.firstDayOfNepaliYear : ''
                                            } ${
                                                showMonthlyBsInlineBreaks && isFirstDayOfNepaliMonth ? styles.firstDayOfNepaliMonth : ''
                                            } ${
                                                showMonthlyBsInlineBreaks && isFirstWeekOfNepaliMonthButNotFirstDay
                                                    ? styles.firstWeekOfNepaliMonth
                                                    : ''
                                            }`}
                                        >
                                            {dayIndex === 0 && weekSpanLanes.length > 0 ? (
                                                <CalendarWeekSpanOverlay
                                                    weekKey={weekKey}
                                                    weekSpanLanes={weekSpanLanes}
                                                    onEventClick={onEventClick}
                                                    onEventDoubleClick={onEventDoubleClick}
                                                    isEventSelected={isEventSelected}
                                                />
                                            ) : null}
                                            {effectiveShowGregorianCalendar && shouldDisplayYear ? (
                                                <div className={styles.yearNumber}>{year}</div>
                                            ) : null}
                                            {shouldDisplayNepaliYear ? <div className={styles.nepaliYearNumber}>{nepaliYear}</div> : null}
                                            {shouldDisplayBothYears ? (
                                                <div className={styles.yearNumber}>
                                                    {year} / {nepaliYear}
                                                </div>
                                            ) : null}
                                            {displayMonthName ? <div className={styles.monthName}>{currentMonth}</div> : null}
                                            {displayNepaliMonthName ? (
                                                <div className={styles.nepaliMonthName}>
                                                    {NEPALI_MONTHS_COMMON_DEVANAGARI[nepaliDate.getMonth()] +
                                                        ' (' +
                                                        NEPALI_MONTHS_COMMON_ROMAN[nepaliDate.getMonth()] +
                                                        ')'}
                                                </div>
                                            ) : null}
                                            <div className={styles.dayNumber} data-calendar-date={dateStr}>
                                                {dayLabelParts.join(' / ')}
                                            </div>
                                            {dayReservedHeight > 0 ? (
                                                <div
                                                    className={styles.multiDayLaneSpacer}
                                                    style={{ height: `${dayReservedHeight}px` }}
                                                    aria-hidden="true"
                                                />
                                            ) : null}
                                            {dayItems.length > 0 ? (
                                                <div
                                                    className={`${styles.dayEventStack}${
                                                        dayReservedHeight <= 0 ? ` ${styles.dayEventStackWithTopGap}` : ''
                                                    }`}
                                                >
                                                    {dayItems.map((item, index) => (
                                                        <DraggableCalendarEvent
                                                            key={`${item.id}-${item.startDate}`}
                                                            item={item}
                                                            index={index}
                                                            selected={isEventSelected(item)}
                                                            draggableEnabled={item.calendarItemKind !== 'chore'}
                                                            onClick={(e) => onEventClick(e, item)}
                                                            onDoubleClick={(e) => onEventDoubleClick(e, item)}
                                                        />
                                                    ))}
                                                </div>
                                            ) : null}
                                        </DroppableDayCell>
                                    );
                                })}
                            </tr>
                        </React.Fragment>
                    );
                })}
            </tbody>
        </table>
    );
}
