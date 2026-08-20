import { test as base, type Page } from '@playwright/test';
import { SEED } from './seed/seed-data';

/**
 * Shared Playwright fixtures. A logged-in fixture spares every spec
 * from re-running the credential flow; tests that need a fresh login
 * (e.g. the auth refresh tests) use the bare `test` import directly.
 *
 * Credentials come from TEST_USERNAME / TEST_PASSWORD. In seeded mode
 * (E2E_MODE=seeded) they default to the admin that e2e/seed/seed.sql
 * creates; in live mode they are required and there is no fallback.
 */
export const E2E_MODE: 'seeded' | 'live' = process.env.E2E_MODE === 'seeded' ? 'seeded' : 'live';

function credentials(): { username: string; password: string } {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;
  if (username && password) return { username, password };
  if (E2E_MODE === 'seeded') return SEED.admin;
  throw new Error(
    'TEST_USERNAME and TEST_PASSWORD must be set for live e2e runs (put them in .env or the ' +
      'environment). For the hermetic suite run with E2E_MODE=seeded, which uses the seeded admin.',
  );
}

export async function login(page: Page) {
  const { username, password } = credentials();
  await page.goto('/login');
  await page.getByRole('textbox', { name: /username/i }).fill(username);
  await page.getByRole('textbox', { name: /password/i }).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Wait for redirect off the login page.
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 10_000 });
}

export const test = base.extend<{ loggedInPage: Page }>({
  loggedInPage: async ({ page }, run) => {
    await login(page);
    await run(page);
  },
});

export { expect } from '@playwright/test';
