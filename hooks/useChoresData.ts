'use client';

import { useMemo } from 'react';
import { db } from '@/lib/db';
import {
    HOUSEHOLD_SCHEDULE_SETTINGS_NAME,
    COUNTDOWN_SETTINGS_NAME,
    parseSharedScheduleSettings,
    parseCountdownSettings,
    type SharedScheduleSettings,
} from '@family-organizer/shared-core';
import { computeAllApplicableCurrencyCodes, type UnitDefinition, type Envelope } from '@/lib/currency-utils';
import type { ChorePauseState } from '@/lib/chore-schedule';

// ─── Shared entity shapes ────────────────────────────────────────────────────

export interface ChoreCompletion {
    id: string;
    completed: boolean;
    dateDue: string;
    notDone?: boolean;
    chore?: { id: string };
    completedBy?: { id: string };
    markedBy?: { id: string };
}

export interface RoutineMarkerStatus {
    id: string;
    key: string;
    markerKey: string;
    date: string;
    startedAt?: string | null;
    completedAt?: string | null;
    startedById?: string | null;
    completedById?: string | null;
}

export interface FamilyMember {
    id: string;
    name: string;
    email?: string;
    photoUrl?: string;
    photoUrls?: { '64'?: string; '320'?: string; '1200'?: string };
    allowanceEnvelopes?: Envelope[];
    lastDisplayCurrency?: string | null;
    allowanceAmount?: number | null;
    allowanceCurrency?: string | null;
    allowanceRrule?: string | null;
    allowanceStartDate?: string | null;
    allowanceConfig?: unknown;
    allowancePayoutDelayDays?: number | null;
    role?: string | null;
    viewShowChoreDescriptions?: boolean;
    viewShowTaskDetails?: boolean;
    color?: string | null;
    order?: number | null;
}

export interface Chore {
    id: string;
    title: string;
    description?: string;
    createdAt?: string;
    startDate: string;
    done: boolean;
    rrule?: string;
    exdates?: string[] | null;
    pauseState?: ChorePauseState | null;
    assignees: FamilyMember[];
    rotationType: 'none' | 'daily' | 'weekly' | 'monthly';
    weight?: number;
    assignments?: { id: string; order: number; familyMember: FamilyMember }[];
    completions?: ChoreCompletion[];
    estimatedDurationSecs?: number | null;
    isUpForGrabs?: boolean;
    isJoint?: boolean;
    rewardType?: 'fixed' | 'weight';
    rewardAmount?: number;
    rewardCurrency?: string;
    sortOrder?: number | null;
    timeBucket?: string | null;
    timingMode?: string | null;
    timingConfig?: unknown;
    taskSeries?: { id: string; name: string; startDate?: string; tasks?: unknown[] }[];
}

// ─── Query ───────────────────────────────────────────────────────────────────

