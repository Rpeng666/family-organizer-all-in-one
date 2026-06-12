'use server';

import { S3Client, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { randomUUID, createHash } from 'crypto';
import { DEVICE_AUTH_COOKIE_NAME, hasValidDeviceAuthCookie } from '@/lib/device-auth';
import { finalizeUploadedAttachment, type AttachmentFinalizeInput } from '@/lib/attachment-finalizer';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const AVATAR_SIZES = ['64', '320', '1200'] as const;
type AvatarSize = (typeof AVATAR_SIZES)[number];

type AvatarUploadScope = 'profile-photo' | 'family-photo';

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured`);
    }
    return value;
}

async function requireDeviceAuth() {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(DEVICE_AUTH_COOKIE_NAME)?.value;
    if (!hasValidDeviceAuthCookie(cookieValue)) {
        throw new Error('Unauthorized device');
    }
}

function getS3Clients() {
    const s3Endpoint = getRequiredEnv('S3_ENDPOINT');
    const publicEndpoint = getRequiredEnv('NEXT_PUBLIC_S3_ENDPOINT');
    const accessKeyId = getRequiredEnv('S3_ACCESS_KEY_ID');
    const secretAccessKey = getRequiredEnv('S3_SECRET_ACCESS_KEY');
    const bucketName = getRequiredEnv('S3_BUCKET_NAME');

    const s3Internal = new S3Client({
        region: 'us-east-1',
        endpoint: s3Endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
    });

    const s3Signer = new S3Client({
        region: 'us-east-1',
        endpoint: publicEndpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
    });

    return { s3Internal, s3Signer, bucketName };
}

function sanitizePathSegment(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

async function createPresignedPostForKey(input: { key: string; contentType: string }) {
    const contentType = input.contentType.trim();
    if (!contentType || contentType.length > 255) {
        throw new Error('Invalid content type');
    }

    const { s3Signer, bucketName } = getS3Clients();
    const { url, fields } = await createPresignedPost(s3Signer, {
        Bucket: bucketName,
        Key: input.key,
        Conditions: [
            ['content-length-range', 0, MAX_UPLOAD_SIZE_BYTES],
            ['eq', '$Content-Type', contentType],
        ],
        Fields: { 'Content-Type': contentType },
        Expires: 600,
    });

    return { url, fields, key: input.key };
}

export interface S3File {
    key: string;
    lastModified: Date;
    size: number;
}

// 1. Get List of Files (SIMPLIFIED)
export async function getFiles(): Promise<S3File[]> {
    await requireDeviceAuth();

    try {
        const { s3Internal, bucketName } = getS3Clients();
        // Use s3Internal because this happens strictly on the server
        const { Contents } = await s3Internal.send(
            new ListObjectsV2Command({
                Bucket: bucketName,
            })
        );

        if (!Contents) return [];

        // No signing needed! We just return the metadata.
        // The frontend will construct the URL itself.
        return Contents.map((file) => ({
            key: file.Key!,
            lastModified: file.LastModified!,
            size: file.Size!,
        }));
    } catch (error) {
        console.error('Error fetching files:', error);
        return [];
    }
}

// 2. Generate Upload Signature (UNCHANGED)
// We still want direct uploads for performance.
export async function getPresignedUploadUrl(contentType: string, fileName: string) {
    await requireDeviceAuth();

    if (!contentType || contentType.length > 255) {
        throw new Error('Invalid content type');
    }
    if (!fileName || fileName.length > 255) {
        throw new Error('Invalid file name');
    }

    const Key = `${randomUUID()}-${fileName}`;

    try {
        const { s3Signer, bucketName } = getS3Clients();
        // Use s3Signer so the URL points to the public endpoint, not the internal one
        const { url, fields } = await createPresignedPost(s3Signer, {
            Bucket: bucketName,
            Key,
            Conditions: [
                ['content-length-range', 0, MAX_UPLOAD_SIZE_BYTES],
                ['starts-with', '$Content-Type', contentType],
            ],
            Fields: { 'Content-Type': contentType },
            Expires: 600,
        });

        return { url, fields, key: Key };
    } catch (error) {
        console.error('Error creating presigned URL:', error);
        throw new Error('Failed to generate upload signature');
    }
}

export async function finalizeUploadedAttachmentAction(input: AttachmentFinalizeInput) {
    await requireDeviceAuth();
    return finalizeUploadedAttachment(input);
}

export async function getAvatarVariantUploadUrls(input: { scope: AvatarUploadScope; memberId?: string | null }) {
    await requireDeviceAuth();

    const scope = input.scope;
    if (scope !== 'profile-photo' && scope !== 'family-photo') {
        throw new Error('Invalid scope');
    }

    const version = randomUUID();
    const basePath =
        scope === 'profile-photo'
            ? (() => {
                  const normalizedMemberId = sanitizePathSegment(input.memberId || '');
                  if (!normalizedMemberId) {
                      throw new Error('Invalid member id');
                  }
                  return `profile-photo/member-${normalizedMemberId}/${version}`;
              })()
            : `family-photo/all/${version}`;

    const uploads = await Promise.all(
        AVATAR_SIZES.map(async (size) => {
            const presigned = await createPresignedPostForKey({
                key: `${basePath}/${size}.png`,
                contentType: 'image/png',
            });
            return {
                size,
                url: presigned.url,
                fields: presigned.fields,
                key: presigned.key,
            };
        })
    );

    const photoUrls = uploads.reduce<Record<AvatarSize, string>>(
        (acc, upload) => {
            acc[upload.size] = upload.key;
            return acc;
        },
        {
            '64': '',
            '320': '',
            '1200': '',
        }
    );

    return { uploads, photoUrls };
}

export async function deleteS3Objects(keys: string[]) {
    await requireDeviceAuth();

    const uniqueKeys = Array.from(
        new Set(
            (Array.isArray(keys) ? keys : [])
                .map((key) => (typeof key === 'string' ? key.trim() : ''))
                .filter((key) => key.length > 0 && key.length <= 1024)
        )
    );

    if (uniqueKeys.length === 0) {
        return { deleted: 0 };
    }

    const { s3Internal, bucketName } = getS3Clients();
    try {
        let deleted = 0;
        for (let start = 0; start < uniqueKeys.length; start += 1000) {
            const chunk = uniqueKeys.slice(start, start + 1000);
            await s3Internal.send(
                new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: {
                        Objects: chunk.map((Key) => ({ Key })),
                        Quiet: true,
                    },
                })
            );
            deleted += chunk.length;
        }
        return { deleted };
    } catch (error) {
        console.error('Error deleting S3 objects:', error);
        throw new Error('Failed to delete files');
    }
}

export async function refreshFiles() {
    await requireDeviceAuth();
    revalidatePath('/');
}

// 3. Auth Helper (Server Side)
// Replaces client-side crypto.subtle to allow login over HTTP (non-secure context)
export async function hashPin(pin: string): Promise<string> {
    await requireDeviceAuth();
    return createHash('sha256').update(pin).digest('hex');
}
