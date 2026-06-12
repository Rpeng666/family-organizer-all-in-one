import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import ChoreRecurrenceFields from './ChoreRecurrenceFields';
import ChoreScheduleActions from './ChoreScheduleActions';
import ChoreAssignmentPreviewSection from './ChoreAssignmentPreviewSection';
import { ChoreTimingConfigurator } from '@/components/chores/ChoreTimingConfigurator';
import { ChoreRotationOrderEditor } from '@/components/chores/ChoreRotationOrderEditor';
import { ChoreRewardFields } from '@/components/chores/ChoreRewardFields';
import { toUTCDate, getAssignedMembersForChoreOnDate } from '@/lib/chore-utils';
import type { ChorePauseState, ChoreSchedulePatch } from '@/lib/chore-schedule';
import { getChorePauseStatus } from '@/lib/chore-schedule';
import { getDefaultRecurrenceUiState, normalizeRrule, parseRecurrenceUiStateFromRrule, serializeRecurrenceToRrule, type RecurrenceUiState } from '@/lib/recurrence';
import {
    getRoutineMarkerOptions,
    getTimeBucketOptions,
    wouldCreateChoreTimingCycle,
    computeCountdownTimelines,
    getChoreTimingMode,
    parseCountdownSettings,
    getFamilyDayDateUTC,
    type SharedScheduleSettings,
    type CountdownSettings,
    type CountdownChoreInput,
} from '@family-organizer/shared-core';
import { AlertTriangle } from 'lucide-react';
// Interface for the data structure passed to onSave
// Ensure it includes the new 'weight' field
interface ChoreSaveData {
    title: string;
    assignees: { id: string }[];
    description?: string;
    startDate: string; // ISO String
    rrule: string | null;
    exdates?: string[] | null;
    pauseState?: ChorePauseState | null;
    rotationType: 'none' | 'daily' | 'weekly' | 'monthly';
    assignments: { order: number; familyMember: any }[] | null; // Adjust 'any' if FamilyMember type is available here
    weight?: number | null;
    estimatedDurationSecs?: number | null;
    isUpForGrabs?: boolean | null;
    isJoint?: boolean | null;
    rewardType?: 'fixed' | 'weight' | null;
    rewardAmount?: number | null;
    rewardCurrency?: string | null;
    sortOrder?: number | null;
    timeBucket?: string | null;
    timingMode?: string | null;
    timingConfig?: any | null;
}

// +++ Define props interface +++
interface DetailedChoreFormProps {
    familyMembers: any[];
    onSave: (data: Partial<ChoreSaveData>) => void;
    onScheduleAction?: (patch: ChoreSchedulePatch) => Promise<void> | void;
    initialChore?: any | null;
    initialDate: Date;
    db: any; // InstantDB instance passed down
    unitDefinitions: any[]; // Pass definitions
    currencyOptions: { value: string; label: string }[]; // Pass computed options
    availableChoreAnchors?: any[];
    scheduleSettings?: SharedScheduleSettings | null;
    /** Optional: pass these to enable save-time timeline overflow warnings. */
    routineMarkerStatuses?: any[];
    countdownSettings?: CountdownSettings | null;
}

