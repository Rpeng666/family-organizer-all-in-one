import React, { useEffect, useMemo, useState } from 'react';
import { tx, id } from '@instantdb/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
    COUNTDOWN_SETTINGS_NAME,
    DEFAULT_COUNTDOWN_SETTINGS,
    parseCountdownSettings,
    type CountdownSettings as CountdownSettingsType,
} from '@family-organizer/shared-core';
import { RefreshCcw } from 'lucide-react';

interface CountdownSettingsProps {
    db: any;
}

function secsToMinSec(secs: number): { min: string; sec: string } {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return { min: m > 0 ? String(m) : '', sec: s > 0 || m === 0 ? String(s) : '' };
}

function minSecToSecs(min: string, sec: string): number {
    const m = parseInt(min, 10) || 0;
    const s = parseInt(sec, 10) || 0;
    return Math.max(0, m * 60 + s);
}

export default function CountdownSettings({ db }: CountdownSettingsProps) {
    const { toast } = useToast();
    const { data, isLoading, error } = db.useQuery({
        settings: {
            $: {
                where: { name: COUNTDOWN_SETTINGS_NAME },
            },
        },
    });

    const storedRow = data?.settings?.[0] || null;
    const parsed = useMemo<CountdownSettingsType>(
        () => parseCountdownSettings(storedRow?.value || null),
        [storedRow?.value]
    );

    const [bufferMin, setBufferMin] = useState('');
    const [bufferSec, setBufferSec] = useState('');
    const [delayMin, setDelayMin] = useState('');
    const [delaySec, setDelaySec] = useState('');
    const [autoComplete, setAutoComplete] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const buf = secsToMinSec(parsed.stackBufferSecs);
        setBufferMin(buf.min);
        setBufferSec(buf.sec);
        const del = secsToMinSec(parsed.afterAnchorDefaultDelaySecs);
        setDelayMin(del.min);
        setDelaySec(del.sec);
        setAutoComplete(parsed.autoMarkCompleteOnCountdownEnd);
    }, [parsed]);

    const restoreDefaults = () => {
        const buf = secsToMinSec(DEFAULT_COUNTDOWN_SETTINGS.stackBufferSecs);
        setBufferMin(buf.min);
        setBufferSec(buf.sec);
        const del = secsToMinSec(DEFAULT_COUNTDOWN_SETTINGS.afterAnchorDefaultDelaySecs);
        setDelayMin(del.min);
        setDelaySec(del.sec);
        setAutoComplete(DEFAULT_COUNTDOWN_SETTINGS.autoMarkCompleteOnCountdownEnd);
    };

    const saveSettings = async () => {
        const stackBufferSecs = minSecToSecs(bufferMin, bufferSec);
        const afterAnchorDefaultDelaySecs = minSecToSecs(delayMin, delaySec);

        const settings: CountdownSettingsType = {
            stackBufferSecs,
            afterAnchorDefaultDelaySecs,
            autoMarkCompleteOnCountdownEnd: autoComplete,
        };

        // Preserve any existing perMarkerAfterDelaySecs
        if (parsed.perMarkerAfterDelaySecs && Object.keys(parsed.perMarkerAfterDelaySecs).length > 0) {
            settings.perMarkerAfterDelaySecs = parsed.perMarkerAfterDelaySecs;
        }

        setIsSaving(true);
        try {
            const settingId = storedRow?.id || id();
            await db.transact([
                tx.settings[settingId].update({
                    ...(storedRow?.id ? {} : { name: COUNTDOWN_SETTINGS_NAME }),
                    value: JSON.stringify(settings),
                }),
            ]);
            toast({
                title: 'Countdown settings saved',
                description: 'Buffer, delay, and auto-complete settings are updated.',
            });
        } catch (saveError: any) {
            console.error('Failed to save countdown settings:', saveError);
            toast({
                title: 'Save failed',
                description: saveError?.message || 'Could not save countdown settings.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <div>Loading countdown settings...</div>;
    if (error) return <div>Error loading countdown settings: {error.message}</div>;

    return (
        <Card className="w-full max-w-5xl">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                    <CardTitle>Countdown Timer</CardTitle>
                    <p className="mt-2 text-sm text-muted-foreground">
                        Configure how the chore countdown system packs and schedules chores.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={restoreDefaults}>
                        <RefreshCcw className="mr-2 h-4 w-4" /> Defaults
                    </Button>
                    <Button type="button" onClick={saveSettings} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Countdown'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div>
                        <h3 className="text-sm font-semibold">Stack Buffer</h3>
                        <p className="text-sm text-muted-foreground">
                            Time gap inserted between consecutive chores in a countdown stack.
                        </p>
                    </div>
                    <div className="flex items-end gap-3">
                        <div className="w-24 space-y-1">
                            <Label htmlFor="buffer-min">Minutes</Label>
                            <Input
                                id="buffer-min"
                                type="number"
                                min={0}
                                max={60}
                                value={bufferMin}
                                onChange={(e) => setBufferMin(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="w-24 space-y-1">
                            <Label htmlFor="buffer-sec">Seconds</Label>
                            <Input
                                id="buffer-sec"
                                type="number"
                                min={0}
                                max={59}
                                value={bufferSec}
                                onChange={(e) => setBufferSec(e.target.value)}
                                placeholder="30"
                            />
                        </div>
                        <div className="pb-2 text-sm text-muted-foreground">
                            = {minSecToSecs(bufferMin, bufferSec)}s
                        </div>
                    </div>
                </section>

                <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div>
                        <h3 className="text-sm font-semibold">After-Anchor Default Delay</h3>
                        <p className="text-sm text-muted-foreground">
                            Default delay after a routine marker fires before start-driven chores begin.
                            Individual markers can override this in Household Scheduling settings.
                        </p>
                    </div>
                    <div className="flex items-end gap-3">
                        <div className="w-24 space-y-1">
                            <Label htmlFor="delay-min">Minutes</Label>
                            <Input
                                id="delay-min"
                                type="number"
                                min={0}
                                max={120}
                                value={delayMin}
                                onChange={(e) => setDelayMin(e.target.value)}
                                placeholder="5"
                            />
                        </div>
                        <div className="w-24 space-y-1">
                            <Label htmlFor="delay-sec">Seconds</Label>
                            <Input
                                id="delay-sec"
                                type="number"
                                min={0}
                                max={59}
                                value={delaySec}
                                onChange={(e) => setDelaySec(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="pb-2 text-sm text-muted-foreground">
                            = {minSecToSecs(delayMin, delaySec)}s
                        </div>
                    </div>
                </section>

                <section className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <div>
                        <h3 className="text-sm font-semibold">Auto-Complete on Countdown End</h3>
                        <p className="text-sm text-muted-foreground">
                            Automatically mark chores as done when their countdown reaches zero.
                            This is a global default — can be toggled per session on the countdown page.
                        </p>
                    </div>
                    <Switch
                        checked={autoComplete}
                        onCheckedChange={setAutoComplete}
                    />
                </section>
            </CardContent>
        </Card>
    );
}
