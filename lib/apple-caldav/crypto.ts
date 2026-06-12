import 'server-only';

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { getCalendarSyncEncryptionSecret, getCalendarSyncKeyVersion } from '@/lib/apple-caldav/config';

function getKey() {
    return createHash('sha256').update(getCalendarSyncEncryptionSecret()).digest();
}

export function encryptCalendarCredential(plainText: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        ciphertext: Buffer.concat([iv, authTag, encrypted]).toString('base64'),
        keyVersion: getCalendarSyncKeyVersion(),
    };
}

export function decryptCalendarCredential(ciphertext: string) {
    const raw = Buffer.from(ciphertext, 'base64');
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const payload = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
}
