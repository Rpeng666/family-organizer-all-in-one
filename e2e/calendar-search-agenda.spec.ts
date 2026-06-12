import { expect, test } from '@playwright/test';
import { loginAsParentViaSettings } from './support/parent-session';

const parentName = process.env.E2E_PARENT_NAME;
const parentPin = process.env.E2E_PARENT_PIN;

test.describe('calendar search + agenda (env-gated)', () => {
    test.skip(!parentName || !parentPin, 'Set E2E_PARENT_NAME and E2E_PARENT_PIN to run calendar search E2E tests.');

    test('searches, jumps in day view, promotes to filters, and shows only matches in agenda view', async ({ page }) => {
        test.slow();

        await loginAsParentViaSettings(page, {
            parentName: parentName!,
            parentPin: parentPin!,
            routeAfterLogin: '/calendar',
        });

        const calendarTable = page.locator('table').first();
        await expect(calendarTable).toBeVisible();

        const targetDayCell = calendarTable.locator('tbody td').nth(10);
        await targetDayCell.click();

        const timedTitle = `E2E Search Target ${Date.now()}`;
        const decoyTitle = `E2E Search Decoy ${Date.now()}`;

        let dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByLabel('Title').fill(timedTitle);
        await dialog.getByLabel('All-day event').click();
        await dialog.getByLabel('Start Time').fill('18:30');
        await dialog.getByLabel('End Time').fill('19:15');
        await dialog.getByRole('button', { name: /add event/i }).click();
        await expect(page.getByText(timedTitle, { exact: true })).toBeVisible();

        await targetDayCell.click();
        dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByLabel('Title').fill(decoyTitle);
        await dialog.getByRole('button', { name: /add event/i }).click();
        await expect(page.getByText(decoyTitle, { exact: true })).toBeVisible();

        await page.getByRole('button', { name: /settings/i }).click();
        await page.getByLabel('View').selectOption('day');
        await expect(page.getByTestId('day-view-vertical-scroller-0')).toBeVisible();

        await page.getByRole('button', { name: 'Search calendar' }).click();
        await page.getByLabel('Search query').fill(timedTitle);

        const searchResults = page.getByTestId('calendar-search-results');
        await expect(searchResults.getByText(timedTitle, { exact: true })).toBeVisible();

        const scroller = page.getByTestId('day-view-vertical-scroller-0');
        const initialScrollTop = await scroller.evaluate((element) => element.scrollTop);

        await searchResults.getByRole('button', { name: new RegExp(timedTitle, 'i') }).click();
        await expect.poll(async () => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(initialScrollTop);

        await searchResults.getByRole('button', { name: new RegExp(timedTitle, 'i') }).click({ modifiers: ['Shift'] });
        dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByLabel('Title')).toHaveValue(timedTitle);
        await page.keyboard.press('Escape');

        await page.getByRole('button', { name: /filter/i }).click();
        await page.getByRole('button', { name: 'Use live search' }).click();

        await page.getByRole('button', { name: /settings/i }).click();
        await page.getByLabel('View').selectOption('agenda');

        const agenda = page.getByTestId('calendar-agenda-main');
        await expect(agenda.getByText(timedTitle, { exact: true })).toBeVisible();
        await expect(agenda.getByText(decoyTitle, { exact: true })).toHaveCount(0);
    });
});
