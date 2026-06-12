'use client';

import React from 'react';
import { CalendarDays, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import DateCarousel from '@/components/ui/DateCarousel';
import { formatDateKeyUTC, localDateToUTC } from '@family-organizer/shared-core';
import { getPhotoUrl, toInitials, type DashboardFamilyMember } from '@/lib/dashboard-utils';
import { formatUtcDateLabel } from '@/lib/dashboard-layout-planner';
import { cn } from '@/lib/utils';

type FamilyMemberRecord = DashboardFamilyMember & { order?: number | null; role?: string | null };

interface DashboardHeaderCardProps {
    activeMember: FamilyMemberRecord;
    familyMembers: FamilyMemberRecord[];
    activeMemberId: string | null;
    summaryLine: string;
    selectedDateKey: string;
    selectedDateLocal: Date;
    isSelectedToday: boolean;
    memberPickerOpen: boolean;
    datePickerOpen: boolean;
    onMemberPickerOpenChange: (open: boolean) => void;
    onDatePickerOpenChange: (open: boolean) => void;
    onMemberSelect: (memberId: string) => void;
    onDateSelect: (dateKey: string) => void;
    /** When true, renders without the card shell (for embedding inside a hero section) */
    bare?: boolean;
}

export function DashboardHeaderCard({
    activeMember,
    familyMembers,
    activeMemberId,
    summaryLine,
    selectedDateKey,
    selectedDateLocal,
    isSelectedToday,
    memberPickerOpen,
    datePickerOpen,
    onMemberPickerOpenChange,
    onDatePickerOpenChange,
    onMemberSelect,
    onDateSelect,
    bare,
}: DashboardHeaderCardProps) {
    const inner = (
        <div className="flex items-start justify-between gap-4">
            <Popover open={memberPickerOpen} onOpenChange={onMemberPickerOpenChange}>
                <PopoverTrigger asChild>
                    <button type="button" className="flex min-w-0 flex-1 items-start gap-4 text-left">
                        <Avatar className="h-14 w-14 border border-border/60">
                            {getPhotoUrl(activeMember) ? (
                                <AvatarImage src={getPhotoUrl(activeMember)} alt={activeMember.name} />
                            ) : null}
                            <AvatarFallback className="bg-secondary text-sm text-muted-foreground">
                                {toInitials(activeMember.name)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <h1
                                    className="text-3xl leading-tight text-foreground"
                                    style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500, letterSpacing: '-0.02em' }}
                                >
                                    {activeMember.name}&apos;s Day
                                </h1>
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                            </div>
                            <p className="mt-1.5 text-sm leading-6 text-muted-foreground/60">{summaryLine}</p>
                        </div>
                    </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-2">
                    <div className="space-y-0.5">
                        <p
                            className="px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60"
                            style={{ fontFamily: 'var(--font-garamond, Georgia, serif)' }}
                        >
                            Family members
                        </p>
                        {familyMembers.map((member) => {
                            const isActive = member.id === activeMemberId;
                            return (
                                <button
                                    key={member.id}
                                    type="button"
                                    onClick={() => {
                                        onMemberSelect(member.id);
                                        onMemberPickerOpenChange(false);
                                    }}
                                    className={cn(
                                        'flex w-full items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left transition-colors duration-200',
                                        isActive ? 'border-border/60 bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                                    )}
                                >
                                    <Avatar className="h-9 w-9 border border-border/50">
                                        {getPhotoUrl(member) ? (
                                            <AvatarImage src={getPhotoUrl(member)} alt={member.name} />
                                        ) : null}
                                        <AvatarFallback className="text-xs bg-secondary">
                                            {toInitials(member.name)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm" style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: isActive ? 500 : 400 }}>{member.name}</p>
                                        <p className="truncate text-xs text-muted-foreground/60">
                                            {isActive ? 'Currently shown' : 'Show this day view'}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </PopoverContent>
            </Popover>

            <Popover open={datePickerOpen} onOpenChange={onDatePickerOpenChange}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="shrink-0 rounded-2xl border border-border/60 bg-secondary/60 px-4 py-3 text-right transition-colors duration-200 hover:bg-secondary"
                    >
                        <div className="flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-muted-foreground/40" />
                            <div>
                                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/50">
                                    {isSelectedToday ? 'Today' : 'Selected'}
                                </p>
                                <p className="text-sm text-foreground" style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500 }}>
                                    {formatUtcDateLabel(selectedDateKey, {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                    })}
                                </p>
                            </div>
                        </div>
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[min(92vw,640px)] p-2">
                    <DateCarousel
                        initialDate={selectedDateLocal}
                        onDateSelect={(nextDate) => {
                            onDateSelect(formatDateKeyUTC(localDateToUTC(nextDate)));
                            onDatePickerOpenChange(false);
                        }}
                    />
                </PopoverContent>
            </Popover>
        </div>
    );

    if (bare) return inner;

    return (
        <section className="shrink-0 rounded-3xl border border-border/60 bg-card px-6 py-6 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
            {inner}
        </section>
    );
}
