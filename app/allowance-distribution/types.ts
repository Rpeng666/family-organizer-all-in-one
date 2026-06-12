import type { Envelope } from '@/lib/currency-utils';
import type { ChoreCompletion } from '@/lib/chore-utils';

export interface CalculatedPeriod {
    id: string;
    familyMemberId: string;
    periodStartDate: Date;
    periodEndDate: Date;
    totalWeight: number;
    completedWeight: number;
    percentage: number;
    calculatedAmount: number;
    lastCalculatedAt: Date;
    isStale: boolean;
    status?: 'pending' | 'calculated' | 'skipped' | 'distributed' | 'in-progress';
    completionsToMark: string[];
    fixedRewardsEarned: { [currency: string]: number };
    upForGrabsContributionPercentage: number;
}

export interface FamilyMemberWithAllowance extends Record<string, unknown> {
    id: string;
    name?: string;
    allowanceAmount?: number | null;
    allowanceCurrency?: string | null;
    allowanceRrule?: string | null;
    allowanceStartDate?: string | null;
    allowanceEnvelopes?: Envelope[];
    completedChores?: ChoreCompletion[];
    allowancePayoutDelayDays?: number | null;
}

export interface MemberAllowanceInfo {
    member: FamilyMemberWithAllowance;
    pendingPeriods: CalculatedPeriod[];
    totalDue: number;
    totalFixedRewardsInPrimaryCurrency: number;
    totalFixedRewardsInOtherCurrencies: { [currency: string]: number };
}

export type EditableAmounts = Record<string, string>;
export type EditablePeriodAmounts = Record<string, string>;
