'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Cropper from 'react-easy-crop';
import { useToast } from '@/components/ui/use-toast';
import { tx, id } from '@instantdb/react';
import { deleteS3Objects } from '@/app/actions';
import { getPhotoUrl, getPhotoKeys, type PhotoUrls } from '@/lib/photo-urls';
import { getCroppedImg, uploadAvatarPhotoVariants, readFile } from '@/lib/avatar-upload';

interface FamilyPhotoData { id?: string; value?: string | null }

interface FamilyPhotoPanelProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any;
    currentPhotoUrls: PhotoUrls | null;
    existingSetting: FamilyPhotoData | null;
}

const FAMILY_PHOTO_SETTING = 'familyPhotoUrls';

export function FamilyPhotoPanel({ db, currentPhotoUrls, existingSetting }: FamilyPhotoPanelProps) {
    const { toast } = useToast();
    const [isSaving, setIsSaving] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setImageSrc(await readFile(file));
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
    };

    const savePhotoUrls = async (nextUrls: PhotoUrls | null) => {
        if (existingSetting?.id) {
            if (nextUrls) {
                await db.transact([tx.settings[existingSetting.id].update({ value: JSON.stringify(nextUrls) })]);
            } else {
                await db.transact([tx.settings[existingSetting.id].delete()]);
            }
        } else if (nextUrls) {
            const settingId = id();
            await db.transact([tx.settings[settingId].update({ name: FAMILY_PHOTO_SETTING, value: JSON.stringify(nextUrls) })]);
        }
    };

    const handleUpload = async () => {
        if (!imageSrc || !croppedAreaPixels) return;
        setIsSaving(true);
        try {
            const file = await getCroppedImg(imageSrc, croppedAreaPixels);
            const nextUrls = await uploadAvatarPhotoVariants(file, { scope: 'family-photo' });
            await savePhotoUrls(nextUrls);
            if (currentPhotoUrls) {
                await deleteS3Objects(getPhotoKeys(currentPhotoUrls)).catch(() =>
                    toast({ title: 'Saved with warning', description: 'Family photo saved but old photo cleanup failed.', variant: 'destructive' }),
                );
            }
            toast({ title: 'Family photo updated' });
            setImageSrc(null); setCrop({ x: 0, y: 0 }); setZoom(1); setCroppedAreaPixels(null);
        } catch (err) {
            toast({ title: 'Upload failed', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!currentPhotoUrls) return;
        setIsSaving(true);
        try {
            const keys = getPhotoKeys(currentPhotoUrls);
            await savePhotoUrls(null);
            await deleteS3Objects(keys).catch(() =>
                toast({ title: 'Saved with warning', description: 'Family photo removed but stored photo cleanup failed.', variant: 'destructive' }),
            );
            toast({ title: 'Family photo removed' });
        } catch (err) {
            toast({ title: 'Remove failed', description: (err as Error).message, variant: 'destructive' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="text-xl font-semibold">All Family Avatar</h3>
            <p className="text-sm text-muted-foreground">
                This photo is used for the <strong>All</strong> row avatar in family member lists.
            </p>
            <div className="space-y-4">
                <div className="flex items-center gap-4">
                    <Avatar className="h-20 w-20">
                        {getPhotoUrl(currentPhotoUrls, '320') ? (
                            <AvatarImage src={getPhotoUrl(currentPhotoUrls, '320')!} alt="All family members" />
                        ) : (
                            <AvatarFallback>All</AvatarFallback>
                        )}
                    </Avatar>
                    <Input type="file" accept="image/*" onChange={handleFileChange} disabled={isSaving} className="max-w-sm" />
                </div>

                {imageSrc && (
                    <div className="space-y-2">
                        <div className="relative w-full" style={{ height: 300 }}>
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">Drag to reframe and scroll/pinch to zoom before saving.</p>
                    </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={handleUpload} disabled={isSaving || !imageSrc || !croppedAreaPixels}>
                        {isSaving ? 'Saving…' : 'Save Family Photo'}
                    </Button>
                    <Button variant="outline" onClick={handleRemove} disabled={isSaving || !currentPhotoUrls}>
                        Remove Family Photo
                    </Button>
                </div>
            </div>
        </div>
    );
}
