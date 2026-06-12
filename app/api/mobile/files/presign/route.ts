import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { createMobilePresignedUpload } from '@/lib/s3-file-service';

export const dynamic = 'force-dynamic';

type PresignBody = {
    filename?: string;
    contentType?: string;
    scope?: 'task-attachment' | 'file-manager' | 'profile-photo' | string;
};

const ALLOWED_SCOPES = new Set(['task-attachment', 'file-manager', 'profile-photo']);

export async function POST(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        return NextResponse.json({ error: 'Unauthorized device' }, { status: 401 });
    }

    let body: PresignBody = {};
    try {
        body = (await request.json()) as PresignBody;
    } catch {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const filename = typeof body.filename === 'string' ? body.filename : '';
    const contentType = typeof body.contentType === 'string' ? body.contentType : '';
    const scope = typeof body.scope === 'string' ? body.scope : '';
    if (!ALLOWED_SCOPES.has(scope)) {
        return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
    }

    try {
        const result = await createMobilePresignedUpload({
            fileName: filename,
            contentType,
            scope: scope as 'task-attachment' | 'file-manager' | 'profile-photo',
        });
        return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate upload signature';
        const status = message.startsWith('Invalid ') ? 400 : 500;
        if (status === 500) {
            console.error('Error creating mobile presigned upload', error);
        }
        return NextResponse.json({ error: message }, { status });
    }
}

