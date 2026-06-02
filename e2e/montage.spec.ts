import { test, expect } from './fixtures';

test.describe('Montage', () => {
  test('applies a preset layout', async ({ loggedInPage: page }) => {
    await page.goto('/montage');

    // Apply 2×2.
    await page.getByRole('button', { name: /^2×2$/ }).click();

    // The toolbar reports '4 cells' after the preset applies.
    await expect(page.getByText(/4 cells/i)).toBeVisible();
  });

  test('Restart button is present', async ({ loggedInPage: page }) => {
    await page.goto('/montage');
    await expect(page.getByRole('button', { name: /restart/i })).toBeVisible();
  });

  test('preset 1×1 reduces back to one cell', async ({ loggedInPage: page }) => {
    await page.goto('/montage');
    await page.getByRole('button', { name: /^2×2$/ }).click();
    await expect(page.getByText(/4 cells/i)).toBeVisible();

    await page.getByRole('button', { name: /^1×1$/ }).click();
    await expect(page.getByText(/1 cell\b/i)).toBeVisible();
  });
});
