import { defineConfig, devices } from '@playwright/test';

/**
 * Two ways to run the e2e suite, picked by E2E_MODE:
 *
 *   live   (default) — the Vite dev server on :5173 proxying to whatever
 *          zm_api your .env points at (a real ZoneMinder box). Serial,
 *          one worker, credentials from TEST_USERNAME / TEST_PASSWORD.
 *          Only the specs that need real cameras run: everything that
 *          asserts on seeded ids skips itself (`seededOnly` in fixtures).
 *
 *   seeded — hermetic. MariaDB + zm_api from e2e/seed/ (see its README),
 *          a dedicated dev server on :5174 proxying to E2E_API_URL, fixed
 *          data with known ids (e2e/seed/seed-data.ts), seeded admin as the
 *          default login, and a preflight (e2e/global-setup.ts) that fails
 *          fast if the stack is down. Workers > 1: specs must not rely on
 *          shared mutable state — see `scratchEvent` / `scratchMonitor`.
 *
 * Three projects. `chromium` and `webkit` run the desktop suite (Safari's
 * rotation metadata handling in particular keeps biting us); `mobile` runs
 * only `mobile.spec.ts` at 390x844 on an iPhone 13 profile, which is tier 7
 * of docs/PRODUCTION-READINESS-PLAN.md.
 */
const seeded = process.env.E2E_MODE === 'seeded';

const liveBaseURL = 'http://localhost:5173';
const seededBaseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5174';
const seededApiUrl = process.env.E2E_API_URL ?? 'http://127.0.0.1:8089';
const seededPort = new URL(seededBaseURL).port || '80';

/** `mobile.spec.ts` is viewport-specific; the desktop projects skip it. */
const MOBILE_SPEC = '**/mobile.spec.ts';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // File-level parallelism only; specs inside a file stay ordered.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  workers: seeded ? Number(process.env.E2E_WORKERS ?? 2) : 1,
  globalSetup: seeded ? './e2e/global-setup.ts' : undefined,

  use: {
    baseURL: seeded ? seededBaseURL : liveBaseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: MOBILE_SPEC,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      testIgnore: MOBILE_SPEC,
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile',
      testMatch: MOBILE_SPEC,
      // iPhone 13: 390x844, touch, mobile user agent. Pinned explicitly so a
      // Playwright device-descriptor change cannot quietly move the target.
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
  ],

  webServer: seeded
    ? {
        // Dedicated dev server wired to the seeded zm_api. Not reused by
        // default: a leftover server on this port could be proxying to the
        // wrong backend. Set E2E_REUSE_SERVER=1 to opt in.
        command: `npx vite --port ${seededPort} --strictPort`,
        url: seededBaseURL,
        env: { VITE_API_PROXY_TARGET: seededApiUrl },
        reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
        timeout: 30_000,
      }
    : {
        // Auto-spin up the dev server if not already running.
        command: 'npm run dev',
        url: liveBaseURL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
