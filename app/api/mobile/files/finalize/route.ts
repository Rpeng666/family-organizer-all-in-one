import { NextRequest, NextResponse } from 'next/server';
import { getDeviceAuthContextFromNextRequest } from '@/lib/device-auth-server';
import { finalizeUploadedAttachment } from '@/lib/attachment-finalizer';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    const deviceAuth = getDeviceAuthContextFromNextRequest(request);
    if (!deviceAuth.authorized) {
        return NextResponse.json({ error: 'Unauthorized device' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const attachment = await finalizeUploadedAttachment(body || {});
        return NextResponse.json(attachment, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to finalize attachment';
        const status = message.toLowerCase().includes('missing') || message.toLowerCase().includes('invalid') ? 400 : 500;
        if (status === 500) {
            console.error('Error finalizing mobile attachment', error);
        }
        return NextResponse.json({ error: message }, { status });
    }
}
