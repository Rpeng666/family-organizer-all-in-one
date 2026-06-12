import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import type { NextApiRequest } from 'next';
import type { NextRequest } from 'next/server';
import { DEVICE_AUTH_COOKIE_NAME, hasValidDeviceAuthCookie } from '@/lib/device-auth';

const MOBILE_DEVICE_SESSION_TOKEN_VERSION = 'v1';
const DEFAULT_MOBILE_DEVICE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type MobileDevicePlatform = 'ios' | 'android';

export interface MobileDeviceSessionClaims {
    sid: string;
    platform: MobileDevicePlatform;
    deviceName?: string;
    appVersion?: string;
    iat: number;
    exp: number;
}

interface SessionRecord {
    sessionId: string;
    expiresAt: number;
    platform: MobileDevicePlatform;
    deviceName?: string;
    appVersion?: string;
    createdAt: number;
    lastSeenAt: number;
    revokedAt?: number;
}

declare global {
    // eslint-disable-next-line no-var
    var __familyOrganizerMobileDeviceSessions: Map<string, SessionRecord> | undefined;
}

function getSessionStore(): Map<string, SessionRecord> {
    if (!globalThis.__familyOrganizerMobileDeviceSessions) {
        globalThis.__familyOrganizerMobileDeviceSessions = new Map<string, SessionRecord>();
    }
    return globalThis.__familyOrganizerMobileDeviceSessions;
}

function getMobileDeviceSessionSecret(): string {
    const secret = process.env.MOBILE_DEVICE_SESSION_SECRET || process.env.DEVICE_ACCESS_KEY;
    if (!secret) {
        throw new Error('Mobile device sessions are not configured');
    }
    return secret;
}

function getMobileDeviceSessionTtlSeconds(): number {
    const raw = process.env.MOBILE_DEVICE_SESSION_TTL_SECONDS;
    if (!raw) return DEFAULT_MOBILE_DEVICE_SESSION_TTL_SECONDS;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MOBILE_DEVICE_SESSION_TTL_SECONDS;
    return Math.floor(parsed);
}

function encodeBase64Url(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeBase64Url(value: string): string | null {
    try {
        return Buffer.from(value, 'base64url').toString('utf8');
    } catch {
        return null;
    }
}

function signPayload(payloadBase64Url: string): string {
    return createHmac('sha256', getMobileDeviceSessionSecret()).update(payloadBase64Url).digest('base64url');
}

function verifySignature(payloadBase64Url: string, signatureBase64Url: string): boolean {
    const expected = Buffer.from(signPayload(payloadBase64Url), 'utf8');
    const provided = Buffer.from(signatureBase64Url, 'utf8');
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
}

type VerifyDeviceSessionOptions = {
    allowExpired?: boolean;
    allowRevoked?: boolean;
};

type VerifyDeviceSessionResult =
    | { ok: true; claims: MobileDeviceSessionClaims }
    | {
          ok: false;
          error:
              | 'missing'
              | 'malformed'
              | 'invalid_signature'
              | 'invalid_payload'
              | 'unsupported_version'
              | 'expired'
              | 'revoked';
      };

function parseMobileDeviceSessionClaims(payload: unknown): MobileDeviceSessionClaims | null {
    if (!payload || typeof payload !== 'object') return null;
    const value = payload as Record<string, unknown>;
    if (typeof value.sid !== 'string' || !value.sid) return null;
    if (value.platform !== 'ios' && value.platform !== 'android') return null;
    if (typeof value.iat !== 'number' || !Number.isFinite(value.iat)) return null;
    if (typeof value.exp !== 'number' || !Number.isFinite(value.exp)) return null;

    return {
        sid: value.sid,
        platform: value.platform,
        deviceName: typeof value.deviceName === 'string' ? value.deviceName : undefined,
        appVersion: typeof value.appVersion === 'string' ? value.appVersion : undefined,
        iat: value.iat,
        exp: value.exp,
    };
}

function verifyMobileDeviceSessionTokenInternal(
    token: string | null | undefined,
    options: VerifyDeviceSessionOptions = {}
): VerifyDeviceSessionResult {
    if (!token) return { ok: false, error: 'missing' };

    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false, error: 'malformed' };

    const [version, payloadBase64Url, signatureBase64Url] = parts;
    if (version !== MOBILE_DEVICE_SESSION_TOKEN_VERSION) {
        return { ok: false, error: 'unsupported_version' };
    }

    if (!verifySignature(payloadBase64Url, signatureBase64Url)) {
        return { ok: false, error: 'invalid_signature' };
    }

    const payloadJson = decodeBase64Url(payloadBase64Url);
    if (!payloadJson) return { ok: false, error: 'invalid_payload' };

    let parsedPayload: unknown;
    try {
        parsedPayload = JSON.parse(payloadJson);
    } catch {
        return { ok: false, error: 'invalid_payload' };
    }

    const claims = parseMobileDeviceSessionClaims(parsedPayload);
    if (!claims) return { ok: false, error: 'invalid_payload' };

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!options.allowExpired && claims.exp <= nowSeconds) {
        return { ok: false, error: 'expired' };
    }

    const existingRecord = getSessionStore().get(claims.sid);
    if (existingRecord?.revokedAt && !options.allowRevoked) {
        return { ok: false, error: 'revoked' };
    }

    if (existingRecord && !existingRecord.revokedAt) {
        existingRecord.lastSeenAt = Date.now();
    }

    return { ok: true, claims };
}

export function verifyMobileDeviceSessionToken(token: string | null | undefined): VerifyDeviceSessionResult {
    return verifyMobileDeviceSessionTokenInternal(token);
}

