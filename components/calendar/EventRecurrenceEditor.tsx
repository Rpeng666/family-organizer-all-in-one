'use client';

import React from 'react';
import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type RepeatMode = 'never' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom' | 'rrule';
export type CustomUnit = 'day' | 'week' | 'month' | 'year';
export type MonthPatternMode = 'days' | 'week';
export type RepeatEndMode = 'forever' | 'until' | 'count';
export type WeekdayToken = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'DAY' | 'WEEKDAY' | 'WEEKEND';
export type RecurrenceExceptionMode = 'date' | 'range';

export interface RecurrenceExceptionRow {
    rowId: string;
    mode: RecurrenceExceptionMode;
    date: string;
    rangeStart: string;
    rangeEnd: string;
}

export interface RecurrenceUiState {
    mode: RepeatMode;
    customInterval: number;
    customUnit: CustomUnit;
    customWeekDays: string[];
    customMonthMode: MonthPatternMode;
    customMonthDays: number[];
    customMonthOrdinal: number;
    customMonthWeekday: WeekdayToken;
    customYearMonths: number[];
    customYearUseWeekday: boolean;
    customYearOrdinal: number;
    customYearWeekday: WeekdayToken;
    repeatEndMode: RepeatEndMode;
    repeatEndUntil: string;
    repeatEndCount: number;
    advancedRrule: string;
    customExpanded: boolean;
    unsupportedRrule: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export const WEEKDAY_CHIPS = [
    { code: 'SU', label: 'Sunday' },
    { code: 'MO', label: 'Monday' },
    { code: 'TU', label: 'Tuesday' },
    { code: 'WE', label: 'Wednesday' },
    { code: 'TH', label: 'Thursday' },
    { code: 'FR', label: 'Friday' },
    { code: 'SA', label: 'Saturday' },
] as const;

export const WEEKDAY_GROUP_LABELS: Record<WeekdayToken, string> = {
    SU: 'Sunday',
    MO: 'Monday',
    TU: 'Tuesday',
    WE: 'Wednesday',
    TH: 'Thursday',
    FR: 'Friday',
    SA: 'Saturday',
    DAY: 'Day',
    WEEKDAY: 'Weekday',
    WEEKEND: 'Weekend Day',
};

export const MONTH_OPTIONS = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
] as const;

export const MONTH_DAY_CHOICES = [...Array.from({ length: 31 }, (_value, index) => index + 1), -1];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function clampRecurrenceNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function sortWeekdayCodes(codes: string[]): string[] {
    const order = new Map<string, number>(WEEKDAY_CODES.map((code, index) => [code, index]));
    return Array.from(new Set(codes.filter((code) => WEEKDAY_CODES.includes(code as any)))).sort((left, right) => {
        return (order.get(left) ?? 999) - (order.get(right) ?? 999);
    });
}

export function sortMonthDays(dayValues: number[]): number[] {
    const unique = Array.from(
        new Set(dayValues.map((entry) => Math.trunc(entry)).filter((entry) => entry === -1 || (entry >= 1 && entry <= 31)))
    );
    return unique.sort((left, right) => {
        if (left === -1) return 1;
        if (right === -1) return -1;
        return left - right;
    });
}

export function sortMonthNumbers(monthValues: number[]): number[] {
    return Array.from(
        new Set(
            monthValues
                .map((entry) => Math.trunc(entry))
                .filter((entry) => Number.isFinite(entry) && entry >= 1 && entry <= 12)
        )
    ).sort((left, right) => left - right);
}

