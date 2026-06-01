import { test, expect } from '@playwright/test';

/**
 * Smoke test — proves the e2e harness is wired correctly. Doesn't
 * exercise auth (credentials handling moves to a fixture in a later
 * commit); only checks that the dev server is up and the login page
 * renders something recognisable.
 */
test('login page renders', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: /username/i })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});
