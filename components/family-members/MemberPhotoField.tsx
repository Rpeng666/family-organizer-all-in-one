'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import Cropper from 'react-easy-crop';
import { getPhotoUrl, type PhotoUrls } from '@/lib/photo-urls';
import { readFile } from '@/lib/avatar-upload';

interface MemberPhotoFieldProps {
    /** ID used for the file input label. */
    inputId: string;
    /** Currently active cropper image source (data URL). Null = no image selected. */
    imageSrc: string | null;
    crop: { x: number; y: number };
    zoom: number;
    /** Existing photo for the "current photo" preview when no new file is chosen. */
    existingPhotoUrls?: PhotoUrls | null;
    memberName?: string;
    onImageSrcChange: (src: string | null) => void;
    onCropChange: (crop: { x: number; y: number }) => void;
    onZoomChange: (zoom: number) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onCropComplete: (croppedArea: any, croppedAreaPixels: any) => void;
}

export function MemberPhotoField({
    inputId, imageSrc, crop, zoom, existingPhotoUrls, memberName = '',
    onImageSrcChange, onCropChange, onZoomChange, onCropComplete,
}: MemberPhotoFieldProps) {
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        onImageSrcChange(await readFile(file));
        onCropChange({ x: 0, y: 0 });
        onZoomChange(1);
    };

    return (
        <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor={inputId} className="text-right pt-2">Photo</Label>
            <div className="col-span-3 space-y-3">
                <Input id={inputId} type="file" accept="image/*" onChange={handleFileChange} />
                {imageSrc && (
                    <>
                        <div className="relative w-full" style={{ height: 300 }}>
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={1}
                                cropShape="round"
                                showGrid={false}
                                onCropChange={onCropChange}
                                onZoomChange={onZoomChange}
                                onCropComplete={onCropComplete}
                            />
                        </div>
                        <p className="text-xs text-muted-foreground">Drag to reframe and scroll/pinch to zoom before saving.</p>
                    </>
                )}
                {!imageSrc && existingPhotoUrls && (
                    <Avatar className="h-16 w-16">
                        <AvatarImage src={getPhotoUrl(existingPhotoUrls, '320')} alt={memberName} className="object-cover" />
                        <AvatarFallback className="text-lg">{memberName.charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                )}
            </div>
        </div>
    );
}
