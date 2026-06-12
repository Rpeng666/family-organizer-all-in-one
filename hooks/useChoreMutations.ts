'use client';

import { useCallback } from 'react';
import { tx, id } from '@instantdb/react';
import { db } from '@/lib/db';
import { getNextChoreSortOrder } from '@family-organizer/shared-core';
import { buildHistoryEventTransactions } from '@/lib/history-events';
import { useToast } from '@/components/ui/use-toast';
import type { Chore, ChoreCompletion, FamilyMember, RoutineMarkerStatus } from './useChoresData';
import type { ChoreSchedulePatch } from '@/lib/chore-schedule';

interface MutationDeps {
    chores: Chore[];
    routineMarkerStatuses: RoutineMarkerStatus[];
    allChoreCompletions: ChoreCompletion[];
    familyMembers: FamilyMember[];
    choreAssignments: unknown[];
    selectedDate: Date;
    selectedDateKey: string;
    currentUserId?: string;
    isParentMode: boolean;
    onAddChoreSuccess?: () => void;
}

export function useChoreMutations({
    chores,
    routineMarkerStatuses,
    allChoreCompletions,
    familyMembers,
    choreAssignments,
    selectedDate,
    selectedDateKey,
    currentUserId,
    isParentMode,
    onAddChoreSuccess,
}: MutationDeps) {
    const { toast } = useToast();

    // ─── Add chore ───────────────────────────────────────────────────────────

    const addChore = useCallback(
        (choreData: Partial<Chore>) => {
            const choreId = id();
            const nowIso = new Date().toISOString();
            const transactions: ReturnType<typeof tx.chores[string]['update']>[] = [
                tx.chores[choreId].update({
                    title: choreData.title!,
                    createdAt: nowIso,
                    description: choreData.description ?? '',
                    startDate: new Date(choreData.startDate ?? Date.now()).toISOString(),
                    done: false,
                    rrule: choreData.rrule ?? null,
                    exdates: choreData.exdates ?? [],
                    pauseState: choreData.pauseState ?? null,
                    rotationType: choreData.rotationType ?? 'none',
                    sortOrder: choreData.sortOrder ?? getNextChoreSortOrder(chores as never),
                    weight: choreData.weight ?? null,
                    estimatedDurationSecs: choreData.estimatedDurationSecs ?? null,
                    isUpForGrabs: choreData.isUpForGrabs ?? false,
                    isJoint: choreData.isJoint ?? false,
                    rewardType: choreData.rewardType ?? null,
                    rewardAmount: choreData.rewardAmount ?? null,
                    rewardCurrency: choreData.rewardCurrency ?? null,
                    timeBucket: choreData.timeBucket ?? null,
                    timingMode: choreData.timingMode ?? null,
                    timingConfig: choreData.timingConfig ?? null,
                }),
            ];

            if (choreData.rotationType !== 'none' && !choreData.isUpForGrabs && choreData.assignments?.length) {
                choreData.assignments.forEach((assignment, index) => {
                    const assignmentId = id();
                    transactions.push(
                        tx.choreAssignments[assignmentId].update({ order: assignment.order ?? index }),
                        tx.chores[choreId].link({ assignments: assignmentId }),
                        tx.familyMembers[assignment.familyMember.id].link({ choreAssignments: assignmentId }),
                    );
                });
            }

            (choreData.assignees ?? []).forEach((assignee) => {
                if (!assignee?.id) return;
                transactions.push(
                    tx.chores[choreId].link({ assignees: assignee.id }),
                    tx.familyMembers[assignee.id].link({ assignedChores: choreId }),
                );
            });

            db.transact(transactions);
            onAddChoreSuccess?.();
        },
        [chores, onAddChoreSuccess],
    );

    // ─── Toggle done ─────────────────────────────────────────────────────────

    const toggleChoreDone = useCallback(
        async (choreId: string, familyMemberId: string, executorId?: string) => {
            const chore = chores.find((c) => c.id === choreId);
            if (!chore) {
                toast({ title: 'Error', description: 'Could not find the chore.', variant: 'destructive' });
                return;
            }

            const formattedDate = selectedDateKey;

            if (chore.isUpForGrabs) {
                const completionsOnDate = allChoreCompletions.filter(
                    (c) => (c.chore as unknown as {id:string}[])?.[0]?.id === choreId &&
                           c.dateDue === formattedDate && c.completed,
                );
                if (completionsOnDate.length > 0) {
                    const currentUserCompletion = completionsOnDate.find((c) => c.completedBy?.id === familyMemberId);
                    if (!currentUserCompletion) {
                        const completerId = completionsOnDate[0].completedBy?.id;
                        const completer = familyMembers.find((fm) => fm.id === completerId);
                        toast({
                            title: 'Chore Already Completed',
                            description: `${chore.title} was already completed by ${completer?.name ?? 'another member'}.`,
                        });
                        return;
                    }
                }
            }

            const existingCompletion = (chore.completions ?? []).find(
                (c) => c.completedBy?.id === familyMemberId && c.dateDue === formattedDate,
            );

            try {
                const nowIso = new Date().toISOString();
                if (existingCompletion) {
                    const historyEvent = buildHistoryEventTransactions({
                        tx, createId: id, occurredAt: nowIso, domain: 'chores',
                        actionType: existingCompletion.completed ? 'chore_marked_undone' : 'chore_marked_done',
                        summary: `${existingCompletion.completed ? 'Unmarked' : 'Completed'} "${chore.title}"`,
                        source: 'manual',
                        actorFamilyMemberId: executorId ?? familyMemberId,
                        affectedFamilyMemberIds: [familyMemberId],
                        choreId, scheduledForDate: formattedDate,
                        metadata: { choreTitle: chore.title, completed: !existingCompletion.completed, dateDue: formattedDate },
                    });
                    await db.transact([
                        tx.choreCompletions[existingCompletion.id].update({
                            completed: !existingCompletion.completed,
                            notDone: false,
                            dateCompleted: !existingCompletion.completed ? nowIso : null,
                        }),
                        ...historyEvent.transactions,
                    ]);
                    toast({ title: 'Chore Updated', description: `Marked as ${!existingCompletion.completed ? 'done' : 'not done'}.` });
                } else {
                    const newCompletionId = id();
                    const transactions: unknown[] = [
                        tx.choreCompletions[newCompletionId].update({
                            dateDue: formattedDate, dateCompleted: nowIso, completed: true, allowanceAwarded: false,
                        }),
                        tx.chores[choreId].link({ completions: newCompletionId }),
                        tx.familyMembers[familyMemberId].link({ completedChores: newCompletionId }),
                    ];
                    if (executorId) {
                        transactions.push(tx.familyMembers[executorId].link({ markedCompletions: newCompletionId }));
                    }
                    const historyEvent = buildHistoryEventTransactions({
                        tx, createId: id, occurredAt: nowIso, domain: 'chores', actionType: 'chore_marked_done',
                        summary: `Completed "${chore.title}"`, source: 'manual',
                        actorFamilyMemberId: executorId ?? familyMemberId,
                        affectedFamilyMemberIds: [familyMemberId],
                        choreId, scheduledForDate: formattedDate,
                        metadata: { choreTitle: chore.title, completed: true, dateDue: formattedDate },
                    });
                    await db.transact([...(transactions as never[]), ...historyEvent.transactions]);
                    toast({ title: 'Chore Completed', description: `${chore.title} marked as done.` });
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                toast({ title: 'Error', description: `Failed to update: ${msg}`, variant: 'destructive' });
            }
        },
        [chores, allChoreCompletions, familyMembers, selectedDateKey, toast],
    );

    // ─── Toggle not-done ─────────────────────────────────────────────────────

    const toggleChoreNotDone = useCallback(
        async (choreId: string, familyMemberId: string, executorId?: string) => {
            const chore = chores.find((c) => c.id === choreId);
            if (!chore) return;

            const formattedDate = selectedDateKey;
            const existingCompletion = (chore.completions ?? []).find(
                (c) => c.completedBy?.id === familyMemberId && c.dateDue === formattedDate,
            );

            try {
                const nowIso = new Date().toISOString();
                if (existingCompletion) {
                    const isCurrentlyNotDone = existingCompletion.notDone ?? false;
                    const historyEvent = buildHistoryEventTransactions({
                        tx, createId: id, occurredAt: nowIso, domain: 'chores',
                        actionType: isCurrentlyNotDone ? 'chore_marked_undone' : 'chore_marked_not_done',
                        summary: isCurrentlyNotDone ? `Reverted "${chore.title}"` : `Marked "${chore.title}" not done`,
                        source: 'manual',
                        actorFamilyMemberId: executorId ?? familyMemberId,
                        affectedFamilyMemberIds: [familyMemberId],
                        choreId, scheduledForDate: formattedDate,
                        metadata: { choreTitle: chore.title, notDone: !isCurrentlyNotDone, dateDue: formattedDate },
                    });
                    await db.transact([
                        tx.choreCompletions[existingCompletion.id].update({
                            completed: false, notDone: !isCurrentlyNotDone, dateCompleted: null,
                        }),
                        ...historyEvent.transactions,
                    ]);
                    toast({ title: isCurrentlyNotDone ? 'Reverted to Pending' : 'Marked Not Done' });
                } else {
                    const newCompletionId = id();
                    const transactions: unknown[] = [
                        tx.choreCompletions[newCompletionId].update({
                            dateDue: formattedDate, dateCompleted: null, completed: false,
                            notDone: true, allowanceAwarded: false,
                        }),
                        tx.chores[choreId].link({ completions: newCompletionId }),
                        tx.familyMembers[familyMemberId].link({ completedChores: newCompletionId }),
                    ];
                    if (executorId) {
                        transactions.push(tx.familyMembers[executorId].link({ markedCompletions: newCompletionId }));
                    }
                    const historyEvent = buildHistoryEventTransactions({
                        tx, createId: id, occurredAt: nowIso, domain: 'chores', actionType: 'chore_marked_not_done',
                        summary: `Marked "${chore.title}" not done`, source: 'manual',
                        actorFamilyMemberId: executorId ?? familyMemberId,
                        affectedFamilyMemberIds: [familyMemberId],
                        choreId, scheduledForDate: formattedDate,
                        metadata: { choreTitle: chore.title, notDone: true, dateDue: formattedDate },
                    });
                    await db.transact([...(transactions as never[]), ...historyEvent.transactions]);
                    toast({ title: 'Marked Not Done' });
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                toast({ title: 'Error', description: `Failed to update: ${msg}`, variant: 'destructive' });
            }
        },
        [chores, selectedDateKey, toast],
    );

    // ─── Update chore ─────────────────────────────────────────────────────────

    const updateChore = useCallback(
        async (choreId: string, updatedChoreData: Partial<Chore> & { assignees: FamilyMember[]; assignments?: Chore['assignments'] }) => {
            try {
                const existingChore = chores.find((c) => c.id === choreId);
                if (!existingChore) throw new Error('Chore not found');

                const transactions: unknown[] = [
                    tx.chores[choreId].update({
                        title: updatedChoreData.title,
                        description: updatedChoreData.description,
                        startDate: updatedChoreData.startDate,
                        rrule: updatedChoreData.rrule,
                        exdates: updatedChoreData.exdates ?? [],
                        pauseState: updatedChoreData.pauseState ?? null,
                        rotationType: updatedChoreData.rotationType,
                        sortOrder: updatedChoreData.sortOrder ?? existingChore.sortOrder ?? null,
                        weight: updatedChoreData.weight ?? null,
                        estimatedDurationSecs: updatedChoreData.estimatedDurationSecs ?? null,
                        isUpForGrabs: updatedChoreData.isUpForGrabs ?? false,
                        isJoint: updatedChoreData.isJoint ?? false,
                        rewardType: updatedChoreData.rewardType ?? null,
                        rewardAmount: updatedChoreData.rewardAmount ?? null,
                        rewardCurrency: updatedChoreData.rewardCurrency ?? null,
                        timeBucket: updatedChoreData.timeBucket ?? null,
                        timingMode: updatedChoreData.timingMode ?? null,
                        timingConfig: updatedChoreData.timingConfig ?? null,
                    }),
                ];

                const newAssigneeIds = new Set(updatedChoreData.assignees.map((a) => a.id));
                const oldAssigneeIds = new Set((existingChore.assignees ?? []).map((a) => a.id));

                const existingAssignmentsFilt = (choreAssignments as Array<{ id: string; chore: unknown; familyMember: unknown }>).filter((a) => {
                    if (!a.chore) return false;
                    const chore = Array.isArray(a.chore) ? (a.chore as {id:string}[])[0] : (a.chore as {id:string});
                    return chore?.id === choreId;
                });

                existingChore.assignees?.forEach((assignee) => {
                    if (!newAssigneeIds.has(assignee.id)) {
                        transactions.push(
                            tx.chores[choreId].unlink({ assignees: assignee.id }),
                            tx.familyMembers[assignee.id].unlink({ assignedChores: choreId }),
                        );
                    }
                });

                updatedChoreData.assignees.forEach((assignee) => {
                    if (!oldAssigneeIds.has(assignee.id)) {
                        transactions.push(
                            tx.chores[choreId].link({ assignees: assignee.id }),
                            tx.familyMembers[assignee.id].link({ assignedChores: choreId }),
                        );
                    }
                });

                const isRotatingNow = updatedChoreData.rotationType !== 'none' && !updatedChoreData.isUpForGrabs;
                const newRotationMemberIds = (updatedChoreData.assignments ?? []).map((a) => a.familyMember.id);

                existingAssignmentsFilt.forEach((assignment) => {
                    const memberId = Array.isArray(assignment.familyMember)
                        ? (assignment.familyMember as {id:string}[])[0]?.id
                        : (assignment.familyMember as {id:string})?.id;
                    if (!isRotatingNow || !newRotationMemberIds.includes(memberId)) {
                        if (assignment.id) {
                            transactions.push(tx.choreAssignments[assignment.id].delete());
                            if (memberId) transactions.push(tx.familyMembers[memberId].unlink({ choreAssignments: assignment.id }));
                        }
                    }
                });

                if (isRotatingNow && updatedChoreData.assignments) {
                    updatedChoreData.assignments.forEach((assignment, index) => {
                        const existing = existingAssignmentsFilt.find((a) => {
                            const mId = Array.isArray(a.familyMember)
                                ? (a.familyMember as {id:string}[])[0]?.id
                                : (a.familyMember as {id:string})?.id;
                            return mId === assignment.familyMember.id;
                        });
                        if (existing) {
                            if ((existing as {order?:number}).order !== index) {
                                transactions.push(tx.choreAssignments[existing.id].update({ order: index }));
                            }
                        } else {
                            const newId = id();
                            transactions.push(
                                tx.choreAssignments[newId].update({ order: index }),
                                tx.chores[choreId].link({ assignments: newId }),
                                tx.familyMembers[assignment.familyMember.id].link({ choreAssignments: newId }),
                            );
                        }
                    });
                }

                await db.transact(transactions as never[]);
                toast({ title: 'Chore updated' });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                toast({ title: 'Error', description: msg, variant: 'destructive' });
                throw err;
            }
        },
        [chores, choreAssignments, toast],
    );

    // ─── Update schedule ──────────────────────────────────────────────────────

    const updateChoreSchedule = useCallback(
        async (choreId: string, patch: ChoreSchedulePatch) => {
            try {
                await db.transact([
                    tx.chores[choreId].update({
                        rrule: patch.rrule ?? null,
                        exdates: patch.exdates ?? [],
                        pauseState: patch.pauseState ?? null,
                    }),
                ]);
                toast({ title: 'Schedule updated' });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                toast({ title: 'Error', description: msg, variant: 'destructive' });
                throw err;
            }
        },
        [toast],
    );

    // ─── Delete chore ─────────────────────────────────────────────────────────

    const deleteChore = useCallback(
        (choreId: string) => {
            db.transact([tx.chores[choreId].delete()])
                .then(() => toast({ title: 'Chore deleted' }))
                .catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    toast({ title: 'Error', description: msg, variant: 'destructive' });
                });
        },
        [toast],
    );

    // ─── Sequence reorder ─────────────────────────────────────────────────────

    const handleSequenceReorder = useCallback(
        async (updates: Record<string, number>) => {
            try {
                await db.transact(
                    Object.entries(updates).map(([choreId, sortOrder]) => tx.chores[choreId].update({ sortOrder })),
                );
            } catch (err) {
                console.error('Failed to reorder chores:', err);
            }
        },
        [],
    );

    // ─── Routine markers ──────────────────────────────────────────────────────

    const makeRoutineMarkerMutation = useCallback(
        (fields: (timestamp: string, userId: string | null) => Record<string, unknown>) =>
            async (markerKey: string) => {
                if (!isParentMode) {
                    toast({ title: 'Access Denied', description: 'Only parents can update routine markers.', variant: 'destructive' });
                    return;
                }
                const recordKey = `${selectedDateKey}:${markerKey}`;
                const existing = routineMarkerStatuses.find((s) => String(s.key ?? '') === recordKey);
                const timestamp = new Date().toISOString();
                const userId = currentUserId ?? null;
                try {
                    if (existing?.id) {
                        await db.transact([tx.routineMarkerStatuses[existing.id].update(fields(timestamp, userId))]);
                    } else {
                        const statusId = id();
                        await db.transact([
                            tx.routineMarkerStatuses[statusId].update({
                                key: recordKey, markerKey, date: selectedDateKey,
                                ...fields(timestamp, userId),
                            }),
                        ]);
                    }
                    toast({ title: 'Marker updated' });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    toast({ title: 'Error', description: msg, variant: 'destructive' });
                }
            },
        [isParentMode, selectedDateKey, routineMarkerStatuses, currentUserId, toast],
    );

    const markRoutineMarkerHappened = makeRoutineMarkerMutation((t, u) => ({
        startedAt: t, completedAt: t, startedById: u, completedById: u,
    }));
    const markRoutineMarkerStarted = makeRoutineMarkerMutation((t, u) => ({ startedAt: t, startedById: u }));
    const markRoutineMarkerFinished = makeRoutineMarkerMutation((t, u) => ({ completedAt: t, completedById: u }));

    const clearRoutineMarkerStatus = useCallback(
        async (markerKey: string) => {
            if (!isParentMode) return;
            const recordKey = `${selectedDateKey}:${markerKey}`;
            const existing = routineMarkerStatuses.find((s) => String(s.key ?? '') === recordKey);
            if (!existing?.id) return;
            try {
                await db.transact([
                    tx.routineMarkerStatuses[existing.id].update({
                        startedAt: null, completedAt: null, startedById: null, completedById: null,
                    }),
                ]);
                toast({ title: 'Marker cleared' });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                toast({ title: 'Error', description: msg, variant: 'destructive' });
            }
        },
        [isParentMode, selectedDateKey, routineMarkerStatuses, toast],
    );

    // ─── View settings ────────────────────────────────────────────────────────

    const toggleViewSetting = useCallback(
        (memberId: string, setting: 'viewShowChoreDescriptions' | 'viewShowTaskDetails', value: boolean) => {
            db.transact(tx.familyMembers[memberId].update({ [setting]: value }));
        },
        [],
    );

    return {
        addChore,
        toggleChoreDone,
        toggleChoreNotDone,
        updateChore,
        updateChoreSchedule,
        deleteChore,
        handleSequenceReorder,
        markRoutineMarkerHappened,
        markRoutineMarkerStarted,
        markRoutineMarkerFinished,
        clearRoutineMarkerStatus,
        toggleViewSetting,
    };
}
