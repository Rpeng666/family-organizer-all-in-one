import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { createSignedDownloadUrlForS3Object } from '@/lib/s3-file-service';

export const dynamic = 'force-dynamic';

/**
 * Returns a presigned S3 download URL as JSON rather than a 307 redirect.
 * React Native Image components don't reliably follow redirects to presigned
 * S3 URLs, so the mobile app fetches the URL here and uses it directly.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        return NextResponse.json({ error: 'Unauthorized device' }, { status: 401 });
    }

    const { filename } = await params;
    if (!filename) {
        return NextResponse.json({ error: 'Filename missing' }, { status: 400 });
    }

    try {
        const signedUrl = await createSignedDownloadUrlForS3Object(filename);
        return NextResponse.json(
            { url: signedUrl },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Error generating signed URL:', error);
        return NextResponse.json({ error: 'File unavailable' }, { status: 404 });
    }
}
