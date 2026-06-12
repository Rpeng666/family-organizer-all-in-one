import 'server-only';

import sharp from 'sharp';
import { encode } from 'blurhash';
import { fileTypeFromBuffer } from 'file-type';
import type { AppAttachment } from '@family-organizer/shared-core';
import { getAttachmentKind } from '@family-organizer/shared-core';
import { getS3ObjectBuffer, getS3ObjectHead } from '@/lib/s3-file-service';

export interface AttachmentFinalizeInput {
    objectKey: string;
    fileName?: string | null;
    contentType?: string | null;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
    thumbnailUrl?: string | null;
    thumbnailWidth?: number | null;
    thumbnailHeight?: number | null;
    blurhash?: string | null;
    waveformPeaks?: number[] | null;
}

export interface FinalizedAttachmentMetadata extends Omit<AppAttachment, 'id'> {
    name: string;
    url: string;
    type: string;
}

function sanitizeWaveformPeaks(peaks?: number[] | null) {
    if (!Array.isArray(peaks)) return null;
    const normalized = peaks
        .map((value) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return null;
            return Math.max(0, Math.min(1, numeric));
        })
        .filter((value): value is number => value !== null);
    return normalized.length > 0 ? normalized : null;
}

function fallbackNameFromKey(key: string) {
    const normalized = String(key || '').trim();
    if (!normalized) return 'Attachment';
    const lastSegment = normalized.split('/').pop() || normalized;
    const doubleDashSegments = lastSegment.split('--');
    return doubleDashSegments[doubleDashSegments.length - 1] || lastSegment;
}

async function buildImageBlurhash(buffer: Buffer) {
    try {
        const { data, info } = await sharp(buffer)
            .rotate()
            .ensureAlpha()
            .resize(32, 32, { fit: 'inside' })
            .raw()
            .toBuffer({ resolveWithObject: true });

        if (!info.width || !info.height) return null;
        return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4);
    } catch (error) {
        console.error('Unable to build blurhash', error);
        return null;
    }
}

export async function finalizeUploadedAttachment(input: AttachmentFinalizeInput): Promise<FinalizedAttachmentMetadata> {
    const key = String(input.objectKey || '').trim();
    if (!key) {
        throw new Error('Missing uploaded object key');
    }

    const [head, buffer] = await Promise.all([getS3ObjectHead(key), getS3ObjectBuffer(key)]);
    const detected = buffer.length > 0 ? await fileTypeFromBuffer(buffer) : null;
    const type =
        String(detected?.mime || head.ContentType || input.contentType || 'application/octet-stream').trim() ||
        'application/octet-stream';

    let width = Number.isFinite(Number(input.width)) ? Number(input.width) : null;
    let height = Number.isFinite(Number(input.height)) ? Number(input.height) : null;
    let blurhash = input.blurhash || null;

    const kind = getAttachmentKind({
        type,
        url: key,
    });

    if (kind === 'image' && buffer.length > 0) {
        try {
            const metadata = await sharp(buffer).rotate().metadata();
            width = width ?? metadata.width ?? null;
            height = height ?? metadata.height ?? null;
            if (!blurhash) {
                blurhash = await buildImageBlurhash(buffer);
            }
        } catch (error) {
            console.error('Unable to inspect uploaded image', error);
        }
    }

    return {
        name: String(input.fileName || '').trim() || fallbackNameFromKey(key),
        url: key,
        type,
        kind,
        sizeBytes: Number.isFinite(Number(head.ContentLength)) ? Number(head.ContentLength) : buffer.length || null,
        width,
        height,
        durationSec: Number.isFinite(Number(input.durationSec)) ? Number(input.durationSec) : null,
        thumbnailUrl: String(input.thumbnailUrl || '').trim() || null,
        thumbnailWidth: Number.isFinite(Number(input.thumbnailWidth)) ? Number(input.thumbnailWidth) : null,
        thumbnailHeight: Number.isFinite(Number(input.thumbnailHeight)) ? Number(input.thumbnailHeight) : null,
        blurhash,
        waveformPeaks: sanitizeWaveformPeaks(input.waveformPeaks),
    };
}
