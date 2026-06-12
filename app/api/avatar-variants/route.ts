import { NextRequest, NextResponse } from 'next/server';
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const AVATAR_SIZES = ['64', '320', '1200'] as const;

type AvatarSize = (typeof AVATAR_SIZES)[number];
type AvatarUploadScope = 'profile-photo' | 'family-photo';

export const dynamic = 'force-dynamic';

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured`);
    }
    return value;
}

function getS3InternalClient() {
    return new S3Client({
        region: 'us-east-1',
        endpoint: getRequiredEnv('S3_ENDPOINT'),
        credentials: {
            accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
            secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
        },
        forcePathStyle: true,
    });
}

function sanitizePathSegment(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function buildBasePath(scope: AvatarUploadScope, memberId: string | null): string {
    const version = randomUUID();
    if (scope === 'family-photo') {
        return `family-photo/all/${version}`;
    }

    const normalizedMemberId = sanitizePathSegment(memberId || '');
    if (!normalizedMemberId) {
        throw new Error('Invalid member id');
    }
    return `profile-photo/member-${normalizedMemberId}/${version}`;
}

function toPhotoUrls(basePath: string): Record<AvatarSize, string> {
    return {
        '64': `${basePath}/64.png`,
        '320': `${basePath}/320.png`,
        '1200': `${basePath}/1200.png`,
    };
}

function getAvatarFile(formData: FormData, size: AvatarSize): File {
    const value = formData.get(`file${size}`);
    if (!(value instanceof File)) {
        throw new Error(`Missing ${size}px avatar file`);
    }
    if (value.type !== 'image/png') {
        throw new Error(`${size}px avatar must be image/png`);
    }
    if (value.size <= 0 || value.size > MAX_UPLOAD_SIZE_BYTES) {
        throw new Error(`${size}px avatar exceeds upload limits`);
    }
    return value;
}

export async function POST(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        const reason = 'reason' in deviceAuth ? deviceAuth.reason : 'unknown';
        return NextResponse.json({ error: 'Unauthorized device', reason }, { status: 401 });
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 });
    }

    const scope = formData.get('scope');
    if (scope !== 'profile-photo' && scope !== 'family-photo') {
        return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }
    const memberId = typeof formData.get('memberId') === 'string' ? (formData.get('memberId') as string) : null;

    let basePath: string;
    try {
        basePath = buildBasePath(scope, memberId);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid avatar upload payload';
        return NextResponse.json({ error: message }, { status: 400 });
    }

    const bucketName = getRequiredEnv('S3_BUCKET_NAME');
    const s3Client = getS3InternalClient();
    const photoUrls = toPhotoUrls(basePath);
    const uploadedKeys: string[] = [];

    try {
        for (const size of AVATAR_SIZES) {
            const file = getAvatarFile(formData, size);
            const key = photoUrls[size];
            const body = Buffer.from(await file.arrayBuffer());

            await s3Client.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: key,
                    Body: body,
                    ContentType: 'image/png',
                })
            );
            uploadedKeys.push(key);
        }

        return NextResponse.json(
            {
                photoUrls,
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        if (uploadedKeys.length > 0) {
            try {
                await s3Client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucketName,
                        Delete: {
                            Objects: uploadedKeys.map((Key) => ({ Key })),
                            Quiet: true,
                        },
                    })
                );
            } catch (cleanupError) {
                console.error('Failed to clean up partial avatar uploads', cleanupError);
            }
        }

        const message = error instanceof Error ? error.message : 'Failed to upload avatar files';
        const status = message.startsWith('Missing ') || message.startsWith('Invalid ') || message.includes('must be') || message.includes('limits')
            ? 400
            : 500;
        if (status === 500) {
            console.error('Failed avatar variant upload', error);
        }
        return NextResponse.json({ error: message }, { status });
    }
}
