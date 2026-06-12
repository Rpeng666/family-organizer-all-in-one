'use client';

import React from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { DashboardSectionHeader } from '@/components/dashboard/DashboardSectionHeader';
import { formatCountLabel, type ChoreSectionPlan, type ChoreRow } from '@/lib/dashboard-layout-planner';

interface DashboardChoresSectionProps {
    incompleteChores: ChoreRow[];
    completedChores: ChoreRow[];
    plan: ChoreSectionPlan;
    height: number | null;
}

export function DashboardChoresSection({ incompleteChores, completedChores, plan, height }: DashboardChoresSectionProps) {
    return (
        <div
            className="overflow-hidden rounded-3xl border border-border/60 bg-card px-4 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
            style={height != null ? { height: `${height}px` } : undefined}
        >
            <DashboardSectionHeader
                icon={CheckCircle2}
                title="Chores"
                href="/chores"
                countLabel={formatCountLabel(incompleteChores.length, 'left', 'left')}
            />

            <div className="mt-3 space-y-1.5">
                {incompleteChores.length === 0 && completedChores.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border/50 px-4 py-3 text-xs text-muted-foreground/60">
                        No chores scheduled for this day.
                    </div>
                ) : (
                    <>
                        {incompleteChores.map((chore) => (
                            <div
                                key={chore.id}
                                className="flex h-[48px] items-center justify-between gap-3 rounded-2xl border border-border/50 bg-background/60 px-4"
                            >
                                <p className="truncate text-sm text-foreground" style={{ fontFamily: 'var(--font-garamond, Georgia, serif)' }}>
                                    {chore.title}
                                </p>
                                {chore.weight > 0 && (
                                    <span className="shrink-0 rounded-full border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground/60">
                                        {chore.weight} xp
                                    </span>
                                )}
                            </div>
                        ))}

                        {plan.showCompletedLabel && completedChores.length > 0 && (
                            <p className="pt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/40">Done</p>
                        )}

                        {completedChores.map((chore) => (
                            <div
                                key={`${chore.id}-completed`}
                                className="flex h-[44px] items-center justify-between gap-3 rounded-2xl border border-border/30 bg-secondary/40 px-4"
                            >
                                <p className="truncate text-sm text-muted-foreground/50 line-through">{chore.title}</p>
                                {chore.weight > 0 && (
                                    <span className="shrink-0 text-[10px] text-muted-foreground/40">{chore.weight} xp</span>
                                )}
                            </div>
                        ))}

                        {plan.hiddenCount > 0 && (
                            <Link href="/chores" className="block pt-1 text-xs text-muted-foreground/60 underline-offset-4 hover:text-foreground hover:underline">
                                {plan.hiddenCount} more chore{plan.hiddenCount === 1 ? '' : 's'}
                            </Link>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
