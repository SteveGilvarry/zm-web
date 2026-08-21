import { test, expect, gotoSkin, SKINS, seededOnly } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Audit Events Report (`/audit`) in both skins — per-monitor coverage over a
 * time window: event count, first/last event and the gaps between them. The
 * window is the whole page, so the specs assert that moving it re-asks the
 * backend and that every seeded camera gets a row either way.
 */
test.describe('Audit', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: one row per monitor with links into the events it covers @route:audit`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/audit', skin);

      const table = page.getByTestId('audit-table');
      await expect(table).toBeVisible();
      for (const id of SEED.monitors.all) {
        await expect(page.getByTestId(`audit-row-${id}`)).toBeVisible();
      }
      await expect(page.getByTestId('audit-totals')).toBeVisible();

      // Each row links its count into a pre-scoped events list and its name
      // into Montage Review over the same window.
      const row = page.getByTestId(`audit-row-${SEED.monitors.frontDoor}`);
      await expect(row.locator(`a[href*="/events?monitor_id=${SEED.monitors.frontDoor}"]`).first())
        .toBeVisible();
      await expect(
        row.locator(`a[href*="/montagereview?monitor_id=${SEED.monitors.frontDoor}"]`).first(),
      ).toBeVisible();
    });

    test(`${skin}: widening the window re-runs the report @route:audit`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/audit', skin);
      await expect(page.getByTestId('audit-table')).toBeVisible();

      // A window that covers the whole seeded set (~46 h of events).
      const start = new Date(Date.now() - 7 * 24 * 3600_000).toISOString().slice(0, 16);
      const pending = page.waitForResponse(
        (r) => /\/api\/v3\/events(\?|$)/.test(r.url()) && r.request().method() === 'GET',
        { timeout: 20_000 },
      );
      await page.getByLabel(/window start/i).fill(start);
      await pending;

      // Every camera now has events inside the window, so no row reads zero.
      await expect(page.getByTestId(`audit-row-${SEED.monitors.garage}`)).not.toContainText(
        /\bno events\b/i,
      );
    });
  }
});
