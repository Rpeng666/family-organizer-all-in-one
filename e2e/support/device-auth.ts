import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

function readDeviceAccessKeyFromEnvFiles() {
    const candidates = [path.resolve(process.cwd(), '.env.local'), path.resolve(process.cwd(), '.env')];

    for (const filePath of candidates) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            for (const line of content.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;

                const match = trimmed.match(/^DEVICE_ACCESS_KEY\s*=\s*(.*)$/);
                if (!match) continue;

                const raw = match[1].trim();
                const unquoted =
                    (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))
                        ? raw.slice(1, -1)
                        : raw;

                if (unquoted) {
                    return unquoted;
                }
            }
        } catch {
            // Ignore missing env files and fall through to the next source.
        }
    }

    return '';
}

export const e2eActivationKey =
    process.env.E2E_DEVICE_ACCESS_KEY || process.env.DEVICE_ACCESS_KEY || readDeviceAccessKeyFromEnvFiles() || 'local-dev-device-access-key';

export async function activateDevice(page: Page, activationKey = e2eActivationKey) {
    const response = await page.context().request.post('/api/device-activate', {
        data: { key: activationKey },
    });

    if (!response.ok()) {
        throw new Error(`Device activation failed with ${response.status()}: ${await response.text()}`);
    }

    await page.goto('/');
}
