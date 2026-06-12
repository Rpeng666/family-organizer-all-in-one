'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import NepaliDate from 'nepali-date-converter';
import { CalendarDays, Filter, SlidersHorizontal } from 'lucide-react';
import MiniInfiniteCalendar from '@/components/MiniInfiniteCalendar';
import CalendarEventFontScaleControl from '@/components/calendar/CalendarEventFontScaleControl';
import { useCalendarFilterOptions } from '@/components/calendar/useCalendarFilterOptions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CALENDAR_YEAR_FONT_SCALE_DEFAULT, clampCalendarYearFontScale } from '@/lib/calendar-controls';

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeChecked = (value: boolean | 'indeterminate') => value === true;

export default function MiniInfiniteCalendarPage() {
    const { familyMembers, familyMemberIds, chores, choreIds, tags, tagIds } = useCalendarFilterOptions();
    const today = useMemo(() => new Date(), []);
    const todayBs = useMemo(() => new NepaliDate(today), [today]);

    const [startMode, setStartMode] = useState<'gregorian' | 'bs'>('gregorian');
    const [gregorianDate, setGregorianDate] = useState(() => format(today, 'yyyy-MM-dd'));
    const [bsYear, setBsYear] = useState(() => String(todayBs.getYear()));
    const [bsMonth, setBsMonth] = useState(() => String(todayBs.getMonth() + 1));
    const [bsDay, setBsDay] = useState(() => String(todayBs.getDate()));
    const [showGregorianDays, setShowGregorianDays] = useState(true);
    const [showBsDays, setShowBsDays] = useState(true);
    const [showChores, setShowChores] = useState(true);
    const [includeEveryoneEvents, setIncludeEveryoneEvents] = useState(true);
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [selectedChoreIds, setSelectedChoreIds] = useState<string[]>([]);
    const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
    const [eventFontScale, setEventFontScale] = useState(CALENDAR_YEAR_FONT_SCALE_DEFAULT);

    useEffect(() => {
        if (familyMemberIds.length === 0) return;
        setSelectedMemberIds((previous) => {
            if (previous.length === 0) {
                return familyMemberIds;
            }
            const previousSet = new Set(previous);
            const normalized = familyMemberIds.filter((id) => previousSet.has(id));
            return normalized.length === previous.length ? previous : normalized;
        });
    }, [familyMemberIds]);

    useEffect(() => {
        if (choreIds.length === 0) return;
        setSelectedChoreIds((previous) => {
            if (previous.length === 0) {
                return choreIds;
            }
            const previousSet = new Set(previous);
            const normalized = choreIds.filter((id) => previousSet.has(id));
            return normalized.length === previous.length ? previous : normalized;
        });
    }, [choreIds]);

    useEffect(() => {
        setSelectedTagIds((previous) => {
            if (previous.length === 0) {
                return previous;
            }
            const previousSet = new Set(previous);
            const normalized = tagIds.filter((id) => previousSet.has(id));
            return normalized.length === previous.length ? previous : normalized;
        });
    }, [tagIds]);

    const initialTopDate = useMemo(() => {
        if (startMode !== 'gregorian') return undefined;
        const parsed = parseISO(`${gregorianDate}T00:00:00`);
        return Number.isNaN(parsed.getTime()) ? today : parsed;
    }, [gregorianDate, startMode, today]);

    const initialTopBsDate = useMemo(() => {
        if (startMode !== 'bs') return undefined;
        const year = clampNumber(Number(bsYear) || todayBs.getYear(), 1970, 2200);
        const month = clampNumber(Number(bsMonth) || todayBs.getMonth() + 1, 1, 12);
        const day = clampNumber(Number(bsDay) || todayBs.getDate(), 1, 32);
        return {
            year,
            monthIndex: month - 1,
            day,
        };
    }, [bsDay, bsMonth, bsYear, startMode, todayBs]);

    const toggleId = (value: string, currentValues: string[], setValues: React.Dispatch<React.SetStateAction<string[]>>) => {
        setValues((previous) => {
            const exists = previous.includes(value);
            if (exists) {
                return previous.filter((entry) => entry !== value);
            }
            return [...previous, value];
        });
    };

    return (
        <div className="min-h-full bg-[linear-gradient(180deg,#f8fafc_0%,#eef4ff_46%,#fdf7ed_100%)] px-6 py-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
                <div className="max-w-3xl space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 backdrop-blur">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Mini Infinite Calendar
                    </div>
                    <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Compact infinite month stream for dashboards</h1>
                    <p className="max-w-2xl text-sm leading-6 text-slate-600">
                        This page mounts the new reusable web component with inline controls above it. The calendar itself stays compact,
                        scrolls indefinitely, and keeps Gregorian and BS month transitions independent in the sticky header.
                    </p>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <Card className="border-slate-200/80 bg-white/85 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <SlidersHorizontal className="h-5 w-5 text-slate-500" />
                                Display
                            </CardTitle>
                            <CardDescription>Show or hide the two day systems, tune chip readability, and choose the initial top row.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                                    <Checkbox
                                        checked={showGregorianDays}
                                        onCheckedChange={(checked) => setShowGregorianDays(normalizeChecked(checked))}
                                    />
                                    <div className="space-y-1">
                                        <span className="block text-sm font-medium text-slate-900">Show Gregorian labels</span>
                                        <span className="block text-xs leading-5 text-slate-500">Day numbers and sticky Gregorian month/year.</span>
                                    </div>
                                </label>
                                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                                    <Checkbox checked={showBsDays} onCheckedChange={(checked) => setShowBsDays(normalizeChecked(checked))} />
                                    <div className="space-y-1">
                                        <span className="block text-sm font-medium text-slate-900">Show BS labels</span>
                                        <span className="block text-xs leading-5 text-slate-500">Day numbers and sticky BS month/year.</span>
                                    </div>
                                </label>
                            </div>

                            <CalendarEventFontScaleControl
                                id="mini-event-font-scale"
                                value={eventFontScale}
                                onChange={(nextValue) => setEventFontScale(clampCalendarYearFontScale(nextValue))}
                                hintClassName="text-[11px] text-slate-500"
                                descriptionClassName="text-xs leading-5 text-slate-500"
                                description="The compact calendar keeps five weeks visible and uses this shared chip-scale control for event readability."
                            />

                            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        type="button"
                                        variant={startMode === 'gregorian' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setStartMode('gregorian')}
                                    >
                                        Gregorian start
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={startMode === 'bs' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setStartMode('bs')}
                                    >
                                        BS start
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setGregorianDate(format(today, 'yyyy-MM-dd'));
                                            setBsYear(String(todayBs.getYear()));
                                            setBsMonth(String(todayBs.getMonth() + 1));
                                            setBsDay(String(todayBs.getDate()));
                                        }}
                                    >
                                        Reset to today
                                    </Button>
                                </div>

                                {startMode === 'gregorian' ? (
                                    <div className="grid gap-2">
                                        <Label htmlFor="mini-start-date">Initial Gregorian date</Label>
                                        <Input
                                            id="mini-start-date"
                                            type="date"
                                            value={gregorianDate}
                                            onChange={(event) => setGregorianDate(event.target.value)}
                                        />
                                        <p className="text-xs leading-5 text-slate-500">
                                            The week containing this date is aligned to the top of the scroll area on mount.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <div className="grid gap-2">
                                            <Label htmlFor="mini-bs-year">BS year</Label>
                                            <Input id="mini-bs-year" inputMode="numeric" value={bsYear} onChange={(event) => setBsYear(event.target.value)} />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="mini-bs-month">BS month</Label>
                                            <Input
                                                id="mini-bs-month"
                                                inputMode="numeric"
                                                value={bsMonth}
                                                onChange={(event) => setBsMonth(event.target.value)}
                                            />
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor="mini-bs-day">BS day</Label>
                                            <Input id="mini-bs-day" inputMode="numeric" value={bsDay} onChange={(event) => setBsDay(event.target.value)} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-slate-200/80 bg-white/88 shadow-[0_18px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-xl">
                                <Filter className="h-5 w-5 text-slate-500" />
                                Filters
                            </CardTitle>
                            <CardDescription>Reuse the same event and chore filtering model as the main calendar.</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-5">
                            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                                <Checkbox checked={showChores} onCheckedChange={(checked) => setShowChores(normalizeChecked(checked))} />
                                <div className="space-y-1">
                                    <span className="block text-sm font-medium text-slate-900">Show chores on calendar</span>
                                    <span className="block text-xs leading-5 text-slate-500">
                                        Overlay scheduled chores using the same member and chore filters.
                                    </span>
                                </div>
                            </label>

                            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                                <Checkbox
                                    checked={includeEveryoneEvents}
                                    onCheckedChange={(checked) => setIncludeEveryoneEvents(normalizeChecked(checked))}
                                />
                                <div className="space-y-1">
                                    <span className="block text-sm font-medium text-slate-900">Include events for everyone</span>
                                    <span className="block text-xs leading-5 text-slate-500">
                                        When off, only events tied to the selected family members appear.
                                    </span>
                                </div>
                            </label>

                            <div className="grid gap-3 lg:grid-cols-2">
                                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h2 className="text-sm font-semibold text-slate-900">Members</h2>
                                            <p className="text-xs text-slate-500">
                                                {selectedMemberIds.length} of {familyMemberIds.length || 0} selected
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedMemberIds(familyMemberIds)}>
                                                All
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedMemberIds([])}>
                                                None
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="max-h-48 space-y-2 overflow-auto pr-1">
                                        {familyMembers.map((member) => (
                                            <label
                                                key={member.id}
                                                className="flex items-center gap-3 rounded-xl border border-white/70 bg-white px-3 py-2"
                                            >
                                                <Checkbox
                                                    checked={selectedMemberIds.includes(member.id)}
                                                    onCheckedChange={() => toggleId(member.id, selectedMemberIds, setSelectedMemberIds)}
                                                />
                                                <span className="text-sm text-slate-700">{member.name || 'Unnamed member'}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h2 className="text-sm font-semibold text-slate-900">Chores</h2>
                                            <p className="text-xs text-slate-500">
                                                {selectedChoreIds.length} of {choreIds.length || 0} selected
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedChoreIds(choreIds)}>
                                                All
                                            </Button>
                                            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedChoreIds([])}>
                                                None
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="max-h-48 space-y-2 overflow-auto pr-1">
                                        {chores.map((chore) => (
                                            <label
                                                key={chore.id}
                                                className="flex items-center gap-3 rounded-xl border border-white/70 bg-white px-3 py-2"
                                            >
                                                <Checkbox
                                                    checked={selectedChoreIds.includes(chore.id)}
                                                    onCheckedChange={() => toggleId(chore.id, selectedChoreIds, setSelectedChoreIds)}
                                                />
                                                <span className="text-sm text-slate-700">{chore.title || 'Untitled chore'}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-2">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <h2 className="text-sm font-semibold text-slate-900">Tags</h2>
                                            <p className="text-xs text-slate-500">
                                                {selectedTagIds.length === 0
                                                    ? 'No tag filter'
                                                    : `${selectedTagIds.length} of ${tagIds.length || 0} selected`}
                                            </p>
                                        </div>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedTagIds([])} disabled={selectedTagIds.length === 0}>
                                            Clear
                                        </Button>
                                    </div>
                                    {tags.length === 0 ? (
                                        <p className="text-xs text-slate-500">No calendar tags have been created yet.</p>
                                    ) : (
                                        <div className="max-h-48 space-y-2 overflow-auto pr-1">
                                            {tags.map((tag) => (
                                                <label
                                                    key={tag.id}
                                                    className="flex items-center gap-3 rounded-xl border border-white/70 bg-white px-3 py-2"
                                                >
                                                    <Checkbox
                                                        checked={selectedTagIds.includes(tag.id)}
                                                        onCheckedChange={() => toggleId(tag.id, selectedTagIds, setSelectedTagIds)}
                                                    />
                                                    <span className="text-sm text-slate-700">{tag.name || 'Untitled tag'}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                    <p className="text-xs leading-5 text-slate-500">
                                        Leave all tags unchecked to show every event. When one or more tags are checked, only events matching any selected tag remain visible.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="flex justify-center">
                    <div
                        style={{
                            width: 'clamp(320px, 25vw, 430px)',
                            height: 'clamp(360px, 33vh, 500px)',
                        }}
                    >
                        <MiniInfiniteCalendar
                            initialTopDate={initialTopDate}
                            initialTopBsDate={initialTopBsDate}
                            showGregorianDays={showGregorianDays}
                            showBsDays={showBsDays}
                            showChores={showChores}
                            everyoneSelected={includeEveryoneEvents}
                            selectedMemberIds={selectedMemberIds}
                            selectedChoreIds={selectedChoreIds}
                            selectedTagIds={selectedTagIds}
                            eventFontScale={eventFontScale}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
