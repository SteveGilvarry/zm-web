import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the live Vite dev server, so the suite
 * mirrors what an operator actually sees including the real zm_api
 * backend. Two browser projects so we catch the cross-browser bugs that
 * keep biting us — Safari's rotation metadata handling in particular.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Live backend; serial keeps state predictable.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
  ],

  // Auto-spin up the dev server if not already running.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
