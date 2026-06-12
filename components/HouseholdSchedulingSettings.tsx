import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { tx, id } from '@instantdb/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
    HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
    getChoreTimingMode,
    getChoreTimingRuleKey,
    getDefaultScheduleSettings,
    getFamilyDayDateUTC,
    parseSharedScheduleSettings,
    parseTimeOfDayToMinutes,
    resolveChoreTimingForDate,
    type SharedScheduleSettings,
} from '@family-organizer/shared-core';
import { PlusCircle, RefreshCcw, Trash2 } from 'lucide-react';

interface HouseholdSchedulingSettingsProps {
    db: any;
}

type WindowDeleteState = {
    key: string;
    label: string;
    chores: Array<{ id: string; title?: string | null }>;
} | null;

function slugifyKey(value: string) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 48);
}

function minutesToTimeInput(value: number | null) {
    if (!Number.isFinite(value)) return '';
    const safe = Math.max(0, Math.min(1439, Math.trunc(Number(value))));
    const hours = Math.floor(safe / 60);
    const minutes = safe % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function toFamilyDayOffset(minute: number, boundaryMinute: number) {
    return minute >= boundaryMinute ? minute - boundaryMinute : 1440 - boundaryMinute + minute;
}

export default function HouseholdSchedulingSettings({ db }: HouseholdSchedulingSettingsProps) {
    const { toast } = useToast();
    const { data, isLoading, error } = db.useQuery({
        settings: {
            $: {
                where: {
                    name: HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
                },
            },
        },
        chores: {},
    });

    const storedRow = data?.settings?.[0] || null;
    const chores = useMemo(() => (data?.chores as any[]) || [], [data?.chores]);
    const parsedSettings = useMemo<SharedScheduleSettings>(() => parseSharedScheduleSettings(storedRow?.value || null), [storedRow?.value]);
    const [draft, setDraft] = useState<SharedScheduleSettings>(() => getDefaultScheduleSettings());
    const [isSaving, setIsSaving] = useState(false);
    const [windowToDelete, setWindowToDelete] = useState<WindowDeleteState>(null);

    useEffect(() => {
        setDraft(parsedSettings);
    }, [parsedSettings]);

    const choresUsingNamedWindow = useMemo(() => {
        const map = new Map<string, Array<{ id: string; title?: string | null }>>();
        const referenceDate = getFamilyDayDateUTC(new Date(), parsedSettings);
        chores.forEach((chore) => {
            const mode = getChoreTimingMode(chore);
            const ruleKey = getChoreTimingRuleKey(chore, parsedSettings);
            if (mode !== 'named_window' || !ruleKey.startsWith('named_window:')) return;
            const key = ruleKey.slice('named_window:'.length);
            const existing = map.get(key) || [];
            existing.push({ id: chore.id, title: chore.title });
            map.set(key, existing);
            resolveChoreTimingForDate(chore, { date: referenceDate, chores, scheduleSettings: parsedSettings });
        });
        return map;
    }, [chores, parsedSettings]);

    const updateNamedWindow = (windowKey: string, field: 'label' | 'startMinute' | 'endMinute', value: string) => {
        setDraft((current) => ({
            ...current,
            timeBuckets: current.timeBuckets.map((window) => {
                if (window.key !== windowKey) return window;
                if (field === 'label') {
                    return {
                        ...window,
                        label: value,
                    };
                }
                return {
                    ...window,
                    [field]: parseTimeOfDayToMinutes(value) ?? window[field],
                };
            }),
        }));
    };

    const updateRoutineMarker = (markerKey: string, field: 'label' | 'defaultTime' | 'afterDelaySecs', value: string) => {
        setDraft((current) => ({
            ...current,
            routineMarkers: current.routineMarkers.map((marker) => {
                if (marker.key !== markerKey) return marker;
                if (field === 'afterDelaySecs') {
                    const num = parseInt(value, 10);
                    return {
                        ...marker,
                        afterDelaySecs: value === '' ? undefined : (Number.isFinite(num) && num >= 0 ? num : marker.afterDelaySecs),
                    };
                }
                return { ...marker, [field]: value };
            }),
        }));
    };

    const addNamedWindow = () => {
        setDraft((current) => {
            const baseLabel = 'New window';
            let suffix = 1;
            let nextKey = slugifyKey(baseLabel);
            const existingKeys = new Set(current.timeBuckets.map((window) => window.key));
            while (!nextKey || existingKeys.has(nextKey)) {
                suffix += 1;
                nextKey = slugifyKey(`${baseLabel} ${suffix}`);
            }
            return {
                ...current,
                timeBuckets: [
                    ...current.timeBuckets,
                    {
                        key: nextKey,
                        label: `New window ${suffix}`,
                        startMinute: 9 * 60,
                        endMinute: 10 * 60,
                        order: current.timeBuckets.length,
                    },
                ],
            };
        });
    };

    const addRoutineMarker = () => {
        setDraft((current) => {
            const baseLabel = 'New marker';
            let suffix = 1;
            let nextKey = slugifyKey(baseLabel);
            const existingKeys = new Set(current.routineMarkers.map((marker) => marker.key));
            while (!nextKey || existingKeys.has(nextKey)) {
                suffix += 1;
                nextKey = slugifyKey(`${baseLabel} ${suffix}`);
            }
            return {
                ...current,
                routineMarkers: [
                    ...current.routineMarkers,
                    {
                        key: nextKey,
                        label: `New marker ${suffix}`,
                        defaultTime: '08:00',
                    },
                ],
            };
        });
    };

    const requestDeleteNamedWindow = (windowKey: string) => {
        const target = draft.timeBuckets.find((window) => window.key === windowKey);
        if (!target) return;
        const dependents = choresUsingNamedWindow.get(windowKey) || [];
        if (dependents.length === 0) {
            setDraft((current) => ({
                ...current,
                timeBuckets: current.timeBuckets.filter((window) => window.key !== windowKey),
            }));
            return;
        }
        setWindowToDelete({
            key: windowKey,
            label: target.label,
            chores: dependents,
        });
    };

    const deleteRoutineMarker = (markerKey: string) => {
        setDraft((current) => ({
            ...current,
            routineMarkers: current.routineMarkers.filter((marker) => marker.key !== markerKey),
        }));
    };

    const convertWindowUsersToAnytime = async () => {
        if (!windowToDelete) return;
        setIsSaving(true);
        try {
            await db.transact(
                windowToDelete.chores.map((chore) =>
                    tx.chores[chore.id].update({
                        timingMode: 'anytime',
                        timeBucket: null,
                        timingConfig: { mode: 'anytime' },
                    })
                )
            );

            setDraft((current) => ({
                ...current,
                timeBuckets: current.timeBuckets.filter((window) => window.key !== windowToDelete.key),
            }));
            setWindowToDelete(null);
            toast({
                title: 'Converted to Anytime',
                description: `${windowToDelete.chores.length} chore${windowToDelete.chores.length === 1 ? '' : 's'} were converted to Anytime.`,
            });
        } catch (conversionError: any) {
            console.error('Failed converting named window chores to anytime:', conversionError);
            toast({
                title: 'Conversion failed',
                description: conversionError?.message || 'Could not convert chores to Anytime.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const restoreDefaults = () => {
        setDraft(getDefaultScheduleSettings());
    };

    const saveSettings = async () => {
        const boundaryMinute = parseTimeOfDayToMinutes(draft.dayBoundaryTime);
        if (boundaryMinute == null) {
            toast({
                title: 'Invalid family day start',
                description: 'Choose a valid time for the family-day cutoff.',
                variant: 'destructive',
            });
            return;
        }

        const windowKeys = new Set<string>();
        for (let index = 0; index < draft.timeBuckets.length; index += 1) {
            const window = draft.timeBuckets[index];
            const normalizedKey = slugifyKey(window.key || window.label);
            if (!normalizedKey) {
                toast({
                    title: 'Missing window key',
                    description: 'Each named window needs a key or label.',
                    variant: 'destructive',
                });
                return;
            }
            if (windowKeys.has(normalizedKey)) {
                toast({
                    title: 'Duplicate window key',
                    description: `Named window key "${normalizedKey}" is used more than once.`,
                    variant: 'destructive',
                });
                return;
            }
            windowKeys.add(normalizedKey);
            if (!window.label.trim()) {
                toast({
                    title: 'Missing window label',
                    description: 'Each named window needs a label.',
                    variant: 'destructive',
                });
                return;
            }
            if (!Number.isFinite(window.startMinute) || !Number.isFinite(window.endMinute)) {
                toast({
                    title: 'Missing window time',
                    description: `Set both start and end time for ${window.label}.`,
                    variant: 'destructive',
                });
                return;
            }
            const startOffset = toFamilyDayOffset(window.startMinute, boundaryMinute);
            const endOffset = toFamilyDayOffset(window.endMinute, boundaryMinute);
            if (endOffset <= startOffset) {
                toast({
                    title: 'Window crosses the family-day boundary',
                    description: `${window.label} cannot wrap across the family-day start of ${draft.dayBoundaryTime}.`,
                    variant: 'destructive',
                });
                return;
            }
        }

        const markerKeys = new Set<string>();
        for (const marker of draft.routineMarkers) {
            const key = slugifyKey(marker.key || marker.label);
            if (!key) {
                toast({
                    title: 'Missing marker key',
                    description: 'Each routine marker needs a key or label.',
                    variant: 'destructive',
                });
                return;
            }
            if (markerKeys.has(key)) {
                toast({
                    title: 'Duplicate marker key',
                    description: `Routine marker key "${key}" is used more than once.`,
                    variant: 'destructive',
                });
                return;
            }
            markerKeys.add(key);
            if (!marker.label.trim()) {
                toast({
                    title: 'Missing marker label',
                    description: 'Each routine marker needs a label.',
                    variant: 'destructive',
                });
                return;
            }
            if (parseTimeOfDayToMinutes(marker.defaultTime) == null) {
                toast({
                    title: 'Invalid marker time',
                    description: `Set a valid default time for ${marker.label}.`,
                    variant: 'destructive',
                });
                return;
            }
        }

        const normalizedDraft: SharedScheduleSettings = {
            dayBoundaryTime: draft.dayBoundaryTime,
            timeBuckets: draft.timeBuckets.map((window, index) => ({
                ...window,
                key: slugifyKey(window.key || window.label),
                order: index,
            })),
            routineMarkers: draft.routineMarkers.map((marker) => {
                const normalized: any = {
                    ...marker,
                    key: slugifyKey(marker.key || marker.label),
                    defaultStartedTime: marker.defaultTime,
                    defaultCompletedTime: marker.defaultTime,
                };
                if (marker.afterDelaySecs == null) {
                    delete normalized.afterDelaySecs;
                }
                return normalized;
            }),
        };

        setIsSaving(true);
        try {
            const settingId = storedRow?.id || id();
            await db.transact([
                tx.settings[settingId].update({
                    ...(storedRow?.id ? {} : { name: HOUSEHOLD_SCHEDULE_SETTINGS_NAME }),
                    value: JSON.stringify(normalizedDraft),
                }),
            ]);

            toast({
                title: 'Scheduling settings saved',
                description: 'Named windows, markers, and family-day start are updated.',
            });
        } catch (saveError: any) {
            console.error('Failed to save household scheduling settings:', saveError);
            toast({
                title: 'Save failed',
                description: saveError?.message || 'Could not save scheduling settings.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div>Loading scheduling settings...</div>;
    if (error) return <div>Error loading scheduling settings: {error.message}</div>;

    return (
        <>
            <Card className="w-full max-w-5xl">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                        <CardTitle>Household Scheduling</CardTitle>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Named windows are reusable labeled time ranges. They can overlap. Chores use only one schedule rule at a time.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={restoreDefaults}>
                            <RefreshCcw className="mr-2 h-4 w-4" /> Defaults
                        </Button>
                        <Button type="button" onClick={saveSettings} disabled={isSaving}>
                            {isSaving ? 'Saving...' : 'Save Scheduling'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-8">
                    <section className="space-y-4 rounded-2xl border border-border/50 bg-secondary/40 p-4">
                        <div>
                            <h3 className="text-lg font-semibold">Family Day</h3>
                            <p className="text-sm text-muted-foreground">
                                This is when a new chore day starts. `Anytime` chores stay in `Now` from this time until the next family day starts.
                            </p>
                        </div>
                        <div className="max-w-xs space-y-2">
                            <Label htmlFor="dayBoundaryTime">Day starts at</Label>
                            <Input
                                id="dayBoundaryTime"
                                type="time"
                                value={draft.dayBoundaryTime}
                                onChange={(event) => setDraft((current) => ({ ...current, dayBoundaryTime: event.target.value }))}
                            />
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold">Named Windows</h3>
                                <p className="text-sm text-muted-foreground">
                                    Use these for labels like `Morning` or `Early morning`. They may overlap, but they cannot cross the family-day boundary.
                                </p>
                            </div>
                            <Button type="button" variant="outline" onClick={addNamedWindow}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Add window
                            </Button>
                        </div>
                        <div className="space-y-4">
                            {draft.timeBuckets.map((window) => (
                                <div key={window.key} className="grid gap-3 rounded-2xl border border-border/50 bg-card p-4 md:grid-cols-[1.4fr_1fr_1fr_auto]">
                                    <div className="space-y-2">
                                        <Label htmlFor={`window-label-${window.key}`}>Label</Label>
                                        <Input
                                            id={`window-label-${window.key}`}
                                            value={window.label}
                                            onChange={(event) => updateNamedWindow(window.key, 'label', event.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`window-start-${window.key}`}>Start</Label>
                                        <Input
                                            id={`window-start-${window.key}`}
                                            type="time"
                                            value={minutesToTimeInput(window.startMinute)}
                                            onChange={(event) => updateNamedWindow(window.key, 'startMinute', event.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`window-end-${window.key}`}>End</Label>
                                        <Input
                                            id={`window-end-${window.key}`}
                                            type="time"
                                            value={minutesToTimeInput(window.endMinute)}
                                            onChange={(event) => updateNamedWindow(window.key, 'endMinute', event.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <Button type="button" variant="ghost" size="icon" onClick={() => requestDeleteNamedWindow(window.key)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold">Routine Markers</h3>
                                <p className="text-sm text-muted-foreground">
                                    These are single moments like Breakfast or Dinner. The daily chores view uses one `Mark happened` action for them.
                                </p>
                            </div>
                            <Button type="button" variant="outline" onClick={addRoutineMarker}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Add marker
                            </Button>
                        </div>
                        <div className="space-y-4">
                            {draft.routineMarkers.map((marker) => (
                                <div key={marker.key} className="grid gap-3 rounded-2xl border border-border/50 bg-card p-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
                                    <div className="space-y-2">
                                        <Label htmlFor={`marker-label-${marker.key}`}>Label</Label>
                                        <Input
                                            id={`marker-label-${marker.key}`}
                                            value={marker.label}
                                            onChange={(event) => updateRoutineMarker(marker.key, 'label', event.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`marker-time-${marker.key}`}>Default time</Label>
                                        <Input
                                            id={`marker-time-${marker.key}`}
                                            type="time"
                                            value={marker.defaultTime}
                                            onChange={(event) => updateRoutineMarker(marker.key, 'defaultTime', event.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor={`marker-delay-${marker.key}`}>After delay (s)</Label>
                                        <Input
                                            id={`marker-delay-${marker.key}`}
                                            type="number"
                                            min={0}
                                            placeholder="global default"
                                            value={marker.afterDelaySecs != null ? String(marker.afterDelaySecs) : ''}
                                            onChange={(event) => updateRoutineMarker(marker.key, 'afterDelaySecs', event.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-end">
                                        <Button type="button" variant="ghost" size="icon" onClick={() => deleteRoutineMarker(marker.key)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </CardContent>
            </Card>

            <Dialog open={windowToDelete !== null} onOpenChange={(open) => !open && setWindowToDelete(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Window In Use</DialogTitle>
                        <DialogDescription>
                            {windowToDelete ? `${windowToDelete.label} is used by ${windowToDelete.chores.length} chore${windowToDelete.chores.length === 1 ? '' : 's'}.` : ''}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 text-sm text-muted-foreground">
                        <p>You can convert those chores to `Anytime` automatically, or review them first.</p>
                        <div className="max-h-56 overflow-y-auto rounded-xl border border-border/50 bg-secondary/40 p-3">
                            <ul className="space-y-1">
                                {windowToDelete?.chores.map((chore) => (
                                    <li key={chore.id}>{chore.title || 'Untitled chore'}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
                        <Link href={`/chores/all?catalog=all&schedule=${encodeURIComponent(`named_window:${windowToDelete?.key || ''}`)}`}>
                            <Button type="button" variant="outline">
                                Review chores first
                            </Button>
                        </Link>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" onClick={() => setWindowToDelete(null)}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={convertWindowUsersToAnytime} disabled={isSaving}>
                                Convert all to Anytime
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
