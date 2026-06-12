'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { tx } from '@instantdb/react';
import { hashPin, deleteS3Objects } from '@/app/actions';
import { MEMBER_COLOR_SWATCHES, findSimilarMemberColors } from '@/lib/family-member-colors';
import { getPhotoUrl, getPhotoKeys, type PhotoUrls } from '@/lib/photo-urls';
import { getCroppedImg, uploadAvatarPhotoVariants } from '@/lib/avatar-upload';
import { MemberColorField } from '@/components/family-members/MemberColorField';
import { MemberPhotoField } from '@/components/family-members/MemberPhotoField';

interface FamilyMember {
    id: string;
    name: string;
    email?: string | null;
    role?: string | null;
    color?: string | null;
    photoUrls?: PhotoUrls | null;
}

interface MemberEditPanelProps {
    member: FamilyMember;
    allMembers: FamilyMember[];
    isChildSelfEdit: boolean;
    canDelete: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
    onSaved?: (updated: FamilyMember) => void;
    onDeleted?: (memberId: string) => void;
}

function formatColorWarning(matches: ReturnType<typeof findSimilarMemberColors>): string | null {
    const names = matches.map((m) => m.memberName);
    if (names.length === 0) return null;
    if (names.length === 1) return `This color is very close to ${names[0]}'s and may be hard to distinguish.`;
    if (names.length === 2) return `This color is very close to ${names[0]} and ${names[1]}'s.`;
    return `This color is very close to ${names[0]}, ${names[1]}, and ${names.length - 2} more.`;
}

