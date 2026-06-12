# Testing Guide

This repo now uses a layered test strategy:

- `Vitest` for unit, integration, contract, and DOM/component tests
- `Playwright` for end-to-end browser smoke tests

## Test layout

- `test/unit/**` : pure logic/helpers
- `test/integration/**` : route handlers, middleware, API handlers, file-system interactions
- `test/contracts/**` : policy/permission/schema coverage checks (regression guards)
- `test/dom/**` : React component behavior tests (jsdom)
- `e2e/**` : real browser flows (Playwright)
- `test/FEATURE_TEST_MATRIX.md` : web feature inventory + recommended automated/manual coverage matrix

## Naming conventions

- `*.node.test.ts` / `*.node.test.tsx`
  - Runs in Node environment (default)
- `*.dom.test.ts` / `*.dom.test.tsx`
  - Add `// @vitest-environment jsdom` at the top of the file

## Scripts

- `npm test` : run Vitest suites
- `npm run test:watch` : Vitest watch mode
- `npm run test:coverage` : Vitest with coverage
- `npm run test:e2e` : Playwright E2E tests
- `npm run test:e2e:install` : install Chromium for Playwright
- `npm run test:perms:live` : hosted Instant permissions smoke matrix (anonymous/kid/parent). Mutates and cleans up small temp rows.
- `npm run test:all` : Vitest + Playwright

## Time-sensitive tests (recurrence, allowance, parent idle expiry)

- Use `test/utils/fake-clock.ts` in Vitest suites instead of open-coding `vi.useFakeTimers()` / `vi.setSystemTime()` repeatedly.
- Use `e2e/support/time-machine.ts` in Playwright to drive the app's `debug_time_offset` time-machine flow.
- Reuse `e2e/support/device-auth.ts` and `e2e/support/login.ts` for activation/login setup in browser tests to keep specs focused on the behavior under test.
- Reuse `e2e/support/parent-session.ts` for env-gated parent-only Playwright flows (credential bootstrapping + elevation).
- Prefer fake time for recurrence/rotation math, task-series scheduling, allowance periods, and shared-device parent timeout behavior.

## DOM test stability tips (jsdom)

- Mock Radix-heavy UI primitives (`Dialog`, `Select`, `Switch`, `RadioGroup`, `Checkbox`) when the test is about form logic rather than Radix internals.
- If a component imports `@/lib/currency-utils`, consider mocking `@/lib/db` (and sometimes `@/lib/currency-utils` itself) in jsdom tests to avoid booting the real Instant client / IndexedDB storage layer.
- For drag/drop integrations, mock Atlaskit PDnD adapters and assert the registered callbacks + payloads directly.
- For server-action-driven client components (for example `FileManager`), mock the imported action module and `fetch`/`alert` globals rather than trying to invoke real server actions from jsdom.
- For Instant query-backed display components (for example finance history views), pass a small fake `db.useQuery` implementation and focus on data-shaping/rendering behavior.
- For responsive components that render both desktop and mobile DOM variants simultaneously (hidden via CSS classes), use `getAllBy*` queries or scope queries carefully to avoid duplicate-node assertion failures in jsdom.

## What to test for new features

For most new features, add tests in this order:

1. Unit test for new logic/helpers
2. Integration test for server route/action behavior and auth checks
3. Contract test if the feature changes Instant schema/perms/security assumptions
4. E2E test only for key user-visible flows

## Security-focused additions (important in this app)

When changing auth, permissions, or file handling, add at least:

- Unauthorized request test
- Authorized request test
- One malformed-input test
- One regression test for the intended security property (for example, audit stamp required)

## Hosted Instant perms smoke test

`npm run test:perms:live` is a real hosted-app check that validates the current pushed `instant.perms.ts`
behavior using:

- anonymous client (should be denied)
- kid principal token (shared kid principal)
- parent principal token

It is env-gated and safe by default (`RUN_LIVE_INSTANT_PERMS=1` is set by the script). It creates and
deletes a small number of temporary records for validation.
