'use client';

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export interface ChildWidgetChoreItem {
    id: string;
    title: string;
    xp?: number;
}

export interface ChildWidgetTaskItem {
    id: string;
    title: string;
    detail?: string;
}

export interface ChildWidgetCalendarItem {
    id: string;
    dateLabel: string;
    relativeLabel?: string;
    calendarDateLabel?: string;
    title: string;
}

export interface ChildWidgetData {
    name: string;
    initials: string;
    avatarUrl?: string;
    financeLabel: string;
    xpCurrent: number;
    xpPossible: number;
    dueChoresCount: number;
    dueTasksCount: number;
    chores: ChildWidgetChoreItem[];
    tasks: ChildWidgetTaskItem[];
    calendar: ChildWidgetCalendarItem[];
}

interface ChildWidgetProps {
    data: ChildWidgetData;
}

function progressPercent(current: number, possible: number): number {
    if (!possible || possible <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((current / possible) * 100)));
}

export default function ChildWidget({ data }: ChildWidgetProps) {
    const xpProgress = progressPercent(data.xpCurrent, data.xpPossible);

    return (
        <article className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_10px_40px_-28px_rgba(15,23,42,0.35)]">
            <header className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-14 w-14 border border-slate-200">
                        {data.avatarUrl ? <AvatarImage src={data.avatarUrl} alt={data.name} /> : null}
                        <AvatarFallback className="bg-slate-100 text-xl font-semibold text-slate-700">{data.initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            <h1 className="truncate text-4xl font-semibold leading-tight text-slate-800">{data.name}</h1>
                            <p className="text-4xl font-medium leading-tight text-slate-800">{data.financeLabel}</p>
                        </div>
                        <p className="mt-1 text-2xl text-slate-500">
                            Due {data.dueChoresCount} <span className="mx-1.5">|</span> Tasks {data.dueTasksCount}
                        </p>
                    </div>
                </div>

                <div className="min-w-[210px] text-right">
                    <p className="text-4xl font-medium text-slate-600">
                        XP {data.xpCurrent} / {data.xpPossible}
                    </p>
                    <div className="mt-2 h-3 overflow-hidden rounded-full bg-emerald-100/70">
                        <div className="h-full rounded-full bg-emerald-400 transition-all duration-300" style={{ width: `${xpProgress}%` }} />
                    </div>
                </div>
            </header>

            <div className="my-3 border-t border-slate-200" />

            <div className="grid gap-3 lg:grid-cols-[1fr,1fr]">
                <section className="space-y-2">
                    {data.chores.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-2xl font-medium text-slate-800">{item.title}</p>
                                {typeof item.xp === 'number' ? (
                                    <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-0.5 text-lg font-medium text-blue-800">XP{item.xp}</span>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </section>

                <section className="space-y-2">
                    {data.tasks.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                            <p className="truncate text-2xl font-medium text-slate-800">{item.title}</p>
                            {item.detail ? <p className="mt-1 line-clamp-2 text-xl text-slate-500">{item.detail}</p> : null}
                        </div>
                    ))}
                </section>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {data.calendar.slice(0, 2).map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                        <p className="truncate text-2xl font-medium text-slate-800">{item.title}</p>
                        {item.relativeLabel && <p className="text-lg text-slate-500">{item.relativeLabel}</p>}
                        {item.calendarDateLabel && <p className="text-lg text-slate-400">{item.calendarDateLabel}</p>}
                        {!item.relativeLabel && <p className="text-lg text-slate-500">{item.dateLabel}</p>}
                    </div>
                ))}
            </div>
        </article>
    );
}
