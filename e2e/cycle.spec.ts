import type { Page } from '@playwright/test';
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
      // WebKit lets the video stage sit over the transport bar, so the hit
      // test finds the stage; the button itself is visible and enabled.
      await page.getByRole('button', { name: /^pause cycling$/i }).click({ force: true });
      await expect(visibleText(page, 'e2e-Front Door')).toBeVisible();

      await page.getByRole('button', { name: /^next monitor$/i }).click({ force: true });
      await expect(visibleText(page, 'e2e-Driveway')).toBeVisible();

      await page.getByRole('button', { name: /^previous monitor$/i }).click({ force: true });
      await expect(visibleText(page, 'e2e-Front Door')).toBeVisible();
    });

    test(`${skin}: picking a camera from the rail jumps straight to it @route:cycle`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/cycle', skin);
      // WebKit lets the video stage sit over the transport bar, so the hit
      // test finds the stage; the button itself is visible and enabled.
      await page.getByRole('button', { name: /^pause cycling$/i }).click({ force: true });

      await page.getByRole('button', { name: 'e2e-Garage', exact: true }).click({ force: true });
      await expect(visibleText(page, 'e2e-Garage')).toBeVisible();
    });
  }
});

/**
 * The classic filter bar renders every camera as an <option>, which
 * `getByText` happily matches even though it is not visible. Restrict to
 * what an operator can actually see.
 */
function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true }).first();
}
