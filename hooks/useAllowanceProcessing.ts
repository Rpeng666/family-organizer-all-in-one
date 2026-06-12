'use client';

import { useState, useEffect, useCallback } from 'react';
import { RRuleSet } from 'rrule';
import { startOfDay, isBefore, isEqual, addDays } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { db } from '@/lib/db';
import {
    formatBalances,
    type UnitDefinition,
    type Envelope,
    executeAllowanceTransaction,
} from '@/lib/currency-utils';
import {
    createRRuleWithStartDate,
    getAllowancePeriodForDate,
    calculatePeriodDetails,
    markCompletionsAwarded,
    toUTCDate,
    type Chore,
    type ChoreCompletion,
} from '@/lib/chore-utils';
import type {
    CalculatedPeriod,
    FamilyMemberWithAllowance,
    MemberAllowanceInfo,
    EditableAmounts,
    EditablePeriodAmounts,
} from '@/app/allowance-distribution/types';

interface QueryData {
    familyMembers: FamilyMemberWithAllowance[];
    choreCompletions: ChoreCompletion[];
    chores: Chore[];
    unitDefinitions: UnitDefinition[];
    allowanceEnvelopes: Envelope[];
}

export function useAllowanceProcessing() {
    const { toast } = useToast();

    const [isProcessing, setIsProcessing] = useState(true);
    const [processingError, setProcessingError] = useState<Error | null>(null);
    const [processedAllowances, setProcessedAllowances] = useState<MemberAllowanceInfo[]>([]);
    const [editableAmounts, setEditableAmounts] = useState<EditableAmounts>({});
    const [editablePeriodAmounts, setEditablePeriodAmounts] = useState<EditablePeriodAmounts>({});
    const [processingMemberId, setProcessingMemberId] = useState<string | null>(null);
    const [simulatedDate, setSimulatedDate] = useState<Date>(() => startOfDay(new Date()));

    const { isLoading: isDataLoading, error: dataError, data } = db.useQuery({
        familyMembers: {
            allowanceEnvelopes: {},
            completedChores: { $: { where: { allowanceAwarded: true } } },
        },
        choreCompletions: {
            $: { where: { allowanceAwarded: false } },
            chore: {},
            completedBy: {},
        },
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
        },
        unitDefinitions: {},
        allowanceEnvelopes: { familyMember: {} },
    });

    const typedData = data as unknown as QueryData | undefined;

    const processAllowanceData = useCallback(async (currentSimulatedDate: Date) => {
        if (isDataLoading || !typedData) return;

        setIsProcessing(true);
        setProcessingError(null);

        const { familyMembers, choreCompletions: allUnawarded, chores, allowanceEnvelopes } = typedData;
        const results: MemberAllowanceInfo[] = [];
        const newEditableAmounts: EditableAmounts = {};
        const newEditablePeriodAmounts: EditablePeriodAmounts = {};

        try {
            for (const member of familyMembers) {
                if (!member.allowanceRrule || !member.allowanceStartDate || !member.allowanceAmount || !member.allowanceCurrency) continue;

                const allowanceStartDate = toUTCDate(member.allowanceStartDate);
                const rule = createRRuleWithStartDate(member.allowanceRrule, allowanceStartDate);
                if (!rule) continue;

                const delayDays = member.allowancePayoutDelayDays ?? 0;
                const lastAwardedCompletion = member.completedChores?.[0];
                let searchStartDate: Date = allowanceStartDate;

                if (lastAwardedCompletion?.dateDue) {
                    const lastAwardedPeriod = getAllowancePeriodForDate(
                        toUTCDate(lastAwardedCompletion.dateDue),
                        member.allowanceRrule,
                        allowanceStartDate,
                    );
                    if (lastAwardedPeriod) searchStartDate = addDays(lastAwardedPeriod.endDate, 1);
                }

                const rruleSet = new RRuleSet();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                rruleSet.rrule(rule as any);
                rruleSet.rdate(allowanceStartDate);

                const futureBuffer = addDays(currentSimulatedDate, Math.max(7, delayDays + 1));
                const rawOccurrences = rruleSet.between(allowanceStartDate, toUTCDate(futureBuffer), true);

                let periodBoundaries = [...rawOccurrences]
                    .map((d) => toUTCDate(d).getTime())
                    .filter((v, i, arr) => arr.indexOf(v) === i)
                    .map((ts) => new Date(ts))
                    .sort((a, b) => a.getTime() - b.getTime());

                if (periodBoundaries.length === 0 || periodBoundaries[0].getTime() > allowanceStartDate.getTime()) {
                    periodBoundaries.unshift(allowanceStartDate);
                }

                const memberPendingPeriods: CalculatedPeriod[] = [];
                const memberUnawarded = allUnawarded.filter(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (c: any) => c.completedBy?.[0]?.id === member.id,
                );

                for (let i = 0; i < periodBoundaries.length; i++) {
                    let periodStartDate = periodBoundaries[i];
                    const nextBoundary = periodBoundaries[i + 1];
                    if (!nextBoundary) break;

                    const periodEndDate = addDays(nextBoundary, -1);
                    if (periodEndDate < searchStartDate) continue;
                    if (periodStartDate > periodEndDate) periodStartDate = periodEndDate;

                    const startMs = periodStartDate.getTime();
                    const endMs = addDays(periodEndDate, 1).getTime();
                    const completionsForPeriod = memberUnawarded.filter((comp) => {
                        if (!comp.dateDue) return false;
                        const ms = toUTCDate(comp.dateDue).getTime();
                        return ms >= startMs && ms < endMs;
                    });

                    const details = await calculatePeriodDetails(
                        db, member.id, periodStartDate, periodEndDate,
                        member.allowanceAmount, chores, completionsForPeriod,
                    );
                    if (!details) continue;

                    const payoutDueDate = addDays(periodEndDate, delayDays);
                    const isDue = isBefore(payoutDueDate, currentSimulatedDate) || isEqual(payoutDueDate, currentSimulatedDate);
                    const isInProgress =
                        (isBefore(periodStartDate, currentSimulatedDate) || isEqual(periodStartDate, currentSimulatedDate)) &&
                        isBefore(currentSimulatedDate, addDays(periodEndDate, 1));

                    if (isInProgress && !isDue) details.status = 'in-progress';
                    else if (isDue) details.status = 'pending';
                    else continue;

                    memberPendingPeriods.push(details);
                }

                if (memberPendingPeriods.length === 0) continue;

                const displayable = memberPendingPeriods.filter((p) => {
                    if (p.status === 'in-progress') return true;
                    return p.status === 'pending' && (p.completionsToMark.length > 0 || Object.keys(p.fixedRewardsEarned ?? {}).length > 0);
                });

                if (displayable.length === 0) continue;

                displayable.forEach((p) => {
                    if (p.status === 'pending' || p.status === 'in-progress') {
                        newEditablePeriodAmounts[p.id] = p.calculatedAmount.toFixed(2);
                    }
                });

                let totalCalculatedAmountDue = 0;
                const aggregatedFixed: Record<string, number> = {};
                displayable.filter((p) => p.status === 'pending').forEach((p) => {
                    totalCalculatedAmountDue += p.calculatedAmount;
                    for (const [cur, amt] of Object.entries(p.fixedRewardsEarned ?? {})) {
                        aggregatedFixed[cur] = (aggregatedFixed[cur] ?? 0) + amt;
                    }
                });

                const primaryCurrency = member.allowanceCurrency.toUpperCase();
                const totalFixedPrimary = aggregatedFixed[primaryCurrency] ?? 0;
                const totalFixedOther: Record<string, number> = {};
                for (const [cur, amt] of Object.entries(aggregatedFixed)) {
                    if (cur !== primaryCurrency) totalFixedOther[cur] = amt;
                }

                const finalTotalDue = totalCalculatedAmountDue + totalFixedPrimary;
                results.push({ member, pendingPeriods: displayable, totalDue: finalTotalDue, totalFixedRewardsInPrimaryCurrency: totalFixedPrimary, totalFixedRewardsInOtherCurrencies: totalFixedOther });
                newEditableAmounts[member.id] = finalTotalDue.toFixed(2);
            }

            setProcessedAllowances(results);
            setEditableAmounts(newEditableAmounts);
            setEditablePeriodAmounts(newEditablePeriodAmounts);
        } catch (e: unknown) {
            const err = e as Error;
            setProcessingError(err);
            toast({ title: 'Error Calculating Allowances', description: err.message, variant: 'destructive' });
        } finally {
            setIsProcessing(false);
        }
    }, [isDataLoading, typedData, toast]);

    useEffect(() => {
        if (!isDataLoading && typedData) processAllowanceData(simulatedDate);
        if (dataError) { setProcessingError(dataError as Error); setIsProcessing(false); }
    }, [isDataLoading, typedData, dataError, processAllowanceData, simulatedDate]);

    // ── Handlers ────────────────────────────────────────────────────────────────

    const handleAmountChange = (memberId: string, value: string) =>
        setEditableAmounts((prev) => ({ ...prev, [memberId]: value }));

    const handlePeriodAmountChange = (periodId: string, memberId: string, value: string) => {
        setEditablePeriodAmounts((prev) => ({ ...prev, [periodId]: value }));
        setEditableAmounts((prev) => {
            const info = processedAllowances.find((pa) => pa.member.id === memberId);
            if (!info) return prev;
            const newWeightTotal = info.pendingPeriods
                .filter((p) => p.status === 'pending')
                .reduce((sum, p) => {
                    const str = p.id === periodId ? value : editablePeriodAmounts[p.id];
                    const n = parseFloat(str ?? '0');
                    return sum + (isNaN(n) ? 0 : n);
                }, 0);
            return { ...prev, [memberId]: (newWeightTotal + info.totalFixedRewardsInPrimaryCurrency).toFixed(2) };
        });
    };

    const handleSkipPeriod = async (memberId: string, period: CalculatedPeriod) => {
        setProcessingMemberId(memberId);
        try {
            await markCompletionsAwarded(db, period.completionsToMark);
            toast({ title: 'Period Skipped' });
        } catch (err: unknown) {
            toast({ title: 'Error Skipping Period', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setProcessingMemberId(null);
        }
    };

    const handleDepositWithdrawPeriod = async (memberId: string, period: CalculatedPeriod) => {
        setProcessingMemberId(memberId);
        const editableAmount = parseFloat(editablePeriodAmounts[period.id] ?? '0');
        if (isNaN(editableAmount)) {
            toast({ title: 'Invalid Amount', variant: 'destructive' });
            setProcessingMemberId(null);
            return;
        }
        const member = processedAllowances.find((pa) => pa.member.id === memberId)?.member;
        const primaryCurrency = member?.allowanceCurrency;
        if (!primaryCurrency) {
            toast({ title: 'Missing Configuration', description: 'Allowance currency not set.', variant: 'destructive' });
            setProcessingMemberId(null);
            return;
        }
        const fixedPrimary = period.fixedRewardsEarned?.[primaryCurrency.toUpperCase()] ?? 0;
        const finalTotal = editableAmount + fixedPrimary;
        try {
            const memberEnvelopes = typedData?.allowanceEnvelopes.filter((e) => (e as { familyMember?: Array<{ id: string }> }).familyMember?.[0]?.id === memberId) ?? [];
            await executeAllowanceTransaction(db, memberId, memberEnvelopes, finalTotal, primaryCurrency, `Allowance period ending ${period.periodEndDate.toISOString().slice(0, 10)}`);
            await markCompletionsAwarded(db, period.completionsToMark);
            toast({ title: finalTotal >= 0 ? 'Period Deposited' : 'Period Withdrawn' });
        } catch (err: unknown) {
            toast({ title: 'Period Processing Failed', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setProcessingMemberId(null);
        }
    };

    const handleDepositWithdraw = async (memberId: string) => {
        setProcessingMemberId(memberId);
        const info = processedAllowances.find((pa) => pa.member.id === memberId);
        if (!info) { setProcessingMemberId(null); return; }

        const weightTotal = info.pendingPeriods
            .filter((p) => p.status === 'pending')
            .reduce((sum, p) => {
                const n = parseFloat(editablePeriodAmounts[p.id] ?? '0');
                return sum + (isNaN(n) ? 0 : n);
            }, 0);
        const finalAmount = weightTotal + info.totalFixedRewardsInPrimaryCurrency;
        const currency = info.member.allowanceCurrency;

        if (!currency) {
            toast({ title: 'Missing Configuration', variant: 'destructive' });
            setProcessingMemberId(null);
            return;
        }

        const completionIds = info.pendingPeriods.filter((p) => p.status === 'pending').flatMap((p) => p.completionsToMark);
        try {
            const memberEnvelopes = typedData?.allowanceEnvelopes.filter((e) => (e as { familyMember?: Array<{ id: string }> }).familyMember?.[0]?.id === memberId) ?? [];
            await executeAllowanceTransaction(db, memberId, memberEnvelopes, finalAmount, currency, `Allowance distribution up to ${info.pendingPeriods.at(-1)?.periodEndDate.toISOString().slice(0, 10)}`);
            await markCompletionsAwarded(db, completionIds);
            toast({
                title: finalAmount >= 0 ? 'Allowance Deposited' : 'Allowance Withdrawn',
                description: formatBalances({ [currency]: Math.abs(finalAmount) }, typedData?.unitDefinitions ?? []),
            });
        } catch (err: unknown) {
            toast({ title: 'Processing Failed', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setProcessingMemberId(null);
        }
    };

    return {
        isLoading: isProcessing || isDataLoading,
        error: processingError ?? (dataError as Error | null),
        processedAllowances,
        editableAmounts,
        editablePeriodAmounts,
        processingMemberId,
        simulatedDate,
        setSimulatedDate,
        familyMembers: typedData?.familyMembers ?? [],
        unitDefinitions: typedData?.unitDefinitions ?? [],
        handleAmountChange,
        handlePeriodAmountChange,
        handleSkipPeriod,
        handleDepositWithdrawPeriod,
        handleDepositWithdraw,
    };
}
