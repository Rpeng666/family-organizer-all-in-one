'use client';

import React, { useMemo } from 'react';
import { Users, Zap } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { db } from '@/lib/db';
import { calculateDailyXP } from '@family-organizer/shared-core';
import { formatBalances, type UnitDefinition } from '@/lib/currency-utils';
import { buildMemberTotalBalances, getPhotoUrl, toInitials, type DashboardFamilyMember } from '@/lib/dashboard-utils';

interface DashboardHeaderProps {
    activeMember: DashboardFamilyMember | null;
    familyMembers: DashboardFamilyMember[];
    todayLabel: string;
    todayUtc: Date;
    onSelectMember: (id: string) => void;
    onSwitchToFamily: () => void;
}

export default function DashboardHeader({
    activeMember,
    familyMembers,
    todayLabel,
    todayUtc,
    onSelectMember,
    onSwitchToFamily,
}: DashboardHeaderProps) {
    const activeMemberId = activeMember?.id;

    // XP data
    const { data: xpData } = db.useQuery({
        familyMembers: { $: { order: { order: 'asc' } } },
        chores: {
            assignees: {},
            assignments: { familyMember: {} },
            completions: { completedBy: {} },
        },
    });

    const xp = useMemo(() => {
        if (!xpData?.chores || !xpData?.familyMembers || !activeMemberId)
            return { current: 0, possible: 0 };
        const xpByMember = calculateDailyXP(xpData.chores as any, xpData.familyMembers as any, todayUtc);
        return xpByMember[activeMemberId] || { current: 0, possible: 0 };
    }, [xpData?.chores, xpData?.familyMembers, activeMemberId, todayUtc]);

    const xpPercent = xp.possible > 0 ? Math.round((xp.current / xp.possible) * 100) : 0;

    // Balances data
    const { data: balData } = db.useQuery({
        familyMembers: {
            ...(activeMemberId ? { $: { where: { id: activeMemberId } } } : {}),
            allowanceEnvelopes: {},
        },
        unitDefinitions: {},
    });

    const balMember = useMemo(
        () => (balData?.familyMembers?.[0] as unknown as DashboardFamilyMember) || null,
        [balData?.familyMembers]
    );

    const unitDefinitions = useMemo(
        () => (balData?.unitDefinitions || []) as UnitDefinition[],
        [balData?.unitDefinitions]
    );

    const balanceText = useMemo(() => {
        if (!balMember) return null;
        const balances = buildMemberTotalBalances(balMember);
        if (Object.keys(balances).length === 0) return null;
        const formatted = formatBalances(balances, unitDefinitions);
        if (formatted === 'Empty') return null;
        return formatted;
    }, [balMember, unitDefinitions]);

    const balanceLabel = useMemo(() => {
        if (!balMember) return 'Balance';
        const balances = buildMemberTotalBalances(balMember);
        return Object.keys(balances).length > 1 ? 'Balances' : 'Balance';
    }, [balMember]);

    return (
        <header className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    {activeMember && (
                        <Avatar className="h-12 w-12 border-2 border-slate-200">
                            {getPhotoUrl(activeMember) ? (
                                <AvatarImage src={getPhotoUrl(activeMember)} alt={activeMember.name} />
                            ) : null}
                            <AvatarFallback className="bg-slate-100 text-sm font-semibold text-slate-700">
                                {toInitials(activeMember.name)}
                            </AvatarFallback>
                        </Avatar>
                    )}
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                            {activeMember?.name ? `${activeMember.name}'s Dashboard` : 'Personal Dashboard'}
                        </h1>
                        <p className="text-xs text-slate-600">{todayLabel}</p>
                    </div>
                </div>

                {/* XP + Balances + Family View */}
                <div className="flex items-center gap-5">
                    {/* Daily XP */}
                    <div className="hidden sm:flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                            <Zap className="h-4 w-4 text-blue-500" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                Daily XP
                            </span>
                            {xp.possible > 0 && (
                                <span className="text-sm font-bold text-slate-800">
                                    {xp.current}/{xp.possible}
                                </span>
                            )}
                        </div>
                        {xp.possible > 0 ? (
                            <div className="h-2.5 w-28 overflow-hidden rounded-full bg-slate-100">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                                    style={{ width: `${xpPercent}%` }}
                                />
                            </div>
                        ) : (
                            <span className="text-[11px] text-slate-400">No chores today</span>
                        )}
                    </div>

                    {/* Balances summary */}
                    {balanceText && (
                        <div className="hidden sm:flex flex-col items-end">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                {balanceLabel}
                            </span>
                            <span className="text-sm font-bold text-slate-800">
                                {balanceText}
                            </span>
                        </div>
                    )}

                    <button
                        onClick={onSwitchToFamily}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <Users className="h-3.5 w-3.5" />
                        Family View
                    </button>
                </div>
            </div>

            {familyMembers.length > 1 && (
                <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                    {familyMembers.map((member) => {
                        const isActive = member.id === activeMemberId;
                        return (
                            <button
                                key={member.id}
                                onClick={() => onSelectMember(member.id)}
                                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                    isActive
                                        ? 'border-blue-300 bg-blue-50 text-blue-800'
                                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                <Avatar className="h-5 w-5">
                                    {getPhotoUrl(member) ? (
                                        <AvatarImage src={getPhotoUrl(member)} alt={member.name} />
                                    ) : null}
                                    <AvatarFallback className="text-[8px]">
                                        {toInitials(member.name)}
                                    </AvatarFallback>
                                </Avatar>
                                {member.name}
                            </button>
                        );
                    })}
                </div>
            )}
        </header>
    );
}
