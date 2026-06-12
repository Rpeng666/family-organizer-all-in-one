import { expect, type Page } from '@playwright/test';
import { activateDevice } from './device-auth';
import { loginFromModal } from './login';

export async function loginAsParentViaSettings(
    page: Page,
    options: {
        parentName: string;
        parentPin: string;
        routeAfterLogin?: string;
        sharedDevice?: boolean;
    }
) {
    const { parentName, parentPin, routeAfterLogin = '/settings', sharedDevice = true } = options;

    await activateDevice(page);
    await page.goto('/settings');

    const restrictedView = page.getByText('Access Restricted');
    if (await restrictedView.isVisible()) {
        await expect(page.getByRole('dialog')).toBeVisible();
        await loginFromModal(page, {
            memberName: parentName,
            pin: parentPin,
            sharedDevice,
        });
    }

    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();

    if (routeAfterLogin !== '/settings') {
        await page.goto(routeAfterLogin);
    }
}
