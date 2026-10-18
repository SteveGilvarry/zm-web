import { test, expect, gotoSkin, SKINS, seededOnly } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Zones (`/monitors/$id/zones`) in both skins. The seed gives every monitor
 * one full-frame Active zone in **pixel** coordinates with the legacy default
 * thresholds, which is what makes the coordinate assertion here worth having:
 * a past bug rewrote pixel coords as percentages and saved them.
 *
 * This route is also the one the flat-file router used to swallow — the URL
 * rendered the Watch page instead of the editor — so "the editor is what
 * loads" is a regression test, not a formality.
 */
const MON = SEED.monitors.frontDoor;

test.describe('Zones', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: lists the monitor's zones over its frame @route:monitors.zones`, async ({
      loggedInPage: page,
    }) => {
      const zones = page.waitForResponse(
        (r) => r.url().includes(`/api/v3/monitors/${MON}/zones`) && r.request().method() === 'GET',
      );
      await gotoSkin(page, `/monitors/${MON}/zones`, skin);
      const body = (await (await zones).json()) as { items: Array<{ name: string; units: string }> };
      expect(body.items).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ name: 'e2e-All', units: 'Pixels' });

      // The zone shows up in the list, labelled with its type. (Classic also
      // paints the name into an SVG <title> on the frame, which is hidden —
      // hence the role, not a bare text match.)
      await expect(
        page
          .getByRole('button', { name: /^e2e-All/ })
          .or(page.getByRole('cell', { name: 'e2e-All', exact: true }))
          .first(),
      ).toBeVisible();
      await expect(page.getByText(/active/i).first()).toBeVisible();
      // Breadcrumb back to the camera it belongs to.
      await expect(page.locator(`a[href="/monitors/${MON}"]`).first()).toBeVisible();
    });

    test(`${skin}: opening a zone keeps its pixel coordinates and saves them unchanged @route:monitors.zones`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/monitors/${MON}/zones`, skin);

      // Both skins list the zones in a table whose name cell opens the editor.
      await page
        .getByRole('table', { name: 'Zones' })
        .getByRole('button', { name: 'e2e-All', exact: true })
        .click();

      // The seeded polygon is full-frame in pixels; the point table must hold
      // those integers, not a percentage rewrite of them (the shape that once
      // corrupted four zones on the dev box).
      const seeded = [[0, 0], [1919, 0], [1919, 1079], [0, 1079]];
      for (const [i, [x, y]] of seeded.entries()) {
        await expect(page.getByLabel(`Point ${i + 1} X`, { exact: true })).toHaveValue(String(x), {
          timeout: 10_000,
        });
        await expect(page.getByLabel(`Point ${i + 1} Y`, { exact: true })).toHaveValue(String(y));
      }

      // Saving sends the same integer pixels back. Units goes out as Percent,
      // the hidden input legacy posts (zone.php:278); ZoneMinder reads the
      // coordinates as pixels regardless. The PUT is answered here so the
      // seed row keeps its stored Units for the other specs.
      let sent: { coords?: string; units?: string } | null = null;
      await page.route(`**/api/v3/zones/9001`, async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback();
        sent = route.request().postDataJSON();
        await route.fulfill({ json: { id: 9001, monitor_id: MON, name: 'e2e-All', ...sent } });
      });
      await page.getByRole('button', { name: /^save$/i }).first().click();
      await expect.poll(() => sent, { timeout: 10_000 }).not.toBeNull();
      expect(sent).toMatchObject({ coords: '0,0 1919,0 1919,1079 0,1079', units: 'Percent' });
    });
  }
});