export function useChoresData() {
    const { isLoading, error, data } = db.useQuery({
        familyMembers: {
            $: { order: { order: 'asc' } },
            assignedChores: { completions: {} },
            allowanceEnvelopes: {},
            choreAssignments: {},
        },
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            completions: { completedBy: {} },
            taskSeries: {
                tasks: {
                    parentTask: {},
                    attachments: {},
                    updates: {
                        attachments: {},
                        actor: {},
                        affectedPerson: {},
                        responseFieldValues: { field: {} },
                        gradeType: {},
                        replyTo: {},
                        replies: {
                            actor: {},
                            affectedPerson: {},
                            attachments: {},
                            gradeType: {},
                        },
                    },
                    responseFields: {},
                },
                familyMember: {},
            },
        },
        gradeTypes: { $: { order: { createdAt: 'asc' } } },
        unitDefinitions: {},
        allowanceEnvelopes: {},
        choreAssignments: { chore: {} },
        choreCompletions: {
            chore: {},
            completedBy: {},
            markedBy: {},
        },
        routineMarkerStatuses: {},
        settings: {
            $: {
                where: {
                    or: [
                        { name: HOUSEHOLD_SCHEDULE_SETTINGS_NAME },
                        { name: COUNTDOWN_SETTINGS_NAME },
                    ],
                },
            },
        },
    });

    // ─── Derived ─────────────────────────────────────────────────────────────

    const familyMembers = useMemo(
        (): FamilyMember[] => (data?.familyMembers as unknown as FamilyMember[]) ?? [],
        [data?.familyMembers],
    );

    const chores = useMemo(
        (): Chore[] => (data?.chores as unknown as Chore[]) ?? [],
        [data?.chores],
    );

    const unitDefinitions = useMemo(
        (): UnitDefinition[] => (data?.unitDefinitions as unknown as UnitDefinition[]) ?? [],
        [data?.unitDefinitions],
    );

    const gradeTypes = useMemo(
        () => (data?.gradeTypes as unknown[]) ?? [],
        [data?.gradeTypes],
    );

    const allEnvelopes = useMemo(
        (): Envelope[] => (data?.allowanceEnvelopes as unknown as Envelope[]) ?? [],
        [data?.allowanceEnvelopes],
    );

    const allChoreCompletions = useMemo(
        (): ChoreCompletion[] => (data?.choreCompletions as unknown as ChoreCompletion[]) ?? [],
        [data?.choreCompletions],
    );

    const routineMarkerStatuses = useMemo(
        (): RoutineMarkerStatus[] => (data?.routineMarkerStatuses as unknown as RoutineMarkerStatus[]) ?? [],
        [data?.routineMarkerStatuses],
    );

    const choreAssignments = useMemo(
        () => (data?.choreAssignments as unknown[]) ?? [],
        [data?.choreAssignments],
    );

    const scheduleSettings = useMemo((): SharedScheduleSettings => {
        const row = (data?.settings as unknown as Array<{ name: string; value: unknown }>)
            ?.find((s) => s.name === HOUSEHOLD_SCHEDULE_SETTINGS_NAME);
        return parseSharedScheduleSettings(row?.value ?? null);
    }, [data?.settings]);

    const countdownSettings = useMemo(() => {
        const row = (data?.settings as unknown as Array<{ name: string; value: unknown }>)
            ?.find((s) => s.name === COUNTDOWN_SETTINGS_NAME);
        return parseCountdownSettings(row?.value ?? null);
    }, [data?.settings]);

    // ─── Balance map ─────────────────────────────────────────────────────────

    const membersBalances = useMemo(() => {
        const balances: Record<string, Record<string, number>> = {};
        familyMembers.forEach((member) => {
            balances[member.id] = {};
            (member.allowanceEnvelopes ?? []).forEach((envelope) => {
                if (!envelope.balances) return;
                Object.entries(envelope.balances).forEach(([currency, amount]) => {
                    const code = currency.toUpperCase();
                    balances[member.id][code] = (balances[member.id][code] ?? 0) + (amount as number);
                });
            });
        });
        return balances;
    }, [familyMembers]);

    // ─── Currency options ─────────────────────────────────────────────────────

    const allMonetaryCurrenciesInUse = useMemo(
        () => computeAllApplicableCurrencyCodes(allEnvelopes, unitDefinitions),
        [allEnvelopes, unitDefinitions],
    );

    const currencyOptions = useMemo(() => {
        const unitDefMap = new Map(unitDefinitions.map((def) => [def.code.toUpperCase(), def]));
        const codes = new Set<string>();
        unitDefinitions.forEach((def) => codes.add(def.code.toUpperCase()));
        allMonetaryCurrenciesInUse.forEach((code) => codes.add(code.toUpperCase()));
        ['USD'].forEach((c) => {
            const def = unitDefMap.get(c);
            const isMonetary = def?.isMonetary ?? c.length === 3;
            if (isMonetary || codes.has(c)) codes.add(c);
        });
        return [
            ...Array.from(codes)
                .sort()
                .map((code) => {
                    const def = unitDefMap.get(code);
                    let label = code;
                    if (def?.symbol && def?.name) label = `${code} (${def.symbol} - ${def.name})`;
                    else if (def?.symbol) label = `${code} (${def.symbol})`;
                    else if (def?.name) label = `${code} (${def.name})`;
                    return { value: code, label };
                }),
            { value: '__DEFINE_NEW__', label: 'Define New Unit...' },
        ];
    }, [unitDefinitions, allMonetaryCurrenciesInUse]);

    return {
        isLoading,
        error,
        // Entities
        familyMembers,
        chores,
        unitDefinitions,
        gradeTypes,
        allEnvelopes,
        allChoreCompletions,
        routineMarkerStatuses,
        choreAssignments,
        // Settings
        scheduleSettings,
        countdownSettings,
        // Derived
        membersBalances,
        currencyOptions,
    };
}
