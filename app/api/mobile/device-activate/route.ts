import { NextRequest, NextResponse } from 'next/server';
import { issueMobileDeviceSessionToken } from '@/lib/device-auth-server';

export const dynamic = 'force-dynamic';

type MobileDeviceActivateBody = {
    accessKey?: string;
    platform?: string;
    deviceName?: string;
    appVersion?: string;
};

function noStoreJson(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
    const secretKey = process.env.DEVICE_ACCESS_KEY;
    if (!secretKey) {
        return noStoreJson({ error: 'Device activation is not configured' }, 503);
    }

    let body: MobileDeviceActivateBody = {};
    try {
        body = (await request.json()) as MobileDeviceActivateBody;
    } catch {
        return noStoreJson({ error: 'Invalid request body' }, 400);
    }

    const providedKey = typeof body.accessKey === 'string' ? body.accessKey.trim() : '';
    if (!providedKey) {
        return noStoreJson({ error: 'Activation key is required' }, 400);
    }
    if (providedKey !== secretKey) {
        return noStoreJson({ error: 'Invalid activation key' }, 403);
    }

    if (body.platform !== 'ios') {
        return noStoreJson({ error: 'Unsupported platform' }, 400);
    }

    const deviceName = typeof body.deviceName === 'string' ? body.deviceName.trim().slice(0, 128) : undefined;
    const appVersion = typeof body.appVersion === 'string' ? body.appVersion.trim().slice(0, 64) : undefined;

    const session = issueMobileDeviceSessionToken({
        platform: 'ios',
        ...(deviceName ? { deviceName } : {}),
        ...(appVersion ? { appVersion } : {}),
    });

    return noStoreJson({
        deviceSessionToken: session.token,
        expiresAt: session.expiresAt,
        sessionId: session.sessionId,
    });
}

