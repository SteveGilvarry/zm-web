import { test, expect, gotoSkin, SKINS, seededOnly, type Skin } from './fixtures';
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

      await expect(page.getByRole('button', { name: 'PLAY' })).toBeVisible();
      await expect(page.getByText(/timeline/i).first()).toBeVisible();
      for (const name of ['e2e-Front Door', 'e2e-Driveway', 'e2e-Garage', 'e2e-PTZ Dome']) {
        await expect(page.getByText(name).first()).toBeVisible();
      }
    });

    test(`${skin}: widening the range asks the backend for a bigger window @route:montagereview`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/montagereview', skin);

      const pending = page.waitForResponse(
        (r) => /\/api\/v3\/events(\?|$)/.test(r.url()) && r.request().method() === 'GET',
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
      await expect(page.getByText('e2e-Driveway').first()).toBeVisible();
    });
  }
});
