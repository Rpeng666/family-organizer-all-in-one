'use client';

import React from 'react';
import { format, isEqual, startOfDay } from 'date-fns';
import { DollarSign, TrendingDown, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatBalances, type UnitDefinition } from '@/lib/currency-utils';
import type { CalculatedPeriod, FamilyMemberWithAllowance, EditablePeriodAmounts } from '@/app/allowance-distribution/types';

interface AllowancePeriodRowProps {
    period: CalculatedPeriod;
    member: FamilyMemberWithAllowance;
    editablePeriodAmounts: EditablePeriodAmounts;
    processingMemberId: string | null;
    unitDefinitions: UnitDefinition[];
    onPeriodAmountChange: (periodId: string, memberId: string, value: string) => void;
    onDepositWithdrawPeriod: (memberId: string, period: CalculatedPeriod) => void;
    onSkipPeriod: (memberId: string, period: CalculatedPeriod) => void;
}

function formatPeriodDateRange(start: Date, end: Date): string {
    if (isEqual(startOfDay(start), startOfDay(end))) return format(start, 'MMM d, yyyy');
    const startStr = format(start, 'MMM d');
    const endStr = format(end, start.getFullYear() !== end.getFullYear() ? 'MMM d, yyyy' : 'MMM d, yyyy');
    const yearSuffix = start.getFullYear() !== end.getFullYear() ? `, ${start.getFullYear()}` : '';
    return `${startStr}${yearSuffix} – ${endStr}`;
}

export function AllowancePeriodRow({
    period, member, editablePeriodAmounts, processingMemberId, unitDefinitions,
    onPeriodAmountChange, onDepositWithdrawPeriod, onSkipPeriod,
}: AllowancePeriodRowProps) {
    const isInProgress = period.status === 'in-progress';
    const isProcessing = processingMemberId === member.id;
    const primaryCurrency = member.allowanceCurrency?.toUpperCase() ?? '';
    const editableAmount = parseFloat(editablePeriodAmounts[period.id] ?? '0');
    const fixedPrimary = period.fixedRewardsEarned?.[primaryCurrency] ?? 0;
    const fixedOther = Object.fromEntries(
        Object.entries(period.fixedRewardsEarned ?? {}).filter(([cur]) => cur !== primaryCurrency),
    );
    const combinedAmount = editableAmount + fixedPrimary;
    const dateRange = formatPeriodDateRange(period.periodStartDate, period.periodEndDate);

    return (
        <div className="rounded-xl border bg-card p-3 flex justify-between items-start gap-3">
            {/* Left: period info */}
            <div className="flex-grow min-w-0">
                <p className="font-medium text-sm">
                    {dateRange}
                    {isInProgress && (
                        <span className="ml-2 text-xs font-normal text-primary italic">In Progress</span>
                    )}
                </p>

                <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-muted-foreground">
                    <span>Total wt: <span className="font-mono text-foreground">{period.totalWeight.toFixed(2)}</span></span>
                    <span>Completed wt: <span className="font-mono text-foreground">{period.completedWeight.toFixed(2)}</span></span>
                    <span>
                        Completion: <span className="font-mono text-foreground">{period.percentage.toFixed(1)}%</span>
                        {period.upForGrabsContributionPercentage > 0 && (
                            <span className="ml-1 italic text-muted-foreground/70">
                                (incl. {period.upForGrabsContributionPercentage.toFixed(1)}% from up-for-grabs)
                            </span>
                        )}
                    </span>
                    <span>
                        Calc amt: <span className="font-mono text-foreground">
                            {member.allowanceCurrency && formatBalances({ [member.allowanceCurrency]: period.calculatedAmount }, unitDefinitions)}
                        </span>
                    </span>
                </div>

                {(fixedPrimary > 0 || Object.keys(fixedOther).length > 0) && (
                    <p className="mt-1 text-xs text-primary/80">
                        Fixed rewards:
                        {fixedPrimary > 0 && member.allowanceCurrency && ` ${formatBalances({ [member.allowanceCurrency]: fixedPrimary }, unitDefinitions)}`}
                        {Object.keys(fixedOther).length > 0 && `${fixedPrimary > 0 ? ' + ' : ' '}${formatBalances(fixedOther, unitDefinitions)}`}
                    </p>
                )}
            </div>

            {/* Right: controls */}
            {!isInProgress && (
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                        <div className="flex items-center rounded-lg border bg-background overflow-hidden h-8">
                            <span className="pl-2 pr-1 text-sm font-semibold text-muted-foreground">
                                {member.allowanceCurrency}
                            </span>
                            <Input
                                type="number"
                                step="0.01"
                                value={editablePeriodAmounts[period.id] ?? '0'}
                                onChange={(e) => onPeriodAmountChange(period.id, member.id, e.target.value)}
                                className="w-20 text-sm border-0 rounded-none focus-visible:ring-0 h-full px-1"
                                disabled={isProcessing}
                            />
                        </div>
                        <Button
                            size="sm"
                            className="h-8"
                            variant={combinedAmount < 0 ? 'destructive' : 'default'}
                            disabled={isProcessing || combinedAmount === 0}
                            onClick={() => onDepositWithdrawPeriod(member.id, period)}
                        >
                            {isProcessing ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : combinedAmount < 0 ? (
                                <TrendingDown className="h-4 w-4" />
                            ) : (
                                <DollarSign className="h-4 w-4" />
                            )}
                            <span className="sr-only">{combinedAmount < 0 ? 'Withdraw' : 'Deposit'} period</span>
                        </Button>
                    </div>

                    {(fixedPrimary > 0 || Object.keys(fixedOther).length > 0) && member.allowanceCurrency && (
                        <p className="text-[11px] text-muted-foreground text-right max-w-[200px] leading-tight">
                            {fixedPrimary > 0 && Object.keys(fixedOther).length > 0
                                ? `Includes ${formatBalances({ [member.allowanceCurrency]: fixedPrimary }, unitDefinitions)} fixed + ${formatBalances(fixedOther, unitDefinitions)}`
                                : fixedPrimary > 0
                                    ? `Includes ${formatBalances({ [member.allowanceCurrency]: fixedPrimary }, unitDefinitions)} from fixed rewards`
                                    : `Also includes ${formatBalances(fixedOther, unitDefinitions)}`}
                        </p>
                    )}

                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-destructive"
                        disabled={isProcessing}
                        onClick={() => onSkipPeriod(member.id, period)}
                    >
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Skip
                    </Button>
                </div>
            )}
        </div>
    );
}
