'use client';

import React, { useMemo } from 'react';
import AppleCalendarSyncSettings from '@/components/AppleCalendarSyncSettings';
import CountdownSettings from '@/components/CountdownSettings';
import CurrencySettings from '@/components/CurrencySettings';
import DashboardSettingsPanel from '@/components/DashboardSettingsPanel';
import DashboardThemeSelector from '@/components/freeform-dashboard/DashboardThemeSelector';
import GradeTypeSettings from '@/components/GradeTypeSettings';
import HouseholdSchedulingSettings from '@/components/HouseholdSchedulingSettings';
import FamilyMembersList from '@/components/FamilyMembersList';
import { ParentGate } from '@/components/auth/ParentGate';
import { db } from '@/lib/db';

export default function SettingsPage() {
    const { data } = db.useQuery({
        familyMembers: {
            $: { order: { order: 'asc' } },
        },
    });

    const familyMembers = useMemo(() => (data?.familyMembers as any[]) || [], [data?.familyMembers]);

    return (
        <ParentGate>
            <div className="container mx-auto max-w-4xl px-8 py-10">
                <div className="mb-10 border-b border-border/40 pb-6">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/50 mb-1">App</p>
                    <h1
                        className="text-2xl text-foreground"
                        style={{ fontFamily: 'var(--font-garamond, Georgia, serif)', fontWeight: 500, letterSpacing: '-0.01em' }}
                    >
                        Settings
                    </h1>
                </div>

                <div id="family-member-settings" className="mb-10 scroll-mt-24">
                    <FamilyMembersList
                        familyMembers={familyMembers}
                        db={db}
                        alwaysEditMode
                    />
                </div>

                <div className="mb-10">
                    <DashboardSettingsPanel familyMembers={familyMembers} />
                </div>

                <div className="mb-10">
                    <DashboardThemeSelector />
                </div>

                <CurrencySettings db={db} />

                <div className="mt-10">
                    <HouseholdSchedulingSettings db={db} />
                </div>

                <div className="mt-10">
                    <CountdownSettings db={db} />
                </div>

                <div className="mt-10">
                    <GradeTypeSettings />
                </div>

                <div className="mt-10">
                    <AppleCalendarSyncSettings />
                </div>
            </div>
        </ParentGate>
    );
}
