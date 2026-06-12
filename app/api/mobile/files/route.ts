import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { listS3Files } from '@/lib/s3-file-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        return NextResponse.json({ error: 'Unauthorized device' }, { status: 401 });
    }

    try {
        const files = await listS3Files();
        return NextResponse.json(
            {
                files: files.map((file) => ({
                    key: file.key,
                    size: file.size,
                    lastModified: file.lastModified ? file.lastModified.toISOString() : undefined,
                })),
            },
            { headers: { 'Cache-Control': 'no-store' } }
        );
    } catch (error) {
        console.error('Error listing mobile files', error);
        return NextResponse.json({ error: 'Failed to list files' }, { status: 500 });
    }
}

