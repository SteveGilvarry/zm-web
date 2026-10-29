import type { Page } from '@playwright/test';
import { test, expect, gotoSkin, reviewTransport, SKINS, seededOnly, type Skin } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Montage Review (`/montagereview`) in both skins — the scrubbing timeline
 * over recorded events, one lane per camera. The seed spreads 32 events over
 * ~46 h, so widening the window has to pull more of them in.
 */

/** Both skins ship the same ranges; only the wording differs. */
const RANGE_24H: Record<Skin, RegExp> = {
  modern: /^24 hours$/i,
  classic: /^24 hour$/i,
};


test.describe('Montage Review', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: draws a lane per monitor and a transport @route:montagereview`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/montagereview', skin);

      await expect(reviewTransport(page, skin)).toBeVisible();
      // Legacy's timeline has no caption; the lane itself is the proof.
      await expect(page.getByTestId('review-timeline')).toBeVisible();
      for (const name of ['e2e-Front Door', 'e2e-Driveway', 'e2e-Garage', 'e2e-PTZ Dome']) {
        await expect(visibleText(page, name)).toBeVisible();
      }
    });

    test(`${skin}: widening the range asks the backend for a bigger window @route:montagereview`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/montagereview', skin);

      // The page's own 1 h load may still be answering when the click lands,
      // so wait for the request that carries a day, not for the next one.
      const windowMs = (url: string) => {
        const q = new URL(url).searchParams;
        return Date.parse(q.get('end_time') ?? '') - Date.parse(q.get('start_time') ?? '');
      };
      const pending = page.waitForResponse(
        (r) => /\/api\/v3\/events(\?|$)/.test(r.url()) && r.request().method() === 'GET'
          && windowMs(r.url()) > 20 * 60 * 60 * 1000,
        { timeout: 20_000 },
      );
      await page.getByRole('button', { name: RANGE_24H[skin] }).click();
      const params = new URL((await pending).url()).searchParams;

      const from = Date.parse(params.get('start_time') ?? '');
      const to = Date.parse(params.get('end_time') ?? String(Date.now()));
      expect(Number.isFinite(from), 'a start bound must be sent').toBe(true);
      // Allow slop for the clock; the point is "about a day", not "an hour".
      expect(to - from).toBeGreaterThan(20 * 60 * 60 * 1000);
    });

    test(`${skin}: a monitor's audit link lands here pre-scoped @route:montagereview`, async ({
      loggedInPage: page,
    }) => {
      // The Audit report links each row into Review with the window applied;
      // this is that URL contract, not a click-through.
      await gotoSkin(
        page,
        `/montagereview?monitor_id=${SEED.monitors.driveway}`,
        skin,
      );
      await expect(page).toHaveURL(new RegExp(`monitor_id=${SEED.monitors.driveway}`));
      await expect(visibleText(page, 'e2e-Driveway')).toBeVisible();
    });
  }
});

/** See cycle.spec.ts — the classic filter bar hides camera names in <option>s. */
function visibleText(page: Page, text: string) {
  return page.getByText(text, { exact: true }).filter({ visible: true }).first();
}