export function MemberEditPanel({ member, allMembers, isChildSelfEdit, canDelete, db, onSaved, onDeleted }: MemberEditPanelProps) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

    const [name, setName] = useState(member.name);
    const [email, setEmail] = useState(member.email ?? '');
    const [role, setRole] = useState(member.role ?? 'child');
    const [pin, setPin] = useState('');
    const [color, setColor] = useState(member.color ?? MEMBER_COLOR_SWATCHES[0].value);
    const [imageSrc, setImageSrc] = useState<string | null>(getPhotoUrl(member.photoUrls, '1200') ?? null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
    const [removePhoto, setRemovePhoto] = useState(false);

    useEffect(() => {
        setName(member.name);
        setEmail(member.email ?? '');
        setRole(member.role ?? 'child');
        setPin('');
        setColor(member.color ?? MEMBER_COLOR_SWATCHES[0].value);
        setImageSrc(getPhotoUrl(member.photoUrls, '1200') ?? null);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
        setRemovePhoto(false);
    }, [member.id]);

    const colorComparisons = useMemo(
        () => allMembers.filter((m) => m.id !== member.id).map((m) => ({ id: m.id, name: m.name, color: m.color ?? undefined })),
        [allMembers, member.id],
    );
    const colorWarning = useMemo(
        () => formatColorWarning(findSimilarMemberColors(color, colorComparisons)),
        [color, colorComparisons],
    );

    const handleSave = async () => {
        if (!name.trim() || isSaving) return;
        setIsSaving(true);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updates: Record<string, any> = { name: name.trim(), color, email: email.trim() || '', role };
            if (pin.trim()) updates.pinHash = await hashPin(pin.trim());

            const previousPhotoKeys = getPhotoKeys(member.photoUrls);
            let shouldDeleteOldPhoto = false;

            if (removePhoto) {
                updates.photoUrls = null;
                shouldDeleteOldPhoto = previousPhotoKeys.length > 0;
            } else if (imageSrc && croppedAreaPixels && !imageSrc.startsWith('/files/')) {
                try {
                    const file = await getCroppedImg(imageSrc, croppedAreaPixels);
                    updates.photoUrls = await uploadAvatarPhotoVariants(file, { scope: 'profile-photo', memberId: member.id });
                    shouldDeleteOldPhoto = previousPhotoKeys.length > 0;
                } catch (err) {
                    toast({ title: 'Photo upload failed', description: (err as Error).message, variant: 'destructive' });
                    return;
                }
            }

            await db.transact([tx.familyMembers[member.id].update(updates)]);
            toast({ title: 'Member updated' });

            if (shouldDeleteOldPhoto) {
                await deleteS3Objects(previousPhotoKeys).catch(() =>
                    toast({ title: 'Saved with warning', description: 'Member was saved but old photo cleanup failed.', variant: 'destructive' }),
                );
            }

            const updatedPhotoUrls = updates.photoUrls === undefined
                ? (member.photoUrls ?? null)
                : ((updates.photoUrls as PhotoUrls | null) ?? null);
            const updated: FamilyMember = { ...member, name: name.trim(), color, email: email.trim() || '', role, photoUrls: updatedPhotoUrls };
            setPin(''); setCroppedAreaPixels(null); setRemovePhoto(false);
            setImageSrc(getPhotoUrl(updatedPhotoUrls, '1200') ?? null);
            onSaved?.(updated);
        } catch (err) {
            toast({ title: 'Failed to update member', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (isDeleting) return;
        setIsDeleting(true);
        try {
            const photoKeys = getPhotoKeys(member.photoUrls);
            await db.transact([tx.familyMembers[member.id].delete()]);
            toast({ title: 'Member deleted' });
            if (photoKeys.length) {
                await deleteS3Objects(photoKeys).catch(() =>
                    toast({ title: 'Saved with warning', description: 'Member removed but photo cleanup failed.', variant: 'destructive' }),
                );
            }
            setIsDeleteDialogOpen(false);
            onDeleted?.(member.id);
        } catch (err) {
            toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-semibold">{isChildSelfEdit ? 'Update Profile' : `Edit ${member.name}`}</h3>
            <div className="grid gap-4 py-2">
                {isChildSelfEdit ? (
                    <div className="flex justify-center py-2">
                        <h4 className="text-2xl font-bold">{member.name}</h4>
                    </div>
                ) : (
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="edit-name" className="text-right">Name</Label>
                        <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" />
                    </div>
                )}

                {!isChildSelfEdit && (
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="edit-email" className="text-right">Email (optional)</Label>
                        <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="col-span-3" />
                    </div>
                )}

                {!isChildSelfEdit && (
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label className="text-right">Role</Label>
                        <RadioGroup value={role} onValueChange={setRole} className="col-span-3 flex gap-4">
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="parent" id="edit-role-parent" />
                                <Label htmlFor="edit-role-parent">Parent</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="child" id="edit-role-child" />
                                <Label htmlFor="edit-role-child">Child</Label>
                            </div>
                        </RadioGroup>
                    </div>
                )}

                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="edit-pin" className="text-right">{isChildSelfEdit ? 'New PIN' : 'New PIN'}</Label>
                    <Input
                        id="edit-pin" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                        value={pin} onChange={(e) => setPin(e.target.value)}
                        placeholder={isChildSelfEdit ? 'Enter new PIN to change' : 'Leave blank to keep existing'}
                        className="col-span-3"
                    />
                </div>

                <MemberColorField
                    inputId="edit-color"
                    color={color}
                    onColorChange={setColor}
                    previewName={name || member.name}
                    warningMessage={colorWarning}
                />

                {isChildSelfEdit ? (
                    <div className="flex justify-center mt-2 mb-2">
                        <Avatar className="h-32 w-32">
                            <AvatarImage src={getPhotoUrl(member.photoUrls, '320') ?? undefined} alt={member.name} className="object-cover" />
                            <AvatarFallback className="text-4xl">{member.name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                    </div>
                ) : (
                    <MemberPhotoField
                        inputId="edit-photo"
                        imageSrc={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        existingPhotoUrls={member.photoUrls}
                        memberName={member.name}
                        onImageSrcChange={setImageSrc}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                    />
                )}

                {!isChildSelfEdit && member.photoUrls && (
                    <div className="flex items-center gap-2">
                        <Checkbox id="remove-photo" checked={removePhoto} onCheckedChange={(v) => setRemovePhoto(v === true)} />
                        <Label htmlFor="remove-photo">Remove existing photo</Label>
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-3">
                <div>
                    {canDelete && (
                        <Button
                            variant="destructive"
                            onClick={() => setIsDeleteDialogOpen(true)}
                            disabled={isSaving || isDeleting}
                        >
                            {isDeleting ? 'Deleting…' : 'Delete Member'}
                        </Button>
                    )}
                </div>
                <Button onClick={handleSave} disabled={!name.trim() || isSaving || isDeleting}>
                    {isSaving ? 'Saving…' : 'Save Member'}
                </Button>
            </div>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {member.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This permanently removes this family member and cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? 'Deleting…' : 'Delete Member'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
