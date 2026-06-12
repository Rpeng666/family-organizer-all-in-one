import React, { Dispatch, SetStateAction, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    MONTH_DAY_CHOICES,
    MONTH_OPTIONS,
    WEEKDAY_CHIPS,
    type CustomUnit,
    type RecurrenceUiState,
    type RepeatEndMode,
    type RepeatMode,
    type WeekdayToken,
    clampRecurrenceNumber,
    recurrenceSummary,
    serializeRecurrenceToRrule,
    sortMonthDays,
    sortMonthNumbers,
    sortWeekdayCodes,
} from '@/lib/recurrence';

interface ChoreRecurrenceFieldsProps {
    startDateValue: string;
    recurrenceUi: RecurrenceUiState;
    setRecurrenceUi: Dispatch<SetStateAction<RecurrenceUiState>>;
    disableEditing?: boolean;
}

const END_MODE_OPTIONS: Array<{ value: RepeatEndMode; label: string }> = [
    { value: 'forever', label: 'Repeat forever' },
    { value: 'until', label: 'End on date' },
    { value: 'count', label: 'End after occurrences' },
];

export default function ChoreRecurrenceFields({
    startDateValue,
    recurrenceUi,
    setRecurrenceUi,
    disableEditing = false,
}: ChoreRecurrenceFieldsProps) {
    const recurrenceSummaryText = useMemo(() => recurrenceSummary(recurrenceUi, startDateValue), [recurrenceUi, startDateValue]);
    const repeatEndSummaryText = useMemo(() => {
        if (recurrenceUi.mode === 'never') return 'No end (does not repeat)';
        if (recurrenceUi.repeatEndMode === 'forever') return 'Repeat forever';
        if (recurrenceUi.repeatEndMode === 'count') {
            const count = clampRecurrenceNumber(recurrenceUi.repeatEndCount, 1, 1000);
            return `End after ${count} occurrence${count === 1 ? '' : 's'}`;
        }
        if (!recurrenceUi.repeatEndUntil) return 'Ends on a specific date';
        const parsed = new Date(`${recurrenceUi.repeatEndUntil}T00:00:00`);
        return Number.isNaN(parsed.getTime())
            ? 'Ends on a specific date'
            : `Ends on ${parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }, [recurrenceUi]);

    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Label>Repeat</Label>
                <p className="text-xs text-muted-foreground">{recurrenceSummaryText}</p>
            </div>
            <div>
                <Label htmlFor="chore-repeat-mode">Repeat</Label>
                <select
                    id="chore-repeat-mode"
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
                    disabled={disableEditing}
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
                            <Label htmlFor="chore-custom-interval">Every</Label>
                            <Input
                                id="chore-custom-interval"
                                type="number"
                                min={1}
                                max={1000}
                                value={String(recurrenceUi.customInterval)}
                                disabled={disableEditing}
                                onChange={(event) => {
                                    const parsed = clampRecurrenceNumber(Number(event.target.value || 1), 1, 1000);
                                    setRecurrenceUi((prev) => ({ ...prev, customInterval: parsed }));
                                }}
                            />
                        </div>
                        <div>
                            <Label htmlFor="chore-custom-unit">Unit</Label>
                            <select
                                id="chore-custom-unit"
                                value={recurrenceUi.customUnit}
                                disabled={disableEditing}
                                onChange={(event) =>
                                    setRecurrenceUi((prev) => {
                                        const nextUnit = event.target.value as CustomUnit;
                                        return {
                                            ...prev,
                                            customUnit: nextUnit,
                                            customYearMonths:
                                                nextUnit === 'year' && prev.customYearMonths.length === 0
                                                    ? [new Date(`${startDateValue}T00:00:00`).getMonth() + 1 || 1]
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
                            disabled={disableEditing}
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
                                                    disabled={disableEditing}
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
                                                        selected ? 'border-primary bg-primary/10 text-primary' : 'border-slate-300 bg-white text-slate-700'
                                                    } ${disableEditing ? 'opacity-60' : ''}`}
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
                                            disabled={disableEditing}
                                            onClick={() => setRecurrenceUi((prev) => ({ ...prev, customMonthMode: 'days' }))}
                                            className={`rounded-md border px-3 py-1 text-xs ${
                                                recurrenceUi.customMonthMode === 'days'
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-slate-300 bg-white text-slate-700'
                                            } ${disableEditing ? 'opacity-60' : ''}`}
                                        >
                                            On days
                                        </button>
                                        <button
                                            type="button"
                                            disabled={disableEditing}
                                            onClick={() => setRecurrenceUi((prev) => ({ ...prev, customMonthMode: 'week' }))}
                                            className={`rounded-md border px-3 py-1 text-xs ${
                                                recurrenceUi.customMonthMode === 'week'
                                                    ? 'border-primary bg-primary/10 text-primary'
                                                    : 'border-slate-300 bg-white text-slate-700'
                                            } ${disableEditing ? 'opacity-60' : ''}`}
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
                                                            disabled={disableEditing}
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
                                                            } ${disableEditing ? 'opacity-60' : ''}`}
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
                                                <Label htmlFor="chore-custom-month-ordinal">Week</Label>
                                                <select
                                                    id="chore-custom-month-ordinal"
                                                    value={String(recurrenceUi.customMonthOrdinal)}
                                                    disabled={disableEditing}
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
                                                <Label htmlFor="chore-custom-month-weekday">Day</Label>
                                                <select
                                                    id="chore-custom-month-weekday"
                                                    value={recurrenceUi.customMonthWeekday}
                                                    disabled={disableEditing}
                                                    onChange={(event) =>
                                                        setRecurrenceUi((prev) => ({ ...prev, customMonthWeekday: event.target.value as WeekdayToken }))
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
                                                        disabled={disableEditing}
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
                                                        } ${disableEditing ? 'opacity-60' : ''}`}
                                                    >
                                                        {month.label.slice(0, 3)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="chore-custom-year-week">Pattern</Label>
                                        <select
                                            id="chore-custom-year-week"
                                            value={recurrenceUi.customYearUseWeekday ? 'weekday' : 'date'}
                                            disabled={disableEditing}
                                            onChange={(event) =>
                                                setRecurrenceUi((prev) => ({ ...prev, customYearUseWeekday: event.target.value === 'weekday' }))
                                            }
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        >
                                            <option value="date">Use month date</option>
                                            <option value="weekday">Use weekday pattern</option>
                                        </select>
                                    </div>
                                    {recurrenceUi.customYearUseWeekday ? (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                                <Label htmlFor="chore-custom-year-ordinal">Week</Label>
                                                <select
                                                    id="chore-custom-year-ordinal"
                                                    value={String(recurrenceUi.customYearOrdinal)}
                                                    disabled={disableEditing}
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
                                                <Label htmlFor="chore-custom-year-weekday">Day</Label>
                                                <select
                                                    id="chore-custom-year-weekday"
                                                    value={recurrenceUi.customYearWeekday}
                                                    disabled={disableEditing}
                                                    onChange={(event) =>
                                                        setRecurrenceUi((prev) => ({ ...prev, customYearWeekday: event.target.value as WeekdayToken }))
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
                    <Label htmlFor="chore-advanced-rrule">RRULE</Label>
                    <Input
                        id="chore-advanced-rrule"
                        value={recurrenceUi.advancedRrule}
                        disabled={disableEditing}
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
                            This rule uses options outside the simplified builder. RRULE string mode preserves it.
                        </p>
                    ) : null}
                </div>
            ) : null}
            {recurrenceUi.mode !== 'never' ? (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Label htmlFor="chore-repeat-end-mode">Repeat End</Label>
                        <p className="text-xs text-muted-foreground">{repeatEndSummaryText}</p>
                    </div>
                    <div>
                        <select
                            id="chore-repeat-end-mode"
                            value={recurrenceUi.repeatEndMode}
                            disabled={disableEditing}
                            onChange={(event) => {
                                const nextMode = event.target.value as RepeatEndMode;
                                setRecurrenceUi((prev) => ({ ...prev, repeatEndMode: nextMode }));
                            }}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {END_MODE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    {recurrenceUi.repeatEndMode === 'until' ? (
                        <div>
                            <Label htmlFor="chore-repeat-end-until">Ends On</Label>
                            <Input
                                id="chore-repeat-end-until"
                                type="date"
                                value={recurrenceUi.repeatEndUntil}
                                disabled={disableEditing}
                                onChange={(event) => setRecurrenceUi((prev) => ({ ...prev, repeatEndUntil: event.target.value }))}
                                min={startDateValue || undefined}
                            />
                        </div>
                    ) : null}
                    {recurrenceUi.repeatEndMode === 'count' ? (
                        <div>
                            <Label htmlFor="chore-repeat-end-count">Occurrences</Label>
                            <Input
                                id="chore-repeat-end-count"
                                type="number"
                                min={1}
                                max={1000}
                                value={String(recurrenceUi.repeatEndCount)}
                                disabled={disableEditing}
                                onChange={(event) => {
                                    const parsed = clampRecurrenceNumber(Number(event.target.value || 1), 1, 1000);
                                    setRecurrenceUi((prev) => ({ ...prev, repeatEndCount: parsed }));
                                }}
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
            <input type="hidden" name="rrule" value={serializeRecurrenceToRrule(recurrenceUi, startDateValue)} />
        </div>
    );
}
