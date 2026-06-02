import { test as base, type Page } from '@playwright/test';

/**
 * Shared Playwright fixtures. A logged-in fixture spares every spec
 * from re-running the credential flow; tests that need a fresh login
 * (e.g. the auth refresh tests) use the bare `test` import directly.
 *
 * Credentials live in .env / TEST_USERNAME + TEST_PASSWORD with sane
 * fallbacks for the install we hand-test against.
 */
const USERNAME = process.env.TEST_USERNAME ?? 'admin';
const PASSWORD = process.env.TEST_PASSWORD ?? 'ktx200';

export async function login(page: Page) {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /username/i }).fill(USERNAME);
  await page.getByRole('textbox', { name: /password/i }).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Wait for redirect off the login page.
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 10_000 });
}

export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});

export { expect } from '@playwright/test';
