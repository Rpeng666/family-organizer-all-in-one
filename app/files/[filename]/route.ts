import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { createSignedDownloadUrlForS3Object } from '@/lib/s3-file-service';

export const dynamic = 'force-dynamic';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        return new NextResponse('Unauthorized device', { status: 401 });
    }

    const { filename } = await params;
    if (!filename) {
        return new NextResponse('Filename missing', { status: 400 });
    }

    try {
        const signedUrl = await createSignedDownloadUrlForS3Object(filename);
        return NextResponse.redirect(signedUrl, 307);
    } catch (error) {
        console.error('Error signing file URL:', error);
        return new NextResponse('File unavailable', { status: 404 });
    }
}
