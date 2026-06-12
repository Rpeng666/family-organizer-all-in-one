'use client';

import React from 'react';
import { startOfDay } from 'date-fns';
import { format } from 'date-fns';
import { Loader2, CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { ParentGate } from '@/components/auth/ParentGate';
import { MemberAllowanceCard } from '@/components/allowance/MemberAllowanceCard';
import { useAllowanceProcessing } from '@/hooks/useAllowanceProcessing';

export default function AllowanceDistributionPage() {
    const {
        isLoading,
        error,
        processedAllowances,
        editableAmounts,
        editablePeriodAmounts,
        processingMemberId,
        simulatedDate,
        setSimulatedDate,
        familyMembers,
        unitDefinitions,
        handleAmountChange,
        handlePeriodAmountChange,
        handleSkipPeriod,
        handleDepositWithdrawPeriod,
        handleDepositWithdraw,
    } = useAllowanceProcessing();

    return (
        <ParentGate>
            <div className="container mx-auto p-4 md:p-8 space-y-6">

                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h1 className="text-3xl font-bold tracking-tight">Allowance Distribution</h1>

                    <div className="flex items-center gap-2">
                        <Label className="whitespace-nowrap text-sm text-muted-foreground">Simulated date:</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    className={cn('w-[200px] justify-start text-left font-normal', !simulatedDate && 'text-muted-foreground')}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {simulatedDate ? format(simulatedDate, 'PPP') : 'Pick a date'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={simulatedDate}
                                    onSelect={(date) => setSimulatedDate(date ? startOfDay(date) : startOfDay(new Date()))}
                                    initialFocus
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Loading */}
                {isLoading && (
                    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                        <Loader2 className="h-6 w-6 animate-spin" />
                        <span>Loading allowance data…</span>
                    </div>
                )}

                {/* Error */}
                {!isLoading && error && (
                    <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                        Error loading data: {error.message}
                    </div>
                )}

                {/* Empty */}
                {!isLoading && !error && familyMembers.length === 0 && (
                    <p className="text-center text-muted-foreground italic py-16">No family members found.</p>
                )}

                {/* Member cards */}
                {!isLoading && !error && familyMembers.length > 0 && (
                    <div className="space-y-6">
                        {familyMembers.map((member) => (
                            <MemberAllowanceCard
                                key={member.id}
                                member={member}
                                allowanceInfo={processedAllowances.find((pa) => pa.member.id === member.id)}
                                editableAmounts={editableAmounts}
                                editablePeriodAmounts={editablePeriodAmounts}
                                processingMemberId={processingMemberId}
                                simulatedDate={simulatedDate}
                                unitDefinitions={unitDefinitions}
                                onAmountChange={handleAmountChange}
                                onPeriodAmountChange={handlePeriodAmountChange}
                                onSkipPeriod={handleSkipPeriod}
                                onDepositWithdrawPeriod={handleDepositWithdrawPeriod}
                                onDepositWithdraw={handleDepositWithdraw}
                            />
                        ))}
                    </div>
                )}
            </div>
        </ParentGate>
    );
}
