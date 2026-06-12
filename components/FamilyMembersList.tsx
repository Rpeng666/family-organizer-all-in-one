// components/FamilyMembersList.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { tx } from '@instantdb/react';
import { useToast } from '@/components/ui/use-toast';
import { UnitDefinition } from '@/lib/currency-utils';
import Link from 'next/link';
import { buildMemberColorMap } from '@/lib/family-member-colors';
import { getPhotoUrl, type PhotoUrls } from '@/lib/photo-urls';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { reorderWithEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/reorder-with-edge';
import { SortableFamilyMemberItem } from './SortableFamilyMemberItem';
import { useAuth } from '@/components/AuthProvider';
import { calculateDailyXP } from '@/lib/chore-utils';
import { MemberCreatePanel } from '@/components/family-members/MemberCreatePanel';
import { MemberEditPanel } from '@/components/family-members/MemberEditPanel';
import { FamilyPhotoPanel } from '@/components/family-members/FamilyPhotoPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FamilyMember {
    id: string;
    name: string;
    email?: string | null;
    photoUrls?: { '64'?: string; '320'?: string; '1200'?: string } | null;
    order?: number | null;
    role?: string | null;
    color?: string | null;
}

interface FamilyMembersListProps {
    familyMembers: FamilyMember[];
    selectedMember?: string | null | 'All';
    setSelectedMember?: (id: string | null | 'All') => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
    showBalances?: boolean;
    membersBalances?: Record<string, Record<string, number>>;
    unitDefinitions?: UnitDefinition[];
    membersXP?: Record<string, { current: number; possible: number }>;
    alwaysEditMode?: boolean;
}

const FAMILY_PHOTO_SETTING = 'familyPhotoUrls';
const noopSetSelectedMember = () => {};

// ─── Component ────────────────────────────────────────────────────────────────

