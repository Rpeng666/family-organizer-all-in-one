import 'server-only';

import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured`);
    }
    return value;
}

function getBucketName(): string {
    return getRequiredEnv('S3_BUCKET_NAME');
}

function getCredentials() {
    return {
        accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
        secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
    };
}

function getS3InternalClient() {
    return new S3Client({
        region: 'us-east-1',
        endpoint: getRequiredEnv('S3_ENDPOINT'),
        credentials: getCredentials(),
        forcePathStyle: true,
    });
}

function getS3SignerClient() {
    return new S3Client({
        region: 'us-east-1',
        endpoint: getRequiredEnv('NEXT_PUBLIC_S3_ENDPOINT'),
        credentials: getCredentials(),
        forcePathStyle: true,
    });
}

export interface ListedS3File {
    key: string;
    lastModified?: Date;
    size: number;
}

export async function listS3Files(): Promise<ListedS3File[]> {
    const client = getS3InternalClient();
    const { Contents } = await client.send(
        new ListObjectsV2Command({
            Bucket: getBucketName(),
        })
    );

    return (Contents || []).map((file) => ({
        key: file.Key || '',
        lastModified: file.LastModified,
        size: file.Size || 0,
    }));
}

type PresignScope = 'task-attachment' | 'file-manager' | 'profile-photo';

function sanitizeFileName(value: string): string {
    return value
        .trim()
        .replace(/[\/\\]+/g, '_')
        .replace(/\s+/g, ' ')
        .slice(0, 180);
}

export async function createMobilePresignedUpload(params: {
    contentType: string;
    fileName: string;
    scope: PresignScope;
}) {
    const contentType = params.contentType.trim();
    const safeFileName = sanitizeFileName(params.fileName);
    if (!contentType || contentType.length > 255) {
        throw new Error('Invalid content type');
    }
    if (!safeFileName) {
        throw new Error('Invalid file name');
    }

    const key = `${params.scope}--${randomUUID()}--${safeFileName}`;
    const signer = getS3SignerClient();
    const { url, fields } = await createPresignedPost(signer, {
        Bucket: getBucketName(),
        Key: key,
        Conditions: [
            ['content-length-range', 0, 10485760],
            ['starts-with', '$Content-Type', contentType],
        ],
        Fields: { 'Content-Type': contentType },
        Expires: 600,
    });

    return {
        uploadUrl: url,
        fields,
        method: 'POST' as const,
        objectKey: key,
        accessUrl: `/api/mobile/files/${encodeURIComponent(key)}`,
    };
}

export async function createSignedDownloadUrlForS3Object(key: string): Promise<string> {
    const signer = getS3SignerClient();
    const command = new GetObjectCommand({
        Bucket: getBucketName(),
        Key: key,
    });
    return getSignedUrl(signer, command, { expiresIn: 3600 });
}

async function toBuffer(body: any): Promise<Buffer> {
    if (!body) return Buffer.alloc(0);
    if (typeof body.transformToByteArray === 'function') {
        return Buffer.from(await body.transformToByteArray());
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export async function getS3ObjectDownload(key: string) {
    const client = getS3InternalClient();
    return client.send(
        new GetObjectCommand({
            Bucket: getBucketName(),
            Key: key,
        })
    );
}

export async function getS3ObjectBuffer(key: string): Promise<Buffer> {
    const response = await getS3ObjectDownload(key);
    return toBuffer(response.Body);
}

export async function getS3ObjectHead(key: string) {
    const client = getS3InternalClient();
    return client.send(
        new HeadObjectCommand({
            Bucket: getBucketName(),
            Key: key,
        })
    );
}
