import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

export type ChoreTimingMode =
    | 'anytime'
    | 'named_window'
    | 'before_time'
    | 'after_time'
    | 'between_times'
    | 'before_marker'
    | 'after_marker'
    | 'before_chore'
    | 'after_chore';

interface ChoreTimingConfiguratorProps {
    timingMode: ChoreTimingMode;
    setTimingMode: (mode: ChoreTimingMode) => void;
    timeBucket: string;
    setTimeBucket: (v: string) => void;
    timeBucketOptions: { value: string; label: string }[];
    triggerTime: string;
    setTriggerTime: (v: string) => void;
    windowStartTime: string;
    setWindowStartTime: (v: string) => void;
    windowEndTime: string;
    setWindowEndTime: (v: string) => void;
    anchorRoutineKey: string;
    setAnchorRoutineKey: (v: string) => void;
    routineMarkerOptions: { value: string; label: string }[];
    anchorChoreId: string;
    setAnchorChoreId: (v: string) => void;
    availableAnchorChores: { id: string; title?: string | null }[];
    anchorFallbackTime: string;
    setAnchorFallbackTime: (v: string) => void;
    familyDayStartsAt: string;
}

function TimingHelpPopover({ title, lines }: { title: string; lines: string[] }) {
    return (
        <Popover>
            <TooltipProvider delayDuration={150}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                                aria-label={`Explain ${title}`}
                            >
                                <HelpCircle className="h-4 w-4" />
                            </button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{title}</TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <PopoverContent align="start" className="w-80 space-y-2">
                <div className="font-medium text-slate-900">{title}</div>
                <div className="space-y-2 text-sm text-slate-600">
                    {lines.map((line, i) => <p key={i}>{line}</p>)}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function ChoreTimingConfigurator({
    timingMode,
    setTimingMode,
    timeBucket,
    setTimeBucket,
    timeBucketOptions,
    triggerTime,
    setTriggerTime,
    windowStartTime,
    setWindowStartTime,
    windowEndTime,
    setWindowEndTime,
    anchorRoutineKey,
    setAnchorRoutineKey,
    routineMarkerOptions,
    anchorChoreId,
    setAnchorChoreId,
    availableAnchorChores,
    anchorFallbackTime,
    setAnchorFallbackTime,
    familyDayStartsAt,
}: ChoreTimingConfiguratorProps) {
    const routineAnchorHelpLines = timingMode === 'before_marker'
        ? [
              `This chore runs from the family-day start at ${familyDayStartsAt} until the marker happens.`,
              'Fallback time is the backup anchor if the marker is never marked that day.',
              'Example: "Before Breakfast" means 3:00 AM until Breakfast, or until the fallback time if Breakfast is not marked.',
          ]
        : [
              `This chore starts when the marker happens and runs until the next family-day cutoff at ${familyDayStartsAt}.`,
              'Fallback time is the backup anchor if the marker is never marked that day.',
              'Example: "After Dinner" means Dinner until 3:00 AM, or from the fallback time if Dinner is not marked.',
          ];

    const choreAnchorHelpLines = timingMode === 'before_chore'
        ? [
              `This chore runs from the family-day start at ${familyDayStartsAt} until the linked chore is completed.`,
              'Fallback time is required so the chore still has a usable backup anchor if the linked chore never gets completed.',
          ]
        : [
              `This chore runs from the linked chore completion until the next family-day cutoff at ${familyDayStartsAt}.`,
              'Fallback time is required so the chore still has a usable backup anchor if the linked chore never gets completed.',
          ];

    return (
        <div className="space-y-4 border-t pt-3">
            <div className="space-y-2">
                <Label className="font-semibold">When does this happen?</Label>
                <RadioGroup value={timingMode} onValueChange={(v) => setTimingMode(v as ChoreTimingMode)}>
                    {[
                        { value: 'anytime', label: 'Anytime' },
                        { value: 'named_window', label: 'Named window' },
                        { value: 'before_time', label: 'Before a time' },
                        { value: 'after_time', label: 'After a time' },
                        { value: 'between_times', label: 'Between two times' },
                        { value: 'before_marker', label: 'Before a routine marker' },
                        { value: 'after_marker', label: 'After a routine marker' },
                        { value: 'before_chore', label: 'Before another chore' },
                        { value: 'after_chore', label: 'After another chore' },
                    ].map(({ value, label }) => (
                        <div key={value} className="flex items-center space-x-2">
                            <RadioGroupItem value={value} id={`timing-${value}`} />
                            <Label htmlFor={`timing-${value}`}>{label}</Label>
                        </div>
                    ))}
                </RadioGroup>
            </div>

            {timingMode === 'named_window' && (
                <div className="space-y-2">
                    <Label htmlFor="timeBucket">Named Window</Label>
                    <select
                        id="timeBucket"
                        value={timeBucket}
                        onChange={(e) => setTimeBucket(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                        <option value="">Choose a named window…</option>
                        {timeBucketOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                        This uses one of the reusable labeled ranges from Household Scheduling settings.
                    </p>
                </div>
            )}

            {(timingMode === 'before_time' || timingMode === 'after_time') && (
                <div className="space-y-2">
                    <Label htmlFor="triggerTime">Anchor Time</Label>
                    <Input id="triggerTime" type="time" value={triggerTime} onChange={(e) => setTriggerTime(e.target.value)} />
                    <p className="text-xs text-muted-foreground">
                        {timingMode === 'before_time' ? 'Before' : 'After'} uses the family-day boundary at {familyDayStartsAt} as the other edge of the window.
                    </p>
                </div>
            )}

            {timingMode === 'between_times' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="windowStartTime">Window Start</Label>
                        <Input id="windowStartTime" type="time" value={windowStartTime} onChange={(e) => setWindowStartTime(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="windowEndTime">Window End</Label>
                        <Input id="windowEndTime" type="time" value={windowEndTime} onChange={(e) => setWindowEndTime(e.target.value)} />
                    </div>
                </div>
            )}

            {(timingMode === 'before_marker' || timingMode === 'after_marker') && (
                <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white/80 p-3">
                        <div>
                            <div className="font-medium text-slate-900">Marker fallback anchor</div>
                            <p className="mt-1 text-xs text-slate-600">
                                This chore uses one marker moment. If the marker is not marked, the fallback time becomes the backup anchor.
                            </p>
                        </div>
                        <TimingHelpPopover title="How fallback times work" lines={routineAnchorHelpLines} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="anchorRoutineKey">Routine Marker</Label>
                        <select
                            id="anchorRoutineKey"
                            value={anchorRoutineKey}
                            onChange={(e) => setAnchorRoutineKey(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {routineMarkerOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="anchorFallbackTime">Fallback Time (Optional)</Label>
                        <Input id="anchorFallbackTime" type="time" value={anchorFallbackTime} onChange={(e) => setAnchorFallbackTime(e.target.value)} />
                        <p className="text-xs text-muted-foreground">
                            If the marker is never marked, this time becomes the backup anchor. Otherwise the marker&apos;s own default time is used.
                        </p>
                    </div>
                </div>
            )}

            {(timingMode === 'before_chore' || timingMode === 'after_chore') && (
                <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white/80 p-3">
                        <div>
                            <div className="font-medium text-slate-900">Chore fallback anchor</div>
                            <p className="mt-1 text-xs text-slate-600">
                                The linked chore gives the real anchor when it is completed. The fallback time is required so this chore still resolves if that never happens.
                            </p>
                        </div>
                        <TimingHelpPopover title="How chore-anchor fallback works" lines={choreAnchorHelpLines} />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="anchorChoreId">Anchor Chore</Label>
                        <select
                            id="anchorChoreId"
                            value={anchorChoreId}
                            onChange={(e) => setAnchorChoreId(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            <option value="">Choose a chore…</option>
                            {availableAnchorChores.map((chore) => (
                                <option key={chore.id} value={chore.id}>{chore.title || 'Untitled chore'}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="choreAnchorFallbackTime">Fallback Time</Label>
                        <Input id="choreAnchorFallbackTime" type="time" value={anchorFallbackTime} onChange={(e) => setAnchorFallbackTime(e.target.value)} />
                        <p className="text-xs text-muted-foreground">
                            This backup anchor is used if the linked chore is never completed that day.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
