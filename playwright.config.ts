import { spawnSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

const readinessPath = '/api/mobile/config';
const fallbackBaseURL = 'http://localhost:3001';
const reusableBaseURLCandidates = [fallbackBaseURL, 'http://localhost:4000'];

function isReusableLocalDevServer(baseURL: string) {
    const probe = spawnSync(
        process.execPath,
        [
            '-e',
            `
const url = process.argv[1];
fetch(url)
    .then((response) => process.stdout.write(String(response.status)))
    .catch(() => process.stdout.write('0'));
            `,
            `${baseURL}${readinessPath}`,
        ],
        {
            encoding: 'utf8',
            timeout: 1500,
        }
    );

    const status = Number.parseInt(probe.stdout.trim(), 10);
    return status >= 200 && status < 404;
}

const detectedReusableBaseURL = process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : reusableBaseURLCandidates.find((candidate) => isReusableLocalDevServer(candidate));
const baseURL = process.env.PLAYWRIGHT_BASE_URL || detectedReusableBaseURL || fallbackBaseURL;
const parsedBaseURL = new URL(baseURL);
const devPort = parsedBaseURL.port || (parsedBaseURL.protocol === 'https:' ? '443' : '80');
// Use an allowlisted GET route that returns 401 before activation so Playwright
// can still detect an already-running dev server behind the device gate.
const webServerReadyURL = `${baseURL.replace(/\/$/, '')}${readinessPath}`;

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    expect: {
        timeout: 10_000,
    },
    fullyParallel: false,
    reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
    use: {
        baseURL,
        trace: 'retain-on-failure',
    },
    webServer: process.env.PLAYWRIGHT_BASE_URL
        ? undefined
        : {
              command: `npm run dev -- --port ${devPort}`,
              url: webServerReadyURL,
              reuseExistingServer: true,
              timeout: 120_000,
          },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});
