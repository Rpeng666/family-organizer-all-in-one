import { expect, test } from '@playwright/test';
import { activateDevice } from './support/device-auth';
import { loginFromModal } from './support/login';
import { travelToAppTime } from './support/time-machine';

const parentName = process.env.E2E_PARENT_NAME;
const parentPin = process.env.E2E_PARENT_PIN;
const parentRoute = process.env.E2E_PARENT_ROUTE || '/settings';

test.describe('parent elevation flow (env-gated)', () => {
    test.skip(!parentName || !parentPin, 'Set E2E_PARENT_NAME and E2E_PARENT_PIN to run parent-elevation E2E tests.');

    test('parent can unlock a parent-only page and logout returns to restricted view', async ({ page }) => {
        await activateDevice(page);
        await page.goto(parentRoute);

        await expect(page.getByText('Access Restricted')).toBeVisible();
        await expect(page.getByRole('dialog')).toBeVisible();

        await loginFromModal(page, { memberName: parentName!, pin: parentPin!, sharedDevice: true });

        await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();

        await page.getByRole('button', { name: /open user menu/i }).click();
        await page.getByRole('menuitem', { name: /log out/i }).click();

        await expect(page.getByText('Access Restricted')).toBeVisible();
        await expect(page.getByRole('dialog')).toBeVisible();

        await expect
            .poll(
                async () => page.evaluate(() => window.localStorage.getItem('family_organizer_preferred_principal')),
                { timeout: 5000 }
            )
            .toBe('kid');
    });

    test('shared-device parent mode expires after time travel beyond idle timeout', async ({ page }) => {
        await activateDevice(page);
        await page.goto(parentRoute);

        await expect(page.getByText('Access Restricted')).toBeVisible();
        await expect(page.getByRole('dialog')).toBeVisible();

        await loginFromModal(page, { memberName: parentName!, pin: parentPin!, sharedDevice: true });
        await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();

        const futureIso = await page.evaluate(() => new Date(Date.now() + 20 * 60 * 1000).toISOString());
        await travelToAppTime(page, futureIso);

        await expect(page.getByText('Access Restricted')).toBeVisible();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect
            .poll(
                async () => page.evaluate(() => window.localStorage.getItem('family_organizer_preferred_principal')),
                { timeout: 5000 }
            )
            .toBe('kid');
    });
});