function monthOfDate(startDateValue: string): number {
    const parsed = new Date(`${startDateValue || format(new Date(), 'yyyy-MM-dd')}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return 1;
    return parsed.getMonth() + 1;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EventRecurrenceEditorProps {
    recurrenceUi: RecurrenceUiState;
    setRecurrenceUi: React.Dispatch<React.SetStateAction<RecurrenceUiState>>;
    startDate: string;
    recurrenceSummaryText: string;
    repeatEndSummaryText: string;
    rdatesEnabled: boolean;
    rdatesSummaryText: string;
    recurrenceRdates: RecurrenceExceptionRow[];
    setRecurrenceRdates: React.Dispatch<React.SetStateAction<RecurrenceExceptionRow[]>>;
    exceptionsEnabled: boolean;
    exceptionsSummaryText: string;
    recurrenceExceptions: RecurrenceExceptionRow[];
    setRecurrenceExceptions: React.Dispatch<React.SetStateAction<RecurrenceExceptionRow[]>>;
    onToggleRdates: () => void;
    onToggleExceptions: () => void;
    onAddRdateRow: () => void;
    onRemoveRdateRow: (rowId: string) => void;
    onAddExceptionRow: () => void;
    onRemoveExceptionRow: (rowId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EventRecurrenceEditor({
    recurrenceUi,
    setRecurrenceUi,
    startDate,
    recurrenceSummaryText,
    repeatEndSummaryText,
    rdatesEnabled,
    rdatesSummaryText,
    recurrenceRdates,
    setRecurrenceRdates,
    exceptionsEnabled,
    exceptionsSummaryText,
    recurrenceExceptions,
    setRecurrenceExceptions,
    onToggleRdates,
    onToggleExceptions,
    onAddRdateRow,
    onRemoveRdateRow,
    onAddExceptionRow,
    onRemoveExceptionRow,
}: EventRecurrenceEditorProps) {
    return (
        <>
            {/* Repeat section */}
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Label>Repeat</Label>
                    <p className="text-xs text-muted-foreground">{recurrenceSummaryText}</p>
                </div>
                <div>
                    <Label htmlFor="repeatMode">Repeat</Label>
                    <select
                        id="repeatMode"
                        value={recurrenceUi.mode}
                        onChange={(event) => {
                            const nextMode = event.target.value as RepeatMode;
                            setRecurrenceUi((prev) => ({
                                ...prev,
                                mode: nextMode,
                                customExpanded: nextMode === 'custom' ? true : prev.customExpanded,
                                unsupportedRrule: nextMode === 'rrule' ? prev.unsupportedRrule : false,
                            }));
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="never">Never</option>
                        <option value="daily">Every day</option>
                        <option value="weekly">Every week</option>
                        <option value="biweekly">Every 2 weeks</option>
                        <option value="monthly">Every month</option>
                        <option value="yearly">Every year</option>
                        <option value="custom">Custom</option>
                        <option value="rrule">Custom RRULE string</option>
                    </select>
                </div>
                {recurrenceUi.mode === 'custom' ? (
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                            <div>
                                <Label htmlFor="customInterval">Every</Label>
                                <Input
                                    id="customInterval"
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={String(recurrenceUi.customInterval)}
                                    onChange={(event) => {
                                        const parsed = clampRecurrenceNumber(Number(event.target.value || 1), 1, 1000);
                                        setRecurrenceUi((prev) => ({ ...prev, customInterval: parsed }));
                                    }}
                                />
                            </div>
                            <div>
                                <Label htmlFor="customUnit">Unit</Label>
                                <select
                                    id="customUnit"
                                    value={recurrenceUi.customUnit}
                                    onChange={(event) =>
                                        setRecurrenceUi((prev) => {
                                            const nextUnit = event.target.value as CustomUnit;
                                            const fallbackStartMonth = monthOfDate(startDate || format(new Date(), 'yyyy-MM-dd'));
                                            return {
                                                ...prev,
                                                customUnit: nextUnit,
                                                customYearMonths:
                                                    nextUnit === 'year' && prev.customYearMonths.length === 0
                                                        ? [fallbackStartMonth]
                                                        : prev.customYearMonths,
                                            };
                                        })
                                    }
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                >
                                    <option value="day">{recurrenceUi.customInterval === 1 ? 'day' : 'days'}</option>
                                    <option value="week">{recurrenceUi.customInterval === 1 ? 'week' : 'weeks'}</option>
                                    <option value="month">{recurrenceUi.customInterval === 1 ? 'month' : 'months'}</option>
                                    <option value="year">{recurrenceUi.customInterval === 1 ? 'year' : 'years'}</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm text-slate-700">{recurrenceSummaryText}</p>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setRecurrenceUi((prev) => ({ ...prev, customExpanded: !prev.customExpanded }))}
                            >
                                {recurrenceUi.customExpanded ? 'Hide details' : 'Edit details'}
                            </Button>
                        </div>
                        {recurrenceUi.customExpanded ? (
                            <div className="space-y-3">
                                {recurrenceUi.customUnit === 'week' ? (
                                    <div className="space-y-2">
                                        <Label>Days of week</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {WEEKDAY_CHIPS.map((weekday) => {
                                                const selected = recurrenceUi.customWeekDays.includes(weekday.code);
                                                return (
                                                    <button
                                                        key={weekday.code}
                                                        type="button"
                                                        onClick={() =>
                                                            setRecurrenceUi((prev) => {
                                                                const exists = prev.customWeekDays.includes(weekday.code);
                                                                const nextDays = exists
                                                                    ? prev.customWeekDays.filter((entry) => entry !== weekday.code)
                                                                    : [...prev.customWeekDays, weekday.code];
                                                                return { ...prev, customWeekDays: sortWeekdayCodes(nextDays) };
                                                            })
                                                        }
                                                        className={`rounded-md border px-3 py-1 text-xs ${
                                                            selected
                                                                ? 'border-primary bg-primary/10 text-primary'
                                                                : 'border-slate-300 bg-white text-slate-700'
                                                        }`}
                                                    >
                                                        {weekday.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : null}
                                {recurrenceUi.customUnit === 'month' ? (
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setRecurrenceUi((prev) => ({ ...prev, customMonthMode: 'days' }))}
                                                className={`rounded-md border px-3 py-1 text-xs ${
                                                    recurrenceUi.customMonthMode === 'days'
                                                        ? 'border-primary bg-primary/10 text-primary'
                                                        : 'border-slate-300 bg-white text-slate-700'
                                                }`}
                                            >
                                                On days
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setRecurrenceUi((prev) => ({ ...prev, customMonthMode: 'week' }))}
                                                className={`rounded-md border px-3 py-1 text-xs ${
                                                    recurrenceUi.customMonthMode === 'week'
                                                        ? 'border-primary bg-primary/10 text-primary'
                                                        : 'border-slate-300 bg-white text-slate-700'
                                                }`}
                                            >
                                                On week
                                            </button>
                                        </div>
                                        {recurrenceUi.customMonthMode === 'days' ? (
                                            <div className="space-y-2">
                                                <Label>Month days</Label>
                                                <div className="grid grid-cols-7 gap-1">
                                                    {MONTH_DAY_CHOICES.map((dayValue) => {
                                                        const selected = recurrenceUi.customMonthDays.includes(dayValue);
                                                        const text = dayValue === -1 ? 'Last' : String(dayValue);
                                                        return (
                                                            <button
                                                                key={dayValue}
                                                                type="button"
                                                                onClick={() =>
                                                                    setRecurrenceUi((prev) => {
                                                                        const exists = prev.customMonthDays.includes(dayValue);
                                                                        const next = exists
                                                                            ? prev.customMonthDays.filter((entry) => entry !== dayValue)
                                                                            : [...prev.customMonthDays, dayValue];
                                                                        return { ...prev, customMonthDays: sortMonthDays(next) };
                                                                    })
                                                                }
                                                                className={`rounded border px-2 py-1 text-xs ${
                                                                    selected
                                                                        ? 'border-primary bg-primary/10 text-primary'
                                                                        : 'border-slate-300 bg-white text-slate-700'
                                                                }`}
                                                            >
                                                                {text}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div>
                                                    <Label htmlFor="customMonthOrdinal">Week</Label>
                                                    <select
                                                        id="customMonthOrdinal"
                                                        value={String(recurrenceUi.customMonthOrdinal)}
                                                        onChange={(event) =>
                                                            setRecurrenceUi((prev) => ({ ...prev, customMonthOrdinal: Number(event.target.value) }))
                                                        }
                                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    >
                                                        <option value="1">1st</option>
                                                        <option value="2">2nd</option>
                                                        <option value="3">3rd</option>
                                                        <option value="4">4th</option>
                                                        <option value="5">5th</option>
                                                        <option value="-1">Last</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <Label htmlFor="customMonthWeekday">Day</Label>
                                                    <select
                                                        id="customMonthWeekday"
                                                        value={recurrenceUi.customMonthWeekday}
                                                        onChange={(event) =>
                                                            setRecurrenceUi((prev) => ({
                                                                ...prev,
                                                                customMonthWeekday: event.target.value as WeekdayToken,
                                                            }))
                                                        }
                                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    >
                                                        <option value="SU">Sunday</option>
                                                        <option value="MO">Monday</option>
                                                        <option value="TU">Tuesday</option>
                                                        <option value="WE">Wednesday</option>
                                                        <option value="TH">Thursday</option>
                                                        <option value="FR">Friday</option>
                                                        <option value="SA">Saturday</option>
                                                        <option value="DAY">Day</option>
                                                        <option value="WEEKDAY">Weekday</option>
                                                        <option value="WEEKEND">Weekend Day</option>
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                                {recurrenceUi.customUnit === 'year' ? (
                                    <div className="space-y-3">
                                        <div>
                                            <Label>Months</Label>
                                            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                                                {MONTH_OPTIONS.map((month) => {
                                                    const selected = recurrenceUi.customYearMonths.includes(month.value);
                                                    return (
                                                        <button
                                                            key={month.value}
                                                            type="button"
                                                            onClick={() =>
                                                                setRecurrenceUi((prev) => {
                                                                    const exists = prev.customYearMonths.includes(month.value);
                                                                    const next = exists
                                                                        ? prev.customYearMonths.filter((entry) => entry !== month.value)
                                                                        : [...prev.customYearMonths, month.value];
                                                                    return { ...prev, customYearMonths: sortMonthNumbers(next) };
                                                                })
                                                            }
                                                            className={`rounded border px-2 py-1 text-xs ${
                                                                selected
                                                                    ? 'border-primary bg-primary/10 text-primary'
                                                                    : 'border-slate-300 bg-white text-slate-700'
                                                            }`}
                                                        >
                                                            {month.label.slice(0, 3)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Switch
                                                id="customYearUseWeekday"
                                                checked={recurrenceUi.customYearUseWeekday}
                                                onCheckedChange={(checked) =>
                                                    setRecurrenceUi((prev) => ({ ...prev, customYearUseWeekday: checked }))
                                                }
                                            />
                                            <Label htmlFor="customYearUseWeekday">On week</Label>
                                        </div>
                                        {recurrenceUi.customYearUseWeekday ? (
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div>
                                                    <Label htmlFor="customYearOrdinal">Week</Label>
                                                    <select
                                                        id="customYearOrdinal"
                                                        value={String(recurrenceUi.customYearOrdinal)}
                                                        onChange={(event) =>
                                                            setRecurrenceUi((prev) => ({ ...prev, customYearOrdinal: Number(event.target.value) }))
                                                        }
                                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    >
                                                        <option value="1">1st</option>
                                                        <option value="2">2nd</option>
                                                        <option value="3">3rd</option>
                                                        <option value="4">4th</option>
                                                        <option value="5">5th</option>
                                                        <option value="-1">Last</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <Label htmlFor="customYearWeekday">Day</Label>
                                                    <select
                                                        id="customYearWeekday"
                                                        value={recurrenceUi.customYearWeekday}
                                                        onChange={(event) =>
                                                            setRecurrenceUi((prev) => ({
                                                                ...prev,
                                                                customYearWeekday: event.target.value as WeekdayToken,
                                                            }))
                                                        }
                                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    >
                                                        <option value="SU">Sunday</option>
                                                        <option value="MO">Monday</option>
                                                        <option value="TU">Tuesday</option>
                                                        <option value="WE">Wednesday</option>
                                                        <option value="TH">Thursday</option>
                                                        <option value="FR">Friday</option>
                                                        <option value="SA">Saturday</option>
                                                        <option value="DAY">Day</option>
                                                        <option value="WEEKDAY">Weekday</option>
                                                        <option value="WEEKEND">Weekend Day</option>
                                                    </select>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                ) : null}
                {recurrenceUi.mode === 'rrule' ? (
                    <div className="space-y-2">
                        <Label htmlFor="advancedRrule">RRULE</Label>
                        <Input
                            id="advancedRrule"
                            value={recurrenceUi.advancedRrule}
                            onChange={(event) =>
                                setRecurrenceUi((prev) => ({
                                    ...prev,
                                    advancedRrule: event.target.value,
                                    unsupportedRrule: false,
                                }))
                            }
                            placeholder="FREQ=WEEKLY;BYDAY=MO,WE,FR"
                        />
                        {recurrenceUi.unsupportedRrule ? (
                            <p className="text-xs text-amber-700">
                                This existing rule uses options outside this simplified builder. Edit with RRULE string mode to preserve it.
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {/* One-off Days section */}
            {recurrenceUi.mode !== 'never' ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <button
                        type="button"
                        onClick={onToggleRdates}
                        className="flex w-full items-center justify-between gap-3 text-left"
                    >
                        <span className="text-sm font-medium text-slate-900">One-off Days</span>
                        <span className="text-xs text-muted-foreground">{rdatesSummaryText}</span>
                    </button>
                    {rdatesEnabled ? (
                        <div className="space-y-3">
                            {recurrenceRdates.map((oneOff, index) => (
                                <div key={oneOff.rowId} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Label htmlFor={`rdate-mode-${oneOff.rowId}`}>One-off {index + 1}</Label>
                                        <Button type="button" size="sm" variant="outline" onClick={() => onRemoveRdateRow(oneOff.rowId)}>
                                            Remove
                                        </Button>
                                    </div>
                                    <div>
                                        <Label htmlFor={`rdate-mode-${oneOff.rowId}`}>Type</Label>
                                        <select
                                            id={`rdate-mode-${oneOff.rowId}`}
                                            value={oneOff.mode}
                                            onChange={(event) =>
                                                setRecurrenceRdates((prev) =>
                                                    prev.map((entry) =>
                                                        entry.rowId === oneOff.rowId
                                                            ? { ...entry, mode: event.target.value as RecurrenceExceptionMode }
                                                            : entry
                                                    )
                                                )
                                            }
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        >
                                            <option value="date">Single date</option>
                                            <option value="range">Date range</option>
                                        </select>
                                    </div>
                                    {oneOff.mode === 'date' ? (
                                        <div>
                                            <Label htmlFor={`rdate-date-${oneOff.rowId}`}>One-off Date</Label>
                                            <Input
                                                id={`rdate-date-${oneOff.rowId}`}
                                                type="date"
                                                value={oneOff.date}
                                                onChange={(event) =>
                                                    setRecurrenceRdates((prev) =>
                                                        prev.map((entry) =>
                                                            entry.rowId === oneOff.rowId
                                                                ? {
                                                                      ...entry,
                                                                      date: event.target.value,
                                                                      rangeStart: event.target.value,
                                                                      rangeEnd: event.target.value,
                                                                  }
                                                                : entry
                                                        )
                                                    )
                                                }
                                            />
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                                <Label htmlFor={`rdate-range-start-${oneOff.rowId}`}>Range Start</Label>
                                                <Input
                                                    id={`rdate-range-start-${oneOff.rowId}`}
                                                    type="date"
                                                    value={oneOff.rangeStart}
                                                    onChange={(event) =>
                                                        setRecurrenceRdates((prev) =>
                                                            prev.map((entry) =>
                                                                entry.rowId === oneOff.rowId
                                                                    ? { ...entry, rangeStart: event.target.value }
                                                                    : entry
                                                            )
                                                        )
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor={`rdate-range-end-${oneOff.rowId}`}>Range End</Label>
                                                <Input
                                                    id={`rdate-range-end-${oneOff.rowId}`}
                                                    type="date"
                                                    value={oneOff.rangeEnd}
                                                    onChange={(event) =>
                                                        setRecurrenceRdates((prev) =>
                                                            prev.map((entry) =>
                                                                entry.rowId === oneOff.rowId
                                                                    ? { ...entry, rangeEnd: event.target.value }
                                                                    : entry
                                                            )
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <Button type="button" variant="outline" onClick={onAddRdateRow}>
                                Add another one-off day
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* Exceptions section */}
            {recurrenceUi.mode !== 'never' ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <button
                        type="button"
                        onClick={onToggleExceptions}
                        className="flex w-full items-center justify-between gap-3 text-left"
                    >
                        <span className="text-sm font-medium text-slate-900">Exceptions</span>
                        <span className="text-xs text-muted-foreground">{exceptionsSummaryText}</span>
                    </button>
                    {exceptionsEnabled ? (
                        <div className="space-y-3">
                            {recurrenceExceptions.map((exception, index) => (
                                <div key={exception.rowId} className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Label htmlFor={`exception-mode-${exception.rowId}`}>Exception {index + 1}</Label>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => onRemoveExceptionRow(exception.rowId)}
                                        >
                                            Remove
                                        </Button>
                                    </div>
                                    <div>
                                        <Label htmlFor={`exception-mode-${exception.rowId}`}>Type</Label>
                                        <select
                                            id={`exception-mode-${exception.rowId}`}
                                            value={exception.mode}
                                            onChange={(event) =>
                                                setRecurrenceExceptions((prev) =>
                                                    prev.map((entry) =>
                                                        entry.rowId === exception.rowId
                                                            ? { ...entry, mode: event.target.value as RecurrenceExceptionMode }
                                                            : entry
                                                    )
                                                )
                                            }
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        >
                                            <option value="date">Single date</option>
                                            <option value="range">Date range</option>
                                        </select>
                                    </div>
                                    {exception.mode === 'date' ? (
                                        <div>
                                            <Label htmlFor={`exception-date-${exception.rowId}`}>Exception Date</Label>
                                            <Input
                                                id={`exception-date-${exception.rowId}`}
                                                type="date"
                                                value={exception.date}
                                                onChange={(event) =>
                                                    setRecurrenceExceptions((prev) =>
                                                        prev.map((entry) =>
                                                            entry.rowId === exception.rowId
                                                                ? {
                                                                      ...entry,
                                                                      date: event.target.value,
                                                                      rangeStart: event.target.value,
                                                                      rangeEnd: event.target.value,
                                                                  }
                                                                : entry
                                                        )
                                                    )
                                                }
                                            />
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                                <Label htmlFor={`exception-range-start-${exception.rowId}`}>Range Start</Label>
                                                <Input
                                                    id={`exception-range-start-${exception.rowId}`}
                                                    type="date"
                                                    value={exception.rangeStart}
                                                    onChange={(event) =>
                                                        setRecurrenceExceptions((prev) =>
                                                            prev.map((entry) =>
                                                                entry.rowId === exception.rowId
                                                                    ? { ...entry, rangeStart: event.target.value }
                                                                    : entry
                                                            )
                                                        )
                                                    }
                                                />
                                            </div>
                                            <div>
                                                <Label htmlFor={`exception-range-end-${exception.rowId}`}>Range End</Label>
                                                <Input
                                                    id={`exception-range-end-${exception.rowId}`}
                                                    type="date"
                                                    value={exception.rangeEnd}
                                                    onChange={(event) =>
                                                        setRecurrenceExceptions((prev) =>
                                                            prev.map((entry) =>
                                                                entry.rowId === exception.rowId
                                                                    ? { ...entry, rangeEnd: event.target.value }
                                                                    : entry
                                                            )
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <Button type="button" variant="outline" onClick={onAddExceptionRow}>
                                Add another exception
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {/* Repeat End section */}
            {recurrenceUi.mode !== 'never' ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Label htmlFor="repeatEndMode">Repeat End</Label>
                        <p className="text-xs text-muted-foreground">{repeatEndSummaryText}</p>
                    </div>
                    <div>
                        <select
                            id="repeatEndMode"
                            value={recurrenceUi.repeatEndMode}
                            onChange={(event) => {
                                const nextMode = event.target.value as RepeatEndMode;
                                setRecurrenceUi((prev) => ({ ...prev, repeatEndMode: nextMode }));
                            }}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="forever">Repeat forever</option>
                            <option value="until">End on date</option>
                            <option value="count">End after occurrences</option>
                        </select>
                    </div>
                    {recurrenceUi.repeatEndMode === 'until' ? (
                        <div>
                            <Label htmlFor="repeatEndUntil">Ends On</Label>
                            <Input
                                id="repeatEndUntil"
                                type="date"
                                value={recurrenceUi.repeatEndUntil}
                                onChange={(event) =>
                                    setRecurrenceUi((prev) => ({ ...prev, repeatEndUntil: event.target.value }))
                                }
                                min={startDate || undefined}
                            />
                        </div>
                    ) : null}
                    {recurrenceUi.repeatEndMode === 'count' ? (
                        <div>
                            <Label htmlFor="repeatEndCount">Occurrences</Label>
                            <Input
                                id="repeatEndCount"
                                type="number"
                                min={1}
                                max={1000}
                                value={String(recurrenceUi.repeatEndCount)}
                                onChange={(event) => {
                                    const parsed = clampRecurrenceNumber(Number(event.target.value || 1), 1, 1000);
                                    setRecurrenceUi((prev) => ({ ...prev, repeatEndCount: parsed }));
                                }}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
        </>
    );
}
