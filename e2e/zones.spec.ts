import { test, expect, gotoSkin, SKINS, seededOnly } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Zones (`/monitors/$id/zones`) in both skins. The seed gives every monitor
 * one full-frame Active zone in **pixel** coordinates with the legacy default
 * thresholds, which is what makes the units assertion here worth having: a
 * past bug rewrote pixel coords as percentages and saved them.
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

    test(`${skin}: opening a zone keeps its pixel units @route:monitors.zones`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, `/monitors/${MON}/zones`, skin);

      // Modern's zone list *is* the editor's list. Classic keeps its legacy
      // table and swaps the frame for the editor, so the zone has to be
      // picked twice: once in the table, once in the editor that opens.
      if (skin === 'classic') {
        await page.getByRole('cell', { name: 'e2e-All', exact: true }).getByRole('button').click();
      }
      // The editor's own entries carry the zone type after the name.
      await page.getByRole('button', { name: /^e2e-All ACTIVE$/i }).click();

      const pixels = page.getByRole('button', { name: 'Pixels', exact: true });
      await expect(pixels).toBeVisible({ timeout: 10_000 });
      // A pixel-coordinate zone must not open pre-switched to Percent — that
      // is the shape that corrupted a zone on the dev box.
      await expect(pixels).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: 'Percent', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  }
});
