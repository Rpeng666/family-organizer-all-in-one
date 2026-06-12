// components/allowance/FamilyAllowanceView.tsx
'use client'; // Needed for hooks like useState, useEffect, useQuery

import React, { useState, useMemo, useEffect } from 'react';
import { tx, id } from '@instantdb/react'; // Import InstantDB hooks
import { useToast } from '@/components/ui/use-toast'; // +++ ADDED IMPORT
import { db } from '@/lib/db';

// Import the child components
import FamilyMembersList from '@/components/FamilyMembersList'; // Your existing component
import MemberAllowanceDetail from '@/components/allowance/MemberAllowanceDetail'; // The new detail component

// **** Import types ****
import { UnitDefinition, Envelope, computeMonetaryCurrencies } from '@/lib/currency-utils';

// Define FamilyMember type based on query
interface FamilyMember {
    id: string;
    name: string;
    email?: string;
    photoUrl?: string; // Legacy support if needed
    photoUrls?: {
        '64'?: string;
        '320'?: string;
        '1200'?: string;
    };
    allowanceEnvelopes?: Envelope[];
    lastDisplayCurrency?: string | null;
    allowanceAmount?: number | null;
    allowanceCurrency?: string | null;
    allowanceRrule?: string | null;
    allowanceStartDate?: string | null; // Schema is i.date(), so this will be an ISO string or null
    allowanceConfig?: any | null; // Using 'any' for the JSON object
    allowancePayoutDelayDays?: number | null;
}

export default function FamilyAllowanceView() {
    // State to track which member's details are being shown
    // Initialize with null or potentially 'All' depending on FamilyMembersList's default behavior
    const [selectedMemberId, setSelectedMemberId] = useState<string | null | 'All'>(null);
    const { toast } = useToast(); // +++ ADDED HOOK

    // **** UPDATED QUERY: Fetch members, ALL envelopes, and unit definitions ****
    const {
        isLoading: isLoadingAppData,
        error: errorAppData,
        data: appData,
    } = db.useQuery({
        familyMembers: {
            // ADD THIS to sort the results
            $: { order: { order: 'asc' } },

            // Fetch all fields for members by default
            // We NEED allowanceEnvelopes linked here to calculate balances per member
            allowanceEnvelopes: {}, // Fetch linked envelopes for calculation later
        },
        // Fetch all envelopes separately to easily get all balances if needed elsewhere (or remove if redundant)
        allowanceEnvelopes: {}, // Keep this for calculating allMonetaryCurrenciesInUse
        unitDefinitions: {},
    });

    // --- Derived Data ---
    const familyMembers = useMemo(() => (appData?.familyMembers || []) as unknown as FamilyMember[], [appData?.familyMembers]);
    const allEnvelopes = useMemo(() => (appData?.allowanceEnvelopes || []) as unknown as Envelope[], [appData?.allowanceEnvelopes]);
    const unitDefinitions = useMemo(() => (appData?.unitDefinitions || []) as unknown as UnitDefinition[], [appData?.unitDefinitions]);

    // +++ Use the new utility function +++
    const allMonetaryCurrenciesInUse = useMemo(() => {
        return computeMonetaryCurrencies(allEnvelopes, unitDefinitions);
    }, [allEnvelopes, unitDefinitions]);

    // **** REMOVED: Placeholder handleAddFamilyMember ****
    // **** REMOVED: Placeholder handleDeleteFamilyMember ****

    if (isLoadingAppData) {
        return <div className="p-4">Loading family members...</div>;
    }

    if (errorAppData) {
        console.error('Error fetching family members:', errorAppData);
        return <div className="p-4 text-red-600">Could not load family members.</div>;
    }

    return (
        <div className="p-4">
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 md:flex-row md:items-start">
                {/* Column 1: Family Member List */}
                <div className="border rounded-lg p-4 bg-card md:w-[clamp(260px,24vw,360px)] md:flex-shrink-0">
                    <FamilyMembersList
                        familyMembers={familyMembers}
                        selectedMember={selectedMemberId}
                        setSelectedMember={setSelectedMemberId}
                        // **** REMOVED: addFamilyMember and deleteFamilyMember props ****
                        db={db}
                        // **** NEW: Pass balance data ****
                        showBalances={true} // Enable balance display
                        // membersBalances and unitDefinitions are now optional.
                        // FamilyMembersList will fetch them internally if not passed.
                        // But since we have them here already, passing them is fine too.
                        // Actually, let's let the component handle it to prove it works.
                        // But for efficiency, if we have them, we should pass them.
                        // Let's pass the unitDefinitions at least as they are cheap.
                        unitDefinitions={unitDefinitions}
                    />
                </div>

                {/* Column 2: Member Allowance Details (Conditional) */}
                <div className="min-w-0 flex-1">
                    {selectedMemberId && selectedMemberId !== 'All' ? (
                        <MemberAllowanceDetail
                            memberId={selectedMemberId}
                            // Pass only the members needed for transfer recipient list
                            allFamilyMembers={familyMembers.map((m) => ({ id: m.id, name: m.name }))}
                            // **** Pass the computed list and definitions ****
                            allMonetaryCurrenciesInUse={allMonetaryCurrenciesInUse}
                            unitDefinitions={unitDefinitions}
                            db={db} // Pass db instance
                        />
                    ) : (
                        // Placeholder when no family member is selected
                        <div className="p-4 border rounded-lg bg-muted text-muted-foreground h-full flex items-center justify-center min-h-[200px]">
                            <p>Select a family member to view their allowance details.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