export function issueMobileDeviceSessionToken(input: {
    platform: MobileDevicePlatform;
    deviceName?: string;
    appVersion?: string;
    sessionId?: string;
    ttlSeconds?: number;
}) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = input.ttlSeconds ?? getMobileDeviceSessionTtlSeconds();
    const sessionId = input.sessionId || randomUUID();
    const claims: MobileDeviceSessionClaims = {
        sid: sessionId,
        platform: input.platform,
        iat: nowSeconds,
        exp: nowSeconds + ttlSeconds,
        ...(input.deviceName ? { deviceName: input.deviceName } : {}),
        ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    };

    const payloadBase64Url = encodeBase64Url(JSON.stringify(claims));
    const signatureBase64Url = signPayload(payloadBase64Url);
    const token = `${MOBILE_DEVICE_SESSION_TOKEN_VERSION}.${payloadBase64Url}.${signatureBase64Url}`;

    getSessionStore().set(sessionId, {
        sessionId,
        expiresAt: claims.exp * 1000,
        platform: claims.platform,
        deviceName: claims.deviceName,
        appVersion: claims.appVersion,
        createdAt: claims.iat * 1000,
        lastSeenAt: Date.now(),
    });

    return {
        token,
        sessionId,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
        claims,
    };
}

export function refreshMobileDeviceSessionToken(token: string | null | undefined) {
    const verification = verifyMobileDeviceSessionToken(token);
    if (!verification.ok) {
        return verification as Extract<VerifyDeviceSessionResult, { ok: false }>;
    }

    revokeMobileDeviceSessionById(verification.claims.sid);

    const next = issueMobileDeviceSessionToken({
        platform: verification.claims.platform,
        deviceName: verification.claims.deviceName,
        appVersion: verification.claims.appVersion,
    });

    return {
        ok: true as const,
        ...next,
        previousSessionId: verification.claims.sid,
    };
}

export function revokeMobileDeviceSessionToken(token: string | null | undefined) {
    const verification = verifyMobileDeviceSessionTokenInternal(token, { allowExpired: true, allowRevoked: true });
    if (!verification.ok) {
        return verification as Extract<VerifyDeviceSessionResult, { ok: false }>;
    }
    revokeMobileDeviceSessionById(verification.claims.sid);
    return { ok: true as const, claims: verification.claims };
}

function revokeMobileDeviceSessionById(sessionId: string) {
    const store = getSessionStore();
    const existing = store.get(sessionId);
    if (existing) {
        existing.revokedAt = Date.now();
        return;
    }

    store.set(sessionId, {
        sessionId,
        expiresAt: Date.now(),
        platform: 'ios',
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        revokedAt: Date.now(),
    });
}

export function extractBearerTokenFromAuthorizationHeader(headerValue: string | null | undefined): string | null {
    if (!headerValue || typeof headerValue !== 'string') return null;
    const [scheme, ...rest] = headerValue.trim().split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== 'bearer' || rest.length === 0) return null;
    return rest.join(' ').trim() || null;
}

function getHeaderValueCaseInsensitive(
    headers: Record<string, string | string[] | undefined> | undefined | null,
    key: string
) {
    if (!headers) return undefined;
    const direct = headers[key];
    if (typeof direct === 'string') return direct;
    if (Array.isArray(direct)) return direct[0];

    const lower = key.toLowerCase();
    for (const [headerName, headerValue] of Object.entries(headers)) {
        if (headerName.toLowerCase() !== lower) continue;
        if (typeof headerValue === 'string') return headerValue;
        if (Array.isArray(headerValue)) return headerValue[0];
    }
    return undefined;
}

export type DeviceAuthContext =
    | { authorized: true; source: 'cookie' }
    | { authorized: true; source: 'bearer'; mobileSession: MobileDeviceSessionClaims }
    | { authorized: false; reason: string };

export function getDeviceAuthContextFromNextRequest(request: Pick<NextRequest, 'cookies' | 'headers'>): DeviceAuthContext {
    const cookieValue = request.cookies.get(DEVICE_AUTH_COOKIE_NAME)?.value;
    if (hasValidDeviceAuthCookie(cookieValue)) {
        return { authorized: true, source: 'cookie' };
    }

    const bearerToken = extractBearerTokenFromAuthorizationHeader(request.headers.get('authorization'));
    const mobileSession = verifyMobileDeviceSessionToken(bearerToken);
    if (!mobileSession.ok) {
        return { authorized: false, reason: (mobileSession as Extract<VerifyDeviceSessionResult, { ok: false }>).error };
    }

    return { authorized: true, source: 'bearer', mobileSession: mobileSession.claims };
}

export function getDeviceAuthContextFromNextApiRequest(
    request: Pick<NextApiRequest, 'cookies' | 'headers'>
): DeviceAuthContext {
    const cookieValue = request.cookies?.[DEVICE_AUTH_COOKIE_NAME];
    if (hasValidDeviceAuthCookie(cookieValue)) {
        return { authorized: true, source: 'cookie' };
    }

    const bearerToken = extractBearerTokenFromAuthorizationHeader(getHeaderValueCaseInsensitive(request.headers, 'authorization'));
    const mobileSession = verifyMobileDeviceSessionToken(bearerToken);
    if (!mobileSession.ok) {
        return { authorized: false, reason: (mobileSession as Extract<VerifyDeviceSessionResult, { ok: false }>).error };
    }

    return { authorized: true, source: 'bearer', mobileSession: mobileSession.claims };
}
