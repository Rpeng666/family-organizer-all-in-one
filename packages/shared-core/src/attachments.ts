export type AttachmentKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'file';

export interface AppAttachment {
    id: string;
    name?: string | null;
    url?: string | null;
    type?: string | null;
    kind?: AttachmentKind | string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
    thumbnailUrl?: string | null;
    thumbnailWidth?: number | null;
    thumbnailHeight?: number | null;
    blurhash?: string | null;
    waveformPeaks?: number[] | null;
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm', 'ogv', 'mkv']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'flac']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'csv', 'log', 'json']);

function getExtension(value?: string | null) {
    const source = String(value || '').split('?')[0].trim().toLowerCase();
    if (!source.includes('.')) return '';
    return source.slice(source.lastIndexOf('.') + 1);
}

function sanitizeWaveformPeaks(value: unknown): number[] | null {
    if (!Array.isArray(value)) return null;
    const peaks = value
        .map((entry) => {
            const numeric = Number(entry);
            if (!Number.isFinite(numeric)) return null;
            return Math.max(0, Math.min(1, numeric));
        })
        .filter((entry): entry is number => entry !== null);

    return peaks.length > 0 ? peaks : null;
}

export function getAttachmentKind(input?: Pick<AppAttachment, 'type' | 'url' | 'kind'> | null): AttachmentKind {
    const explicitKind = String(input?.kind || '').trim().toLowerCase();
    if (explicitKind === 'image' || explicitKind === 'video' || explicitKind === 'audio' || explicitKind === 'pdf' || explicitKind === 'text' || explicitKind === 'file') {
        return explicitKind;
    }

    const mime = String(input?.type || '').trim().toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('text/')) return 'text';

    const extension = getExtension(input?.url);
    if (IMAGE_EXTENSIONS.has(extension)) return 'image';
    if (VIDEO_EXTENSIONS.has(extension)) return 'video';
    if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
    if (extension === 'pdf') return 'pdf';
    if (TEXT_EXTENSIONS.has(extension)) return 'text';
    return 'file';
}

export function normalizeAttachment<T extends Partial<AppAttachment>>(attachment: T): T & AppAttachment {
    return {
        ...attachment,
        id: String(attachment?.id || ''),
        kind: getAttachmentKind(attachment),
        waveformPeaks: sanitizeWaveformPeaks(attachment?.waveformPeaks),
    };
}

export function isImageAttachment(input?: Pick<AppAttachment, 'type' | 'url' | 'kind'> | null) {
    return getAttachmentKind(input) === 'image';
}

export function isVideoAttachment(input?: Pick<AppAttachment, 'type' | 'url' | 'kind'> | null) {
    return getAttachmentKind(input) === 'video';
}

export function isAudioAttachment(input?: Pick<AppAttachment, 'type' | 'url' | 'kind'> | null) {
    return getAttachmentKind(input) === 'audio';
}

export function isPdfAttachment(input?: Pick<AppAttachment, 'type' | 'url' | 'kind'> | null) {
    return getAttachmentKind(input) === 'pdf';
}

export function isTextAttachment(input?: Pick<AppAttachment, 'type' | 'url' | 'kind'> | null) {
    return getAttachmentKind(input) === 'text';
}

export function isPreviewableAttachment(input?: Pick<AppAttachment, 'type' | 'url' | 'kind'> | null) {
    return getAttachmentKind(input) !== 'file';
}

export function getProtectedAttachmentPath(key?: string | null, basePath = '/files') {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return '';
    return `${basePath}/${normalizedKey}`;
}
