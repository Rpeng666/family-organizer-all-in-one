import { expect, test, type Page } from '@playwright/test';
import { activateDevice } from './support/device-auth';

async function closeLoginModalIfPresent(page: Page) {
    const closeLoginModal = page.getByRole('button', { name: /^close$/i });
    const dialogAppeared = await closeLoginModal
        .waitFor({ state: 'visible', timeout: 2000 })
        .then(() => true)
        .catch(() => false);

    if (dialogAppeared) {
        await closeLoginModal.click();
        await expect(page.getByRole('dialog')).toBeHidden();
    }
}

test.describe('DebugTimeWidget smoke', () => {
    test('can open, travel time via the widget UI, and reset to real time', async ({ page }) => {
        await activateDevice(page);

        await closeLoginModalIfPresent(page);

        await page.getByTitle(/open time machine/i).click();
        await page.locator('input[type="datetime-local"]').fill('2032-06-01T09:30');
        await page.getByRole('button', { name: /^travel$/i }).click();

        await expect
            .poll(async () => page.evaluate(() => new Date().getUTCFullYear()), { timeout: 5000 })
            .toBe(2032);

        await closeLoginModalIfPresent(page);
        await page.getByTitle(/open time machine/i).click();
        await page.getByTitle(/reset to real time/i).click();

        await expect
            .poll(async () => page.evaluate(() => new Date().getUTCFullYear()), { timeout: 5000 })
            .not.toBe(2032);
    });
});
