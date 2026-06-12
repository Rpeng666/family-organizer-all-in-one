import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import CurrencySelector from '@/components/CurrencySelector';

interface ChoreRewardFieldsProps {
    isUpForGrabs: boolean;
    setIsUpForGrabs: (v: boolean) => void;
    isJoint: boolean;
    setIsJoint: (v: boolean) => void;
    rewardType: 'fixed' | 'weight';
    setRewardType: (v: 'fixed' | 'weight') => void;
    weight: string;
    setWeight: (v: string) => void;
    rewardAmount: string;
    setRewardAmount: (v: string) => void;
    rewardCurrency: string;
    setRewardCurrency: (v: string) => void;
    currencyOptions: { value: string; label: string }[];
    unitDefinitions: any[];
    db: any;
}

export function ChoreRewardFields({
    isUpForGrabs,
    setIsUpForGrabs,
    isJoint,
    setIsJoint,
    rewardType,
    setRewardType,
    weight,
    setWeight,
    rewardAmount,
    setRewardAmount,
    rewardCurrency,
    setRewardCurrency,
    currencyOptions,
    unitDefinitions,
    db,
}: ChoreRewardFieldsProps) {
    return (
        <>
            {/* Up for Grabs toggle */}
            <div className="space-y-3 border-t pt-3">
                <div className="flex items-center space-x-2">
                    <Switch
                        id="isUpForGrabs"
                        checked={isUpForGrabs}
                        onCheckedChange={(checked) => {
                            setIsUpForGrabs(checked);
                            if (checked) setIsJoint(false);
                        }}
                    />
                    <Label htmlFor="isUpForGrabs">Up for Grabs Chore</Label>
                </div>
                <p className="pl-8 text-xs text-muted-foreground">
                    Any assigned member can complete this chore on a first-come, first-served basis each day it&apos;s due. No rotation applies.
                </p>
            </div>

            {/* Reward type selector — only when Up for Grabs */}
            {isUpForGrabs && (
                <div className="space-y-2 border-t pt-3">
                    <Label className="font-semibold">Reward / Allowance Value:</Label>
                    <RadioGroup
                        value={rewardType}
                        onValueChange={(v) => setRewardType(v as 'fixed' | 'weight')}
                        className="flex flex-col space-y-1"
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="weight" id="reward-weight" />
                            <Label htmlFor="reward-weight" className="flex flex-col font-normal">
                                <span>Use Weight</span>
                                <span className="text-xs text-muted-foreground">
                                    Counts towards allowance based on assigned weight (can exceed 100% total).
                                </span>
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="fixed" id="reward-fixed" />
                            <Label htmlFor="reward-fixed" className="flex flex-col font-normal">
                                <span>Fixed Amount</span>
                                <span className="text-xs text-muted-foreground">
                                    Adds a specific, non-editable amount to allowance upon completion.
                                </span>
                            </Label>
                        </div>
                    </RadioGroup>
                </div>
            )}

            {/* Weight input — shown when not Up for Grabs OR when Up for Grabs with weight reward */}
            {(!isUpForGrabs || rewardType === 'weight') && (
                <div className="space-y-2 border-t pt-3">
                    <Label htmlFor="weight">
                        Weight <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="weight"
                        type="number"
                        step="any"
                        placeholder="e.g., 1, 0.5, -2 (0=exclude)"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        required
                    />
                    <p className="text-xs text-muted-foreground">
                        Enter a number (positive or negative). Chores with 0 weight are excluded from allowance calculation.
                    </p>
                </div>
            )}

            {/* Fixed reward inputs — only when Up for Grabs with fixed reward */}
            {isUpForGrabs && rewardType === 'fixed' && (
                <div className="space-y-4 border-t pt-3">
                    <div>
                        <Label htmlFor="reward-amount">
                            Fixed Reward Amount <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="reward-amount"
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="e.g., 2.50"
                            value={rewardAmount}
                            onChange={(e) => setRewardAmount(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <Label htmlFor="reward-currency-input">
                            Reward Currency <span className="text-destructive">*</span>
                        </Label>
                        <CurrencySelector
                            db={db}
                            value={rewardCurrency}
                            onChange={setRewardCurrency}
                            currencyOptions={currencyOptions}
                            unitDefinitions={unitDefinitions}
                            placeholder="Select reward currency..."
                            disabled={rewardType !== 'fixed'}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
