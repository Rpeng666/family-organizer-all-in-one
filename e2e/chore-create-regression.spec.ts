import { expect, test } from '@playwright/test';
import { loginAsParentViaSettings } from './support/parent-session';

const parentName = process.env.E2E_PARENT_NAME;
const parentPin = process.env.E2E_PARENT_PIN;
const choreAssigneeName = process.env.E2E_CHORE_ASSIGNEE_NAME || parentName;

function escapeRegExp(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('chore creation regression (env-gated)', () => {
    test.skip(!parentName || !parentPin, 'Set E2E_PARENT_NAME and E2E_PARENT_PIN to run chore creation E2E tests.');
    test.skip(!choreAssigneeName, 'Set E2E_CHORE_ASSIGNEE_NAME (or E2E_PARENT_NAME) to choose an assignee in the chore form.');

    test('parent creates a chore from the dashboard and it appears in the list', async ({ page }) => {
        test.slow();

        await loginAsParentViaSettings(page, {
            parentName: parentName!,
            parentPin: parentPin!,
            routeAfterLogin: '/',
        });

        await expect(page.getByRole('heading', { name: /chores/i })).toBeVisible();

        const title = `E2E Chore ${Date.now()}`;
        await page.getByRole('button', { name: /add chore/i }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByPlaceholder('Chore title').fill(title);

        await dialog.getByRole('button', { name: new RegExp(`^${escapeRegExp(choreAssigneeName!)}$`, 'i') }).click();

        const saveButton = dialog.getByRole('button', { name: /save chore/i });
        await expect(saveButton).toBeEnabled();
        await saveButton.click();

        await expect(page.getByText(title, { exact: true })).toBeVisible();
    });
});
