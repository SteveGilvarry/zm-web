import type { Page } from '@playwright/test';
import { test, expect, gotoSkin, SKINS, seededOnly, type Skin } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Console — the landing page, in both skins. Modern is a status line over a
 * camera wall that fills the frame; classic is the legacy dense table with
 * the SCAN/ADD/CLONE toolbar. Both read the same `useConsoleData`, so the
 * counts they show are the assertion that matters.
 */
test.describe('Console', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  test('modern: status line, and the whole fleet on the wall @route:console', async ({
    loggedInPage: page,
  }) => {
    await gotoSkin(page, '/', 'modern');

    const status = page.getByRole('region', { name: 'Console status' });
    for (const label of [/cameras/i, /events \(24h\)/i, /recording/i, /alarms/i, /disk/i]) {
      await expect(status.getByText(label).first()).toBeVisible();
    }
    const wall = page.getByRole('region', { name: 'Cameras' });
    for (const id of SEED.monitors.all) {
      await expect(wall.locator(`a[href="/monitors/${id}"]`).first()).toBeVisible();
    }

    // Daemon detail is one click away rather than taking a third of the page.
    await expect(page.getByText('Daemons', { exact: true })).toHaveCount(0);
    await status.getByRole('button', { name: 'System detail' }).click();
    await expect(page.getByText('Daemons', { exact: true })).toBeVisible();
  });

  test('classic: the legacy table lists every monitor with its event counts @route:console', async ({
    loggedInPage: page,
  }) => {
    await gotoSkin(page, '/', 'classic');

    const table = page.getByTestId('console-classic-table');
    await expect(table).toBeVisible();
    await expect(table.locator('tbody tr')).toHaveCount(SEED.monitors.all.length);

    const row = page.getByTestId(`console-row-${SEED.monitors.frontDoor}`);
    await expect(row).toContainText('e2e-Front Door');
    // Event counts are links into a pre-filtered events list, as in legacy.
    await expect(
      row.locator(`a[href*="/events?monitor_id=${SEED.monitors.frontDoor}"]`).first(),
    ).toBeVisible();
    // …and the zone count links to the zone editor.
    await expect(row.locator(`a[href="/monitors/${SEED.monitors.frontDoor}/zones"]`)).toBeVisible();
    // Runtime status per row, plus the totals line the legacy footer shows.
    await expect(page.getByTestId(`console-runtime-${SEED.monitors.frontDoor}`)).toContainText('15');
    await expect(page.getByTestId('console-runtime-totals')).toBeVisible();
    // Legacy operator toolbar.
    for (const name of [/^add$/i, /^clone$/i, /^edit$/i, /^delete$/i]) {
      await expect(page.getByRole('button', { name })).toBeVisible();
    }
  });

  // Both skins filter by group; e2e-Front holds only the front door. Modern
  // uses a listbox popover, classic the legacy <select>.
  const pickFrontGroup = {
    modern: async (page: Page) => {
      // The chips live behind the status line's Filters disclosure.
      await page.getByRole('button', { name: /^Filters/ }).click();
      await page.getByRole('button', { name: 'Groups filter' }).click();
      // The popover is a listbox of checkboxes, one per group.
      await page.getByRole('checkbox', { name: 'e2e-Front', exact: true }).check();
      await page.keyboard.press('Escape');
    },
    classic: async (page: Page) => {
      await page.getByLabel(/^groupid/i).selectOption({ label: 'e2e-Front' });
    },
  } satisfies Record<Skin, (page: Page) => Promise<void>>;

  for (const skin of SKINS) {
    test(`${skin}: the monitor filter bar narrows the list @route:console`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/', skin);
      await expect(page.locator(`a[href="/monitors/${SEED.monitors.garage}"]`).first())
        .toBeVisible();

      await pickFrontGroup[skin](page);

      await expect(page.locator(`a[href="/monitors/${SEED.monitors.frontDoor}"]`).first())
        .toBeVisible();
      await expect(page.locator(`a[href="/monitors/${SEED.monitors.garage}"]`)).toHaveCount(0);
    });
  }
});
