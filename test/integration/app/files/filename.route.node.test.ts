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

import { GET } from '@/app/files/[filename]/route';

describe('GET /files/[filename]', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env.DEVICE_ACCESS_KEY = 'test-device-key';
        process.env.NEXT_PUBLIC_S3_ENDPOINT = 'https://s3.example.test';
        process.env.S3_ACCESS_KEY_ID = 'akid';
        process.env.S3_SECRET_ACCESS_KEY = 'secret';
        process.env.S3_BUCKET_NAME = 'family-files';

        s3Mocks.S3Client.mockImplementation(function MockS3Client(config) {
            (this as any).__type = 'S3Client';
            (this as any).config = config;
        });
        s3Mocks.GetObjectCommand.mockImplementation(function MockGetObjectCommand(input) {
            (this as any).__type = 'GetObjectCommand';
            (this as any).input = input;
        });
        s3Mocks.getSignedUrl.mockResolvedValue('https://signed.example.test/file.png?sig=1');
    });

    it('rejects unauthorized devices', async () => {
        const response = await GET(new NextRequest('http://localhost:3000/files/photo.png'), {
            params: Promise.resolve({ filename: 'photo.png' }),
        });

        expect(response.status).toBe(401);
        expect(await response.text()).toBe('Unauthorized device');
    });

    it('rejects missing filenames', async () => {
        const response = await GET(
            new NextRequest('http://localhost:3000/files/', {
                headers: { cookie: 'family_device_auth=true' },
            }),
            { params: Promise.resolve({ filename: '' }) }
        );

        expect(response.status).toBe(400);
        expect(await response.text()).toBe('Filename missing');
    });

    it('redirects authorized devices to a signed S3 URL', async () => {
        const response = await GET(
            new NextRequest('http://localhost:3000/files/photo.png', {
                headers: { cookie: 'family_device_auth=true' },
            }),
            { params: Promise.resolve({ filename: 'photo.png' }) }
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://signed.example.test/file.png?sig=1');
        expect(s3Mocks.GetObjectCommand).toHaveBeenCalledWith({
            Bucket: 'family-files',
            Key: 'photo.png',
        });
        expect(s3Mocks.getSignedUrl).toHaveBeenCalled();
    });

    it('redirects when authorized with a mobile bearer device session token', async () => {
        const { issueMobileDeviceSessionToken } = await import('@/lib/device-auth-server');
        const session = issueMobileDeviceSessionToken({ platform: 'ios', deviceName: 'Ava iPhone' });

        const response = await GET(
            new NextRequest('http://localhost:3000/files/photo.png', {
                headers: { authorization: `Bearer ${session.token}` },
            }),
            { params: Promise.resolve({ filename: 'photo.png' }) }
        );

        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://signed.example.test/file.png?sig=1');
    });

    it('returns 404 when signing fails', async () => {
        s3Mocks.getSignedUrl.mockRejectedValue(new Error('signing failed'));

        const response = await GET(
            new NextRequest('http://localhost:3000/files/photo.png', {
                headers: { cookie: 'family_device_auth=true' },
            }),
            { params: Promise.resolve({ filename: 'photo.png' }) }
        );

        expect(response.status).toBe(404);
        expect(await response.text()).toBe('File unavailable');
    });
});
