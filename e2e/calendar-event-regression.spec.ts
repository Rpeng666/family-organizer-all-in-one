import { expect, test } from '@playwright/test';
import { loginAsParentViaSettings } from './support/parent-session';

const parentName = process.env.E2E_PARENT_NAME;
const parentPin = process.env.E2E_PARENT_PIN;

test.describe('calendar event regression (env-gated)', () => {
    test.skip(!parentName || !parentPin, 'Set E2E_PARENT_NAME and E2E_PARENT_PIN to run calendar event E2E tests.');

    test('parent creates and edits an all-day calendar event', async ({ page }) => {
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

        let dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        const initialTitle = `E2E Calendar Event ${Date.now()}`;
        await dialog.getByLabel('Title').fill(initialTitle);
        await dialog.getByRole('button', { name: /add event/i }).click();

        const eventChip = page.getByText(initialTitle, { exact: true });
        await expect(eventChip).toBeVisible();
        await eventChip.click();

        dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: /update event/i })).toBeVisible();

        const updatedTitle = `${initialTitle} Updated`;
        await dialog.getByLabel('Title').fill(updatedTitle);
        await dialog.getByRole('button', { name: /update event/i }).click();

        await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();
    });
});
