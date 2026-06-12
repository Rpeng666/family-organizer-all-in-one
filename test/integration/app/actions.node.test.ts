import { beforeEach, describe, expect, it, vi } from 'vitest';

const actionMocks = vi.hoisted(() => ({
    cookies: vi.fn(),
    revalidatePath: vi.fn(),
    S3Client: vi.fn(),
    ListObjectsV2Command: vi.fn(),
    createPresignedPost: vi.fn(),
}));

vi.mock('next/headers', () => ({
    cookies: actionMocks.cookies,
}));

vi.mock('next/cache', () => ({
    revalidatePath: actionMocks.revalidatePath,
}));

vi.mock('@aws-sdk/client-s3', () => ({
    S3Client: actionMocks.S3Client,
    ListObjectsV2Command: actionMocks.ListObjectsV2Command,
}));

vi.mock('@aws-sdk/s3-presigned-post', () => ({
    createPresignedPost: actionMocks.createPresignedPost,
}));

describe('app/actions server auth + file actions', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();

        process.env.S3_ENDPOINT = 'https://internal-s3.example.test';
        process.env.NEXT_PUBLIC_S3_ENDPOINT = 'https://public-s3.example.test';
        process.env.S3_ACCESS_KEY_ID = 'akid';
        process.env.S3_SECRET_ACCESS_KEY = 'secret';
        process.env.S3_BUCKET_NAME = 'family-files';

        actionMocks.S3Client.mockImplementation(function MockS3Client() {
            (this as any).send = vi.fn().mockResolvedValue({
                Contents: [
                    { Key: 'a.png', LastModified: new Date('2025-01-01T00:00:00Z'), Size: 123 },
                    { Key: 'b.png', LastModified: new Date('2025-01-02T00:00:00Z'), Size: 456 },
                ],
            });
        });
        actionMocks.ListObjectsV2Command.mockImplementation(function MockListObjectsV2Command(input) {
            (this as any).input = input;
        });
        actionMocks.createPresignedPost.mockResolvedValue({
            url: 'https://public-s3.example.test/family-files',
            fields: { key: 'abc-file.png', policy: 'x' },
        });
    });

    function setDeviceCookie(value: string | undefined) {
        actionMocks.cookies.mockResolvedValue({
            get: (name: string) => {
                if (name !== 'family_device_auth' || value === undefined) return undefined;
                return { name, value };
            },
        });
    }

    it('hashPin requires a valid device cookie', async () => {
        setDeviceCookie(undefined);
        const { hashPin } = await import('@/app/actions');

        await expect(hashPin('1234')).rejects.toThrow('Unauthorized device');
    });

    it('hashPin returns sha256 when authorized', async () => {
        setDeviceCookie('true');
        const { hashPin } = await import('@/app/actions');

        await expect(hashPin('1234')).resolves.toBe('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');
    });

    it('getPresignedUploadUrl validates inputs before signing', async () => {
        setDeviceCookie('true');
        const { getPresignedUploadUrl } = await import('@/app/actions');

        await expect(getPresignedUploadUrl('', 'photo.png')).rejects.toThrow('Invalid content type');
        await expect(getPresignedUploadUrl('image/png', '')).rejects.toThrow('Invalid file name');
        expect(actionMocks.createPresignedPost).not.toHaveBeenCalled();
    });

    it('getPresignedUploadUrl requires device auth', async () => {
        setDeviceCookie(undefined);
        const { getPresignedUploadUrl } = await import('@/app/actions');

        await expect(getPresignedUploadUrl('image/png', 'photo.png')).rejects.toThrow('Unauthorized device');
    });

    it('getPresignedUploadUrl returns signed upload data for authorized devices', async () => {
        setDeviceCookie('true');
        const { getPresignedUploadUrl } = await import('@/app/actions');

        const result = await getPresignedUploadUrl('image/png', 'photo.png');

        expect(result.url).toBe('https://public-s3.example.test/family-files');
        expect(result.fields).toEqual({ key: 'abc-file.png', policy: 'x' });
        expect(typeof result.key).toBe('string');
        expect(actionMocks.createPresignedPost).toHaveBeenCalled();
        expect(actionMocks.createPresignedPost).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                Bucket: 'family-files',
                Conditions: expect.arrayContaining([
                    ['content-length-range', 0, 10485760],
                    ['starts-with', '$Content-Type', 'image/png'],
                ]),
                Fields: { 'Content-Type': 'image/png' },
            })
        );
    });

    it('getPresignedUploadUrl wraps signer failures with a stable error message', async () => {
        setDeviceCookie('true');
        actionMocks.createPresignedPost.mockRejectedValueOnce(new Error('signer exploded'));
        const { getPresignedUploadUrl } = await import('@/app/actions');

        await expect(getPresignedUploadUrl('image/png', 'photo.png')).rejects.toThrow('Failed to generate upload signature');
    });

    it('getFiles requires device auth', async () => {
        setDeviceCookie(undefined);
        const { getFiles } = await import('@/app/actions');

        await expect(getFiles()).rejects.toThrow('Unauthorized device');
    });

    it('getFiles lists server-side file metadata for authorized devices', async () => {
        setDeviceCookie('true');
        const { getFiles } = await import('@/app/actions');

        const result = await getFiles();

        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ key: 'a.png', size: 123 });
        expect(actionMocks.ListObjectsV2Command).toHaveBeenCalledWith({ Bucket: 'family-files' });
    });

    it('refreshFiles revalidates the home route when authorized', async () => {
        setDeviceCookie('true');
        const { refreshFiles } = await import('@/app/actions');

        await refreshFiles();
        expect(actionMocks.revalidatePath).toHaveBeenCalledWith('/');
    });

    it('refreshFiles requires device auth', async () => {
        setDeviceCookie(undefined);
        const { refreshFiles } = await import('@/app/actions');

        await expect(refreshFiles()).rejects.toThrow('Unauthorized device');
        expect(actionMocks.revalidatePath).not.toHaveBeenCalled();
    });
});
