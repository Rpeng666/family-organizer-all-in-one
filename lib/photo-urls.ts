export interface PhotoUrls {
    '64'?: string;
    '320'?: string;
    '1200'?: string;
}

type PhotoSize = '64' | '320' | '1200';

const SIZE_FALLBACKS: Record<PhotoSize, PhotoSize[]> = {
    '64': ['64', '320', '1200'],
    '320': ['320', '1200', '64'],
    '1200': ['1200', '320', '64'],
};

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
}

export function getPhotoKey(photoUrls: PhotoUrls | null | undefined, preferredSize: PhotoSize = '64'): string | null {
    if (!photoUrls) return null;

    const values = photoUrls as Record<string, unknown>;
    for (const size of SIZE_FALLBACKS[preferredSize]) {
        const key = asString(values[size]);
        if (key) return key;
    }

    return null;
}

export function getPhotoUrl(photoUrls: PhotoUrls | null | undefined, preferredSize: PhotoSize = '64'): string | undefined {
    const key = getPhotoKey(photoUrls, preferredSize);
    if (!key) return undefined;
    return `/files/${encodeURIComponent(key)}`;
}

export function getPhotoKeys(photoUrls: PhotoUrls | null | undefined): string[] {
    const keys = new Set<string>();
    (['64', '320', '1200'] as const).forEach((size) => {
        const value = photoUrls?.[size];
        if (typeof value === 'string' && value.trim()) {
            keys.add(value);
        }
    });
    return Array.from(keys);
}
