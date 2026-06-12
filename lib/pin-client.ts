'use client';

function bytesToHex(bytes: Uint8Array) {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

export async function hashPinClient(pin: string): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) {
        throw new Error('Secure crypto hashing is not available in this browser context');
    }

    const encoder = new TextEncoder();
    const digest = await subtle.digest('SHA-256', encoder.encode(pin));
    return bytesToHex(new Uint8Array(digest));
}
