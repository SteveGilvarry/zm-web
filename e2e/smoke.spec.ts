import { test, expect } from '@playwright/test';
import { SIGN_IN_BUTTON } from './fixtures';

/**
 * Smoke test — proves the harness is wired up: the dev server answers and the
 * login page renders its form. Deliberately uses the bare `test` import, so it
 * carries no session and depends on no fixture data; if this fails, nothing
 * else in the suite is worth reading.
 */
test('login page renders @route:login', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: /username/i })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /password/i })).toBeVisible();
  await expect(page.getByRole('button', { name: SIGN_IN_BUTTON })).toBeVisible();
});