function DetailedChoreForm({
    // New signature using props interface
    familyMembers,
    onSave,
    onScheduleAction,
    initialChore = null,
    initialDate,
    db,
    unitDefinitions,
    currencyOptions,
    availableChoreAnchors = [],
    scheduleSettings = null,
    routineMarkerStatuses = [],
    countdownSettings: countdownSettingsProp = null,
}: DetailedChoreFormProps) {
    const [title, setTitle] = useState('');
    const [assignees, setAssignees] = useState<string[]>([]);
    const [description, setDescription] = useState('');
    const [startDate, setStartDate] = useState<Date>(toUTCDate(initialDate || new Date()));
    const [rotationType, setRotationType] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
    const [rotationOrder, setRotationOrder] = useState<string[]>([]);
    const [useRotation, setUseRotation] = useState(false);
    const [weight, setWeight] = useState<string>('0'); // Default to '0'
    const [durationHours, setDurationHours] = useState<string>('');
    const [durationMinutes, setDurationMinutes] = useState<string>('');
    const [durationSeconds, setDurationSeconds] = useState<string>('');
    const [isUpForGrabs, setIsUpForGrabs] = useState(false);
    const [isJoint, setIsJoint] = useState(false);
    const [rewardType, setRewardType] = useState<'fixed' | 'weight'>('weight'); // Default to weight-based
    const [rewardAmount, setRewardAmount] = useState<string>('');
    const [rewardCurrency, setRewardCurrency] = useState<string>('');
    const [timeBucket, setTimeBucket] = useState<string>('');
    const [timingMode, setTimingMode] = useState<
        'anytime' | 'named_window' | 'before_time' | 'after_time' | 'between_times' | 'before_marker' | 'after_marker' | 'before_chore' | 'after_chore'
    >('anytime');
    const [triggerTime, setTriggerTime] = useState<string>('');
    const [windowStartTime, setWindowStartTime] = useState<string>('');
    const [windowEndTime, setWindowEndTime] = useState<string>('');
    const [anchorRoutineKey, setAnchorRoutineKey] = useState<string>('breakfast');
    const [anchorChoreId, setAnchorChoreId] = useState<string>('');
    const [anchorFallbackTime, setAnchorFallbackTime] = useState<string>('');
    const [timelineWarnings, setTimelineWarnings] = useState<string[]>([]);
    const [showWarningConfirm, setShowWarningConfirm] = useState(false);
    const [recurrenceUi, setRecurrenceUi] = useState<RecurrenceUiState>(() => ({
        ...getDefaultRecurrenceUiState(
            initialDate instanceof Date && !Number.isNaN(initialDate.getTime()) ? initialDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
        ),
        mode: 'daily',
    }));
    const timeBucketOptions = React.useMemo(() => getTimeBucketOptions(scheduleSettings), [scheduleSettings]);
    const routineMarkerOptions = React.useMemo(() => getRoutineMarkerOptions(scheduleSettings), [scheduleSettings]);
    const availableAnchorChores = availableChoreAnchors
        .filter((chore) => chore?.id && chore.id !== initialChore?.id)
        .sort((left, right) => String(left?.title || '').localeCompare(String(right?.title || ''), undefined, { sensitivity: 'base' }));

    useEffect(() => {
        if (initialChore) {
            const timingConfig = initialChore.timingConfig && typeof initialChore.timingConfig === 'object' ? initialChore.timingConfig : {};
            const anchorConfig = timingConfig?.anchor && typeof timingConfig.anchor === 'object' ? timingConfig.anchor : {};
            const rawTimingMode = initialChore.timingMode || timingConfig.mode || (initialChore.timeBucket || timingConfig.timeBucket ? 'day_part' : 'anytime');
            const initialTimingMode =
                rawTimingMode === 'day_part'
                    ? 'named_window'
                    : rawTimingMode === 'clock_window'
                    ? 'between_times'
                    : rawTimingMode === 'routine_anchor'
                    ? anchorConfig?.relation === 'after'
                        ? 'after_marker'
                        : 'before_marker'
                    : rawTimingMode === 'chore_anchor'
                    ? anchorConfig?.relation === 'after'
                        ? 'after_chore'
                        : 'before_chore'
                    : rawTimingMode;

            setTitle(initialChore.title);
            setDescription(initialChore.description || '');
            setStartDate(toUTCDate(new Date(initialChore.startDate)));
            setWeight(initialChore.weight !== null && initialChore.weight !== undefined ? String(initialChore.weight) : '');
            if (initialChore.estimatedDurationSecs != null && initialChore.estimatedDurationSecs > 0) {
                const totalSecs = initialChore.estimatedDurationSecs;
                const h = Math.floor(totalSecs / 3600);
                const m = Math.floor((totalSecs % 3600) / 60);
                const s = totalSecs % 60;
                setDurationHours(h > 0 ? String(h) : '');
                setDurationMinutes(m > 0 ? String(m) : '');
                setDurationSeconds(s > 0 ? String(s) : '');
            } else {
                setDurationHours('');
                setDurationMinutes('');
                setDurationSeconds('');
            }
            setIsUpForGrabs(initialChore.isUpForGrabs ?? false);
            setIsJoint(initialChore.isJoint ?? false);
            setRewardType(initialChore.rewardType === 'fixed' ? 'fixed' : 'weight');
            setRewardAmount(initialChore.rewardAmount !== null && initialChore.rewardAmount !== undefined ? String(initialChore.rewardAmount) : '');
            setRewardCurrency(initialChore.rewardCurrency || '');
            setTimeBucket(timingConfig?.namedWindowKey || initialChore.timeBucket || timingConfig.timeBucket || timeBucketOptions[0]?.value || '');
            setTimingMode(initialTimingMode as any);
            setTriggerTime(timingConfig?.time || '');
            setWindowStartTime(timingConfig?.window?.startTime || '');
            setWindowEndTime(timingConfig?.window?.endTime || '');
            setAnchorRoutineKey(anchorConfig?.routineKey || 'breakfast');
            setAnchorChoreId(anchorConfig?.sourceChoreId || '');
            setAnchorFallbackTime(anchorConfig?.fallbackTime || anchorConfig?.fallbackStartTime || anchorConfig?.fallbackEndTime || '');
            const startDateValue = toUTCDate(new Date(initialChore.startDate)).toISOString().slice(0, 10);
            setRecurrenceUi(
                initialChore.rrule
                    ? parseRecurrenceUiStateFromRrule(initialChore.rrule, startDateValue)
                    : { ...getDefaultRecurrenceUiState(startDateValue), mode: 'never' }
            );

            const isRotatingChore = initialChore.rotationType !== 'none';
            setUseRotation(isRotatingChore);
            setRotationType(initialChore.rotationType);

            if (isRotatingChore && initialChore.assignments) {
                const sortedAssignments = [...initialChore.assignments].sort((a: any, b: any) => {
                    const orderA = a.order ?? 0;
                    const orderB = b.order ?? 0;
                    return orderA - orderB;
                });

                const rotationIds = sortedAssignments
                    .map((assignment: any) => {
                        const fm = Array.isArray(assignment.familyMember) ? assignment.familyMember[0] : assignment.familyMember;
                        return fm?.id;
                    })
                    .filter((id: any) => !!id);

                setRotationOrder(rotationIds);
                const assigneeIds = initialChore.assignees.map((a: any) => a.id);
                setAssignees(assigneeIds);
            } else if (!isRotatingChore && initialChore.assignees) {
                const assigneeIds = initialChore.assignees.map((a: any) => a.id);
                setAssignees(assigneeIds);
                setRotationOrder([]);
            } else {
                setAssignees([]);
                setRotationOrder([]);
            }
        } else {
            setTitle('');
            setDescription('');
            setStartDate(toUTCDate(initialDate || new Date()));
            setRecurrenceUi({
                ...getDefaultRecurrenceUiState(toUTCDate(initialDate || new Date()).toISOString().slice(0, 10)),
                mode: 'daily',
            });
            setWeight('0');
            setDurationHours('');
            setDurationMinutes('');
            setDurationSeconds('');
            setIsUpForGrabs(false);
            setIsJoint(false);
            setRewardType('weight');
            setRewardAmount('');
            setRewardCurrency('');
            setTimeBucket(timeBucketOptions[0]?.value || '');
            setTimingMode('anytime');
            setTriggerTime('');
            setWindowStartTime('');
            setWindowEndTime('');
            setAnchorRoutineKey('breakfast');
            setAnchorChoreId('');
            setAnchorFallbackTime('');
            setAssignees([]);
            setUseRotation(false);
            setRotationType('none');
            setRotationOrder([]);
        }
    }, [initialChore, initialDate, timeBucketOptions]);

    useEffect(() => {
        // +++ Condition added: Only apply rotation logic if NOT Up for Grabs +++
        if (useRotation && assignees.length > 0 && !isUpForGrabs) {
            // When rotation is turned on, initialize rotation order from current assignees
            // only if rotationOrder is empty or doesn't match assignees
            if (rotationOrder.length !== assignees.length || !assignees.every((id) => rotationOrder.includes(id))) {
                setRotationOrder(assignees);
            }
            // Set a default rotation type if none is set
            if (rotationType === 'none') {
                setRotationType('daily');
            }
        } else if (!useRotation || isUpForGrabs) {
            // +++ Reset if rotation toggled off OR if marked Up for Grabs +++
            // When rotation is turned off, reset rotation type and order
            setRotationType('none');
            setRotationOrder([]);
        }
        // We're not setting rotationOrder to an empty array if assignees is empty
    }, [assignees, useRotation, isUpForGrabs]); // +++ Added isUpForGrabs dependency +++

    const handleAssigneeToggle = (memberId: string) => {
        const currentlySelected = assignees.includes(memberId);
        const newAssignees = currentlySelected ? assignees.filter((id) => id !== memberId) : [...assignees, memberId];

        setAssignees(newAssignees);

        // If using rotation, update rotation order accordingly
        // +++ Only update rotation if NOT Up for Grabs +++
        if (useRotation && !isUpForGrabs) {
            setRotationOrder(newAssignees);
        }
    };

    const moveAssigneeUp = (index: number) => {
        if (index === 0) return;
        setRotationOrder((prev) => {
            const newOrder = [...prev];
            [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
            return newOrder;
        });
    };

    const moveAssigneeDown = (index: number) => {
        if (index === rotationOrder.length - 1) return;
        setRotationOrder((prev) => {
            const newOrder = [...prev];
            [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
            return newOrder;
        });
    };

    /** Check if saving this chore would cause timeline overflow warnings. */
    const checkTimelineOverflow = (): string[] => {
        if (!scheduleSettings || !availableChoreAnchors || availableChoreAnchors.length === 0) return [];
        if (timingMode === 'anytime') return [];

        try {
            const effectiveSettings = scheduleSettings;
            const cdSettings = countdownSettingsProp ?? parseCountdownSettings(null);
            const today = getFamilyDayDateUTC(new Date(), effectiveSettings);
            const todayKey = today.toISOString().slice(0, 10);

            // Build the synthetic chore from form state
            const durH = parseInt(durationHours, 10) || 0;
            const durM = parseInt(durationMinutes, 10) || 0;
            const durS = parseInt(durationSeconds, 10) || 0;
            const totalDurSecs = durH * 3600 + durM * 60 + durS;
            const parsedWeight = parseFloat(weight) || 0;

            // Build timing config from form state
            let formTimingConfig: any = { mode: timingMode };
            if (timingMode === 'before_time' || timingMode === 'after_time') {
                formTimingConfig.time = triggerTime;
            } else if (timingMode === 'between_times') {
                formTimingConfig.startTime = windowStartTime;
                formTimingConfig.endTime = windowEndTime;
            } else if (timingMode === 'before_marker' || timingMode === 'after_marker') {
                formTimingConfig.anchor = { relation: timingMode === 'before_marker' ? 'before' : 'after', routineKey: anchorRoutineKey };
            } else if (timingMode === 'before_chore' || timingMode === 'after_chore') {
                formTimingConfig.anchor = { relation: timingMode === 'before_chore' ? 'before' : 'after', sourceChoreId: anchorChoreId, fallbackTime: anchorFallbackTime };
            } else if (timingMode === 'named_window') {
                formTimingConfig.timeBucket = timeBucket;
            }

            const syntheticId = initialChore?.id || '__new_chore__';
            const syntheticChoreInput: CountdownChoreInput = {
                id: syntheticId,
                title: title || 'New Chore',
                estimatedDurationSecs: totalDurSecs > 0 ? totalDurSecs : null,
                weight: parsedWeight > 0 ? parsedWeight : null,
                sortOrder: initialChore?.sortOrder ?? null,
                isJoint: isJoint,
                assigneeIds: assignees,
                timingMode,
                timingConfig: formTimingConfig,
                timeBucket: timingMode === 'named_window' ? timeBucket : null,
                completedAt: null,
                memberCompletions: {},
            };

            // Build existing chore inputs (excluding the one being edited)
            const existingInputs: CountdownChoreInput[] = availableChoreAnchors
                .filter((c: any) => {
                    if (c.id === syntheticId) return false;
                    const mode = getChoreTimingMode(c);
                    if (mode === 'anytime') return false;
                    const assigned = getAssignedMembersForChoreOnDate(c, today);
                    return assigned.length > 0;
                })
                .map((c: any) => {
                    const assigned = getAssignedMembersForChoreOnDate(c, today);
                    const memberCompletions: Record<string, string> = {};
                    for (const comp of c.completions || []) {
                        if (comp.completed && comp.dateDue === todayKey && comp.completedBy?.id) {
                            memberCompletions[comp.completedBy.id] = comp.dateCompleted || new Date().toISOString();
                        }
                    }
                    return {
                        id: c.id,
                        title: c.title,
                        estimatedDurationSecs: c.estimatedDurationSecs ?? null,
                        weight: c.weight ?? null,
                        sortOrder: c.sortOrder ?? null,
                        isJoint: c.isJoint ?? false,
                        assigneeIds: assigned.map((a: any) => a.id),
                        timingMode: c.timingMode || 'anytime',
                        timingConfig: c.timingConfig || null,
                        timeBucket: c.timeBucket || null,
                        completedAt: null,
                        memberCompletions,
                    };
                });

            // Skip if the synthetic chore has no duration
            if (!syntheticChoreInput.estimatedDurationSecs && !(syntheticChoreInput.weight && syntheticChoreInput.weight > 0)) {
                return [];
            }

            // Build synthetic raw chore for allChoresRaw context
            const syntheticRaw = {
                id: syntheticId,
                title: title || 'New Chore',
                timingMode,
                timingConfig: formTimingConfig,
                timeBucket: timingMode === 'named_window' ? timeBucket : null,
                estimatedDurationSecs: totalDurSecs > 0 ? totalDurSecs : null,
                weight: parsedWeight > 0 ? parsedWeight : null,
                completions: [],
                assignees: assignees.map(id => ({ id })),
                assignments: [],
            };

            const allChoresRaw = [
                ...availableChoreAnchors.filter((c: any) => c.id !== syntheticId),
                syntheticRaw,
            ];

            const result = computeCountdownTimelines({
                chores: [...existingInputs, syntheticChoreInput],
                routineMarkerStatuses: routineMarkerStatuses || [],
                allChoresRaw: allChoresRaw as any,
                countdownSettings: cdSettings,
                scheduleSettings: effectiveSettings,
                now: new Date(),
                date: today,
            });

            // Collect all warnings
            const warnings: string[] = [];
            for (const timeline of Object.values(result.timelines)) {
                const t = timeline as any;
                for (const w of t.warnings || []) {
                    const member = familyMembers.find((m: any) => m.id === t.personId);
                    warnings.push(`${member?.name || 'Someone'}: ${w.message}`);
                }
            }
            return warnings;
        } catch (err) {
            console.error('Timeline check error:', err);
            return [];
        }
    };

    const handleSave = () => {
        const startDateValue = startDate.toISOString().slice(0, 10);
        const finalRrule = normalizeRrule(serializeRecurrenceToRrule(recurrenceUi, startDateValue)) || null;
        if (recurrenceUi.mode !== 'never' && !finalRrule) {
            alert('Please configure a valid repeat pattern before saving.');
            return;
        }
        if (recurrenceUi.repeatEndMode === 'until' && recurrenceUi.mode !== 'never' && !recurrenceUi.repeatEndUntil) {
            alert('Choose an end date for the repeat pattern, or switch it back to repeat forever.');
            return;
        }

        // +++ NEW: Validate and parse reward fields based on type +++
        let finalWeight: number | null = null;
        let finalRewardAmount: number | null = null;
        let finalRewardCurrency: string | null = null;

        // Use weight from state if not Up for Grabs or if type is weight
        if (!isUpForGrabs || rewardType === 'weight') {
            finalWeight = parseFloat(weight);
            if (isNaN(finalWeight)) {
                alert('Invalid weight. Please enter a valid number.');
                return;
            }
        }

        // Use reward amount/currency only if Up for Grabs and type is fixed
        if (isUpForGrabs && rewardType === 'fixed') {
            finalRewardAmount = parseFloat(rewardAmount);
            finalRewardCurrency = rewardCurrency.trim().toUpperCase();
            if (isNaN(finalRewardAmount) || finalRewardAmount <= 0) {
                alert('Invalid fixed reward amount. Please enter a positive number.');
                return;
            }
            if (!finalRewardCurrency || finalRewardCurrency === '__DEFINE_NEW__') {
                alert('Please select a valid currency for the fixed reward.');
                return;
            }
            // If fixed, ensure weight is nullified in save data
            finalWeight = null;
        }

        if (timingMode === 'between_times' && windowStartTime && windowEndTime && windowStartTime >= windowEndTime) {
            alert('The end time must be later than the start time.');
            return;
        }

        if ((timingMode === 'before_time' || timingMode === 'after_time') && !triggerTime) {
            alert('Choose the time this chore should be relative to.');
            return;
        }

        if ((timingMode === 'before_marker' || timingMode === 'after_marker') && !anchorRoutineKey) {
            alert('Choose a routine marker for this chore timing.');
            return;
        }

        if (timingMode === 'between_times' && (!windowStartTime || !windowEndTime)) {
            alert('Choose both a start and end time for this chore.');
            return;
        }

        if (timingMode === 'named_window' && !timeBucket) {
            alert('Choose a named window for this chore.');
            return;
        }

        if (timingMode === 'before_chore' || timingMode === 'after_chore') {
            if (!anchorChoreId) {
                alert('Choose another chore to anchor this chore to.');
                return;
            }
            if (!anchorFallbackTime) {
                alert('Choose a fallback time for chore anchors.');
                return;
            }
            if (initialChore?.id && wouldCreateChoreTimingCycle(initialChore.id, anchorChoreId, availableChoreAnchors as any)) {
                alert('That chore anchor would create a cycle. Choose a different source chore.');
                return;
            }
        }

        let finalTimeBucket: string | null = null;
        let finalTimingMode: ChoreSaveData['timingMode'] = timingMode;
        let finalTimingConfig: ChoreSaveData['timingConfig'] = null;

        if (timingMode === 'named_window') {
            finalTimeBucket = timeBucket || null;
            finalTimingConfig = {
                mode: 'named_window',
                namedWindowKey: finalTimeBucket,
            };
        } else if (timingMode === 'before_time' || timingMode === 'after_time') {
            finalTimingConfig = {
                mode: timingMode,
                time: triggerTime || null,
            };
        } else if (timingMode === 'between_times') {
            finalTimingConfig = {
                mode: 'between_times',
                window: {
                    startTime: windowStartTime || null,
                    endTime: windowEndTime || null,
                },
            };
        } else if (timingMode === 'before_marker' || timingMode === 'after_marker') {
            finalTimingConfig = {
                mode: timingMode,
                anchor: {
                    sourceType: 'routine',
                    routineKey: anchorRoutineKey,
                    fallbackTime: anchorFallbackTime || null,
                },
            };
        } else if (timingMode === 'before_chore' || timingMode === 'after_chore') {
            finalTimingConfig = {
                mode: timingMode,
                anchor: {
                    sourceType: 'chore',
                    sourceChoreId: anchorChoreId,
                    fallbackTime: anchorFallbackTime || null,
                },
            };
        } else {
            finalTimingMode = 'anytime';
            finalTimingConfig = {
                mode: 'anytime',
            };
        }

        const saveData: ChoreSaveData = {
            title,
            assignees: assignees.map((id) => ({ id })),
            description,
            startDate: startDate.toISOString(),
            rrule: finalRrule,
            exdates: initialChore?.exdates ?? [],
            pauseState: initialChore?.pauseState ?? null,
            // +++ Adjust rotation/assignment based on isUpForGrabs +++
            rotationType: useRotation && !isUpForGrabs ? rotationType : 'none',
            assignments:
                useRotation && !isUpForGrabs && rotationOrder.length > 0
                    ? rotationOrder.map((memberId, index) => ({
                          order: index,
                          familyMember: familyMembers.find((member) => member.id === memberId),
                      }))
                    : null, // Send null if not using rotation or no one is in rotation order
            weight: finalWeight, // Use parsed weight or null
            estimatedDurationSecs: (() => {
                const h = parseInt(durationHours, 10) || 0;
                const m = parseInt(durationMinutes, 10) || 0;
                const s = parseInt(durationSeconds, 10) || 0;
                const total = h * 3600 + m * 60 + s;
                return total > 0 ? total : null;
            })(),
            isUpForGrabs: isUpForGrabs,
            isJoint: isJoint,
            rewardType: isUpForGrabs ? rewardType : null, // Only set rewardType if up for grabs
            rewardAmount: finalRewardAmount,
            rewardCurrency: finalRewardCurrency,
            sortOrder: initialChore?.sortOrder ?? null,
            timeBucket: finalTimeBucket,
            timingMode: finalTimingMode,
            timingConfig: finalTimingConfig,
        };

        // Ensure assignees are always included, even if rotation is off
        // +++ Adjust assignees based on isUpForGrabs +++
        if ((!useRotation || isUpForGrabs) && assignees.length > 0) {
            saveData.assignees = assignees.map((id) => ({ id }));
        } else if (useRotation && !isUpForGrabs && rotationOrder.length > 0) {
            // If using rotation, assignees should match rotation order members
            saveData.assignees = rotationOrder.map((id) => ({ id }));
        } else {
            // If no one is selected (or rotation is on but empty)
            saveData.assignees = [];
        }

        // Check for timeline overflow warnings before saving
        const warnings = checkTimelineOverflow();
        if (warnings.length > 0 && !showWarningConfirm) {
            setTimelineWarnings(warnings);
            setShowWarningConfirm(true);
            return;
        }

        // Reset warning state and save
        setTimelineWarnings([]);
        setShowWarningConfirm(false);
        onSave(saveData);
    };

    // Generate chore object for preview
    const choreForPreview = {
        id: initialChore?.id || 'temp-preview-id', // Use existing ID or temp
        title,
        description,
        startDate: startDate.toISOString(),
        rrule: normalizeRrule(serializeRecurrenceToRrule(recurrenceUi, startDate.toISOString().slice(0, 10))) || null,
        exdates: initialChore?.exdates || [],
        pauseState: initialChore?.pauseState || null,
        // +++ Adjust preview assignees/assignments based on isUpForGrabs +++
        rotationType: useRotation && !isUpForGrabs ? rotationType : 'none', // Set rotationType correctly for preview
        assignments:
            useRotation && !isUpForGrabs && rotationOrder.length > 0
                ? rotationOrder.map((memberId, index) => ({ order: index, familyMember: familyMembers.find((m) => m.id === memberId) }))
                : [], // assignments only exist if rotation is on AND NOT up for grabs
        assignees: isUpForGrabs
            ? assignees.length > 0
                ? assignees.map((id) => familyMembers.find((m) => m.id === id)).filter(Boolean)
                : [] // Direct assignees if up for grabs
            : useRotation && !isUpForGrabs // Assignees from rotation order if rotation is on and NOT up for grabs
            ? rotationOrder.length > 0
                ? rotationOrder.map((id) => familyMembers.find((m) => m.id === id)).filter(Boolean)
                : []
            : assignees.length > 0
            ? assignees.map((id) => familyMembers.find((m) => m.id === id)).filter(Boolean)
            : [], // Direct assignees if rotation is off
        isUpForGrabs: isUpForGrabs,
        isJoint: isJoint,
        rewardType: isUpForGrabs ? rewardType : null,
        rewardAmount: isUpForGrabs && rewardType === 'fixed' ? parseFloat(rewardAmount) || 0 : null,
        rewardCurrency: isUpForGrabs && rewardType === 'fixed' ? rewardCurrency : null,
        timeBucket: timingMode === 'named_window' ? timeBucket || null : null,
        timingMode: timingMode,
        timingConfig:
            timingMode === 'named_window'
                ? {
                      mode: 'named_window',
                      namedWindowKey: timeBucket || null,
                  }
                : timingMode === 'before_time' || timingMode === 'after_time'
                ? {
                      mode: timingMode,
                      time: triggerTime || null,
                  }
                : timingMode === 'between_times'
                ? {
                      mode: 'between_times',
                      window: {
                          startTime: windowStartTime || null,
                          endTime: windowEndTime || null,
                      },
                  }
                : timingMode === 'before_marker' || timingMode === 'after_marker'
                ? {
                      mode: timingMode,
                      anchor: {
                          sourceType: 'routine',
                          routineKey: anchorRoutineKey || null,
                          fallbackTime: anchorFallbackTime || null,
                      },
                  }
                : timingMode === 'before_chore' || timingMode === 'after_chore'
                ? {
                      mode: timingMode,
                      anchor: {
                          sourceType: 'chore',
                          sourceChoreId: anchorChoreId || null,
                          fallbackTime: anchorFallbackTime || null,
                      },
                  }
                : {
                      mode: 'anytime',
                  },
        weight: !isUpForGrabs || rewardType === 'weight' ? parseFloat(weight) || 0 : 0, // Use weight if not up for grabs OR if type is weight
        // Add any other fields needed by ChoreCalendarView, ensure they match expected types
        completions: initialChore?.completions || [], // Pass existing completions if editing
    };

    // Determine if preview should be shown
    const showPreview = !!(
        ((assignees.length > 0 || (useRotation && rotationOrder.length > 0)) && choreForPreview.rrule) // Only show if recurrence is set
    );
    const startDateValue = startDate instanceof Date && !Number.isNaN(startDate.getTime()) ? startDate.toISOString().slice(0, 10) : '';
    const activePauseStatus = initialChore ? getChorePauseStatus(initialChore) : { kind: 'none' as const, pauseState: null };
    const recurrenceEditingDisabled = activePauseStatus.kind === 'scheduled' || activePauseStatus.kind === 'paused' || activePauseStatus.kind === 'ended';
    const familyDayStartsAt = scheduleSettings?.dayBoundaryTime || '03:00';

    return (
        <div className="space-y-4 w-full max-w-md mx-auto">
            {/* Title */}
            <div className="space-y-2">
                <Label htmlFor="title">
                    Title <span className="text-destructive">*</span>
                </Label>
                <Input id="title" placeholder="Chore title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>

            {/* Description */}
            <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Chore description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            {/* Estimated Duration */}
            <div className="space-y-2">
                <Label>Estimated Duration</Label>
                <div className="flex items-center gap-1.5">
                    <Input
                        id="durationHours"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="0"
                        value={durationHours}
                        onChange={(e) => setDurationHours(e.target.value)}
                        className="w-16 text-center"
                    />
                    <span className="text-sm text-muted-foreground">h</span>
                    <Input
                        id="durationMinutes"
                        type="number"
                        min="0"
                        max="59"
                        step="1"
                        placeholder="0"
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(e.target.value)}
                        className="w-16 text-center"
                    />
                    <span className="text-sm text-muted-foreground">m</span>
                    <Input
                        id="durationSeconds"
                        type="number"
                        min="0"
                        max="59"
                        step="1"
                        placeholder="0"
                        value={durationSeconds}
                        onChange={(e) => setDurationSeconds(e.target.value)}
                        className="w-16 text-center"
                    />
                    <span className="text-sm text-muted-foreground">s</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    How long this chore typically takes. Used for start-time alerts and countdown timers.
                </p>
            </div>

            <ChoreRewardFields
                isUpForGrabs={isUpForGrabs}
                setIsUpForGrabs={setIsUpForGrabs}
                isJoint={isJoint}
                setIsJoint={setIsJoint}
                rewardType={rewardType}
                setRewardType={setRewardType}
                weight={weight}
                setWeight={setWeight}
                rewardAmount={rewardAmount}
                setRewardAmount={setRewardAmount}
                rewardCurrency={rewardCurrency}
                setRewardCurrency={setRewardCurrency}
                currencyOptions={currencyOptions}
                unitDefinitions={unitDefinitions}
                db={db}
            />

            {/* Start Date */}
            <div className="space-y-2">
                <Label htmlFor="startDate">
                    Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="startDate"
                    type="date"
                    value={startDateValue}
                    disabled={recurrenceEditingDisabled}
                    onChange={(e) => {
                        const dateValue = e.target.value;
                        if (dateValue) {
                            const [year, month, day] = dateValue.split('-').map(Number);
                            setStartDate(new Date(Date.UTC(year, month - 1, day)));
                        }
                    }}
                    required
                />
                {recurrenceEditingDisabled ? (
                    <p className="text-xs text-muted-foreground">Start date is locked while a pause or end is currently scheduled.</p>
                ) : null}
            </div>

            <ChoreRecurrenceFields
                startDateValue={startDateValue}
                recurrenceUi={recurrenceUi}
                setRecurrenceUi={setRecurrenceUi}
                disableEditing={recurrenceEditingDisabled}
            />

            {initialChore && onScheduleAction ? (
                <ChoreScheduleActions
                    chore={initialChore}
                    onApplySchedulePatch={async (patch) => {
                        await onScheduleAction(patch);
                    }}
                />
            ) : null}

            <ChoreTimingConfigurator
                timingMode={timingMode}
                setTimingMode={setTimingMode}
                timeBucket={timeBucket}
                setTimeBucket={setTimeBucket}
                timeBucketOptions={timeBucketOptions}
                triggerTime={triggerTime}
                setTriggerTime={setTriggerTime}
                windowStartTime={windowStartTime}
                setWindowStartTime={setWindowStartTime}
                windowEndTime={windowEndTime}
                setWindowEndTime={setWindowEndTime}
                anchorRoutineKey={anchorRoutineKey}
                setAnchorRoutineKey={setAnchorRoutineKey}
                routineMarkerOptions={routineMarkerOptions}
                anchorChoreId={anchorChoreId}
                setAnchorChoreId={setAnchorChoreId}
                availableAnchorChores={availableAnchorChores}
                anchorFallbackTime={anchorFallbackTime}
                setAnchorFallbackTime={setAnchorFallbackTime}
                familyDayStartsAt={familyDayStartsAt}
            />

            {/* Family Members Selection */}
            <div className="space-y-2">
                <Label>
                    Assignees <span className="text-destructive">*</span>
                </Label>
                <div className="flex flex-wrap gap-2">
                    {familyMembers.map((member) => {
                        const isSelected = assignees.includes(member.id);
                        return (
                            <button
                                type="button" // Prevent form submission
                                key={member.id}
                                onClick={() => handleAssigneeToggle(member.id)}
                                className={`px-2 py-1 rounded text-sm transition-colors ${
                                    isSelected ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                }`}
                            >
                                {member.name}
                            </button>
                        );
                    })}
                </div>
                {assignees.length === 0 && <p className="text-xs text-destructive">At least one assignee is required.</p>}
            </div>

            {/* +++ NEW: Joint Chore Checkbox (Condition: >1 assignee AND NOT Up for Grabs) +++ */}
            {assignees.length > 1 && !isUpForGrabs && (
                <div className="space-y-2 pt-2">
                    <div className="flex items-center space-x-2">
                        <Switch id="isJoint" checked={isJoint} onCheckedChange={setIsJoint} />
                        <Label htmlFor="isJoint">Joint Chore</Label>
                    </div>
                    <p className="text-xs text-muted-foreground pl-8">
                        Check this if the selected members work together to complete one single task (e.g., 'Clean Game Room'). Leave unchecked if they each do
                        their own individual task (e.g., 'Math Practice').
                    </p>
                </div>
            )}

            {/* Rotation Options */}
            <ChoreRotationOrderEditor
                assignees={assignees}
                isUpForGrabs={isUpForGrabs}
                useRotation={useRotation}
                setUseRotation={setUseRotation}
                rotationType={rotationType}
                setRotationType={setRotationType}
                rotationOrder={rotationOrder}
                onMoveUp={moveAssigneeUp}
                onMoveDown={moveAssigneeDown}
                familyMembers={familyMembers}
            />

            {/* Chore Calendar Preview - Only show if recurrence is set */}
            {showPreview && (
                <div className="pt-3 border-t">
                    <ChoreAssignmentPreviewSection
                        chore={choreForPreview}
                        anchorDate={startDate}
                        description="Preview how this chore will be assigned over time, including completion state for each occurrence."
                    />
                </div>
            )}

            {/* Timeline overflow warnings */}
            {showWarningConfirm && timelineWarnings.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Timeline warnings
                    </div>
                    <ul className="text-xs text-amber-800 space-y-1 pl-6 list-disc">
                        {timelineWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                    <div className="flex gap-2 pt-1">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => { setShowWarningConfirm(false); setTimelineWarnings([]); }}
                        >
                            Go back
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={handleSave}
                        >
                            Save anyway
                        </Button>
                    </div>
                </div>
            )}

            {/* Save Button */}
            {!showWarningConfirm && (
                <Button
                    onClick={handleSave}
                    className="w-full"
                    disabled={
                        !title ||
                        assignees.length === 0 ||
                        (rewardType === 'weight' && !weight) ||
                        (rewardType === 'fixed' && isUpForGrabs && (!rewardAmount || !rewardCurrency || rewardCurrency === '__DEFINE_NEW__'))
                    }
                >
                    {initialChore ? 'Update Chore' : 'Save Chore'}
                </Button>
            )}
        </div>
    );
}

export default DetailedChoreForm;
