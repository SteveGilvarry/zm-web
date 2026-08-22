import type { Page } from '@playwright/test';
import { test, expect, gotoSkin, SKINS, seededOnly } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * The 390 px project (see the `mobile` project in playwright.config.ts, which
 * is the only one that runs this file). A phone-sized subset of the routes an
 * operator actually opens on a phone: the console, the events list, one
 * camera and settings.
 *
 * Two things are checked everywhere. Nothing may scroll the page sideways —
 * the classic dense tables and the modern stat rows have both done it — and
 * the navigation has to be reachable, which below `lg` means the off-canvas
 * drawer in the modern shell.
 */
const PAGES: Array<{ key: string; path: string; tag: string }> = [
  { key: 'console', path: '/', tag: '@route:console' },
  { key: 'events', path: '/events', tag: '@route:events.list' },
  { key: 'watch', path: `/monitors/${SEED.monitors.frontDoor}`, tag: '@route:monitors.watch' },
  { key: 'settings', path: '/settings', tag: '@route:settings.options' },
];

/**
 * True when the document is wider than the viewport. Measured on
 * `documentElement`, so an inner container with its own `overflow-x: auto`
 * (the intended pattern for a wide table) does not count.
 */
async function overflowsSideways(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
}

test.describe('Mobile (390 px)', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    for (const { key, path, tag } of PAGES) {
      test(`${skin}: ${key} fits the viewport ${tag}`, async ({ loggedInPage: page }) => {
        await gotoSkin(page, path, skin);
        await page.waitForLoadState('networkidle').catch(() => {});

        const { scrollWidth, innerWidth } = await overflowsSideways(page);
        // 1 px of slop for sub-pixel layout rounding.
        expect(
          scrollWidth,
          `${skin}/${key} scrolls sideways at ${innerWidth}px — a wide child needs its own overflow-x container`,
        ).toBeLessThanOrEqual(innerWidth + 1);
      });
    }

    test(`${skin}: the primary navigation is reachable @route:console`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/', skin);

      if (skin === 'modern') {
        // Below `lg` the sidebar is an off-canvas drawer behind the header
        // button; the nav must not be sitting on screen already.
        const menu = page.getByRole('button', { name: /open menu/i });
        await expect(menu).toBeVisible();
        await expect(menu).toHaveAttribute('aria-expanded', 'false');

        await menu.click();
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        const drawerNav = page.getByRole('navigation', { name: 'Main' });
        await expect(drawerNav).toBeVisible();
        await expect(drawerNav.getByRole('link', { name: 'Events' })).toBeVisible();

        await page.getByRole('button', { name: /close menu/i }).click();
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
      } else {
        // Classic keeps the legacy top nav on screen at every width; it just
        // has to stay usable rather than run off the side.
        const nav = page.getByRole('navigation', { name: 'Main' });
        await expect(nav).toBeVisible();
        // The classic nav renders a second, hidden-at-desktop copy for
        // narrow widths, so there are two Events links in the tree.
        await expect(nav.getByRole('link', { name: 'Events' }).first()).toBeVisible();
      }
    });

    test(`${skin}: a wide table scrolls inside itself, not the page @route:events.list`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/events', skin);
      await page.getByTestId('default-hour-hint').getByRole('button', { name: /clear/i }).click();
      await expect(page.locator(`a[href="/events/${SEED.events.last}"]`).first()).toBeVisible({
        timeout: 15_000,
      });

      const { scrollWidth, innerWidth } = await overflowsSideways(page);
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
    });
  }
});
