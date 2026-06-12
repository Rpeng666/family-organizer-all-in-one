// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fileManagerMocks = vi.hoisted(() => ({
    getPresignedUploadUrl: vi.fn(),
    refreshFiles: vi.fn(),
}));

vi.mock('@/app/actions', () => ({
    getPresignedUploadUrl: fileManagerMocks.getPresignedUploadUrl,
    refreshFiles: fileManagerMocks.refreshFiles,
}));

import FileManager from '@/components/FileManager';

describe('FileManager', () => {
    beforeEach(() => {
        fileManagerMocks.getPresignedUploadUrl.mockReset();
        fileManagerMocks.refreshFiles.mockReset();
        fileManagerMocks.refreshFiles.mockResolvedValue(undefined);

        vi.stubGlobal('fetch', vi.fn());
        vi.stubGlobal('alert', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('uploads a file via presigned POST and refreshes the file list on success', async () => {
        fileManagerMocks.getPresignedUploadUrl.mockResolvedValue({
            url: 'https://uploads.example.test',
            fields: {
                key: 'abc-photo.png',
                policy: 'signed-policy',
            },
        });
        vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);

        const user = userEvent.setup();
        const { container } = render(<FileManager initialFiles={[]} />);

        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        const form = container.querySelector('form') as HTMLFormElement;
        expect(input).toBeTruthy();
        expect(form).toBeTruthy();

        const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
        await user.upload(input, file);
        expect(input.files?.[0]).toBe(file);
        fireEvent.submit(form);

        await waitFor(() => {
            expect(fileManagerMocks.getPresignedUploadUrl).toHaveBeenCalledWith('image/png', 'photo.png');
        });

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                'https://uploads.example.test',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData),
                })
            );
        });

        const [, requestInit] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
        const body = requestInit.body as FormData;
        expect(body.get('key')).toBe('abc-photo.png');
        expect(body.get('policy')).toBe('signed-policy');
        expect(body.get('file')).toBe(file);

        await waitFor(() => {
            expect(fileManagerMocks.refreshFiles).toHaveBeenCalledTimes(1);
        });

        expect(alert).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /start upload/i })).toBeEnabled();
        });
    });

    it('shows an alert and does not refresh files when upload POST fails', async () => {
        fileManagerMocks.getPresignedUploadUrl.mockResolvedValue({
            url: 'https://uploads.example.test',
            fields: { key: 'abc-notes.txt' },
        });
        vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response);

        const user = userEvent.setup();
        const { container } = render(<FileManager initialFiles={[]} />);
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        const form = container.querySelector('form') as HTMLFormElement;

        await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }));
        expect(input.files?.length).toBe(1);
        fireEvent.submit(form);

        await waitFor(() => {
            expect(alert).toHaveBeenCalledWith('Upload failed.');
        });
        expect(fileManagerMocks.refreshFiles).not.toHaveBeenCalled();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: /start upload/i })).toBeEnabled();
        });
    });

    it('opens image previews in the modal viewer and uses protected file URLs', async () => {
        const user = userEvent.setup();
        render(
            <FileManager
                initialFiles={[
                    { key: 'photo.jpg', size: 12, lastModified: new Date('2026-01-01T00:00:00Z') },
                    { key: 'notes.pdf', size: 22, lastModified: new Date('2026-01-02T00:00:00Z') },
                ]}
            />
        );

        expect(screen.getByRole('heading', { name: /files \(2\)/i })).toBeInTheDocument();
        expect(screen.getByAltText('photo.jpg')).toHaveAttribute('src', '/files/photo.jpg');
        expect(screen.queryByRole('link', { name: /download file/i })).not.toBeInTheDocument();

        await user.click(screen.getByAltText('photo.jpg'));

        const photoImages = screen.getAllByAltText('photo.jpg');
        expect(photoImages).toHaveLength(2);
        expect(photoImages[1]).toHaveAttribute('src', '/files/photo.jpg');
    });

    it('opens non-image files in the modal with a download link', async () => {
        const user = userEvent.setup();
        render(
            <FileManager
                initialFiles={[{ key: 'notes.pdf', size: 22, lastModified: new Date('2026-01-02T00:00:00Z') }]}
            />
        );

        await user.click(screen.getByText('notes.pdf'));

        const downloadLink = screen.getByRole('link', { name: /download file/i });
        expect(downloadLink).toHaveAttribute('href', '/files/notes.pdf');
        expect(downloadLink).toHaveAttribute('target', '_blank');
    });
});
