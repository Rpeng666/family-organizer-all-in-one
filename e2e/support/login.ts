import type { Page } from '@playwright/test';

export async function loginFromModal(page: Page, options: { memberName: string; pin?: string; sharedDevice?: boolean }) {
    const { memberName, pin, sharedDevice = true } = options;

    await page.getByRole('button', { name: new RegExp(memberName, 'i') }).click();

    if (pin) {
        await page.getByPlaceholder(/pin/i).fill(pin);
    }

    const sharedDeviceCheckbox = page.getByLabel(/this is a shared device/i);
    if (sharedDevice && (await sharedDeviceCheckbox.count())) {
        await sharedDeviceCheckbox.check();
    }

    await page.getByRole('button', { name: /^log in$/i }).click();
}
