'use client';

import React from 'react';
import { format } from 'date-fns';
import { DollarSign, TrendingDown, Loader2, Info, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { formatBalances, type UnitDefinition } from '@/lib/currency-utils';
import { AllowancePeriodRow } from '@/components/allowance/AllowancePeriodRow';
import type {
    CalculatedPeriod,
    FamilyMemberWithAllowance,
    MemberAllowanceInfo,
    EditableAmounts,
    EditablePeriodAmounts,
} from '@/app/allowance-distribution/types';

interface MemberAllowanceCardProps {
    member: FamilyMemberWithAllowance;
    allowanceInfo: MemberAllowanceInfo | undefined;
    editableAmounts: EditableAmounts;
    editablePeriodAmounts: EditablePeriodAmounts;
    processingMemberId: string | null;
    simulatedDate: Date;
    unitDefinitions: UnitDefinition[];
    onAmountChange: (memberId: string, value: string) => void;
    onPeriodAmountChange: (periodId: string, memberId: string, value: string) => void;
    onSkipPeriod: (memberId: string, period: CalculatedPeriod) => void;
    onDepositWithdrawPeriod: (memberId: string, period: CalculatedPeriod) => void;
    onDepositWithdraw: (memberId: string) => void;
}

export function MemberAllowanceCard({
    member, allowanceInfo, editableAmounts, editablePeriodAmounts,
    processingMemberId, simulatedDate, unitDefinitions,
    onAmountChange, onPeriodAmountChange, onSkipPeriod,
    onDepositWithdrawPeriod, onDepositWithdraw,
}: MemberAllowanceCardProps) {
    const hasAnyPeriods = !!allowanceInfo && allowanceInfo.pendingPeriods.length > 0;
    const totalDue = allowanceInfo?.totalDue ?? 0;
    const displayAmount = editableAmounts[member.id] ?? totalDue.toFixed(2);
    const isProcessing = processingMemberId === member.id;

    const baseAllowanceText = member.allowanceAmount && member.allowanceCurrency
        ? `${formatBalances({ [member.allowanceCurrency]: member.allowanceAmount }, unitDefinitions)} / period`
        : 'Not configured';

    return (
        <Card className="overflow-hidden">
            <CardHeader className="bg-muted/40 pb-3">
                <CardTitle className="text-lg">{member.name}</CardTitle>
                <p className="text-sm text-muted-foreground">Base allowance: {baseAllowanceText}</p>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Pending periods up to {format(simulatedDate, 'PPP')}
                </h3>

                {!hasAnyPeriods ? (
                    <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                        <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        No allowance periods due based on current settings and date.
                    </div>
                ) : (
                    <div className="space-y-2">
                        {allowanceInfo.pendingPeriods.map((period) => (
                            <AllowancePeriodRow
                                key={period.id}
                                period={period}
                                member={member}
                                editablePeriodAmounts={editablePeriodAmounts}
                                processingMemberId={processingMemberId}
                                unitDefinitions={unitDefinitions}
                                onPeriodAmountChange={onPeriodAmountChange}
                                onDepositWithdrawPeriod={onDepositWithdrawPeriod}
                                onSkipPeriod={onSkipPeriod}
                            />
                        ))}
                    </div>
                )}
            </CardContent>

            {hasAnyPeriods && allowanceInfo && (
                <CardFooter className="bg-muted/20 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Label htmlFor={`total-${member.id}`} className="text-base font-semibold whitespace-nowrap">
                                Total due:
                            </Label>
                            <div className="flex items-center rounded-lg border bg-background overflow-hidden">
                                <span className="pl-2.5 pr-1 text-base font-semibold text-muted-foreground">
                                    {member.allowanceCurrency}
                                </span>
                                <Input
                                    id={`total-${member.id}`}
                                    type="number"
                                    step="0.01"
                                    value={displayAmount}
                                    onChange={(e) => onAmountChange(member.id, e.target.value)}
                                    className="w-28 text-base font-semibold border-0 rounded-none focus-visible:ring-0"
                                    disabled={isProcessing}
                                />
                            </div>
                            <Edit className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        </div>

                        {/* Fixed reward breakdown */}
                        {(allowanceInfo.totalFixedRewardsInPrimaryCurrency > 0 || Object.keys(allowanceInfo.totalFixedRewardsInOtherCurrencies).length > 0) && member.allowanceCurrency && (
                            <p className="text-xs text-muted-foreground pl-0.5">
                                {allowanceInfo.totalFixedRewardsInPrimaryCurrency > 0 && (
                                    <>Includes {formatBalances({ [member.allowanceCurrency]: allowanceInfo.totalFixedRewardsInPrimaryCurrency }, unitDefinitions)} from fixed rewards.</>
                                )}
                                {Object.keys(allowanceInfo.totalFixedRewardsInOtherCurrencies).length > 0 && (
                                    <> Also: {formatBalances(allowanceInfo.totalFixedRewardsInOtherCurrencies, unitDefinitions)}.</>
                                )}
                            </p>
                        )}
                    </div>

                    <Button
                        size="lg"
                        variant={parseFloat(displayAmount) < 0 ? 'destructive' : 'default'}
                        disabled={isProcessing || parseFloat(displayAmount || '0') === 0}
                        onClick={() => onDepositWithdraw(member.id)}
                    >
                        {isProcessing ? (
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        ) : parseFloat(displayAmount) < 0 ? (
                            <TrendingDown className="h-5 w-5 mr-2" />
                        ) : (
                            <DollarSign className="h-5 w-5 mr-2" />
                        )}
                        {isProcessing ? 'Processing…' : parseFloat(displayAmount) < 0 ? 'Withdraw amount' : 'Deposit amount'}
                    </Button>
                </CardFooter>
            )}
        </Card>
    );
}
