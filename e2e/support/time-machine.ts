import type { BrowserContext, Page } from '@playwright/test';

const DEBUG_TIME_OFFSET_KEY = 'debug_time_offset';

type TimeInput = Date | string | number;

function toEpochMs(input: TimeInput) {
    return (input instanceof Date ? input : new Date(input)).getTime();
}

/**
 * Sets the app's debug time offset (used by the inline Date patch in app/layout.tsx)
 * for future navigations in this browser context.
 */
export async function installAppTimeForContext(context: BrowserContext, targetTime: TimeInput) {
    const targetMs = toEpochMs(targetTime);
    await context.addInitScript(
        ({ key, target }) => {
            try {
                localStorage.setItem(key, String(target - Date.now()));
            } catch {
                // Ignore pages/origins without localStorage access.
            }
        },
        { key: DEBUG_TIME_OFFSET_KEY, target: targetMs }
    );
}

/**
 * Sets the app's debug time offset for the current page (after navigation).
 * Call `page.reload()` afterwards so the app's inline script picks up the new offset.
 */
export async function setAppTimeOnPage(page: Page, targetTime: TimeInput) {
    const targetMs = toEpochMs(targetTime);
    await page.evaluate(
        ({ key, target }) => {
            localStorage.setItem(key, String(target - Date.now()));
        },
        { key: DEBUG_TIME_OFFSET_KEY, target: targetMs }
    );
}

export async function resetAppTimeOnPage(page: Page) {
    await page.evaluate((key) => {
        localStorage.removeItem(key);
    }, DEBUG_TIME_OFFSET_KEY);
}

export async function travelToAppTime(page: Page, targetTime: TimeInput) {
    await setAppTimeOnPage(page, targetTime);
    await page.reload();
}
