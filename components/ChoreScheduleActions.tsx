import React, { useEffect, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ChoreSchedulePatch, ChoreScheduleLike } from '@/lib/chore-schedule';
import {
    cancelChorePausePatch,
    createChorePausePatch,
    getChoreNextOccurrenceFromBaseSchedule,
    getChorePauseStatus,
    resumeChorePatch,
} from '@/lib/chore-schedule';

interface ChoreScheduleActionsProps {
    chore: ChoreScheduleLike & { id: string; title?: string | null };
    onApplySchedulePatch: (patch: ChoreSchedulePatch) => Promise<void> | void;
}

function formatDateLabel(value?: string | null): string {
    if (!value) return '';
    const parsed = parseISO(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateOnly(value: Date | string): string {
    if (value instanceof Date) {
        return format(value, 'yyyy-MM-dd');
    }

    const rawValue = String(value || '');
    const parsed = rawValue.includes('T') ? new Date(rawValue) : parseISO(`${rawValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return format(new Date(), 'yyyy-MM-dd');
    }
    return format(parsed, 'yyyy-MM-dd');
}

function toDateInputValue(value: Date): string {
    return format(value, 'yyyy-MM-dd');
}

function defaultResumeDate(chore: ChoreScheduleLike): string {
    const tomorrow = addDays(new Date(), 1);
    const nextOccurrence = getChoreNextOccurrenceFromBaseSchedule(chore, tomorrow, true);
    return nextOccurrence ? toDateInputValue(nextOccurrence) : toDateInputValue(tomorrow);
}

export default function ChoreScheduleActions({ chore, onApplySchedulePatch }: ChoreScheduleActionsProps) {
    const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
    const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
    const [pauseIntent, setPauseIntent] = useState<'paused' | 'ended'>('paused');
    const [pauseStartDate, setPauseStartDate] = useState(() => toDateInputValue(new Date()));
    const [resumeAutomatically, setResumeAutomatically] = useState(false);
    const [pauseResumeDate, setPauseResumeDate] = useState(() => defaultResumeDate(chore));
    const [resumeOnDate, setResumeOnDate] = useState(() => defaultResumeDate(chore));
    const [isSaving, setIsSaving] = useState(false);

    const scheduleStatus = useMemo(() => getChorePauseStatus(chore), [chore]);
    const hasRecurrence = Boolean(String(chore.rrule || '').trim());
    const title = String(chore.title || 'this chore');

    useEffect(() => {
        if (!pauseDialogOpen) return;
        const existingPause = chore.pauseState || null;
        if (pauseIntent === 'ended') {
            const lastActiveDay =
                existingPause?.mode === 'open-ended' && existingPause.pauseStartDate
                    ? format(addDays(parseISO(`${existingPause.pauseStartDate}T00:00:00`), -1), 'yyyy-MM-dd')
                    : toDateInputValue(new Date());
            setPauseStartDate(lastActiveDay);
            setResumeAutomatically(false);
            setPauseResumeDate(defaultResumeDate(chore));
            return;
        }

        setPauseStartDate(existingPause?.pauseStartDate || toDateInputValue(new Date()));
        setResumeAutomatically(Boolean(existingPause?.resumeOnDate));
        setPauseResumeDate(existingPause?.resumeOnDate || defaultResumeDate(chore));
    }, [chore, pauseDialogOpen, pauseIntent]);

    useEffect(() => {
        if (!resumeDialogOpen) return;
        setResumeOnDate(defaultResumeDate(chore));
    }, [chore, resumeDialogOpen]);

    if (!hasRecurrence) {
        return null;
    }

    const statusDescription = (() => {
        if (scheduleStatus.kind === 'none') return 'This recurring chore is active.';
        if (scheduleStatus.kind === 'scheduled') {
            const pauseState = scheduleStatus.pauseState;
            if (!pauseState) return 'A schedule change is queued.';
            if (pauseState.mode === 'open-ended' && pauseState.intent === 'ended') {
                return `Scheduled to end after ${formatDateLabel(format(addDays(parseISO(`${pauseState.pauseStartDate}T00:00:00`), -1), 'yyyy-MM-dd'))}.`;
            }
            if (pauseState.mode === 'bounded' && pauseState.resumeOnDate) {
                return `Scheduled pause from ${formatDateLabel(pauseState.pauseStartDate)} to ${formatDateLabel(
                    format(addDays(parseISO(`${pauseState.resumeOnDate}T00:00:00`), -1), 'yyyy-MM-dd')
                )}.`;
            }
            return `Scheduled pause beginning ${formatDateLabel(pauseState.pauseStartDate)}.`;
        }
        if (scheduleStatus.kind === 'ended') {
            return `This chore is ended${chore.pauseState?.pauseStartDate ? ` as of ${formatDateLabel(chore.pauseState.pauseStartDate)}` : ''}.`;
        }
        if (scheduleStatus.kind === 'paused') {
            if (chore.pauseState?.mode === 'bounded' && chore.pauseState.resumeOnDate) {
                return `Paused until ${formatDateLabel(chore.pauseState.resumeOnDate)}.`;
            }
            return `Paused since ${formatDateLabel(chore.pauseState?.pauseStartDate)}.`;
        }
        return 'The current pause window has completed.';
    })();

    const handlePauseSave = async () => {
        try {
            setIsSaving(true);
            const patch =
                pauseIntent === 'ended'
                    ? createChorePausePatch(chore, {
                          pauseStartDate: format(addDays(parseISO(`${pauseStartDate}T00:00:00`), 1), 'yyyy-MM-dd'),
                          intent: 'ended',
                      })
                    : createChorePausePatch(chore, {
                          pauseStartDate,
                          resumeOnDate: resumeAutomatically ? pauseResumeDate : null,
                          intent: 'paused',
                      });
            await onApplySchedulePatch(patch);
            setPauseDialogOpen(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleResumeSave = async () => {
        try {
            setIsSaving(true);
            await onApplySchedulePatch(
                resumeChorePatch(chore, {
                    resumeOnDate,
                })
            );
            setResumeDialogOpen(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelPause = async () => {
        try {
            setIsSaving(true);
            await onApplySchedulePatch(cancelChorePausePatch(chore));
        } finally {
            setIsSaving(false);
        }
    };

    const openPauseEditor = (intent: 'paused' | 'ended') => {
        setPauseIntent(intent);
        setPauseDialogOpen(true);
    };

    const pauseState = scheduleStatus.pauseState;
    const showActiveActions = scheduleStatus.kind === 'none' || scheduleStatus.kind === 'completed';
    const showPausedActions = scheduleStatus.kind === 'paused' || scheduleStatus.kind === 'ended';
    const showScheduledActions = scheduleStatus.kind === 'scheduled';
    const resumeLabel = scheduleStatus.kind === 'ended' ? 'Restart chore' : 'Unpause';

    return (
        <>
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="space-y-1">
                    <Label className="text-sm">Schedule Status</Label>
                    <p className="text-xs text-muted-foreground">{statusDescription}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {showActiveActions ? (
                        <>
                            <Button type="button" variant="outline" onClick={() => openPauseEditor('paused')}>
                                Pause chore
                            </Button>
                            <Button type="button" variant="outline" onClick={() => openPauseEditor('ended')}>
                                End chore
                            </Button>
                        </>
                    ) : null}
                    {showScheduledActions ? (
                        <>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => openPauseEditor(pauseState?.intent === 'ended' ? 'ended' : 'paused')}
                            >
                                {pauseState?.intent === 'ended' ? 'Edit end' : 'Edit pause'}
                            </Button>
                            <Button type="button" variant="outline" onClick={handleCancelPause} disabled={isSaving}>
                                {pauseState?.intent === 'ended' ? 'Cancel end' : 'Cancel pause'}
                            </Button>
                        </>
                    ) : null}
                    {showPausedActions ? (
                        <>
                            {pauseState?.mode === 'bounded' ? (
                                <Button type="button" variant="outline" onClick={() => openPauseEditor('paused')} disabled={isSaving}>
                                    Edit pause
                                </Button>
                            ) : null}
                            <Button type="button" variant="outline" onClick={() => setResumeDialogOpen(true)} disabled={isSaving}>
                                {resumeLabel}
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>

            <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{pauseIntent === 'ended' ? `End ${title}` : `Pause ${title}`}</DialogTitle>
                        <DialogDescription>
                            {pauseIntent === 'ended'
                                ? 'Choose the last day this chore should still appear.'
                                : 'Choose when the pause begins and, optionally, when it should resume automatically.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="chore-pause-start">{pauseIntent === 'ended' ? 'Last active day' : 'Pause begins'}</Label>
                            <Input
                                id="chore-pause-start"
                                type="date"
                                value={pauseStartDate}
                                min={formatDateOnly(chore.startDate)}
                                onChange={(event) => setPauseStartDate(event.target.value)}
                            />
                        </div>
                        {pauseIntent === 'paused' ? (
                            <>
                                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                                    <div className="space-y-1">
                                        <Label htmlFor="chore-resume-automatically">Resume automatically</Label>
                                        <p className="text-xs text-muted-foreground">Leave this off for an open-ended pause.</p>
                                    </div>
                                    <Switch
                                        id="chore-resume-automatically"
                                        checked={resumeAutomatically}
                                        onCheckedChange={setResumeAutomatically}
                                    />
                                </div>
                                {resumeAutomatically ? (
                                    <div>
                                        <Label htmlFor="chore-pause-resume-date">Resume on</Label>
                                        <Input
                                            id="chore-pause-resume-date"
                                            type="date"
                                            value={pauseResumeDate}
                                            min={pauseStartDate || undefined}
                                            onChange={(event) => setPauseResumeDate(event.target.value)}
                                        />
                                    </div>
                                ) : null}
                            </>
                        ) : null}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setPauseDialogOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handlePauseSave} disabled={isSaving}>
                            {pauseIntent === 'ended' ? 'Save end' : 'Save pause'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={resumeDialogOpen} onOpenChange={setResumeDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{scheduleStatus.kind === 'ended' ? `Restart ${title}` : `Resume ${title}`}</DialogTitle>
                        <DialogDescription>
                            Choose the first day this chore should be active again. By default, it resumes on the next scheduled occurrence.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="chore-resume-date">Resume on</Label>
                            <Input
                                id="chore-resume-date"
                                type="date"
                                value={resumeOnDate}
                                min={toDateInputValue(new Date())}
                                onChange={(event) => setResumeOnDate(event.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setResumeDialogOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button type="button" onClick={handleResumeSave} disabled={isSaving}>
                            {resumeLabel}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
