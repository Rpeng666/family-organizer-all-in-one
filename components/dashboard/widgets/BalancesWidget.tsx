'use client';

import React, { useMemo } from 'react';
import { Wallet2 } from 'lucide-react';
import { db } from '@/lib/db';
import { type UnitDefinition } from '@/lib/currency-utils';
import { buildMemberTotalBalances, type DashboardFamilyMember } from '@/lib/dashboard-utils';
import type { WidgetProps } from './types';
import { registerWidget } from './widget-store';
import WidgetShell from './WidgetShell';

function BalancesWidget({ memberId }: WidgetProps) {
    const { data } = db.useQuery({
        familyMembers: {
            $: { where: { id: memberId } },
            allowanceEnvelopes: {},
        },
        unitDefinitions: {},
    });

    const member = useMemo(
        () => (data?.familyMembers?.[0] as unknown as DashboardFamilyMember) || null,
        [data?.familyMembers]
    );

    const unitDefinitions = useMemo(
        () => (data?.unitDefinitions || []) as UnitDefinition[],
        [data?.unitDefinitions]
    );

    const balances = useMemo(() => {
        if (!member) return {} as Record<string, number>;
        return buildMemberTotalBalances(member);
    }, [member]);

    const entries = Object.entries(balances).sort(([a], [b]) => a.localeCompare(b));

    return (
        <WidgetShell meta={BALANCES_META}>
            {entries.length === 0 ? (
                <p className="text-sm text-slate-500">No balances.</p>
            ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {entries.map(([currency, amount]) => {
                        const unit = unitDefinitions.find((u) => u.code?.toUpperCase() === currency);
                        const symbol = unit?.symbol || currency;
                        const decimals = unit?.decimalPlaces ?? (unit?.isMonetary ? 2 : 0);
                        const formatted = Number(amount).toLocaleString(undefined, {
                            minimumFractionDigits: decimals,
                            maximumFractionDigits: decimals,
                        });
                        const placement = unit?.symbolPlacement ?? 'before';

                        return (
                            <div key={currency} className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-wide text-slate-500">{unit?.name || currency}</p>
                                <p className="text-lg font-semibold text-slate-900">
                                    {placement === 'before' ? `${symbol}${formatted}` : `${formatted} ${symbol}`}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </WidgetShell>
    );
}

const BALANCES_META = {
    id: 'balances',
    label: 'Balances',
    icon: Wallet2,
    defaultSize: { colSpan: 1 as const },
    defaultEnabled: false,
    defaultOrder: 6,
    description: 'Multi-currency envelope balance totals',
};

registerWidget({ meta: BALANCES_META, component: BalancesWidget });
