import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { createS3FileResponse } from '@/lib/s3-file-response';

export const dynamic = 'force-dynamic';

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
        return await createS3FileResponse(filename);
    } catch (error) {
        console.error('Error streaming mobile file:', error);
        return NextResponse.json({ error: 'File unavailable' }, { status: 404 });
    }
}
