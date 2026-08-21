import type { Page } from '@playwright/test';
import { test, expect, gotoSkin, SKINS, seededOnly, type Skin } from './fixtures';
import { SEED } from './seed/seed-data';

/**
 * Log viewer (`/logs`) in both skins. The seed writes 200 rows covering every
 * ZoneMinder severity (PNC 10 / FAT 10 / ERR 20 / WAR 40 / INF 100 / DBG 20)
 * across five components, so the level and component filters have something
 * to find at each stop and paging has four pages at the default size.
 */

const UI = {
  modern: {
    // A segmented control, not a select.
    pickError: (p: Page) => p.getByRole('button', { name: /^error$/i }).click(),
    component: (p: Page) => p.getByLabel(/component/i).first(),
  },
  classic: {
    pickError: (p: Page) => p.getByLabel(/^level/i).selectOption({ label: 'Error' }),
    component: (p: Page) => p.getByLabel(/^component/i).first(),
  },
} satisfies Record<Skin, unknown>;

function logsRequest(p: Page, match: (q: URLSearchParams) => boolean = () => true) {
  return p.waitForResponse(
    (r) =>
      /\/api\/v3\/logs(\?|$)/.test(r.url()) &&
      r.request().method() === 'GET' &&
      match(new URL(r.url()).searchParams),
    { timeout: 15_000 },
  );
}

test.describe('Logs', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: shows the seeded rows and the severity summary @route:logs`, async ({
      loggedInPage: page,
    }) => {
      const listed = logsRequest(page);
      await gotoSkin(page, '/logs', skin);
      const body = (await (await listed).json()) as { total: number };
      expect(body.total).toBe(SEED.logs.count);

      await expect(page.getByText(String(SEED.logs.count)).first()).toBeVisible();
      await expect(page.locator('tbody tr').first()).toBeVisible();
      await expect(page.getByRole('button', { name: /download csv/i })).toBeVisible();
    });

    test(`${skin}: the level filter asks for that severity @route:logs`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/logs', skin);

      const pending = logsRequest(page, (q) => q.get('level') === '-2');
      await UI[skin].pickError(page);
      const resp = await pending;

      // ZoneMinder's scale runs the other way: level >= -2 covers ERR and worse.
      expect(new URL(resp.url()).searchParams.get('level')).toBe('-2');
      const rows = page.locator('tbody tr');
      await expect(rows.first()).toBeVisible();
      // Nothing softer than an error survives the filter.
      await expect(page.locator('tbody')).not.toContainText('INF');
    });

    test(`${skin}: the component filter narrows to one daemon @route:logs`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/logs', skin);

      const pending = logsRequest(page, (q) => q.get('component') === 'zmdc');
      await UI[skin].component(page).selectOption('zmdc');
      const resp = await pending;

      expect((await resp.json()).total).toBeGreaterThan(0);
      await expect(page.locator('tbody').first()).toContainText('zmdc');
    });

    test(`${skin}: paging walks past the first page of rows @route:logs`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/logs', skin);
      await expect(page.locator('tbody tr').first()).toBeVisible();

      const paged = logsRequest(page, (q) => q.get('page') === '2');
      await page.getByRole('button', { name: /^next page$/i }).first().click();
      expect(new URL((await paged).url()).searchParams.get('page')).toBe('2');
      await expect(page.locator('tbody tr').first()).toBeVisible();
    });
  }
});
