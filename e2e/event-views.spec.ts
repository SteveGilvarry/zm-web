import { test, expect, gotoSkin, SKINS, seededOnly } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * The two per-frame views off an event, in both skins: legacy
 * `?view=stats&eid=&fid=` (`/events/$id/stats`) and `?view=frame&eid=&fid=`
 * (`/events/$id/frames/$fid`). The seed has frames but no frame JPEGs on
 * disk, so the frame spec asserts the image request goes out, not that it
 * decodes.
 */
const EVENT = SEED.events.withFrames[0]; // 9002 — 10 frames

test.describe('Event stats and frame views', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: the stats page shows the stats table @route:events.stats`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/events/${EVENT}/stats?fid=1`, skin);

      const table = page.getByTestId('stats-table');
      await expect(table).toBeVisible({ timeout: 15_000 });
      // stats.php's columns, Zone first and Score last.
      await expect(table.getByRole('columnheader', { name: 'Zone', exact: true })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Pixel Diff', exact: true })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Score', exact: true })).toBeVisible();
    });

    test(`${skin}: the frame viewer shows the frame and walks First/Prev/Next/Last @route:events.frame`, async ({
      loggedInPage: page,
    }) => {
      const image = page.waitForRequest((r) => /\/api\/v3\/frames\/\d+\/image/.test(r.url()), {
        timeout: 15_000,
      });
      await gotoSkin(page, `/events/${EVENT}/frames/1`, skin);
      await image;

      // The frame box holds the image, or legacy's text once it fails to load.
      await expect(
        page.getByTestId('frame-image').or(page.getByText('No stored image for this frame.')),
      ).toBeVisible();

      // Modern draws the four as buttons; classic as links, greyed with no
      // href where they lead nowhere (frame.php #controls).
      const nav = (name: string) =>
        skin === 'modern'
          ? page.getByRole('button', { name, exact: true })
          : page.locator('#controls').getByText(name, { exact: true });
      for (const name of ['First', 'Prev', 'Next', 'Last']) await expect(nav(name)).toBeVisible();

      // Frame 1 cannot go back, only forward.
      if (skin === 'modern') {
        await expect(nav('First')).toBeDisabled();
        await expect(nav('Next')).toBeEnabled();
      } else {
        await expect(nav('First')).toHaveAttribute('aria-disabled', 'true');
      }
      await nav('Next').click();
      await expect(page).toHaveURL(new RegExp(`/events/${EVENT}/frames/2(\\?|$)`));
    });
  }
});
