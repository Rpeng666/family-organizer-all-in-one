'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
    buildCalendarOccurrenceKey,
    getCalendarOccurrenceDateKey,
    type CalendarAgendaSection,
} from '@/lib/calendar-search';
import type { CalendarAgendaDisplaySettings } from '@/lib/calendar-controls';
import type { CalendarItem } from '@/components/DraggableCalendarEvent';

export interface CalendarAgendaFocusRequest {
    nonce: number;
    dateKey: string;
    itemKey?: string | null;
}

interface CalendarAgendaViewProps {
    sections: CalendarAgendaSection<CalendarItem>[];
    display: CalendarAgendaDisplaySettings;
    selectedItemKey?: string | null;
    compact?: boolean;
    className?: string;
    emptyState?: React.ReactNode;
    title?: string | null;
    onDateClick?: (dateKey: string) => void;
    onItemClick?: (event: React.MouseEvent<HTMLButtonElement>, item: CalendarItem) => void;
    onReachStart?: () => void;
    onReachEnd?: () => void;
    focusRequest?: CalendarAgendaFocusRequest | null;
    testId?: string;
}

const EDGE_TRIGGER_PX = 180;

const formatAgendaDateLabel = (dateKey: string) => {
    const parsed = parseISO(`${dateKey}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateKey;
    return format(parsed, 'EEEE, MMMM d, yyyy');
};

const formatAgendaTimeLabel = (item: CalendarItem, dateKey: string) => {
    if (item.calendarItemKind === 'chore') {
        return 'Chore';
    }
    if (item.isAllDay) {
        return 'All day';
    }

    const start = parseISO(String(item.startDate || ''));
    const end = parseISO(String(item.endDate || ''));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return 'Timed event';
    }

    const occurrenceDateKey = getCalendarOccurrenceDateKey(item);
    const effectiveStart = occurrenceDateKey === dateKey ? start : parseISO(`${dateKey}T00:00:00`);
    const effectiveEnd = format(end, 'yyyy-MM-dd') === dateKey ? end : parseISO(`${dateKey}T23:59:00`);
    const startLabel = format(effectiveStart, 'h:mm a');
    const endLabel = format(effectiveEnd, 'h:mm a');
    return `${startLabel} - ${endLabel}`;
};

const getSearchState = (item: CalendarItem) => {
    const rawState = String(item.__liveSearchState || '').trim();
    if (rawState === 'match' || rawState === 'dim') {
        return rawState;
    }
    return 'normal';
};

export default function CalendarAgendaView({
    sections,
    display,
    selectedItemKey,
    compact = false,
    className,
    emptyState,
    title,
    onDateClick,
    onItemClick,
    onReachStart,
    onReachEnd,
    focusRequest,
    testId,
}: CalendarAgendaViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const lastStartTriggerRef = useRef(0);
    const lastEndTriggerRef = useRef(0);
    const fontScaleStyle = useMemo(() => ({ fontSize: `${display.fontScale}rem` }), [display.fontScale]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container || !focusRequest) return;

        const target =
            (focusRequest.itemKey
                ? container.querySelector<HTMLElement>(`[data-agenda-item-key="${focusRequest.itemKey}"]`)
                : null) ||
            container.querySelector<HTMLElement>(`[data-agenda-date="${focusRequest.dateKey}"]`);
        target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, [focusRequest]);

    const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        const now = Date.now();
        if (target.scrollTop <= EDGE_TRIGGER_PX && onReachStart && now - lastStartTriggerRef.current > 300) {
            lastStartTriggerRef.current = now;
            onReachStart();
        }
        if (
            target.scrollHeight - target.clientHeight - target.scrollTop <= EDGE_TRIGGER_PX &&
            onReachEnd &&
            now - lastEndTriggerRef.current > 300
        ) {
            lastEndTriggerRef.current = now;
            onReachEnd();
        }
    };

    return (
        <div
            ref={containerRef}
            data-testid={testId || 'calendar-agenda-view'}
            onScroll={handleScroll}
            className={cn(
                'flex h-full min-h-0 flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 shadow-[0_18px_40px_rgba(15,23,42,0.06)]',
                compact ? 'rounded-xl border-slate-200/80 shadow-none' : '',
                className
            )}
        >
            {title ? (
                <div className={cn('sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur', compact ? 'px-3 py-2' : '')}>
                    <div className={cn('text-sm font-semibold text-slate-900', compact ? 'text-xs uppercase tracking-[0.16em] text-slate-500' : '')}>
                        {title}
                    </div>
                </div>
            ) : null}

            {sections.length === 0 ? (
                <div className={cn('px-4 py-5 text-sm text-slate-500', compact ? 'px-3 py-4 text-xs' : '')}>
                    {emptyState || 'No events match the current search or filters.'}
                </div>
            ) : (
                <div className="flex flex-col gap-4 px-4 py-4" style={fontScaleStyle}>
                    {sections.map((section) => (
                        <section key={section.dateKey} data-agenda-date={section.dateKey} className={cn('flex flex-col gap-2', compact ? 'gap-1.5' : '')}>
                            <button
                                type="button"
                                className={cn(
                                    'sticky top-0 self-start rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-600',
                                    compact ? 'px-2.5 py-1 text-[10px]' : ''
                                )}
                                onClick={() => onDateClick?.(section.dateKey)}
                            >
                                {formatAgendaDateLabel(section.dateKey)}
                            </button>

                            <div className="flex flex-col gap-2">
                                {section.items.map((item) => {
                                    const occurrenceKey = buildCalendarOccurrenceKey(item);
                                    const searchState = getSearchState(item);
                                    const isSelected = occurrenceKey === selectedItemKey;

                                    return (
                                        <button
                                            key={`${occurrenceKey}-${section.dateKey}`}
                                            type="button"
                                            data-agenda-item-key={occurrenceKey}
                                            data-calendar-search-state={searchState}
                                            className={cn(
                                                'rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-50',
                                                compact ? 'rounded-xl px-3 py-2' : '',
                                                searchState === 'match' ? 'border-sky-300 bg-sky-50/80 shadow-[0_10px_24px_rgba(14,165,233,0.12)]' : '',
                                                searchState === 'dim' ? 'opacity-45 saturate-50' : '',
                                                isSelected ? 'ring-2 ring-sky-300 ring-offset-2 ring-offset-white' : ''
                                            )}
                                            onClick={(event) => onItemClick?.(event, item)}
                                        >
                                            <div className={cn('flex items-start justify-between gap-3', compact ? 'gap-2' : '')}>
                                                <div className="min-w-0 flex-1">
                                                    <div className={cn('text-xs font-semibold uppercase tracking-[0.14em] text-slate-500', compact ? 'text-[10px]' : '')}>
                                                        {formatAgendaTimeLabel(item, section.dateKey)}
                                                    </div>
                                                    <div className={cn('mt-1 truncate text-sm font-semibold text-slate-900', compact ? 'text-[13px]' : 'text-base')}>
                                                        {item.title || 'Untitled'}
                                                    </div>
                                                    {display.showLocation && item.location ? (
                                                        <div className={cn('mt-1 text-xs text-slate-500', compact ? 'text-[11px]' : '')}>{item.location}</div>
                                                    ) : null}
                                                    {display.showDescription && item.description ? (
                                                        <div
                                                            className={cn(
                                                                'mt-1 line-clamp-2 text-sm leading-5 text-slate-600',
                                                                compact ? 'text-[12px] leading-4' : ''
                                                            )}
                                                        >
                                                            {item.description}
                                                        </div>
                                                    ) : null}
                                                    {display.showTags && Array.isArray(item.tags) && item.tags.length > 0 ? (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {item.tags.map((tag) => (
                                                                <span
                                                                    key={`${occurrenceKey}-${tag.id || tag.name}`}
                                                                    className={cn(
                                                                        'rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600',
                                                                        compact ? 'text-[10px]' : ''
                                                                    )}
                                                                >
                                                                    {tag.name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                </div>
                                                {display.showMetadata ? (
                                                    <div className={cn('shrink-0 text-right text-xs text-slate-500', compact ? 'text-[10px]' : '')}>
                                                        <div>{item.calendarItemKind === 'chore' ? 'Overlay' : item.isAllDay ? 'All day' : 'Event'}</div>
                                                        {item.status ? <div className="mt-1">{String(item.status)}</div> : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
