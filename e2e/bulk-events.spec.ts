import type { Page } from '@playwright/test';
import {
  test,
  expect,
  eventLink,
  gotoSkin,
  SKINS,
  seededOnly,
  scratchEvents,
  apiFetch,
  type Skin,
} from './fixtures';

/**
 * Bulk actions on the events list, in both skins. The earlier version of this
 * spec selected "the first two rows" on whatever backend it found, which made
 * it race the other projects and skip silently when the data was thin. It now
 * takes a reserved, disjoint pair of seeded events per (project, skin), acts
 * on exactly those, and unarchives them again.
 */

/** Select one event by id, whatever the row layout is. */
/**
 * Both skins now list events as a table with a real per-row checkbox — the
 * modern skin's default view stopped being hover-revealing cards.
 */
async function selectEvent(page: Page, _skin: Skin, id: number) {
  await page.getByRole('checkbox', { name: `Select event ${id}` }).check();
}

test.describe('Bulk events', () => {
  test.skip(seededOnly.condition, seededOnly.reason);

  for (const skin of SKINS) {
    test(`${skin}: selecting rows and archiving them PATCHes each one @route:events.list`, async ({
      loggedInPage: page,
    }, testInfo) => {
      const ids = scratchEvents(testInfo.project.name, skin, 2);

      await gotoSkin(page, '/events', skin);
      // Drop the default one-hour window, then widen the page so both
      // reserved rows are on screen whatever their position in the 32.
      await page.getByTestId('default-hour-hint').getByRole('button', { name: /clear/i }).click();
      await page.getByLabel(/(rows )?per page/i).first().selectOption('50');
      for (const id of ids) {
        await expect(eventLink(page, id).first()).toBeVisible({
          timeout: 15_000,
        });
      }

      const patched = new Set<number>();
      page.on('response', (resp) => {
        const m = resp.url().match(/\/api\/v3\/events\/(\d+)$/);
        if (m && resp.request().method() === 'PATCH' && resp.ok()) patched.add(Number(m[1]));
      });

      try {
        for (const id of ids) await selectEvent(page, skin, id);

        const archive = page
          .getByRole('region', { name: 'Bulk event actions' })
          .getByRole('button', { name: /^archive$/i });
        // Modern reports the selection before anything destructive happens.
        // Classic reproduces legacy's #rightButtons, which carry no count:
        // the buttons just enable once rows are ticked (events.php:134-140).
        if (skin === 'modern') {
          await expect(page.getByText(`${ids.length} selected`).first()).toBeVisible();
        }
        await expect(archive).toBeEnabled();
        await archive.click();

        // Every selected row produced its own PATCH…
        await expect(() => expect([...patched].sort()).toEqual([...ids].sort())).toPass({
          timeout: 30_000,
        });

        // …and the backend agrees, not just the cache.
        for (const id of ids) {
          const after = await apiFetch(page, `/api/v3/events/${id}`);
          expect((after.body as { archived: number }).archived, `event ${id}`).toBe(1);
        }
      } finally {
        for (const id of ids) {
          await apiFetch(page, `/api/v3/events/${id}`, {
            method: 'PATCH',
            body: { archived: false },
          });
        }
      }
    });
  }
});
