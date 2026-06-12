'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface EventAlarmFieldsProps {
    travelDurationBeforeMinutes: string;
    travelDurationAfterMinutes: string;
    alarmEnabled: boolean;
    alarmAction: string;
    alarmTriggerMode: string;
    alarmTriggerMinutesBefore: string;
    alarmTriggerAt: string;
    alarmRepeatCount: string;
    alarmRepeatDurationMinutes: string;
    alarmRepeatUntilAcknowledged: boolean;
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
    onBooleanChange: (name: string, checked: boolean) => void;
}

export function EventAlarmFields({
    travelDurationBeforeMinutes,
    travelDurationAfterMinutes,
    alarmEnabled,
    alarmAction,
    alarmTriggerMode,
    alarmTriggerMinutesBefore,
    alarmTriggerAt,
    alarmRepeatCount,
    alarmRepeatDurationMinutes,
    alarmRepeatUntilAcknowledged,
    onChange,
    onBooleanChange,
}: EventAlarmFieldsProps) {
    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Label>Alarms & Travel</Label>
                <p className="text-xs text-muted-foreground">
                    Supports display/audio alarms and audio-until-ack behavior metadata.
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <Label htmlFor="travelDurationBeforeMinutes">Travel Before (minutes)</Label>
                    <Input
                        id="travelDurationBeforeMinutes"
                        name="travelDurationBeforeMinutes"
                        value={travelDurationBeforeMinutes}
                        onChange={onChange}
                        inputMode="numeric"
                        placeholder="15"
                    />
                </div>
                <div>
                    <Label htmlFor="travelDurationAfterMinutes">Travel After (minutes)</Label>
                    <Input
                        id="travelDurationAfterMinutes"
                        name="travelDurationAfterMinutes"
                        value={travelDurationAfterMinutes}
                        onChange={onChange}
                        inputMode="numeric"
                        placeholder="0"
                    />
                </div>
            </div>
            <div className="flex items-center space-x-2">
                <Switch
                    id="alarmEnabled"
                    checked={alarmEnabled}
                    onCheckedChange={(checked) => onBooleanChange('alarmEnabled', checked)}
                />
                <Label htmlFor="alarmEnabled">Enable alarm</Label>
            </div>
            {alarmEnabled && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="alarmAction">Alarm Action</Label>
                            <select
                                id="alarmAction"
                                name="alarmAction"
                                value={alarmAction}
                                onChange={onChange}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="display">Display</option>
                                <option value="audio">Audio</option>
                                <option value="audioUntilAck">Audio Until Acknowledged</option>
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="alarmTriggerMode">Trigger Mode</Label>
                            <select
                                id="alarmTriggerMode"
                                name="alarmTriggerMode"
                                value={alarmTriggerMode}
                                onChange={onChange}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                                <option value="relative">Relative to start</option>
                                <option value="absolute">Absolute datetime</option>
                            </select>
                        </div>
                    </div>
                    {alarmTriggerMode === 'absolute' ? (
                        <div>
                            <Label htmlFor="alarmTriggerAt">Trigger At</Label>
                            <Input
                                type="datetime-local"
                                id="alarmTriggerAt"
                                name="alarmTriggerAt"
                                value={alarmTriggerAt}
                                onChange={onChange}
                            />
                        </div>
                    ) : (
                        <div>
                            <Label htmlFor="alarmTriggerMinutesBefore">Minutes Before Start</Label>
                            <Input
                                id="alarmTriggerMinutesBefore"
                                name="alarmTriggerMinutesBefore"
                                value={alarmTriggerMinutesBefore}
                                onChange={onChange}
                                inputMode="numeric"
                                placeholder="15"
                            />
                        </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="alarmRepeatCount">Repeat Count</Label>
                            <Input
                                id="alarmRepeatCount"
                                name="alarmRepeatCount"
                                value={alarmRepeatCount}
                                onChange={onChange}
                                inputMode="numeric"
                                placeholder="0"
                            />
                        </div>
                        <div>
                            <Label htmlFor="alarmRepeatDurationMinutes">Repeat Duration (minutes)</Label>
                            <Input
                                id="alarmRepeatDurationMinutes"
                                name="alarmRepeatDurationMinutes"
                                value={alarmRepeatDurationMinutes}
                                onChange={onChange}
                                inputMode="numeric"
                                placeholder="5"
                            />
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="alarmRepeatUntilAcknowledged"
                            checked={alarmRepeatUntilAcknowledged}
                            onCheckedChange={(checked) => onBooleanChange('alarmRepeatUntilAcknowledged', checked)}
                        />
                        <Label htmlFor="alarmRepeatUntilAcknowledged">Continue audio until acknowledged</Label>
                    </div>
                </div>
            )}
        </div>
    );
}