function FamilyMembersList({
    familyMembers,
    selectedMember = null,
    setSelectedMember = noopSetSelectedMember,
    db,
    showBalances = false,
    membersBalances: propBalances,
    unitDefinitions: propUnitDefs,
    membersXP: propXP,
    alwaysEditMode = false,
}: FamilyMembersListProps) {
    const { currentUser } = useAuth();
    const { toast } = useToast();

    // ── Internal data fetch (only when parent doesn't provide) ────────────────

    const shouldFetch = !propBalances || !propUnitDefs || !propXP;
    const { data: internalData } = db.useQuery(
        shouldFetch
            ? {
                  chores: { assignees: {}, assignments: { familyMember: {} }, completions: { completedBy: {} } },
                  familyMembers: { allowanceEnvelopes: {} },
                  unitDefinitions: {},
              }
            : null,
    );
    const { data: familyPhotoData } = db.useQuery({
        settings: { $: { where: { name: FAMILY_PHOTO_SETTING } } },
    });

    const familyPhotoUrls = useMemo<PhotoUrls | null>(() => {
        const raw = familyPhotoData?.settings?.[0]?.value;
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            return {
                '64': typeof parsed['64'] === 'string' ? parsed['64'] : undefined,
                '320': typeof parsed['320'] === 'string' ? parsed['320'] : undefined,
                '1200': typeof parsed['1200'] === 'string' ? parsed['1200'] : undefined,
            };
        } catch { return null; }
    }, [familyPhotoData?.settings]);

    const unitDefinitions = useMemo(
        () => propUnitDefs ?? ((internalData?.unitDefinitions as UnitDefinition[]) || []),
        [propUnitDefs, internalData?.unitDefinitions],
    );

    const membersBalances = useMemo(() => {
        if (propBalances) return propBalances;
        const balances: Record<string, Record<string, number>> = {};
        ((internalData?.familyMembers as Array<{ id: string; allowanceEnvelopes?: Array<{ balances?: Record<string, number> }> }>) || []).forEach((m) => {
            balances[m.id] = {};
            (m.allowanceEnvelopes ?? []).forEach((env) => {
                Object.entries(env.balances ?? {}).forEach(([cur, amt]) => {
                    const code = cur.toUpperCase();
                    balances[m.id][code] = (balances[m.id][code] ?? 0) + (amt as number);
                });
            });
        });
        return balances;
    }, [propBalances, internalData?.familyMembers]);

    const membersXP = useMemo(() => {
        if (propXP) return propXP;
        const now = new Date();
        return calculateDailyXP(
            internalData?.chores || [],
            familyMembers,
            new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
        );
    }, [propXP, internalData?.chores, familyMembers]);

    // ── Ordered list + PDND drag-drop ─────────────────────────────────────────

    const [orderedMembers, setOrderedMembers] = useState<FamilyMember[]>(familyMembers);
    useEffect(() => { setOrderedMembers(familyMembers); }, [familyMembers]);

    const memberColorsById = useMemo(() => buildMemberColorMap(orderedMembers), [orderedMembers]);

    useEffect(() => {
        return monitorForElements({
            onDrop: async ({ source, location }) => {
                if (!location.current.dropTargets.length) return;
                const target = location.current.dropTargets[0];
                const sourceIndex = source.data.index as number | undefined;
                const targetIndex = target.data.index as number | undefined;
                const closestEdge = extractClosestEdge(target.data);
                if (sourceIndex == null || targetIndex == null || closestEdge == null) return;
                if (sourceIndex === targetIndex && closestEdge === 'top') return;

                const reordered = reorderWithEdge({ list: orderedMembers, startIndex: sourceIndex, indexOfTarget: targetIndex, closestEdgeOfTarget: closestEdge, axis: 'vertical' });
                setOrderedMembers(reordered);

                try {
                    await db.transact(reordered.map((m, i) => tx.familyMembers[m.id].update({ order: i })));
                } catch {
                    toast({ title: 'Error saving order', description: 'Could not save the new order. Reverting.', variant: 'destructive' });
                    setOrderedMembers(familyMembers);
                }
            },
        });
    }, [orderedMembers, familyMembers, db, toast]);

    // ── Edit mode state ───────────────────────────────────────────────────────

    const [isCreatingMember, setIsCreatingMember] = useState(false);
    const [isEditingAll, setIsEditingAll] = useState(alwaysEditMode);
    const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);

    const activeMemberId = alwaysEditMode
        ? isCreatingMember ? null : isEditingAll ? 'All' : (editingMember?.id ?? null)
        : selectedMember;
    const needsAllHandleSpacer = alwaysEditMode && currentUser?.role === 'parent';

    const activateMember = useCallback((member: FamilyMember) => {
        setIsCreatingMember(false);
        setIsEditingAll(false);
        setEditingMember(member);
        if (!alwaysEditMode) setSelectedMember(member.id);
    }, [alwaysEditMode, setSelectedMember]);

    const activateAll = useCallback(() => {
        if (!alwaysEditMode) { setSelectedMember('All'); return; }
        setIsCreatingMember(false);
        setIsEditingAll(true);
        setEditingMember(null);
    }, [alwaysEditMode, setSelectedMember]);

    const activateCreate = useCallback(() => {
        if (!alwaysEditMode) return;
        setIsCreatingMember(true);
        setIsEditingAll(false);
        setEditingMember(null);
    }, [alwaysEditMode]);

    const handleMemberSaved = useCallback((updated: FamilyMember) => {
        setOrderedMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        setEditingMember(updated);
    }, []);

    const handleMemberDeleted = useCallback((deletedId: string) => {
        setOrderedMembers((prev) => prev.filter((m) => m.id !== deletedId));
        if (selectedMember === deletedId) setSelectedMember('All');
        setEditingMember(null);
        if (alwaysEditMode) setIsEditingAll(true);
    }, [alwaysEditMode, selectedMember, setSelectedMember]);

    const handleDeleteFromList = useCallback(async (memberId: string) => {
        const member = orderedMembers.find((m) => m.id === memberId);
        const newList = orderedMembers.filter((m) => m.id !== memberId);
        const txns = [
            ...newList.map((m, i) => tx.familyMembers[m.id].update({ order: i })),
            tx.familyMembers[memberId].delete(),
        ];
        try {
            await db.transact(txns);
            toast({ title: 'Member deleted', description: `${member?.name ?? 'Member'} removed.` });
            if (selectedMember === memberId) setSelectedMember('All');
            if (editingMember?.id === memberId) {
                setEditingMember(null);
                if (alwaysEditMode) setIsEditingAll(true);
            }
        } catch {
            toast({ title: 'Delete failed', description: 'Could not delete the family member.', variant: 'destructive' });
        }
    }, [alwaysEditMode, db, editingMember?.id, orderedMembers, selectedMember, setSelectedMember, toast]);

    const isChildSelfEdit = currentUser?.role === 'child' && currentUser?.id === editingMember?.id;
    const canDelete = currentUser?.role === 'parent' && !!editingMember;
    const familyPhotoSetting = (familyPhotoData?.settings?.[0] as { id?: string; value?: string | null } | undefined) ?? null;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className={alwaysEditMode ? 'w-full grid gap-6 md:grid-cols-[minmax(280px,360px)_minmax(420px,1fr)]' : 'w-full h-full min-h-0 flex flex-col'}>

            {/* ── Left: member list ──────────────────────────────────────── */}
            <div className="w-full h-full min-h-0 flex flex-col">
                <div className="mb-4">
                    <h2 className="text-xl font-bold">Family Members</h2>
                </div>

                <ScrollArea className="flex-grow min-h-0">
                    <div className="pr-2 pb-1">
                        {/* All row */}
                        <div className="flex items-center mb-2">
                            {needsAllHandleSpacer && <div className="h-10 w-10 shrink-0" aria-hidden />}
                            <Button
                                variant={activeMemberId === 'All' ? 'default' : 'ghost'}
                                className="w-full justify-start h-auto py-2"
                                onClick={activateAll}
                            >
                                <div className="flex items-center gap-3 min-w-0 w-full">
                                    <Avatar className="h-10 w-10 flex-shrink-0">
                                        {getPhotoUrl(familyPhotoUrls, '64') ? (
                                            <AvatarImage src={getPhotoUrl(familyPhotoUrls, '64')!} alt="All family members" />
                                        ) : (
                                            <AvatarFallback>All</AvatarFallback>
                                        )}
                                    </Avatar>
                                    <span className="font-medium truncate">All</span>
                                </div>
                            </Button>
                        </div>

                        {/* Member rows */}
                        {orderedMembers.map((member, index) => (
                            <SortableFamilyMemberItem
                                key={member.id}
                                member={member}
                                memberColor={memberColorsById[member.id]}
                                index={index}
                                isEditMode={alwaysEditMode}
                                selectedMember={activeMemberId}
                                setSelectedMember={setSelectedMember}
                                showBalances={showBalances}
                                membersBalances={membersBalances}
                                unitDefinitions={unitDefinitions}
                                onMemberActivate={activateMember}
                                handleDeleteMember={handleDeleteFromList}
                                currentUser={currentUser}
                                xpData={membersXP?.[member.id]}
                                alwaysEditMode={alwaysEditMode}
                            />
                        ))}
                    </div>
                </ScrollArea>

                {alwaysEditMode && (
                    <Button className="w-full mt-4" onClick={activateCreate}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Family Member
                    </Button>
                )}
                {!alwaysEditMode && (
                    <Button asChild variant="outline" className="w-full mt-4">
                        <Link href="/settings#family-member-settings">Family Member Settings</Link>
                    </Button>
                )}
            </div>

            {/* ── Right: edit panel (settings mode only) ────────────────── */}
            {alwaysEditMode && (
                <div className="border rounded-xl bg-card p-4 md:p-6 min-h-[320px]">
                    {isCreatingMember ? (
                        <MemberCreatePanel
                            existingMembers={orderedMembers}
                            db={db}
                            onCreated={() => { setIsCreatingMember(false); setIsEditingAll(true); }}
                        />
                    ) : isEditingAll ? (
                        <FamilyPhotoPanel
                            db={db}
                            currentPhotoUrls={familyPhotoUrls}
                            existingSetting={familyPhotoSetting}
                        />
                    ) : editingMember ? (
                        <MemberEditPanel
                            member={editingMember}
                            allMembers={orderedMembers}
                            isChildSelfEdit={isChildSelfEdit}
                            canDelete={canDelete}
                            db={db}
                            onSaved={handleMemberSaved}
                            onDeleted={handleMemberDeleted}
                        />
                    ) : (
                        <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-muted-foreground">
                            Select a family member to edit their profile and permissions.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default FamilyMembersList;
