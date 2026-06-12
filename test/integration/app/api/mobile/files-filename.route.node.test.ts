import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const s3Mocks = vi.hoisted(() => ({
    S3Client: vi.fn(),
    GetObjectCommand: vi.fn(),
    getSignedUrl: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: s3Mocks.S3Client,
    GetObjectCommand: s3Mocks.GetObjectCommand,
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: s3Mocks.getSignedUrl,
}));

import { GET } from '@/app/api/mobile/files/[filename]/route';

describe('GET /api/mobile/files/[filename]', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env.DEVICE_ACCESS_KEY = 'test-device-key';
        process.env.NEXT_PUBLIC_S3_ENDPOINT = 'https://s3.example.test';
        process.env.S3_ENDPOINT = 'https://s3-internal.example.test';
        process.env.S3_ACCESS_KEY_ID = 'akid';
        process.env.S3_SECRET_ACCESS_KEY = 'secret';
        process.env.S3_BUCKET_NAME = 'family-files';

        s3Mocks.S3Client.mockImplementation(function MockS3Client(this: any, config: any) {
            this.__type = 'S3Client';
            this.config = config;
        });
        s3Mocks.GetObjectCommand.mockImplementation(function MockGetObjectCommand(this: any, input: any) {
            this.__type = 'GetObjectCommand';
            this.input = input;
        });
        s3Mocks.getSignedUrl.mockResolvedValue('https://signed.example.test/photo.png?sig=abc');
    });

    it('returns 401 for unauthenticated requests', async () => {
        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/files/photo.png'),
            { params: Promise.resolve({ filename: 'photo.png' }) }
        );

        expect(response.status).toBe(401);
        const body = await response.json();
        expect(body.error).toBe('Unauthorized device');
    });

    it('returns JSON with presigned URL for authenticated requests', async () => {
        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/files/photo.png', {
                headers: { cookie: 'family_device_auth=true' },
            }),
            { params: Promise.resolve({ filename: 'photo.png' }) }
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual({ url: 'https://signed.example.test/photo.png?sig=abc' });
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('accepts bearer token authentication', async () => {
        const { issueMobileDeviceSessionToken } = await import('@/lib/device-auth-server');
        const session = issueMobileDeviceSessionToken({ platform: 'android' });

        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/files/doc.pdf', {
                headers: { authorization: `Bearer ${session.token}` },
            }),
            { params: Promise.resolve({ filename: 'doc.pdf' }) }
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.url).toBe('https://signed.example.test/photo.png?sig=abc');
    });

    it('returns 404 when S3 signing fails', async () => {
        s3Mocks.getSignedUrl.mockRejectedValue(new Error('NoSuchKey'));

        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/files/missing.png', {
                headers: { cookie: 'family_device_auth=true' },
            }),
            { params: Promise.resolve({ filename: 'missing.png' }) }
        );

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.error).toBe('File unavailable');
    });

    it('returns 400 when filename is empty', async () => {
        const response = await GET(
            new NextRequest('http://localhost:3000/api/mobile/files/', {
                headers: { cookie: 'family_device_auth=true' },
            }),
            { params: Promise.resolve({ filename: '' }) }
        );

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.error).toBe('Filename missing');
    });
});
