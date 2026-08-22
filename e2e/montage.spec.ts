import { test, expect, gotoSkin, seededOnly } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Montage (`/montage`) in both skins. Modern is a resizable tile mosaic with
 * presets and saved layouts; classic is the legacy fixed grid driven by a
 * `Layout` select. The seed ships MontageLayout 9001 `e2e-Wall` in the legacy
 * gridstack shape, so "the saved layout loads" is a real compatibility check.
 */
test.describe('Montage', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  test('modern: presets change the cell count @route:montage', async ({ loggedInPage: page }) => {
    await gotoSkin(page, '/montage', 'modern');

    // Presets and saved layouts live behind the toolbar's Layout disclosure.
    await page.getByRole('button', { name: /^Layout$/ }).click();
    await page.getByRole('button', { name: /^2×2$/ }).click();
    await expect(page.getByText(/4 cells/i)).toBeVisible();

    await page.getByRole('button', { name: /^1×1$/ }).click();
    await expect(page.getByText(/1 cell\b/i)).toBeVisible();

    await expect(page.getByRole('button', { name: /restart/i })).toBeVisible();
  });

  test('modern: the seeded legacy layout is offered and loads @route:montage', async ({
    loggedInPage: page,
  }) => {
    await gotoSkin(page, '/montage', 'modern');

    await page.getByRole('button', { name: /^Layout$/ }).click();
    const layouts = page.getByLabel(/saved layouts/i).first();
    await expect(layouts).toBeVisible();
    await layouts.selectOption(String(SEED.montageLayout));

    // e2e-Wall places all four cameras on a 12-column grid.
    await expect(page.getByText(/4 cells/i)).toBeVisible();
  });

  test('classic: one grid cell per monitor @route:montage', async ({ loggedInPage: page }) => {
    await gotoSkin(page, '/montage', 'classic');

    await expect(page.getByTestId('montage-classic-grid')).toBeVisible();
    for (const id of SEED.monitors.all) {
      await expect(page.getByTestId(`montage-classic-cell-${id}`)).toBeVisible();
    }
    // Legacy layout picker, not the modern preset rail.
    await expect(page.getByLabel(/^layout/i).first()).toBeVisible();
  });

  test('classic: the group filter narrows the grid @route:montage', async ({
    loggedInPage: page,
  }) => {
    await gotoSkin(page, '/montage', 'classic');

    await page.getByLabel(/^groupid/i).selectOption({ label: 'e2e-Front' });
    await expect(page.getByTestId(`montage-classic-cell-${SEED.monitors.frontDoor}`)).toBeVisible();
    await expect(page.getByTestId(`montage-classic-cell-${SEED.monitors.garage}`)).toHaveCount(0);
  });
});
