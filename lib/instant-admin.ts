import 'server-only';

import { init } from '@instantdb/admin';
import { createHash } from 'crypto';

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured`);
    }
    return value;
}

function getInstantAppId(): string {
    return process.env.INSTANT_APP_ID || getRequiredEnv('NEXT_PUBLIC_INSTANT_APP_ID');
}

function getKidPrincipalAuthId(): string {
    return process.env.INSTANT_KID_AUTH_ID || process.env.INSTANT_FAMILY_AUTH_ID || 'family-organizer-kid';
}

function sanitizeEmailLocalPart(value: string): string {
    const cleaned = value
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^[._-]+|[._-]+$/g, '');

    return cleaned || 'family-organizer-shared-device';
}

function getParentPrincipalAuthId(): string {
    return process.env.INSTANT_PARENT_AUTH_ID || 'family-organizer-parent';
}

function getFamilyMemberAuthEmail(memberId: string) {
    const normalizedMemberId = sanitizeEmailLocalPart(memberId);
    return `${normalizedMemberId}@family-organizer.member.local`;
}

export function getKidPrincipalAuthEmail(): string {
    if (process.env.INSTANT_KID_AUTH_EMAIL) {
        return process.env.INSTANT_KID_AUTH_EMAIL;
    }

    return `${sanitizeEmailLocalPart(getKidPrincipalAuthId())}@family-organizer.local`;
}

export function getParentPrincipalAuthEmail(): string {
    if (process.env.INSTANT_PARENT_AUTH_EMAIL) {
        return process.env.INSTANT_PARENT_AUTH_EMAIL;
    }

    return `${sanitizeEmailLocalPart(getParentPrincipalAuthId())}@family-organizer.local`;
}

export function isInstantFamilyAuthConfigured(): boolean {
    return Boolean((process.env.INSTANT_APP_ID || process.env.NEXT_PUBLIC_INSTANT_APP_ID) && process.env.INSTANT_APP_ADMIN_TOKEN);
}

export function getInstantAdminDb() {
    return init({
        appId: getInstantAppId(),
        adminToken: getRequiredEnv('INSTANT_APP_ADMIN_TOKEN'),
    });
}

type PrincipalType = 'kid' | 'parent';

type FamilyMemberRecord = {
    id: string;
    name?: string | null;
    role?: string | null;
    pinHash?: string | null;
    photoUrls?: Record<string, string> | null;
};

function getPrincipalEmail(type: PrincipalType) {
    return type === 'kid' ? getKidPrincipalAuthEmail() : getParentPrincipalAuthEmail();
}

async function ensurePrincipalUserType(type: PrincipalType) {
    const adminDb = getInstantAdminDb();
    const email = getPrincipalEmail(type);
    const user = await adminDb.auth.getUser({ email });

    await adminDb.transact([adminDb.tx.$users[user.id].update({ type })]);
}

export async function mintPrincipalToken(type: PrincipalType) {
    const adminDb = getInstantAdminDb();
    const email = getPrincipalEmail(type);
    const token = await adminDb.auth.createToken({ email });

    await ensurePrincipalUserType(type);

    return token;
}

async function queryFamilyMembers() {
    const adminDb = getInstantAdminDb();
    const data = await adminDb.query({ familyMembers: {} });
    return (data.familyMembers as FamilyMemberRecord[]) || [];
}

export function hashPinServer(pin: string): string {
    return createHash('sha256').update(pin).digest('hex');
}

export async function getFamilyMemberById(memberId: string) {
    const familyMembers = await queryFamilyMembers();
    return familyMembers.find((member: any) => member.id === memberId) || null;
}

export async function listFamilyMemberRoster() {
    const familyMembers = await queryFamilyMembers();
    return familyMembers
        .map((member: any) => ({
            id: member.id,
            name: member.name || 'Unknown',
            role: member.role || 'child',
            photoUrls: member.photoUrls || null,
            hasPin: Boolean(member.pinHash),
        }))
        .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

export async function verifyFamilyMemberCredentials(memberId: string, pin: string | null | undefined) {
    const member = (await getFamilyMemberById(memberId)) as FamilyMemberRecord | null;
    if (!member) {
        throw new Error('Family member not found');
    }

    if (member.pinHash) {
        const providedPin = typeof pin === 'string' ? pin.trim() : '';
        if (!providedPin) {
            throw new Error('PIN is required');
        }

        if (hashPinServer(providedPin) !== member.pinHash) {
            throw new Error('Incorrect PIN');
        }
    }

    return member;
}

export async function mintFamilyMemberToken(memberId: string) {
    const adminDb = getInstantAdminDb();
    const member = (await getFamilyMemberById(memberId)) as FamilyMemberRecord | null;
    if (!member) {
        throw new Error('Family member not found');
    }

    const email = getFamilyMemberAuthEmail(member.id);
    const token = await adminDb.auth.createToken({ email });
    const user = await adminDb.auth.getUser({ email });
    const principalType = member.role === 'parent' ? 'parent' : 'kid';

    await adminDb.transact([
        adminDb.tx.$users[user.id].update({
            familyMemberId: member.id,
            imageURL:
                typeof member.photoUrls?.['320'] === 'string'
                    ? member.photoUrls['320']
                    : typeof member.photoUrls?.['64'] === 'string'
                    ? member.photoUrls['64']
                    : null,
            role: member.role || 'child',
            type: principalType,
        }),
    ]);

    return {
        token,
        principalType,
        member,
        user,
    };
}
