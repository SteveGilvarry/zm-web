import { test, expect, gotoSkin, SKINS, seededOnly } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Timeline (`/timeline`, legacy `?view=timeline`) in both skins. The seeded
 * events sit relative to NOW(), so the default window draws them: the chart,
 * at least one event bar, and the key of monitor colours.
 */
test.describe('Timeline', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: draws the seeded events and the monitor key @route:timeline`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/timeline', skin);

      const chart = page.getByTestId('timeline-chart');
      await expect(chart).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[data-testid^="timeline-event-"]').first()).toBeVisible();
      await expect(page.getByTestId('timeline-range')).not.toBeEmpty();
      // The key names the cameras the bars belong to.
      const key = skin === 'classic' ? page.locator('#key') : chart;
      await expect(key).toContainText(SEED.monitors.names[SEED.monitors.frontDoor]);
    });
  }
});
