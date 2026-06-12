import { getAvatarVariantUploadUrls, deleteS3Objects } from '@/app/actions';
import type { PhotoUrls } from '@/lib/photo-urls';

const AVATAR_UPLOAD_SIZES = ['64', '320', '1200'] as const;
type AvatarUploadSize = (typeof AVATAR_UPLOAD_SIZES)[number];

interface AvatarUploadTarget {
    size: AvatarUploadSize;
    url: string;
    fields: Record<string, string>;
    key: string;
}

interface AvatarUploadApiResponse {
    photoUrls: PhotoUrls;
}

export function readFile(file: File): Promise<string> {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => resolve(reader.result as string));
        reader.readAsDataURL(file);
    });
}

export function loadImageForCanvas(file: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(objectUrl); resolve(image); };
        image.onerror = (error) => { URL.revokeObjectURL(objectUrl); reject(error); };
        image.src = objectUrl;
    });
}

function renderSquarePngVariant(image: HTMLImageElement, size: number): Promise<File> {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Unable to create canvas context')); return; }
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - sourceSize) / 2;
        const sourceY = (image.naturalHeight - sourceSize) / 2;
        ctx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        canvas.toBlob(
            (blob) => {
                if (!blob) { reject(new Error('Failed to render avatar variant')); return; }
                resolve(new File([blob], `avatar-${size}.png`, { type: 'image/png' }));
            },
            'image/png',
            0.95,
        );
    });
}

export function getCroppedImg(
    imageSrc: string,
    pixelCrop: { x: number; y: number; width: number; height: number },
): Promise<File> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = imageSrc;
        image.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxSize = 1200;
            const scale = maxSize / Math.max(pixelCrop.width, pixelCrop.height);
            canvas.width = pixelCrop.width * scale;
            canvas.height = pixelCrop.height * scale;
            ctx!.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
                if (!blob) { reject(new Error('Canvas is empty')); return; }
                resolve(new File([blob], 'cropped_image.png', { type: 'image/png' }));
            }, 'image/png');
        };
        image.onerror = (error) => reject(error);
    });
}

export async function uploadAvatarPhotoVariants(
    sourceFile: File,
    options: { scope: 'profile-photo' | 'family-photo'; memberId?: string },
): Promise<PhotoUrls> {
    const image = await loadImageForCanvas(sourceFile);
    const filesBySize = {} as Record<AvatarUploadSize, File>;
    for (const size of AVATAR_UPLOAD_SIZES) {
        filesBySize[size] = await renderSquarePngVariant(image, Number(size));
    }

    const uploadViaServerApi = async (): Promise<PhotoUrls> => {
        const formData = new FormData();
        formData.append('scope', options.scope);
        if (options.memberId) formData.append('memberId', options.memberId);
        AVATAR_UPLOAD_SIZES.forEach((size) => formData.append(`file${size}`, filesBySize[size]));
        const res = await fetch('/api/avatar-variants', { method: 'POST', body: formData });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(typeof body?.error === 'string' ? body.error : 'Failed to upload avatar via server fallback');
        }
        const payload = (await res.json()) as AvatarUploadApiResponse;
        const urls = payload.photoUrls;
        if (!urls['64'] || !urls['320'] || !urls['1200']) throw new Error('Fallback upload response was missing avatar keys');
        return urls;
    };

    let presigned: { uploads: AvatarUploadTarget[]; photoUrls: PhotoUrls } | null = null;
    const uploadedKeys: string[] = [];

    try {
        presigned = (await getAvatarVariantUploadUrls({
            scope: options.scope,
            memberId: options.memberId ?? null,
        })) as { uploads: AvatarUploadTarget[]; photoUrls: PhotoUrls };

        if (!presigned?.uploads?.length) throw new Error('Failed to generate upload signature');

        for (const upload of presigned.uploads) {
            const variantFile = filesBySize[upload.size];
            if (!variantFile) throw new Error(`Missing ${upload.size}px variant`);
            const formData = new FormData();
            Object.entries(upload.fields ?? {}).forEach(([k, v]) => formData.append(k, v));
            formData.append('file', variantFile);
            const res = await fetch(upload.url, { method: 'POST', body: formData });
            if (res.status >= 400) throw new Error(`Failed to upload ${upload.size}px avatar`);
            uploadedKeys.push(upload.key);
        }
    } catch (error) {
        if (uploadedKeys.length > 0) {
            await deleteS3Objects(uploadedKeys).catch((e) => console.error('Failed to clean up partial avatar upload:', e));
        }
        console.warn('Direct avatar upload failed; retrying via server upload API.', error);
        return uploadViaServerApi();
    }

    const photoUrls: PhotoUrls = presigned!.photoUrls;
    if (!photoUrls['64'] || !photoUrls['320'] || !photoUrls['1200']) throw new Error('Upload response was missing avatar keys');
    return photoUrls;
}
