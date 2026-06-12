'use client';

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/components/ui/use-toast';
import { tx, id } from '@instantdb/react';
import { hashPin } from '@/app/actions';
import { MEMBER_COLOR_SWATCHES, findSimilarMemberColors, pickRandomMemberColor } from '@/lib/family-member-colors';
import { getPhotoKeys } from '@/lib/photo-urls';
import { deleteS3Objects } from '@/app/actions';
import { getCroppedImg, uploadAvatarPhotoVariants } from '@/lib/avatar-upload';
import { MemberColorField } from '@/components/family-members/MemberColorField';
import { MemberPhotoField } from '@/components/family-members/MemberPhotoField';

interface FamilyMember { id: string; name: string; color?: string | null }

interface MemberCreatePanelProps {
    existingMembers: FamilyMember[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
    onCreated?: () => void;
}

function formatColorWarning(matches: ReturnType<typeof findSimilarMemberColors>): string | null {
    const names = matches.map((m) => m.memberName);
    if (names.length === 0) return null;
    if (names.length === 1) return `This color is very close to ${names[0]}'s and may be hard to distinguish.`;
    if (names.length === 2) return `This color is very close to ${names[0]} and ${names[1]}'s.`;
    return `This color is very close to ${names[0]}, ${names[1]}, and ${names.length - 2} more.`;
}

export function MemberCreatePanel({ existingMembers, db, onCreated }: MemberCreatePanelProps) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('child');
    const [pin, setPin] = useState('');
    const [color, setColor] = useState<string>(() => {
        const colors = existingMembers.map((m) => m.color).filter(Boolean) as string[];
        return pickRandomMemberColor(colors);
    });
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

    const colorComparisons = useMemo(
        () => existingMembers.map((m) => ({ id: m.id, name: m.name, color: m.color ?? undefined })),
        [existingMembers],
    );
    const colorWarning = useMemo(
        () => formatColorWarning(findSimilarMemberColors(color, colorComparisons)),
        [color, colorComparisons],
    );

    const handleSave = async () => {
        if (!name.trim() || isSaving) return;
        setIsSaving(true);
        const memberId = id();
        const savingsEnvelopeId = id();

        let photoUrls = null;
        if (imageSrc && croppedAreaPixels) {
            try {
                const file = await getCroppedImg(imageSrc, croppedAreaPixels);
                photoUrls = await uploadAvatarPhotoVariants(file, { scope: 'profile-photo', memberId });
            } catch (err) {
                toast({ title: 'Photo upload failed', description: (err as Error).message, variant: 'destructive' });
                setIsSaving(false);
                return;
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const memberData: Record<string, any> = {
            name: name.trim(),
            color,
            email: email.trim() || '',
            order: existingMembers.length,
            role,
            lastDisplayCurrency: null,
            allowanceAmount: null,
            allowanceCurrency: null,
            allowanceRrule: null,
            allowanceStartDate: null,
            allowanceConfig: {},
            allowancePayoutDelayDays: 0,
        };
        if (pin.trim()) memberData.pinHash = await hashPin(pin.trim());
        if (photoUrls) memberData.photoUrls = photoUrls;

        try {
            await db.transact([
                tx.familyMembers[memberId].update(memberData),
                tx.allowanceEnvelopes[savingsEnvelopeId].update({
                    name: 'Savings', balances: {}, isDefault: true,
                    goalAmount: null, goalCurrency: null, familyMember: memberId,
                }),
                tx.familyMembers[memberId].link({ allowanceEnvelopes: savingsEnvelopeId }),
            ]);
            toast({ title: 'Family member added' });
            // Reset
            setName(''); setEmail(''); setRole('child'); setPin('');
            setImageSrc(null); setCrop({ x: 0, y: 0 }); setZoom(1); setCroppedAreaPixels(null);
            setColor(pickRandomMemberColor([...existingMembers.map((m) => m.color).filter(Boolean) as string[], color]));
            onCreated?.();
        } catch (err) {
            toast({ title: 'Failed to add member', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-semibold">Add Family Member</h3>
            <div className="grid gap-4 py-2">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="create-name" className="text-right">Name</Label>
                    <Input id="create-name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="create-email" className="text-right">Email (optional)</Label>
                    <Input id="create-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="col-span-3" />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Role</Label>
                    <RadioGroup value={role} onValueChange={setRole} className="col-span-3 flex gap-4">
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="parent" id="create-role-parent" />
                            <Label htmlFor="create-role-parent">Parent</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="child" id="create-role-child" />
                            <Label htmlFor="create-role-child">Child</Label>
                        </div>
                    </RadioGroup>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="create-pin" className="text-right">PIN</Label>
                    <Input
                        id="create-pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                        value={pin} onChange={(e) => setPin(e.target.value)}
                        placeholder="4–6 digit code" className="col-span-3"
                    />
                </div>
                <MemberColorField
                    inputId="create-color"
                    color={color}
                    onColorChange={setColor}
                    previewName={name || 'New family member'}
                    warningMessage={colorWarning}
                />
                <MemberPhotoField
                    inputId="create-photo"
                    imageSrc={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    onImageSrcChange={setImageSrc}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                />
            </div>
            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
                    {isSaving ? 'Adding…' : 'Add Member'}
                </Button>
            </div>
        </div>
    );
}
