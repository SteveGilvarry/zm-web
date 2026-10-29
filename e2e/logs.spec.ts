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
    // A segmented threshold control: "error" means that severity or worse,
    // which the backend spells `min_level` by name.
    pickError: (p: Page) =>
      p.getByRole('group', { name: /minimum level/i }).getByRole('button', { name: /^error$/i }).click(),
    errorRequest: (q: URLSearchParams) => q.get('min_level') === 'error',
    pickComponent: (p: Page, value: string) => p.getByLabel('Component filter').first().selectOption(value),
  },
  classic: {
    // Legacy's exact-level chosen multi-select: ERR, FAT and PNC picked by
    // hand, one at a time, sent as zm-api's `level` list on the inverted scale.
    pickError: async (p: Page) => {
      for (const code of ['ERR', 'FAT', 'PNC']) {
        await p.getByRole('combobox', { name: 'Level', exact: true }).click();
        await p.getByRole('option', { name: code, exact: true }).click();
      }
    },
    errorRequest: (q: URLSearchParams) => q.get('level') === '-2,-3,-4',
    // Component is a Chosen multi-select too (ajax/log.php:183).
    pickComponent: async (p: Page, value: string) => {
      await p.getByRole('combobox', { name: 'Component', exact: true }).click();
      await p.getByRole('option', { name: value, exact: true }).click();
    },
  },
} satisfies Record<Skin, unknown>;

function logsRequest(p: Page, match: (q: URLSearchParams) => boolean = () => true) {
  return p.waitForResponse(
    (r) => {
      if (!/\/api\/v3\/logs(\?|$)/.test(r.url())) return false;
      if (r.request().method() !== 'GET') return false;
      const q = new URL(r.url()).searchParams;
      // The shell's severity indicator polls `/logs` four times with
      // `page_size=1` (one count per level, see `useLogState`). Those land
      // before the table's own read and would otherwise be what a waiter
      // catches; the table never asks for a single row.
      if (q.get('page_size') === '1') return false;
      return match(q);
    },
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

      // Scoped: the bare number also appears as a per-page <option>, which
      // is in the DOM but not visible.
      await expect(page.getByText(new RegExp(`Total:\\s*${SEED.logs.count}`)).first())
        .toBeVisible();
      await expect(page.locator('tbody tr').first()).toBeVisible();
      await expect(page.getByRole('button', { name: /download csv/i })).toBeVisible();
    });

    test(`${skin}: the level filter asks for errors and worse @route:logs`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/logs', skin);
      await expect(page.locator('tbody tr').first()).toBeVisible();

      const pending = logsRequest(page, UI[skin].errorRequest);
      await UI[skin].pickError(page);
      const resp = await pending;

      // The seed writes 20 ERR + 10 FAT + 10 PNC rows.
      expect((await resp.json()).total).toBe(
        SEED.logs.byCode.ERR + SEED.logs.byCode.FAT + SEED.logs.byCode.PNC,
      );
      await expect(page.locator('tbody tr').first()).toBeVisible();
      // Nothing softer than an error survives the filter.
      await expect(page.locator('tbody')).not.toContainText('INF');
    });

    test(`${skin}: the component filter narrows to one daemon @route:logs`, async ({
      loggedInPage: page,
    }) => {
      await gotoSkin(page, '/logs', skin);

      const pending = logsRequest(page, (q) => q.get('component') === 'zmdc');
      await UI[skin].pickComponent(page, 'zmdc');
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
