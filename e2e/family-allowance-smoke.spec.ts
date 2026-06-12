import { expect, test } from '@playwright/test';
import { loginAsParentViaSettings } from './support/parent-session';

const parentName = process.env.E2E_PARENT_NAME;
const parentPin = process.env.E2E_PARENT_PIN;
const allowanceMemberName = process.env.E2E_ALLOWANCE_MEMBER_NAME || parentName;

function escapeRegExp(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('family allowance page smoke (env-gated)', () => {
    test.skip(!parentName || !parentPin, 'Set E2E_PARENT_NAME and E2E_PARENT_PIN to run family allowance E2E tests.');
    test.skip(!allowanceMemberName, 'Set E2E_ALLOWANCE_MEMBER_NAME (or E2E_PARENT_NAME) to pick a member in the finance page.');

    test('parent can open a member allowance detail view and launch withdraw modal', async ({ page }) => {
        test.slow();

        await loginAsParentViaSettings(page, {
            parentName: parentName!,
            parentPin: parentPin!,
            routeAfterLogin: '/familyMemberDetail',
        });

        await expect(page.getByText('Family Members')).toBeVisible();

        await page.getByRole('button', { name: new RegExp(`^${escapeRegExp(allowanceMemberName!)}\\b`, 'i') }).click();

        await expect(page.getByRole('heading', { name: new RegExp(`Allowance for ${escapeRegExp(allowanceMemberName!)}`, 'i') })).toBeVisible();
        await expect(page.getByText('Total Balance')).toBeVisible();
        await expect(page.getByText('Envelopes')).toBeVisible();

        await page.getByRole('button', { name: /withdraw/i }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await expect(page.getByRole('heading', { name: /withdraw funds/i })).toBeVisible();

        await page.getByRole('button', { name: /cancel/i }).click();
        await expect(page.getByRole('heading', { name: /withdraw funds/i })).not.toBeVisible();
    });
});
