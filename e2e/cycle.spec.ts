import { test, expect, gotoSkin, SKINS, seededOnly } from './fixtures';

/**
 * Cycle (`/cycle`) in both skins — one camera at a time, advancing on a
 * timer. The specs drive the transport by hand rather than waiting out the
 * interval, so they do not depend on wall-clock timing.
 */
test.describe('Cycle', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: steps through the cameras with the transport @route:cycle`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/cycle', skin);

      // Cycling starts on the first camera; pause so the timer cannot move it
      // underneath the assertions.
      await page.getByRole('button', { name: /^pause cycling$/i }).click();
      await expect(page.getByText('e2e-Front Door').first()).toBeVisible();

      await page.getByRole('button', { name: /^next monitor$/i }).click();
      await expect(page.getByText('e2e-Driveway').first()).toBeVisible();

      await page.getByRole('button', { name: /^previous monitor$/i }).click();
      await expect(page.getByText('e2e-Front Door').first()).toBeVisible();
    });

    test(`${skin}: picking a camera from the rail jumps straight to it @route:cycle`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/cycle', skin);
      await page.getByRole('button', { name: /^pause cycling$/i }).click();

      await page.getByRole('button', { name: 'e2e-Garage', exact: true }).click();
      await expect(page.getByText('e2e-Garage').first()).toBeVisible();
    });
  }
});
