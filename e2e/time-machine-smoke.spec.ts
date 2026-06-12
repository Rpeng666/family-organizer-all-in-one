import { expect, test } from '@playwright/test';
import { activateDevice } from './support/device-auth';
import { installAppTimeForContext, resetAppTimeOnPage, travelToAppTime } from './support/time-machine';

test.describe('debug time-machine inline Date patch smoke', () => {
    test('can bootstrap the app with a simulated clock via context init script', async ({ context, page }) => {
        await installAppTimeForContext(context, '2035-01-15T10:30:00Z');
        await activateDevice(page);

        const simulatedIso = await page.evaluate(() => new Date().toISOString());
        expect(simulatedIso.startsWith('2035-01-15T')).toBe(true);
    });

    test('can travel and reset time on the current page via localStorage offset', async ({ page }) => {
        await activateDevice(page);

        const baselineYear = await page.evaluate(() => new Date().getUTCFullYear());
        expect(baselineYear).toBeGreaterThanOrEqual(2024);

        await travelToAppTime(page, '2040-07-04T12:00:00Z');
        const simulatedYear = await page.evaluate(() => new Date().getUTCFullYear());
        expect(simulatedYear).toBe(2040);

        await resetAppTimeOnPage(page);
        await page.reload();

        const resetYear = await page.evaluate(() => new Date().getUTCFullYear());
        expect(resetYear).not.toBe(2040);
    });
});
