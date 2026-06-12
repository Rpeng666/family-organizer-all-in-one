'use client';

import React from 'react';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { DashboardSectionHeader } from '@/components/dashboard/DashboardSectionHeader';
import { formatCountLabel, type EventRow } from '@/lib/dashboard-layout-planner';

interface DashboardEventsSectionProps {
    events: EventRow[];
    totalCount: number;
    height: number | null;
}

export function DashboardEventsSection({ events, totalCount, height }: DashboardEventsSectionProps) {
    return (
        <div
            className="overflow-hidden rounded-3xl border border-border/60 bg-card px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
            style={height != null ? { height: `${height}px` } : undefined}
        >
            <DashboardSectionHeader
                icon={CalendarDays}
                title="Upcoming Events"
                href="/calendar"
                countLabel={formatCountLabel(totalCount, 'event', 'events')}
            />

            <div className="mt-3 space-y-1.5">
                {events.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/50 px-4 py-3 text-xs text-muted-foreground/60">
                        Nothing on the calendar yet.
                    </div>
                ) : (
                    events.map((event) => (
                        <Link
                            key={event.id}
                            href="/calendar"
                            className="block rounded-2xl border border-border/50 bg-background/60 px-4 py-3 transition-colors duration-200 hover:bg-secondary/60"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground/60">
                                        {event.dayLabel}
                                    </span>
                                    {event.isFamilyWide && (
                                        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground/60">
                                            Family
                                        </span>
                                    )}
                                    {event.isAllDay && (
                                        <span className="rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground/60">
                                            All day
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1.5 truncate text-sm text-foreground" style={{ fontFamily: 'var(--font-garamond, Georgia, serif)' }}>
                                    {event.title}
                                </p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground/60">{event.timeLabel}</p>
                            </div>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}
